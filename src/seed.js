// Только вымышленные демонстрационные данные. Рабочие HR-данные в репозиторий не включаются.
const iso = date => date.toISOString().slice(0, 10);
const addDays = (date, days) => { const result = new Date(date); result.setDate(result.getDate() + days); return result; };
const today = new Date();
const recentStart = iso(addDays(today, -33));
const recentHire = iso(addDays(today, -37));
const currentPeriod = iso(today).slice(0, 7);

const employees = [
  {
    employeeId: 'ST-0001', surname: 'Примерова', name: 'Анна', patronymic: 'Игоревна', fullName: 'Примерова Анна Игоревна',
    department: 'Отдел продаж поликарбоната', position: 'Руководитель направления', location: 'Краснодар',
    hireDate: '2024-01-15', plannedStartDate: '2024-01-22', startDate: '2024-01-22', dismissalDate: '', status: 'Работает',
    managerId: 'ST-0004', managerName: 'Демонстрационная Наталья Сергеевна', mentorId: '', mentorName: '', hrOwner: 'hr@example.test',
    employmentType: 'Основная', fte: 1, workFormat: 'Офис', hiringSource: 'Рекомендация', recruiter: 'HR', vacancyId: 'VAC-2026-0001',
    probationDays: 90, individualProbationDays: '', probationEndFromHire: '2024-04-14', probationEndFromStart: '2024-04-21', probationStateFromHire: 'Прошел', probationStateFromStart: 'Прошел', probationStatus: 'Прошел', probationResult: 'Прошел',
    documentsStatus: 'Оформлены', documentsDate: '2024-02-22', dismissalReason: '', gender: 'Женский', birthDate: '1990-05-12', phone: '', email: 'anna@example.test', criticalRole: 'Да', hrComment: 'Руководитель подразделения',
    timesheetIncluded: true, timesheetExclusionReason: '', skudFullName: 'Примерова Анна Игоревна', timesheetNumber: '0001', timesheetExclusionStatus: 'Не требуется', timesheetExclusionConfirmedBy: '', timesheetExclusionConfirmedAt: ''
  },
  {
    employeeId: 'ST-0002', surname: 'Примеров', name: 'Алексей', patronymic: 'Петрович', fullName: 'Примеров Алексей Петрович',
    department: 'Отдел продаж поликарбоната', position: 'Менеджер по продажам', location: 'Краснодар',
    hireDate: recentHire, plannedStartDate: recentStart, startDate: recentStart, dismissalDate: '', status: 'Работает',
    managerId: 'ST-0001', managerName: 'Примерова Анна Игоревна', mentorId: 'ST-0001', mentorName: 'Примерова Анна Игоревна', hrOwner: 'hr@example.test',
    employmentType: 'Основная', fte: 1, workFormat: 'Офис', hiringSource: 'hh.ru', recruiter: 'HR', vacancyId: 'VAC-2026-0001',
    probationDays: 90, individualProbationDays: '', probationEndFromHire: iso(addDays(new Date(recentHire), 90)), probationEndFromStart: iso(addDays(new Date(recentStart), 90)), probationStateFromHire: 'На испытательном сроке', probationStateFromStart: 'На испытательном сроке', probationStatus: 'На испытательном сроке', probationResult: '',
    documentsStatus: 'Не оформлены', documentsDate: '', dismissalReason: '', gender: 'Мужской', birthDate: '1994-09-18', phone: '', email: 'alex@example.test', criticalRole: 'Нет', hrComment: '',
    timesheetIncluded: true, timesheetExclusionReason: '', skudFullName: 'Примеров Алексей Петрович', timesheetNumber: '0002', timesheetExclusionStatus: 'Не требуется', timesheetExclusionConfirmedBy: '', timesheetExclusionConfirmedAt: ''
  },
  {
    employeeId: 'ST-0003', surname: 'Учебная', name: 'Елена', patronymic: 'Олеговна', fullName: 'Учебная Елена Олеговна',
    department: 'Финансовый отдел', position: 'Главный бухгалтер', location: 'Краснодар', hireDate: '2021-03-10', plannedStartDate: '2021-03-15', startDate: '2021-03-15', dismissalDate: '', status: 'Работает', managerId: 'ST-0004', managerName: 'Демонстрационная Наталья Сергеевна',
    employmentType: 'Основная', fte: 1, workFormat: 'Гибрид', hiringSource: 'Рекомендация', recruiter: 'HR', probationDays: 90, probationEndFromHire: '2021-06-08', probationEndFromStart: '2021-06-13', probationStateFromHire: 'Прошел', probationStateFromStart: 'Прошел', probationStatus: 'Прошел', probationResult: 'Прошел', documentsStatus: 'Оформлены', documentsDate: '2021-04-15', gender: 'Женский', phone: '', email: 'elena@example.test', criticalRole: 'Да', hrComment: '', timesheetIncluded: true, timesheetNumber: '0003', timesheetExclusionStatus: 'Не требуется', skudFullName: 'Учебная Елена Олеговна'
  },
  {
    employeeId: 'ST-0004', surname: 'Демонстрационная', name: 'Наталья', patronymic: 'Сергеевна', fullName: 'Демонстрационная Наталья Сергеевна',
    department: 'Руководство', position: 'Исполнительный директор', location: 'Краснодар', hireDate: '2019-02-01', plannedStartDate: '2019-02-01', startDate: '2019-02-01', dismissalDate: '', status: 'Работает', managerId: '', managerName: '', employmentType: 'Основная', fte: 1, workFormat: 'Офис', hiringSource: '', recruiter: '', probationDays: 90, probationEndFromHire: '2019-05-02', probationEndFromStart: '2019-05-02', probationStateFromHire: 'Прошел', probationStateFromStart: 'Прошел', probationStatus: 'Прошел', probationResult: 'Прошел', documentsStatus: 'Оформлены', documentsDate: '2019-03-01', gender: 'Женский', phone: '', email: 'director@example.test', criticalRole: 'Да', hrComment: '', timesheetIncluded: true, timesheetNumber: '0004', timesheetExclusionStatus: 'Не требуется', skudFullName: 'Демонстрационная Наталья Сергеевна'
  },
  {
    employeeId: 'ST-0099', surname: 'Архивный', name: 'Сотрудник', patronymic: '', fullName: 'Архивный Сотрудник', department: 'Отдел продаж поликарбоната', position: 'Менеджер', location: 'Краснодар', hireDate: '2025-01-10', plannedStartDate: '2025-01-13', startDate: '2025-01-13', dismissalDate: iso(addDays(today, -20)), status: 'Уволен', managerId: 'ST-0001', managerName: 'Примерова Анна Игоревна', employmentType: 'Основная', fte: 1, workFormat: 'Офис', probationDays: 90, probationEndFromHire: '2025-04-10', probationEndFromStart: '2025-04-13', probationStateFromHire: 'Прошел', probationStateFromStart: 'Прошел', probationStatus: 'Прошел', dismissalReason: 'По собственному желанию', documentsStatus: 'Оформлены', gender: 'Мужской', phone: '', email: '', timesheetIncluded: true, timesheetNumber: '0099', timesheetExclusionStatus: 'Не требуется', skudFullName: 'Архивный Сотрудник'
  },
  {
    employeeId: 'ST-0100', surname: 'Демо', name: 'Собственник', patronymic: '', fullName: 'Демо Собственник', department: 'Руководство', position: 'Собственник', location: 'Краснодар', hireDate: '2015-01-01', plannedStartDate: '2015-01-01', startDate: '2015-01-01', dismissalDate: '', status: 'Работает', managerId: '', managerName: '', employmentType: 'Основная', fte: 1, workFormat: 'Офис', probationDays: 0, probationEndFromHire: '', probationEndFromStart: '', probationStateFromHire: '', probationStateFromStart: '', probationStatus: 'Нет данных', documentsStatus: 'Не требуется', gender: 'Мужской', phone: '', email: '', criticalRole: 'Да', hrComment: '', timesheetIncluded: false, timesheetExclusionReason: 'Не ведется учет рабочего времени', timesheetNumber: '0100', timesheetExclusionStatus: 'Подтверждено', timesheetExclusionConfirmedBy: 'hrd@example.test', timesheetExclusionConfirmedAt: iso(today), skudFullName: 'Демо Собственник'
  }
];

