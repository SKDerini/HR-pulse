const DB_NAME = 'hr-stroyakov-v2';
const DB_VERSION = 1;
const RECORDS = 'records';
const META = 'meta';

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Ошибка локальной базы данных.'));
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error('Транзакция локальной базы не выполнена.'));
    transaction.onabort = () => reject(transaction.error || new Error('Транзакция локальной базы отменена.'));
  });
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      const records = db.createObjectStore(RECORDS, { keyPath: 'key' });
      records.createIndex('entity', 'entity', { unique: false });
      records.createIndex('entityPeriod', ['entity', 'period'], { unique: false });
      records.createIndex('entityEmployee', ['entity', 'employeeId'], { unique: false });
      records.createIndex('entityEmail', ['entity', 'email'], { unique: false });
      db.createObjectStore(META, { keyPath: 'key' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Не удалось открыть локальную базу.'));
  });
}

function normalizeFilters(filters = {}) {
  return Object.entries(filters).filter(([, value]) => value !== '' && value !== null && value !== undefined);
}

export class LocalDatabase {
  constructor() {
    this.mode = 'preview';
    this.label = 'Локальная база предпросмотра';
    this.dbPromise = openDatabase();
  }

  async list(entity, filters = {}) {
    const db = await this.dbPromise;
    const tx = db.transaction(RECORDS, 'readonly');
    const rows = await requestResult(tx.objectStore(RECORDS).index('entity').getAll(entity));
    const activeFilters = normalizeFilters(filters);
    return rows
      .filter(row => activeFilters.every(([key, value]) => {
        const rowValue = row[key] ?? row.payload?.[key];
        return Array.isArray(value) ? value.includes(rowValue) : String(rowValue ?? '') === String(value);
      }))
      .map(row => structuredClone(row.payload));
  }

  async get(entity, recordId) {
    const db = await this.dbPromise;
    const tx = db.transaction(RECORDS, 'readonly');
    const row = await requestResult(tx.objectStore(RECORDS).get(`${entity}:${recordId}`));
    return row ? structuredClone(row.payload) : null;
  }

  async put(entity, recordId, payload, indexes = {}) {
    const db = await this.dbPromise;
    const tx = db.transaction(RECORDS, 'readwrite');
    tx.objectStore(RECORDS).put(this.toRow(entity, recordId, payload, indexes));
    await transactionDone(tx);
    return structuredClone(payload);
  }

  async bulkPut(entity, records) {
    if (!records.length) return [];
    const db = await this.dbPromise;
    const tx = db.transaction(RECORDS, 'readwrite');
    const store = tx.objectStore(RECORDS);
    records.forEach(record => store.put(this.toRow(entity, record.recordId, record.payload, record.indexes)));
    await transactionDone(tx);
    return records.map(record => structuredClone(record.payload));
  }

  async remove(entity, recordId) {
    const db = await this.dbPromise;
    const tx = db.transaction(RECORDS, 'readwrite');
    tx.objectStore(RECORDS).delete(`${entity}:${recordId}`);
    await transactionDone(tx);
  }

  async getMeta(key) {
    const db = await this.dbPromise;
    const tx = db.transaction(META, 'readonly');
    const row = await requestResult(tx.objectStore(META).get(key));
    return row ? structuredClone(row.value) : null;
  }

  async setMeta(key, value) {
    const db = await this.dbPromise;
    const tx = db.transaction(META, 'readwrite');
    tx.objectStore(META).put({ key, value: structuredClone(value) });
    await transactionDone(tx);
  }

  async clear() {
    const db = await this.dbPromise;
    const tx = db.transaction([RECORDS, META], 'readwrite');
    tx.objectStore(RECORDS).clear();
    tx.objectStore(META).clear();
    await transactionDone(tx);
  }

  async exportAll() {
    const db = await this.dbPromise;
    const tx = db.transaction([RECORDS, META], 'readonly');
    const records = await requestResult(tx.objectStore(RECORDS).getAll());
    const meta = await requestResult(tx.objectStore(META).getAll());
    return { format: 'hr-stroyakov-v2', exportedAt: new Date().toISOString(), records, meta };
  }

  async importAll(snapshot) {
    if (!snapshot || snapshot.format !== 'hr-stroyakov-v2' || !Array.isArray(snapshot.records)) {
      throw new Error('Выбранный JSON не является резервной копией HR Строяков 2.0.');
    }
    const db = await this.dbPromise;
    const tx = db.transaction([RECORDS, META], 'readwrite');
    const recordStore = tx.objectStore(RECORDS);
    const metaStore = tx.objectStore(META);
    recordStore.clear();
    metaStore.clear();
    snapshot.records.forEach(row => recordStore.put(row));
    (snapshot.meta || []).forEach(row => metaStore.put(row));
    await transactionDone(tx);
  }

  async stats() {
    const snapshot = await this.exportAll();
    const entities = {};
    snapshot.records.forEach(row => { entities[row.entity] = (entities[row.entity] || 0) + 1; });
    return Object.entries(entities).sort((a, b) => a[0].localeCompare(b[0])).map(([entity, count]) => ({ entity, count }));
  }

  async currentUser() {
    const actor = await this.getMeta('previewActor');
    return actor || { email: 'hrd@example.test' };
  }

  async setPreviewActor(email) {
    await this.setMeta('previewActor', { email: String(email || '').trim().toLowerCase() });
  }

  toRow(entity, recordId, payload, indexes = {}) {
    const safe = structuredClone(payload);
    return {
      key: `${entity}:${recordId}`,
      entity,
      recordId,
      employeeId: indexes.employeeId ?? safe.employeeId ?? '',
      managerId: indexes.managerId ?? safe.managerId ?? '',
      department: indexes.department ?? safe.department ?? '',
      period: indexes.period ?? safe.period ?? '',
      recordDate: indexes.recordDate ?? safe.date ?? safe.recordDate ?? '',
      email: String(indexes.email ?? safe.email ?? '').toLowerCase(),
      updatedAt: new Date().toISOString(),
      payload: safe
    };
  }
}
