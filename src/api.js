import { previewSeed, SEED_VERSION } from './seed.js';

const ACTIVE_MODULES = ['hr', 'offers', 'timesheet'];
const DAY_MS = 86400000;

const clone = value => structuredClone(value);
const clean = value => String(value ?? '').trim();
const yes = value => value === true || /^(да|true|1)$/i.test(clean(value));
const num = value => clean(value) === '' ? '' : Number(value);
const todayIso = () => {
  const date = new Date();
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};
const parseDate = value => {
  if (!value) return null;
  const date = new Date(`${String(value).slice(0, 10)}T12:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
};
const addDays = (value, days) => { const date = parseDate(value); if (!date) return ''; date.setDate(date.getDate() + Number(days || 0)); return todayFrom(date); };
const todayFrom = date => new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const daysBetween = (from, to = todayIso()) => { const start = parseDate(from); const end = parseDate(to); return start && end ? Math.floor((end - start) / DAY_MS) : ''; };
const unique = values => [...new Set(values.filter(Boolean))];
const average = values => values.length ? Math.round(values.reduce((sum, value) => sum + Number(value || 0), 0) / values.length * 10) / 10 : 0;
const normalizeFullName = value => String(value || '').toLocaleLowerCase('ru-RU').replace(/ё/g, 'е').replace(/[^a-zа-я0-9\s-]/gi, ' ').replace(/\s+/g, ' ').trim();

function nextId(prefix, rows, field, width = 4) {
  const max = rows.reduce((value, row) => {
    const match = clean(row[field]).match(/(\d+)$/);
    return Math.max(value, match ? Number(match[1]) : 0);
  }, 0);
  return `${prefix}${String(max + 1).padStart(width, '0')}`;
}

function daysInPeriod(period) {
  const match = clean(period).match(/^(\d{4})-(\d{2})$/);
  if (!match) throw new Error('Период должен быть указан в формате ГГГГ-ММ.');
  const year = Number(match[1]);
  const month = Number(match[2]);
  const count = new Date(year, month, 0).getDate();
  const weekdays = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(year, month - 1, index + 1, 12);
    return { date: `${period}-${String(index + 1).padStart(2, '0')}`, day: index + 1, weekday: weekdays[date.getDay()], working: date.getDay() !== 0 && date.getDay() !== 6 };
  });
}

function indexFor(entity, payload) {
  return {
    employeeId: payload.employeeId || '',
    managerId: payload.managerId || '',
    department: payload.department || '',
    period: payload.period || '',
    recordDate: payload.date || payload.planDate || '',
    email: payload.email || ''
  };
}

function recordId(entity, payload) {
  const fields = {
    employees: 'employeeId', roles: 'email', settings: 'parameter', directory_items: 'refId', events: 'eventId', vacancies: 'vacancyId', candidates: 'candidateId',
    adaptations: 'adaptId', adaptation_templates: 'templateId', learning: 'learningId', surveys: 'responseId', documents: 'documentId', notifications: 'notificationId',
    work_calendar: 'date', review: 'reviewId', timesheet_codes: 'code', timesheet_access: 'accessId', timesheet_entries: 'entryId', timesheet_periods: 'periodId',
    skud_imports: 'importId', timesheet_differences: 'differenceId', skud_controls: 'issueId',
    offers: 'offerId', offer_motivation_versions: 'versionId', offer_events: 'eventId'
  };
  return clean(payload[fields[entity] || 'id']);
}

export function createHrApi(db) {
  let actorCache = null;

  async function ensurePreviewSeed() {
    if (db.mode !== 'preview') return;
    const version = await db.getMeta('seedVersion');
    if (version === SEED_VERSION) return;
    const entities = version ? ['offers', 'offer_motivation_versions', 'offer_events'] : Object.keys(previewSeed);
    for (const entity of entities) {
      const rows = previewSeed[entity] || [];
      const existing = version ? await db.list(entity) : [];
      if (!existing.length && rows.length) {
        await db.bulkPut(entity, rows.map(payload => ({ recordId: recordId(entity, payload), payload, indexes: indexFor(entity, payload) })));
      }
    }
    await db.setMeta('seedVersion', SEED_VERSION);
    if (!version) await db.setMeta('previewActor', { email: 'hrd@example.test' });
  }

  async function currentActor(force = false) {
    if (actorCache && !force) return actorCache;
    const user = await db.currentUser();
    if (!user?.email) throw new Error('AUTH_REQUIRED');
    const roles = await db.list('roles', { email: user.email.toLowerCase() });
    const roleRow = roles.find(item => item.active !== false) || (db.mode === 'preview' ? { email: user.email, role: 'HRD', employeeId: '', active: true } : null);
    if (!roleRow) throw new Error('Для пользователя не назначена активная роль. Обратитесь к HRD.');
    actorCache = { email: user.email.toLowerCase(), role: roleRow.role, employeeId: roleRow.employeeId || '', bootstrapAccess: false };
    return actorCache;
  }

  async function permissions(actor) {
    const base = { activeModules: ACTIVE_MODULES, canEditEmployees: false, canManageHr: false, canManageSettings: false, canWriteTeamModules: false, canUseTimesheet: true, canManageOffers: false };
    if (actor.role === 'Табельщик') return { ...base, modules: ['hr', 'timesheet'] };
    if (actor.role === 'HRD') return { ...base, modules: ACTIVE_MODULES, canEditEmployees: true, canManageHr: true, canManageSettings: true, canWriteTeamModules: true, canManageOffers: true };
    if (actor.role === 'HR') return { ...base, modules: ACTIVE_MODULES, canEditEmployees: true, canManageHr: true, canWriteTeamModules: true, canManageOffers: true };
    return { ...base, modules: ['hr', 'timesheet'], canWriteTeamModules: true };
  }

  async function allEmployees() {
    const rows = await db.list('employees');
    return rows.map(enrichEmployee).sort((a, b) => a.fullName.localeCompare(b.fullName, 'ru'));
  }

  function enrichEmployee(employee) {
    const row = { ...employee };
    row.fullName = clean(row.fullName) || [row.surname, row.name, row.patronymic].filter(Boolean).join(' ');
    row.status = row.dismissalDate ? 'Уволен' : (row.status || 'Работает');
    row.probationDays = Number(row.individualProbationDays || row.probationDays || 90);
    row.probationEndFromHire = row.hireDate ? addDays(row.hireDate, row.probationDays) : '';
    row.probationEndFromStart = row.startDate ? addDays(row.startDate, row.probationDays) : '';
    row.probationStateFromHire = probationState(row.probationEndFromHire, row.probationStatus);
    row.probationStateFromStart = probationState(row.probationEndFromStart, row.probationStatus);
    row.tenureDays = daysBetween(row.startDate || row.hireDate);
    row.timesheetIncluded = row.timesheetIncluded !== false;
    row.timesheetExclusionStatus = row.timesheetExclusionStatus || 'Не требуется';
    return row;
  }

  function probationState(endDate, status) {
    if (!endDate) return 'Нет данных';
    if (status === 'Не прошел') return 'Не прошел';
    return endDate < todayIso() ? 'Прошел' : 'На испытательном сроке';
  }

  async function timesheetAccess(actor, employees) {
    const all = actor.role === 'HR' || actor.role === 'HRD';
    if (all) return { allDepartments: true, employeeIds: employees.map(item => item.employeeId), departments: unique(employees.map(item => item.department)), canDaily: true, canMonthly: true, canImport: true, canExport: true, canClose: true, canManageAccess: actor.role === 'HRD', canManageControl: true };
    const rules = (await db.list('timesheet_access', { email: actor.email })).filter(item => item.active !== false);
    const allowed = new Set();
    let canDaily = false, canMonthly = false, canExport = false, canClose = false;
    const byManager = managerId => employees.filter(item => item.managerId === managerId);
    const recursive = managerId => {
      const result = []; const queue = [managerId]; const seen = new Set(queue);
      while (queue.length) byManager(queue.shift()).forEach(item => { if (!seen.has(item.employeeId)) { seen.add(item.employeeId); result.push(item); queue.push(item.employeeId); } });
      return result;
    };
    rules.forEach(rule => {
      canDaily ||= !!rule.canDaily; canMonthly ||= !!rule.canMonthly; canExport ||= !!rule.canExport; canClose ||= !!rule.canClose;
      if (rule.accessScope === 'Прямые подчиненные') byManager(rule.managerId).forEach(item => allowed.add(item.employeeId));
      else if (rule.accessScope === 'Все подчиненные') recursive(rule.managerId).forEach(item => allowed.add(item.employeeId));
      else if (rule.accessScope === 'Выбранные сотрудники') (rule.employeeIds || []).forEach(id => allowed.add(id));
      else employees.filter(item => item.department === rule.department).forEach(item => allowed.add(item.employeeId));
    });
    if (actor.role === 'Руководитель' && actor.employeeId && !rules.length) recursive(actor.employeeId).forEach(item => allowed.add(item.employeeId));
    return { allDepartments: false, employeeIds: [...allowed], departments: unique(employees.filter(item => allowed.has(item.employeeId)).map(item => item.department)), canDaily, canMonthly, canImport: false, canExport, canClose, canManageAccess: false, canManageControl: false };
  }

  async function visibleEmployees(actor) {
    const employees = await allEmployees();
    if (actor.role === 'HR' || actor.role === 'HRD') return employees;
    if (actor.role === 'Табельщик') {
      const access = await timesheetAccess(actor, employees);
      return employees.filter(item => access.employeeIds.includes(item.employeeId));
    }
    if (!actor.employeeId) return [];
    const result = []; const queue = [actor.employeeId]; const seen = new Set(queue);
    while (queue.length) {
      const managerId = queue.shift();
      employees.filter(item => item.managerId === managerId).forEach(item => { if (!seen.has(item.employeeId)) { seen.add(item.employeeId); result.push(item); queue.push(item.employeeId); } });
    }
    return result;
  }

  async function assertManage(actor) { if (!['HR', 'HRD'].includes(actor.role)) throw new Error('Недостаточно прав для этой операции.'); }
  async function assertHrd(actor) { if (actor.role !== 'HRD') throw new Error('Операция доступна только HRD.'); }
  async function save(entity, payload) { const id = recordId(entity, payload); if (!id) throw new Error(`Не определен ключ записи ${entity}.`); await db.put(entity, id, payload, indexFor(entity, payload)); return payload; }

  async function references() {
    const items = (await db.list('directory_items')).filter(item => item.active !== false);
    const byType = type => items.filter(item => item.type === type).map(item => item.value);
    const employees = await allEmployees();
    return {
      employeeStatuses: byType('Статус сотрудника'), probationStatuses: byType('Статус ИС'), genders: byType('Пол'), employmentTypes: byType('Тип занятости'), workFormats: byType('Формат работы'),
      vacancyPriorities: byType('Приоритет вакансии'), vacancyStatuses: byType('Статус вакансии'), candidateStatuses: byType('Статус кандидата'), eventTypes: byType('Тип кадрового события'), surveyTypes: byType('Тип опроса'),
      risks: byType('Риск'), checkpoints: byType('Контрольная точка'), trainingStatuses: byType('Статус обучения'), trainingTypes: byType('Тип обучения'), departments: byType('Подразделение'), locations: byType('Локация'),
      dismissalReasons: byType('Причина увольнения'), hiringSources: byType('Источник найма'), trainingPrograms: byType('Программа обучения'), initiators: byType('Инициатор увольнения'), positions: byType('Должность'),
      documentTypes: byType('Тип документа'), documentStatuses: byType('Статус документа'), dayTypes: byType('Тип дня'),
      managers: employees.filter(item => item.status !== 'Уволен').map(item => ({ id: item.employeeId, label: item.fullName }))
    };
  }

  async function bootstrap(actor) {
    const perms = await permissions(actor);
    const notices = await notifications(actor);
    return { app: { name: 'HR Строяков', version: '2.1.0', runtime: db.mode }, actor, permissions: perms, references: await references(), notificationCount: notices.notifications.length, migration: { migrated: true, source: db.mode } };
  }

  async function notifications(actor) {
    const rows = await db.list('notifications', { email: actor.email });
    return { notifications: rows.filter(item => !item.read).sort((a, b) => clean(a.dueDate).localeCompare(clean(b.dueDate))) };
  }

  async function employeeList(actor) {
    const all = await allEmployees();
    const employees = await visibleEmployees(actor);
    return { employees: employees, stats: { total: all.length, working: all.filter(item => item.status === 'Работает').length, dismissed: all.filter(item => item.status === 'Уволен').length, probation: all.filter(item => item.probationStateFromStart === 'На испытательном сроке').length } };
  }

  async function employeeCard(actor, employeeId) {
    const visible = await visibleEmployees(actor);
    let profile = visible.find(item => item.employeeId === employeeId);
    if (!profile && ['HR', 'HRD'].includes(actor.role)) profile = (await allEmployees()).find(item => item.employeeId === employeeId);
    if (!profile) throw new Error('Сотрудник не найден или недоступен.');
    const filter = rows => rows.filter(item => item.employeeId === employeeId);
    const [events, adaptationRows, learningRows, surveyRows, documents] = await Promise.all([db.list('events'), db.list('adaptations'), db.list('learning'), db.list('surveys'), db.list('documents')]);
    const missing = ['department', 'position', 'hireDate'].filter(field => !profile[field]).map(field => ({ department: 'Подразделение', position: 'Должность', hireDate: 'Дата приема' }[field]));
    const recommendedMissing = ['startDate', 'managerId', 'email', 'workFormat'].filter(field => !profile[field]).map(field => ({ startDate: 'Дата выхода', managerId: 'Руководитель', email: 'Email', workFormat: 'Формат работы' }[field]));
    return { profile, events: filter(events), adaptation: filter(adaptationRows), learning: filter(learningRows), surveys: filter(surveyRows), documents: filter(documents), quality: { missing, recommendedMissing, completeness: Math.round((1 - (missing.length + recommendedMissing.length) / 12) * 100) } };
  }

  async function saveEmployee(actor, form) {
    await assertManage(actor);
    const employees = await allEmployees();
    const old = form.employeeId ? employees.find(item => item.employeeId === form.employeeId) : null;
    const id = clean(form.employeeId) || nextId('ST-', employees, 'employeeId');
    const manager = employees.find(item => item.employeeId === form.managerId);
    const mentor = employees.find(item => item.employeeId === form.mentorId);
    const timesheetIncluded = yes(form.timesheetIncluded);
    if (!timesheetIncluded && !clean(form.timesheetExclusionReason)) throw new Error('Укажите причину исключения из табеля.');
    const payload = enrichEmployee({ ...old, ...form, employeeId: id, fullName: [form.surname, form.name, form.patronymic].filter(Boolean).join(' '), managerName: manager?.fullName || '', mentorName: mentor?.fullName || '', fte: num(form.fte) || 1, individualProbationDays: num(form.individualProbationDays), timesheetIncluded, timesheetExclusionStatus: timesheetIncluded ? 'Не требуется' : (old?.timesheetIncluded === false && old?.timesheetExclusionStatus === 'Подтверждено' ? 'Подтверждено' : 'Требует подтверждения'), status: old?.status || 'Работает', updatedAt: new Date().toISOString() });
    await save('employees', payload);
    return payload;
  }

  async function dismissEmployee(actor, form) {
    await assertManage(actor);
    const employee = (await allEmployees()).find(item => item.employeeId === form.employeeId);
    if (!employee) throw new Error('Сотрудник не найден.');
    Object.assign(employee, { dismissalDate: form.dismissalDate, dismissalReason: form.dismissalReason, status: 'Уволен', updatedAt: new Date().toISOString() });
    await save('employees', employee);
    const events = await db.list('events');
    await save('events', { eventId: nextId('EV-', events, 'eventId'), date: form.dismissalDate, employeeId: employee.employeeId, fullName: employee.fullName, type: 'Увольнение', departmentBefore: employee.department, departmentAfter: '', positionBefore: employee.position, positionAfter: '', fteBefore: employee.fte, fteAfter: 0, reason: form.dismissalReason, comment: form.comment || '' });
    return employee;
  }

  async function saveSimple(actor, entity, form, config) {
    if (config.manage) await assertManage(actor);
    const rows = await db.list(entity);
    const old = form[config.idField] ? rows.find(item => item[config.idField] === form[config.idField]) : null;
    const id = clean(form[config.idField]) || nextId(config.prefix, rows, config.idField, config.width || 4);
    let payload = { ...old, ...form, [config.idField]: id, updatedAt: new Date().toISOString() };
    if (config.employee) {
      const employee = (await allEmployees()).find(item => item.employeeId === payload.employeeId);
      if (!employee) throw new Error('Сотрудник не найден.');
      payload.fullName = employee.fullName;
      payload.department = employee.department;
    }
    if (config.transform) payload = await config.transform(payload, rows, old);
    await save(entity, payload);
    return payload;
  }

  async function saveEvent(actor, form) {
    await assertManage(actor);
    const employees = await allEmployees(); const employee = employees.find(item => item.employeeId === form.employeeId);
    if (!employee) throw new Error('Сотрудник не найден.');
    const manager = employees.find(item => item.employeeId === form.managerIdAfter);
    const event = { eventId: nextId('EV-', await db.list('events'), 'eventId'), date: form.date, employeeId: employee.employeeId, fullName: employee.fullName, type: form.type, departmentBefore: employee.department, departmentAfter: form.departmentAfter || employee.department, positionBefore: employee.position, positionAfter: form.positionAfter || employee.position, fteBefore: employee.fte, fteAfter: num(form.fteAfter) || employee.fte, managerBefore: employee.managerName, managerAfter: manager?.fullName || employee.managerName, reason: form.reason, document: form.document, comment: form.comment };
    Object.assign(employee, { department: event.departmentAfter, position: event.positionAfter, fte: event.fteAfter, managerId: form.managerIdAfter || employee.managerId, managerName: event.managerAfter });
    await save('employees', employee); await save('events', event); return event;
  }

  async function quality(actor) {
    const employees = await visibleEmployees(actor);
    const records = employees.map(employee => {
      const missing = ['department', 'position', 'hireDate'].filter(field => !employee[field]).map(field => ({ department: 'Подразделение', position: 'Должность', hireDate: 'Дата приема' }[field]));
      const recommendedMissing = ['startDate', 'managerId', 'email', 'workFormat'].filter(field => !employee[field]).map(field => ({ startDate: 'Дата выхода', managerId: 'Руководитель', email: 'Email', workFormat: 'Формат работы' }[field]));
      return { employee, missing, recommendedMissing, completeness: Math.round((1 - (missing.length + recommendedMissing.length) / 12) * 100) };
    }).filter(item => item.missing.length || item.recommendedMissing.length);
    const manual = (await db.list('review')).filter(item => item.status !== 'Решено');
    return { records, manual, stats: { employeesWithGaps: records.length, critical: records.filter(item => item.missing.length).length, manual: manual.length, averageCompleteness: employees.length ? Math.round(average(records.map(item => item.completeness))) : 100 } };
  }

  async function recruitment() {
    const vacancies = await db.list('vacancies'); const candidates = await db.list('candidates');
    vacancies.forEach(vacancy => { vacancy.daysOpen = daysBetween(vacancy.openDate, vacancy.closeDate || todayIso()); vacancy.overdueDays = vacancy.planCloseDate && !vacancy.closeDate && vacancy.planCloseDate < todayIso() ? daysBetween(vacancy.planCloseDate) : 0; vacancy.candidates = candidates.filter(item => item.vacancyId === vacancy.vacancyId).length; });
    const closed = vacancies.filter(item => item.closeDate).map(item => daysBetween(item.openDate, item.closeDate));
    return { vacancies, candidates, stats: { openVacancies: vacancies.filter(item => item.status === 'Открыта').length, openPositions: vacancies.filter(item => item.status === 'Открыта').reduce((sum, item) => sum + Number(item.positions || 0), 0), overdue: vacancies.filter(item => Number(item.overdueDays) > 0).length, averageTimeToFill: Math.round(average(closed)), candidates: candidates.length, interviews: candidates.filter(item => item.hrInterview === 'Да').length, offers: candidates.filter(item => item.offer === 'Да').length, starts: candidates.filter(item => item.started === 'Да').length } };
  }

  async function adaptation(actor) {
    const employees = await visibleEmployees(actor); const visible = new Set(employees.map(item => item.employeeId));
    const records = (await db.list('adaptations')).filter(item => visible.has(item.employeeId));
    const eligibleEmployees = employees.filter(item => item.status === 'Работает' && item.startDate && daysBetween(item.startDate) >= 0 && daysBetween(item.startDate) <= 90);
    return { records, eligibleEmployees, missingStartDate: employees.filter(item => item.status === 'Работает' && !item.startDate).length, stats: { newcomers: eligibleEmployees.length, due: records.filter(item => !item.actualDate && item.planDate <= addDays(todayIso(), 3)).length, highRisk: records.filter(item => item.risk === 'Красный').length, mediumRisk: records.filter(item => item.risk === 'Желтый').length, retention: { 7: 100, 30: 96, 60: 93, 90: 91 } } };
  }

  async function isWorkday(dateValue) {
    const overrides = await db.list('work_calendar', { date: dateValue });
    const active = overrides.find(item => item.active !== false);
    if (active) return active.dayType === 'Рабочий';
    const date = parseDate(dateValue); return date && date.getDay() !== 0 && date.getDay() !== 6;
  }

  async function nextWorkday(dateValue) {
    let date = dateValue;
    for (let guard = 0; guard < 10; guard += 1) { if (await isWorkday(date)) return date; date = addDays(date, 1); }
    return dateValue;
  }

  async function syncAdaptation(actor) {
    await assertManage(actor);
    const employees = (await allEmployees()).filter(item => item.status === 'Работает' && item.startDate && daysBetween(item.startDate) <= 90 && daysBetween(item.startDate) >= 0);
    const templates = (await db.list('adaptation_templates')).filter(item => item.active !== false);
    const existing = await db.list('adaptations'); let created = 0, updated = 0;
    for (const employee of employees) {
      const applicable = templates.filter(item => (!item.department || item.department === employee.department) && (!item.position || item.position === employee.position) && (!item.employmentType || item.employmentType === employee.employmentType));
      for (const template of applicable) {
        const found = existing.find(item => item.employeeId === employee.employeeId && item.templateId === template.templateId);
        const planDate = await nextWorkday(addDays(employee.startDate, template.offsetDays));
        if (found) { found.planDate = planDate; found.offsetDays = template.offsetDays; found.checkpoint = template.name; await save('adaptations', found); updated += 1; }
        else {
          const payload = { adaptId: nextId('ADP-', existing, 'adaptId'), employeeId: employee.employeeId, fullName: employee.fullName, department: employee.department, checkpoint: template.name, offsetDays: template.offsetDays, pointType: 'Автоматическая', calculationBase: 'Дата выхода', templateId: template.templateId, planDate, actualDate: '', employeeScore: '', managerScore: '', taskScore: '', teamScore: '', learningScore: '', risk: 'Зеленый', problem: '', action: '', owner: template.owner || 'HR', actionDue: '', actionStatus: 'Запланировано', hrComment: '' };
          existing.push(payload); await save('adaptations', payload); created += 1;
        }
      }
    }
    return { employees: employees.length, created, updated };
  }

  async function learning(actor) {
    const visible = new Set((await visibleEmployees(actor)).map(item => item.employeeId)); const records = (await db.list('learning')).filter(item => visible.has(item.employeeId));
    return { records, stats: { assigned: records.length, inProgress: records.filter(item => item.status === 'В процессе').length, completed: records.filter(item => item.status === 'Завершено').length, overdue: records.filter(item => item.deadline && item.deadline < todayIso() && item.status !== 'Завершено').length, completionRate: records.length ? Math.round(records.filter(item => item.status === 'Завершено').length / records.length * 100) : 0 } };
  }

  async function surveys(actor) {
    const visible = new Set((await visibleEmployees(actor)).map(item => item.employeeId)); let records = await db.list('surveys');
    if (!['HR', 'HRD'].includes(actor.role)) records = records.filter(item => !item.employeeId || visible.has(item.employeeId));
    const scores = records.map(item => Number(item.enps)).filter(Number.isFinite);
    const promoters = scores.filter(value => value >= 9).length, detractors = scores.filter(value => value <= 6).length;
    return { records, stats: { responses: records.length, enps: scores.length ? Math.round((promoters - detractors) / scores.length * 100) : 0, promoters, detractors, averageEngagement: average(records.map(item => item.engagement).filter(value => value !== '')) } };
  }

  async function prepareTimesheet(actor, payload) {
    const period = payload.period || todayIso().slice(0, 7); const days = daysInPeriod(period); const employees = await allEmployees(); const access = await timesheetAccess(actor, employees);
    if (!access.canDaily && !access.canMonthly) throw new Error('Нет прав на формирование табеля.');
    const allowed = employees.filter(item => access.employeeIds.includes(item.employeeId) && item.timesheetExclusionStatus !== 'Подтверждено' && (!payload.department || item.department === payload.department));
    const existing = await db.list('timesheet_entries', { period }); const keySet = new Set(existing.map(item => `${item.employeeId}|${item.date}`)); const additions = [];
    for (const employee of allowed) {
      for (const day of days) {
        const employed = (!employee.startDate || employee.startDate <= day.date) && (!employee.dismissalDate || employee.dismissalDate >= day.date);
        const key = `${employee.employeeId}|${day.date}`;
        if (!employed || keySet.has(key)) continue;
        const code = day.working ? 'Я' : 'В';
        additions.push({ entryId: `TS-${period.replace('-', '')}-${employee.employeeId}-${String(day.day).padStart(2, '0')}`, period, date: day.date, employeeId: employee.employeeId, fullName: employee.fullName, department: employee.department, position: employee.position, code, hours: day.working ? 8 : 0, source: 'План', comment: '', version: 1, updatedBy: actor.email, updatedAt: new Date().toISOString() });
      }
    }
    await db.bulkPut('timesheet_entries', additions.map(item => ({ recordId: item.entryId, payload: item, indexes: indexFor('timesheet_entries', item) })));
    const periods = await db.list('timesheet_periods'); const periodId = `${period}|${payload.department || '*'}`; const current = periods.find(item => item.periodId === periodId) || { periodId, period, department: payload.department || '', status: 'Открыт' };
    await save('timesheet_periods', { ...current, updatedAt: new Date().toISOString(), updatedBy: actor.email });
    return { employees: allowed.length, created: additions.length, period };
  }

  async function getTimesheet(actor, payload) {
    const period = payload.period || todayIso().slice(0, 7); const days = daysInPeriod(period); const employees = await allEmployees(); const access = await timesheetAccess(actor, employees);
    const allowedEmployees = employees.filter(item => access.employeeIds.includes(item.employeeId) && (!payload.department || item.department === payload.department) && item.timesheetExclusionStatus !== 'Подтверждено');
    const [entries, periods, codes, differences, controls, imports, accessRows] = await Promise.all([
      db.list('timesheet_entries', { period }), db.list('timesheet_periods'), db.list('timesheet_codes'), db.list('timesheet_differences', { period }), db.list('skud_controls'), db.list('skud_imports', { period }), actor.role === 'HRD' ? db.list('timesheet_access') : Promise.resolve([])
    ]);
    const allowedSet = new Set(access.employeeIds); const entryMap = new Map(entries.map(item => [`${item.employeeId}|${item.date}`, item])); const differenceMap = new Map(differences.filter(item => item.status !== 'Решено').map(item => [`${item.employeeId}|${item.date}`, item]));
    const rows = allowedEmployees.map(employee => ({ employeeId: employee.employeeId, fullName: employee.fullName, department: employee.department, position: employee.position, timesheetNumber: employee.timesheetNumber || '', cells: days.map(day => {
      const entry = entryMap.get(`${employee.employeeId}|${day.date}`); const difference = differenceMap.get(`${employee.employeeId}|${day.date}`); const employed = (!employee.startDate || employee.startDate <= day.date) && (!employee.dismissalDate || employee.dismissalDate >= day.date);
      return { date: day.date, code: entry?.code || '', hours: entry?.hours ?? '', comment: entry?.comment || '', editable: employed && (access.canDaily || access.canMonthly) && (periods.find(item => item.periodId === `${period}|${payload.department || '*'}`)?.status || 'Открыт') !== 'Закрыт', inactive: !employed, differenceId: difference?.differenceId || '', severity: difference?.severity || '' };
    }) }));
    const exclusionRequests = employees.filter(item => item.timesheetIncluded === false || item.timesheetExclusionStatus === 'Требует подтверждения').map(item => ({ employeeId: item.employeeId, fullName: item.fullName, department: item.department, position: item.position, reason: item.timesheetExclusionReason, status: item.timesheetExclusionStatus, confirmedBy: item.timesheetExclusionConfirmedBy, confirmedAt: item.timesheetExclusionConfirmedAt }));
    const selectedPeriod = periods.find(item => item.periodId === `${period}|${payload.department || '*'}`);
    return {
      configured: true, period, days, departments: access.departments, selectedDepartment: payload.department || '', status: selectedPeriod?.status || 'Открыт', rows,
      differences: differences.filter(item => !item.employeeId || allowedSet.has(item.employeeId)), controls: controls.filter(item => !item.employeeId || allowedSet.has(item.employeeId)), imports: ['HR', 'HRD'].includes(actor.role) ? imports : [], codes: codes.filter(item => item.active !== false).sort((a, b) => Number(a.order) - Number(b.order)),
      excludedEmployees: employees.filter(item => item.timesheetExclusionStatus === 'Подтверждено').map(item => ({ employeeId: item.employeeId, fullName: item.fullName, reason: item.timesheetExclusionReason })), exclusionRequests, access,
      accessRows, accessEmployees: employees.map(item => ({ employeeId: item.employeeId, fullName: item.fullName, department: item.department, managerId: item.managerId, position: item.position })),
      stats: { employees: rows.length, preparedDays: rows.reduce((sum, row) => sum + row.cells.filter(cell => cell.code).length, 0), unresolved: differences.filter(item => item.status !== 'Решено' && (!item.employeeId || allowedSet.has(item.employeeId))).length, dismissedInSkud: controls.filter(item => item.status !== 'Закрыто').length, excluded: employees.filter(item => item.timesheetExclusionStatus === 'Подтверждено').length, pendingExclusions: exclusionRequests.filter(item => item.status === 'Требует подтверждения').length },
      warnings: { missingStartDate: allowedEmployees.filter(item => !item.startDate).length, fioMatching: 'Сверка выполняется по ФИО: регистр, лишние пробелы и Е/Ё не учитываются; неоднозначные совпадения требуют решения HR.' }
    };
  }

  async function saveTimesheetEntries(actor, payload) {
    const employees = await allEmployees(); const access = await timesheetAccess(actor, employees);
    if (!access.canDaily && !access.canMonthly) throw new Error('Нет прав на редактирование табеля.');
    const allowed = new Set(access.employeeIds); const codes = await db.list('timesheet_codes'); const codeMap = Object.fromEntries(codes.map(item => [item.code, item])); const existing = await db.list('timesheet_entries', { period: payload.period }); const existingMap = new Map(existing.map(item => [`${item.employeeId}|${item.date}`, item])); const updates = [];
    for (const item of payload.entries || []) {
      if (!allowed.has(item.employeeId)) throw new Error('Попытка изменить недоступного сотрудника.');
      const employee = employees.find(row => row.employeeId === item.employeeId); const key = `${item.employeeId}|${item.date}`; const old = existingMap.get(key);
      const entry = { ...old, entryId: old?.entryId || `TS-${payload.period.replace('-', '')}-${item.employeeId}-${item.date.slice(-2)}`, period: payload.period, date: item.date, employeeId: item.employeeId, fullName: employee.fullName, department: employee.department, position: employee.position, code: item.code, hours: item.hours === undefined || item.hours === '' ? (codeMap[item.code]?.defaultHours ?? '') : Number(item.hours), comment: item.comment ?? old?.comment ?? '', source: 'Веб-интерфейс', version: Number(old?.version || 0) + 1, updatedBy: actor.email, updatedAt: new Date().toISOString() };
      updates.push(entry);
    }
    await db.bulkPut('timesheet_entries', updates.map(item => ({ recordId: item.entryId, payload: item, indexes: indexFor('timesheet_entries', item) })));
    return { period: payload.period, saved: updates.length, items: updates };
  }

  async function importSkud(actor, payload) {
    await assertManage(actor);
    const { parseSkudWorkbook } = await import('./services/timesheet-xlsx.js');
    const parsed = parseSkudWorkbook(payload.base64, payload.period); const employees = await allEmployees(); const entryRows = await db.list('timesheet_entries', { period: payload.period }); const entryMap = new Map(entryRows.map(item => [`${item.employeeId}|${item.date}`, item]));
    const nameMap = new Map(); employees.forEach(employee => { [employee.fullName, employee.skudFullName].filter(Boolean).forEach(name => { const key = normalizeFullName(name); const list = nameMap.get(key) || []; list.push(employee); nameMap.set(key, list); }); });
    const imports = await db.list('skud_imports'); const importId = nextId(`SKUD-${payload.period.replace('-', '')}-`, imports, 'importId'); const differences = []; const controls = []; let matched = 0, dismissed = 0, unmatched = 0;
    parsed.rows.forEach(row => {
      const matches = nameMap.get(row.normalizedFullName) || [];
      if (matches.length !== 1) {
        unmatched += 1; differences.push({ differenceId: '', importId, period: payload.period, date: row.date, employeeId: '', fullName: row.fullName, department: '', code: '', timesheetHours: '', skudHours: row.hours, type: matches.length ? 'Неоднозначное ФИО' : 'Сотрудник не найден', severity: 'Высокая', resolution: '', comment: '', status: 'Требует решения', owner: actor.email }); return;
      }
      const employee = matches[0]; matched += 1;
      if (employee.dismissalDate && row.date > employee.dismissalDate) {
        dismissed += 1; differences.push({ differenceId: '', importId, period: payload.period, date: row.date, employeeId: employee.employeeId, fullName: employee.fullName, department: employee.department, code: '', timesheetHours: '', skudHours: row.hours, type: 'Уволен в СКУД', severity: 'Высокая', resolution: '', comment: '', status: 'Требует решения', owner: actor.email });
        controls.push({ issueId: '', fullName: employee.fullName, employeeId: employee.employeeId, department: employee.department, dismissalDate: employee.dismissalDate, lastSkudDate: row.date, issueType: 'Уволен в СКУД', severity: 'Высокая', status: 'Обнаружено', owner: actor.email, comment: '' }); return;
      }
      const entry = entryMap.get(`${employee.employeeId}|${row.date}`);
      if (!entry) differences.push({ differenceId: '', importId, period: payload.period, date: row.date, employeeId: employee.employeeId, fullName: employee.fullName, department: employee.department, code: '', timesheetHours: '', skudHours: row.hours, type: 'Нет записи табеля', severity: 'Средняя', resolution: '', comment: '', status: 'Требует решения', owner: actor.email });
      else if (entry.code && entry.code !== 'Я') differences.push({ differenceId: '', importId, period: payload.period, date: row.date, employeeId: employee.employeeId, fullName: employee.fullName, department: employee.department, code: entry.code, timesheetHours: entry.hours, skudHours: row.hours, type: 'Проход при отсутствии', severity: 'Высокая', resolution: '', comment: '', status: 'Требует решения', owner: actor.email });
      else if (row.hours !== '' && Math.abs(Number(entry.hours || 0) - Number(row.hours)) >= 0.5) differences.push({ differenceId: '', importId, period: payload.period, date: row.date, employeeId: employee.employeeId, fullName: employee.fullName, department: employee.department, code: entry.code, timesheetHours: entry.hours, skudHours: row.hours, type: 'Разница часов', severity: 'Средняя', resolution: '', comment: '', status: 'Требует решения', owner: actor.email });
    });
    const oldDifferences = await db.list('timesheet_differences'); differences.forEach(item => { item.differenceId = nextId('DIF-', oldDifferences.concat(differences.filter(row => row.differenceId)), 'differenceId', 7); });
    const oldControls = await db.list('skud_controls'); controls.forEach(item => { item.issueId = nextId('SK-', oldControls.concat(controls.filter(row => row.issueId)), 'issueId', 6); });
    await db.bulkPut('timesheet_differences', differences.map(item => ({ recordId: item.differenceId, payload: item, indexes: indexFor('timesheet_differences', item) })));
    await db.bulkPut('skud_controls', controls.map(item => ({ recordId: item.issueId, payload: item, indexes: indexFor('skud_controls', item) })));
    const imported = { importId, period: payload.period, fileName: payload.fileName, fileUrl: '', profile: parsed.profile, sourceRows: parsed.sourceRows, aggregated: parsed.rows.length, matched, differences: differences.length, dismissed, unmatched, status: 'Завершен', user: actor.email, loadedAt: todayIso() };
    await save('skud_imports', imported);
    return { importId, period: payload.period, profile: parsed.profile, matched, differences: differences.length, dismissed, unmatched, errors: [] };
  }

  async function exportTimesheet(actor, payload) {
    const data = await getTimesheet(actor, payload); if (!data.access.canExport) throw new Error('Нет прав на выгрузку Excel.');
    if (data.stats.unresolved) throw new Error('Сначала разрешите все расхождения СКУД.');
    if (data.stats.pendingExclusions) throw new Error('Сначала обработайте заявки на исключение.');
    const { buildTimesheetWorkbook } = await import('./services/timesheet-xlsx.js');
    return buildTimesheetWorkbook({ period: data.period, rows: data.rows, days: data.days, codes: data.codes });
  }

  function assertOfferAccess(actor) {
    if (!['HR', 'HRD'].includes(actor.role)) throw new Error('Реестр офферов доступен только HR и HRD.');
  }

  function normalizeMotivationItems(items) {
    return (Array.isArray(items) ? items : []).map((item, index) => ({
      itemId: clean(item.itemId) || `ITEM-${String(index + 1).padStart(3, '0')}`,
      order: index + 1,
      section: clean(item.section),
      metric: clean(item.metric),
      condition: clean(item.condition),
      reward: clean(item.reward),
      period: clean(item.period),
      comment: clean(item.comment)
    })).filter(item => item.section || item.metric || item.condition || item.reward || item.period || item.comment);
  }

  async function offerRegistry(actor) {
    assertOfferAccess(actor);
    const [offers, versions, employees] = await Promise.all([db.list('offers'), db.list('offer_motivation_versions'), allEmployees()]);
    const enriched = offers.map(offer => {
      const history = versions.filter(version => version.offerId === offer.offerId).sort((a, b) => Number(b.versionNumber || 0) - Number(a.versionNumber || 0));
      const currentVersion = history.find(version => version.versionId === offer.currentMotivationVersionId) || history[0] || null;
      return { ...offer, currentVersion, versionCount: history.length };
    }).sort((a, b) => clean(b.offerDate).localeCompare(clean(a.offerDate)) || clean(a.fullName).localeCompare(clean(b.fullName), 'ru'));
    return {
      offers: enriched,
      employees: employees.filter(employee => employee.status !== 'Уволен').map(employee => ({ employeeId: employee.employeeId, fullName: employee.fullName, department: employee.department, position: employee.position })),
      stats: {
        total: enriched.length,
        current: enriched.filter(offer => offer.status === 'Действует').length,
        accepted: enriched.filter(offer => offer.status === 'Принят').length,
        withMotivation: enriched.filter(offer => offer.currentVersion).length
      }
    };
  }

  async function saveOffer(actor, form) {
    assertOfferAccess(actor);
    const offers = await db.list('offers');
    const old = form.offerId ? offers.find(item => item.offerId === form.offerId) : null;
    const employee = form.employeeId ? (await allEmployees()).find(item => item.employeeId === form.employeeId) : null;
    const fullName = clean(form.fullName) || employee?.fullName || '';
    const department = clean(form.department) || employee?.department || '';
    const position = clean(form.position) || employee?.position || '';
    const amount = Number(String(form.amount ?? '').replace(',', '.'));
    if (!fullName || !department || !position || !clean(form.offerDate)) throw new Error('Заполните ФИО, подразделение, должность и дату оффера.');
    if (!Number.isFinite(amount) || amount < 0) throw new Error('Сумма оплаты должна быть неотрицательным числом.');
    const offerId = clean(form.offerId) || nextId(`OFF-${new Date().getFullYear()}-`, offers, 'offerId');
    const now = new Date().toISOString();
    const offer = {
      ...old,
      offerId,
      employeeId: employee?.employeeId || clean(form.employeeId),
      candidateId: clean(form.candidateId) || old?.candidateId || '',
      fullName,
      department,
      position,
      amount,
      currency: clean(form.currency) || old?.currency || 'RUB',
      offerDate: clean(form.offerDate),
      status: clean(form.status) || old?.status || 'Действует',
      comment: clean(form.comment),
      currentMotivationVersionId: old?.currentMotivationVersionId || '',
      createdAt: old?.createdAt || now,
      createdBy: old?.createdBy || actor.email,
      updatedAt: now,
      updatedBy: actor.email
    };
    await save('offers', offer);
    const changes = [];
    if (!old) changes.push({ field: 'Карточка', before: '', after: 'Оффер создан' });
    else {
      [['amount', 'Сумма оплаты'], ['department', 'Подразделение'], ['position', 'Должность'], ['status', 'Статус']].forEach(([field, label]) => {
        if (String(old[field] ?? '') !== String(offer[field] ?? '')) changes.push({ field: label, before: old[field] ?? '', after: offer[field] ?? '' });
      });
    }
    if (changes.length) {
      const events = await db.list('offer_events');
      const event = { eventId: nextId('OEV-', events, 'eventId', 7), offerId, employeeId: offer.employeeId, fullName: offer.fullName, changes, createdAt: now, createdBy: actor.email };
      await save('offer_events', event);
    }
    return offer;
  }

  async function createMotivationVersion(actor, form) {
    assertOfferAccess(actor);
    const offer = await db.get('offers', clean(form.offerId));
    if (!offer) throw new Error('Оффер не найден.');
    const allVersions = await db.list('offer_motivation_versions');
    const history = allVersions.filter(item => item.offerId === offer.offerId);
    const items = normalizeMotivationItems(form.items);
    if (!clean(form.effectiveFrom)) throw new Error('Укажите дату начала действия мотивации.');
    if (!items.length) throw new Error('Добавьте хотя бы одно условие мотивации.');
    const versionNumber = history.reduce((max, item) => Math.max(max, Number(item.versionNumber || 0)), 0) + 1;
    const now = new Date().toISOString();
    const version = {
      versionId: `${offer.offerId}-M${String(versionNumber).padStart(3, '0')}`,
      offerId: offer.offerId,
      versionNumber,
      title: clean(form.title) || `Мотивация, версия ${versionNumber}`,
      baseSalary: clean(form.baseSalary) === '' ? '' : Number(String(form.baseSalary).replace(',', '.')),
      effectiveFrom: clean(form.effectiveFrom),
      changeReason: clean(form.changeReason) || (versionNumber === 1 ? 'Первичная версия' : 'Актуализация условий'),
      notes: clean(form.notes),
      items,
      createdAt: now,
      createdBy: actor.email
    };
    if (version.baseSalary !== '' && (!Number.isFinite(version.baseSalary) || version.baseSalary < 0)) throw new Error('Оклад должен быть неотрицательным числом.');
    await save('offer_motivation_versions', version);
    offer.currentMotivationVersionId = version.versionId;
    offer.updatedAt = now;
    offer.updatedBy = actor.email;
    await save('offers', offer);
    const events = await db.list('offer_events');
    await save('offer_events', { eventId: nextId('OEV-', events, 'eventId', 7), offerId: offer.offerId, employeeId: offer.employeeId, fullName: offer.fullName, changes: [{ field: 'Мотивация', before: history.length ? `Версия ${versionNumber - 1}` : '', after: `Версия ${versionNumber}` }], createdAt: now, createdBy: actor.email });
    return version;
  }

  async function offerHistory(actor, offerId) {
    assertOfferAccess(actor);
    const offer = await db.get('offers', offerId);
    if (!offer) throw new Error('Оффер не найден.');
    const versions = (await db.list('offer_motivation_versions')).filter(item => item.offerId === offerId).sort((a, b) => Number(b.versionNumber || 0) - Number(a.versionNumber || 0));
    const events = (await db.list('offer_events')).filter(item => item.offerId === offerId).sort((a, b) => clean(b.createdAt).localeCompare(clean(a.createdAt)));
    return { offer, versions: versions.map(item => ({ ...item, current: item.versionId === offer.currentMotivationVersionId })), events };
  }

  async function dashboard(actor) {
    const employees = await visibleEmployees(actor); const recruit = await recruitment(); const surveyData = await surveys(actor); const adaptationData = await adaptation(actor); const eventRows = (await db.list('events')).filter(item => employees.some(employee => employee.employeeId === item.employeeId)); const notices = await notifications(actor);
    const working = employees.filter(item => item.status === 'Работает').length;
    return { kpi: { working, history: employees.length, dismissed: employees.filter(item => item.status === 'Уволен').length, probation: employees.filter(item => item.probationStateFromStart === 'На испытательном сроке').length, openVacancies: recruit.stats.openVacancies, openPositions: recruit.stats.openPositions, enps: surveyData.stats.enps, notifications: notices.notifications.length }, departments: Object.entries(employees.filter(item => item.status === 'Работает').reduce((map, item) => ({ ...map, [item.department]: (map[item.department] || 0) + 1 }), {})).map(([label, value]) => ({ label, value })), trend: [{ label: 'апр', value: Math.max(0, working - 2) }, { label: 'май', value: Math.max(0, working - 1) }, { label: 'июн', value: working }, { label: 'июл', value: working }], adaptationRisks: adaptationData.records.filter(item => item.risk !== 'Зеленый'), events: eventRows.slice(-8).reverse(), notifications: notices.notifications, tasks: notices.notifications };
  }

  async function handle(action, payload = {}) {
    await ensurePreviewSeed(); const actor = await currentActor();
    switch (action) {
      case 'bootstrap': return bootstrap(actor);
      case 'dashboard.get': return dashboard(actor);
      case 'notifications.get': return notifications(actor);
      case 'notifications.read': { const row = await db.get('notifications', payload.notificationId); if (row) { row.read = true; await save('notifications', row); } return { notificationId: payload.notificationId }; }
      case 'offers.get': return offerRegistry(actor);
      case 'offers.save': return saveOffer(actor, payload);
      case 'offers.history': return offerHistory(actor, clean(payload.offerId));
      case 'offers.motivation.save': return createMotivationVersion(actor, payload);
      case 'employees.list': return employeeList(actor);
      case 'employees.get': return employeeCard(actor, payload.employeeId);
      case 'employees.save': return saveEmployee(actor, payload);
      case 'employees.dismiss': return dismissEmployee(actor, payload);
      case 'documents.save': return saveSimple(actor, 'documents', payload, { idField: 'documentId', prefix: 'DOC-', employee: true, manage: true });
      case 'quality.list': return quality(actor);
      case 'quality.resolve': { const rows = await db.list('review'); const row = rows.find(item => Number(item.rowNumber) === Number(payload.rowNumber)); if (row) { row.status = 'Решено'; row.comment = payload.comment; await save('review', row); } return row || {}; }
      case 'events.list': { const visible = new Set((await visibleEmployees(actor)).map(item => item.employeeId)); return { events: (await db.list('events')).filter(item => visible.has(item.employeeId)).sort((a, b) => clean(b.date).localeCompare(clean(a.date))) }; }
      case 'events.save': return saveEvent(actor, payload);
      case 'recruitment.get': return recruitment();
      case 'vacancies.get': { const vacancy = (await db.list('vacancies')).find(item => item.vacancyId === payload.vacancyId); if (!vacancy) throw new Error('Вакансия не найдена.'); return { vacancy, candidates: (await db.list('candidates')).filter(item => item.vacancyId === payload.vacancyId) }; }
      case 'vacancies.save': return saveSimple(actor, 'vacancies', payload, { idField: 'vacancyId', prefix: `VAC-${new Date().getFullYear()}-`, manage: true, transform: async row => { const manager = (await allEmployees()).find(item => item.employeeId === row.managerId); return { ...row, managerName: manager?.fullName || '', positions: Number(row.positions || 1) }; } });
      case 'vacancies.close': { await assertManage(actor); const row = await db.get('vacancies', payload.vacancyId); if (!row) throw new Error('Вакансия не найдена.'); Object.assign(row, { closeDate: payload.closeDate, closeSource: payload.closeSource, comment: payload.comment, status: 'Закрыта' }); await save('vacancies', row); return row; }
      case 'candidates.save': return saveSimple(actor, 'candidates', payload, { idField: 'candidateId', prefix: 'CAN-', manage: true });
      case 'adaptation.list': return adaptation(actor);
      case 'adaptation.save': return saveSimple(actor, 'adaptations', payload, { idField: 'adaptId', prefix: 'ADP-', employee: true, transform: async row => ({ ...row, offsetDays: num(row.offsetDays), planDate: row.offsetDays !== '' ? await nextWorkday(addDays((await allEmployees()).find(item => item.employeeId === row.employeeId)?.startDate, row.offsetDays)) : row.planDate, pointType: row.adaptId ? (row.pointType || 'Пользовательская') : 'Пользовательская', calculationBase: 'Дата выхода' }) });
      case 'adaptation.sync': return syncAdaptation(actor);
      case 'learning.list': return learning(actor);
      case 'learning.save': return saveSimple(actor, 'learning', payload, { idField: 'learningId', prefix: 'LRN-', employee: true });
      case 'surveys.list': return surveys(actor);
      case 'surveys.save': return saveSimple(actor, 'surveys', { ...payload, anonymous: yes(payload.anonymous), enps: num(payload.enps), engagement: num(payload.engagement) }, { idField: 'responseId', prefix: 'RSP-', width: 5, employee: !yes(payload.anonymous) });
      case 'surveys.sync': return { imported: 0, skipped: 0, errors: ['В версии 2.1 внешний источник подключается через Layero Data API.'] };
      case 'timesheet.get': return getTimesheet(actor, payload);
      case 'timesheet.prepare': return prepareTimesheet(actor, payload);
      case 'timesheet.saveBatch': return saveTimesheetEntries(actor, payload);
      case 'timesheet.save': return saveTimesheetEntries(actor, { period: payload.period, entries: [payload] });
      case 'timesheet.importSkud': return importSkud(actor, payload);
      case 'timesheet.export': return exportTimesheet(actor, payload);
      case 'timesheet.period': { const id = `${payload.period}|${payload.department || '*'}`; const row = await db.get('timesheet_periods', id) || { periodId: id, period: payload.period, department: payload.department || '' }; row.status = payload.status; row.updatedBy = actor.email; await save('timesheet_periods', row); return row; }
      case 'timesheet.resolve': { const row = await db.get('timesheet_differences', payload.differenceId); if (!row) throw new Error('Расхождение не найдено.'); row.resolution = payload.resolution; row.comment = payload.comment; row.status = 'Решено'; if (payload.resolution === 'Принять СКУД' && row.employeeId) await saveTimesheetEntries(actor, { period: row.period, entries: [{ employeeId: row.employeeId, date: row.date, code: row.code || 'Я', hours: row.skudHours, comment: payload.comment }] }); await save('timesheet_differences', row); return row; }
      case 'timesheet.control': { const row = await db.get('skud_controls', payload.issueId); if (!row) throw new Error('Запись контроля не найдена.'); Object.assign(row, { status: payload.status, comment: payload.comment, owner: actor.email }); await save('skud_controls', row); return row; }
      case 'timesheet.exclusion.request': { await assertManage(actor); const employee = await db.get('employees', payload.employeeId); if (!employee) throw new Error('Сотрудник не найден.'); if (!clean(payload.reason)) throw new Error('Укажите причину исключения из табеля.'); Object.assign(employee, { timesheetIncluded: false, timesheetExclusionReason: clean(payload.reason), timesheetExclusionStatus: 'Требует подтверждения', timesheetExclusionConfirmedBy: '', timesheetExclusionConfirmedAt: '', updatedAt: new Date().toISOString() }); await save('employees', employee); return employee; }
      case 'timesheet.exclusion': { await assertManage(actor); const employee = await db.get('employees', payload.employeeId); if (!employee) throw new Error('Сотрудник не найден.'); const approved = payload.decision === 'Подтвердить'; Object.assign(employee, { timesheetIncluded: !approved, timesheetExclusionStatus: approved ? 'Подтверждено' : 'Отклонено', timesheetExclusionConfirmedBy: actor.email, timesheetExclusionConfirmedAt: todayIso() }); await save('employees', employee); return employee; }
      case 'timesheet.access.save': { await assertHrd(actor); const rows = await db.list('timesheet_access'); const old = rows.find(item => item.email === payload.originalEmail && item.department === payload.originalDepartment && item.accessScope === payload.originalScope && item.managerId === payload.originalManagerId); const row = { ...old, ...payload, accessId: old?.accessId || nextId('ACC-', rows, 'accessId'), email: clean(payload.email).toLowerCase(), employeeIds: Array.isArray(payload.employeeIds) ? payload.employeeIds : [], canDaily: yes(payload.canDaily), canMonthly: yes(payload.canMonthly), canExport: yes(payload.canExport), canClose: yes(payload.canClose), canImport: false, active: yes(payload.active) }; await save('timesheet_access', row); return row; }
      case 'directories.get': { const items = await db.list('directory_items'); return { types: unique(items.map(item => item.type)).sort((a, b) => a.localeCompare(b, 'ru')), items: items.sort((a, b) => a.type.localeCompare(b.type, 'ru') || a.value.localeCompare(b.value, 'ru')) }; }
      case 'directories.save': { await assertManage(actor); const rows = await db.list('directory_items'); const row = { ...payload, refId: payload.refId || nextId('REF-', rows, 'refId'), active: yes(payload.active) }; await save('directory_items', row); return row; }
      case 'directories.toggle': { await assertManage(actor); const row = await db.get('directory_items', payload.refId); if (!row) throw new Error('Запись справочника не найдена.'); row.active = yes(payload.active); await save('directory_items', row); return row; }
      case 'settings.get': { await assertHrd(actor); return { settings: await db.list('settings'), roles: await db.list('roles'), adaptationTemplates: await db.list('adaptation_templates'), calendar: await db.list('work_calendar') }; }
      case 'settings.save': { await assertHrd(actor); const row = { ...payload }; await save('settings', row); return row; }
      case 'roles.save': { await assertHrd(actor); const row = { ...payload, email: clean(payload.email).toLowerCase(), active: yes(payload.active) }; await save('roles', row); actorCache = null; return row; }
      case 'adaptationTemplates.save': { await assertHrd(actor); const rows = await db.list('adaptation_templates'); const row = { ...payload, templateId: payload.templateId || nextId('ATP-', rows, 'templateId'), offsetDays: Number(payload.offsetDays), active: yes(payload.active) }; await save('adaptation_templates', row); return row; }
      case 'calendar.save': { await assertHrd(actor); const row = { ...payload, active: yes(payload.active) }; if (payload.originalDate && payload.originalDate !== payload.date) await db.remove('work_calendar', payload.originalDate); await save('work_calendar', row); return row; }
      default: throw new Error(`Неизвестная операция: ${action}`);
    }
  }

  return {
    handle,
    async changePreviewActor(email) { if (db.mode !== 'preview') return; await db.setPreviewActor(email); actorCache = null; },
    async actor() { return currentActor(true); },
    db
  };
}
