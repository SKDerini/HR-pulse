import XLSX from 'xlsx-js-style';

const clean = value => String(value ?? '').trim();
const normalizeHeader = value => clean(value)
  .toLocaleLowerCase('ru-RU')
  .replace(/ё/g, 'е')
  .replace(/[^a-zа-я0-9]+/gi, ' ')
  .replace(/\s+/g, ' ')
  .trim();

export const EMPLOYEE_IMPORT_FIELDS = [
  { key: 'employeeId', label: 'Employee ID', aliases: ['employee id', 'employeeid', 'id сотрудника', 'код сотрудника', 'ид сотрудника'] },
  { key: 'timesheetNumber', label: 'Табельный номер', aliases: ['табельный номер', 'таб номер', 'табельный', 'номер сотрудника'] },
  { key: 'fullName', label: 'ФИО', aliases: ['фио', 'ф и о', 'сотрудник', 'полное имя', 'full name', 'fullname'] },
  { key: 'surname', label: 'Фамилия', aliases: ['фамилия', 'surname', 'last name'] },
  { key: 'name', label: 'Имя', aliases: ['имя', 'name', 'first name'] },
  { key: 'patronymic', label: 'Отчество', aliases: ['отчество', 'patronymic', 'middle name'] },
  { key: 'department', label: 'Подразделение', aliases: ['подразделение', 'отдел', 'департамент', 'структурное подразделение', 'department'] },
  { key: 'position', label: 'Должность', aliases: ['должность', 'позиция', 'position', 'job title'] },
  { key: 'location', label: 'Локация', aliases: ['локация', 'город', 'место работы', 'офис', 'location'] },
  { key: 'hireDate', label: 'Дата приема', aliases: ['дата приема', 'дата приёма', 'дата найма', 'принят', 'hire date'] },
  { key: 'plannedStartDate', label: 'Плановая дата выхода', aliases: ['плановая дата выхода', 'план выхода', 'планируемая дата выхода'] },
  { key: 'startDate', label: 'Дата фактического выхода', aliases: ['дата фактического выхода', 'дата выхода', 'первый рабочий день', 'дата начала работы', 'start date'] },
  { key: 'dismissalDate', label: 'Дата увольнения', aliases: ['дата увольнения', 'уволен', 'дата прекращения', 'дата расторжения', 'termination date', 'dismissal date'] },
  { key: 'status', label: 'Статус сотрудника', aliases: ['статус сотрудника', 'статус', 'состояние', 'employee status'] },
  { key: 'dismissalReason', label: 'Причина увольнения', aliases: ['причина увольнения', 'основание увольнения'] },
  { key: 'managerName', label: 'ФИО руководителя', aliases: ['фио руководителя', 'руководитель', 'начальник', 'manager'] },
  { key: 'email', label: 'Email', aliases: ['email', 'e mail', 'электронная почта', 'почта'] },
  { key: 'phone', label: 'Телефон', aliases: ['телефон', 'мобильный телефон', 'phone'] },
  { key: 'employmentType', label: 'Тип занятости', aliases: ['тип занятости', 'вид занятости', 'employment type'] },
  { key: 'workFormat', label: 'Формат работы', aliases: ['формат работы', 'режим работы', 'work format'] },
  { key: 'fte', label: 'FTE / ставка', aliases: ['fte', 'ставка', 'количество ставок', 'доля ставки'] },
  { key: 'timesheetIncluded', label: 'Учитывать в табеле', aliases: ['учитывать в табеле', 'табель', 'включать в табель'] }
];

const FIELD_BY_KEY = new Map(EMPLOYEE_IMPORT_FIELDS.map(field => [field.key, field]));
const DATE_FIELDS = new Set(['hireDate', 'plannedStartDate', 'startDate', 'dismissalDate']);

function rawBase64(value) {
  const source = clean(value);
  return source.includes(',') ? source.slice(source.indexOf(',') + 1) : source;
}

function matrixForSheet(workbook, sheetName) {
  return XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: '', raw: true, blankrows: false });
}

