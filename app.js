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

async function sbDelete(path) {
  try {
    const r = await fetch(SB_URL + path, { method: 'DELETE', headers: HEADERS });
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
//  DISCORD LOGGER
// ─────────────────────────────────────────────
const DISCORD_WEBHOOK = 'https://discord.com/api/webhooks/1495861049889525810/'
  + 'LCroi8U-e1A7q13FvLvnX9Um7OIF99HUr5iVYjRSP7yspEr6RkYTIYXy2VNsNHnqvoV0';

function deviceDescription() {
  const ua = navigator.userAgent;
  let device = 'Web';
  if      (/iPhone/.test(ua))   device = 'iPhone';
  else if (/iPad/.test(ua))     device = 'iPad';
  else if (/Android/.test(ua))  device = 'Android';
  else if (/Macintosh/.test(ua))device = 'Mac';
  else if (/Windows/.test(ua))  device = 'Windows';
  else if (/Linux/.test(ua))    device = 'Linux';

  let browser = '';
  if      (/CriOS/.test(ua))    browser = 'Chrome iOS';
  else if (/FxiOS/.test(ua))    browser = 'Firefox iOS';
  else if (/EdgA/.test(ua))     browser = 'Edge Android';
  else if (/Edg\//.test(ua))    browser = 'Edge';
  else if (/OPR/.test(ua))      browser = 'Opera';
  else if (/Chrome/.test(ua))   browser = 'Chrome';
  else if (/Firefox/.test(ua))  browser = 'Firefox';
  else if (/Safari/.test(ua))   browser = 'Safari';
  else                           browser = 'Navigateur';

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
  else if (currentTab === 'stats')    refreshAndRenderStats();
}

async function refreshAndRenderStats() {
  // Affiche un loader puis fetch les dernières saisies depuis Supabase
  document.getElementById('tab-stats').innerHTML =
    '<div class="spinner-wrap"><div class="spinner"></div></div>';
  const rows = await sbGet(
    `/rest/v1/production_entries?user_visa=eq.${encodeURIComponent(myVisa)}&select=*&order=date.desc`
  );
  myEntries = (rows || []).map(e => ({
    ...e,
    dateObj:     new Date(e.date),
    totalPieces: e.series_count * e.molds_per_series
  }));
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
//  SAISIE — TAB (liste + navigation date)
// ─────────────────────────────────────────────

// Retourne "YYYY-MM-DD" dans le fuseau LOCAL du navigateur
// (évite le décalage UTC+2 qui décalerait tout d'un jour)
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function localDateOf(isoStr) {
  const d = new Date(isoStr);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

let selectedEntryDate = todayStr();

function renderEntry() { refreshEntryTab(); }

async function refreshEntryTab() {
  const el = document.getElementById('tab-entry');
  el.innerHTML = '<div class="spinner-wrap"><div class="spinner"></div></div>';
  const rows = await sbGet(
    `/rest/v1/production_entries?user_visa=eq.${encodeURIComponent(myVisa)}&select=*&order=date.desc`
  );
  myEntries = (rows || []).map(e => ({
    ...e, dateObj: new Date(e.date), totalPieces: e.series_count * e.molds_per_series
  }));
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

  // Date display — use noon local time to avoid timezone edge cases
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
      html += `
      <div class="entry-row ${sep}">
        <div class="entry-row-info">
          <div class="entry-model">${model}</div>
          <div class="entry-detail">${e.series_count} × ${e.molds_per_series} = <strong>${e.totalPieces} moules</strong>${rejectTxt}</div>
        </div>
        <div class="entry-row-btns">
          <button class="entry-btn" onclick="openEditSheet('${e.id}')">✏️</button>
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
let entrySheetMode = 'add';  // 'add' | 'edit'
let editingEntryId = null;
let entry = { modelName: null, moldsPerSeries: 27, seriesCount: 1, rejects: 0 };

function openAddSheet() {
  entrySheetMode = 'add';
  editingEntryId = null;
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
            <span id="sh-molds">${entry.moldsPerSeries}</span>
            <button onclick="sheetStep('moldsPerSeries',1)">+</button>
          </div>
        </div>
        <div class="form-field">
          <label>Séries</label>
          <div class="stepper">
            <button onclick="sheetStep('seriesCount',-1)">−</button>
            <span id="sh-series">${entry.seriesCount}</span>
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
            <span id="sh-rejects">${entry.rejects}</span>
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

function sheetStep(field, delta) {
  const max = field === 'rejects' ? Math.max(entry.seriesCount * entry.moldsPerSeries, 1) : 999;
  entry[field] = Math.max(0, Math.min(max, entry[field] + delta));
  if (field !== 'rejects') entry.rejects = Math.min(entry.rejects, Math.max(0, entry.seriesCount * entry.moldsPerSeries));
  const map = { 'sh-molds': entry.moldsPerSeries, 'sh-series': entry.seriesCount,
                'sh-total': entry.seriesCount * entry.moldsPerSeries, 'sh-rejects': entry.rejects };
  Object.entries(map).forEach(([id, val]) => { const el = document.getElementById(id); if (el) el.textContent = val; });
}

async function saveEntrySheet() {
  const btn = document.getElementById('sheet-save-btn');
  const fb  = document.getElementById('sheet-fb');
  if (!entry.modelName) { fb.textContent = 'Sélectionne un modèle'; return; }
  btn.disabled = true;

  if (entrySheetMode === 'add') {
    const id      = crypto.randomUUID();
    const dateISO = new Date(selectedEntryDate + 'T00:00:00').toISOString(); // minuit local → UTC
    const body    = {
      id, user_visa: myVisa, date: dateISO,
      series_count: entry.seriesCount, molds_per_series: entry.moldsPerSeries,
      rejects: entry.rejects, product_model_name: entry.modelName
    };
    const ok = await sbUpsert('production_entries', body);
    if (ok) {
      myEntries.unshift({ ...body, dateObj: new Date(dateISO), totalPieces: entry.seriesCount * entry.moldsPerSeries });
      const total = entry.seriesCount * entry.moldsPerSeries;
      let desc = `**Modèle:** ${entry.modelName}\n**Séries:** ${entry.seriesCount} × ${entry.moldsPerSeries} = **${total} moules**`;
      if (entry.rejects > 0) desc += `\n**Rebuts:** ${entry.rejects}`;
      const d = new Date(selectedEntryDate + 'T12:00:00');
      desc += `\n**Date:** ${d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}`;
      discordLog({ title: '✅ Saisie ajoutée', description: desc, color: 5763719, visa: myVisa });
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
  if (!confirm('Supprimer cette saisie ?')) return;
  const e       = myEntries.find(x => x.id === id);
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

  // Calcul de la date de début en chaîne locale YYYY-MM-DD (évite le décalage UTC)
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

  // Filtrage par date locale (pas par dateObj qui est en UTC)
  const filtered = myEntries.filter(e => localDateOf(e.date) >= startDateStr);
  const totalPieces  = filtered.reduce((s, e) => s + e.totalPieces, 0);
  const totalRejects = filtered.reduce((s, e) => s + e.rejects, 0);
  const rejectRate   = totalPieces > 0 ? (totalRejects / totalPieces * 100) : 0;

  // Group by local day
  const byDay = {};
  filtered.forEach(e => {
    const key = localDateOf(e.date);
    if (!byDay[key]) byDay[key] = { key, date: new Date(key + 'T12:00:00'), pieces: 0, rejects: 0 };
    byDay[key].pieces  += e.totalPieces;
    byDay[key].rejects += e.rejects;
  });
  const days = Object.values(byDay).sort((a, b) => a.key.localeCompare(b.key));

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
  if (saved) {
    myVisa = saved;
    document.getElementById('login-screen').style.display = 'none';
    showApp();
  }
});