const directoryValues = {
  'Подразделение': ['Отдел продаж поликарбоната', 'Финансовый отдел', 'Руководство'],
  'Должность': ['Руководитель направления', 'Менеджер по продажам', 'Главный бухгалтер', 'Исполнительный директор', 'Собственник'],
  'Локация': ['Краснодар', 'Ростов-на-Дону'],
  'Статус сотрудника': ['Работает', 'Уволен', 'Декрет'],
  'Статус ИС': ['На испытательном сроке', 'Прошел', 'Не прошел', 'Нет данных'],
  'Пол': ['Мужской', 'Женский'],
  'Тип занятости': ['Основная', 'Совместительство'],
  'Формат работы': ['Офис', 'Гибрид', 'Удаленно'],
  'Источник найма': ['hh.ru', 'Рекомендация', 'Сайт компании'],
  'Приоритет вакансии': ['Высокий', 'Средний', 'Низкий'],
  'Статус вакансии': ['Открыта', 'Приостановлена', 'Закрыта'],
  'Статус кандидата': ['Новый', 'Скрининг', 'Интервью', 'Оффер', 'Вышел', 'Отказ'],
  'Контрольная точка': ['7 дней', '30 дней', '60 дней', '90 дней'],
  'Риск': ['Зеленый', 'Желтый', 'Красный'],
  'Программа обучения': ['Вводный курс', 'Охрана труда'],
  'Статус обучения': ['Назначено', 'В процессе', 'Завершено'],
  'Тип обучения': ['Внутреннее', 'Внешнее', 'Онлайн'],
  'Тип документа': ['Комплект документов после 1 месяца', 'Дополнительное соглашение'],
  'Статус документа': ['К оформлению', 'Оформлены', 'Не требуется'],
  'Тип дня': ['Рабочий', 'Выходной', 'Праздник'],
  'Тип опроса': ['eNPS', 'Вовлеченность', 'Пульс-опрос', 'Адаптация'],
  'Причина увольнения': ['По собственному желанию', 'Соглашение сторон', 'Не прошел испытательный срок'],
  'Инициатор увольнения': ['Сотрудник', 'Компания'],
  'Тип кадрового события': ['Прием', 'Перевод', 'Повышение', 'Смена руководителя', 'Увольнение']
};