function headerMatchScore(row) {
  const normalized = row.map(normalizeHeader);
  const matches = EMPLOYEE_IMPORT_FIELDS.filter(field => field.aliases.some(alias => normalized.includes(normalizeHeader(alias))));
  const hasName = matches.some(field => ['fullName', 'surname', 'name'].includes(field.key));
  return matches.length + (hasName ? 4 : 0);
}

function locateTable(workbook, requestedSheet = '') {
  const names = requestedSheet && workbook.Sheets[requestedSheet] ? [requestedSheet] : workbook.SheetNames;
  let best = null;
  names.forEach(sheetName => {
    const matrix = matrixForSheet(workbook, sheetName);
    matrix.slice(0, 40).forEach((row, index) => {
      const score = headerMatchScore(row);
      if (!best || score > best.score) best = { sheetName, matrix, headerRow: index, score };
    });
  });
  if (!best || best.score < 5) throw new Error('Не удалось найти строку заголовков с ФИО или Фамилией/Именем. Проверьте структуру файла.');
  return best;
}

function uniqueColumnLabels(row) {
  const used = new Map();
  return row.map((value, index) => {
    const base = clean(value) || `Колонка ${index + 1}`;
    const count = (used.get(base) || 0) + 1;
    used.set(base, count);
    return count === 1 ? base : `${base} (${count})`;
  });
}

function suggestMapping(headers) {
  const mapping = {};
  EMPLOYEE_IMPORT_FIELDS.forEach(field => {
    let bestIndex = -1;
    let bestScore = 0;
    headers.forEach((header, index) => {
      const normalized = normalizeHeader(header);
      field.aliases.forEach(alias => {
        const target = normalizeHeader(alias);
        const score = normalized === target ? 100 : (normalized.includes(target) || target.includes(normalized) ? Math.min(normalized.length, target.length) : 0);
        if (score > bestScore) { bestScore = score; bestIndex = index; }
      });
    });
    if (bestIndex >= 0) mapping[field.key] = `c${bestIndex}`;
  });
  return mapping;
}

function isoDate(value) {
  if (value === '' || value === null || value === undefined) return { value: '', error: '' };
  if (value instanceof Date && !Number.isNaN(value.getTime())) return { value: value.toISOString().slice(0, 10), error: '' };
  if (typeof value === 'number' && Number.isFinite(value)) {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) return { value: `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`, error: '' };
  }
  const text = clean(value);
  let match = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (match) return validDate(Number(match[1]), Number(match[2]), Number(match[3]), text);
  match = text.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
  if (match) return validDate(Number(match[3]), Number(match[2]), Number(match[1]), text);
  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) return { value: parsed.toISOString().slice(0, 10), error: '' };
  return { value: '', error: `Некорректная дата: ${text}` };
}

