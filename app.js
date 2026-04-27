// ─────────────────────────────────────────────
//  CONFIG
// ─────────────────────────────────────────────
const SB_URL = 'https://dwbnxhzqktpakzgqhnxb.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR3Ym54aHpxa3RwYWt6Z3FobnhiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcwNDYxODAsImV4cCI6MjA5MjYyMjE4MH0._-kgSj3uH5Y28FyZrW7QF7LKZIjWT9cNfNwFQD5hixc';

const HEADERS = {
  'apikey': SB_KEY,
  'Authorization': `Bearer ${SB_KEY}`,
  'Content-Type': 'application/json'
};

// ─────────────────────────────────────────────
//  STATE
// ─────────────────────────────────────────────
let myVisa        = '';
let pendingUser   = null;
let schedules     = [];
let productModels = [];
let myEntries     = [];
let currentTab    = 'planning';

// Admin
let isAdminMode     = false;
let adminVisas      = [];
let adminUsers      = [];
let adminSubTab     = 'visas';
let editingSchedObj = null;
let schedEditor     = {
  weekStartDate: '',
  weekType: 'Matin',
  hideSaturday: false,
  dayStatuses: ['', '', '', '', '', ''],
  assignments: {}   // visa → [cat_day0, cat_day1, ..., cat_day5]
};

// Offline
let offlineQueue = [];

const CATS = [
  { key: 'ZAC1',      label: 'ZAC1',      color: '#007AFF', cls: 'cat-zac1',
    visas: p => ['mondayZAC1','tuesdayZAC1','wednesdayZAC1','thursdayZAC1','fridayZAC1','saturdayZAC1'].map(k => p[k] || []) },
  { key: 'ZAC2',      label: 'ZAC2',      color: '#34C759', cls: 'cat-zac2',
    visas: p => ['mondayZAC2','tuesdayZAC2','wednesdayZAC2','thursdayZAC2','fridayZAC2','saturdayZAC2'].map(k => p[k] || []) },
  { key: 'Vérif',     label: 'Vérif',     color: '#AF52DE', cls: 'cat-verif',
    visas: p => ['mondayVerif','tuesdayVerif','wednesdayVerif','thursdayVerif','fridayVerif','saturdayVerif'].map(k => p[k] || []) },
  { key: 'Formation', label: 'Formation', color: '#5AC8FA', cls: 'cat-formation',
    visas: p => ['mondayFormation','tuesdayFormation','wednesdayFormation','thursdayFormation','fridayFormation','saturdayFormation'].map(k => p[k] || []) },
  { key: 'Congés',    label: 'Congés',    color: '#FF9500', cls: 'cat-conges',
    visas: p => ['mondayConges','tuesdayConges','wednesdayConges','thursdayConges','fridayConges','saturdayConges'].map(k => p[k] || []) },
  { key: 'Maladie',   label: 'Maladie',   color: '#FF3B30', cls: 'cat-maladie',
    visas: p => ['mondayMaladie','tuesdayMaladie','wednesdayMaladie','thursdayMaladie','fridayMaladie','saturdayMaladie'].map(k => p[k] || []) },
];

const DAY_LABELS  = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
const STATUS_KEYS = ['mondayStatus','tuesdayStatus','wednesdayStatus','thursdayStatus','fridayStatus','saturdayStatus'];

// ─────────────────────────────────────────────
//  SUPABASE
// ─────────────────────────────────────────────
async function sbGet(path) {
  try {
    const r = await fetch(SB_URL + path, { headers: HEADERS });
    return r.ok ? r.json() : null;
  } catch { return null; }
}

async function sbUpsert(table, body) {
  try {
    const r = await fetch(`${SB_URL}/rest/v1/${table}`, {
      method: 'POST',
      headers: { ...HEADERS, 'Prefer': 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(body)
    });
    return r.ok;
  } catch { return false; }
}

async function sbDelete(path) {
  try {
    const r = await fetch(SB_URL + path, { method: 'DELETE', headers: HEADERS });
    return r.ok;
  } catch { return false; }
}

// ─────────────────────────────────────────────
//  DATA CACHE (localStorage)
// ─────────────────────────────────────────────
function cacheSet(key, data) {
  try { localStorage.setItem(key, JSON.stringify(data)); } catch {}
}
function cacheGet(key) {
  try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
}

// ─────────────────────────────────────────────
//  OFFLINE QUEUE
// ─────────────────────────────────────────────
function loadOfflineQueue() {
  try { offlineQueue = JSON.parse(localStorage.getItem('offlineQueue') || '[]'); }
  catch { offlineQueue = []; }
}

function saveOfflineQueue() {
  localStorage.setItem('offlineQueue', JSON.stringify(offlineQueue));
  updateOfflineIndicator();
}

function showUpdateBar() {
  const bar = document.getElementById('update-bar');
  if (!bar) return;
  bar.style.display = 'flex';
  bar.innerHTML = `<span>🆕 Mise à jour disponible</span>`
    + `<button onclick="applyUpdate()" style="margin-left:auto;background:rgba(0,0,0,.2);border:none;color:#fff;font-size:12px;font-weight:600;padding:3px 10px;border-radius:8px;cursor:pointer;">Recharger</button>`;
}

function applyUpdate() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistration().then(reg => {
      if (reg && reg.waiting) {
        reg.waiting.postMessage({ type: 'SKIP_WAITING' });
      } else {
        window.location.reload();
      }
    });
  } else {
    window.location.reload();
  }
}

function updateOfflineIndicator() {
  const bar = document.getElementById('offline-bar');
  if (!bar) return;
  const isOffline = !navigator.onLine;
  const hasQueue  = offlineQueue.length > 0;
  bar.style.display = (isOffline || hasQueue) ? 'flex' : 'none';
  if (isOffline && hasQueue) {
    bar.innerHTML = `<span>📶 Hors ligne — ${offlineQueue.length} saisie(s) en attente de synchronisation</span>`;
  } else if (isOffline) {
    bar.innerHTML = `<span>📶 Hors ligne — les nouvelles saisies seront mises en file d'attente</span>`;
  } else if (hasQueue) {
    bar.innerHTML = `<span>🔄 ${offlineQueue.length} saisie(s) en attente</span>`
      + `<button onclick="processOfflineQueue()" style="margin-left:auto;background:rgba(0,0,0,.2);border:none;color:#fff;font-size:12px;font-weight:600;padding:3px 10px;border-radius:8px;cursor:pointer;">Synchroniser</button>`;
  }
}

let _syncInProgress = false;
async function processOfflineQueue() {
  if (_syncInProgress) return;
  if (!navigator.onLine || !offlineQueue.length) { updateOfflineIndicator(); return; }
  _syncInProgress = true;

  // Show "in progress" state
  const bar = document.getElementById('offline-bar');
  if (bar) bar.innerHTML = `<span>🔄 Synchronisation de ${offlineQueue.length} saisie(s)…</span>`;
  bar.style.display = 'flex';

  const toProcess = [...offlineQueue];
  offlineQueue = [];
  saveOfflineQueue();
  const failed = [];
  for (const item of toProcess) {
    // Strip client-only flags before sending
    const { _pending, dateObj, totalPieces, ...body } = item;
    const ok = await sbUpsert('production_entries', body);
    if (ok) {
      // Mark as synced in myEntries
      const e = myEntries.find(x => x.id === body.id);
      if (e) e._pending = false;
    } else {
      failed.push(item);
    }
  }
  offlineQueue = failed;
  _syncInProgress = false;
  saveOfflineQueue();
  if (currentTab === 'entry') renderEntryTab();
}

// ─────────────────────────────────────────────
//  CRYPTO
// ─────────────────────────────────────────────
async function sha256(str) {
  const buf  = new TextEncoder().encode(str);
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ─────────────────────────────────────────────
//  DARK MODE
// ─────────────────────────────────────────────
function toggleDarkMode(isDark) {
  document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
  localStorage.setItem('darkMode', isDark ? '1' : '0');
}

// ─────────────────────────────────────────────
//  DISCORD LOGGER
// ─────────────────────────────────────────────
const DISCORD_WEBHOOK = 'https://discord.com/api/webhooks/1495861049889525810/'
  + 'LCroi8U-e1A7q13FvLvnX9Um7OIF99HUr5iVYjRSP7yspEr6RkYTIYXy2VNsNHnqvoV0';

function deviceDescription() {
  const ua = navigator.userAgent;
  let device = 'Web';
  if      (/iPhone/.test(ua))    device = 'iPhone';
  else if (/iPad/.test(ua))      device = 'iPad';
  else if (/Android/.test(ua))   device = 'Android';
  else if (/Macintosh/.test(ua)) device = 'Mac';
  else if (/Windows/.test(ua))   device = 'Windows';
  else if (/Linux/.test(ua))     device = 'Linux';
  let browser = '';
  if      (/CriOS/.test(ua))   browser = 'Chrome iOS';
  else if (/FxiOS/.test(ua))   browser = 'Firefox iOS';
  else if (/EdgA/.test(ua))    browser = 'Edge Android';
  else if (/Edg\//.test(ua))   browser = 'Edge';
  else if (/OPR/.test(ua))     browser = 'Opera';
  else if (/Chrome/.test(ua))  browser = 'Chrome';
  else if (/Firefox/.test(ua)) browser = 'Firefox';
  else if (/Safari/.test(ua))  browser = 'Safari';
  else                          browser = 'Navigateur';
  return `${device} — ${browser}`;
}

function discordLog({ title, description, color, visa }) {
  const fields = [];
  if (visa) fields.push({ name: '👤 Utilisateur', value: `**${visa}**`, inline: true });
  fields.push({ name: '🌐 Appareil', value: deviceDescription(), inline: false });
  fetch(DISCORD_WEBHOOK, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      embeds: [{
        title, description, color, fields,
        timestamp: new Date().toISOString(),
        footer: { text: 'SuiviProduction Web' }
      }]
    })
  }).catch(() => {});
}

