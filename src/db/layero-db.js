const SESSION_KEY = 'hr-stroyakov-layero-session';
const ENTITIES = ['employees', 'roles', 'settings', 'directory_items', 'events', 'vacancies', 'candidates', 'adaptations', 'adaptation_templates', 'learning', 'surveys', 'documents', 'notifications', 'work_calendar', 'review', 'timesheet_codes', 'timesheet_access', 'timesheet_entries', 'timesheet_periods', 'skud_imports', 'timesheet_differences', 'skud_controls', 'offers', 'offer_motivation_versions', 'offer_events'];
const ID_FIELDS = { employees: 'employeeId', roles: 'email', settings: 'parameter', directory_items: 'refId', events: 'eventId', vacancies: 'vacancyId', candidates: 'candidateId', adaptations: 'adaptId', adaptation_templates: 'templateId', learning: 'learningId', surveys: 'responseId', documents: 'documentId', notifications: 'notificationId', work_calendar: 'date', review: 'reviewId', timesheet_codes: 'code', timesheet_access: 'accessId', timesheet_entries: 'entryId', timesheet_periods: 'periodId', skud_imports: 'importId', timesheet_differences: 'differenceId', skud_controls: 'issueId', offers: 'offerId', offer_motivation_versions: 'versionId', offer_events: 'eventId' };

function loadSession() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch { return null; }
}

function saveSession(session) {
  if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  else localStorage.removeItem(SESSION_KEY);
}

export class LayeroDatabase {
  constructor(url, key) {
    this.mode = 'layero';
    this.label = 'Layero PostgreSQL подключена';
    this.url = String(url || '').replace(/\/$/, '');
    this.key = key;
    this.session = loadSession();
  }

  async signIn(email, password) {
    const response = await fetch(`${this.url}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', apikey: this.key },
      body: JSON.stringify({ email, password })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error_description || data.msg || data.message || 'Не удалось войти.');
    this.session = data;
    saveSession(data);
    return data.user;
  }

  async signOut() {
    if (this.session?.access_token) {
      await fetch(`${this.url}/auth/v1/logout`, { method: 'POST', headers: this.headers() }).catch(() => null);
    }
    this.session = null;
    saveSession(null);
  }

  async currentUser() {
    if (!this.session?.access_token) return null;
    const response = await this.request('/auth/v1/user', { method: 'GET' }, true).catch(() => null);
    return response && response.id ? response : null;
  }

  headers(extra = {}) {
    return {
      apikey: this.key,
      authorization: this.session?.access_token ? `Bearer ${this.session.access_token}` : `Bearer ${this.key}`,
      ...extra
    };
  }

  async refreshSession() {
    if (!this.session?.refresh_token) return false;
    const response = await fetch(`${this.url}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', apikey: this.key },
      body: JSON.stringify({ refresh_token: this.session.refresh_token })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.access_token) { this.session = null; saveSession(null); return false; }
    this.session = data; saveSession(data); return true;
  }

  async request(path, options = {}, allowRefresh = true) {
    const response = await fetch(`${this.url}${path}`, {
      ...options,
      headers: this.headers(options.headers || {})
    });
    if (response.status === 401 && allowRefresh && await this.refreshSession()) return this.request(path, options, false);
    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    if (!response.ok) throw new Error(data?.message || data?.hint || data?.details || `Ошибка Data API (${response.status}).`);
    return data;
  }

  async rpc(name, args = {}) {
    return this.request(`/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(args)
    });
  }

  async list(entity, filters = {}) {
    return this.rpc('hr_query', { p_entity: entity, p_filters: filters || {} });
  }

  async get(entity, recordId) {
    const rows = await this.list(entity, { recordId });
    return rows[0] || null;
  }

  async put(entity, recordId, payload, indexes = {}) {
    return this.rpc('hr_record_upsert', {
      p_entity: entity,
      p_record_id: recordId,
      p_payload: payload,
      p_indexes: indexes || {}
    });
  }

  async bulkPut(entity, records) {
    return this.rpc('hr_records_bulk_upsert', {
      p_entity: entity,
      p_records: records.map(item => ({ recordId: item.recordId, payload: item.payload, indexes: item.indexes || {} }))
    });
  }

  async remove(entity, recordId) {
    return this.rpc('hr_record_delete', { p_entity: entity, p_record_id: recordId });
  }

  async exportAll() {
    const records = [];
    for (const entity of ENTITIES) {
      const rows = await this.list(entity);
      rows.forEach(payload => records.push({ entity, recordId: String(payload[ID_FIELDS[entity]] || ''), payload, employeeId: payload.employeeId || '', managerId: payload.managerId || '', department: payload.department || '', period: payload.period || '', recordDate: payload.date || payload.planDate || '', email: payload.email || '' }));
    }
    return { format: 'hr-stroyakov-v2', exportedAt: new Date().toISOString(), records, meta: [] };
  }

  async importAll(snapshot) {
    if (!snapshot || snapshot.format !== 'hr-stroyakov-v2' || !Array.isArray(snapshot.records)) throw new Error('Некорректная резервная копия.');
    const groups = snapshot.records.filter(row => row.entity && row.payload).reduce((result, row) => {
      (result[row.entity] ||= []).push(row);
      return result;
    }, {});
    for (const [entity, records] of Object.entries(groups)) {
      for (let offset = 0; offset < records.length; offset += 500) {
        await this.bulkPut(entity, records.slice(offset, offset + 500).map(row => ({ recordId: row.recordId, payload: row.payload, indexes: { employeeId: row.employeeId || row.payload.employeeId || '', managerId: row.managerId || row.payload.managerId || '', department: row.department || row.payload.department || '', period: row.period || row.payload.period || '', recordDate: row.recordDate || row.payload.date || row.payload.planDate || '', email: row.email || row.payload.email || '' } })));
      }
    }
  }

  async stats() {
    const snapshot = await this.exportAll();
    return ENTITIES.map(entity => ({ entity, count: snapshot.records.filter(row => row.entity === entity).length })).filter(item => item.count);
  }

  async getMeta(key) {
    const rows = await this.list('system', { recordId: key });
    return rows[0]?.value ?? null;
  }

  async setMeta(key, value) {
    return this.put('system', key, { recordId: key, value });
  }
}
