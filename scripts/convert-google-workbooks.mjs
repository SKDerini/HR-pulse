import fs from 'node:fs';
import path from 'node:path';
import XLSX from 'xlsx-js-style';

const args = Object.fromEntries(process.argv.slice(2).map((value, index, all) => value.startsWith('--') ? [value.slice(2), all[index + 1]] : null).filter(Boolean));
if (!args.hr || !args.out) {
  console.error('Использование: node scripts/convert-google-workbooks.mjs --hr "основная.xlsx" [--timesheet "табель.xlsx"] --out "данные.json"');
  process.exit(1);
}

const ID_FIELDS = { employees: 'employeeId', roles: 'email', settings: 'parameter', directory_items: 'refId', events: 'eventId', vacancies: 'vacancyId', candidates: 'candidateId', adaptations: 'adaptId', adaptation_templates: 'templateId', learning: 'learningId', surveys: 'responseId', documents: 'documentId', notifications: 'notificationId', work_calendar: 'date', review: 'reviewId', timesheet_codes: 'code', timesheet_access: 'accessId', timesheet_entries: 'entryId', timesheet_periods: 'periodId', skud_imports: 'importId', timesheet_differences: 'differenceId', skud_controls: 'issueId' };
const BOOL_FIELDS = new Set(['active', 'anonymous', 'mandatory', 'timesheetIncluded', 'canDaily', 'canMonthly', 'canImport', 'canExport', 'canClose']);
const DATE_FIELDS = new Set(['hireDate', 'plannedStartDate', 'startDate', 'dismissalDate', 'birthDate', 'documentsDate', 'date', 'openDate', 'planCloseDate', 'closeDate', 'addedDate', 'interviewDate', 'offerDate', 'planDate', 'actualDate', 'actionDue', 'assignedDate', 'deadline', 'completionDate', 'dueDate', 'loadedAt', 'lastSkudDate', 'confirmedAt']);
const NUMBER_FIELDS = new Set(['fte', 'probationDays', 'individualProbationDays', 'positions', 'daysOpen', 'overdueDays', 'offsetDays', 'employeeScore', 'managerScore', 'taskScore', 'teamScore', 'learningScore', 'testResult', 'hours', 'enps', 'engagement', 'conditions', 'workload', 'development', 'defaultHours', 'order', 'sourceRows', 'aggregated', 'matched', 'differences', 'dismissed', 'unmatched', 'timesheetHours', 'skudHours', 'version']);

