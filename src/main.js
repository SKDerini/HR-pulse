import './styles.css';
import { LocalDatabase } from './db/local-db.js';
import { LayeroDatabase } from './db/layero-db.js';
import { createHrApi } from './api.js';

const dataUrl = import.meta.env.VITE_LAYERO_DATA_URL;
const dataKey = import.meta.env.VITE_LAYERO_DATA_KEY;
const db = dataUrl && dataKey ? new LayeroDatabase(dataUrl, dataKey) : new LocalDatabase();

if (db.mode === 'layero' && !(await db.currentUser())) {
  renderLogin();
} else {
  await startApplication();
}

async function startApplication() {
  const service = createHrApi(db);
  window.HR_API = (action, payload) => service.handle(action, payload);
  window.HR_RUNTIME_LABEL = db.label;
  window.HR_INITIAL_ROUTE = Object.fromEntries(new URLSearchParams(location.search));

  await import('./legacy-app.js');

  const activeActor = await service.actor();
  if (db.mode === 'preview' || activeActor.role === 'HRD') {
    const button = document.querySelector('#databaseButton');
    button.hidden = false;
    button.textContent = db.mode === 'preview' ? 'База предпросмотра' : 'База данных';
    button.addEventListener('click', () => openDatabaseManager(service));
  }
  if (db.mode === 'layero') {
    const actorCard = document.querySelector('#actorCard');
    actorCard.title = 'Нажмите, чтобы выйти';
    actorCard.style.cursor = 'pointer';
    actorCard.addEventListener('click', async () => {
      if (!confirm('Выйти из HR-системы?')) return;
      await db.signOut();
      location.reload();
    });
  }
}

function renderLogin() {
  document.body.innerHTML = `
    <main class="login-screen">
      <section class="login-card">
        <div class="brand"><div class="brand-main">СТР<span>О</span>ЯКОВ</div><div class="brand-sub">МЫ СНАБЖАЕМ</div></div>
        <h1>Вход в HR-систему</h1>
        <p>Используйте учетную запись, созданную в базе Layero. Доступ к данным определяется ролью HRD, HR, руководителя или табельщика.</p>
        <form id="loginForm">
          <label>Email<input class="form-control" name="email" type="email" autocomplete="username" required></label>
          <label>Пароль<input class="form-control" name="password" type="password" autocomplete="current-password" required></label>
          <div id="loginError" class="login-error" role="alert"></div>
          <button class="btn primary" type="submit">Войти</button>
        </form>
      </section>
    </main>`;
  const form = document.querySelector('#loginForm');
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const button = form.querySelector('button'); const error = document.querySelector('#loginError');
    button.disabled = true; button.textContent = 'Входим…'; error.textContent = '';
    try { await db.signIn(form.email.value, form.password.value); location.reload(); }
    catch (failure) { error.textContent = failure.message || String(failure); button.disabled = false; button.textContent = 'Войти'; }
  });
}

async function openDatabaseManager(service) {
  const root = document.querySelector('#runtimeRoot');
  const [stats, actor, roles] = await Promise.all([db.stats(), service.actor(), db.list('roles')]);
  const previewControls = db.mode === 'preview' ? `
    <label class="field" style="min-width:300px"><span>Проверить роль</span><select id="previewActor" class="form-control">${roles.filter(item => item.active !== false).map(item => `<option value="${escapeHtml(item.email)}" ${item.email === actor.email ? 'selected' : ''}>${escapeHtml(item.role)} — ${escapeHtml(item.email)}</option>`).join('')}</select></label>` : '';
  const resetControl = db.mode === 'preview' ? '<button id="runtimeReset" class="btn danger" type="button">Сбросить демо-базу</button>' : '';
  root.innerHTML = `
    <div class="runtime-dialog" role="dialog" aria-modal="true" aria-labelledby="runtimeTitle">
      <section class="runtime-card">
        <header class="runtime-head"><div><h2 id="runtimeTitle">${db.mode === 'preview' ? 'База предпросмотра' : 'База Layero'}</h2><p>${db.mode === 'preview' ? 'Данные сохраняются в IndexedDB этого браузера и остаются после обновления страницы.' : 'Данные загружены через защищенный Layero Data API.'}</p></div><button id="runtimeClose" class="icon-button" type="button" aria-label="Закрыть">×</button></header>
        <div class="runtime-body">
          <div class="runtime-actions">
            ${previewControls}
            <button id="runtimeExport" class="btn" type="button">Скачать JSON</button>
            <label class="btn" for="runtimeImport">Загрузить JSON</label><input id="runtimeImport" type="file" accept="application/json,.json" hidden>
            ${resetControl}
          </div>
          <table class="runtime-table"><thead><tr><th>Набор данных</th><th>Записей</th></tr></thead><tbody>${stats.map(item => `<tr><td>${escapeHtml(item.entity)}</td><td>${item.count}</td></tr>`).join('')}</tbody></table>
          <div class="runtime-note">Работайте с данными через формы в модулях — они записывают изменения в эту базу. JSON-выгрузка нужна для резервной копии и переноса данных между предпросмотром и рабочей базой.</div>
        </div>
      </section>
    </div>`;
  root.querySelector('#runtimeClose').addEventListener('click', () => { root.innerHTML = ''; });
  root.querySelector('.runtime-dialog').addEventListener('click', event => { if (event.target.classList.contains('runtime-dialog')) root.innerHTML = ''; });
  root.querySelector('#previewActor')?.addEventListener('change', async event => { await service.changePreviewActor(event.target.value); location.reload(); });
  root.querySelector('#runtimeExport').addEventListener('click', async () => {
    const snapshot = await db.exportAll(); downloadJson(snapshot, `HR_Строяков_предпросмотр_${new Date().toISOString().slice(0, 10)}.json`);
  });
  root.querySelector('#runtimeImport').addEventListener('change', async event => {
    const file = event.target.files[0]; if (!file) return;
    try { await db.importAll(JSON.parse(await file.text())); location.reload(); } catch (failure) { alert(failure.message || String(failure)); }
  });
  root.querySelector('#runtimeReset')?.addEventListener('click', async () => {
    if (!confirm('Удалить все изменения предпросмотра и вернуть демонстрационные данные?')) return;
    await db.clear(); location.reload();
  });
}

function downloadJson(value, name) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 500);
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}