// ─────────────────────────────────────────────
//  AUTH
// ─────────────────────────────────────────────
async function handleLogin() {
  const visaEl = document.getElementById('login-visa');
  const passEl = document.getElementById('login-pass');
  const errEl  = document.getElementById('login-error');
  const btn    = document.getElementById('login-btn');

  const visa = visaEl.value.trim().toUpperCase();
  const pass = passEl.value;
  if (!visa || !pass) return;

  if (!navigator.onLine) {
    errEl.textContent = 'Pas de connexion internet — impossible de se connecter';
    return;
  }

  btn.disabled = true; btn.textContent = 'Connexion…'; errEl.textContent = '';

  const users = await sbGet(`/rest/v1/app_users?visa=eq.${encodeURIComponent(visa)}&select=*`);
  if (!users || !users.length) {
    errEl.textContent = 'Visa introuvable';
    btn.disabled = false; btn.textContent = 'Se connecter'; return;
  }

  const user = users[0];
  const hash = await sha256(pass);
  if (hash !== user.password_hash) {
    errEl.textContent = 'Mot de passe incorrect';
    passEl.value = '';
    btn.disabled = false; btn.textContent = 'Se connecter'; return;
  }

  if (user.must_change_password) {
    pendingUser = user;
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('change-password-screen').style.display = 'flex';
  } else {
    finishLogin(visa);
  }
}

async function handleChangePassword() {
  const p1  = document.getElementById('new-pass1').value;
  const p2  = document.getElementById('new-pass2').value;
  const err = document.getElementById('change-error');
  if (p1.length < 4) { err.textContent = 'Minimum 4 caractères'; return; }
  if (p1 !== p2)     { err.textContent = 'Les mots de passe ne correspondent pas'; return; }
  const hash = await sha256(p1);
  await sbUpsert('app_users', { visa: pendingUser.visa, password_hash: hash, must_change_password: false });
  discordLog({ title: '🔐 Mot de passe modifié', description: `**Visa:** ${pendingUser.visa}`, color: 16705372, visa: pendingUser.visa });
  finishLogin(pendingUser.visa);
}

function finishLogin(visa) {
  myVisa = visa;
  localStorage.setItem('myVisa', visa);
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('change-password-screen').style.display = 'none';
  discordLog({ title: '🔑 Connexion', description: `**Visa:** ${visa}`, color: 1752220, visa });
  showApp();
}

function logout() {
  discordLog({ title: '🚪 Déconnexion', description: `**Visa:** ${myVisa}`, color: 9807270, visa: myVisa });
  myVisa = ''; schedules = []; productModels = []; myEntries = [];
  isAdminMode = false;
  updateAdminLockBtn();
  const adminBtn = document.getElementById('nav-admin-btn');
  if (adminBtn) adminBtn.style.display = 'none';
  localStorage.removeItem('myVisa');
  document.getElementById('app').style.display = 'none';
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('login-visa').value = '';
  document.getElementById('login-pass').value = '';
  document.getElementById('login-error').textContent = '';
}

// ─────────────────────────────────────────────
//  APP SHELL
// ─────────────────────────────────────────────
async function showApp() {
  document.getElementById('app').style.display = 'flex';
  document.getElementById('header-visa').textContent = myVisa;

  const [scheds, models, entries] = await Promise.all([
    sbGet('/rest/v1/week_schedules?select=*&order=week_start_date.desc'),
    sbGet('/rest/v1/product_models?select=*&order=name.asc'),
    sbGet(`/rest/v1/production_entries?user_visa=eq.${encodeURIComponent(myVisa)}&select=*&order=date.desc`)
  ]);

  // Si réseau → mise à jour du cache. Sinon → fallback sur cache.
  if (scheds  !== null) cacheSet('cache_schedules', scheds);
  if (models  !== null) cacheSet('cache_models', models);
  if (entries !== null) cacheSet(`cache_entries_${myVisa}`, entries);

  schedules     = scheds  ?? cacheGet('cache_schedules') ?? [];
  productModels = models  ?? cacheGet('cache_models')    ?? [];
  const rawEntries = entries ?? cacheGet(`cache_entries_${myVisa}`) ?? [];

  myEntries = rawEntries.map(e => ({
    ...e,
    dateObj: new Date(e.date),
    totalPieces: e.series_count * e.molds_per_series
  }));
  // Merge pending offline entries that aren't yet synced
  offlineQueue.forEach(q => {
    if (!myEntries.find(e => e.id === q.id)) {
      myEntries.unshift({ ...q, dateObj: new Date(q.date), totalPieces: q.series_count * q.molds_per_series, _pending: true });
    }
  });
  updateOfflineIndicator();
  renderCurrentTab();
}

// ─────────────────────────────────────────────
//  NAVIGATION
// ─────────────────────────────────────────────
function showTab(tab, btn) {
  currentTab = tab;
  document.querySelectorAll('.tab-page').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('nav button').forEach(el => el.classList.remove('active'));
  document.getElementById(`tab-${tab}`).classList.add('active');
  if (btn) btn.classList.add('active');
  const titles = { planning: 'Planning', myweek: 'Ma semaine', entry: 'Saisie', stats: 'Statistiques', admin: 'Admin' };
  document.getElementById('header-title').textContent = titles[tab] || tab;
  renderCurrentTab();
}

function renderCurrentTab() {
  if      (currentTab === 'planning') renderPlanning();
  else if (currentTab === 'myweek')   renderMyWeek();
  else if (currentTab === 'entry')    renderEntry();
  else if (currentTab === 'stats')    refreshAndRenderStats();
  else if (currentTab === 'admin')    renderAdmin();
}

async function refreshAndRenderStats() {
  // Hors ligne → données en mémoire suffisent
  if (!navigator.onLine) { renderStats(); return; }

  document.getElementById('tab-stats').innerHTML =
    '<div class="spinner-wrap"><div class="spinner"></div></div>';
  const rows = await sbGet(
    `/rest/v1/production_entries?user_visa=eq.${encodeURIComponent(myVisa)}&select=*&order=date.desc`
  );
  if (rows !== null) {
    cacheSet(`cache_entries_${myVisa}`, rows);
    myEntries = rows.map(e => ({
      ...e, dateObj: new Date(e.date), totalPieces: e.series_count * e.molds_per_series
    }));
  }
  // Re-merge pending
  offlineQueue.forEach(q => {
    if (!myEntries.find(e => e.id === q.id)) {
      myEntries.unshift({ ...q, dateObj: new Date(q.date), totalPieces: q.series_count * q.molds_per_series, _pending: true });
    }
  });
  renderStats();
}

// ─────────────────────────────────────────────
//  WEEK HELPERS
// ─────────────────────────────────────────────
function getRelevantMonday() {
  const today = new Date();
  const dow   = today.getDay();
  const diff  = dow === 0 ? 1 : -(dow - 1);
  const mon   = new Date(today);
  mon.setDate(today.getDate() + diff);
  mon.setHours(0, 0, 0, 0);
  return mon;
}

function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function isRelevant(s) { return isSameDay(new Date(s.week_start_date), getRelevantMonday()); }

function weekLabel(s) {
  const d = new Date(s.week_start_date);
  if (isSameDay(d, getRelevantMonday()))
    return new Date().getDay() === 0 ? 'Semaine prochaine' : 'Cette semaine';
  const end = new Date(d); end.setDate(end.getDate() + 6);
  const fmt = dt => dt.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
  return `${fmt(d)} – ${fmt(end)}`;
}

