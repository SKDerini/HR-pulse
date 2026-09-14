import test from 'node:test';
import assert from 'node:assert/strict';
import { createHrApi } from '../src/api.js';
import XLSX from 'xlsx-js-style';
import { parseSkudWorkbook } from '../src/services/timesheet-xlsx.js';
import { analyzeEmployeeWorkbook, parseEmployeeWorkbook } from '../src/services/employee-import.js';

class MemoryDatabase {
  constructor() { this.mode = 'preview'; this.label = 'test'; this.records = new Map(); this.meta = new Map(); }
  key(entity, id) { return `${entity}:${id}`; }
  async list(entity, filters = {}) {
    return [...this.records.values()].filter(row => row.entity === entity).filter(row => Object.entries(filters).every(([key, value]) => String(row[key] ?? row.payload[key] ?? '') === String(value))).map(row => structuredClone(row.payload));
  }
  async get(entity, id) { return structuredClone(this.records.get(this.key(entity, id))?.payload || null); }
  async put(entity, recordId, payload, indexes = {}) { this.records.set(this.key(entity, recordId), { entity, recordId, payload: structuredClone(payload), ...indexes }); return payload; }
  async bulkPut(entity, records) { for (const row of records) await this.put(entity, row.recordId, row.payload, row.indexes); return records.map(row => row.payload); }
  async remove(entity, id) { this.records.delete(this.key(entity, id)); }
  async getMeta(key) { return structuredClone(this.meta.get(key) ?? null); }
  async setMeta(key, value) { this.meta.set(key, structuredClone(value)); }
  async currentUser() { return (await this.getMeta('previewActor')) || { email: 'hrd@example.test' }; }
  async setPreviewActor(email) { await this.setMeta('previewActor', { email }); }
}

async function app() {
  const db = new MemoryDatabase();
  return { db, api: createHrApi(db) };
}

test('предпросмотр загружается с тремя активными модулями', async () => {
  const { api } = await app();
  const bootstrap = await api.handle('bootstrap');
  assert.equal(bootstrap.app.version, '2.2.0');
  assert.deepEqual(bootstrap.permissions.activeModules, ['hr', 'offers', 'timesheet']);
  assert.deepEqual(bootstrap.permissions.modules, ['hr', 'offers', 'timesheet']);
  assert.equal(bootstrap.actor.role, 'HRD');
});

test('мотивация оффера хранит неизменяемую историю версий', async () => {
  const { api } = await app();
  await api.handle('bootstrap');
  const registry = await api.handle('offers.get');
  const offer = registry.offers[0];
  assert.equal(offer.versionCount, 2);
  const previous = structuredClone(offer.currentVersion);
  const created = await api.handle('offers.motivation.save', {
    offerId: offer.offerId,
    title: 'Новые условия',
    baseSalary: '70000',
    effectiveFrom: '2026-10-01',
    changeReason: 'Пересмотр условий',
    items: [{ section: 'KPI', metric: 'План', condition: '100%', reward: '20 000 ₽', period: 'Квартал' }]
  });
  assert.equal(created.versionNumber, 3);
  const history = await api.handle('offers.history', { offerId: offer.offerId });
  assert.equal(history.versions.length, 3);
  assert.equal(history.versions[0].current, true);
  assert.deepEqual(history.versions.find(item => item.versionId === previous.versionId).items, previous.items);
});

test('реестр офферов закрыт для табельщика', async () => {
  const { api } = await app();
  await api.handle('bootstrap');
  await api.changePreviewActor('timesheet@example.test');
  await assert.rejects(() => api.handle('offers.get'), /только HR и HRD/);
});

test('табель формируется, массово редактируется и выгружается в xlsx', async () => {
  const { api } = await app();
  await api.handle('bootstrap');
  const prepared = await api.handle('timesheet.prepare', { period: '2026-09', department: 'Отдел продаж поликарбоната' });
  assert.ok(prepared.created > 0);
  let sheet = await api.handle('timesheet.get', { period: '2026-09', department: 'Отдел продаж поликарбоната' });
  const employee = sheet.rows.find(row => row.cells.some(item => item.editable));
  const cell = employee.cells.find(item => item.editable);
  const saved = await api.handle('timesheet.saveBatch', { period: '2026-09', entries: [{ employeeId: employee.employeeId, date: cell.date, code: 'ДО' }] });
  assert.equal(saved.saved, 1);
  sheet = await api.handle('timesheet.get', { period: '2026-09', department: 'Отдел продаж поликарбоната' });
  assert.equal(sheet.rows.find(item => item.employeeId === employee.employeeId).cells.find(item => item.date === cell.date).code, 'ДО');
  const exported = await api.handle('timesheet.export', { period: '2026-09', department: 'Отдел продаж поликарбоната' });
  assert.match(exported.fileName, /\.xlsx$/);
  assert.ok(exported.base64.length > 1000);
});

test('табельщик видит только назначенное подразделение', async () => {
  const { api } = await app();
  await api.handle('bootstrap');
  await api.changePreviewActor('timesheet@example.test');
  const bootstrap = await api.handle('bootstrap');
  assert.deepEqual(bootstrap.permissions.modules, ['hr', 'timesheet']);
  const sheet = await api.handle('timesheet.get', { period: '2026-09' });
  assert.ok(sheet.rows.every(row => row.department === 'Отдел продаж поликарбоната'));
  assert.equal(sheet.access.canImport, false);
});

