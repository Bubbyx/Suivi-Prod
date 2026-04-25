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
let myVisa = '';
let pendingUser = null;
let schedules = [];
let productModels = [];
let currentTab = 'planning';

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

const DAY_LABELS   = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
const STATUS_KEYS  = ['mondayStatus','tuesdayStatus','wednesdayStatus','thursdayStatus','fridayStatus','saturdayStatus'];

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

// ─────────────────────────────────────────────
//  CRYPTO
// ─────────────────────────────────────────────
async function sha256(str) {
  const buf = new TextEncoder().encode(str);
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ─────────────────────────────────────────────
//  AUTH
// ─────────────────────────────────────────────
async function handleLogin() {
  const visaEl  = document.getElementById('login-visa');
  const passEl  = document.getElementById('login-pass');
  const errEl   = document.getElementById('login-error');
  const btn     = document.getElementById('login-btn');

  const visa = visaEl.value.trim().toUpperCase();
  const pass = passEl.value;
  if (!visa || !pass) return;

  btn.disabled = true;
  btn.textContent = 'Connexion…';
  errEl.textContent = '';

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
  if (p1.length < 4)  { err.textContent = 'Minimum 4 caractères'; return; }
  if (p1 !== p2)      { err.textContent = 'Les mots de passe ne correspondent pas'; return; }
  const hash = await sha256(p1);
  await sbUpsert('app_users', { visa: pendingUser.visa, password_hash: hash, must_change_password: false });
  finishLogin(pendingUser.visa);
}

function finishLogin(visa) {
  myVisa = visa;
  localStorage.setItem('myVisa', visa);
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('change-password-screen').style.display = 'none';
  showApp();
}

function logout() {
  myVisa = ''; schedules = []; productModels = [];
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
  const [scheds, models] = await Promise.all([
    sbGet('/rest/v1/week_schedules?select=*&order=week_start_date.desc'),
    sbGet('/rest/v1/product_models?select=*&order=name.asc')
  ]);
  schedules     = scheds  || [];
  productModels = models  || [];
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
  const titles = { planning: 'Planning', myweek: 'Ma semaine', entry: 'Saisie', settings: 'Réglages' };
  document.getElementById('header-title').textContent = titles[tab];
  renderCurrentTab();
}

function renderCurrentTab() {
  if      (currentTab === 'planning') renderPlanning();
  else if (currentTab === 'myweek')   renderMyWeek();
  else if (currentTab === 'entry')    renderEntry();
  else if (currentTab === 'settings') renderSettings();
}

// ─────────────────────────────────────────────
//  WEEK HELPERS
// ─────────────────────────────────────────────
function getRelevantMonday() {
  const today = new Date();
  const dow   = today.getDay();                   // 0=Sun
  const diff  = dow === 0 ? 1 : -(dow - 1);       // next Mon if Sun, else this Mon
  const mon   = new Date(today);
  mon.setDate(today.getDate() + diff);
  mon.setHours(0, 0, 0, 0);
  return mon;
}

function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear()
      && a.getMonth()    === b.getMonth()
      && a.getDate()     === b.getDate();
}

function isRelevant(s) {
  return isSameDay(new Date(s.week_start_date), getRelevantMonday());
}

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
  if (!schedules.length) {
    el.innerHTML = emptyState('Aucun planning', 'Aucun planning disponible pour le moment'); return;
  }
  const relevant = schedules.find(isRelevant);
  const others   = schedules.filter(s => !isRelevant(s));
  let html = '';
  if (relevant) {
    html += sectionHeader(new Date().getDay() === 0 ? 'Semaine prochaine' : 'Cette semaine');
    html += scheduleCard(relevant);
  }
  if (others.length) {
    html += sectionHeader('Autres semaines');
    others.forEach(s => { html += scheduleCard(s); });
  }
  el.innerHTML = html;
}