const sheets = {
  'Сотрудники': ['employees', {
    'Employee ID': 'employeeId', 'Фамилия': 'surname', 'Имя': 'name', 'Отчество': 'patronymic', 'Подразделение': 'department', 'Должность': 'position', 'Локация': 'location', 'Дата приема': 'hireDate', 'Планируемая дата выхода': 'plannedStartDate', 'Дата выхода': 'startDate', 'Дата увольнения': 'dismissalDate', 'Статус': 'status', 'Руководитель': 'managerName', 'Руководитель ID': 'managerId', 'Наставник ID': 'mentorId', 'Наставник': 'mentorName', 'Тип занятости': 'employmentType', 'FTE': 'fte', 'Формат работы': 'workFormat', 'Источник найма': 'hiringSource', 'Рекрутер': 'recruiter', 'Vacancy ID': 'vacancyId', 'Ответственный HR': 'hrOwner', 'Индивидуальный испытательный срок, дней': 'individualProbationDays', 'Результат ИС': 'probationResult', 'Критичная роль': 'criticalRole', 'Комментарий HR': 'hrComment', 'Статус испытательного срока': 'probationStatus', 'Документы 1 месяца': 'documentsStatus', 'Дата оформления документов': 'documentsDate', 'Причина увольнения': 'dismissalReason', 'Пол': 'gender', 'Дата рождения': 'birthDate', 'Телефон': 'phone', 'Email': 'email', 'Учитывать в табеле': 'timesheetIncluded', 'Причина исключения из табеля': 'timesheetExclusionReason', 'ФИО для СКУД': 'skudFullName', 'Табельный номер': 'timesheetNumber', 'Статус исключения из табеля': 'timesheetExclusionStatus', 'Подтвердил исключение': 'timesheetExclusionConfirmedBy', 'Дата подтверждения исключения': 'timesheetExclusionConfirmedAt'
  }],
  'Кадровые_события': ['events', { 'Event ID': 'eventId', 'Дата': 'date', 'Employee ID': 'employeeId', 'ФИО': 'fullName', 'Тип события': 'type', 'Подразделение до': 'departmentBefore', 'Подразделение после': 'departmentAfter', 'Должность до': 'positionBefore', 'Должность после': 'positionAfter', 'Ставка до': 'fteBefore', 'Ставка после': 'fteAfter', 'Основание/причина': 'reason', 'Документ/№': 'document', 'Комментарий': 'comment', 'Руководитель до': 'managerBefore', 'Руководитель после': 'managerAfter', 'Статус': 'status' }],
  'Открытые_вакансии': ['vacancies', { 'Vacancy ID': 'vacancyId', 'Дата открытия': 'openDate', 'Должность': 'position', 'Подразделение': 'department', 'Локация': 'location', 'Руководитель-заказчик': 'managerName', 'Руководитель ID': 'managerId', 'Рекрутер': 'recruiter', 'Причина открытия': 'reason', 'Кол-во ставок': 'positions', 'Приоритет': 'priority', 'План закрытия': 'planCloseDate', 'Статус': 'status', 'Дата закрытия': 'closeDate', 'Комментарий': 'comment' }],
  'Кандидаты': ['candidates', { 'Candidate ID': 'candidateId', 'Vacancy ID': 'vacancyId', 'Дата добавления': 'addedDate', 'ФИО кандидата': 'fullName', 'Телефон/email': 'contact', 'Источник': 'source', 'Скрининг': 'screening', 'Интервью HR': 'hrInterview', 'Дата интервью HR': 'interviewDate', 'Оффер': 'offer', 'Дата оффера': 'offerDate', 'Вышел': 'started', 'Дата выхода': 'startDate', 'Статус': 'status', 'Причина отказа/отклонения': 'rejectionReason', 'Комментарий': 'comment', 'Рекрутер': 'recruiter' }],
  'Адаптация': ['adaptations', { 'Adapt ID': 'adaptId', 'Employee ID': 'employeeId', 'ФИО': 'fullName', 'Контрольная точка': 'checkpoint', 'Плановая дата': 'planDate', 'Фактическая дата': 'actualDate', 'Оценка сотрудника 1-5': 'employeeScore', 'Оценка руководителя 1-5': 'managerScore', 'Понимание задач 1-5': 'taskScore', 'Команда 1-5': 'teamScore', 'Обучение 1-5': 'learningScore', 'Риск': 'risk', 'Проблема/сигнал': 'problem', 'Действие HR': 'action', 'Ответственный': 'owner', 'Срок действия': 'actionDue', 'Статус действия': 'actionStatus', 'Комментарий HR': 'hrComment', 'Смещение, дней': 'offsetDays', 'Тип точки': 'pointType', 'База расчета': 'calculationBase', 'Template ID': 'templateId' }],
  'Документы_сотрудников': ['documents', { 'Document ID': 'documentId', 'Employee ID': 'employeeId', 'ФИО': 'fullName', 'Тип документа': 'type', 'Номер/реквизиты': 'details', 'Плановая дата': 'planDate', 'Дата оформления': 'completionDate', 'Статус': 'status', 'Файл/ссылка': 'fileUrl', 'Комментарий': 'comment', 'Ответственный': 'owner' }],
  'Обучение': ['learning', { 'Learning ID': 'learningId', 'Employee ID': 'employeeId', 'ФИО': 'fullName', 'Программа': 'program', 'Тип': 'type', 'Дата назначения': 'assignedDate', 'Дедлайн': 'deadline', 'Дата завершения': 'completionDate', 'Статус': 'status', 'Результат теста, %': 'testResult', 'Часы': 'hours', 'Обязательное': 'mandatory', 'Комментарий': 'comment', 'Ответственный': 'owner' }],
  'Опросы': ['surveys', { 'Response ID': 'responseId', 'Дата': 'date', 'Survey ID': 'surveyId', 'Тип опроса': 'type', 'Employee ID': 'employeeId', 'ФИО': 'fullName', 'Подразделение': 'department', 'Стаж/точка': 'tenurePoint', 'eNPS 0-10': 'enps', 'Вовлеченность 1-5': 'engagement', 'Руководитель 1-5': 'managerScore', 'Команда 1-5': 'teamScore', 'Условия 1-5': 'conditions', 'Нагрузка 1-5': 'workload', 'Развитие 1-5': 'development', 'Риск': 'risk', 'Комментарий сотрудника': 'employeeComment', 'Комментарий HR': 'hrComment', 'Источник': 'source', 'Анонимный': 'anonymous' }],
  'Справочник_элементы': ['directory_items', { 'Ref ID': 'refId', 'Тип': 'type', 'Значение': 'value', 'Родитель': 'parent', 'Активен': 'active', 'Комментарий': 'comment' }],
  'Настройки': ['settings', { 'Параметр': 'parameter', 'Значение': 'value', 'Комментарий': 'comment', 'Использование': 'usage' }],
  'Роли_доступа': ['roles', { 'Email': 'email', 'Роль': 'role', 'Employee ID': 'employeeId', 'Активен': 'active', 'Комментарий': 'comment' }],
  'На_проверку': ['review', { 'Review ID': 'reviewId', 'Employee ID': 'employeeId', 'Проблема': 'problem', 'Проверить': 'check', 'Источник': 'source', 'Статус проверки': 'status', 'Комментарий': 'comment' }],
  'Шаблоны_адаптации': ['adaptation_templates', { 'Template ID': 'templateId', 'Название точки': 'name', 'Смещение, дней': 'offsetDays', 'Подразделение': 'department', 'Должность': 'position', 'Тип занятости': 'employmentType', 'Ответственный': 'owner', 'Активен': 'active', 'Комментарий': 'comment' }],
  'Рабочий_календарь': ['work_calendar', { 'Дата': 'date', 'Тип дня': 'dayType', 'Название': 'name', 'Активен': 'active', 'Комментарий': 'comment' }],
  'Журнал_уведомлений': ['notifications', { 'Notification ID': 'notificationId', 'Email': 'email', 'Тип': 'type', 'Заголовок': 'title', 'Подзаголовок': 'subtitle', 'Срок': 'dueDate', 'Страница': 'page', 'Object ID': 'id', 'Прочитано': 'read' }],
  'Табель_периоды': ['timesheet_periods', { 'Период': 'period', 'Подразделение': 'department', 'Статус': 'status', 'Комментарий': 'comment' }],
  'Табель_дни': ['timesheet_entries', { 'Entry ID': 'entryId', 'Период': 'period', 'Дата': 'date', 'Employee ID': 'employeeId', 'ФИО': 'fullName', 'Подразделение': 'department', 'Должность': 'position', 'Код': 'code', 'Факт часов': 'hours', 'Источник': 'source', 'Комментарий': 'comment', 'Версия': 'version', 'Обновил': 'updatedBy' }],
  'СКУД_импорты': ['skud_imports', { 'Import ID': 'importId', 'Период': 'period', 'Имя файла': 'fileName', 'Ссылка на файл': 'fileUrl', 'Строк в файле': 'sourceRows', 'Дней агрегировано': 'aggregated', 'Сопоставлено': 'matched', 'Расхождений': 'differences', 'Уволенных в СКУД': 'dismissed', 'Не найдено': 'unmatched', 'Статус': 'status', 'Загрузил': 'user', 'Загружено': 'loadedAt', 'Профиль файла': 'profile' }],
  'Расхождения_табеля': ['timesheet_differences', { 'Difference ID': 'differenceId', 'Import ID': 'importId', 'Период': 'period', 'Дата': 'date', 'Employee ID': 'employeeId', 'ФИО': 'fullName', 'Подразделение': 'department', 'Код табеля': 'code', 'Часы табеля': 'timesheetHours', 'Часы СКУД': 'skudHours', 'Тип расхождения': 'type', 'Важность': 'severity', 'Решение': 'resolution', 'Комментарий': 'comment', 'Статус': 'status', 'Ответственный': 'owner' }],
  'Контроль_СКУД': ['skud_controls', { 'Issue ID': 'issueId', 'ФИО': 'fullName', 'Employee ID': 'employeeId', 'Подразделение': 'department', 'Дата увольнения': 'dismissalDate', 'Последняя дата в СКУД': 'lastSkudDate', 'Тип проблемы': 'issueType', 'Важность': 'severity', 'Статус': 'status', 'Ответственный': 'owner', 'Комментарий': 'comment' }],
  'Коды_табеля': ['timesheet_codes', { 'Код': 'code', 'Наименование': 'name', 'Категория': 'category', 'Цвет': 'color', 'Часы по умолчанию': 'defaultHours', 'Требует документа': 'requiresDocument', 'Активен': 'active', 'Порядок': 'order', 'Комментарий': 'comment' }],
  'Доступ_табель': ['timesheet_access', { 'Email': 'email', 'Роль в табеле': 'timesheetRole', 'Подразделение': 'department', 'Ежедневное заполнение': 'canDaily', 'Ежемесячная проверка': 'canMonthly', 'Импорт СКУД': 'canImport', 'Выгрузка Excel': 'canExport', 'Закрытие периода': 'canClose', 'Активен': 'active', 'Комментарий': 'comment', 'Область доступа': 'accessScope', 'Руководитель ID': 'managerId', 'Employee ID сотрудников': 'employeeIds' }]
};

