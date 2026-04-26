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
let myEntries     = [];   // entries fetched for stats
let currentTab    = 'planning';

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

// ─────────────────────────────────────────────
//  CRYPTO
// ─────────────────────────────────────────────
async function sha256(str) {
  const buf  = new TextEncoder().encode(str);
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
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
  myVisa = ''; schedules = []; productModels = []; myEntries = [];
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
  schedules     = scheds   || [];
  productModels = models   || [];
  myEntries     = (entries || []).map(e => ({
    ...e,
    dateObj: new Date(e.date),
    totalPieces: e.series_count * e.molds_per_series
  }));
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
  const titles = { planning: 'Planning', myweek: 'Ma semaine', entry: 'Saisie', stats: 'Statistiques' };
  document.getElementById('header-title').textContent = titles[tab];
  renderCurrentTab();
}

function renderCurrentTab() {
  if      (currentTab === 'planning') renderPlanning();
  else if (currentTab === 'myweek')   renderMyWeek();
  else if (currentTab === 'entry')    renderEntry();
  else if (currentTab === 'stats')    renderStats();
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
  const others   = schedules.filter(s => !isRelevant(s));
  let html = '';
  if (relevant) { html += sectionHeader(new Date().getDay() === 0 ? 'Semaine prochaine' : 'Cette semaine'); html += scheduleCard(relevant); }
  if (others.length) { html += sectionHeader('Autres semaines'); others.forEach(s => { html += scheduleCard(s); }); }
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
        } else {
          const v    = arr[ri] || '';
          const isMe = v && v === myVisa;
          cells += `<td>${isMe ? `<span class="visa-me ${cat.cls}">${v}</span>` : v}</td>`;
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
let entry = { modelName: null, moldsPerSeries: 27, seriesCount: 1, rejects: 0 };

function renderEntry() {
  const el = document.getElementById('tab-entry');
  if (!productModels.length) { el.innerHTML = emptyState('Aucun modèle', "Demande à l'admin d'ajouter des modèles"); return; }
  if (!entry.modelName) {
    entry.modelName      = productModels[0].name;
    entry.moldsPerSeries = productModels[0].molds_per_series || 27;
  }
  const total = entry.seriesCount * entry.moldsPerSeries;

  el.innerHTML = `
    <div class="form-section">
      <div class="form-label">Modèle</div>
      <div class="form-row">
        <div class="form-field">
          <label>Modèle</label>
          <select onchange="onModelChange(this.value)" style="border:none;background:transparent;font-size:16px;color:#007AFF;outline:none;max-width:160px;text-align:right;">
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
  const max = field === 'rejects' ? Math.max(entry.seriesCount * entry.moldsPerSeries, 1) : 999;
  entry[field] = Math.max(0, Math.min(max, entry[field] + delta));
  if (field !== 'rejects') entry.rejects = Math.min(entry.rejects, Math.max(0, entry.seriesCount * entry.moldsPerSeries));
  const map = { 'v-molds': entry.moldsPerSeries, 'v-series': entry.seriesCount,
                'v-total': entry.seriesCount * entry.moldsPerSeries, 'v-rejects': entry.rejects };
  Object.entries(map).forEach(([id, val]) => { const el = document.getElementById(id); if (el) el.textContent = val; });
}

async function saveEntry() {
  const btn = document.getElementById('entry-save-btn');
  const fb  = document.getElementById('entry-fb');
  btn.disabled = true; btn.textContent = 'Enregistrement…';

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const body = {
    id:                 crypto.randomUUID(),
    user_visa:          myVisa,
    date:               today.toISOString(),
    series_count:       entry.seriesCount,
    molds_per_series:   entry.moldsPerSeries,
    rejects:            entry.rejects,
    product_model_name: entry.modelName
  };

  const ok = await sbUpsert('production_entries', body);
  if (ok) {
    // Add to local state so stats update immediately
    myEntries.unshift({ ...body, dateObj: today, totalPieces: entry.seriesCount * entry.moldsPerSeries });
    fb.style.color = '#34C759'; fb.textContent = '✓ Saisie enregistrée !';
    entry.seriesCount = 1; entry.rejects = 0;
    setTimeout(() => { fb.textContent = ''; renderEntry(); }, 2000);
  } else {
    fb.style.color = '#FF3B30'; fb.textContent = "Erreur lors de l'enregistrement";
    btn.disabled = false; btn.textContent = 'Enregistrer la saisie';
  }
}

// ─────────────────────────────────────────────
//  STATS
// ─────────────────────────────────────────────
let statsPeriod = 'week';

function renderStats() {
  const el = document.getElementById('tab-stats');

  const today = new Date(); today.setHours(0, 0, 0, 0);
  let startDate;
  if (statsPeriod === 'day') {
    startDate = new Date(today);
  } else if (statsPeriod === 'week') {
    startDate = new Date(today); startDate.setDate(today.getDate() - 6);
  } else {
    startDate = new Date(today.getFullYear(), today.getMonth(), 1);
  }

  const filtered = myEntries.filter(e => e.dateObj >= startDate);
  const totalPieces  = filtered.reduce((s, e) => s + e.totalPieces, 0);
  const totalRejects = filtered.reduce((s, e) => s + e.rejects, 0);
  const rejectRate   = totalPieces > 0 ? (totalRejects / totalPieces * 100) : 0;

  // Group by day
  const byDay = {};
  filtered.forEach(e => {
    const key = e.dateObj.toDateString();
    if (!byDay[key]) byDay[key] = { date: e.dateObj, pieces: 0, rejects: 0 };
    byDay[key].pieces  += e.totalPieces;
    byDay[key].rejects += e.rejects;
  });
  const days = Object.values(byDay).sort((a, b) => a.date - b.date);

  // Group by model
  const byModel = {};
  filtered.forEach(e => {
    const key = e.product_model_name || 'Inconnu';
    if (!byModel[key]) byModel[key] = { name: key, pieces: 0, rejects: 0 };
    byModel[key].pieces  += e.totalPieces;
    byModel[key].rejects += e.rejects;
  });
  const models = Object.values(byModel).sort((a, b) => b.pieces - a.pieces);

  // Best day
  const best = days.reduce((b, d) => d.pieces > (b?.pieces ?? 0) ? d : b, null);
  const avg  = days.length ? (totalPieces / days.length).toFixed(0) : 0;

  const periods = [['day', "Aujourd'hui"], ['week', '7 derniers jours'], ['month', 'Ce mois']];

  let html = `
    <!-- Period picker -->
    <div class="segment-control" style="margin-bottom:16px">
      ${periods.map(([k, l]) => `<button class="${statsPeriod===k?'active':''}" onclick="setStatsPeriod('${k}')">${l}</button>`).join('')}
    </div>`;

  if (!filtered.length) {
    html += emptyState('Aucune donnée', 'Aucune production enregistrée sur cette période');
    html += logoutBtn();
    el.innerHTML = html; return;
  }

  // KPI cards
  const rateColor = rejectRate > 5 ? '#FF3B30' : rejectRate > 2 ? '#FF9500' : '#34C759';
  html += `
    <div class="kpi-row">
      <div class="kpi-card"><div class="kpi-val" style="color:#007AFF">${totalPieces}</div><div class="kpi-label">Moules</div></div>
      <div class="kpi-card"><div class="kpi-val" style="color:${totalRejects>0?'#FF3B30':'#8E8E93'}">${totalRejects}</div><div class="kpi-label">Rebuts</div></div>
      <div class="kpi-card"><div class="kpi-val" style="color:${rateColor}">${rejectRate.toFixed(1)}%</div><div class="kpi-label">Taux rebut</div></div>
    </div>`;

  // Bar chart (show only if > 1 day and not "today" period)
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

  // Indicateurs
  html += `
    <div class="card">
      <div class="card-title">Indicateurs</div>`;
  if (statsPeriod !== 'day') {
    html += `
      <div class="stat-row"><span>Moyenne / jour</span><span class="stat-val">${avg} moules</span></div>`;
    if (best) {
      const bestLbl = best.date.toLocaleDateString('fr-FR', { weekday:'short', day:'numeric', month:'short' });
      html += `
        <div class="stat-row"><span>Meilleure journée</span><div style="text-align:right"><div class="stat-val">${best.pieces} moules</div><div style="font-size:12px;color:#8E8E93">${bestLbl}</div></div></div>`;
    }
  }
  html += `
      <div class="stat-row"><span>Taux de réussite</span><span class="stat-val" style="color:#34C759">${(100-rejectRate).toFixed(1)}%</span></div>
    </div>`;

  // Par modèle
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
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js');

  ['login-visa', 'login-pass'].forEach(id => {
    document.getElementById(id).addEventListener('keydown', e => { if (e.key === 'Enter') handleLogin(); });
  });

  const saved = localStorage.getItem('myVisa');
  if (saved) { myVisa = saved; showApp(); }
});