test('исключение сотрудника полностью оформляется внутри табеля', async () => {
  const { api } = await app();
  await api.handle('bootstrap');
  await api.handle('timesheet.exclusion.request', { employeeId: 'ST-0003', reason: 'Не ведется учет рабочего времени' });
  let sheet = await api.handle('timesheet.get', { period: '2026-09' });
  assert.equal(sheet.exclusionRequests.find(item => item.employeeId === 'ST-0003').status, 'Требует подтверждения');
  await api.handle('timesheet.exclusion', { employeeId: 'ST-0003', decision: 'Подтвердить' });
  sheet = await api.handle('timesheet.get', { period: '2026-09' });
  assert.equal(sheet.rows.some(item => item.employeeId === 'ST-0003'), false);
  assert.equal(sheet.excludedEmployees.some(item => item.employeeId === 'ST-0003'), true);
});

test('руководитель видит только дерево подчиненных', async () => {
  const { api } = await app();
  await api.handle('bootstrap');
  await api.changePreviewActor('manager@example.test');
  const list = await api.handle('employees.list');
  assert.deepEqual(list.employees.map(item => item.employeeId).sort(), ['ST-0002', 'ST-0099']);
});

test('импорт СКУД понимает заголовки вида «1 + день недели» и исключает строку итогов', () => {
  const matrix = [
    [],
    ['ФИО', 'Табельный номер', 'Должность', '1\nср', '2\nчт', '3\nпт', '4\nсб', '5\nвс'],
    ['Иванов Иван Иванович', '', '', 1, 0, 2, 0, 1],
    ['Итого:', '', '', 1, 0, 2, 0, 1]
  ];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(matrix), 'Статистика входов');
  const base64 = XLSX.write(workbook, { type: 'base64', bookType: 'xlsx' });
  const parsed = parseSkudWorkbook(base64, '2026-07');
  assert.equal(parsed.profile, 'Матрица количества входов');
  assert.equal(parsed.sourceRows, 1);
  assert.deepEqual(parsed.rows.map(row => row.date), ['2026-07-01', '2026-07-03', '2026-07-05']);
  assert.ok(parsed.rows.every(row => row.fullName === 'Иванов Иван Иванович'));
});

test('импорт сотрудников распознает колонки, показывает изменения и пишет журнал', async () => {
  const matrix = [
    ['Кадровый реестр'],
    ['Employee ID', 'ФИО', 'Подразделение', 'Должность', 'Дата приема', 'Дата выхода', 'Дата увольнения', 'Статус', 'Табельный номер', 'Руководитель'],
    ['ST-0002', 'Примеров Алексей Петрович', 'Отдел продаж поликарбоната', 'Старший менеджер', '01.08.2026', '05.08.2026', '', 'Работает', '0002', 'Примерова Анна Игоревна'],
    ['ST-0003', 'Учебная Елена Олеговна', 'Финансовый отдел', 'Главный бухгалтер', '10.03.2021', '15.03.2021', '30.09.2026', 'Уволен', '0003', 'Демонстрационная Наталья Сергеевна'],
    ['EXT-100', 'Новый Петр Иванович', 'Склад', 'Кладовщик', '10.09.2026', '12.09.2026', '', 'Работает', '0101', 'Демонстрационная Наталья Сергеевна']
  ];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(matrix), 'Сотрудники');
  const base64 = XLSX.write(workbook, { type: 'base64', bookType: 'xlsx' });
  const analysis = analyzeEmployeeWorkbook(base64);
  assert.equal(analysis.sheetName, 'Сотрудники');
  assert.equal(analysis.headerRow, 2);
  assert.equal(analysis.suggestedMapping.fullName, 'c1');
  const parsed = parseEmployeeWorkbook(base64, { mapping: analysis.suggestedMapping });
  assert.equal(parsed.rows[1].record.dismissalDate, '2026-09-30');

  const { api, db } = await app();
  await api.handle('bootstrap');
  const preview = await api.handle('employees.import.preview', { fileName: 'Кадровый реестр.xlsx', base64, sheetName: analysis.sheetName, mapping: analysis.suggestedMapping });
  assert.equal(preview.counts.create, 1);
  assert.equal(preview.counts.dismiss, 1);
  assert.equal(preview.counts.update, 1);
  const result = await api.handle('employees.import.commit', { fileName: preview.fileName, sheetName: preview.sheetName, mapping: preview.mapping, items: preview.items });
  assert.equal(result.created, 1);
  assert.equal(result.dismissed, 1);
  assert.equal((await db.get('employees', 'ST-0003')).status, 'Уволен');
  assert.equal((await db.get('employees', 'EXT-100')).department, 'Склад');
  assert.equal((await db.list('employee_imports')).length, 1);
  assert.equal((await db.list('employee_import_rows')).length, 3);
  assert.ok((await db.list('directory_items')).some(item => item.type === 'Подразделение' && item.value === 'Склад'));
});

test('импорт сотрудников блокирует неоднозначное ФИО без идентификатора', async () => {
  const matrix = [
    ['ФИО', 'Подразделение', 'Должность'],
    ['Одинаков Иван Иванович', 'Склад', 'Кладовщик'],
    ['Одинаков Иван Иванович', 'Склад', 'Старший кладовщик']
  ];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(matrix), 'Лист1');
  const base64 = XLSX.write(workbook, { type: 'base64', bookType: 'xlsx' });
  const { api } = await app();
  await api.handle('bootstrap');
  const preview = await api.handle('employees.import.preview', { fileName: 'Дубли.xlsx', base64 });
  assert.equal(preview.counts.conflict, 2);
  await assert.rejects(() => api.handle('employees.import.commit', { fileName: preview.fileName, items: preview.items }), /Не выбрана ни одна строка/);
});