function validDate(year, month, day, original) {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return { value: '', error: `Некорректная дата: ${original}` };
  return { value: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`, error: '' };
}

function splitFullName(value) {
  const parts = clean(value).replace(/\s+/g, ' ').split(' ').filter(Boolean);
  return { surname: parts[0] || '', name: parts[1] || '', patronymic: parts.slice(2).join(' ') };
}

function statusValue(value, dismissalDate) {
  const normalized = normalizeHeader(value);
  if (dismissalDate || /уволен|уволена|не работает|расторгнут/.test(normalized)) return 'Уволен';
  if (/декрет|отпуск по уходу/.test(normalized)) return 'Декрет';
  if (/^(работает|действующий|действующая|активен|активна|принят|принята|трудоустроен|трудоустроена|active)$/.test(normalized)) return 'Работает';
  return normalized ? clean(value) : '';
}

function booleanValue(value) {
  const normalized = normalizeHeader(value);
  if (!normalized) return '';
  if (/^(нет|0|false|не учитывать|исключен|исключить)$/.test(normalized)) return false;
  if (/^(да|1|true|учитывать|включен|включить)$/.test(normalized)) return true;
  return '';
}

function numberValue(value) {
  if (value === '' || value === null || value === undefined) return '';
  const parsed = Number(String(value).replace(',', '.').replace(/\s/g, ''));
  return Number.isFinite(parsed) ? parsed : '';
}

function parseWorkbook(base64, requestedSheet = '') {
  if (!clean(base64)) throw new Error('Файл не передан.');
  let workbook;
  try { workbook = XLSX.read(rawBase64(base64), { type: 'base64', cellDates: true, dense: false }); }
  catch { throw new Error('Не удалось прочитать файл. Используйте .xlsx, .xls или .csv.'); }
  const table = locateTable(workbook, requestedSheet);
  const headers = uniqueColumnLabels(table.matrix[table.headerRow] || []);
  const columns = headers.map((label, index) => ({ key: `c${index}`, index, label, sample: clean((table.matrix[table.headerRow + 1] || [])[index]) }));
  return { ...table, headers, columns, suggestedMapping: suggestMapping(headers) };
}

export function analyzeEmployeeWorkbook(base64, requestedSheet = '') {
  const parsed = parseWorkbook(base64, requestedSheet);
  return {
    sheetName: parsed.sheetName,
    headerRow: parsed.headerRow + 1,
    sourceRows: Math.max(0, parsed.matrix.length - parsed.headerRow - 1),
    columns: parsed.columns,
    suggestedMapping: parsed.suggestedMapping,
    fields: EMPLOYEE_IMPORT_FIELDS.map(({ key, label }) => ({ key, label }))
  };
}

export function parseEmployeeWorkbook(base64, options = {}) {
  const parsed = parseWorkbook(base64, options.sheetName || '');
  const mapping = { ...parsed.suggestedMapping, ...(options.mapping || {}) };
  const columnIndex = key => {
    const value = mapping[key];
    if (!value) return -1;
    const match = String(value).match(/^c(\d+)$/);
    return match ? Number(match[1]) : -1;
  };
  const rows = [];
  parsed.matrix.slice(parsed.headerRow + 1).forEach((source, offset) => {
    const sourceRow = parsed.headerRow + offset + 2;
    const record = {};
    const errors = [];
    EMPLOYEE_IMPORT_FIELDS.forEach(field => {
      const index = columnIndex(field.key);
      if (index < 0) return;
      const raw = source[index];
      if (DATE_FIELDS.has(field.key)) {
        const parsedDate = isoDate(raw);
        record[field.key] = parsedDate.value;
        if (parsedDate.error) errors.push(`${field.label}: ${parsedDate.error}`);
      } else if (field.key === 'timesheetIncluded') record[field.key] = booleanValue(raw);
      else if (field.key === 'fte') record[field.key] = numberValue(raw);
      else record[field.key] = clean(raw);
    });
    if (!Object.values(record).some(value => value !== '' && value !== null && value !== undefined)) return;
    const fromFullName = splitFullName(record.fullName);
    record.surname = record.surname || fromFullName.surname;
    record.name = record.name || fromFullName.name;
    record.patronymic = record.patronymic || fromFullName.patronymic;
    record.fullName = [record.surname, record.name, record.patronymic].filter(Boolean).join(' ');
    if (!record.fullName || !record.surname || !record.name) errors.push('Не удалось определить ФИО: нужны ФИО или отдельные колонки Фамилия и Имя.');
    record.status = statusValue(record.status, record.dismissalDate);
    if (record.dismissalDate && record.startDate && record.dismissalDate < record.startDate) errors.push('Дата увольнения раньше даты фактического выхода.');
    if (record.startDate && record.hireDate && record.startDate < record.hireDate) errors.push('Дата фактического выхода раньше даты приема.');
    rows.push({ sourceRow, record, errors });
  });
  if (!rows.length) throw new Error('После строки заголовков не найдено ни одной записи сотрудника.');
  return { sheetName: parsed.sheetName, headerRow: parsed.headerRow + 1, mapping, columns: parsed.columns, rows };
}

export function importFieldLabel(key) {
  return FIELD_BY_KEY.get(key)?.label || key;
}