function scheduleCard(s) {
  const p        = s.payload;
  const isMatin  = s.week_type === 'Matin';
  const dayCount = p.hideSaturday ? 5 : 6;
  const labels   = DAY_LABELS.slice(0, dayCount);
  const statuses = STATUS_KEYS.slice(0, dayCount).map(k => p[k] || '');

  let headerRow = '<th></th>' + labels.map(l => `<th>${l}</th>`).join('');
  let bodyRows  = '';

  CATS.forEach((cat, ci) => {
    const dayArrays = cat.visas(p).slice(0, dayCount);
    const maxR      = Math.max(...dayArrays.map(a => a.length), 1);
    const rowBg     = ci % 2 !== 0 ? 'style="background:rgba(242,242,247,0.7)"' : '';

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
          // ri > 0: cell already covered by rowspan — emit nothing
        } else {
          const v    = arr[ri] || '';
          const isMe = v && v === myVisa;
          cells += `<td>${isMe ? `<span class="visa-me ${cat.cls}">${v}</span>` : v}</td>`;
        }
      });
      bodyRows += `<tr ${rowBg}>${cells}</tr>`;
    }
  });

  const badgeCls  = isMatin ? 'badge-matin' : 'badge-aprem';
  const badgeTxt  = isMatin ? 'Matin'       : 'Après-midi';

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

  if (!s) {
    el.innerHTML = emptyState('Aucun planning', 'Aucun planning pour cette semaine'); return;
  }

  const p        = s.payload;
  const dayCount = p.hideSaturday ? 5 : 6;
  const shiftEnd = s.week_type === 'Matin' ? '13h00' : '20h00';
  const mon      = new Date(s.week_start_date);

  const days = [];
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

  if (!days.length) {
    el.innerHTML = emptyState('Pas de saisie', `Ton visa ${myVisa} n'apparaît pas dans ce planning`); return;
  }

  let html = sectionHeader(weekLabel(s));
  days.forEach(({ label, date, cat, colleagues }) => {
    const isWorking = cat.key === 'ZAC1' || cat.key === 'ZAC2';
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
        </div>
      </div>`;
  });
  el.innerHTML = html;
}

// ─────────────────────────────────────────────
//  SAISIE
// ─────────────────────────────────────────────
let entry = { modelName: null, moldsPerSeries: 27, seriesCount: 1, rejects: 0, vacation: null };

function renderEntry() {
  const el = document.getElementById('tab-entry');
  if (!productModels.length) {
    el.innerHTML = emptyState('Aucun modèle', "Demande à l'admin d'ajouter des modèles"); return;
  }
  if (!entry.modelName) {
    entry.modelName       = productModels[0].name;
    entry.moldsPerSeries  = productModels[0].molds_per_series || 27;
  }
  const total = entry.seriesCount * entry.moldsPerSeries;
  const vacs  = ['Matin', 'Après-midi', 'Nuit'];

  el.innerHTML = `
    <div class="form-section">
      <div class="form-label">Modèle</div>
      <div class="form-row">
        <div class="form-field">
          <label>Modèle</label>
          <select onchange="onModelChange(this.value)" style="border:none;background:transparent;font-size:16px;color:#007AFF;outline:none;">
            ${productModels.map(m => `<option value="${m.name}"${m.name===entry.modelName?' selected':''}>${m.name}</option>`).join('')}
          </select>
        </div>
      </div>
    </div>

    <div class="form-section">
      <div class="form-label">Production</div>
      <div class="form-row">
        <div class="form-field">
          <label>Moules / série</label>
          <div class="stepper">
            <button onclick="step('moldsPerSeries',-1)">−</button>
            <span id="v-molds">${entry.moldsPerSeries}</span>
            <button onclick="step('moldsPerSeries',1)">+</button>
          </div>
        </div>
        <div class="form-field">
          <label>Séries</label>
          <div class="stepper">
            <button onclick="step('seriesCount',-1)">−</button>
            <span id="v-series">${entry.seriesCount}</span>
            <button onclick="step('seriesCount',1)">+</button>
          </div>
        </div>
        <div class="form-field">
          <label>Total moules</label>
          <span id="v-total" style="color:#007AFF;font-weight:700;font-size:18px">${total}</span>
        </div>
      </div>
    </div>

    <div class="form-section">
      <div class="form-label">Rebuts</div>
      <div class="form-row">
        <div class="form-field">
          <label>Rebuts</label>
          <div class="stepper">
            <button onclick="step('rejects',-1)">−</button>
            <span id="v-rejects">${entry.rejects}</span>
            <button onclick="step('rejects',1)">+</button>
          </div>
        </div>
      </div>
    </div>

    <div class="form-section">
      <div class="form-label">Vacation (optionnel)</div>
      <div class="segment-control">
        <button class="${entry.vacation===null?'active':''}" onclick="setVac(null)">—</button>
        ${vacs.map(v=>`<button class="${entry.vacation===v?'active':''}" onclick="setVac('${v}')">${v}</button>`).join('')}
      </div>
    </div>

    <button class="btn-primary" id="entry-save-btn" onclick="saveEntry()">Enregistrer la saisie</button>
    <div id="entry-fb" style="text-align:center;margin-top:12px;font-size:14px"></div>`;
}

function onModelChange(name) {
  entry.modelName = name;
  const m = productModels.find(x => x.name === name);
  if (m && m.molds_per_series > 0) entry.moldsPerSeries = m.molds_per_series;
  renderEntry();
}

function step(field, delta) {
  const total = entry.seriesCount * entry.moldsPerSeries;
  const max   = field === 'rejects' ? Math.max(total, 1) : 999;
  entry[field] = Math.max(0, Math.min(max, entry[field] + delta));
  if (field !== 'rejects') entry.rejects = Math.min(entry.rejects, Math.max(0, entry.seriesCount * entry.moldsPerSeries));
  const upd = { 'v-molds': entry.moldsPerSeries, 'v-series': entry.seriesCount,
                'v-total': entry.seriesCount * entry.moldsPerSeries, 'v-rejects': entry.rejects };
  Object.entries(upd).forEach(([id, val]) => { const el = document.getElementById(id); if (el) el.textContent = val; });
}

function setVac(v) { entry.vacation = v; renderEntry(); }

async function saveEntry() {
  const btn = document.getElementById('entry-save-btn');
  const fb  = document.getElementById('entry-fb');
  btn.disabled = true; btn.textContent = 'Enregistrement…';

  const today = new Date(); today.setHours(0,0,0,0);
  const body = {
    id:                crypto.randomUUID(),
    user_visa:         myVisa,
    date:              today.toISOString(),
    series_count:      entry.seriesCount,
    molds_per_series:  entry.moldsPerSeries,
    rejects:           entry.rejects,
    product_model_name: entry.modelName,
    ...(entry.vacation ? { vacation: entry.vacation } : {})
  };

  const ok = await sbUpsert('production_entries', body);
  if (ok) {
    fb.style.color = '#34C759'; fb.textContent = '✓ Saisie enregistrée !';
    entry.seriesCount = 1; entry.rejects = 0; entry.vacation = null;
    setTimeout(() => { fb.textContent = ''; renderEntry(); }, 2000);
  } else {
    fb.style.color = '#FF3B30'; fb.textContent = "Erreur lors de l'enregistrement";
    btn.disabled = false; btn.textContent = 'Enregistrer la saisie';
  }
}

// ─────────────────────────────────────────────
//  SETTINGS
// ─────────────────────────────────────────────
function renderSettings() {
  document.getElementById('tab-settings').innerHTML = `
    <div class="section-header">Mon compte</div>
    <div class="settings-row">
      <div class="settings-item">
        <span>Visa</span><span class="value">${myVisa}</span>
      </div>
    </div>
    <button class="btn-danger" onclick="logout()">Se déconnecter</button>`;
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

function sectionHeader(txt) {
  return `<div class="section-header">${txt}</div>`;
}

// ─────────────────────────────────────────────
//  INIT
// ─────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js');

  ['login-visa', 'login-pass'].forEach(id => {
    document.getElementById(id).addEventListener('keydown', e => { if (e.key === 'Enter') handleLogin(); });
  });

  const saved = localStorage.getItem('myVisa');
  if (saved) { myVisa = saved; showApp(); }
});
