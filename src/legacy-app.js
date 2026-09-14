(() => {
  'use strict';

  const NAV_ITEMS = [
    { page: 'hr', label: 'HR Pulse', icon: '⌂', module: 'hr' },
    { page: 'offers', label: 'Реестр офферов', icon: '₽', module: 'offers' },
    { page: 'timesheet', label: 'Табель', icon: '▦', module: 'timesheet' },
    { page: 'employees', label: 'Сотрудники', icon: '◉', module: 'employees' },
    { page: 'quality', label: 'Контроль данных', icon: '✓', module: 'quality' },
    { page: 'recruitment', label: 'Подбор персонала', icon: '⌕', module: 'recruitment' },
    { page: 'adaptation', label: 'Адаптация', icon: '▣', module: 'adaptation' },
    { page: 'learning', label: 'Обучение', icon: '◇', module: 'learning' },
    { page: 'surveys', label: 'Опросы', icon: '✎', module: 'surveys' },
    { page: 'events', label: 'Кадровые события', icon: '⇄', module: 'events' },
    { page: 'directories', label: 'Справочники', icon: '◫', module: 'directories' },
    { page: 'settings', label: 'Настройки', icon: '⚙', module: 'settings' }
  ];

  const MODULE_FOR_PAGE = {
    hr: 'hr', offers: 'offers', employees: 'employees', employee: 'employees', quality: 'quality',
    recruitment: 'recruitment', vacancy: 'recruitment', adaptation: 'adaptation',
    learning: 'learning', surveys: 'surveys', events: 'events', timesheet: 'timesheet', directories: 'directories', settings: 'settings'
  };

  const DIRECTORY_GROUPS = [
    { id: 'structure', label: 'Структура', types: ['Подразделение', 'Должность', 'Локация'] },
    { id: 'employment', label: 'Сотрудники', types: ['Статус сотрудника', 'Статус ИС', 'Пол', 'Тип занятости', 'Формат работы'] },
    { id: 'recruitment', label: 'Подбор', types: ['Источник найма', 'Приоритет вакансии', 'Статус вакансии', 'Статус кандидата'] },
    { id: 'adaptation', label: 'Адаптация и обучение', types: ['Контрольная точка', 'Риск', 'Программа обучения', 'Статус обучения', 'Тип обучения'] },
    { id: 'documents', label: 'Документы', types: ['Тип документа', 'Статус документа'] },
    { id: 'calendar', label: 'Календарь', types: ['Тип дня'] },
    { id: 'surveys', label: 'Опросы', types: ['Тип опроса'] },
    { id: 'termination', label: 'Увольнение', types: ['Причина увольнения', 'Инициатор увольнения'] },
    { id: 'events', label: 'Кадровые события', types: ['Тип кадрового события'] }
  ];

  const state = {
    bootstrap: null,
    refs: {},
    permissions: {},
    actor: {},
    route: { page: 'hr', id: '' },
    cache: {},
    employeeTab: 'profile',
    directoryGroup: 'structure',
    timesheetPeriod: '',
    timesheetDepartment: '',
    timesheetTab: 'calendar',
    timesheetEdits: {},
    offerStatus: ''
  };

  const $ = selector => document.querySelector(selector);
  const pageRoot = $('#pageRoot');
  const alertRoot = $('#globalAlert');
  const modalRoot = $('#modalRoot');
  const toastRoot = $('#toastRoot');

  function api(action, payload = {}) {
    if (typeof window.HR_API !== 'function') {
      return Promise.reject(new Error('Слой данных HR-системы не инициализирован.'));
    }
    return Promise.resolve(window.HR_API(action, payload)).then(response => {
      if (response && response.ok === false) throw new Error(response.message || 'Ошибка');
      return response && Object.prototype.hasOwnProperty.call(response, 'data') ? response.data : response;
    });
  }

  async function bootstrap() {
    setConnection('Подключение…', '');
    try {
      const data = await api('bootstrap');
      state.bootstrap = data;
      state.refs = data.references || {};
      state.permissions = data.permissions || {};
      state.actor = data.actor || {};
      renderActor();
      renderNav();
      updateNotificationBadge(Number(data.notificationCount || 0));
      setConnection(window.HR_RUNTIME_LABEL || 'База данных подключена', 'connected');
      clearAlert();
      const url = new URL(window.location.href);
      const page = url.searchParams.get('page') || (window.HR_INITIAL_ROUTE && window.HR_INITIAL_ROUTE.page) || 'hr';
      const id = url.searchParams.get('id') || (window.HR_INITIAL_ROUTE && window.HR_INITIAL_ROUTE.id) || '';
      navigate(page, id, { replace: true });
      if (data.actor && data.actor.bootstrapAccess) toast('Таблица ролей пуста: текущему пользователю временно выдана роль HRD.', 'success', 7000);
    } catch (error) {
      setConnection('Нет подключения', 'error');
      showFatal(error);
    }
  }

  function renderActor() {
    const role = state.actor.role || 'HR';
    const initials = role === 'Руководитель' ? 'РК' : role.slice(0, 3);
    $('#actorCard').innerHTML = `<div class="avatar">${escapeHtml(initials)}</div><div><strong>${escapeHtml(role)}</strong><small title="${escapeAttr(state.actor.email || '')}">${escapeHtml(state.actor.email || 'Пользователь')}</small></div>`;
  }

  function updateNotificationBadge(count) {
    const button = $('#notificationButton');
    const badge = $('#notificationCount');
    if (!button || !badge) return;
    badge.textContent = String(count || 0);
    button.hidden = false;
    button.classList.toggle('has-items', Number(count || 0) > 0);
  }

  async function openNotifications() {
    const data = await api('notifications.get');
    const items = data.notifications || [];
    updateNotificationBadge(items.length);
    const content = items.length ? `<div class="notification-list">${items.map(item => `<div class="notification-item ${escapeAttr(item.severity || '')}"><span class="notification-icon">${item.type === 'documents' ? '▣' : '⌛'}</span><span><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.subtitle)} · ${dateRu(item.dueDate)}</small></span><span class="toolbar-group">${hasModule(item.page) ? `<button type="button" class="btn ghost small" data-nav="${escapeAttr(item.page)}" data-id="${escapeAttr(item.id)}">Открыть</button>` : '<span class="badge gray">экран неактивен</span>'}<button type="button" class="btn small" data-action="notification:read" data-id="${escapeAttr(item.notificationId)}">Прочитано</button></span></div>`).join('')}</div>` : `<div class="empty-state"><strong>Новых уведомлений нет</strong>Задачи по документам и встречам появятся здесь автоматически.</div>`;
    openModal('Уведомления', content, 'small');
  }

  function renderNav() {
    const allowed = state.permissions.modules || [];
    const activeModules = state.permissions.activeModules || ['hr', 'offers', 'timesheet'];
    $('#mainNav').innerHTML = NAV_ITEMS.map(item => {
      const enabled = activeModules.includes(item.module) && allowed.includes(item.module);
      return `<button type="button" class="nav-button ${enabled ? '' : 'disabled'}" ${enabled ? `data-nav="${item.page}"` : 'disabled'} title="${enabled ? escapeAttr(item.label) : 'Модуль временно неактивен'}">
        <span class="nav-icon">${item.icon}</span><span>${escapeHtml(item.label)}</span><span class="nav-badge" data-nav-badge="${item.page}">${enabled ? '' : '·'}</span>
      </button>`;
    }).join('');
    updateNavState();
  }

  function setConnection(text, className) {
    const badge = $('#connectionBadge');
    badge.className = `connection-badge ${className || ''}`;
    badge.innerHTML = `<span class="status-dot"></span><span>${escapeHtml(text)}</span>`;
  }

  function hasModule(page) {
    const module = MODULE_FOR_PAGE[page] || page;
    return (state.permissions.modules || []).includes(module);
  }

  function navigate(page, id = '', options = {}) {
    const safePage = MODULE_FOR_PAGE[page] ? page : 'hr';
    const targetPage = hasModule(safePage) ? safePage : ((state.permissions.modules || [])[0] || 'hr');
    state.route = { page: targetPage, id: id || '' };
    const url = new URL(window.location.href);
    url.searchParams.set('page', targetPage);
    if (id) url.searchParams.set('id', id); else url.searchParams.delete('id');
    if (!options.fromPop) history[options.replace ? 'replaceState' : 'pushState']({ page: targetPage, id }, '', url);
    updateNavState();
    closeSidebar();
    renderRoute();
  }

  function updateNavState() {
    const active = MODULE_FOR_PAGE[state.route.page] || state.route.page;
    document.querySelectorAll('.nav-button').forEach(button => button.classList.toggle('active', button.dataset.nav === active));
  }

  async function renderRoute() {
    clearAlert();
    showPageLoading();
    try {
      switch (state.route.page) {
        case 'hr': await renderDashboard(); break;
        case 'offers': await renderOffers(); break;
        case 'employees': await renderEmployees(); break;
        case 'employee': await renderEmployeeCard(state.route.id); break;
        case 'quality': await renderQuality(); break;
        case 'events': await renderEvents(); break;
        case 'recruitment': await renderRecruitment(); break;
        case 'vacancy': await renderVacancyCard(state.route.id); break;
        case 'adaptation': await renderAdaptation(); break;
        case 'learning': await renderLearning(); break;
        case 'surveys': await renderSurveys(); break;
        case 'timesheet': await renderTimesheet(); break;
        case 'directories': await renderDirectories(); break;
        case 'settings': await renderSettings(); break;
        default: navigate('hr', '', { replace: true });
      }
    } catch (error) {
      renderPageError(error);
    }
  }

  function showPageLoading() {
    pageRoot.innerHTML = `<div class="loading-state"><div><div class="spinner" style="margin:0 auto 12px"></div><strong>Загружаем данны…</strong></div></div>`;
  }

  function showFatal(error) {
    showAlert(errorMessage(error));
    pageRoot.innerHTML = `<div class="panel"><div class="empty-state"><strong>Не удалось запустить HR-систему</strong><p>${escapeHtml(errorMessage(error))}</p><button class="btn primary" type="button" data-action="app:retry">Повторить</button></div></div>`;
  }

  function renderPageError(error) {
    showAlert(errorMessage(error));
    pageRoot.innerHTML = `<div class="panel"><div class="empty-state"><strong>Экран не загружен</strong><p>${escapeHtml(errorMessage(error))}</p><button class="btn primary" type="button" data-action="page:retry">Повторить</button></div></div>`;
  }

  function pageHead(title, subtitle, actions = '', crumbs = '') {
    return `${crumbs ? `<div class="breadcrumbs">${crumbs}</div>` : ''}<div class="page-head"><div><h1>${escapeHtml(title)}</h1><p>${escapeHtml(subtitle)}</p></div><div class="page-actions">${actions}</div></div>`;
  }

  function statCard(label, value, icon, note = '', accent = false) {
    return `<div class="stat-card ${accent ? 'accent' : ''}"><span class="stat-icon">${icon}</span><div><small>${escapeHtml(label)}</small><strong>${escapeHtml(value)}</strong></div>${note ? `<em>${escapeHtml(note)}</em>` : ''}</div>`;
  }

  async function renderDashboard() {
    const data = await api('dashboard.get');
    state.cache.dashboard = data;
    const k = data.kpi || {};
    updateNotificationBadge(Number(k.notifications || 0));
    pageRoot.innerHTML = `
      ${pageHead('HR Pulse', 'Ключевые показатели по персоналу на сегодня')}
      <div class="stats-grid">
        ${statCard('Текущая численность', k.working || 0, '◉', 'сотрудников', true)}
        ${statCard('Всего в истории', k.history || 0, '◉', 'записей')}
        ${statCard('Уволено', k.dismissed || 0, '↪', 'сотрудников', true)}
        ${statCard('На испытательном сроке', k.probation || 0, '⌛', 'сотрудников')}
        ${statCard('Открытые вакансии', k.openVacancies || 0, '▣', `${k.openPositions || 0} ставок`, true)}
        ${statCard('eNPS', k.enps || 0, '↗', 'промоутеры − критики')}
      </div>
      <div class="dashboard-grid">
        <section class="panel span-2"><div class="panel-head"><h2>Уведомления</h2><span class="badge ${Number(k.notifications || 0) ? 'red' : 'green'}">${Number(k.notifications || 0)}</span></div><div class="panel-body">${renderNotificationList(data.notifications || [])}</div></section>
        <section class="panel"><div class="panel-head"><h2>Численность по подразделениям</h2></div><div class="panel-body">${renderBarList(data.departments || [])}</div></section>
        <section class="panel"><div class="panel-head"><h2>Динамика численности</h2></div><div class="panel-body">${renderTrend(data.trend || [])}</div></section>
        <section class="panel"><div class="panel-head"><h2>Адаптация: риски</h2><span class="badge gray">модуль неактивен</span></div><div class="panel-body">${renderRiskList(data.adaptationRisks || [])}</div></section>
        <section class="panel"><div class="panel-head"><h2>Быстрые действия</h2></div><div class="panel-body"><div class="quick-actions">
          ${state.permissions.canManageOffers ? `<button class="quick-action" data-action="offer:new"><span class="qa-icon">₽</span><span>Новый оффер</span></button>` : ''}
          <button class="quick-action" data-nav="timesheet"><span class="qa-icon">▦</span><span>Открыть табель</span></button>
        </div></div></section>
        <section class="panel"><div class="panel-head"><h2>Последние кадровые события</h2><span class="badge gray">модуль неактивен</span></div><div class="panel-body">${renderEventList(data.events || [])}</div></section>
        <section class="panel"><div class="panel-head"><h2>Ближайшие задачи</h2></div><div class="panel-body">${renderTaskList(data.tasks || [])}</div></section>
      </div>`;
  }

  function renderBarList(items) {
    if (!items.length) return emptyInline('Нет данных по подразделениям');
    const max = Math.max(...items.map(i => Number(i.value || 0)), 1);
    return `<div class="bar-list">${items.slice(0, 8).map(item => `<div class="bar-row"><span class="bar-label" title="${escapeAttr(item.label)}">${escapeHtml(item.label)}</span><div class="bar-track"><div class="bar-fill" style="width:${Math.max(3, Number(item.value || 0) / max * 100)}%"></div></div><span class="bar-value">${escapeHtml(item.value)}</span></div>`).join('')}</div>`;
  }

  function renderTrend(items) {
    if (!items.length) return emptyInline('Нет данных для динамики');
    const values = items.map(i => Number(i.value || 0));
    const min = Math.min(...values), max = Math.max(...values, min + 1);
    const points = values.map((value, index) => `${index * (100 / Math.max(values.length - 1, 1))},${88 - ((value - min) / (max - min || 1) * 64)}`).join(' ');
    return `<svg class="trend-svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-label="Динамика"><defs><linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ed1c24" stop-opacity=".28"/><stop offset="1" stop-color="#ed1c24" stop-opacity="0"/></linearGradient></defs><polygon points="0,94 ${points} 100,94" fill="url(#trendFill)"/><polyline points="${points}" fill="none" stroke="#ed1c24" stroke-width="2" vector-effect="non-scaling-stroke"/>${values.map((value, index) => { const x = index * (100 / Math.max(values.length - 1, 1)); const y = 88 - ((value - min) / (max - min || 1) * 64); return `<circle cx="${x}" cy="${y}" r="2" fill="#ed1c24" vector-effect="non-scaling-stroke"><title>${value}</title></circle>`; }).join('')}</svg><div class="trend-labels">${items.map(i => `<span>${escapeHtml(i.label)}</span>`).join('')}</div>`;
  }

  function renderRiskList(items) {
    if (!items.length) return emptyInline('Активных рисков нет');
    return `<div class="list">${items.map(item => `<div class="list-row"><span class="list-dot ${item.risk === 'Красный' ? 'red' : 'orange'}"></span><div><strong>${escapeHtml(item.fullName)}</strong><small>${escapeHtml(item.checkpoint)}</small></div>${statusBadge(item.risk)}</div>`).join('')}</div>`;
  }

  function renderEventList(items) {
    if (!items.length) return emptyInline('Кадровых событий пока нет');
    return `<div class="list">${items.map(item => `<div class="list-row"><span class="list-dot ${item.type === 'Увольнение' ? 'red' : ''}"></span><div><strong>${escapeHtml(item.type)}</strong><small>${escapeHtml(item.fullName)} · ${dateRu(item.date)}</small></div><span class="badge gray">архив</span></div>`).join('')}</div>`;
  }

  function renderTaskList(items) {
    if (!items.length) return emptyInline('Ближайших задач нет');
    return `<div class="list">${items.map(item => `<div class="list-row"><span class="list-dot ${dateValue(item.dueDate) < startToday() ? 'red' : 'orange'}"></span><div><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.subtitle)} · ${dateRu(item.dueDate)}</small></div>${hasModule(item.page) ? `<button class="btn ghost small" data-nav="${escapeAttr(item.page)}" data-id="${escapeAttr(item.id)}">→</button>` : '<span class="badge gray">экран неактивен</span>'}</div>`).join('')}</div>`;
  }

  function renderNotificationList(items) {
    if (!items.length) return emptyInline('Нет уведомлений, требующих внимания');
    return `<div class="list">${items.slice(0, 8).map(item => `<div class="list-row"><span class="list-dot ${item.severity === 'high' ? 'red' : 'orange'}"></span><div><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.subtitle)} · ${dateRu(item.dueDate)}</small></div>${hasModule(item.page) ? `<button class="btn ghost small" data-nav="${escapeAttr(item.page)}" data-id="${escapeAttr(item.id)}">→</button>` : '<span class="badge gray">экран неактивен</span>'}</div>`).join('')}</div>`;
  }

  async function getEmployeeList(force = false) {
    if (!force && state.cache.employeeList) return state.cache.employeeList;
    const data = await api('employees.list');
    state.cache.employeeList = data;
    return data;
  }

  async function renderOffers() {
    const data = await api('offers.get');
    state.cache.offers = data;
    const filtered = (data.offers || []).filter(offer => !state.offerStatus || offer.status === state.offerStatus);
    const statusOptions = ['Действует', 'Принят', 'Отклонен', 'Отозван', 'Архив'];
    pageRoot.innerHTML = `
      ${pageHead('Реестр офферов', 'Текущие условия и полная история версий мотивации', `<button class="btn primary" type="button" data-action="offer:new">＋ Новый оффер</button>`)}
      <div class="stats-grid compact-grid">
        ${statCard('Всего офферов', data.stats.total || 0, '₽')}
        ${statCard('Действуют', data.stats.current || 0, '●')}
        ${statCard('Приняты', data.stats.accepted || 0, '✓')}
        ${statCard('С мотивацией', data.stats.withMotivation || 0, '≡')}
      </div>
      <section class="panel">
        <div class="panel-head offer-toolbar"><div><h2>Карточки офферов</h2><small>Сумму можно изменить прямо в строке; мотивация сохраняется новой версией.</small></div><label class="inline-filter">Статус<select class="form-control" id="offerStatusFilter"><option value="">Все</option>${options(statusOptions, state.offerStatus)}</select></label></div>
        <div class="table-wrap">${filtered.length ? `<table class="data-table offer-table"><thead><tr><th>ФИО</th><th>Подразделение</th><th>Должность</th><th>Текущая сумма</th><th>Дата оффера</th><th>Мотивация</th><th>Статус</th><th></th></tr></thead><tbody>${filtered.map(offer => {
          const version = offer.currentVersion;
          return `<tr data-offer-row="${escapeAttr(offer.offerId)}"><td class="cell-title">${escapeHtml(offer.fullName)}<small>${escapeHtml(offer.offerId)}</small></td><td>${escapeHtml(offer.department)}</td><td>${escapeHtml(offer.position)}</td><td><div class="offer-amount-editor"><input class="form-control offer-amount-input" type="number" min="0" step="100" value="${escapeAttr(offer.amount)}" aria-label="Сумма оффера ${escapeAttr(offer.fullName)}"><span>₽</span><button class="btn small" type="button" data-action="offer:amount" data-id="${escapeAttr(offer.offerId)}">Сохранить</button></div></td><td>${dateRu(offer.offerDate)}</td><td>${version ? `<strong>${escapeHtml(version.title)}</strong><small>Версия ${escapeHtml(version.versionNumber)} · ${escapeHtml((version.items || []).length)} условий</small>` : '<span class="badge orange">Не заполнена</span>'}</td><td>${statusBadge(offer.status)}</td><td><div class="row-actions"><button class="btn small" type="button" data-action="offer:edit" data-id="${escapeAttr(offer.offerId)}">Карточка</button><button class="btn small primary" type="button" data-action="offer:motivation" data-id="${escapeAttr(offer.offerId)}">Мотивация</button><button class="btn small ghost" type="button" data-action="offer:history" data-id="${escapeAttr(offer.offerId)}">История (${escapeHtml(offer.versionCount || 0)})</button></div></td></tr>`;
        }).join('')}</tbody></table>` : `<div class="empty-state"><strong>Офферов пока нет</strong>Создайте карточку, затем добавьте первую версию мотивации.</div>`}</div>
      </section>`;
    const filter = $('#offerStatusFilter');
    if (filter) filter.addEventListener('change', () => { state.offerStatus = filter.value; renderOffers(); });
  }

  async function renderEmployees() {
    const data = await getEmployeeList(true);
    const canEdit = !!state.permissions.canEditEmployees;
    state.cache.employeesPage = data;
    pageRoot.innerHTML = `
      ${pageHead('Сотрудники', 'Единый исторический реестр', canEdit ? `<button class="btn primary" data-action="employee:new">＋ Новый сотрудник</button>` : '')}
      <div class="stats-grid" style="grid-template-columns:repeat(4,minmax(160px,1fr))">
        ${statCard('Всего в истории', data.stats.total, '◉')}${statCard('Работают', data.stats.working, '✓', '', true)}${statCard('Уволены', data.stats.dismissed, '↪')}${statCard('На ИС', data.stats.probation, '⌛')}
      </div>
      <section class="panel">
        <div class="toolbar"><div class="toolbar-group"><input id="employeeSearch" class="control search" type="search" placeholder="Поиск по ФИО, ID, должности…"><select id="employeeStatusFilter" class="control"><option value="">Все статусы</option>${options(state.refs.employeeStatuses)}</select><select id="employeeDepartmentFilter" class="control"><option value="">Все подразделения</option>${options(state.refs.departments)}</select><select id="employeeLocationFilter" class="control"><option value="">Все локации</option>${options(state.refs.locations)}</select><select id="employeeProbationFilter" class="control"><option value="">Любой испытательный срок</option>${options(state.refs.probationStatuses)}</select></div></div>
        <div id="employeesTable">${employeesTable(data.employees)}</div>
      </section>`;
    ['employeeSearch', 'employeeStatusFilter', 'employeeDepartmentFilter', 'employeeLocationFilter', 'employeeProbationFilter'].forEach(id => $('#' + id).addEventListener(id === 'employeeSearch' ? 'input' : 'change', filterEmployeesTable));
  }

  function filterEmployeesTable() {
    const data = state.cache.employeesPage || { employees: [] };
    const q = ($('#employeeSearch').value || '').trim().toLowerCase();
    const status = $('#employeeStatusFilter').value;
    const dep = $('#employeeDepartmentFilter').value;
    const loc = $('#employeeLocationFilter').value;
    const probation = $('#employeeProbationFilter').value;
    const filtered = data.employees.filter(e => (!q || [e.fullName, e.employeeId, e.position, e.department, e.location, e.managerName].join(' ').toLowerCase().includes(q)) && (!status || e.status === status) && (!dep || e.department === dep) && (!loc || e.location === loc) && (!probation || e.probationStatus === probation));
    $('#employeesTable').innerHTML = employeesTable(filtered);
  }

  function employeesTable(items) {
    if (!items.length) return `<div class="empty-state"><strong>Сотрудники не найдены</strong>Измените фильтры или добавьте запись.</div>`;
    return `<div class="table-wrap"><table class="data-table"><thead><tr><th>Сотрудник</th><th>Подразделение</th><th>Должность</th><th>Руководитель</th><th>Прием</th><th>Выход</th><th>Статус</th><th>ИС от приема</th><th>ИС от выхода</th></tr></thead><tbody>${items.map(e => `<tr class="clickable" data-nav="employee" data-id="${escapeAttr(e.employeeId)}"><td><div class="cell-title">${escapeHtml(e.fullName)}</div><div class="cell-sub">${escapeHtml(e.employeeId)} · ${escapeHtml(e.location || 'локация не указана')}</div></td><td>${orDash(e.department)}</td><td>${orDash(e.position)}</td><td>${orDash(e.managerName)}</td><td>${dateRu(e.hireDate)}</td><td><div>${dateRu(e.startDate)}</div><div class="cell-sub">план: ${dateRu(e.plannedStartDate)}</div></td><td>${statusBadge(e.status)}</td><td><div>${dateRu(e.probationEndFromHire)}</div><div class="cell-sub">${escapeHtml(e.probationStateFromHire || '')}</div></td><td><div>${dateRu(e.probationEndFromStart)}</div><div class="cell-sub">${escapeHtml(e.probationStateFromStart || '')}</div></td></tr>`).join('')}</tbody></table></div>`;
  }

  async function renderEmployeeCard(employeeId) {
    if (!employeeId) throw new Error('В ссылке не указан Employee ID.');
    const card = await api('employees.get', { employeeId });
    state.cache.employeeCard = card;
    const p = card.profile;
    const canEdit = !!state.permissions.canEditEmployees;
    const actions = `${canEdit ? `<button class="btn" data-action="employee:edit" data-id="${escapeAttr(p.employeeId)}">Редактировать</button>${p.status !== 'Уволен' ? `<button class="btn danger" data-action="employee:dismiss" data-id="${escapeAttr(p.employeeId)}">Оформить увольнение</button>` : ''}` : ''}`;
    pageRoot.innerHTML = `
      ${pageHead(p.fullName, `${p.position || 'Должность не указана'} · ${p.department || 'Подразделение не указано'}`, actions, `<button data-nav="employees">Сотрудники</button><span>/</span><span>${escapeHtml(p.employeeId)}</span>`)}
      <div class="stats-grid" style="grid-template-columns:repeat(4,minmax(160px,1fr))">
        ${statCard('Статус', p.status || '—', '◉', '', p.status === 'Работает')}
        ${statCard('Дата выхода', dateRu(p.startDate), '▣', `прием: ${dateRu(p.hireDate)}`)}
        ${statCard('Стаж', tenureLabel(p.tenureDays), '⌛')}
        ${statCard('Заполненность', `${card.quality.completeness}%`, '✓', card.quality.missing.length ? `${card.quality.missing.length} критичных полей` : '')}
      </div>
      <section class="panel">
        <div class="tabs">${employeeTabs(card).map(tab => `<button class="tab ${state.employeeTab === tab.id ? 'active' : ''}" data-action="employee:tab" data-tab="${tab.id}">${escapeHtml(tab.label)} <span class="badge gray">${tab.count}</span></button>`).join('')}</div>
        <div id="employeeTabPanel" class="tab-panel">${employeeTabContent(card, state.employeeTab)}</div>
      </section>`;
  }

  function employeeTabs(card) {
    return [{ id: 'profile', label: 'Профиль', count: 1 }, { id: 'documents', label: 'Документы', count: card.documents.length }, { id: 'events', label: 'Кадровые события', count: card.events.length }, { id: 'adaptation', label: 'Адаптация', count: card.adaptation.length }, { id: 'learning', label: 'Обучение', count: card.learning.length }, { id: 'surveys', label: 'Опросы', count: card.surveys.length }];
  }

  function employeeTabContent(card, tab) {
    const p = card.profile;
    if (tab === 'profile') {
      const fields = [['Employee ID', p.employeeId], ['ФИО', p.fullName], ['Подразделение', p.department], ['Должность', p.position], ['Локация', p.location], ['Руководитель', p.managerName], ['Наставник', p.mentorName || p.mentorId], ['Ответственный HR', p.hrOwner], ['Тип занятости', p.employmentType], ['FTE', p.fte], ['Формат работы', p.workFormat], ['Дата приема (приказ)', dateRu(p.hireDate)], ['Планируемая дата выхода', dateRu(p.plannedStartDate)], ['Дата фактического выхода', dateRu(p.startDate)], ['Дата увольнения', dateRu(p.dismissalDate)], ['Причина увольнения', p.dismissalReason], ['Табельный номер', p.timesheetNumber], ['Учитывать в табеле', p.timesheetIncluded ? 'Да' : 'Нет'], ['Статус исключения', p.timesheetExclusionStatus], ['Причина исключения из табеля', p.timesheetExclusionReason], ['ФИО для СКУД', p.skudFullName || p.fullName], ['Срок ИС', `${p.probationDays || '—'} дней${p.individualProbationDays ? ' · индивидуальный' : ''}`], ['ИС от даты приема', `${dateRu(p.probationEndFromHire)} · ${p.probationStateFromHire || '—'}`], ['ИС от даты выхода', `${dateRu(p.probationEndFromStart)} · ${p.probationStateFromStart || '—'}`], ['Результат ИС', p.probationResult], ['Документы после 1 месяца', p.documentsStatus], ['Дата оформления документов', dateRu(p.documentsDate)], ['Источник найма', p.hiringSource], ['Рекрутер', p.recruiter], ['Vacancy ID', p.vacancyId], ['Телефон', p.phone], ['Email', p.email], ['Пол', p.gender], ['Дата рождения', dateRu(p.birthDate)], ['Критичная роль', p.criticalRole], ['Комментарий HR', p.hrComment]];
      return `${card.quality.missing.length || card.quality.recommendedMissing.length ? `<div class="global-alert" style="display:block;margin-bottom:14px"><strong>Нужно дополнить:</strong> ${escapeHtml(card.quality.missing.concat(card.quality.recommendedMissing).join(', '))}</div>` : ''}<div class="profile-grid">${fields.map(([label, value]) => `<div class="profile-item"><small>${escapeHtml(label)}</small><strong>${orDash(value)}</strong></div>`).join('')}</div>`;
    }
    if (tab === 'documents') return `${state.permissions.canManageHr ? `<div class="toolbar" style="justify-content:flex-end"><button class="btn primary" data-action="document:new" data-id="${escapeAttr(p.employeeId)}">＋ Документ</button></div>` : ''}${documentsTable(card.documents, !!state.permissions.canManageHr)}`;
    if (tab === 'events') return simpleEventTable(card.events);
    if (tab === 'adaptation') return adaptationTable(card.adaptation, false);
    if (tab === 'learning') return learningTable(card.learning, false);
    return surveyTable(card.surveys, false);
  }

  function documentsTable(items, editable) {
    if (!items.length) return `<div class="empty-state"><strong>Документов пока нет</strong>Добавьте документ или выполните настройку системы для создания задачи первого месяца.</div>`;
    return `<div class="table-wrap"><table class="data-table"><thead><tr><th>Документ</th><th>План</th><th>Оформлен</th><th>Статус</th><th>Ответственный</th><th>Ссылка</th>${editable ? '<th></th>' : ''}</tr></thead><tbody>${items.map(r => `<tr><td><div class="cell-title">${escapeHtml(r.type)}</div><div class="cell-sub">${escapeHtml(r.details || '')}</div></td><td>${dateRu(r.planDate)}</td><td>${dateRu(r.completionDate)}</td><td>${statusBadge(r.status)}</td><td>${orDash(r.owner)}</td><td>${r.fileUrl ? `<a href="${escapeAttr(r.fileUrl)}" target="_blank" rel="noopener">Открыть ↗</a>` : '—'}</td>${editable ? `<td><button class="btn small" data-action="document:edit" data-id="${escapeAttr(r.documentId)}">Изменить</button></td>` : ''}</tr>`).join('')}</tbody></table></div>`;
  }

  async function renderQuality() {
    const data = await api('quality.list');
    state.cache.quality = data;
    pageRoot.innerHTML = `
      ${pageHead('Контроль данных', 'Неполные и спорные записи с возможностью дозаполнения')}
      <div class="stats-grid" style="grid-template-columns:repeat(4,minmax(160px,1fr))">${statCard('Сотрудников с пропусками', data.stats.employeesWithGaps, '◉', '', true)}${statCard('Критичные', data.stats.critical, '!', '', true)}${statCard('Ручные проверки', data.stats.manual, '?')}${statCard('Средняя заполненность', `${data.stats.averageCompleteness}%`, '✓')}</div>
      <div class="section-stack">
        <section class="panel"><div class="panel-head"><h2>Неполные карточки</h2></div>${qualityTable(data.records)}</section>
        <section class="panel"><div class="panel-head"><h2>Спорные записи из исходных данных</h2></div>${manualQualityTable(data.manual)}</section>
      </div>`;
  }

  function qualityTable(items) {
    if (!items.length) return `<div class="empty-state"><strong>Все карточки заполнены</strong>Критичных пропусков нет.</div>`;
    return `<div class="table-wrap"><table class="data-table"><thead><tr><th>Сотрудник</th><th>Заполненность</th><th>Критичные поля</th><th>Рекомендуемые</th><th></th></tr></thead><tbody>${items.map(item => `<tr><td><div class="cell-title">${escapeHtml(item.employee.fullName)}</div><div class="cell-sub">${escapeHtml(item.employee.employeeId)}</div></td><td><div class="progress ${item.completeness < 50 ? 'bad' : item.completeness < 80 ? 'warn' : ''}"><span style="width:${item.completeness}%"></span></div><div class="cell-sub">${item.completeness}%</div></td><td><div class="chips">${item.missing.map(v => `<span class="chip critical">${escapeHtml(v)}</span>`).join('') || '—'}</div></td><td><div class="chips">${item.recommendedMissing.map(v => `<span class="chip">${escapeHtml(v)}</span>`).join('') || '—'}</div></td><td><button class="btn primary small" data-action="quality:edit" data-id="${escapeAttr(item.employee.employeeId)}">Дозаполнить</button></td></tr>`).join('')}</tbody></table></div>`;
  }

  function manualQualityTable(items) {
    if (!items.length) return `<div class="empty-state"><strong>Спорных записей нет</strong>Все ручные проверки закрыты.</div>`;
    return `<div class="table-wrap"><table class="data-table"><thead><tr><th>Запись</th><th>Проблема</th><th>Что проверить</th><th>Источник</th><th></th></tr></thead><tbody>${items.map(item => `<tr><td class="cell-title">${escapeHtml(item.label)}</td><td>${escapeHtml(item.problem)}</td><td>${escapeHtml(item.check)}</td><td>${escapeHtml(item.source)}</td><td><button class="btn small" data-action="quality:resolve" data-row="${item.rowNumber}" data-id="${escapeAttr(item.employeeId)}">Отметить решенной</button></td></tr>`).join('')}</tbody></table></div>`;
  }

  async function renderEvents() {
    const data = await api('events.list');
    state.cache.events = data;
    pageRoot.innerHTML = `${pageHead('Кадровые события', 'Неизменяемый журнал изменений', state.permissions.canManageHr ? `<button class="btn primary" data-action="event:new">＋ Кадровое событие</button>` : '')}<section class="panel">${simpleEventTable(data.events)}</section>`;
  }

  function simpleEventTable(items) {
    if (!items.length) return `<div class="empty-state"><strong>Событий пока нет</strong>Первое событие будет создано при приеме сотрудника.</div>`;
    return `<div class="table-wrap"><table class="data-table"><thead><tr><th>Дата</th><th>Сотрудник</th><th>Тип</th><th>Изменение</th><th>Основание</th></tr></thead><tbody>${items.map(e => `<tr class="clickable" data-nav="employee" data-id="${escapeAttr(e.employeeId)}"><td>${dateRu(e.date)}</td><td><div class="cell-title">${escapeHtml(e.fullName)}</div><div class="cell-sub">${escapeHtml(e.employeeId)}</div></td><td>${statusBadge(e.type)}</td><td>${escapeHtml(eventChangeLabel(e))}</td><td>${orDash(e.reason || e.comment)}</td></tr>`).join('')}</tbody></table></div>`;
  }

  function eventChangeLabel(e) {
    if (e.departmentBefore !== e.departmentAfter && e.departmentAfter) return `${e.departmentBefore || '—'} → ${e.departmentAfter}`;
    if (e.positionBefore !== e.positionAfter && e.positionAfter) return `${e.positionBefore || '—'} → ${e.positionAfter}`;
    if (e.fteBefore !== e.fteAfter && e.fteAfter !== '') return `FTE ${e.fteBefore || '—'} → ${e.fteAfter}`;
    return e.comment || '—';
  }

  async function renderRecruitment() {
    const data = await api('recruitment.get');
    state.cache.recruitment = data;
    pageRoot.innerHTML = `
      ${pageHead('Подбор персонала', 'Вакансии, кандидаты и воронка', `<button class="btn" data-action="candidate:new">＋ Кандидат</button><button class="btn primary" data-action="vacancy:new">＋ Открыть вакансию</button>`)}
      <div class="stats-grid">${statCard('Открыто вакансий', data.stats.openVacancies, '▣', '', true)}${statCard('Открыто ставок', data.stats.openPositions, '◉')}${statCard('Просрочено', data.stats.overdue, '!', '', true)}${statCard('Time to Fill', data.stats.averageTimeToFill, '⌛', 'дней')}${statCard('Кандидатов', data.stats.candidates, '◉')}${statCard('Выходов', data.stats.starts, '✓')}</div>
      <div class="section-stack"><section class="panel"><div class="panel-head"><h2>Вакансии</h2></div>${vacancyTable(data.vacancies)}</section><section class="panel"><div class="panel-head"><h2>Кандидаты</h2></div>${candidateTable(data.candidates)}</section></div>`;
  }

  function vacancyTable(items) {
    if (!items.length) return `<div class="empty-state"><strong>Вакансий пока нет</strong>Откройте первую вакансию через форму.</div>`;
    return `<div class="table-wrap"><table class="data-table"><thead><tr><th>Вакансия</th><th>Подразделение</th><th>Открыта</th><th>План</th><th>Статус</th><th>Ставок</th><th>Кандидатов</th><th>Просрочка</th></tr></thead><tbody>${items.map(v => `<tr class="clickable" data-nav="vacancy" data-id="${escapeAttr(v.vacancyId)}"><td><div class="cell-title">${escapeHtml(v.position)}</div><div class="cell-sub">${escapeHtml(v.vacancyId)} · ${escapeHtml(v.location || '')}</div></td><td>${orDash(v.department)}</td><td>${dateRu(v.openDate)}</td><td>${dateRu(v.planCloseDate)}</td><td>${statusBadge(v.status)}</td><td>${v.positions}</td><td>${v.candidates || 0}</td><td>${v.overdueDays ? `<span class="badge red">${v.overdueDays} дн.</span>` : '—'}</td></tr>`).join('')}</tbody></table></div>`;
  }

  function candidateTable(items) {
    if (!items.length) return `<div class="empty-state"><strong>Кандидатов пока нет</strong>Добавьте кандидата к открытой вакансии.</div>`;
    return `<div class="table-wrap"><table class="data-table"><thead><tr><th>Кандидат</th><th>Vacancy ID</th><th>Источник</th><th>Статус</th><th>Интервью</th><th>Оффер</th><th>Выход</th><th></th></tr></thead><tbody>${items.map(c => `<tr><td><div class="cell-title">${escapeHtml(c.fullName)}</div><div class="cell-sub">${escapeHtml(c.candidateId)}</div></td><td><button class="btn ghost small" data-nav="vacancy" data-id="${escapeAttr(c.vacancyId)}">${escapeHtml(c.vacancyId)}</button></td><td>${orDash(c.source)}</td><td>${statusBadge(c.status)}</td><td>${yesNoBadge(c.hrInterview)}</td><td>${yesNoBadge(c.offer)}</td><td>${yesNoBadge(c.started)}</td><td><button class="btn small" data-action="candidate:edit" data-id="${escapeAttr(c.candidateId)}">Изменить</button></td></tr>`).join('')}</tbody></table></div>`;
  }

  async function renderVacancyCard(vacancyId) {
    if (!vacancyId) throw new Error('В ссылке не указан Vacancy ID.');
    const data = await api('vacancies.get', { vacancyId });
    state.cache.vacancyCard = data;
    const v = data.vacancy;
    pageRoot.innerHTML = `
      ${pageHead(v.position || 'Вакансия', `${v.vacancyId} · ${v.department || '—'} · ${v.location || '—'}`, `<button class="btn" data-action="candidate:new" data-vacancy="${escapeAttr(v.vacancyId)}">＋ Кандидат</button><button class="btn" data-action="vacancy:edit" data-id="${escapeAttr(v.vacancyId)}">Редактировать</button>${v.status === 'Открыта' ? `<button class="btn danger" data-action="vacancy:close" data-id="${escapeAttr(v.vacancyId)}">Закрыть</button>` : ''}`, `<button data-nav="recruitment">Подбор</button><span>/</span><span>${escapeHtml(v.vacancyId)}</span>`)}
      <div class="stats-grid" style="grid-template-columns:repeat(4,minmax(160px,1fr))">${statCard('Статус', v.status, '▣', '', true)}${statCard('Дней открыта', v.daysOpen || 0, '⌛')}${statCard('Кандидатов', data.candidates.length, '◉')}${statCard('Time to Fill', v.timeToFill || '—', '↗', v.timeToFill !== '' ? 'дней' : '')}</div>
      <div class="grid-2"><section class="panel"><div class="panel-head"><h2>Параметры вакансии</h2></div><div class="panel-body"><div class="profile-grid" style="grid-template-columns:repeat(2,1fr)">${[['Дата открытия', dateRu(v.openDate)], ['План закрытия', dateRu(v.planCloseDate)], ['Ставок', v.positions], ['Приоритет', v.priority], ['Заказчик', v.managerName], ['Рекрутер', v.recruiter], ['Причина', v.reason], ['Комментарий', v.comment]].map(([l, val]) => `<div class="profile-item"><small>${escapeHtml(l)}</small><strong>${orDash(val)}</strong></div>`).join('')}</div></div></section><section class="panel"><div class="panel-head"><h2>Кандидаты</h2></div>${candidateTable(data.candidates)}</section></div>`;
  }

  async function renderAdaptation() {
    const data = await api('adaptation.list');
    state.cache.adaptation = data;
    const syncButton = state.permissions.canManageHr ? `<button class="btn" data-action="adaptation:sync">↻ Сформировать / обновить план</button>` : '';
    const note = data.missingStartDate ? `<div class="info-callout warning"><strong>${data.missingStartDate} активн. сотрудник(а) без даты выхода</strong><span>Они не попадут в план адаптации. Заполните поле через «Контроль данных» или карточку сотрудника.</span><button class="btn small" data-nav="quality">Открыть контроль данных</button></div>` : `<div class="info-callout"><strong>Как формируется список</strong><span>Показываются работающие сотрудники, вышедшие не более 90 дней назад. Точки 7/30/60/90 рассчитываются от даты выхода; суббота и воскресенье переносятся на понедельник.</span></div>`;
    pageRoot.innerHTML = `${pageHead('Адаптация', 'Автоматический план для сотрудников в первые 90 дней', `${syncButton}<button class="btn primary" data-action="adaptation:new">＋ Своя точка оценки</button>`)}${note}<div class="stats-grid" style="grid-template-columns:repeat(4,minmax(160px,1fr))">${statCard('Новичков', data.stats.newcomers, '◉')}${statCard('Нужно провести', data.stats.due, '⌛', '', true)}${statCard('Красный риск', data.stats.highRisk, '!', '', true)}${statCard('Retention 90', `${data.stats.retention[90] || 0}%`, '↗')}</div><section class="panel">${adaptationTable(data.records, true)}</section>`;
  }

  function adaptationTable(items, editable) {
    if (!items.length) return `<div class="empty-state"><strong>План пока пуст</strong>Укажите сотрудникам дату фактического выхода и запустите формирование плана.</div>`;
    return `<div class="table-wrap"><table class="data-table"><thead><tr><th>Сотрудник</th><th>Точка</th><th>Тип</th><th>План</th><th>Факт</th><th>Оценки</th><th>Риск</th><th>Действие</th>${editable ? '<th></th>' : ''}</tr></thead><tbody>${items.map(r => `<tr><td><button class="btn ghost small" data-nav="employee" data-id="${escapeAttr(r.employeeId)}">${escapeHtml(r.fullName)}</button></td><td><div class="cell-title">${escapeHtml(r.checkpoint)}</div><div class="cell-sub">${r.offsetDays === '' ? 'ручная дата' : `день ${r.offsetDays} от выхода`}</div></td><td>${statusBadge(r.pointType)}</td><td>${dateRu(r.planDate)}</td><td>${dateRu(r.actualDate)}</td><td>${r.employeeScore || '—'} / ${r.managerScore || '—'}</td><td>${statusBadge(r.risk)}</td><td><div class="cell-title">${orDash(r.action)}</div><div class="cell-sub">${r.actionDue ? `до ${dateRu(r.actionDue)}` : ''}</div></td>${editable ? `<td><button class="btn small" data-action="adaptation:edit" data-id="${escapeAttr(r.adaptId)}">Изменить</button></td>` : ''}</tr>`).join('')}</tbody></table></div>`;
  }

  async function renderLearning() {
    const data = await api('learning.list');
    state.cache.learning = data;
    pageRoot.innerHTML = `${pageHead('Обучение', 'Назначения, дедлайны и результаты', `<button class="btn primary" data-action="learning:new">＋ Назначить обучение</button>`)}<div class="stats-grid" style="grid-template-columns:repeat(4,minmax(160px,1fr))">${statCard('Назначено', data.stats.assigned, '◇')}${statCard('В процессе', data.stats.inProgress, '⌛')}${statCard('Завершено', data.stats.completed, '✓', '', true)}${statCard('Completion Rate', `${data.stats.completionRate}%`, '↗')}</div><section class="panel">${learningTable(data.records, true)}</section>`;
  }

  function learningTable(items, editable) {
    if (!items.length) return `<div class="empty-state"><strong>Назначений пока нет</strong>Назначьте первую программу сотруднику.</div>`;
    return `<div class="table-wrap"><table class="data-table"><thead><tr><th>Сотрудник</th><th>Программа</th><th>Назначено</th><th>Дедлайн</th><th>Статус</th><th>Результат</th><th>Часы</th>${editable ? '<th></th>' : ''}</tr></thead><tbody>${items.map(r => `<tr><td><button class="btn ghost small" data-nav="employee" data-id="${escapeAttr(r.employeeId)}">${escapeHtml(r.fullName)}</button></td><td><div class="cell-title">${escapeHtml(r.program)}</div><div class="cell-sub">${escapeHtml(r.type)}</div></td><td>${dateRu(r.assignedDate)}</td><td>${dateRu(r.deadline)}</td><td>${statusBadge(r.status)}</td><td>${r.testResult === '' ? '—' : `${r.testResult}%`}</td><td>${orDash(r.hours)}</td>${editable ? `<td><button class="btn small" data-action="learning:edit" data-id="${escapeAttr(r.learningId)}">Изменить</button></td>` : ''}</tr>`).join('')}</tbody></table></div>`;
  }

  async function renderSurveys() {
    const data = await api('surveys.list');
    state.cache.surveys = data;
    const syncButton = state.permissions.canManageHr ? `<button class="btn" data-action="survey:sync">↻ Проверить источник опросов</button>` : '';
    pageRoot.innerHTML = `${pageHead('Опросы', 'eNPS, вовлеченность, адаптация и пульс-опросы', `${syncButton}<button class="btn primary" data-action="survey:new">＋ Добавить ответ</button>`)}
      <div class="info-callout"><strong>Как связать опрос с сотрудником</strong><span>Для именного ответа передавайте Employee ID — результат появится во вкладке «Опросы» карточки сотрудника. Анонимный ответ хранится без ФИО и доступен только в агрегате подразделения.</span></div>
      <section class="panel guide-panel"><div class="panel-head"><h2>Подключение внешней формы</h2></div><div class="panel-body"><ol><li>Создайте форму в удобном сервисе и передавайте результаты в Layero Data API.</li><li>Для именных ответов обязательны <strong>Employee ID</strong> и <strong>Тип опроса</strong>; оценки eNPS и вовлеченности необязательны.</li><li>Для анонимных ответов не передавайте ФИО и Employee ID, укажите только подразделение.</li><li>Нажмите «Проверить источник опросов», чтобы увидеть состояние подключения.</li></ol></div></section>
      <div class="stats-grid" style="grid-template-columns:repeat(4,minmax(160px,1fr))">${statCard('Ответов', data.stats.responses, '✎')}${statCard('eNPS', data.stats.enps, '↗', '', true)}${statCard('Промоутеры', data.stats.promoters, '✓')}${statCard('Ср. вовлеченность', data.stats.averageEngagement, '◉')}</div><section class="panel">${surveyTable(data.records, true)}</section>`;
  }

  function surveyTable(items, editable) {
    if (!items.length) return `<div class="empty-state"><strong>Ответов пока нет</strong>Добавьте именной или анонимный ответ.</div>`;
    return `<div class="table-wrap"><table class="data-table"><thead><tr><th>Дата</th><th>Тип</th><th>Сотрудник</th><th>Подразделение</th><th>eNPS</th><th>Вовлеченность</th><th>Риск</th><th>Анонимно</th>${editable ? '<th></th>' : ''}</tr></thead><tbody>${items.map(r => `<tr><td>${dateRu(r.date)}</td><td>${statusBadge(r.type)}</td><td>${r.employeeId ? `<button class="btn ghost small" data-nav="employee" data-id="${escapeAttr(r.employeeId)}">${escapeHtml(r.fullName)}</button>` : escapeHtml(r.fullName)}</td><td>${orDash(r.department)}</td><td>${orDash(r.enps)}</td><td>${orDash(r.engagement)}</td><td>${statusBadge(r.risk)}</td><td>${r.anonymous ? '<span class="badge blue">Да</span>' : 'Нет'}</td>${editable ? `<td><button class="btn small" data-action="survey:edit" data-id="${escapeAttr(r.responseId)}">Изменить</button></td>` : ''}</tr>`).join('')}</tbody></table></div>`;
  }

  async function renderTimesheet() {
    const period = state.timesheetPeriod || todayIso().slice(0, 7);
    const data = await api('timesheet.get', { period, department: state.timesheetDepartment });
    state.cache.timesheet = data;
    state.timesheetEdits = {};
    state.timesheetPeriod = data.period || period;
    if (!data.configured) {
      pageRoot.innerHTML = `${pageHead('Табель', 'Ежедневный учет, сверка СКУД и выгрузка Excel')}<section class="panel guide-panel"><div class="panel-head"><h2>Табель пока не подключен</h2></div><div class="panel-body"><p>${escapeHtml(data.message || '')}</p><ol><li>Проверьте переменные <strong>VITE_LAYERO_DATA_URL</strong> и <strong>VITE_LAYERO_DATA_KEY</strong>.</li><li>Выполните SQL-миграцию из папки <strong>database</strong>.</li><li>Свяжите базу с проектом Layero и выполните новую сборку.</li></ol></div></section>`;
      return;
    }
    const a = data.access || {};
    const actions = `${a.canImport ? '<button class="btn" data-action="timesheet:import">⇧ Загрузить СКУД</button>' : ''}${a.canExport ? '<button class="btn" data-action="timesheet:export">⇩ Выгрузить Excel</button>' : ''}${a.canDaily || a.canMonthly ? '<button class="btn primary" data-action="timesheet:prepare">Сформировать месяц</button>' : ''}`;
    const departmentOptions = (data.departments || []).map(value => ({ value, label: value }));
    const selectedDepartment = state.timesheetDepartment || data.selectedDepartment || '';
    const statusButton = a.canClose ? (data.status === 'Закрыт' ? '<button class="btn" data-action="timesheet:status" data-status="Открыт">Открыть период</button>' : '<button class="btn danger" data-action="timesheet:status" data-status="Закрыт">Закрыть период</button>') : '';
    const warning = data.warnings && data.warnings.missingStartDate ? `<div class="info-callout warning"><strong>Есть сотрудники без даты выхода: ${data.warnings.missingStartDate}</strong><span>Для них используется дата приема. Модуль корректировки кадровых данных временно неактивен.</span></div>` : '';
    const exclusionWarning = data.stats.pendingExclusions ? `<div class="info-callout warning"><strong>Нужно решить заявки на исключение: ${data.stats.pendingExclusions}</strong><span>До решения сотрудники остаются в табеле, а Excel-выгрузка заблокирована.</span></div>` : '';
    pageRoot.innerHTML = `${pageHead('Табель', 'Ежедневное заполнение, ежемесячная сверка СКУД и Excel-выгрузка', actions)}
      <div class="timesheet-filterbar"><label>Период<input id="timesheetPeriod" class="control" type="month" value="${escapeAttr(state.timesheetPeriod)}"></label><label>Подразделение<select id="timesheetDepartment" class="control"><option value="">Все доступные</option>${options(departmentOptions, selectedDepartment)}</select></label><span>${statusBadge(data.status)}</span>${statusButton}</div>
      <div class="info-callout"><strong>Сверка по ФИО</strong><span>${escapeHtml(data.warnings && data.warnings.fioMatching || '')}</span></div>${warning}${exclusionWarning}
      <div class="stats-grid" style="grid-template-columns:repeat(6,minmax(140px,1fr))">${statCard('Сотрудников', data.stats.employees, '◉')}${statCard('Заполнено дней', data.stats.preparedDays, '▦')}${statCard('Расхождений', data.stats.unresolved, '!', '', data.stats.unresolved > 0)}${statCard('Уволенных в СКУД', data.stats.dismissedInSkud, '↪', '', data.stats.dismissedInSkud > 0)}${statCard('На подтверждении', data.stats.pendingExclusions, '?', '', data.stats.pendingExclusions > 0)}${statCard('Исключено', data.stats.excluded, '—')}</div>
      <section class="panel"><div class="tabs timesheet-tabs">${timesheetTabs(data).map(tab => `<button class="tab ${state.timesheetTab === tab.id ? 'active' : ''}" data-action="timesheet:tab" data-tab="${tab.id}">${escapeHtml(tab.label)}${tab.count === '' ? '' : ` <span class="badge gray">${tab.count}</span>`}</button>`).join('')}</div><div id="timesheetPanel" class="tab-panel">${timesheetTabContent(data, state.timesheetTab)}</div></section>`;
    $('#timesheetPeriod').addEventListener('change', event => { if (hasUnsavedTimesheetEdits() && !window.confirm('Есть несохраненные изменения табеля. Сменить месяц без сохранения?')) { event.target.value = state.timesheetPeriod; return; } state.timesheetEdits = {}; state.timesheetPeriod = event.target.value; renderRoute(); });
    $('#timesheetDepartment').addEventListener('change', event => { if (hasUnsavedTimesheetEdits() && !window.confirm('Есть несохраненные изменения табеля. Сменить подразделение без сохранения?')) { event.target.value = state.timesheetDepartment; return; } state.timesheetEdits = {}; state.timesheetDepartment = event.target.value; renderRoute(); });
    if (state.timesheetTab === 'calendar') updateTimesheetEditBar();
  }

  function timesheetTabs(data) {
    const tabs = [
      { id: 'calendar', label: 'Табель месяца', count: data.rows.length },
      { id: 'differences', label: 'Расхождения', count: data.differences.filter(item => item.status !== 'Решено').length },
      { id: 'control', label: 'Контроль СКУД', count: data.controls.length },
      { id: 'exclusions', label: 'Исключения', count: (data.exclusionRequests || []).filter(item => item.status === 'Требует подтверждения').length },
      { id: 'imports', label: 'Импорты', count: data.imports.length },
      { id: 'codes', label: 'Обозначения', count: data.codes.length }
    ];
    if (data.access && data.access.canManageAccess) tabs.push({ id: 'access', label: 'Доступ', count: data.accessRows.length });
    if (!tabs.some(tab => tab.id === state.timesheetTab)) state.timesheetTab = 'calendar';
    return tabs;
  }

  function timesheetTabContent(data, tab) {
    if (tab === 'differences') return timesheetDifferencesTable(data.differences, !!(data.access && data.access.canMonthly));
    if (tab === 'control') return timesheetControlTable(data.controls, !!(data.access && data.access.canManageControl));
    if (tab === 'exclusions') return timesheetExclusionsTable(data, !!(data.access && data.access.canManageControl));
    if (tab === 'imports') return timesheetImportsTable(data.imports);
    if (tab === 'codes') return timesheetCodesTable(data.codes, data.excludedEmployees || []);
    if (tab === 'access') return timesheetAccessTable(data.accessRows || []);
    return timesheetCalendar(data);
  }

  function timesheetCalendar(data) {
    if (!data.rows.length) return `<div class="empty-state"><strong>В периоде нет сотрудников</strong>Проверьте даты приема/выхода, увольнения и признак «Учитывать в табеле».</div>`;
    const codeMap = Object.fromEntries((data.codes || []).map(item => [item.code, item]));
    const grid = `<div class="timesheet-scroll"><table class="timesheet-grid"><thead><tr><th class="ts-fixed ts-name">Сотрудник</th><th class="ts-fixed ts-department">Подразделение</th>${data.days.map(day => `<th class="${day.working ? '' : 'weekend'}"><span>${day.day}</span><small>${escapeHtml(day.weekday)}</small></th>`).join('')}</tr></thead><tbody>${data.rows.map(row => `<tr><td class="ts-fixed ts-name"><strong>${escapeHtml(row.fullName)}</strong><small>${escapeHtml(row.position || row.employeeId)}</small></td><td class="ts-fixed ts-department">${escapeHtml(row.department || '—')}</td>${row.cells.map((cell, index) => {
      const code = codeMap[cell.code] || {};
      const baseColor = data.days[index] && data.days[index].working ? '#FFF2CC' : '#FFFFFF';
      const style = ` style="--ts-color:${escapeAttr(code.color || baseColor)}"`;
      const content = `<span>${escapeHtml(cell.code || '·')}</span>`;
      if (!cell.editable) return `<td class="ts-day ${cell.inactive ? 'inactive' : ''} ${cell.differenceId ? 'has-difference ' + escapeAttr(cell.severity || '') : ''}"${style}><div>${content}</div></td>`;
      return `<td class="ts-day ts-editable ${cell.differenceId ? 'has-difference ' + escapeAttr(cell.severity || '') : ''}"${style}><div class="ts-edit-cell"><select class="ts-code-select" data-employee="${escapeAttr(row.employeeId)}" data-name="${escapeAttr(row.fullName)}" data-date="${escapeAttr(cell.date)}" data-original="${escapeAttr(cell.code)}" aria-label="${escapeAttr(row.fullName + ', ' + dateRu(cell.date))}"><option value="" disabled ${cell.code ? '' : 'selected'}>·</option>${(data.codes || []).map(item => `<option value="${escapeAttr(item.code)}" ${item.code === cell.code ? 'selected' : ''}>${escapeHtml(item.code)}</option>`).join('')}</select><button class="ts-detail" type="button" data-action="timesheet:cell" data-employee="${escapeAttr(row.employeeId)}" data-name="${escapeAttr(row.fullName)}" data-date="${escapeAttr(cell.date)}" data-code="${escapeAttr(cell.code)}" data-hours="${escapeAttr(cell.hours)}" data-comment="${escapeAttr(cell.comment)}" title="Часы и комментарий">…</button></div></td>`;
    }).join('')}</tr>`).join('')}</tbody></table></div>`;
    return `<div class="timesheet-editbar"><span><strong id="timesheetDirtyCount">0</strong> изменений</span><span class="hint">Выберите коды в ячейках. Цвет меняется сразу, запись в базу — после сохранения.</span><button id="timesheetSaveButton" class="btn primary" data-action="timesheet:save-batch" disabled>Сохранить изменения</button></div>${grid}`;
  }

  function updateTimesheetCell(select) {
    const data = state.cache.timesheet || {};
    const key = `${select.dataset.employee}|${select.dataset.date}`;
    const value = select.value;
    const cell = select.closest('.ts-day');
    const detail = cell && cell.querySelector('.ts-detail');
    const code = (data.codes || []).find(item => item.code === value);
    const dayIndex = (data.days || []).findIndex(day => day.date === select.dataset.date);
    const baseColor = dayIndex >= 0 && data.days[dayIndex].working ? '#FFF2CC' : '#FFFFFF';
    if (cell) {
      cell.style.setProperty('--ts-color', code && code.color ? code.color : baseColor);
      cell.classList.toggle('dirty', value !== select.dataset.original);
    }
    if (detail) detail.dataset.code = value;
    if (value === select.dataset.original) delete state.timesheetEdits[key];
    else state.timesheetEdits[key] = { employeeId: select.dataset.employee, date: select.dataset.date, code: value };
    updateTimesheetEditBar();
  }

  function updateTimesheetEditBar() {
    const count = Object.keys(state.timesheetEdits || {}).length;
    const countNode = $('#timesheetDirtyCount');
    const button = $('#timesheetSaveButton');
    if (countNode) countNode.textContent = String(count);
    if (button) button.disabled = count === 0;
  }

  function hasUnsavedTimesheetEdits() { return Object.keys(state.timesheetEdits || {}).length > 0; }

  function timesheetDifferencesTable(items, editable) {
    if (!items.length) return `<div class="empty-state"><strong>Расхождений нет</strong>После загрузки файла СКУД здесь появятся только записи, требующие решения.</div>`;
    return `<div class="table-wrap"><table class="data-table"><thead><tr><th>Дата</th><th>Сотрудник</th><th>Тип</th><th>Табель</th><th>СКУД</th><th>Важность</th><th>Статус</th><th></th></tr></thead><tbody>${items.map(item => `<tr><td>${dateRu(item.date)}</td><td><div class="cell-title">${escapeHtml(item.fullName)}</div><div class="cell-sub">${escapeHtml(item.department || item.employeeId || 'не сопоставлен')}</div></td><td>${escapeHtml(item.type)}</td><td>${escapeHtml(item.code || '—')} / ${orDash(item.timesheetHours)}</td><td>${orDash(item.skudHours)} ч</td><td>${statusBadge(item.severity)}</td><td>${statusBadge(item.status)}</td><td>${editable && item.status !== 'Решено' ? `<button class="btn primary small" data-action="timesheet:resolve" data-id="${escapeAttr(item.differenceId)}">Решить</button>` : escapeHtml(item.resolution || '—')}</td></tr>`).join('')}</tbody></table></div>`;
  }

  function timesheetControlTable(items, editable) {
    if (!items.length) return `<div class="empty-state"><strong>Контрольных записей нет</strong>Уволенные сотрудники, продолжающие появляться в СКУД, будут показаны здесь.</div>`;
    return `<div class="table-wrap"><table class="data-table"><thead><tr><th>Сотрудник</th><th>Уволен</th><th>Последний проход</th><th>Проблема</th><th>Статус</th><th>Ответственный</th><th></th></tr></thead><tbody>${items.map(item => `<tr><td><div class="cell-title">${escapeHtml(item.fullName)}</div><div class="cell-sub">${escapeHtml(item.department || item.employeeId)}</div></td><td>${dateRu(item.dismissalDate)}</td><td>${dateRu(item.lastSkudDate)}</td><td>${statusBadge(item.issueType)}</td><td>${statusBadge(item.status)}</td><td>${orDash(item.owner)}</td><td>${editable ? `<button class="btn small" data-action="timesheet:control" data-id="${escapeAttr(item.issueId)}">Изменить</button>` : ''}</td></tr>`).join('')}</tbody></table></div>`;
  }

  function timesheetExclusionsTable(data, editable) {
    const items = data.exclusionRequests || [];
    const toolbar = editable ? '<div class="toolbar" style="justify-content:flex-end"><button class="btn primary" data-action="timesheet:exclusion:new">＋ Настроить исключение</button></div>' : '';
    if (!items.length) return `${toolbar}<div class="empty-state"><strong>Исключений пока нет</strong>HR или HRD может создать заявку прямо в этом разделе.</div>`;
    return `${toolbar}<div class="table-wrap"><table class="data-table"><thead><tr><th>Сотрудник</th><th>Подразделение</th><th>Причина</th><th>Статус</th><th>Решил</th><th></th></tr></thead><tbody>${items.map(item => `<tr><td><div class="cell-title">${escapeHtml(item.fullName)}</div><div class="cell-sub">${escapeHtml(item.position || item.employeeId)}</div></td><td>${escapeHtml(item.department || '—')}</td><td>${escapeHtml(item.reason || '—')}</td><td>${statusBadge(item.status)}</td><td>${item.confirmedBy ? `${escapeHtml(item.confirmedBy)}<div class="cell-sub">${dateRu(item.confirmedAt)}</div>` : '—'}</td><td>${editable ? `<div class="row-actions"><button class="btn small" data-action="timesheet:exclusion:edit" data-id="${escapeAttr(item.employeeId)}">Изменить</button>${item.status === 'Требует подтверждения' ? `<button class="btn primary small" data-action="timesheet:exclusion" data-id="${escapeAttr(item.employeeId)}" data-decision="Подтвердить">Подтвердить</button><button class="btn small" data-action="timesheet:exclusion" data-id="${escapeAttr(item.employeeId)}" data-decision="Отклонить">Отклонить</button>` : ''}</div>` : '—'}</td></tr>`).join('')}</tbody></table></div>`;
  }

  function timesheetImportsTable(items) {
    if (!items.length) return `<div class="empty-state"><strong>Файлы СКУД еще не загружались</strong>HR или HRD загружает итоговый .xlsx в конце месяца.</div>`;
    return `<div class="table-wrap"><table class="data-table"><thead><tr><th>Импорт</th><th>Файл</th><th>Профиль</th><th>Строк</th><th>Сопоставлено</th><th>Расхождений</th><th>Уволенных</th><th>Не найдено</th><th>Загрузил</th></tr></thead><tbody>${items.map(item => `<tr><td><div class="cell-title">${escapeHtml(item.importId)}</div><div class="cell-sub">${dateRu(item.loadedAt)}</div></td><td>${item.fileUrl ? `<a href="${escapeAttr(item.fileUrl)}" target="_blank" rel="noopener">${escapeHtml(item.fileName)} ↗</a>` : escapeHtml(item.fileName)}</td><td>${escapeHtml(item.profile || '—')}</td><td>${item.sourceRows}</td><td>${item.matched}</td><td>${item.differences}</td><td>${item.dismissed}</td><td>${item.unmatched}</td><td>${escapeHtml(item.user)}</td></tr>`).join('')}</tbody></table></div>`;
  }

  function timesheetCodesTable(codes, excluded) {
    return `<div class="grid-2"><div><h3>Буквенные и цветовые обозначения</h3><div class="code-legend">${codes.map(item => `<div class="code-card" style="--ts-color:${escapeAttr(item.color)}"><strong>${escapeHtml(item.code)}</strong><span>${escapeHtml(item.name)}</span><small>${escapeHtml(item.category)} · ${item.defaultHours === '' ? 'часы вручную' : item.defaultHours + ' ч'}</small></div>`).join('')}</div></div><div><h3>Не включаются в табель</h3>${excluded.length ? `<div class="list">${excluded.map(item => `<div class="list-row"><span class="list-dot orange"></span><span><strong>${escapeHtml(item.fullName)}</strong><small>${escapeHtml(item.reason || 'причина не указана')}</small></span><span class="badge gray">исключен</span></div>`).join('')}</div>` : emptyInline('Исключений нет. Они настраиваются во вкладке «Исключения».')}</div></div>`;
  }

  function timesheetAccessTable(items) {
    const employeeMap = Object.fromEntries(((state.cache.timesheet && state.cache.timesheet.accessEmployees) || []).map(employee => [employee.employeeId, employee]));
    const target = item => {
      if (item.accessScope === 'Подразделение') return item.department || 'Не указано';
      if (item.accessScope === 'Прямые подчиненные' || item.accessScope === 'Все подчиненные') { const manager = employeeMap[item.managerId]; return manager ? manager.fullName : (item.managerId || 'Руководитель не указан'); }
      const labels = (item.employeeIds || []).map(id => employeeMap[id] ? employeeMap[id].fullName : id);
      return labels.length <= 2 ? labels.join(', ') : `${labels.slice(0, 2).join(', ')} и еще ${labels.length - 2}`;
    };
    return `<div class="toolbar" style="justify-content:flex-end"><button class="btn primary" data-action="timesheet:access:new">＋ Правило доступа</button></div>${items.length ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>Email</th><th>Область доступа</th><th>Кого видит</th><th>Роль</th><th>Ежедневно</th><th>Проверка</th><th>Выгрузка</th><th>Статус</th><th></th></tr></thead><tbody>${items.map(item => `<tr><td class="cell-title">${escapeHtml(item.email)}</td><td>${escapeHtml(item.accessScope)}</td><td><div class="cell-title">${escapeHtml(target(item) || '—')}</div><div class="cell-sub">${item.employeeIds && item.employeeIds.length ? item.employeeIds.length + ' выбранных сотрудников' : escapeHtml(item.department || item.managerId || '')}</div></td><td>${escapeHtml(item.timesheetRole)}</td><td>${yesNoBadge(item.canDaily ? 'Да' : 'Нет')}</td><td>${yesNoBadge(item.canMonthly ? 'Да' : 'Нет')}</td><td>${yesNoBadge(item.canExport ? 'Да' : 'Нет')}</td><td>${item.active ? '<span class="badge green">Активен</span>' : '<span class="badge gray">Отключен</span>'}</td><td><button class="btn small" data-action="timesheet:access:edit" data-email="${escapeAttr(item.email)}" data-department="${escapeAttr(item.department)}" data-scope="${escapeAttr(item.accessScope)}" data-manager="${escapeAttr(item.managerId)}">Изменить</button></td></tr>`).join('')}</tbody></table></div>` : emptyInline('Правила доступа к табелю еще не назначены.')}`;
  }

  async function renderDirectories() {
    const data = await api('directories.get');
    state.cache.directories = data;
    if (!DIRECTORY_GROUPS.some(group => group.id === state.directoryGroup)) state.directoryGroup = 'structure';
    pageRoot.innerHTML = `${pageHead('Справочники', 'Значения разделены по бизнес-блокам', `<button class="btn primary" data-action="directory:new">＋ Запись</button>`)}<section class="panel"><div class="tabs directory-tabs">${DIRECTORY_GROUPS.map(group => `<button class="tab ${group.id === state.directoryGroup ? 'active' : ''}" data-action="directory:group" data-group="${escapeAttr(group.id)}">${escapeHtml(group.label)}</button>`).join('')}</div><div class="toolbar"><div class="toolbar-group"><input id="directorySearch" class="control search" type="search" placeholder="Поиск значения в блоке…"></div></div><div id="directoriesTable">${directoryBlocks(data.items)}</div></section>`;
    $('#directorySearch').addEventListener('input', filterDirectories);
  }

  function filterDirectories() {
    const q = ($('#directorySearch') && $('#directorySearch').value || '').trim().toLowerCase();
    const items = state.cache.directories.items.filter(i => !q || [i.value, i.type, i.parent].join(' ').toLowerCase().includes(q));
    $('#directoriesTable').innerHTML = directoryBlocks(items);
  }

  function directoryBlocks(items) {
    const group = DIRECTORY_GROUPS.find(item => item.id === state.directoryGroup) || DIRECTORY_GROUPS[0];
    const availableTypes = group.types.filter(type => items.some(item => item.type === type));
    const types = availableTypes.length ? group.types : group.types;
    return `<div class="directory-blocks">${types.map(type => `<section class="directory-block"><div class="directory-block-head"><div><h3>${escapeHtml(type)}</h3><small>${items.filter(item => item.type === type && item.active).length} активных значений</small></div><button class="btn small" data-action="directory:new" data-type="${escapeAttr(type)}">＋ Добавить</button></div>${directoriesTable(items.filter(item => item.type === type), true)}</section>`).join('')}</div>`;
  }

  function directoriesTable(items, compact = false) {
    if (!items.length) return `<div class="empty-state compact"><strong>Значений нет</strong>Добавьте первую запись в этот справочник.</div>`;
    return `<div class="table-wrap"><table class="data-table directory-table"><thead><tr>${compact ? '' : '<th>Тип</th>'}<th>Значение</th><th>Родитель</th><th>Статус</th><th>Комментарий</th><th></th></tr></thead><tbody>${items.map(i => `<tr>${compact ? '' : `<td>${escapeHtml(i.type)}</td>`}<td class="cell-title">${escapeHtml(i.value)}</td><td>${orDash(i.parent)}</td><td>${i.active ? '<span class="badge green">Активен</span>' : '<span class="badge gray">Неактивен</span>'}</td><td>${orDash(i.comment)}</td><td><div class="toolbar-group"><button class="btn small" data-action="directory:edit" data-id="${escapeAttr(i.refId)}">Изменить</button><button class="btn small ${i.active ? 'danger' : ''}" data-action="directory:toggle" data-id="${escapeAttr(i.refId)}" data-active="${i.active ? 'false' : 'true'}">${i.active ? 'Деактивировать' : 'Активировать'}</button></div></td></tr>`).join('')}</tbody></table></div>`;
  }

  async function renderSettings() {
    const data = await api('settings.get');
    state.cache.settings = data;
    pageRoot.innerHTML = `${pageHead('Настройки и доступ', 'Параметры, роли, рабочий календарь и шаблоны адаптации', `<button class="btn primary" data-action="role:new">＋ Роль</button>`)}<div class="section-stack"><section class="panel"><div class="panel-head"><h2>Параметры</h2></div>${settingsTable(data.settings)}</section><section class="panel"><div class="panel-head"><h2>Роли доступа</h2></div>${rolesTable(data.roles)}</section><section class="panel"><div class="panel-head"><div><h2>Шаблоны адаптации</h2><small>Более точный шаблон по подразделению, должности или типу занятости заменяет общий шаблон с тем же днем.</small></div><button class="btn primary small" data-action="template:new">＋ Точка</button></div>${adaptationTemplatesTable(data.adaptationTemplates || [])}</section><section class="panel"><div class="panel-head"><div><h2>Рабочий календарь</h2><small>Задайте праздники, переносы выходных и рабочие субботы. Они учитываются при расчете контрольных дат.</small></div><button class="btn primary small" data-action="calendar:new">＋ День</button></div>${calendarTable(data.calendar || [])}</section></div>`;
  }

  function settingsTable(items) {
    return `<div class="table-wrap"><table class="data-table"><thead><tr><th>Параметр</th><th>Значение</th><th>Назначение</th><th></th></tr></thead><tbody>${items.map(i => `<tr><td class="cell-title">${escapeHtml(i.parameter)}</td><td>${escapeHtml(i.value)}</td><td><div>${escapeHtml(i.comment)}</div><div class="cell-sub">${escapeHtml(i.usage)}</div></td><td>${i.parameter === 'Версия системы' ? '' : `<button class="btn small" data-action="setting:edit" data-param="${escapeAttr(i.parameter)}">Изменить</button>`}</td></tr>`).join('')}</tbody></table></div>`;
  }

  function rolesTable(items) {
    if (!items.length) return `<div class="empty-state"><strong>Роли еще не назначены</strong>До первой записи текущему пользователю выдается bootstrap-доступ HRD.</div>`;
    return `<div class="table-wrap"><table class="data-table"><thead><tr><th>Email</th><th>Роль</th><th>Employee ID</th><th>Статус</th><th>Комментарий</th><th></th></tr></thead><tbody>${items.map(r => `<tr><td class="cell-title">${escapeHtml(r.email)}</td><td>${statusBadge(r.role)}</td><td>${orDash(r.employeeId)}</td><td>${r.active ? '<span class="badge green">Активна</span>' : '<span class="badge gray">Отключена</span>'}</td><td>${orDash(r.comment)}</td><td><button class="btn small" data-action="role:edit" data-email="${escapeAttr(r.email)}">Изменить</button></td></tr>`).join('')}</tbody></table></div>`;
  }

  function adaptationTemplatesTable(items) {
    if (!items.length) return `<div class="empty-state"><strong>Шаблонов нет</strong>Добавьте контрольные точки адаптации.</div>`;
    return `<div class="table-wrap"><table class="data-table"><thead><tr><th>Точка</th><th>День</th><th>Условия</th><th>Ответственный</th><th>Статус</th><th></th></tr></thead><tbody>${items.map(i => `<tr><td><div class="cell-title">${escapeHtml(i.name)}</div><div class="cell-sub">${escapeHtml(i.templateId)}</div></td><td>${orDash(i.offsetDays)}</td><td>${[i.department, i.position, i.employmentType].filter(Boolean).map(escapeHtml).join(' · ') || 'Для всех'}</td><td>${orDash(i.owner)}</td><td>${i.active ? '<span class="badge green">Активен</span>' : '<span class="badge gray">Отключен</span>'}</td><td><button class="btn small" data-action="template:edit" data-id="${escapeAttr(i.templateId)}">Изменить</button></td></tr>`).join('')}</tbody></table></div>`;
  }

  function calendarTable(items) {
    if (!items.length) return `<div class="empty-state"><strong>Исключения не заданы</strong>По умолчанию рабочими считаются понедельник–пятница.</div>`;
    return `<div class="table-wrap"><table class="data-table"><thead><tr><th>Дата</th><th>Тип дня</th><th>Название</th><th>Статус</th><th>Комментарий</th><th></th></tr></thead><tbody>${items.map(i => `<tr><td class="cell-title">${dateRu(i.date)}</td><td>${statusBadge(i.dayType)}</td><td>${orDash(i.name)}</td><td>${i.active ? '<span class="badge green">Учитывается</span>' : '<span class="badge gray">Отключен</span>'}</td><td>${orDash(i.comment)}</td><td><button class="btn small" data-action="calendar:edit" data-date="${escapeAttr(i.date)}">Изменить</button></td></tr>`).join('')}</tbody></table></div>`;
  }

  function openModal(title, content, size = '') {
    modalRoot.innerHTML = `<div class="modal-backdrop"><section class="modal ${size}"><div class="modal-head"><h2>${escapeHtml(title)}</h2><button class="modal-close" type="button" data-action="modal:close" aria-label="Закрыть">×</button></div><div class="modal-body">${content}</div></section></div>`;
    const first = modalRoot.querySelector('input:not([type=hidden]), select, textarea'); if (first) setTimeout(() => first.focus(), 0);
  }

  function closeModal() { modalRoot.innerHTML = ''; }

  function formShell(id, body, submitLabel = 'Сохранить', danger = false) {
    return `<form id="${id}" class="form-grid">${body}<div class="form-actions"><button type="button" class="btn" data-action="modal:close">Отмена</button><button type="submit" class="btn ${danger ? 'danger' : 'primary'}">${escapeHtml(submitLabel)}</button></div></form>`;
  }

  function field(name, label, value = '', type = 'text', attrs = '') {
    return `<div class="field"><label>${escapeHtml(label)}</label><input class="form-control" name="${escapeAttr(name)}" type="${escapeAttr(type)}" value="${escapeAttr(value === null || value === undefined ? '' : value)}" ${attrs}></div>`;
  }
  function selectField(name, label, list, selected = '', attrs = '', placeholder = 'Не указано') {
    return `<div class="field"><label>${escapeHtml(label)}</label><select class="form-control" name="${escapeAttr(name)}" ${attrs}><option value="">${escapeHtml(placeholder)}</option>${options(list, selected)}</select></div>`;
  }
  function textareaField(name, label, value = '', attrs = '') { return `<div class="field full"><label>${escapeHtml(label)}</label><textarea class="form-control" name="${escapeAttr(name)}" ${attrs}>${escapeHtml(value || '')}</textarea></div>`; }
  function section(label, first = false) { return `<div class="form-section ${first ? 'first' : ''}">${escapeHtml(label)}</div>`; }
  function checkboxField(name, label, checked) { return `<div class="field"><label>${escapeHtml(label)}</label><label class="checkbox"><input name="${escapeAttr(name)}" type="checkbox" ${checked ? 'checked' : ''}> Да</label></div>`; }

  function bindSubmit(formId, action, after, transform = value => value) {
    const form = $('#' + formId);
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const button = form.querySelector('[type=submit]'); const oldText = button.textContent;
      button.disabled = true; button.textContent = 'Сохраняем…';
      try {
        const payload = transform(formData(form), form);
        const result = await api(action, payload);
        closeModal(); toast('Данные сохранены.', 'success');
        state.cache.employeeList = null;
        await after(result);
      } catch (error) {
        toast(errorMessage(error), 'error', 7000); button.disabled = false; button.textContent = oldText;
      }
    });
  }

  function formData(form) {
    const data = Object.fromEntries(new FormData(form).entries());
    form.querySelectorAll('input[type=checkbox]').forEach(input => { data[input.name] = input.checked; });
    form.querySelectorAll('select[multiple]').forEach(select => { data[select.name] = Array.from(select.selectedOptions).map(option => option.value); });
    return data;
  }

  async function openOfferForm(offer = null) {
    if (!state.cache.offers) state.cache.offers = await api('offers.get');
    const employees = state.cache.offers?.employees || [];
    const body = `${section('Основные данные', true)}
      ${selectField('employeeId', 'Сотрудник из реестра (необязательно)', employees.map(item => ({ value: item.employeeId, label: item.fullName })), offer?.employeeId || '', 'id="offerEmployee"')}
      ${field('fullName', 'ФИО *', offer?.fullName || '', 'text', 'required')}
      ${datalistField('department', 'Подразделение *', state.refs.departments || [], offer?.department || '', true)}
      ${datalistField('position', 'Должность *', state.refs.positions || [], offer?.position || '', true)}
      ${field('amount', 'Сумма оплаты, ₽ *', offer?.amount ?? '', 'number', 'required min="0" step="100"')}
      ${field('offerDate', 'Дата оффера *', offer?.offerDate || todayIso(), 'date', 'required')}
      ${selectField('status', 'Статус', ['Действует', 'Принят', 'Отклонен', 'Отозван', 'Архив'], offer?.status || 'Действует')}
      ${textareaField('comment', 'Комментарий', offer?.comment || '')}
      ${field('offerId', '', offer?.offerId || '', 'hidden')}`;
    openModal(offer ? 'Изменить оффер' : 'Новый оффер', formShell('offerForm', body), '');
    bindSubmit('offerForm', 'offers.save', async () => renderRoute());
  }

  function motivationItemRow(item = {}, index = 0) {
    return `<div class="motivation-item-row" data-motivation-row>
      <div class="motivation-item-number">${index + 1}</div>
      <div class="field"><label>Блок</label><input class="form-control" data-item-field="section" value="${escapeAttr(item.section || '')}" placeholder="Продажи, KPI, суточные"></div>
      <div class="field"><label>Показатель</label><input class="form-control" data-item-field="metric" value="${escapeAttr(item.metric || '')}" placeholder="Оборот, прибыль, клиент"></div>
      <div class="field full"><label>Условие / порог</label><input class="form-control" data-item-field="condition" value="${escapeAttr(item.condition || '')}" placeholder="Например: 90–99% / от 100%"></div>
      <div class="field"><label>Вознаграждение *</label><input class="form-control" data-item-field="reward" value="${escapeAttr(item.reward || '')}" placeholder="10%, 15 000 ₽, 700 ₽/сутки"></div>
      <div class="field"><label>Период</label><input class="form-control" data-item-field="period" value="${escapeAttr(item.period || '')}" placeholder="Месяц, квартал, за факт"></div>
      <div class="field full"><label>Комментарий</label><input class="form-control" data-item-field="comment" value="${escapeAttr(item.comment || '')}"></div>
      <button type="button" class="btn small danger motivation-remove" data-action="motivation:remove-item" aria-label="Удалить условие">×</button>
    </div>`;
  }

  function openMotivationForm(offer) {
    const current = offer.currentVersion || null;
    const items = current?.items?.length ? current.items : [{}];
    const nextVersion = Number(current?.versionNumber || 0) + 1;
    const content = `<form id="motivationForm" class="form-grid">
      ${section(`Новая версия ${nextVersion}`, true)}
      ${field('title', 'Название версии *', current ? `${current.title} — изменение` : 'Первичная мотивация', 'text', 'required')}
      ${field('baseSalary', 'Фиксированный оклад, ₽', current?.baseSalary ?? '', 'number', 'min="0" step="100"')}
      ${field('effectiveFrom', 'Действует с *', todayIso(), 'date', 'required')}
      ${field('changeReason', 'Причина изменения *', current ? '' : 'Первичная версия', 'text', 'required')}
      ${textareaField('notes', 'Общие примечания', current?.notes || '')}
      <div class="form-section">Условия мотивации</div>
      <div class="motivation-items full" id="motivationItems">${items.map(motivationItemRow).join('')}</div>
      <div class="full"><button type="button" class="btn" data-action="motivation:add-item">＋ Добавить условие</button></div>
      <input type="hidden" name="offerId" value="${escapeAttr(offer.offerId)}">
      <div class="form-actions"><button type="button" class="btn" data-action="modal:close">Отмена</button><button type="submit" class="btn primary">Сохранить новую версию</button></div>
    </form>`;
    openModal(`Мотивация · ${offer.fullName}`, content, 'wide');
    const form = $('#motivationForm');
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const button = form.querySelector('[type=submit]'); const oldText = button.textContent;
      button.disabled = true; button.textContent = 'Сохраняем…';
      try {
        const payload = formData(form);
        payload.items = Array.from(form.querySelectorAll('[data-motivation-row]')).map((row, index) => {
          const item = { order: index + 1 };
          row.querySelectorAll('[data-item-field]').forEach(input => { item[input.dataset.itemField] = input.value; });
          return item;
        });
        await api('offers.motivation.save', payload);
        closeModal(); toast('Новая версия мотивации сохранена. Предыдущая осталась в истории.', 'success', 7000); await renderRoute();
      } catch (error) { toast(errorMessage(error), 'error', 7000); button.disabled = false; button.textContent = oldText; }
    });
  }

  function motivationVersionCard(version) {
    return `<article class="motivation-version-card ${version.current ? 'current' : ''}">
      <header><div><strong>Версия ${escapeHtml(version.versionNumber)} · ${escapeHtml(version.title)}</strong><small>Действует с ${dateRu(version.effectiveFrom)} · создал ${escapeHtml(version.createdBy || '—')} · ${dateRu(version.createdAt)}</small></div>${version.current ? '<span class="badge green">Текущая</span>' : '<span class="badge gray">Архивная</span>'}</header>
      <div class="motivation-meta"><span>Оклад: <strong>${version.baseSalary === '' || version.baseSalary === null || version.baseSalary === undefined ? 'не указан' : moneyRu(version.baseSalary)}</strong></span><span>Причина: <strong>${escapeHtml(version.changeReason || '—')}</strong></span></div>
      ${(version.items || []).length ? `<div class="table-wrap"><table class="data-table compact"><thead><tr><th>Блок</th><th>Показатель</th><th>Условие</th><th>Вознаграждение</th><th>Период</th></tr></thead><tbody>${version.items.map(item => `<tr><td>${orDash(item.section)}</td><td>${orDash(item.metric)}</td><td>${orDash(item.condition)}</td><td class="cell-title">${orDash(item.reward)}</td><td>${orDash(item.period)}</td></tr>`).join('')}</tbody></table></div>` : emptyInline('Условия не заполнены')}
      ${version.notes ? `<p class="motivation-notes">${escapeHtml(version.notes)}</p>` : ''}
    </article>`;
  }

  async function openOfferHistory(offerId) {
    const data = await api('offers.history', { offerId });
    const versions = data.versions || [];
    const audit = (data.events || []).map(event => `<div class="audit-row"><span>${dateRu(event.createdAt)}</span><strong>${escapeHtml(event.createdBy || '—')}</strong><span>${(event.changes || []).map(change => `${escapeHtml(change.field)}: ${escapeHtml(change.before || '—')} → ${escapeHtml(change.after || '—')}`).join('<br>')}</span></div>`).join('');
    openModal(`История · ${data.offer.fullName}`, `<div class="history-summary"><strong>${moneyRu(data.offer.amount)}</strong><span>${escapeHtml(data.offer.department)} · ${escapeHtml(data.offer.position)}</span></div><div class="motivation-history">${versions.length ? versions.map(motivationVersionCard).join('') : emptyInline('Версии мотивации еще не создавались.')}</div><h3 class="subhead">Журнал изменений</h3><div class="audit-list">${audit || emptyInline('Изменений пока нет.')}</div>`, 'wide');
  }

  async function openEmployeeForm(employee = null) {
    const p = employee || {};
    const managers = (state.refs.managers || []).filter(m => m.id !== p.employeeId);
    const body = `
      <input type="hidden" name="employeeId" value="${escapeAttr(p.employeeId || '')}">
      ${section('Личные данные', true)}
      ${field('surname', 'Фамилия *', p.surname, 'text', 'required')}${field('name', 'Имя *', p.name, 'text', 'required')}${field('patronymic', 'Отчество', p.patronymic)}${selectField('gender', 'Пол', state.refs.genders, p.gender)}${field('birthDate', 'Дата рождения', p.birthDate, 'date')}${field('phone', 'Телефон', p.phone, 'tel')}${field('email', 'Email', p.email, 'email')}
      ${section('Работа в компании')}
      ${datalistField('department', 'Подразделение *', state.refs.departments, p.department, true)}${datalistField('position', 'Должность *', state.refs.positions, p.position, true)}${datalistField('location', 'Локация', state.refs.locations, p.location)}${field('hireDate', 'Дата приема (приказ) *', p.hireDate || todayIso(), 'date', 'required')}${field('plannedStartDate', 'Планируемая дата выхода', p.plannedStartDate || '', 'date')}${field('startDate', 'Дата фактического выхода', p.startDate || '', 'date')}${managerField('managerId', 'Руководитель', managers, p.managerId)}${managerField('mentorId', 'Наставник', managers, p.mentorId)}${field('hrOwner', 'Ответственный HR (email)', p.hrOwner, 'email')}${selectField('employmentType', 'Тип занятости', state.refs.employmentTypes, p.employmentType || 'Основная')}${field('fte', 'FTE', p.fte === '' || p.fte === undefined ? 1 : p.fte, 'number', 'min="0.1" max="2" step="0.1"')}${selectField('workFormat', 'Формат работы', state.refs.workFormats, p.workFormat)}${selectField('criticalRole', 'Критичная роль', ['Да', 'Нет'], p.criticalRole)}
      ${section('Учет рабочего времени')}
      ${checkboxField('timesheetIncluded', 'Учитывать в табеле', employee ? p.timesheetIncluded !== false : true)}${field('timesheetNumber', 'Табельный номер', p.timesheetNumber || '')}${field('skudFullName', 'ФИО для СКУД', p.skudFullName || '', 'text', 'placeholder="Оставьте пустым, если совпадает с ФИО"')}${textareaField('timesheetExclusionReason', 'Причина исключения из табеля', p.timesheetExclusionReason || '')}${employee ? `<div class="field"><label>Статус исключения</label><div class="readonly-value">${escapeHtml(p.timesheetExclusionStatus || 'Не требуется')}<small>${p.timesheetExclusionConfirmedBy ? `Решил: ${escapeHtml(p.timesheetExclusionConfirmedBy)} · ${dateRu(p.timesheetExclusionConfirmedAt)}` : 'Решение еще не принято'}</small></div></div>` : ''}<div class="hint full">Сопоставление идет по ФИО без учета регистра, лишних пробелов и Е/Ё. Если написание в СКУД отличается, укажите его здесь. После снятия признака и указания причины HR/HRD должен подтвердить заявку в модуле «Табель → Исключения».</div>
      ${section('Подбор и испытательный срок')}
      <div class="field"><label>ИС до от даты приема</label><div class="readonly-value">${dateRu(p.probationEndFromHire)}<small>Рассчитывается автоматически</small></div></div><div class="field"><label>ИС до от даты выхода</label><div class="readonly-value">${dateRu(p.probationEndFromStart)}<small>Рассчитывается автоматически</small></div></div>
      ${datalistField('hiringSource', 'Источник найма', state.refs.hiringSources, p.hiringSource)}${field('recruiter', 'Рекрутер', p.recruiter)}${field('vacancyId', 'Vacancy ID', p.vacancyId)}${field('individualProbationDays', 'Индивидуальный срок ИС, дней', p.individualProbationDays, 'number', 'min="1" max="365" step="1"')}${selectField('probationStatus', 'Статус ИС', state.refs.probationStatuses, p.probationStatus || 'Нет данных')}${field('probationResult', 'Результат ИС', p.probationResult)}${selectField('documentsStatus', 'Документы после 1 месяца', ['Не оформлены', 'Оформлены'], p.documentsStatus || 'Не оформлены')}${field('documentsDate', 'Дата оформления документов', p.documentsDate, 'date')}${textareaField('hrComment', 'Комментарий HR', p.hrComment)}`;
    openModal(employee ? 'Редактирование сотрудника' : 'Новый сотрудник', formShell('employeeForm', body, employee ? 'Сохранить изменения' : 'Создать сотрудника'));
    bindSubmit('employeeForm', 'employees.save', async result => { await refreshBootstrapReferences(); navigate('employee', result.employeeId); });
  }

  function datalistField(name, label, list, value = '', required = false) {
    const id = `${name}List`;
    return `<div class="field"><label>${escapeHtml(label)}</label><input class="form-control" name="${escapeAttr(name)}" value="${escapeAttr(value || '')}" list="${id}" ${required ? 'required' : ''}><datalist id="${id}">${(list || []).map(v => `<option value="${escapeAttr(v)}"></option>`).join('')}</datalist></div>`;
  }
  function managerField(name, label, list, selected) {
    return `<div class="field"><label>${escapeHtml(label)}</label><select class="form-control" name="${escapeAttr(name)}"><option value="">Не указан</option>${(list || []).map(v => `<option value="${escapeAttr(v.id)}" ${String(v.id) === String(selected || '') ? 'selected' : ''}>${escapeHtml(v.label)} · ${escapeHtml(v.id)}</option>`).join('')}</select></div>`;
  }

  async function openDismissForm(employeeId) {
    const card = state.cache.employeeCard && state.cache.employeeCard.profile.employeeId === employeeId ? state.cache.employeeCard : await api('employees.get', { employeeId });
    const p = card.profile;
    const body = `<input type="hidden" name="employeeId" value="${escapeAttr(employeeId)}">${field('dismissalDate', 'Дата увольнения *', todayIso(), 'date', 'required')}${datalistField('dismissalReason', 'Причина увольнения *', state.refs.dismissalReasons, '', true)}${selectField('initiator', 'Инициатор *', state.refs.initiators, '', 'required')}${textareaField('comment', 'Комментарий HR')}`;
    openModal(`Увольнение: ${p.fullName}`, formShell('dismissForm', body, 'Оформить увольнение', true), 'small');
    bindSubmit('dismissForm', 'employees.dismiss', async result => navigate('employee', result.employeeId));
  }

  function openDocumentForm(record = null, employeeId = '') {
    const r = record || {};
    const targetEmployeeId = r.employeeId || employeeId || (state.cache.employeeCard && state.cache.employeeCard.profile.employeeId) || '';
    if (!targetEmployeeId) throw new Error('Не указан сотрудник для документа.');
    const body = `<input type="hidden" name="documentId" value="${escapeAttr(r.documentId || '')}"><input type="hidden" name="employeeId" value="${escapeAttr(targetEmployeeId)}">${datalistField('type', 'Тип документа *', state.refs.documentTypes, r.type, true)}${field('details', 'Номер / реквизиты', r.details)}${field('planDate', 'Плановая дата', r.planDate, 'date')}${field('completionDate', 'Дата оформления', r.completionDate, 'date')}${selectField('status', 'Статус', state.refs.documentStatuses || ['К оформлению', 'Оформлены', 'Не требуется'], r.status || 'К оформлению')}${field('owner', 'Ответственный', r.owner)}${field('fileUrl', 'Прямая ссылка на файл', r.fileUrl, 'url', 'placeholder="https://…"')}${textareaField('comment', 'Комментарий', r.comment)}`;
    openModal(record ? 'Документ: редактирование' : 'Новый документ', formShell('documentForm', body));
    bindSubmit('documentForm', 'documents.save', async () => navigate('employee', targetEmployeeId));
  }

  async function openEventForm() {
    const employees = (await getEmployeeList()).employees;
    const body = `${employeeSelectField(employees, '')}${selectField('type', 'Тип события *', state.refs.eventTypes, '', 'required')}${field('date', 'Дата *', todayIso(), 'date', 'required')}${datalistField('departmentAfter', 'Подразделение после', state.refs.departments)}${datalistField('positionAfter', 'Должность после', state.refs.positions)}${managerField('managerIdAfter', 'Руководитель после', state.refs.managers, '')}${field('fteAfter', 'FTE после', '', 'number', 'min="0.1" max="2" step="0.1"')}${field('document', 'Документ / №')}${textareaField('reason', 'Основание / причина')}${textareaField('comment', 'Комментарий')}`;
    openModal('Новое кадровое событие', formShell('eventForm', body));
    bindSubmit('eventForm', 'events.save', async () => renderRoute());
  }

  function employeeSelectField(employees, selected, name = 'employeeId', required = true) {
    return `<div class="field"><label>Сотрудник${required ? ' *' : ''}</label><select class="form-control" name="${escapeAttr(name)}" ${required ? 'required' : ''}><option value="">Выберите</option>${employees.map(e => `<option value="${escapeAttr(e.employeeId)}" ${e.employeeId === selected ? 'selected' : ''}>${escapeHtml(e.fullName)} · ${escapeHtml(e.employeeId)}</option>`).join('')}</select></div>`;
  }

  function employeeMultiSelectField(name, label, employees, selected = []) {
    const chosen = new Set(selected || []);
    return `<div class="field full"><label>${escapeHtml(label)}</label><select class="form-control multi-select" name="${escapeAttr(name)}" multiple size="9">${(employees || []).map(employee => `<option value="${escapeAttr(employee.employeeId)}" ${chosen.has(employee.employeeId) ? 'selected' : ''}>${escapeHtml(employee.fullName)} · ${escapeHtml(employee.department || 'без подразделения')} · ${escapeHtml(employee.employeeId)}</option>`).join('')}</select><div class="hint">Для выбора нескольких сотрудников удерживайте Ctrl. На macOS — Command.</div></div>`;
  }

  async function openVacancyForm(vacancy = null) {
    const v = vacancy || {};
    const body = `<input type="hidden" name="vacancyId" value="${escapeAttr(v.vacancyId || '')}">${field('openDate', 'Дата открытия *', v.openDate || todayIso(), 'date', 'required')}${datalistField('position', 'Должность *', state.refs.positions, v.position, true)}${datalistField('department', 'Подразделение *', state.refs.departments, v.department, true)}${datalistField('location', 'Локация', state.refs.locations, v.location)}${managerField('managerId', 'Руководитель-заказчик', state.refs.managers, v.managerId)}${field('recruiter', 'Рекрутер', v.recruiter)}${field('positions', 'Количество ставок', v.positions || 1, 'number', 'min="1" step="1"')}${selectField('priority', 'Приоритет', state.refs.vacancyPriorities, v.priority || 'Средний')}${field('planCloseDate', 'Плановая дата закрытия', v.planCloseDate, 'date')}${selectField('status', 'Статус', state.refs.vacancyStatuses, v.status || 'Открыта')}${textareaField('reason', 'Причина открытия', v.reason)}${textareaField('comment', 'Комментарий', v.comment)}`;
    openModal(vacancy ? 'Редактирование вакансии' : 'Открыть вакансию', formShell('vacancyForm', body));
    bindSubmit('vacancyForm', 'vacancies.save', async result => navigate('vacancy', result.vacancyId));
  }

  function openCloseVacancyForm(vacancy) {
    const body = `<input type="hidden" name="vacancyId" value="${escapeAttr(vacancy.vacancyId)}">${field('closeDate', 'Дата закрытия *', todayIso(), 'date', 'required')}${field('closeSource', 'Источник закрытия')}${textareaField('comment', 'Комментарий', vacancy.comment)}`;
    openModal('Закрыть вакансию', formShell('closeVacancyForm', body, 'Закрыть вакансию', true), 'small');
    bindSubmit('closeVacancyForm', 'vacancies.close', async () => renderRoute());
  }

  async function openCandidateForm(candidate = null, vacancyId = '') {
    const c = candidate || {};
    let vacancies = (state.cache.recruitment && state.cache.recruitment.vacancies) || [];
    if (!vacancies.length && hasModule('recruitment')) vacancies = (await api('recruitment.get')).vacancies;
    const body = `<input type="hidden" name="candidateId" value="${escapeAttr(c.candidateId || '')}">${selectField('vacancyId', 'Vacancy ID *', vacancies.map(v => ({ value: v.vacancyId, label: `${v.vacancyId} · ${v.position}` })), c.vacancyId || vacancyId, 'required')}${field('addedDate', 'Дата добавления', c.addedDate || todayIso(), 'date')}${field('fullName', 'ФИО кандидата *', c.fullName, 'text', 'required')}${field('contact', 'Телефон / email', c.contact)}${datalistField('source', 'Источник', state.refs.hiringSources, c.source)}${selectField('status', 'Статус', state.refs.candidateStatuses, c.status || 'Новый')}${selectField('screening', 'Скрининг', ['Да', 'Нет'], c.screening)}${selectField('hrInterview', 'Интервью HR', ['Да', 'Нет'], c.hrInterview)}${field('interviewDate', 'Дата интервью', c.interviewDate, 'date')}${selectField('offer', 'Оффер', ['Да', 'Нет'], c.offer)}${field('offerDate', 'Дата оффера', c.offerDate, 'date')}${selectField('started', 'Вышел', ['Да', 'Нет'], c.started)}${field('startDate', 'Дата выхода', c.startDate, 'date')}${field('recruiter', 'Рекрутер', c.recruiter)}${textareaField('rejectionReason', 'Причина отказа / отклонения', c.rejectionReason)}${textareaField('comment', 'Комментарий', c.comment)}`;
    openModal(candidate ? 'Кандидат: редактирование' : 'Новый кандидат', formShell('candidateForm', body));
    bindSubmit('candidateForm', 'candidates.save', async result => navigate('vacancy', result.vacancyId));
  }

  async function openAdaptationForm(record = null) {
    const r = record || {}; const employees = (await getEmployeeList()).employees;
    const body = `<input type="hidden" name="adaptId" value="${escapeAttr(r.adaptId || '')}">${employeeSelectField(employees, r.employeeId || '')}${datalistField('checkpoint', 'Название точки *', state.refs.checkpoints, r.checkpoint, true)}${field('offsetDays', 'День от даты выхода', r.offsetDays, 'number', 'min="0" max="365" step="1"')}${field('planDate', 'Плановая дата (если без смещения)', r.planDate, 'date')}${field('actualDate', 'Фактическая дата', r.actualDate, 'date')}${scoreField('employeeScore', 'Оценка сотрудника', r.employeeScore)}${scoreField('managerScore', 'Оценка руководителя', r.managerScore)}${scoreField('taskScore', 'Понимание задач', r.taskScore)}${scoreField('teamScore', 'Команда', r.teamScore)}${scoreField('learningScore', 'Обучение', r.learningScore)}${selectField('risk', 'Риск', state.refs.risks, r.risk)}${textareaField('problem', 'Проблема / сигнал', r.problem)}${textareaField('action', 'Действие HR', r.action)}${field('owner', 'Ответственный', r.owner)}${field('actionDue', 'Срок действия', r.actionDue, 'date')}${field('actionStatus', 'Статус действия', r.actionStatus)}${state.permissions.canManageHr ? textareaField('hrComment', 'Комментарий HR', r.hrComment) : ''}<div class="hint full">Если заполнен «День от даты выхода», плановая дата рассчитывается автоматически и переносится с выходного на следующий понедельник. Для разовой точки оставьте смещение пустым и укажите дату вручную.</div>`;
    openModal(record ? 'Контрольная точка: редактирование' : 'Новая контрольная точка', formShell('adaptationForm', body));
    bindSubmit('adaptationForm', 'adaptation.save', async result => state.route.page === 'employee' ? renderRoute() : navigate('adaptation'));
  }

  function scoreField(name, label, value) { return field(name, `${label} (1–5)`, value, 'number', 'min="1" max="5" step="1"'); }

  async function openLearningForm(record = null) {
    const r = record || {}; const employees = (await getEmployeeList()).employees;
    const body = `<input type="hidden" name="learningId" value="${escapeAttr(r.learningId || '')}">${employeeSelectField(employees, r.employeeId || '')}${datalistField('program', 'Программа *', state.refs.trainingPrograms, r.program, true)}${selectField('type', 'Тип', state.refs.trainingTypes, r.type)}${field('assignedDate', 'Дата назначения', r.assignedDate || todayIso(), 'date')}${field('deadline', 'Дедлайн', r.deadline, 'date')}${selectField('status', 'Статус', state.refs.trainingStatuses, r.status || 'Назначено')}${field('completionDate', 'Дата завершения', r.completionDate, 'date')}${field('testResult', 'Результат теста, %', r.testResult, 'number', 'min="0" max="100"')}${field('hours', 'Часы', r.hours, 'number', 'min="0" step="0.5"')}${selectField('mandatory', 'Обязательное', ['Да', 'Нет'], r.mandatory)}${field('owner', 'Ответственный', r.owner)}${textareaField('comment', 'Комментарий', r.comment)}`;
    openModal(record ? 'Обучение: редактирование' : 'Назначить обучение', formShell('learningForm', body));
    bindSubmit('learningForm', 'learning.save', async () => renderRoute());
  }

  async function openSurveyForm(record = null) {
    const r = record || {}; const employees = (await getEmployeeList()).employees;
    const body = `<input type="hidden" name="responseId" value="${escapeAttr(r.responseId || '')}">${field('date', 'Дата', r.date || todayIso(), 'date')}${selectField('type', 'Тип опроса *', state.refs.surveyTypes, r.type, 'required')}${checkboxField('anonymous', 'Анонимный ответ', r.anonymous)}${employeeSelectField(employees, r.employeeId || '')}${datalistField('department', 'Подразделение для анонимного ответа', state.refs.departments, r.department)}${field('surveyId', 'Survey ID', r.surveyId)}${field('tenurePoint', 'Стаж / точка', r.tenurePoint)}${field('enps', 'eNPS (0–10)', r.enps, 'number', 'min="0" max="10"')}${scoreField('engagement', 'Вовлеченность', r.engagement)}${scoreField('managerScore', 'Руководитель', r.managerScore)}${scoreField('teamScore', 'Команда', r.teamScore)}${scoreField('conditions', 'Условия', r.conditions)}${scoreField('workload', 'Нагрузка', r.workload)}${scoreField('development', 'Развитие', r.development)}${selectField('risk', 'Риск', state.refs.risks, r.risk)}${textareaField('employeeComment', 'Комментарий сотрудника', r.employeeComment)}${textareaField('hrComment', 'Комментарий HR', r.hrComment)}${field('source', 'Источник', r.source || 'Веб-форма')}`;
    openModal(record ? 'Ответ опроса: редактирование' : 'Добавить ответ опроса', formShell('surveyForm', body));
    const anon = $('#surveyForm [name=anonymous]'), employeeSelect = $('#surveyForm [name=employeeId]');
    const sync = () => { employeeSelect.required = !anon.checked; employeeSelect.closest('.field').style.opacity = anon.checked ? '.55' : '1'; };
    anon.addEventListener('change', sync); sync();
    bindSubmit('surveyForm', 'surveys.save', async () => renderRoute());
  }

  function openTimesheetCellForm(button) {
    const data = state.cache.timesheet;
    const codes = (data.codes || []).map(item => ({ value: item.code, label: `${item.code} — ${item.name}` }));
    const body = `<input type="hidden" name="period" value="${escapeAttr(data.period)}"><input type="hidden" name="employeeId" value="${escapeAttr(button.dataset.employee)}"><input type="hidden" name="date" value="${escapeAttr(button.dataset.date)}"><div class="field"><label>Сотрудник</label><div class="readonly-value">${escapeHtml(button.dataset.name)}<small>${dateRu(button.dataset.date)}</small></div></div>${selectField('code', 'Код дня *', codes, button.dataset.code || 'Я', 'required', 'Выберите код')}${field('hours', 'Фактические часы', button.dataset.hours, 'number', 'min="0" max="24" step="0.25"')}${textareaField('comment', 'Комментарий', button.dataset.comment)}`;
    openModal('Изменить день табеля', formShell('timesheetCellForm', body), 'small');
    bindSubmit('timesheetCellForm', 'timesheet.save', async () => renderRoute());
  }

  function openSkudImportForm() {
    const data = state.cache.timesheet;
    const body = `${field('period', 'Месяц данных СКУД *', data.period, 'month', 'required')}<div class="field full"><label>Файл СКУД (.xlsx)</label><input class="form-control" name="skudFile" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" required></div><div class="hint full">Сначала выберите месяц, к которому относится файл. Для месячной матрицы дни 1–31 будут записаны именно в выбранный месяц. Для журнала событий даты вне выбранного месяца не загружаются.</div><div class="hint full">Поддерживаются журнал событий со столбцами «ФИО» и «Дата» и месячная матрица «Статистика входов». Сверка выполняется по нормализованному ФИО.</div>`;
    openModal('Загрузить выгрузку СКУД', formShell('skudImportForm', body, 'Загрузить и сверить'), 'small');
    const form = $('#skudImportForm');
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const file = form.elements.skudFile.files[0];
      if (!file) return toast('Выберите файл .xlsx.', 'error');
      const selectedPeriod = form.elements.period.value;
      if (!/^\d{4}-\d{2}$/.test(selectedPeriod)) return toast('Выберите месяц данных СКУД.', 'error');
      if (!/\.xlsx$/i.test(file.name)) return toast('Нужен файл формата .xlsx.', 'error');
      if (file.size > 12 * 1024 * 1024) return toast('Максимальный размер файла — 12 МБ.', 'error');
      const button = form.querySelector('[type=submit]'); button.disabled = true; button.textContent = 'Сверяем…';
      try {
        const base64 = await fileToDataUrl(file);
        const result = await api('timesheet.importSkud', { period: selectedPeriod, fileName: file.name, base64 });
        closeModal();
        state.timesheetPeriod = result.period || selectedPeriod;
        toast(`СКУД за ${state.timesheetPeriod} загружен (${result.profile || 'формат распознан'}): сопоставлено ${result.matched}, расхождений ${result.differences}, уволенных ${result.dismissed}, не найдено ${result.unmatched}.`, result.unmatched || result.dismissed ? 'error' : 'success', 10000);
        state.timesheetTab = result.differences ? 'differences' : 'imports';
        await renderRoute();
      } catch (error) { toast(errorMessage(error), 'error', 9000); button.disabled = false; button.textContent = 'Загрузить и сверить'; }
    });
  }

  function openTimesheetDifferenceForm(item) {
    if (!item) throw new Error('Расхождение не найдено на текущем экране.');
    const acceptDisabled = !item.employeeId || item.type === 'Уволен в СКУД' || item.skudHours === '' || item.skudHours === null;
    const resolutions = [{ value: 'Оставить табель', label: 'Оставить данные табеля' }];
    if (!acceptDisabled) resolutions.push({ value: 'Принять СКУД', label: 'Принять часы из СКУД' });
    resolutions.push({ value: 'Исключить из итога', label: 'Исключить запись из итога' });
    const body = `<input type="hidden" name="differenceId" value="${escapeAttr(item.differenceId)}"><div class="field full"><label>Расхождение</label><div class="readonly-value">${escapeHtml(item.fullName)} · ${dateRu(item.date)}<small>${escapeHtml(item.type)} · табель ${item.code || '—'}/${item.timesheetHours || '—'} · СКУД ${item.skudHours || '—'} ч</small></div></div>${selectField('resolution', 'Решение *', resolutions, '', 'required', 'Выберите решение')}${textareaField('comment', 'Комментарий решения', item.comment)}`;
    openModal('Разрешить расхождение', formShell('timesheetDifferenceForm', body, 'Применить'), 'small');
    bindSubmit('timesheetDifferenceForm', 'timesheet.resolve', async () => renderRoute());
  }

  function openSkudControlForm(item) {
    if (!item) throw new Error('Запись контроля не найдена.');
    const body = `<input type="hidden" name="issueId" value="${escapeAttr(item.issueId)}"><div class="field full"><label>Сотрудник</label><div class="readonly-value">${escapeHtml(item.fullName)}<small>уволен ${dateRu(item.dismissalDate)} · последний проход ${dateRu(item.lastSkudDate)}</small></div></div>${selectField('status', 'Статус *', ['Обнаружено', 'Требует проверки', 'Запрос направлен', 'Удален из СКУД', 'Допустимое исключение', 'Закрыто'], item.status, 'required')}${textareaField('comment', 'Комментарий', item.comment)}`;
    openModal('Контроль записи СКУД', formShell('skudControlForm', body), 'small');
    bindSubmit('skudControlForm', 'timesheet.control', async () => renderRoute());
  }

  function openTimesheetExclusionForm(item = null) {
    const employees = state.cache.timesheet?.accessEmployees || [];
    const employeeOptions = employees.map(employee => ({ value: employee.employeeId, label: `${employee.fullName} · ${employee.department || 'без подразделения'}` }));
    const body = `${selectField('employeeId', 'Сотрудник *', employeeOptions, item?.employeeId || '', 'required', 'Выберите сотрудника')}${textareaField('reason', 'Причина исключения *', item?.reason || '', 'required')}<div class="hint full">После сохранения появится заявка. До отдельного подтверждения HR/HRD сотрудник остается в табеле и блокирует итоговую выгрузку.</div>`;
    openModal(item ? 'Изменить исключение' : 'Новое исключение из табеля', formShell('timesheetExclusionForm', body, 'Создать заявку'), 'small');
    if (item) $('#timesheetExclusionForm').elements.employeeId.disabled = true;
    bindSubmit('timesheetExclusionForm', 'timesheet.exclusion.request', async () => renderRoute(), (payload, form) => ({ ...payload, employeeId: form.elements.employeeId.value }));
  }

  function openTimesheetAccessForm(item = null) {
    const r = item || {};
    const employees = state.cache.timesheet.accessEmployees || [];
    const managers = employees.map(employee => ({ value: employee.employeeId, label: `${employee.fullName} · ${employee.department || 'без подразделения'}` }));
    const scopes = ['Подразделение', 'Прямые подчиненные', 'Все подчиненные', 'Выбранные сотрудники'];
    const body = `<input type="hidden" name="originalEmail" value="${escapeAttr(r.email || '')}"><input type="hidden" name="originalDepartment" value="${escapeAttr(r.department || '')}"><input type="hidden" name="originalScope" value="${escapeAttr(r.accessScope || 'Подразделение')}"><input type="hidden" name="originalManagerId" value="${escapeAttr(r.managerId || '')}">${field('email', 'Email *', r.email, 'email', 'required')}${selectField('accessScope', 'Область доступа *', scopes, r.accessScope || 'Подразделение', 'required')}${datalistField('department', 'Подразделение', state.cache.timesheet.departments || state.refs.departments, r.department, false)}${selectField('managerId', 'Руководитель', managers, r.managerId || '', '', 'Выберите руководителя')}${employeeMultiSelectField('employeeIds', 'Конкретные сотрудники', employees, r.employeeIds || [])}${field('timesheetRole', 'Роль в табеле', r.timesheetRole || 'Табельщик подразделения')}${checkboxField('canDaily', 'Ежедневное заполнение', item ? r.canDaily : true)}${checkboxField('canMonthly', 'Ежемесячная проверка', item ? r.canMonthly : true)}${checkboxField('canExport', 'Выгрузка Excel', !!r.canExport)}${checkboxField('canClose', 'Закрытие периода', !!r.canClose)}${checkboxField('active', 'Активен', item ? r.active : true)}${textareaField('comment', 'Комментарий', r.comment)}<div class="hint full">Импорт СКУД выполняют только HR и HRD. Выборочные правила ограничивают не только строки на экране, но и серверное сохранение.</div>`;
    openModal(item ? 'Доступ к табелю: редактирование' : 'Новый доступ к табелю', formShell('timesheetAccessForm', body));
    const form = $('#timesheetAccessForm');
    const syncScope = () => {
      const scope = form.elements.accessScope.value;
      const department = form.elements.department.closest('.field');
      const manager = form.elements.managerId.closest('.field');
      const selected = form.elements.employeeIds.closest('.field');
      department.hidden = scope !== 'Подразделение';
      manager.hidden = scope !== 'Прямые подчиненные' && scope !== 'Все подчиненные';
      selected.hidden = scope !== 'Выбранные сотрудники';
      form.elements.department.required = scope === 'Подразделение';
      form.elements.managerId.required = scope === 'Прямые подчиненные' || scope === 'Все подчиненные';
      form.elements.employeeIds.required = scope === 'Выбранные сотрудники';
    };
    form.elements.accessScope.addEventListener('change', syncScope); syncScope();
    bindSubmit('timesheetAccessForm', 'timesheet.access.save', async () => renderRoute());
  }

  function openDirectoryForm(item = null, presetType = '') {
    const i = item || {}; const knownTypes = (state.cache.directories && state.cache.directories.types) || Object.keys(DEFAULT_DIRECTORY_TYPES);
    const body = `<input type="hidden" name="refId" value="${escapeAttr(i.refId || '')}">${datalistField('type', 'Тип справочника *', knownTypes, i.type || presetType, true)}${field('value', 'Значение *', i.value, 'text', 'required')}${field('parent', 'Родитель', i.parent)}${checkboxField('active', 'Активен', item ? i.active : true)}${textareaField('comment', 'Комментарий', i.comment)}`;
    openModal(item ? 'Справочник: редактирование' : 'Новая запись справочника', formShell('directoryForm', body), 'small');
    bindSubmit('directoryForm', 'directories.save', async () => { state.cache.directories = null; state.bootstrap = null; await refreshBootstrapReferences(); navigate('directories'); });
  }

  function openSettingForm(item) {
    const body = `<input type="hidden" name="parameter" value="${escapeAttr(item.parameter)}">${field('value', 'Значение', item.value)}${textareaField('comment', 'Комментарий', item.comment)}<input type="hidden" name="usage" value="${escapeAttr(item.usage || '')}">`;
    openModal(`Настройка: ${item.parameter}`, formShell('settingForm', body), 'small');
    bindSubmit('settingForm', 'settings.save', async () => renderRoute());
  }

  async function openRoleForm(role = null) {
    const r = role || {}; const employees = (await getEmployeeList()).employees;
    const body = `${field('email', 'Email *', r.email, 'email', 'required')}${selectField('role', 'Роль *', ['HRD', 'HR', 'Руководитель', 'Табельщик'], r.role || 'HR', 'required')}${employeeSelectField(employees, r.employeeId || '', 'employeeId', false)}${checkboxField('active', 'Активен', role ? r.active : true)}${textareaField('comment', 'Комментарий', r.comment)}`;
    openModal(role ? 'Роль: редактирование' : 'Новая роль', formShell('roleForm', body), 'small');
    bindSubmit('roleForm', 'roles.save', async () => renderRoute());
  }

  function openAdaptationTemplateForm(item = null) {
    const i = item || {};
    const body = `<input type="hidden" name="templateId" value="${escapeAttr(i.templateId || '')}">${field('name', 'Название точки *', i.name, 'text', 'required')}${field('offsetDays', 'День от даты выхода *', i.offsetDays, 'number', 'required min="0" max="365" step="1"')}${datalistField('department', 'Подразделение (необязательно)', state.refs.departments, i.department)}${datalistField('position', 'Должность (необязательно)', state.refs.positions, i.position)}${selectField('employmentType', 'Тип занятости (необязательно)', state.refs.employmentTypes, i.employmentType)}${field('owner', 'Ответственный', i.owner)}${checkboxField('active', 'Активен', item ? i.active : true)}${textareaField('comment', 'Комментарий', i.comment)}<div class="hint full">Пустые условия означают «для всех». Если несколько активных шаблонов имеют один день, применяется наиболее точный.</div>`;
    openModal(item ? 'Шаблон адаптации: редактирование' : 'Новый шаблон адаптации', formShell('adaptationTemplateForm', body));
    bindSubmit('adaptationTemplateForm', 'adaptationTemplates.save', async () => renderRoute());
  }

  function openCalendarForm(item = null) {
    const i = item || {};
    const body = `<input type="hidden" name="originalDate" value="${escapeAttr(i.date || '')}">${field('date', 'Дата *', i.date || todayIso(), 'date', 'required')}${selectField('dayType', 'Тип дня *', state.refs.dayTypes || ['Рабочий', 'Выходной', 'Праздник'], i.dayType || 'Праздник', 'required')}${field('name', 'Название', i.name)}${checkboxField('active', 'Учитывать', item ? i.active : true)}${textareaField('comment', 'Комментарий', i.comment)}`;
    openModal(item ? 'Рабочий календарь: редактирование' : 'Добавить исключение календаря', formShell('calendarForm', body), 'small');
    bindSubmit('calendarForm', 'calendar.save', async () => renderRoute());
  }

  function openResolveQualityForm(rowNumber, employeeId) {
    const body = `<input type="hidden" name="rowNumber" value="${rowNumber}">${field('employeeId', 'Employee ID', employeeId)}${textareaField('comment', 'Что проверено и исправлено', '', 'required')}`;
    openModal('Закрыть ручную проверку', formShell('qualityResolveForm', body, 'Отметить решенной'), 'small');
    bindSubmit('qualityResolveForm', 'quality.resolve', async () => renderRoute());
  }

  async function refreshBootstrapReferences() {
    const data = await api('bootstrap'); state.refs = data.references || {}; state.permissions = data.permissions || state.permissions; updateNotificationBadge(Number(data.notificationCount || 0));
  }

  async function handleAction(button) {
    const action = button.dataset.action;
    if (!action) return;
    if (action === 'modal:close') return closeModal();
    if (action === 'app:retry') return bootstrap();
    if (action === 'page:retry') return renderRoute();
    if (action === 'notifications:open') return openNotifications();
    if (action === 'notification:read') { await api('notifications.read', { notificationId: button.dataset.id }); toast('Уведомление отмечено прочитанным.', 'success'); return openNotifications(); }
    if (action === 'offer:new') return openOfferForm();
    if (action === 'offer:edit') return openOfferForm((state.cache.offers?.offers || []).find(item => item.offerId === button.dataset.id));
    if (action === 'offer:amount') {
      const offer = (state.cache.offers?.offers || []).find(item => item.offerId === button.dataset.id);
      const input = button.closest('[data-offer-row]')?.querySelector('.offer-amount-input');
      if (!offer || !input) throw new Error('Карточка оффера не найдена.');
      await api('offers.save', { ...offer, currentVersion: undefined, versionCount: undefined, amount: input.value });
      toast('Текущая сумма оффера обновлена.', 'success'); return renderRoute();
    }
    if (action === 'offer:motivation') {
      const offer = (state.cache.offers?.offers || []).find(item => item.offerId === button.dataset.id);
      if (!offer) throw new Error('Карточка оффера не найдена.');
      return openMotivationForm(offer);
    }
    if (action === 'offer:history') return openOfferHistory(button.dataset.id);
    if (action === 'motivation:add-item') {
      const root = $('#motivationItems'); const count = root?.querySelectorAll('[data-motivation-row]').length || 0;
      if (root) root.insertAdjacentHTML('beforeend', motivationItemRow({}, count));
      return;
    }
    if (action === 'motivation:remove-item') {
      const rows = document.querySelectorAll('[data-motivation-row]');
      if (rows.length <= 1) return toast('В версии должно остаться хотя бы одно условие.', 'error');
      button.closest('[data-motivation-row]')?.remove();
      document.querySelectorAll('.motivation-item-number').forEach((node, index) => { node.textContent = String(index + 1); });
      return;
    }
    if (action === 'employee:new') return openEmployeeForm();
    if (action === 'employee:edit' || action === 'quality:edit') { const card = await api('employees.get', { employeeId: button.dataset.id }); return openEmployeeForm(card.profile); }
    if (action === 'employee:dismiss') return openDismissForm(button.dataset.id);
    if (action === 'document:new') return openDocumentForm(null, button.dataset.id);
    if (action === 'document:edit') { const all = (state.cache.employeeCard && state.cache.employeeCard.documents) || []; return openDocumentForm(all.find(r => r.documentId === button.dataset.id)); }
    if (action === 'employee:tab') { state.employeeTab = button.dataset.tab; document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === state.employeeTab)); $('#employeeTabPanel').innerHTML = employeeTabContent(state.cache.employeeCard, state.employeeTab); return; }
    if (action === 'quality:resolve') return openResolveQualityForm(button.dataset.row, button.dataset.id || '');
    if (action === 'event:new') return openEventForm();
    if (action === 'vacancy:new') return openVacancyForm();
    if (action === 'vacancy:edit') { const data = state.cache.vacancyCard && state.cache.vacancyCard.vacancy.vacancyId === button.dataset.id ? state.cache.vacancyCard : await api('vacancies.get', { vacancyId: button.dataset.id }); return openVacancyForm(data.vacancy); }
    if (action === 'vacancy:close') { const data = state.cache.vacancyCard && state.cache.vacancyCard.vacancy.vacancyId === button.dataset.id ? state.cache.vacancyCard : await api('vacancies.get', { vacancyId: button.dataset.id }); return openCloseVacancyForm(data.vacancy); }
    if (action === 'candidate:new') return openCandidateForm(null, button.dataset.vacancy || '');
    if (action === 'candidate:edit') { const all = (state.cache.recruitment && state.cache.recruitment.candidates) || (state.cache.vacancyCard && state.cache.vacancyCard.candidates) || []; return openCandidateForm(all.find(c => c.candidateId === button.dataset.id)); }
    if (action === 'adaptation:new') return openAdaptationForm();
    if (action === 'adaptation:edit') { const all = (state.cache.adaptation && state.cache.adaptation.records) || (state.cache.employeeCard && state.cache.employeeCard.adaptation) || []; return openAdaptationForm(all.find(r => r.adaptId === button.dataset.id)); }
    if (action === 'adaptation:sync') { const result = await api('adaptation.sync'); toast(`План обновлен: создано ${result.created}, пересчитано ${result.updated}.`, 'success', 6000); return renderRoute(); }
    if (action === 'learning:new') return openLearningForm();
    if (action === 'learning:edit') { const all = (state.cache.learning && state.cache.learning.records) || (state.cache.employeeCard && state.cache.employeeCard.learning) || []; return openLearningForm(all.find(r => r.learningId === button.dataset.id)); }
    if (action === 'survey:new') return openSurveyForm();
    if (action === 'survey:edit') { const all = (state.cache.surveys && state.cache.surveys.records) || (state.cache.employeeCard && state.cache.employeeCard.surveys) || []; return openSurveyForm(all.find(r => r.responseId === button.dataset.id)); }
    if (action === 'survey:sync') { const result = await api('surveys.sync'); const suffix = result.errors && result.errors.length ? ` Ошибки: ${result.errors.join(' ')}` : ''; toast(`Импортировано: ${result.imported}; пропущено: ${result.skipped}.${suffix}`, result.errors && result.errors.length ? 'error' : 'success', 9000); return renderRoute(); }
    if (action === 'timesheet:tab') { if (hasUnsavedTimesheetEdits() && !window.confirm('Есть несохраненные изменения табеля. Перейти без сохранения?')) return; state.timesheetEdits = {}; state.timesheetTab = button.dataset.tab; document.querySelectorAll('.timesheet-tabs .tab').forEach(tab => tab.classList.toggle('active', tab.dataset.tab === state.timesheetTab)); $('#timesheetPanel').innerHTML = timesheetTabContent(state.cache.timesheet, state.timesheetTab); updateTimesheetEditBar(); return; }
    if (action === 'timesheet:prepare') { const result = await api('timesheet.prepare', { period: state.timesheetPeriod, department: state.timesheetDepartment }); toast(`Месяц сформирован: сотрудников ${result.employees}, добавлено дней ${result.created}.`, 'success', 7000); return renderRoute(); }
    if (action === 'timesheet:cell') { if (hasUnsavedTimesheetEdits()) return toast('Сначала сохраните массовые изменения, затем откройте часы и комментарий.', 'error', 6000); return openTimesheetCellForm(button); }
    if (action === 'timesheet:save-batch') { const entries = Object.values(state.timesheetEdits || {}); if (!entries.length) return; button.disabled = true; const oldText = button.textContent; button.textContent = 'Сохраняем…'; try { const result = await api('timesheet.saveBatch', { period: state.timesheetPeriod, entries }); state.timesheetEdits = {}; toast(`Сохранено ячеек: ${result.saved}.`, 'success', 6000); return renderRoute(); } finally { button.disabled = false; button.textContent = oldText; } }
    if (action === 'timesheet:import') return openSkudImportForm();
    if (action === 'timesheet:export') { button.disabled = true; const oldText = button.textContent; button.textContent = 'Готовим файл…'; try { const result = await api('timesheet.export', { period: state.timesheetPeriod, department: state.timesheetDepartment }); downloadBase64(result.base64, result.mimeType, result.fileName); toast(`Excel сформирован: ${result.rows} сотрудников.`, 'success', 8000); } finally { button.disabled = false; button.textContent = oldText; } return; }
    if (action === 'timesheet:status') { const status = button.dataset.status; if (status === 'Закрыт' && !window.confirm('Закрыть период? После закрытия ежедневное редактирование будет недоступно.')) return; await api('timesheet.period', { period: state.timesheetPeriod, department: state.timesheetDepartment, status }); toast(`Период: ${status}.`, 'success'); return renderRoute(); }
    if (action === 'timesheet:resolve') return openTimesheetDifferenceForm((state.cache.timesheet.differences || []).find(item => item.differenceId === button.dataset.id));
    if (action === 'timesheet:control') return openSkudControlForm((state.cache.timesheet.controls || []).find(item => item.issueId === button.dataset.id));
    if (action === 'timesheet:exclusion:new') return openTimesheetExclusionForm();
    if (action === 'timesheet:exclusion:edit') return openTimesheetExclusionForm((state.cache.timesheet.exclusionRequests || []).find(item => item.employeeId === button.dataset.id));
    if (action === 'timesheet:exclusion') { const decision = button.dataset.decision; if (!window.confirm(`${decision} исключение сотрудника?`)) return; await api('timesheet.exclusion', { employeeId: button.dataset.id, decision, period: state.timesheetPeriod }); toast(decision === 'Подтвердить' ? 'Сотрудник будет исключен из итогового Excel.' : 'Заявка отклонена, сотрудник возвращен в табель.', 'success', 7000); return renderRoute(); }
    if (action === 'timesheet:access:new') return openTimesheetAccessForm();
    if (action === 'timesheet:access:edit') return openTimesheetAccessForm((state.cache.timesheet.accessRows || []).find(item => item.email === button.dataset.email && item.department === button.dataset.department && item.accessScope === button.dataset.scope && item.managerId === button.dataset.manager));
    if (action === 'directory:group') { state.directoryGroup = button.dataset.group; document.querySelectorAll('.directory-tabs .tab').forEach(tab => tab.classList.toggle('active', tab.dataset.group === state.directoryGroup)); return filterDirectories(); }
    if (action === 'directory:new') return openDirectoryForm(null, button.dataset.type || '');
    if (action === 'directory:edit') return openDirectoryForm(state.cache.directories.items.find(i => i.refId === button.dataset.id));
    if (action === 'directory:toggle') { await api('directories.toggle', { refId: button.dataset.id, active: button.dataset.active === 'true' }); toast('Статус справочника изменен.', 'success'); return renderRoute(); }
    if (action === 'setting:edit') return openSettingForm(state.cache.settings.settings.find(i => i.parameter === button.dataset.param));
    if (action === 'role:new') return openRoleForm();
    if (action === 'role:edit') return openRoleForm(state.cache.settings.roles.find(r => r.email === button.dataset.email));
    if (action === 'template:new') return openAdaptationTemplateForm();
    if (action === 'template:edit') return openAdaptationTemplateForm((state.cache.settings.adaptationTemplates || []).find(i => i.templateId === button.dataset.id));
    if (action === 'calendar:new') return openCalendarForm();
    if (action === 'calendar:edit') return openCalendarForm((state.cache.settings.calendar || []).find(i => i.date === button.dataset.date));
  }

  document.addEventListener('click', event => {
    const action = event.target.closest('[data-action]');
    if (action) { event.preventDefault(); Promise.resolve(handleAction(action)).catch(error => toast(errorMessage(error), 'error', 7000)); return; }
    const nav = event.target.closest('[data-nav]');
    if (nav) { event.preventDefault(); closeModal(); navigate(nav.dataset.nav, nav.dataset.id || ''); }
  });
  document.addEventListener('change', event => {
    const select = event.target.closest('.ts-code-select');
    if (select) updateTimesheetCell(select);
    if (event.target.id === 'offerEmployee' && event.target.value) {
      const employee = (state.cache.offers?.employees || []).find(item => item.employeeId === event.target.value);
      const form = event.target.closest('form');
      if (employee && form) {
        form.elements.fullName.value = employee.fullName || '';
        form.elements.department.value = employee.department || '';
        form.elements.position.value = employee.position || '';
      }
    }
  });

  window.addEventListener('popstate', () => {
    const url = new URL(window.location.href);
    navigate(url.searchParams.get('page') || 'hr', url.searchParams.get('id') || '', { fromPop: true });
  });
  $('#mobileMenuButton').addEventListener('click', () => $('#sidebar').classList.toggle('open'));
  document.addEventListener('keydown', event => { if (event.key === 'Escape') closeModal(); });

  function closeSidebar() { $('#sidebar').classList.remove('open'); }
  function options(list, selected = '') {
    return (list || []).map(item => {
      const value = typeof item === 'object' ? item.value : item;
      const label = typeof item === 'object' ? item.label : item;
      return `<option value="${escapeAttr(value)}" ${String(value) === String(selected || '') ? 'selected' : ''}>${escapeHtml(label)}</option>`;
    }).join('');
  }
  function statusBadge(value) {
    if (!value) return '—';
    const text = String(value);
    let cls = 'gray';
    if (/\b(Работает|Завершено|Завершен|Прошел|Зеленый|Открыта|Открыт|Закрыт|Оформлены|Рабочий|Активен|Решено)\b/i.test(text)) cls = 'green';
    if (/(Красный|Высокая|Уволен|Просрочен|Не прошел|Требует решения)/i.test(text)) cls = 'red';
    if (/(Желтый|Средняя|На испытательном|В процессе|Назначено|К оформлению|Праздник|Выходной|На проверке)/i.test(text)) cls = 'orange';
    return `<span class="badge ${cls}">${escapeHtml(text)}</span>`;
  }
  function yesNoBadge(value) { return String(value).toLowerCase() === 'да' ? '<span class="badge green">Да</span>' : '<span class="badge gray">Нет</span>'; }
  function dateRu(value) { if (!value) return '—'; const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/); return match ? `${match[3]}.${match[2]}.${match[1]}` : escapeHtml(value); }
  function moneyRu(value) { const amount = Number(value); return Number.isFinite(amount) ? `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(amount)} ₽` : '—'; }
  function dateValue(value) { if (!value) return 0; const date = new Date(`${String(value).slice(0, 10)}T00:00:00`); return isNaN(date.getTime()) ? 0 : date.getTime(); }
  function startToday() { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); }
  function todayIso() { const d = new Date(); const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000); return local.toISOString().slice(0, 10); }
  function fileToDataUrl(file) { return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(new Error('Не удалось прочитать файл.')); reader.readAsDataURL(file); }); }
  function downloadBase64(base64, mimeType, fileName) { const raw = atob(base64); const chunks = []; for (let start = 0; start < raw.length; start += 8192) { const part = raw.slice(start, start + 8192); const bytes = new Uint8Array(part.length); for (let i = 0; i < part.length; i += 1) bytes[i] = part.charCodeAt(i); chunks.push(bytes); } const url = URL.createObjectURL(new Blob(chunks, { type: mimeType })); const link = document.createElement('a'); link.href = url; link.download = fileName; document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
  function tenureLabel(days) { if (days === '' || days === null || days === undefined) return '—'; const n = Number(days); if (n < 31) return `${n} дн.`; if (n < 365) return `${Math.floor(n / 30)} мес.`; return `${Math.floor(n / 365)} г. ${Math.floor((n % 365) / 30)} мес.`; }
  function orDash(value) { return value === '' || value === null || value === undefined ? '—' : escapeHtml(value); }
  function emptyInline(text) { return `<div class="empty-state" style="padding:24px 10px">${escapeHtml(text)}</div>`; }
  function escapeHtml(value) { return String(value === null || value === undefined ? '' : value).replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char])); }
  function escapeAttr(value) { return escapeHtml(value).replace(/`/g, '&#96;'); }
  function errorMessage(error) { return error && error.message ? error.message : String(error || 'Неизвестная ошибка'); }
  function showAlert(message) { alertRoot.textContent = message; alertRoot.hidden = false; }
  function clearAlert() { alertRoot.hidden = true; alertRoot.textContent = ''; }
  function toast(message, type = '', timeout = 4000) { const el = document.createElement('div'); el.className = `toast ${type}`; el.textContent = message; toastRoot.appendChild(el); setTimeout(() => el.remove(), timeout); }

  const DEFAULT_DIRECTORY_TYPES = {};
  bootstrap();
})();