const records = {
  employees,
  roles: [
    { email: 'hrd@example.test', role: 'HRD', employeeId: '', active: true, comment: 'Администратор предпросмотра' },
    { email: 'hr@example.test', role: 'HR', employeeId: '', active: true, comment: 'HR' },
    { email: 'manager@example.test', role: 'Руководитель', employeeId: 'ST-0001', active: true, comment: 'Проверка доступа руководителя' },
    { email: 'timesheet@example.test', role: 'Табельщик', employeeId: '', active: true, comment: 'Табельщик подразделения' }
  ],
  settings: [
    { parameter: 'Версия системы', value: '2.1.0', comment: 'Не редактировать', usage: 'Система' },
    { parameter: 'Цель eNPS', value: '40', comment: 'Зеленая зона', usage: 'Опросы' },
    { parameter: 'Испытательный срок по умолчанию, дней', value: '90', comment: 'Если для должности не задан иной срок', usage: 'Сотрудники' },
    { parameter: 'Порог расхождения часов', value: '0.5', comment: 'Минимальная разница для сверки СКУД', usage: 'Табель' }
  ],
  directory_items: Object.entries(directoryValues).flatMap(([type, values]) => values.map((value, index) => ({ refId: `REF-${type.slice(0, 2).toUpperCase()}-${String(index + 1).padStart(3, '0')}`, type, value, parent: '', active: true, comment: '' }))),
  events: [{ eventId: 'EV-0001', date: recentStart, employeeId: 'ST-0002', fullName: 'Примеров Алексей Петрович', type: 'Прием', departmentBefore: '', departmentAfter: 'Отдел продаж поликарбоната', positionBefore: '', positionAfter: 'Менеджер по продажам', fteBefore: '', fteAfter: 1, reason: 'Закрытие вакансии', document: 'Приказ', comment: '' }],
  vacancies: [{ vacancyId: 'VAC-2026-0001', openDate: iso(addDays(today, -48)), position: 'Менеджер по продажам', department: 'Отдел продаж поликарбоната', location: 'Краснодар', managerName: 'Примерова Анна Игоревна', managerId: 'ST-0001', recruiter: 'HR', reason: 'Рост команды', positions: 2, priority: 'Высокий', planCloseDate: iso(addDays(today, -5)), status: 'Открыта', closeDate: '', daysOpen: 48, overdueDays: 5, timeToFill: '', candidates: 1, comment: 'Срочная вакансия' }],
  candidates: [{ candidateId: 'CAN-0001', vacancyId: 'VAC-2026-0001', addedDate: iso(addDays(today, -12)), fullName: 'Демо Кандидат', contact: 'petr@example.test', source: 'hh.ru', screening: 'Да', hrInterview: 'Да', interviewDate: iso(addDays(today, -8)), offer: 'Нет', offerDate: '', started: 'Нет', startDate: '', status: 'Интервью', rejectionReason: '', comment: '', recruiter: 'HR' }],
  adaptations: [{ adaptId: 'ADP-0001', employeeId: 'ST-0002', fullName: 'Примеров Алексей Петрович', checkpoint: '30 дней', offsetDays: 30, pointType: 'Автоматическая', calculationBase: 'Дата выхода', planDate: iso(addDays(new Date(recentStart), 30)), actualDate: '', employeeScore: 4, managerScore: 3, taskScore: 3, teamScore: 4, learningScore: 3, risk: 'Желтый', problem: 'Нужна помощь с процессом', action: 'Встреча с руководителем', owner: 'HR', actionDue: iso(addDays(today, 2)), actionStatus: 'Запланировано', hrComment: '' }],
  adaptation_templates: [7, 30, 60, 90].map((days, index) => ({ templateId: `ATP-${String(index + 1).padStart(4, '0')}`, name: `${days} дней`, offsetDays: days, department: '', position: '', employmentType: '', owner: days === 30 ? 'HR и руководитель' : 'HR', active: true, comment: '' })),
  learning: [{ learningId: 'LRN-0001', employeeId: 'ST-0002', fullName: 'Примеров Алексей Петрович', program: 'Вводный курс', type: 'Внутреннее', assignedDate: recentStart, deadline: iso(addDays(new Date(recentStart), 21)), completionDate: '', status: 'В процессе', testResult: '', hours: 4, mandatory: true, comment: '', owner: 'HR' }],
  surveys: [{ responseId: 'RSP-00001', date: iso(addDays(today, -9)), surveyId: `SUR-${currentPeriod.replace('-', '')}`, type: 'eNPS', employeeId: 'ST-0001', fullName: 'Примерова Анна Игоревна', department: 'Отдел продаж поликарбоната', tenurePoint: '12 месяцев', enps: 9, engagement: 4.5, managerScore: 4, teamScore: 5, conditions: 4, workload: 3, development: 4, risk: 'Зеленый', employeeComment: '', hrComment: '', source: 'Веб-форма', anonymous: false }],
  documents: [{ documentId: 'DOC-0001', employeeId: 'ST-0002', fullName: 'Примеров Алексей Петрович', type: 'Комплект документов после 1 месяца', details: '', planDate: iso(addDays(new Date(recentStart), 30)), completionDate: '', status: 'К оформлению', fileUrl: '', comment: '', owner: 'HR' }],
  notifications: [{ notificationId: 'NTF-00001', email: 'hrd@example.test', type: 'documents', typeLabel: 'Документы', severity: 'medium', title: 'Оформить документы после 1 месяца', subtitle: 'Примеров Алексей Петрович', dueDate: iso(addDays(new Date(recentStart), 30)), page: 'employee', id: 'ST-0002', read: false }],
  work_calendar: [],
  review: [{ reviewId: 'REV-0001', rowNumber: 2, label: 'Пример спорной записи', problem: 'Требуется проверить исходные данные', check: 'Уточнить статус сотрудника', source: 'Импорт', employeeId: '', status: 'Открыто', comment: '' }],
  timesheet_codes: [
    { code: 'Я', name: 'Явка', category: 'Явка', color: '#FFF2CC', defaultHours: 8, requiresDocument: false, active: true, order: 10 },
    { code: 'В', name: 'Выходной', category: 'Выходной', color: '#FFFFFF', defaultHours: 0, requiresDocument: false, active: true, order: 20 },
    { code: 'Б', name: 'Больничный', category: 'Отсутствие', color: '#00B0F0', defaultHours: 0, requiresDocument: true, active: true, order: 30 },
    { code: 'У', name: 'Учебный отпуск', category: 'Отсутствие', color: '#C6E0B4', defaultHours: 0, requiresDocument: true, active: true, order: 40 },
    { code: 'ОТ', name: 'Ежегодный отпуск', category: 'Отсутствие', color: '#FCE4D6', defaultHours: 0, requiresDocument: true, active: true, order: 50 },
    { code: 'ДО', name: 'Отпуск без сохранения', category: 'Отсутствие', color: '#F4B183', defaultHours: 0, requiresDocument: true, active: true, order: 60 },
    { code: 'И', name: 'Иное отсутствие', category: 'Отсутствие', color: '#FFE699', defaultHours: 0, requiresDocument: false, active: true, order: 70 }
  ],
  timesheet_access: [{ accessId: 'ACC-0001', email: 'timesheet@example.test', timesheetRole: 'Табельщик подразделения', department: 'Отдел продаж поликарбоната', accessScope: 'Подразделение', managerId: '', employeeIds: [], canDaily: true, canMonthly: true, canImport: false, canExport: false, canClose: false, active: true, comment: '' }],
  timesheet_entries: [],
  timesheet_periods: [],
  skud_imports: [],
  timesheet_differences: [],
  skud_controls: [],
  offers: [
    { offerId: 'OFF-2026-0001', employeeId: 'ST-0002', candidateId: '', fullName: 'Примеров Алексей Петрович', department: 'Отдел продаж поликарбоната', position: 'Менеджер по продажам', amount: 80000, currency: 'RUB', offerDate: recentHire, status: 'Принят', comment: 'Демонстрационная карточка', currentMotivationVersionId: 'OFF-2026-0001-M002', createdAt: `${recentHire}T09:00:00.000Z`, createdBy: 'hr@example.test', updatedAt: `${recentStart}T09:00:00.000Z`, updatedBy: 'hrd@example.test' }
  ],
  offer_motivation_versions: [
    { versionId: 'OFF-2026-0001-M001', offerId: 'OFF-2026-0001', versionNumber: 1, title: 'Первичная мотивация', baseSalary: 60000, effectiveFrom: recentHire, changeReason: 'Первичная версия', notes: 'Сохранена для демонстрации истории.', items: [
      { itemId: 'ITEM-001', order: 1, section: 'Продажи', metric: 'Выполнение плана оборота', condition: '100% плана', reward: '10% от маржинальной прибыли', period: 'Месяц', comment: '' },
      { itemId: 'ITEM-002', order: 2, section: 'Новые клиенты', metric: 'Новый активный клиент', condition: 'Первая оплаченная отгрузка', reward: '3 000 ₽', period: 'За факт', comment: '' }
    ], createdAt: `${recentHire}T09:05:00.000Z`, createdBy: 'hr@example.test' },
    { versionId: 'OFF-2026-0001-M002', offerId: 'OFF-2026-0001', versionNumber: 2, title: 'Мотивация после согласования', baseSalary: 65000, effectiveFrom: recentStart, changeReason: 'Согласован повышенный оклад и квартальный KPI', notes: '', items: [
      { itemId: 'ITEM-001', order: 1, section: 'Продажи', metric: 'Выполнение плана оборота', condition: '90–99% / 100–109% / от 110%', reward: '5% / 10% / 15% от маржинальной прибыли', period: 'Месяц', comment: 'Ступенчатая шкала' },
      { itemId: 'ITEM-002', order: 2, section: 'KPI', metric: 'Качество клиентской базы', condition: 'Нет просроченных задач и заполнена CRM', reward: '10 000 ₽', period: 'Квартал', comment: '' }
    ], createdAt: `${recentStart}T09:00:00.000Z`, createdBy: 'hrd@example.test' }
  ],
  offer_events: []
};

export const SEED_VERSION = '2.1.0';
export const previewSeed = records;