// ─────────────────────────────────────────────
//  PLANNING
// ─────────────────────────────────────────────
function renderPlanning() {
  const el = document.getElementById('tab-planning');
  if (!schedules.length) { el.innerHTML = emptyState('Aucun planning', 'Aucun planning disponible'); return; }
  const relevant = schedules.find(isRelevant);
  const now      = new Date();
  // Trier : les semaines les plus proches de maintenant d'abord
  const others   = schedules
    .filter(s => !isRelevant(s))
    .sort((a, b) => {
      const da = Math.abs(new Date(a.week_start_date) - now);
      const db = Math.abs(new Date(b.week_start_date) - now);
      return da - db;
    });
  let html = '';
  if (relevant) { html += sectionHeader(new Date().getDay() === 0 ? 'Semaine prochaine' : 'Cette semaine'); html += scheduleCard(relevant); }
  if (others.length) { html += sectionHeader('Autres semaines'); others.forEach(s => { html += scheduleCard(s); }); }
  el.innerHTML = html;
}

function scheduleCard(s) {
  const p        = s.payload;
  const isMatin  = s.week_type === 'Matin';
  const dayCount = p.hideSaturday ? 5 : 6;
  const statuses = STATUS_KEYS.slice(0, dayCount).map(k => p[k] || '');

  const mon = new Date(localDateOf(s.week_start_date) + 'T12:00:00');
  const dayHeaders = DAY_LABELS.slice(0, dayCount).map((lbl, i) => {
    const d = new Date(mon); d.setDate(mon.getDate() + i);
    return `${lbl}<br><span style="font-weight:400;font-size:10px">${String(d.getDate()).padStart(2,'0')}</span>`;
  });

  let headerRow = '<th></th>' + dayHeaders.map(h => `<th>${h}</th>`).join('');
  let bodyRows  = '';

  CATS.forEach((cat, ci) => {
    const dayArrays = cat.visas(p).slice(0, dayCount);
    const maxR      = Math.max(...dayArrays.map(a => a.length), 1);
    const rowBg     = ci % 2 !== 0 ? 'class="row-alt"' : '';

    for (let ri = 0; ri < maxR; ri++) {
      let cells = '';
      if (ri === 0) {
        cells += `<td class="cat-label" style="color:${cat.color}" rowspan="${maxR}">${cat.label}</td>`;
      }
      dayArrays.forEach((arr, di) => {
        const st = statuses[di];
        if (st) {
          if (ri === 0) {
            const cls = st === 'Fermé' ? 'status-ferme' : 'status-ferie';
            cells += `<td rowspan="${maxR}"><span class="day-status ${cls}">${st}</span></td>`;
          }
        } else {
          const v    = arr[ri] || '';
          const isMe = v && v === myVisa;
          cells += `<td>${v ? `<span class="${isMe ? 'visa-me' : 'visa-col'} ${cat.cls}">${v}</span>` : ''}</td>`;
        }
      });
      bodyRows += `<tr ${rowBg}>${cells}</tr>`;
    }
  });

  const badgeCls = isMatin ? 'badge-matin' : 'badge-aprem';
  const badgeTxt = isMatin ? 'Matin'       : 'Après-midi';

  return `
    <div class="card">
      <div class="schedule-header">
        <span class="schedule-title">${weekLabel(s)}</span>
        <span class="week-type-badge ${badgeCls}">${badgeTxt}</span>
      </div>
      <div class="table-wrap">
        <table class="schedule-table">
          <thead><tr>${headerRow}</tr></thead>
          <tbody>${bodyRows}</tbody>
        </table>
      </div>
    </div>`;
}

// ─────────────────────────────────────────────
//  MA SEMAINE
// ─────────────────────────────────────────────
function renderMyWeek() {
  const el = document.getElementById('tab-myweek');
  const s  = schedules.find(isRelevant);
  if (!s) { el.innerHTML = emptyState('Aucun planning', 'Aucun planning pour cette semaine'); return; }

  const p        = s.payload;
  const dayCount = p.hideSaturday ? 5 : 6;
  const shiftEnd = s.week_type === 'Matin' ? '13h00' : '20h00';
  const mon      = new Date(s.week_start_date);
  const days     = [];

  for (let i = 0; i < dayCount; i++) {
    const status = p[STATUS_KEYS[i]] || '';
    if (status) continue;
    let cat = null, colleagues = [];
    for (const c of CATS) {
      const arr = c.visas(p)[i] || [];
      if (arr.includes(myVisa)) { cat = c; colleagues = arr.filter(v => v !== myVisa); break; }
    }
    if (!cat) continue;
    const date = new Date(mon); date.setDate(mon.getDate() + i);
    days.push({ label: DAY_LABELS[i], date, cat, colleagues });
  }

  if (!days.length) { el.innerHTML = emptyState('Pas de saisie', `Ton visa ${myVisa} n'apparaît pas dans ce planning`); return; }

  let html = sectionHeader(weekLabel(s));
  days.forEach(({ label, date, cat, colleagues }) => {
    const isWorking = cat.key === 'ZAC1' || cat.key === 'ZAC2';

    // Production de ce jour
    const dayStr = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
    const dayEntries = myEntries.filter(e => localDateOf(e.date) === dayStr);
    const dayTotal   = dayEntries.reduce((s, e) => s + e.totalPieces, 0);
    const dayPending = dayEntries.some(e => e._pending);

    html += `
      <div class="my-day-card">
        <div class="my-day-date">
          <div class="day-name">${label}</div>
          <div class="day-num">${date.getDate()}</div>
          <div class="day-month">${date.toLocaleDateString('fr-FR',{month:'short'})}</div>
        </div>
        <div class="my-day-divider"></div>
        <div class="my-day-info">
          <div class="my-day-cat" style="color:${cat.color}">${cat.label}</div>
          ${isWorking ? `<div class="my-day-end">Fin à ${shiftEnd}</div>` : ''}
          ${colleagues.length ? `<div class="my-day-colleagues">Avec : ${colleagues.join(', ')}</div>` : ''}
          ${dayTotal > 0 ? `<div class="my-day-production" style="color:var(--blue)">${dayTotal} moules${dayPending ? ' ⏳' : ''}</div>` : ''}
        </div>
      </div>`;
  });
  el.innerHTML = html;
}