function asIso(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  if (typeof value === 'number') { const d = XLSX.SSF.parse_date_code(value); if (d) return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`; }
  const text = String(value ?? '').trim();
  const ru = text.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/); if (ru) return `${ru[3]}-${ru[2].padStart(2, '0')}-${ru[1].padStart(2, '0')}`;
  return /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10) : text;
}

function convertValue(field, value) {
  if (BOOL_FIELDS.has(field)) return value === true || /^(да|true|1)$/i.test(String(value ?? '').trim());
  if (DATE_FIELDS.has(field)) return asIso(value);
  if (NUMBER_FIELDS.has(field)) return value === '' || value === null || value === undefined ? '' : Number(String(value).replace(',', '.'));
  if (field === 'employeeIds') return String(value || '').split(/[,;\n]/).map(item => item.trim()).filter(Boolean);
  return typeof value === 'string' ? value.trim() : value;
}

function readWorkbook(file) {
  return XLSX.readFile(path.resolve(file), { cellDates: true, raw: true });
}

function convertSheet(workbook, sheetName, entity, fieldMap) {
  const sheet = workbook.Sheets[sheetName]; if (!sheet) return [];
  const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: true });
  return rawRows.map((row, index) => {
    const payload = {};
    Object.entries(fieldMap).forEach(([source, target]) => { if (Object.hasOwn(row, source)) payload[target] = convertValue(target, row[source]); });
    if (entity === 'employees') payload.fullName = [payload.surname, payload.name, payload.patronymic].filter(Boolean).join(' ');
    if (entity === 'timesheet_periods') payload.periodId = `${payload.period}|${payload.department || '*'}`;
    if (entity === 'timesheet_access') payload.accessId = `ACC-MIG-${String(index + 1).padStart(5, '0')}`;
    if (entity === 'review' && !payload.reviewId) payload.reviewId = `REV-MIG-${String(index + 1).padStart(5, '0')}`;
    return payload;
  }).filter(payload => String(payload[ID_FIELDS[entity]] || '').trim());
}

const records = [];
for (const file of [args.hr, args.timesheet].filter(Boolean)) {
  const workbook = readWorkbook(file);
  Object.entries(sheets).forEach(([sheetName, [entity, fieldMap]]) => {
    convertSheet(workbook, sheetName, entity, fieldMap).forEach(payload => {
      const recordId = String(payload[ID_FIELDS[entity]] || '').trim();
      records.push({ key: `${entity}:${recordId}`, entity, recordId, employeeId: payload.employeeId || '', managerId: payload.managerId || '', department: payload.department || '', period: payload.period || '', recordDate: payload.date || payload.planDate || '', email: String(payload.email || '').toLowerCase(), updatedAt: new Date().toISOString(), payload });
    });
  });
}

const deduped = [...new Map(records.map(row => [row.key, row])).values()];
const output = { format: 'hr-stroyakov-v2', exportedAt: new Date().toISOString(), source: { hr: path.resolve(args.hr), timesheet: args.timesheet ? path.resolve(args.timesheet) : '' }, records: deduped, meta: [{ key: 'seedVersion', value: 'migrated-2.0.0' }, { key: 'previewActor', value: { email: 'hrd@example.test' } }] };
fs.writeFileSync(path.resolve(args.out), JSON.stringify(output, null, 2), 'utf8');
console.log(JSON.stringify({ output: path.resolve(args.out), records: deduped.length, entities: Object.fromEntries([...new Set(deduped.map(row => row.entity))].map(entity => [entity, deduped.filter(row => row.entity === entity).length])) }, null, 2));