// ─────────────────────────────────────────────
//  SAISIE — TAB (liste + navigation date)
// ─────────────────────────────────────────────
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function localDateOf(isoStr) {
  const d = new Date(isoStr);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

let selectedEntryDate = todayStr();

function renderEntry() {
  // Hors ligne → on utilise directement les données en mémoire (du cache)
  if (!navigator.onLine) { renderEntryTab(); return; }
  refreshEntryTab();
}

async function refreshEntryTab() {
  const el = document.getElementById('tab-entry');
  el.innerHTML = '<div class="spinner-wrap"><div class="spinner"></div></div>';
  const rows = await sbGet(
    `/rest/v1/production_entries?user_visa=eq.${encodeURIComponent(myVisa)}&select=*&order=date.desc`
  );
  if (rows !== null) {
    cacheSet(`cache_entries_${myVisa}`, rows);
    myEntries = rows.map(e => ({
      ...e, dateObj: new Date(e.date), totalPieces: e.series_count * e.molds_per_series
    }));
  }
  // Re-merge pending queue
  offlineQueue.forEach(q => {
    if (!myEntries.find(e => e.id === q.id)) {
      myEntries.unshift({ ...q, dateObj: new Date(q.date), totalPieces: q.series_count * q.molds_per_series, _pending: true });
    }
  });
  renderEntryTab();
}

function renderEntryTab() {
  const el    = document.getElementById('tab-entry');
  const today = todayStr();
  const dayEntries = myEntries.filter(e => localDateOf(e.date) === selectedEntryDate);

  const totalPieces  = dayEntries.reduce((s, e) => s + e.totalPieces, 0);
  const totalRejects = dayEntries.reduce((s, e) => s + e.rejects, 0);
  const successRate  = totalPieces > 0 ? Math.round((totalPieces - totalRejects) / totalPieces * 100) : null;
  const isToday      = selectedEntryDate === today;

  const displayDate = new Date(selectedEntryDate + 'T12:00:00');
  const dateLabel   = isToday
    ? "Aujourd'hui"
    : displayDate.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  const dateCapital = dateLabel.charAt(0).toUpperCase() + dateLabel.slice(1);

  let html = `
    <div class="date-nav">
      <button class="date-nav-btn" onclick="changeEntryDate(-1)">‹</button>
      <button class="date-nav-label" onclick="document.getElementById('entry-date-picker').showPicker()">${dateCapital}</button>
      <input type="date" id="entry-date-picker" value="${selectedEntryDate}" max="${today}"
        onchange="setEntryDate(this.value)"
        style="position:absolute;opacity:0;pointer-events:none;width:0;height:0" />
      <button class="date-nav-btn" onclick="changeEntryDate(1)" ${isToday ? 'disabled' : ''}>›</button>
    </div>`;

  if (dayEntries.length > 0) {
    const rateColor = successRate >= 98 ? 'var(--green)' : successRate >= 95 ? 'var(--orange)' : 'var(--red)';
    html += `
    <div class="summary-bar">
      <div class="summary-kpi">
        <div class="summary-val" style="color:var(--blue)">${totalPieces}</div>
        <div class="summary-lbl">Moules</div>
      </div>
      <div class="summary-sep"></div>
      <div class="summary-kpi">
        <div class="summary-val" style="color:${totalRejects > 0 ? 'var(--red)' : 'var(--secondary)'}">${totalRejects}</div>
        <div class="summary-lbl">Rebuts</div>
      </div>
      <div class="summary-sep"></div>
      <div class="summary-kpi">
        <div class="summary-val" style="color:${rateColor}">${successRate}%</div>
        <div class="summary-lbl">Réussite</div>
      </div>
    </div>`;

    html += `<div class="section-header">Saisies du jour</div>
    <div class="card" style="padding:0;overflow:hidden">`;
    dayEntries.forEach((e, i) => {
      const model     = e.product_model_name || 'Inconnu';
      const rejectTxt = e.rejects > 0 ? ` · ${e.rejects} rebut${e.rejects > 1 ? 's' : ''}` : '';
      const sep       = i < dayEntries.length - 1 ? 'entry-row-sep' : '';
      const pendBadge = e._pending ? '<span class="pending-badge">⏳</span>' : '';
      html += `
      <div class="entry-row ${sep}${e._pending ? ' entry-pending' : ''}">
        <div class="entry-row-info">
          <div class="entry-model">${model} ${pendBadge}</div>
          <div class="entry-detail">${e.series_count} × ${e.molds_per_series} = <strong>${e.totalPieces} moules</strong>${rejectTxt}</div>
        </div>
        <div class="entry-row-btns">
          ${!e._pending ? `<button class="entry-btn" onclick="openEditSheet('${e.id}')">✏️</button>` : ''}
          <button class="entry-btn entry-btn-del" onclick="confirmDeleteEntry('${e.id}')">🗑</button>
        </div>
      </div>`;
    });
    html += `</div>`;
  } else {
    html += emptyState(
      'Aucune saisie',
      isToday ? 'Appuyez sur + pour ajouter votre production' : 'Aucune production enregistrée ce jour'
    );
  }

  html += `<button class="btn-primary" style="margin-top:16px" onclick="openAddSheet()">+ Nouvelle saisie</button>`;
  el.innerHTML = html;
}

function changeEntryDate(delta) {
  const d = new Date(selectedEntryDate + 'T12:00:00');
  d.setDate(d.getDate() + delta);
  const next = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  if (next > todayStr()) return;
  selectedEntryDate = next;
  renderEntryTab();
}

function setEntryDate(dateStr) {
  selectedEntryDate = dateStr;
  renderEntryTab();
}

// ─────────────────────────────────────────────
//  SAISIE — SHEET (add / edit)
// ─────────────────────────────────────────────
let entrySheetMode = 'add';
let editingEntryId = null;
let entry = { modelName: null, moldsPerSeries: 27, seriesCount: 1, rejects: 0 };

function openAddSheet() {
  entrySheetMode = 'add';
  editingEntryId = null;
  // Fallback cache si productModels vide (ex: première ouverture hors ligne)
  if (!productModels.length) productModels = cacheGet('cache_models') || [];
  const m = productModels[0];
  entry = { modelName: m?.name || null, moldsPerSeries: m?.molds_per_series || 27, seriesCount: 1, rejects: 0 };
  document.getElementById('sheet-title').textContent = 'Nouvelle saisie';
  document.getElementById('sheet-save-btn').textContent = 'Ajouter';
  renderSheetForm();
  document.getElementById('entry-sheet').classList.add('open');
}

function openEditSheet(id) {
  const e = myEntries.find(x => x.id === id);
  if (!e) return;
  entrySheetMode = 'edit';
  editingEntryId = id;
  entry = {
    modelName:      e.product_model_name || productModels[0]?.name,
    moldsPerSeries: e.molds_per_series,
    seriesCount:    e.series_count,
    rejects:        e.rejects
  };
  document.getElementById('sheet-title').textContent = 'Modifier la saisie';
  document.getElementById('sheet-save-btn').textContent = 'Enregistrer';
  renderSheetForm();
  document.getElementById('entry-sheet').classList.add('open');
}

function closeEntrySheet() {
  document.getElementById('entry-sheet').classList.remove('open');
}

function closeEntrySheetIfBackdrop(ev) {
  if (ev.target === document.getElementById('entry-sheet')) closeEntrySheet();
}

function renderSheetForm() {
  if (!productModels.length) {
    document.getElementById('sheet-body').innerHTML =
      emptyState('Aucun modèle', "Demande à l'admin d'ajouter des modèles");
    return;
  }
  const total   = entry.seriesCount * entry.moldsPerSeries;
  const options = productModels.map(m =>
    `<option value="${m.name}"${m.name === entry.modelName ? ' selected' : ''}>${m.name}</option>`
  ).join('');

  document.getElementById('sheet-body').innerHTML = `
    <div style="padding:14px 14px 0;display:flex;flex-direction:column;gap:12px">
      <div class="form-row">
        <div class="form-field">
          <label>Modèle</label>
          <select onchange="sheetModelChange(this.value)"
            style="border:none;background:transparent;font-size:16px;color:var(--blue);outline:none;max-width:180px;text-align:right">
            ${options}
          </select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-field">
          <label>Moules / série</label>
          <div class="stepper">
            <button onclick="sheetStep('moldsPerSeries',-1)">−</button>
            <input type="number" id="sh-molds" class="stepper-input" value="${entry.moldsPerSeries}" min="1" max="999"
              onfocus="this.select()" onchange="sheetSetField('moldsPerSeries',+this.value)" />
            <button onclick="sheetStep('moldsPerSeries',1)">+</button>
          </div>
        </div>
        <div class="form-field">
          <label>Séries</label>
          <div class="stepper">
            <button onclick="sheetStep('seriesCount',-1)">−</button>
            <input type="number" id="sh-series" class="stepper-input" value="${entry.seriesCount}" min="1" max="999"
              onfocus="this.select()" onchange="sheetSetField('seriesCount',+this.value)" />
            <button onclick="sheetStep('seriesCount',1)">+</button>
          </div>
        </div>
        <div class="form-field">
          <label>Total moules</label>
          <span id="sh-total" style="color:var(--blue);font-weight:700;font-size:18px">${total}</span>
        </div>
      </div>
      <div class="form-row">
        <div class="form-field">
          <label>Rebuts</label>
          <div class="stepper">
            <button onclick="sheetStep('rejects',-1)">−</button>
            <input type="number" id="sh-rejects" class="stepper-input" value="${entry.rejects}" min="0"
              onfocus="this.select()" onchange="sheetSetField('rejects',+this.value)" />
            <button onclick="sheetStep('rejects',1)">+</button>
          </div>
        </div>
      </div>
      <div id="sheet-fb" style="text-align:center;font-size:14px;color:var(--red);min-height:18px"></div>
    </div>`;
}

function sheetModelChange(name) {
  entry.modelName = name;
  const m = productModels.find(x => x.name === name);
  if (m && m.molds_per_series > 0) entry.moldsPerSeries = m.molds_per_series;
  renderSheetForm();
}

function sheetSetVal(id, val) {
  const el = document.getElementById(id);
  if (!el) return;
  el.tagName === 'INPUT' ? (el.value = val) : (el.textContent = val);
}

function sheetSetField(field, val) {
  val = isNaN(val) || val < 0 ? 0 : Math.floor(val);
  const max = field === 'rejects' ? Math.max(entry.seriesCount * entry.moldsPerSeries, 1) : 999;
  entry[field] = Math.min(max, Math.max(0, val));
  if (field !== 'rejects') entry.rejects = Math.min(entry.rejects, Math.max(0, entry.seriesCount * entry.moldsPerSeries));
  sheetSetVal('sh-molds',   entry.moldsPerSeries);
  sheetSetVal('sh-series',  entry.seriesCount);
  sheetSetVal('sh-total',   entry.seriesCount * entry.moldsPerSeries);
  sheetSetVal('sh-rejects', entry.rejects);
}

function sheetStep(field, delta) {
  sheetSetField(field, entry[field] + delta);
}

async function saveEntrySheet() {
  const btn = document.getElementById('sheet-save-btn');
  const fb  = document.getElementById('sheet-fb');
  if (!entry.modelName) { fb.textContent = 'Sélectionne un modèle'; return; }
  btn.disabled = true;

  if (entrySheetMode === 'add') {
    const id      = crypto.randomUUID();
    const dateISO = new Date(selectedEntryDate + 'T00:00:00').toISOString();
    const body    = {
      id, user_visa: myVisa, date: dateISO,
      series_count: entry.seriesCount, molds_per_series: entry.moldsPerSeries,
      rejects: entry.rejects, product_model_name: entry.modelName
    };
    const enriched = { ...body, dateObj: new Date(dateISO), totalPieces: entry.seriesCount * entry.moldsPerSeries };

    // Mode hors ligne → file d'attente
    if (!navigator.onLine) {
      offlineQueue.push(body);
      saveOfflineQueue();
      myEntries.unshift({ ...enriched, _pending: true });
      closeEntrySheet();
      renderEntryTab();
      return;
    }

    const ok = await sbUpsert('production_entries', body);
    if (ok) {
      myEntries.unshift(enriched);
      const total = entry.seriesCount * entry.moldsPerSeries;
      let desc = `**Modèle:** ${entry.modelName}\n**Séries:** ${entry.seriesCount} × ${entry.moldsPerSeries} = **${total} moules**`;
      if (entry.rejects > 0) desc += `\n**Rebuts:** ${entry.rejects}`;
      const d = new Date(selectedEntryDate + 'T12:00:00');
      desc += `\n**Date:** ${d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}`;
      discordLog({ title: '✅ Saisie ajoutée', description: desc, color: 5763719, visa: myVisa });
      closeEntrySheet();
      renderEntryTab();
    } else if (!navigator.onLine) {
      // Connexion perdue pendant la requête → queue
      offlineQueue.push(body);
      saveOfflineQueue();
      myEntries.unshift({ ...enriched, _pending: true });
      closeEntrySheet();
      renderEntryTab();
    } else {
      fb.textContent = "Erreur lors de l'enregistrement";
      btn.disabled = false;
    }
  } else {
    // Edit
    const existing = myEntries.find(x => x.id === editingEntryId);
    if (!existing) return;
    const body = {
      id: editingEntryId, user_visa: myVisa, date: existing.date,
      series_count: entry.seriesCount, molds_per_series: entry.moldsPerSeries,
      rejects: entry.rejects, product_model_name: entry.modelName
    };
    const ok = await sbUpsert('production_entries', body);
    if (ok) {
      Object.assign(existing, {
        series_count: entry.seriesCount, molds_per_series: entry.moldsPerSeries,
        rejects: entry.rejects, product_model_name: entry.modelName,
        totalPieces: entry.seriesCount * entry.moldsPerSeries
      });
      const total = entry.seriesCount * entry.moldsPerSeries;
      let desc = `**Modèle:** ${entry.modelName}\n**Séries:** ${entry.seriesCount} × ${entry.moldsPerSeries} = **${total} moules**`;
      if (entry.rejects > 0) desc += `\n**Rebuts:** ${entry.rejects}`;
      discordLog({ title: '✏️ Saisie modifiée', description: desc, color: 16705372, visa: myVisa });
      closeEntrySheet();
      renderEntryTab();
    } else {
      fb.textContent = "Erreur lors de l'enregistrement";
      btn.disabled = false;
    }
  }
}

async function confirmDeleteEntry(id) {
  const e = myEntries.find(x => x.id === id);
  if (!e) return;

  // Entrée en attente → suppression locale uniquement
  if (e._pending) {
    if (!confirm('Supprimer cette saisie (non encore synchronisée) ?')) return;
    offlineQueue = offlineQueue.filter(q => q.id !== id);
    saveOfflineQueue();
    myEntries = myEntries.filter(x => x.id !== id);
    renderEntryTab();
    return;
  }

  if (!confirm('Supprimer cette saisie ?')) return;
  const encoded = encodeURIComponent(id);
  const ok      = await sbDelete(`/rest/v1/production_entries?id=eq.${encoded}`);
  if (ok) {
    if (e) discordLog({
      title: '🗑️ Saisie supprimée',
      description: `**Modèle:** ${e.product_model_name || 'Inconnu'}\n**Total:** ${e.totalPieces} moules`,
      color: 15548997, visa: myVisa
    });
    myEntries = myEntries.filter(x => x.id !== id);
    renderEntryTab();
  } else {
    alert('Erreur lors de la suppression');
  }
}

// ─────────────────────────────────────────────
//  STATS
// ─────────────────────────────────────────────
let statsPeriod = 'week';

function renderStats() {
  const el = document.getElementById('tab-stats');

  const todayLocal = todayStr();
  let startDateStr;
  if (statsPeriod === 'day') {
    startDateStr = todayLocal;
  } else if (statsPeriod === 'week') {
    const d = new Date(todayLocal + 'T12:00:00'); d.setDate(d.getDate() - 6);
    startDateStr = localDateOf(d.toISOString());
  } else {
    const d = new Date(); startDateStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`;
  }

  const filtered = myEntries.filter(e => localDateOf(e.date) >= startDateStr);
  const totalPieces  = filtered.reduce((s, e) => s + e.totalPieces, 0);
  const totalRejects = filtered.reduce((s, e) => s + e.rejects, 0);
  const rejectRate   = totalPieces > 0 ? (totalRejects / totalPieces * 100) : 0;

  const byDay = {};
  filtered.forEach(e => {
    const key = localDateOf(e.date);
    if (!byDay[key]) byDay[key] = { key, date: new Date(key + 'T12:00:00'), pieces: 0, rejects: 0 };
    byDay[key].pieces  += e.totalPieces;
    byDay[key].rejects += e.rejects;
  });
  const days = Object.values(byDay).sort((a, b) => a.key.localeCompare(b.key));

  const byModel = {};
  filtered.forEach(e => {
    const key = e.product_model_name || 'Inconnu';
    if (!byModel[key]) byModel[key] = { name: key, pieces: 0, rejects: 0 };
    byModel[key].pieces  += e.totalPieces;
    byModel[key].rejects += e.rejects;
  });
  const models = Object.values(byModel).sort((a, b) => b.pieces - a.pieces);

  const best = days.reduce((b, d) => d.pieces > (b?.pieces ?? 0) ? d : b, null);
  const avg  = days.length ? (totalPieces / days.length).toFixed(0) : 0;

  const periods = [['day', "Aujourd'hui"], ['week', '7 derniers jours'], ['month', 'Ce mois']];

  let html = `
    <div class="segment-control" style="margin-bottom:16px">
      ${periods.map(([k, l]) => `<button class="${statsPeriod===k?'active':''}" onclick="setStatsPeriod('${k}')">${l}</button>`).join('')}
    </div>`;

  if (!filtered.length) {
    html += emptyState('Aucune donnée', 'Aucune production enregistrée sur cette période');
    html += logoutBtn();
    el.innerHTML = html; return;
  }

  const rateColor = rejectRate > 5 ? '#FF3B30' : rejectRate > 2 ? '#FF9500' : '#34C759';
  html += `
    <div class="kpi-row">
      <div class="kpi-card"><div class="kpi-val" style="color:#007AFF">${totalPieces}</div><div class="kpi-label">Moules</div></div>
      <div class="kpi-card"><div class="kpi-val" style="color:${totalRejects>0?'#FF3B30':'#8E8E93'}">${totalRejects}</div><div class="kpi-label">Rebuts</div></div>
      <div class="kpi-card"><div class="kpi-val" style="color:${rateColor}">${rejectRate.toFixed(1)}%</div><div class="kpi-label">Taux rebut</div></div>
    </div>`;

  if (statsPeriod !== 'day' && days.length > 1) {
    const maxPieces = Math.max(...days.map(d => d.pieces), 1);
    html += `
      <div class="card">
        <div class="card-title">Production par jour</div>
        <div class="bar-chart">
          ${days.map(d => {
            const h  = Math.round((d.pieces / maxPieces) * 100);
            const rh = Math.round((d.rejects / maxPieces) * 100);
            const lbl = d.date.toLocaleDateString('fr-FR', { day:'numeric', month:'short' });
            return `
              <div class="bar-col">
                <div class="bar-wrap">
                  ${d.rejects > 0 ? `<div class="bar bar-rejects" style="height:${rh}%"></div>` : ''}
                  <div class="bar bar-pieces" style="height:${h}%"></div>
                </div>
                <div class="bar-lbl">${lbl}</div>
              </div>`;
          }).join('')}
        </div>
      </div>`;
  }

  html += `
    <div class="card">
      <div class="card-title">Indicateurs</div>`;
  if (statsPeriod !== 'day') {
    html += `<div class="stat-row"><span>Moyenne / jour</span><span class="stat-val">${avg} moules</span></div>`;
    if (best) {
      const bestLbl = best.date.toLocaleDateString('fr-FR', { weekday:'short', day:'numeric', month:'short' });
      html += `<div class="stat-row"><span>Meilleure journée</span><div style="text-align:right"><div class="stat-val">${best.pieces} moules</div><div style="font-size:12px;color:#8E8E93">${bestLbl}</div></div></div>`;
    }
  }
  html += `
      <div class="stat-row"><span>Taux de réussite</span><span class="stat-val" style="color:#34C759">${(100-rejectRate).toFixed(1)}%</span></div>
    </div>`;

  if (models.length) {
    const maxM = Math.max(...models.map(m => m.pieces), 1);
    html += `
      <div class="card">
        <div class="card-title">Par modèle</div>
        ${models.map(m => `
          <div class="model-row">
            <div class="model-header">
              <span>${m.name}</span>
              <span class="stat-val">${m.pieces} moules${m.rejects > 0 ? ` · <span style="color:#FF3B30">${m.rejects} rebuts</span>` : ''}</span>
            </div>
            <div class="model-bar-bg">
              <div class="model-bar-fill" style="width:${Math.round(m.pieces/maxM*100)}%"></div>
            </div>
          </div>`).join('')}
      </div>`;
  }

  html += logoutBtn();
  el.innerHTML = html;
}

function setStatsPeriod(p) { statsPeriod = p; renderStats(); }

function logoutBtn() {
  return `<button class="btn-danger" onclick="logout()" style="margin-top:24px">Se déconnecter</button>`;
}

// ─────────────────────────────────────────────
//  ADMIN — ACCÈS
// ─────────────────────────────────────────────
function updateAdminLockBtn() {
  const btn = document.getElementById('admin-lock-btn');
  if (!btn) return;
  if (isAdminMode) {
    btn.textContent = '🔓';
    btn.title       = 'Quitter le mode admin';
    btn.style.opacity = '1';
    btn.style.color   = 'var(--orange)';
  } else {
    btn.textContent = '🔒';
    btn.title       = 'Mode admin';
    btn.style.opacity = '0.4';
    btn.style.color   = '';
  }
}

function handleAdminLockBtn() {
  if (isAdminMode) {
    if (confirm('Quitter le mode admin ?')) exitAdminMode();
  } else {
    openAdminLoginSheet();
  }
}

function openAdminLoginSheet() {
  document.getElementById('admin-login-sheet').classList.add('open');
  document.getElementById('admin-pass-input').value = '';
  document.getElementById('admin-pass-error').textContent = '';
}
function closeAdminLoginSheet() {
  document.getElementById('admin-login-sheet').classList.remove('open');
}
function closeAdminLoginIfBackdrop(ev) {
  if (ev.target === document.getElementById('admin-login-sheet')) closeAdminLoginSheet();
}
function handleAdminLogin() {
  const pw = document.getElementById('admin-pass-input').value;
  if (pw === 'admin1234') {
    isAdminMode = true;
    closeAdminLoginSheet();
    updateAdminLockBtn();
    const btn = document.getElementById('nav-admin-btn');
    btn.style.display = 'flex';
    showTab('admin', btn);
  } else {
    document.getElementById('admin-pass-error').textContent = 'Mot de passe incorrect';
    document.getElementById('admin-pass-input').value = '';
  }
}
function exitAdminMode() {
  isAdminMode = false;
  updateAdminLockBtn();
  document.getElementById('nav-admin-btn').style.display = 'none';
  const firstBtn = document.querySelector('nav button:not(#nav-admin-btn)');
  showTab('planning', firstBtn);
}

// ─────────────────────────────────────────────
//  ADMIN — RENDER PRINCIPAL
// ─────────────────────────────────────────────
async function renderAdmin() {
  const el = document.getElementById('tab-admin');
  el.innerHTML = '<div class="spinner-wrap"><div class="spinner"></div></div>';

  const [visas, users] = await Promise.all([
    sbGet('/rest/v1/visas?select=*&order=identifier.asc'),
    sbGet('/rest/v1/app_users?select=visa,must_change_password&order=visa.asc')
  ]);
  adminVisas = visas || [];
  adminUsers = users || [];

  const tabs = [
    { key: 'visas',     label: 'Membres'   },
    { key: 'models',    label: 'Modèles'   },
    { key: 'schedules', label: 'Plannings' },
  ];
  let html = `
    <div class="segment-control" style="margin-bottom:16px">
      ${tabs.map(t => `<button class="${adminSubTab===t.key?'active':''}" onclick="setAdminSubTab('${t.key}')">${t.label}</button>`).join('')}
    </div>`;

  if      (adminSubTab === 'visas')     html += renderAdminVisas();
  else if (adminSubTab === 'models')    html += renderAdminModels();
  else if (adminSubTab === 'schedules') html += renderAdminSchedules();

  html += `<button class="btn-danger" onclick="exitAdminMode()" style="margin-top:24px">Quitter le mode admin</button>`;
  el.innerHTML = html;
}

function setAdminSubTab(tab) { adminSubTab = tab; renderAdmin(); }

// ─────────────────────────────────────────────
//  ADMIN — VISAS / MEMBRES
// ─────────────────────────────────────────────
function renderAdminVisas() {
  let html = `
    <div class="admin-section-hd">
      <div class="section-header" style="margin:0">Membres (${adminVisas.length})</div>
      <button class="admin-add-btn" onclick="openAddVisaSheet()">+ Ajouter</button>
    </div>
    <div class="card" style="padding:0;overflow:hidden">`;

  if (!adminVisas.length) {
    html += `<div class="entry-row"><span style="color:var(--secondary)">Aucun membre</span></div>`;
  } else {
    adminVisas.forEach((v, i) => {
      const user = adminUsers.find(u => u.visa === v.identifier);
      const sep  = i < adminVisas.length - 1 ? 'entry-row-sep' : '';
      let badge  = '';
      if (user) {
        badge = user.must_change_password
          ? '<span class="abadge abadge-warn">1ère connexion</span>'
          : '<span class="abadge abadge-ok">Actif</span>';
      } else {
        badge = '<span class="abadge abadge-sec">Pas de compte</span>';
      }
      html += `
        <div class="entry-row ${sep}">
          <div class="entry-row-info">
            <div class="entry-model">${v.identifier} ${badge}</div>
            ${user?.must_change_password ? '<div class="entry-detail">Mot de passe par défaut : 0000</div>' : ''}
          </div>
          <div class="entry-row-btns">
            ${user
              ? `<button class="entry-btn" title="Réinitialiser MDP" onclick="adminResetPassword('${v.identifier}')">🔄</button>`
              : `<button class="entry-btn" title="Créer compte" onclick="adminCreateAccount('${v.identifier}')">➕</button>`}
            <button class="entry-btn entry-btn-del" onclick="adminDeleteVisa('${v.identifier}')">🗑</button>
          </div>
        </div>`;
    });
  }
  html += `</div>`;
  return html;
}

function openAddVisaSheet() {
  document.getElementById('add-visa-sheet').classList.add('open');
  document.getElementById('add-visa-input').value = '';
  document.getElementById('add-visa-error').textContent = '';
}
function closeAddVisaSheet() {
  document.getElementById('add-visa-sheet').classList.remove('open');
}
function closeAddVisaIfBackdrop(ev) {
  if (ev.target === document.getElementById('add-visa-sheet')) closeAddVisaSheet();
}
async function saveAddVisa() {
  const id  = document.getElementById('add-visa-input').value.trim().toUpperCase();
  const err = document.getElementById('add-visa-error');
  if (!id || id.length < 2) { err.textContent = 'Visa invalide (min 2 caractères)'; return; }
  if (adminVisas.find(v => v.identifier === id)) { err.textContent = 'Ce visa existe déjà'; return; }

  const DEFAULT_HASH = '9af15b336e6a9619928537df30b2e6a2376569fcf9d7e773eccede65606529a0'; // SHA256("0000")
  const [okV, okU] = await Promise.all([
    sbUpsert('visas', { identifier: id }),
    sbUpsert('app_users', { visa: id, password_hash: DEFAULT_HASH, must_change_password: true })
  ]);
  if (okV) {
    adminVisas.push({ identifier: id });
    adminVisas.sort((a, b) => a.identifier.localeCompare(b.identifier));
    if (okU) adminUsers.push({ visa: id, must_change_password: true });
    closeAddVisaSheet();
    renderAdmin();
    discordLog({ title: '👤 Membre ajouté', description: `Visa **${id}** créé (MDP: 0000)`, color: 5763719, visa: myVisa });
  } else {
    err.textContent = "Erreur lors de l'ajout";
  }
}
async function adminDeleteVisa(id) {
  if (!confirm(`Supprimer le membre ${id} et son compte ?\nSes saisies seront conservées.`)) return;
  await Promise.all([
    sbDelete(`/rest/v1/visas?identifier=eq.${encodeURIComponent(id)}`),
    sbDelete(`/rest/v1/app_users?visa=eq.${encodeURIComponent(id)}`)
  ]);
  adminVisas = adminVisas.filter(v => v.identifier !== id);
  adminUsers = adminUsers.filter(u => u.visa !== id);
  renderAdmin();
  discordLog({ title: '🗑️ Membre supprimé', description: `Visa **${id}** supprimé`, color: 15548997, visa: myVisa });
}
async function adminResetPassword(visa) {
  if (!confirm(`Réinitialiser le mot de passe de ${visa} ?\nIl devra se connecter avec le code 0000.`)) return;
  const hash = '9af15b336e6a9619928537df30b2e6a2376569fcf9d7e773eccede65606529a0';
  const ok   = await sbUpsert('app_users', { visa, password_hash: hash, must_change_password: true });
  if (ok) {
    const u = adminUsers.find(u => u.visa === visa);
    if (u) u.must_change_password = true;
    renderAdmin();
  }
}
async function adminCreateAccount(visa) {
  const hash = '9af15b336e6a9619928537df30b2e6a2376569fcf9d7e773eccede65606529a0';
  const ok   = await sbUpsert('app_users', { visa, password_hash: hash, must_change_password: true });
  if (ok) {
    adminUsers.push({ visa, must_change_password: true });
    renderAdmin();
  }
}

// ─────────────────────────────────────────────
//  ADMIN — MODÈLES
// ─────────────────────────────────────────────
function renderAdminModels() {
  let html = `
    <div class="admin-section-hd">
      <div class="section-header" style="margin:0">Modèles (${productModels.length})</div>
      <button class="admin-add-btn" onclick="openModelSheet(null)">+ Ajouter</button>
    </div>
    <div class="card" style="padding:0;overflow:hidden">`;

  if (!productModels.length) {
    html += `<div class="entry-row"><span style="color:var(--secondary)">Aucun modèle</span></div>`;
  } else {
    productModels.forEach((m, i) => {
      const sep = i < productModels.length - 1 ? 'entry-row-sep' : '';
      html += `
        <div class="entry-row ${sep}">
          <div class="entry-row-info">
            <div class="entry-model">${m.name}</div>
            <div class="entry-detail">${m.molds_per_series} moules par série</div>
          </div>
          <div class="entry-row-btns">
            <button class="entry-btn" onclick="openModelSheet('${m.name}')">✏️</button>
            <button class="entry-btn entry-btn-del" onclick="adminDeleteModel('${m.name}')">🗑</button>
          </div>
        </div>`;
    });
  }
  html += `</div>`;
  return html;
}

let modelOrigName = null;
let modelMoldsVal = 27;

function openModelSheet(name) {
  modelOrigName = name;
  const m = name ? productModels.find(x => x.name === name) : null;
  modelMoldsVal = m ? m.molds_per_series : 27;
  document.getElementById('model-sheet-title').textContent = name ? 'Modifier le modèle' : 'Nouveau modèle';
  document.getElementById('model-name-input').value = m?.name || '';
  document.getElementById('model-molds-val').value = modelMoldsVal;
  document.getElementById('model-sheet-error').textContent = '';
  document.getElementById('model-sheet').classList.add('open');
}
function closeModelSheet() {
  document.getElementById('model-sheet').classList.remove('open');
}
function closeModelSheetIfBackdrop(ev) {
  if (ev.target === document.getElementById('model-sheet')) closeModelSheet();
}
function modelMoldsSet(val) {
  modelMoldsVal = Math.max(1, Math.min(9999, Math.floor(+val) || 1));
  const el = document.getElementById('model-molds-val');
  if (el) el.value = modelMoldsVal;
}
function modelMoldsStep(delta) { modelMoldsSet(modelMoldsVal + delta); }
async function saveModelSheet() {
  const name = document.getElementById('model-name-input').value.trim();
  const err  = document.getElementById('model-sheet-error');
  if (!name) { err.textContent = 'Nom requis'; return; }
  // Lire la valeur saisie à la main si modifiée
  modelMoldsVal = Math.max(1, parseInt(document.getElementById('model-molds-val').value) || modelMoldsVal);

  // Si nom modifié, supprimer l'ancien
  if (modelOrigName && modelOrigName !== name) {
    await sbDelete(`/rest/v1/product_models?name=eq.${encodeURIComponent(modelOrigName)}`);
    productModels = productModels.filter(m => m.name !== modelOrigName);
  }
  const ok = await sbUpsert('product_models', { name, molds_per_series: modelMoldsVal });
  if (ok) {
    const idx = productModels.findIndex(m => m.name === name);
    if (idx >= 0) productModels[idx] = { name, molds_per_series: modelMoldsVal };
    else { productModels.push({ name, molds_per_series: modelMoldsVal }); productModels.sort((a, b) => a.name.localeCompare(b.name)); }
    closeModelSheet();
    renderAdmin();
  } else {
    err.textContent = "Erreur d'enregistrement";
  }
}
async function adminDeleteModel(name) {
  if (!confirm(`Supprimer le modèle "${name}" ?`)) return;
  await sbDelete(`/rest/v1/product_models?name=eq.${encodeURIComponent(name)}`);
  productModels = productModels.filter(m => m.name !== name);
  renderAdmin();
}

// ─────────────────────────────────────────────
//  ADMIN — PLANNINGS
// ─────────────────────────────────────────────
function renderAdminSchedules() {
  let html = `
    <div class="admin-section-hd">
      <div class="section-header" style="margin:0">Plannings (${schedules.length})</div>
      <button class="admin-add-btn" onclick="openScheduleEditor(null)">+ Ajouter</button>
    </div>`;

  if (!schedules.length) {
    html += emptyState('Aucun planning', 'Aucun planning créé');
  } else {
    html += `<div class="card" style="padding:0;overflow:hidden">`;
    schedules.forEach((s, i) => {
      const sep  = i < schedules.length - 1 ? 'entry-row-sep' : '';
      const type = s.week_type === 'Matin' ? '🌅 Matin' : '🌆 Après-midi';
      const key  = localDateOf(s.week_start_date);
      html += `
        <div class="entry-row ${sep}">
          <div class="entry-row-info">
            <div class="entry-model">${weekLabel(s)}</div>
            <div class="entry-detail">${type}</div>
          </div>
          <div class="entry-row-btns">
            <button class="entry-btn" onclick="openScheduleEditor('${key}')">✏️</button>
            <button class="entry-btn entry-btn-del" onclick="adminDeleteSchedule('${key}')">🗑</button>
          </div>
        </div>`;
    });
    html += `</div>`;
  }
  return html;
}

async function adminDeleteSchedule(weekDateStr) {
  const s = schedules.find(x => localDateOf(x.week_start_date) === weekDateStr);
  if (!s || !confirm('Supprimer ce planning ?')) return;
  await sbDelete(`/rest/v1/week_schedules?week_start_date=eq.${encodeURIComponent(s.week_start_date)}`);
  schedules = schedules.filter(x => localDateOf(x.week_start_date) !== weekDateStr);
  renderAdmin();
}

// ─────────────────────────────────────────────
//  ADMIN — ÉDITEUR DE PLANNING
// ─────────────────────────────────────────────
function openScheduleEditor(weekDateStr) {
  // weekDateStr = null (nouveau) ou "YYYY-MM-DD" (existant)
  editingSchedObj = weekDateStr ? schedules.find(x => localDateOf(x.week_start_date) === weekDateStr) : null;

  if (editingSchedObj) {
    const p = editingSchedObj.payload;
    schedEditor.weekStartDate = localDateOf(editingSchedObj.week_start_date);
    schedEditor.weekType      = editingSchedObj.week_type;
    schedEditor.hideSaturday  = p.hideSaturday || false;
    schedEditor.dayStatuses   = STATUS_KEYS.map(k => p[k] || '');
  } else {
    // Par défaut : prochain lundi
    const d   = new Date(); d.setHours(0, 0, 0, 0);
    const dow = d.getDay(); // 0=Dim
    const off = [1, 7, 6, 5, 4, 3, 2];
    d.setDate(d.getDate() + off[dow]);
    schedEditor.weekStartDate = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    schedEditor.weekType      = 'Matin';
    schedEditor.hideSaturday  = false;
    schedEditor.dayStatuses   = ['', '', '', '', '', ''];
  }

  // Initialiser les affectations avec tous les visas connus
  schedEditor.assignments = {};
  adminVisas.forEach(v => { schedEditor.assignments[v.identifier] = ['', '', '', '', '', '']; });

  // Charger les affectations existantes
  if (editingSchedObj) {
    CATS.forEach(cat => {
      cat.visas(editingSchedObj.payload).forEach((arr, di) => {
        arr.forEach(visa => {
          if (!schedEditor.assignments[visa]) schedEditor.assignments[visa] = ['', '', '', '', '', ''];
          schedEditor.assignments[visa][di] = cat.key;
        });
      });
    });
  }

  document.getElementById('sched-editor-title').textContent = editingSchedObj ? 'Modifier le planning' : 'Nouveau planning';
  renderScheduleEditorBody();
  document.getElementById('sched-editor-sheet').classList.add('open');
}

function closeScheduleEditor() {
  document.getElementById('sched-editor-sheet').classList.remove('open');
}
function closeSchedEditorIfBackdrop(ev) {
  if (ev.target === document.getElementById('sched-editor-sheet')) closeScheduleEditor();
}

function renderScheduleEditorBody() {
  const dayCount  = schedEditor.hideSaturday ? 5 : 6;
  const dayNames  = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'].slice(0, dayCount);
  const catOpts   = ['', 'ZAC1', 'ZAC2', 'Vérif', 'Formation', 'Congés', 'Maladie'];
  const statOpts  = ['', 'Fermé', 'Férié'];
  const visaList  = Object.keys(schedEditor.assignments).sort();

  let html = `
    <!-- Paramètres semaine -->
    <div class="form-row" style="margin-bottom:10px">
      <div class="form-field">
        <label>Début (lundi)</label>
        <input type="date" value="${schedEditor.weekStartDate}"
          onchange="schedEditor.weekStartDate=this.value"
          style="border:none;background:transparent;font-size:15px;color:var(--blue);outline:none;text-align:right" />
      </div>
      <div class="form-field">
        <label>Type</label>
        <select onchange="schedEditor.weekType=this.value"
          style="border:none;background:transparent;font-size:15px;color:var(--blue);outline:none">
          <option value="Matin"${schedEditor.weekType==='Matin'?' selected':''}>🌅 Matin</option>
          <option value="Après-midi"${schedEditor.weekType==='Après-midi'?' selected':''}>🌆 Après-midi</option>
        </select>
      </div>
      <div class="form-field">
        <label>Sans samedi</label>
        <input type="checkbox" ${schedEditor.hideSaturday?'checked':''}
          onchange="schedEditor.hideSaturday=this.checked;renderScheduleEditorBody()"
          style="width:20px;height:20px;accent-color:var(--blue)" />
      </div>
    </div>

    <!-- Statuts des jours -->
    <div class="section-header" style="margin-top:2px">Statut des jours</div>
    <div class="form-row" style="margin-bottom:10px">
      ${dayNames.map((d, i) => `
        <div class="form-field">
          <label>${d}</label>
          <select onchange="schedEditor.dayStatuses[${i}]=this.value"
            style="border:none;background:transparent;font-size:13px;color:var(--blue);outline:none">
            ${statOpts.map(s => `<option value="${s}"${schedEditor.dayStatuses[i]===s?' selected':''}>${s||'Normal'}</option>`).join('')}
          </select>
        </div>`).join('')}
    </div>

    <!-- Affectations par visa -->
    <div class="section-header" style="margin-top:2px">Affectations</div>`;

  if (!visaList.length) {
    html += `<p style="color:var(--secondary);text-align:center;padding:16px 0;font-size:14px">Aucun membre — ajoutez des membres d'abord</p>`;
  } else {
    html += `
      <div class="table-wrap" style="margin-bottom:12px;border-radius:10px;overflow:hidden;border:1px solid var(--sep)">
        <table style="border-collapse:collapse;width:100%;font-size:12px;min-width:${50 + dayCount * 88}px">
          <thead>
            <tr style="background:var(--bg-alt)">
              <th style="padding:7px 10px;text-align:left;font-weight:600;color:var(--secondary);min-width:50px;position:sticky;left:0;background:var(--bg-alt)">Visa</th>
              ${dayNames.map(d => `<th style="padding:7px 4px;text-align:center;font-weight:600;color:var(--secondary);min-width:88px">${d}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${visaList.map((visa, ri) => `
              <tr style="border-top:1px solid var(--sep);background:${ri%2?'var(--bg-alt)':'transparent'}">
                <td style="padding:5px 10px;font-weight:700;position:sticky;left:0;background:${ri%2?'var(--bg-alt)':'var(--card)'}">${visa}</td>
                ${Array.from({length: dayCount}, (_, di) => `
                  <td style="padding:4px 3px;text-align:center">
                    <select onchange="schedEditor.assignments['${visa}'][${di}]=this.value"
                      style="border:1px solid var(--sep);border-radius:6px;background:var(--card);color:var(--text);font-size:11px;padding:3px 2px;width:100%;max-width:84px">
                      ${catOpts.map(c => `<option value="${c}"${schedEditor.assignments[visa]?.[di]===c?' selected':''}>${c||'—'}</option>`).join('')}
                    </select>
                  </td>`).join('')}
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
  }

  html += `<div id="sched-editor-error" style="color:var(--red);font-size:14px;text-align:center;min-height:18px;margin-bottom:4px"></div>`;
  document.getElementById('sched-editor-body').innerHTML = html;
}

function buildSchedulePayload() {
  const prefixes = ['monday','tuesday','wednesday','thursday','friday','saturday'];
  const catMap   = {
    'ZAC1':'ZAC1','ZAC2':'ZAC2','Vérif':'Verif',
    'Formation':'Formation','Congés':'Conges','Maladie':'Maladie'
  };
  const payload = { hideSaturday: schedEditor.hideSaturday };
  prefixes.forEach((p, i) => { payload[p + 'Status'] = schedEditor.dayStatuses[i] || ''; });
  prefixes.forEach(p => { Object.values(catMap).forEach(k => { payload[p + k] = []; }); });
  Object.entries(schedEditor.assignments).forEach(([visa, days]) => {
    days.forEach((cat, di) => {
      if (cat && catMap[cat]) payload[prefixes[di] + catMap[cat]].push(visa);
    });
  });
  return payload;
}

async function saveScheduleEditor() {
  const btn = document.getElementById('sched-editor-save-btn');
  btn.disabled = true;

  const payload = buildSchedulePayload();
  // Conserver la date ISO d'origine si édition, sinon créer
  const isoDate = editingSchedObj
    ? editingSchedObj.week_start_date
    : new Date(schedEditor.weekStartDate + 'T12:00:00').toISOString();

  const body = { week_start_date: isoDate, week_type: schedEditor.weekType, payload };
  const ok   = await sbUpsert('week_schedules', body);

  if (ok) {
    const idx = schedules.findIndex(s => localDateOf(s.week_start_date) === schedEditor.weekStartDate);
    if (idx >= 0) schedules[idx] = body;
    else { schedules.unshift(body); schedules.sort((a, b) => new Date(b.week_start_date) - new Date(a.week_start_date)); }
    closeScheduleEditor();
    renderAdmin();
    discordLog({
      title: editingSchedObj ? '📅 Planning modifié' : '📅 Planning créé',
      description: `Semaine du ${schedEditor.weekStartDate} — ${schedEditor.weekType}`,
      color: 5763719, visa: myVisa
    });
  } else {
    document.getElementById('sched-editor-error').textContent = "Erreur d'enregistrement";
    btn.disabled = false;
  }
}

// ─────────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────────
function emptyState(title, sub) {
  return `<div class="empty-state">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
      <rect x="3" y="4" width="18" height="18" rx="2"/>
      <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
    </svg>
    <p>${title}</p><small>${sub}</small>
  </div>`;
}

function sectionHeader(txt) { return `<div class="section-header">${txt}</div>`; }

// ─────────────────────────────────────────────
//  INIT
// ─────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').then(reg => {
      // Detect when a new service worker is waiting
      function checkForUpdate(reg) {
        if (reg.waiting) { showUpdateBar(); return; }
        reg.addEventListener('updatefound', () => {
          const nw = reg.installing;
          nw.addEventListener('statechange', () => {
            if (nw.state === 'installed' && navigator.serviceWorker.controller) showUpdateBar();
          });
        });
      }
      checkForUpdate(reg);
      // Poll every 30 min to check for updates
      setInterval(() => reg.update(), 30 * 60 * 1000);
    });
    // When a new SW takes control, reload the page automatically
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!refreshing) { refreshing = true; window.location.reload(); }
    });
  }

  loadOfflineQueue();
  updateOfflineIndicator();

  // Offline / online events
  window.addEventListener('online',  () => { updateOfflineIndicator(); processOfflineQueue(); });
  window.addEventListener('offline', updateOfflineIndicator);

  // Periodic retry every 15s when online and queue has items
  setInterval(() => { if (navigator.onLine && offlineQueue.length) processOfflineQueue(); }, 15000);

  ['login-visa', 'login-pass'].forEach(id => {
    document.getElementById(id).addEventListener('keydown', e => { if (e.key === 'Enter') handleLogin(); });
  });

  // Admin login via Entrée
  document.getElementById('admin-pass-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') handleAdminLogin();
  });

  // Dark mode
  if (localStorage.getItem('darkMode') === '1') {
    document.getElementById('dark-mode-toggle').checked = true;
  }

  const saved = localStorage.getItem('myVisa');
  if (saved) {
    myVisa = saved;
    document.getElementById('login-screen').style.display = 'none';
    showApp();
  }
});
