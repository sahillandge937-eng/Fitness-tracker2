/*
  PULSE — Professional 3-file build
  Files: index.html + style.css + app.js
  Storage: browser localStorage (persistent between visits on the same browser)
  No backend dependency. Supabase can be added later without changing the UI.
*/

(() => {
  'use strict';

  const STORE_KEY = 'pulse_professional_v3';
  const SESSION_KEY = 'pulse_session_v3';
  const WORKOUT_TYPES = ['Run', 'Strength', 'Cycle', 'HIIT', 'Yoga', 'Swim'];
  const MEALS = ['Breakfast', 'Lunch', 'Dinner', 'Snack'];
  const MET = { Run: 9.8, Strength: 5.0, Cycle: 7.5, HIIT: 10.0, Yoga: 2.5, Swim: 8.0 };
  const NAV = [
    ['dashboard', '📊', 'Dashboard'],
    ['workouts', '🏋️', 'Workouts'],
    ['nutrition', '🍽️', 'Nutrition'],
    ['history', '📅', 'History'],
    ['analytics', '📈', 'Analytics'],
    ['exercises', '📚', 'Exercises'],
    ['progress', '📈', 'Progress'],
    ['activity', '🕒', 'Activity'],
    ['goals', '🎯', 'Goals'],
    ['coach', '🤖', 'AI Coach'],
    ['profile', '👤', 'Profile'],
    ['settings', '⚙️', 'Settings']
  ];

  let db = loadDB();
  let session = loadSession();
  let activeView = 'dashboard';
  let selectedHistoryMonth = localMonth();
  let chartInstances = [];

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  function defaultDB() {
    return { version: 3, nextId: 1, users: [], workouts: [], nutrition: [], weights: [], goals: [] };
  }

  function loadDB() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      if (parsed && parsed.version === 3) return parsed;
    } catch (e) {
      console.warn('PULSE storage read failed', e);
    }
    return defaultDB();
  }

  function loadSession() {
    try {
      const id = Number(localStorage.getItem(SESSION_KEY));
      return Number.isInteger(id) && id > 0 ? id : null;
    } catch (e) {
      return null;
    }
  }

  function saveDB() {
    localStorage.setItem(STORE_KEY, JSON.stringify(db));
  }

  function saveSession() {
    if (session) localStorage.setItem(SESSION_KEY, String(session));
    else localStorage.removeItem(SESSION_KEY);
  }

  function currentUser() {
    return db.users.find(u => u.id === session) || null;
  }

  function uid() {
    const id = db.nextId++;
    saveDB();
    return id;
  }

  function esc(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function num(v, fallback = 0) {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  }

  function localDateInput(date = new Date()) {
    const d = new Date(date);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function dateFromInput(value) {
    const [y, m, d] = String(value || '').split('-').map(Number);
    if (!y || !m || !d) return Date.now();
    return new Date(y, m - 1, d, 12, 0, 0, 0).getTime();
  }

  function localMonth(date = new Date()) {
    const d = new Date(date);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  function dayKey(ts) {
    const d = new Date(ts);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function startOfLocalDay(ts) {
    const d = new Date(ts);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }

  function todayTs() {
    return startOfLocalDay(Date.now());
  }

  function formatDate(ts, opts = { day: '2-digit', month: 'short', year: 'numeric' }) {
    return new Date(ts).toLocaleDateString(undefined, opts);
  }

  function formatDay(ts) {
    return new Date(ts).toLocaleDateString(undefined, { weekday: 'short', day: '2-digit', month: 'short' });
  }

  function monthLabel(month) {
    const [y, m] = month.split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  }

  function getUserRecords(list) {
    const id = session;
    return db[list].filter(x => x.userId === id);
  }

  function userWeight() {
    const u = currentUser();
    const latest = getUserRecords('weights').sort((a, b) => b.date - a.date)[0];
    return num(latest?.weight, num(u?.weight, 70));
  }

  function estimateCalories(type, minutes, intensity, weightKg) {
    const met = (MET[type] || 6) * (0.8 + (num(intensity, 3) * 0.12));
    return Math.max(1, Math.round(met * num(weightKg, 70) * (num(minutes) / 60)));
  }

  function aggregateDay(dateKeyValue) {
    const workouts = getUserRecords('workouts').filter(w => dayKey(w.date) === dateKeyValue);
    const nutrition = getUserRecords('nutrition').filter(n => dayKey(n.date) === dateKeyValue);
    return {
      workouts,
      nutrition,
      workoutCount: workouts.length,
      burned: workouts.reduce((s, w) => s + num(w.calories), 0),
      workoutMinutes: workouts.reduce((s, w) => s + num(w.duration), 0),
      taken: nutrition.reduce((s, n) => s + num(n.calories), 0),
      protein: nutrition.reduce((s, n) => s + num(n.protein), 0),
      carbs: nutrition.reduce((s, n) => s + num(n.carbs), 0),
      fat: nutrition.reduce((s, n) => s + num(n.fat), 0)
    };
  }

  function rangeDays(endTs, count) {
    const out = [];
    for (let i = count - 1; i >= 0; i--) {
      const d = new Date(endTs);
      d.setDate(d.getDate() - i);
      out.push(dayKey(d.getTime()));
    }
    return out;
  }

  function monthDays(month) {
    const [y, m] = month.split('-').map(Number);
    const days = new Date(y, m, 0).getDate();
    return Array.from({ length: days }, (_, i) => `${y}-${String(m).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`);
  }

  function monthlyRecords(month) {
    const days = monthDays(month);
    return days.map(key => ({ key, ...aggregateDay(key) }));
  }

  function weekStartKey(ts) {
    const d = new Date(ts);
    const dow = d.getDay();
    const diff = dow === 0 ? -6 : 1 - dow;
    d.setDate(d.getDate() + diff);
    d.setHours(0, 0, 0, 0);
    return dayKey(d.getTime());
  }

  function monthlyWeeks(month) {
    const map = new Map();
    monthlyRecords(month).forEach(day => {
      const start = weekStartKey(dateFromInput(day.key));
      if (!map.has(start)) map.set(start, { start, end: '', workouts: 0, burned: 0, taken: 0, minutes: 0 });
      const item = map.get(start);
      item.workouts += day.workoutCount;
      item.burned += day.burned;
      item.taken += day.taken;
      item.minutes += day.workoutMinutes;
      const s = new Date(dateFromInput(start));
      s.setDate(s.getDate() + 6);
      item.end = dayKey(s.getTime());
    });
    return [...map.values()].sort((a, b) => a.start.localeCompare(b.start));
  }

  function lastDays(count) {
    return rangeDays(todayTs(), count).map(key => ({ key, ...aggregateDay(key) }));
  }

  function streak() {
    let n = 0;
    const set = new Set(getUserRecords('workouts').map(w => dayKey(w.date)));
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    while (n < 365) {
      const k = dayKey(d.getTime());
      if (!set.has(k)) break;
      n++;
      d.setDate(d.getDate() - 1);
    }
    return n;
  }

  function seedHistory(userId) {
    if (db.workouts.some(x => x.userId === userId && x.demo) || db.nutrition.some(x => x.userId === userId && x.demo)) return;
    const baseWorkouts = [
      ['Run', 30, 5.0, 320, 2], ['Strength', 45, null, 280, 5], ['Cycle', 50, 12, 420, 7],
      ['HIIT', 35, null, 360, 10], ['Yoga', 40, null, 160, 12], ['Run', 35, 5.5, 350, 14],
      ['Strength', 50, null, 310, 17], ['Cycle', 45, 10, 380, 20], ['HIIT', 30, null, 330, 24],
      ['Run', 40, 6, 390, 28]
    ];
    const food = [
      ['Breakfast', 450, 18, 60, 15, 2], ['Lunch', 650, 30, 75, 20, 2], ['Dinner', 550, 25, 55, 18, 2],
      ['Snack', 250, 8, 30, 10, 2], ['Breakfast', 420, 17, 55, 14, 5], ['Lunch', 620, 29, 72, 19, 5],
      ['Dinner', 570, 26, 58, 18, 5], ['Breakfast', 460, 19, 62, 15, 9], ['Lunch', 640, 31, 74, 20, 9],
      ['Dinner', 560, 25, 57, 18, 9], ['Breakfast', 440, 18, 58, 14, 14], ['Lunch', 630, 30, 73, 19, 14],
      ['Dinner', 580, 27, 59, 19, 14], ['Breakfast', 455, 18, 60, 15, 20], ['Lunch', 660, 31, 76, 21, 20],
      ['Dinner', 540, 24, 54, 17, 20], ['Breakfast', 430, 17, 57, 14, 24], ['Lunch', 645, 30, 74, 20, 24],
      ['Dinner', 565, 26, 56, 18, 24], ['Breakfast', 470, 19, 63, 15, 28], ['Lunch', 650, 31, 75, 20, 28],
      ['Dinner', 560, 25, 57, 18, 28]
    ];
    baseWorkouts.forEach(([type, duration, distance, calories, day]) => {
      db.workouts.push({ id: uid(), userId, type, date: dateFromInput(`2026-09-${String(day).padStart(2, '0')}`), duration, distance, intensity: 3, calories, notes: '', demo: true });
    });
    food.forEach(([meal, calories, protein, carbs, fat, day]) => {
      db.nutrition.push({ id: uid(), userId, food: meal === 'Snack' ? 'Fruit & yogurt' : 'Balanced meal', meal, date: dateFromInput(`2026-09-${String(day).padStart(2, '0')}`), calories, protein, carbs, fat, demo: true });
    });
    // A second historical month keeps the History tab useful for college demonstration.
    [['Run', 28, 5, 290, 4], ['Strength', 40, null, 250, 9], ['Cycle', 45, 10, 360, 16], ['HIIT', 30, null, 310, 23]].forEach(([type, duration, distance, calories, day]) => {
      db.workouts.push({ id: uid(), userId, type, date: dateFromInput(`2026-08-${String(day).padStart(2, '0')}`), duration, distance, intensity: 3, calories, notes: '', demo: true });
    });
    [['Breakfast', 430, 17, 55, 14, 4], ['Lunch', 610, 29, 70, 19, 4], ['Dinner', 560, 25, 57, 18, 4], ['Breakfast', 450, 18, 60, 15, 16], ['Lunch', 640, 30, 74, 20, 16], ['Dinner', 570, 26, 58, 18, 16]].forEach(([meal, calories, protein, carbs, fat, day]) => {
      db.nutrition.push({ id: uid(), userId, food: 'Balanced meal', meal, date: dateFromInput(`2026-08-${String(day).padStart(2, '0')}`), calories, protein, carbs, fat, demo: true });
    });
    saveDB();
  }

  function notify(message, good = true) {
    const box = $('#toast');
    box.textContent = message;
    box.className = `toast ${good ? 'good' : 'bad'}`;
    box.hidden = false;
    clearTimeout(notify.timer);
    notify.timer = setTimeout(() => { box.hidden = true; }, 2600);
  }

  function openModal(title, body, onMount) {
    const root = $('#modalRoot');
    root.innerHTML = `<div class="modal-overlay" data-close-modal><div class="modal"><div class="modal-header"><h3>${esc(title)}</h3><button class="modal-close" data-modal-close>×</button></div>${body}</div></div>`;
    root.querySelector('.modal').addEventListener('click', e => e.stopPropagation());
    root.querySelector('[data-close-modal]').addEventListener('click', () => closeModal());
    root.querySelector('[data-modal-close]').addEventListener('click', () => closeModal());
    if (onMount) onMount(root.querySelector('.modal'));
  }

  function closeModal() { $('#modalRoot').innerHTML = ''; }

  function authUI() {
    const auth = $('#authScreen');
    const shell = $('#appShell');
    if (session && currentUser()) {
      auth.hidden = true;
      shell.hidden = false;
      $('#profileMini').innerHTML = `<div class="name">${esc(currentUser().name)}</div><div class="email">${esc(currentUser().email)}</div>`;
      return;
    }
    session = null;
    saveSession();
    shell.hidden = true;
    auth.hidden = false;
    let mode = 'login';
    const render = () => {
      auth.innerHTML = `
        <div class="auth-wrap">
          <section class="auth-hero">
            <div>
              <div class="hero-brand"><span class="dot"></span> PULSE</div>
              <h1>Train with data. Understand your day.</h1>
              <p>A professional fitness dashboard for workouts, nutrition, calorie balance and historical progress. Your data stays in this browser.</p>
              <div class="hero-pills"><span class="pill">Daily calories</span><span class="pill">Workout burn</span><span class="pill">Weekly view</span><span class="pill">Past months</span></div>
            </div>
            <div class="auth-footer">College-ready demo build · no server required</div>
          </section>
          <section class="auth-card">
            <div class="auth-tabs"><button class="auth-tab ${mode === 'login' ? 'active' : ''}" data-auth-tab="login">Login</button><button class="auth-tab ${mode === 'register' ? 'active' : ''}" data-auth-tab="register">Register</button></div>
            <div class="auth-note">For this 3-file build, login data is stored locally in your browser. It is for demo/project use, not production security.</div>
            <div id="authForm"></div>
          </section>
        </div>`;
      $('#authForm').innerHTML = mode === 'login' ? `
        <h2>Welcome back</h2><div class="auth-sub">Continue your PULSE dashboard.</div>
        <div class="field"><label>Email</label><input id="aEmail" type="email" placeholder="you@example.com"></div>
        <div class="field"><label>Password</label><input id="aPassword" type="password" placeholder="••••••"></div>
        <button class="btn btn-primary" id="loginBtn" style="width:100%;justify-content:center">Login to PULSE</button>
      ` : `
        <h2>Create your profile</h2><div class="auth-sub">Your new account automatically gets sample August/September history for demonstration.</div>
        <div class="field"><label>Full name</label><input id="aName" placeholder="Your name"></div>
        <div class="field"><label>Email</label><input id="aEmail" type="email" placeholder="you@example.com"></div>
        <div class="field"><label>Password</label><input id="aPassword" type="password" placeholder="At least 6 characters"></div>
        <div class="field-row"><div class="field"><label>Age</label><input id="aAge" type="number" min="13" max="100" value="20"></div><div class="field"><label>Weight (kg)</label><input id="aWeight" type="number" min="30" max="250" step="0.1" value="70"></div></div>
        <button class="btn btn-primary" id="registerBtn" style="width:100%;justify-content:center">Create PULSE account</button>
      `;
      $$('[data-auth-tab]', auth).forEach(btn => btn.onclick = () => { mode = btn.dataset.authTab; render(); });
      $('#loginBtn', auth)?.addEventListener('click', login);
      $('#registerBtn', auth)?.addEventListener('click', register);
    };
    render();
  }

  function login() {
    const email = $('#aEmail').value.trim().toLowerCase();
    const password = $('#aPassword').value;
    const user = db.users.find(u => u.email === email && u.password === password);
    if (!user) return notify('Email or password is incorrect.', false);
    session = user.id;
    saveSession();
    activeView = 'dashboard';
    authUI();
    route();
    notify('Welcome back to PULSE.');
  }

  function register() {
    const name = $('#aName').value.trim();
    const email = $('#aEmail').value.trim().toLowerCase();
    const password = $('#aPassword').value;
    const age = num($('#aAge').value, 20);
    const weight = num($('#aWeight').value, 70);
    if (!name || !email || password.length < 6) return notify('Enter your name, email and a 6+ character password.', false);
    if (db.users.some(u => u.email === email)) return notify('That email is already registered.', false);
    const user = { id: uid(), name, email, password, age, weight, calorieTarget: 2200, proteinTarget: 150, weeklyWorkoutTarget: 4, createdAt: Date.now() };
    db.users.push(user);
    db.weights.push({ id: uid(), userId: user.id, date: todayTs(), weight, demo: false });
    db.goals.push({ id: uid(), userId: user.id, title: '4 workouts per week', type: 'workouts', target: 4, unit: 'workouts' });
    saveDB();
    seedHistory(user.id);
    session = user.id;
    saveSession();
    activeView = 'dashboard';
    authUI();
    route();
    notify('Account created. Your history is ready.');
  }

  function renderSidebar() {
    $('#navGroup').innerHTML = NAV.map(([id, icon, label]) => `<div class="nav-item ${id === activeView ? 'active' : ''}" data-nav="${id}"><span>${icon}</span><span>${label}</span></div>`).join('');
    $$('[data-nav]').forEach(el => el.onclick = () => { activeView = el.dataset.nav; window.location.hash = activeView; $('#sidebar').classList.remove('open'); route(); });
  }

  function commonTop(title, subtitle = '') {
    $('#pageTitle').textContent = title;
    $('#pageDate').textContent = subtitle || new Date().toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    $('#topbarActions').innerHTML = `<button class="btn btn-primary desktop-only" data-action="quick-workout">+ Workout</button><button class="btn desktop-only" data-action="quick-food">+ Food</button>`;
    $('#topbarActions').onclick = e => {
      if (e.target.closest('[data-action="quick-workout"]')) workoutModal();
      if (e.target.closest('[data-action="quick-food"]')) nutritionModal();
    };
  }

  function route() {
    if (!session || !currentUser()) return authUI();
    renderSidebar();
    const hash = location.hash.replace('#', '');
    if (NAV.some(n => n[0] === hash)) activeView = hash;
    renderSidebar();
    switch (activeView) {
      case 'dashboard': renderDashboard(); break;
      case 'workouts': renderWorkouts(); break;
      case 'nutrition': renderNutrition(); break;
      case 'history': renderHistory(); break;
      case 'analytics': renderAnalytics(); break;
      case 'exercises': renderExercises(); break;
      case 'progress': renderProgress(); break;
      case 'activity': renderActivity(); break;
      case 'goals': renderGoals(); break;
      case 'coach': renderCoach(); break;
      case 'profile': renderProfile(); break;
      case 'settings': renderSettings(); break;
      default: renderDashboard();
    }
  }

  function renderDashboard() {
    commonTop('Dashboard');
    const u = currentUser();
    const today = aggregateDay(dayKey(Date.now()));
    const week = lastDays(7);
    const weekBurned = week.reduce((s, d) => s + d.burned, 0);
    const weekWorkouts = week.reduce((s, d) => s + d.workoutCount, 0);
    const target = num(u.calorieTarget, 2200);
    const caloriePct = Math.min(100, Math.round((today.taken / target) * 100));
    const net = today.taken - today.burned;
    const recent = getUserRecords('workouts').sort((a, b) => b.date - a.date).slice(0, 5);
    $('#content').innerHTML = `
      <div class="hero-card" style="margin-bottom:18px">
        <div><h2>Good ${new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 18 ? 'afternoon' : 'evening'}, ${esc(u.name.split(' ')[0])}.</h2><p>Today’s dashboard combines food intake, workout energy burn and historical records so you can see what actually changed each day.</p><div class="hero-actions"><button class="btn btn-primary" data-open-workout>Log workout</button><button class="btn" data-open-food>Log food</button><button class="btn" data-open-history>View history</button></div></div>
        <div class="hero-side"><div class="mini-stat"><div class="v">${today.taken.toLocaleString()} kcal</div><div class="l">Calories taken today</div></div><div class="mini-stat"><div class="v">${today.burned.toLocaleString()} kcal</div><div class="l">Calories burned from workouts</div></div></div>
      </div>
      <div class="grid grid-4" style="margin-bottom:18px">
        ${stat('🍽️ Calories taken', today.taken, 'kcal today', 'lime')}
        ${stat('🔥 Calories burned', today.burned, 'kcal from workouts', 'coral')}
        ${stat('🏋️ Workouts', today.workoutCount, `${today.workoutMinutes} min today`, 'sky')}
        ${stat('⚡ Net calories', net, 'taken − workout burn', net <= 0 ? 'sky' : 'amber')}
      </div>
      <div class="grid grid-2" style="margin-bottom:18px">
        <div class="card ring-card"><div class="ring" style="background:conic-gradient(var(--lime) ${caloriePct * 3.6}deg, rgba(255,255,255,.06) 0deg)"><div class="ring-center"><div class="big">${caloriePct}%</div><div class="small">of ${target.toLocaleString()} kcal goal</div></div></div><div><h3>Daily calorie intake</h3><p class="muted" style="font-size:11px;margin-bottom:12px">This uses the food entries you log today. No fake sensor data is added.</p><div class="kpi-row"><span class="kpi">Protein <strong>${today.protein}g</strong></span><span class="kpi">Carbs <strong>${today.carbs}g</strong></span><span class="kpi">Fat <strong>${today.fat}g</strong></span></div><div style="margin-top:15px"><div class="tiny">Goal progress</div><div class="progress-track" style="margin-top:5px"><div class="progress-fill" style="width:${caloriePct}%"></div></div></div></div></div>
        <div class="card"><div class="card-title-row"><h3>Last 7 days</h3><span class="badge good">Live from your records</span></div><div class="chart-wrap"><canvas id="dashChart"></canvas></div></div>
      </div>
      <div class="grid grid-2">
        <div class="card"><div class="card-title-row"><h3>Weekly performance</h3><span class="tiny">Mon–Sun</span></div><div class="kpi-row"><span class="kpi">Workouts <strong>${weekWorkouts}</strong> / ${u.weeklyWorkoutTarget}</span><span class="kpi">Burned <strong>${weekBurned}</strong> kcal</span><span class="kpi">Streak <strong>${streak()}</strong> days</span></div><div style="margin-top:16px"><div class="tiny">Weekly workout target</div><div class="progress-track" style="margin-top:5px"><div class="progress-fill" style="width:${Math.min(100, Math.round((weekWorkouts / num(u.weeklyWorkoutTarget, 4)) * 100))}%"></div></div></div></div>
        <div class="card"><div class="card-title-row"><h3>Recent workouts</h3><button class="btn btn-sm" data-go-workouts>View all</button></div><div class="list">${recent.length ? recent.map(workoutItem).join('') : '<div class="empty">No workouts logged yet.</div>'}</div></div>
      </div>`;
    $('#content').onclick = e => {
      if (e.target.closest('[data-open-workout]')) workoutModal();
      if (e.target.closest('[data-open-food]')) nutritionModal();
      if (e.target.closest('[data-open-history]')) { activeView = 'history'; route(); }
      if (e.target.closest('[data-go-workouts]')) { activeView = 'workouts'; route(); }
      handleRowActions(e);
    };
    drawLineChart($('#dashChart'), week, ['taken', 'burned']);
  }

  function stat(label, value, sub, tone) {
    return `<div class="card stat-card"><div class="label">${label}</div><div class="value ${tone}">${Number(value).toLocaleString()}</div><div class="sub">${sub}</div></div>`;
  }

  function workoutItem(w) {
    return `<div class="list-item"><div><div class="title">${typeIcon(w.type)} ${esc(w.type)} ${w.demo ? '<span class="badge demo">sample</span>' : ''}</div><div class="meta">${formatDate(w.date)} · ${w.duration} min · ${w.calories} kcal${w.distance ? ` · ${w.distance} km` : ''}</div></div><div class="actions"><button class="btn btn-sm" data-edit-workout="${w.id}">Edit</button><button class="btn btn-sm btn-danger" data-delete-workout="${w.id}">Delete</button></div></div>`;
  }

  function typeIcon(type) { return ({ Run:'🏃', Strength:'🏋️', Cycle:'🚴', HIIT:'⚡', Yoga:'🧘', Swim:'🏊' }[type] || '🏋️'); }

  function renderWorkouts() {
    commonTop('Workouts');
    let query = '';
    let type = '';
    const paint = () => {
      const rows = getUserRecords('workouts').sort((a, b) => b.date - a.date).filter(w => (!type || w.type === type) && (!query || `${w.type} ${w.notes}`.toLowerCase().includes(query.toLowerCase())));
      $('#content').innerHTML = `
        <div class="section-head"><div><h2>Workout log</h2><p>Calories are calculated from workout type, duration, effort and your saved body weight when you leave calories blank.</p></div><button class="btn btn-primary" data-add-workout>+ Log workout</button></div>
        <div class="filters"><input id="wSearch" placeholder="Search workouts…" value="${esc(query)}"><select id="wType"><option value="">All types</option>${WORKOUT_TYPES.map(t => `<option ${type===t?'selected':''}>${t}</option>`).join('')}</select><div></div><div></div><button class="btn" data-add-workout>+ Workout</button></div>
        <div class="card"><div class="list">${rows.length ? rows.map(workoutItem).join('') : '<div class="empty">No matching workouts.</div>'}</div></div>`;
      $('#wSearch').oninput = e => { query = e.target.value; paint(); };
      $('#wType').onchange = e => { type = e.target.value; paint(); };
      $$('.content [data-add-workout]').forEach(b => b.onclick = workoutModal);
      $('#content').onclick = handleRowActions;
    };
    paint();
  }

  function workoutModal(existing = null) {
    const w = existing || { type:'Run', date: todayTs(), duration:30, distance:'', intensity:3, calories:'', notes:'' };
    openModal(existing ? 'Edit workout' : 'Log a workout', `
      <div class="field-row"><div class="field"><label>Workout type</label><select id="fType">${WORKOUT_TYPES.map(t => `<option ${w.type===t?'selected':''}>${t}</option>`).join('')}</select></div><div class="field"><label>Date</label><input id="fDate" type="date" value="${localDateInput(w.date)}"></div></div>
      <div class="field-row"><div class="field"><label>Duration (minutes)</label><input id="fDuration" type="number" min="1" max="600" value="${w.duration}"></div><div class="field"><label>Distance (km, optional)</label><input id="fDistance" type="number" min="0" step="0.1" value="${w.distance ?? ''}"></div></div>
      <div class="field-row"><div class="field"><label>Effort (1–5)</label><input id="fIntensity" type="range" min="1" max="5" value="${w.intensity || 3}"><div class="tiny">1 = easy · 5 = hard</div></div><div class="field"><label>Calories burned (optional)</label><input id="fCalories" type="number" min="1" placeholder="Auto-calculate" value="${w.calories || ''}"></div></div>
      <div class="field"><label>Notes</label><textarea id="fNotes" placeholder="How did the session feel?">${esc(w.notes || '')}</textarea></div>
      <div class="auth-note">Leave calories blank and PULSE calculates an estimate using a standard MET-based formula and your saved weight. It is an estimate, not a medical-grade measurement.</div>
      <button class="btn btn-primary" id="saveWorkout" style="width:100%;justify-content:center">${existing ? 'Save changes' : 'Log workout'}</button>
    `, modal => {
      $('#saveWorkout', modal).onclick = () => {
        const type = $('#fType', modal).value;
        const duration = num($('#fDuration', modal).value);
        if (!duration || duration < 1 || duration > 600) return notify('Duration must be 1–600 minutes.', false);
        const date = dateFromInput($('#fDate', modal).value);
        const manual = num($('#fCalories', modal).value);
        const calories = manual > 0 ? Math.round(manual) : estimateCalories(type, duration, $('#fIntensity', modal).value, userWeight());
        const record = { id: existing?.id || uid(), userId: session, type, date, duration, distance: num($('#fDistance', modal).value, 0) || null, intensity: num($('#fIntensity', modal).value, 3), calories, notes: $('#fNotes', modal).value.trim(), demo: existing?.demo || false };
        if (existing) Object.assign(db.workouts.find(x => x.id === existing.id), record);
        else db.workouts.push(record);
        saveDB();
        closeModal(); route(); notify(existing ? 'Workout updated.' : `Workout saved — ${calories} kcal burned.`);
      };
    });
  }

  function nutritionItem(n) {
    return `<div class="list-item"><div><div class="title">🍽️ ${esc(n.food)} <span class="badge type">${esc(n.meal)}</span> ${n.demo ? '<span class="badge demo">sample</span>' : ''}</div><div class="meta">${formatDate(n.date)} · ${n.calories} kcal · P ${n.protein}g · C ${n.carbs}g · F ${n.fat}g</div></div><div class="actions"><button class="btn btn-sm btn-danger" data-delete-food="${n.id}">Delete</button></div></div>`;
  }

  function renderNutrition() {
    commonTop('Nutrition');
    let selected = dayKey(Date.now());
    const paint = () => {
      const d = aggregateDay(selected);
      const rows = d.nutrition.sort((a,b)=>b.date-a.date);
      const target = num(currentUser().calorieTarget, 2200);
      $('#content').innerHTML = `
        <div class="section-head"><div><h2>Daily nutrition</h2><p>Only food records you enter are counted as calories taken.</p></div><button class="btn btn-primary" data-add-food>+ Log food</button></div>
        <div class="card" style="margin-bottom:18px"><div class="field-row"><div class="field"><label>Select day</label><input id="nutritionDay" type="date" value="${selected}"></div><div class="field"><label>Daily calorie target</label><input value="${target}" disabled></div></div></div>
        <div class="grid grid-4" style="margin-bottom:18px">${stat('🍽️ Calories taken', d.taken, `of ${target} kcal goal`, 'lime')}${stat('🥩 Protein', d.protein, 'grams', 'sky')}${stat('🍚 Carbs', d.carbs, 'grams', 'amber')}${stat('🥑 Fat', d.fat, 'grams', 'coral')}</div>
        <div class="card"><div class="card-title-row"><h3>Food entries</h3><span class="tiny">${rows.length} entries</span></div><div class="list">${rows.length ? rows.map(nutritionItem).join('') : '<div class="empty">No food logged for this day.</div>'}</div></div>`;
      $('#nutritionDay').onchange = e => { selected = e.target.value; paint(); };
      $('#content').onclick = e => { if (e.target.closest('[data-add-food]')) nutritionModal(); if (e.target.closest('[data-delete-food]')) { db.nutrition = db.nutrition.filter(n => n.id !== Number(e.target.closest('[data-delete-food]').dataset.deleteFood)); saveDB(); paint(); notify('Food entry deleted.'); } };
    };
    paint();
  }

  function nutritionModal() {
    openModal('Log food', `
      <div class="field-row"><div class="field"><label>Food name</label><input id="nFood" placeholder="e.g. Chicken rice bowl"></div><div class="field"><label>Meal</label><select id="nMeal">${MEALS.map(m=>`<option>${m}</option>`).join('')}</select></div></div>
      <div class="field"><label>Date</label><input id="nDate" type="date" value="${localDateInput()}"></div>
      <div class="field-row"><div class="field"><label>Calories (kcal)</label><input id="nCal" type="number" min="0"></div><div class="field"><label>Protein (g)</label><input id="nProtein" type="number" min="0" value="0"></div></div>
      <div class="field-row"><div class="field"><label>Carbs (g)</label><input id="nCarbs" type="number" min="0" value="0"></div><div class="field"><label>Fat (g)</label><input id="nFat" type="number" min="0" value="0"></div></div>
      <button class="btn btn-primary" id="saveFood" style="width:100%;justify-content:center">Save food</button>
    `, modal => {
      $('#saveFood', modal).onclick = () => {
        const food = $('#nFood', modal).value.trim();
        const calories = num($('#nCal', modal).value);
        if (!food || calories < 0) return notify('Enter food name and calories.', false);
        db.nutrition.push({ id: uid(), userId: session, food, meal: $('#nMeal', modal).value, date: dateFromInput($('#nDate', modal).value), calories: Math.round(calories), protein: num($('#nProtein', modal).value), carbs: num($('#nCarbs', modal).value), fat: num($('#nFat', modal).value), demo: false });
        saveDB(); closeModal(); route(); notify('Food saved to your daily analysis.');
      };
    });
  }

  function renderHistory() {
    commonTop('History', 'Choose any month — previous days stay stored in this browser.');
    const month = selectedHistoryMonth;
    const days = monthlyRecords(month);
    const weeks = monthlyWeeks(month);
    const monthWorkouts = days.reduce((s,d)=>s+d.workoutCount,0);
    const burned = days.reduce((s,d)=>s+d.burned,0);
    const taken = days.reduce((s,d)=>s+d.taken,0);
    const minutes = days.reduce((s,d)=>s+d.workoutMinutes,0);
    const nonEmpty = days.filter(d => d.workoutCount || d.taken);
    $('#content').innerHTML = `
      <div class="card" style="margin-bottom:18px"><div class="month-switch"><div style="flex:1"><h2>Fitness history</h2><p class="muted" style="font-size:11px;margin-top:4px">Daily + Monday–Sunday weekly breakdown for ${monthLabel(month)}.</p></div><input id="historyMonth" type="month" value="${month}"></div></div>
      <div class="grid grid-4" style="margin-bottom:18px">${stat('🏋️ Workouts',monthWorkouts,'in selected month','sky')}${stat('🔥 Burned',burned,'workout kcal','coral')}${stat('🍽️ Taken',taken,'food kcal','lime')}${stat('⏱️ Minutes',minutes,'workout minutes','amber')}</div>
      <div class="grid grid-2" style="margin-bottom:18px"><div class="card"><div class="card-title-row"><h3>Weekly Monday–Sunday</h3><span class="tiny">${weeks.length} weeks</span></div><div class="list">${weeks.map((w,i)=>`<div class="list-item"><div><strong>Week ${i+1}</strong><div class="meta">${formatDate(dateFromInput(w.start))} – ${formatDate(dateFromInput(w.end))}</div></div><div style="text-align:right;font-size:11px"><div>🏋️ ${w.workouts}</div><div>🔥 ${w.burned} kcal</div><div>🍽️ ${w.taken} kcal</div></div></div>`).join('')}</div></div><div class="card"><div class="card-title-row"><h3>Monthly calorie trend</h3><span class="tiny">Taken vs burned</span></div><div class="chart-wrap"><canvas id="historyChart"></canvas></div></div></div>
      <div class="card"><div class="card-title-row"><h3>Daily records</h3><span class="tiny">${nonEmpty.length} days with activity</span></div><div class="table-wrap"><table class="data-table"><thead><tr><th>Date</th><th>Workouts</th><th>Burned</th><th>Taken</th><th>Minutes</th><th>Net</th></tr></thead><tbody>${days.map(d=>`<tr><td>${formatDate(dateFromInput(d.key),{weekday:'short',day:'2-digit',month:'short'})}</td><td>${d.workoutCount}</td><td>${d.burned} kcal</td><td>${d.taken} kcal</td><td>${d.workoutMinutes}</td><td>${d.taken-d.burned} kcal</td></tr>`).join('')}</tbody></table></div></div>`;
    $('#historyMonth').onchange = e => { selectedHistoryMonth = e.target.value; renderHistory(); };
    drawLineChart($('#historyChart'), days, ['taken','burned']);
  }

  function renderAnalytics() {
    commonTop('Analytics', 'Your last 30 days from saved workout + nutrition records.');
    const days = rangeDays(todayTs(),30).map(k=>({key:k,...aggregateDay(k)}));
    const taken = days.reduce((s,d)=>s+d.taken,0), burned = days.reduce((s,d)=>s+d.burned,0), workouts = days.reduce((s,d)=>s+d.workoutCount,0), mins = days.reduce((s,d)=>s+d.workoutMinutes,0);
    const bestWorkoutDay = [...days].sort((a,b)=>b.burned-a.burned)[0];
    $('#content').innerHTML = `
      <div class="grid grid-4" style="margin-bottom:18px">${stat('🍽️ 30d intake',taken,'kcal eaten','lime')}${stat('🔥 30d burn',burned,'workout kcal','coral')}${stat('🏋️ Sessions',workouts,'workouts','sky')}${stat('⏱️ Duration',mins,'minutes','amber')}</div>
      <div class="grid grid-2" style="margin-bottom:18px"><div class="card"><div class="card-title-row"><h3>Daily calories — 30 days</h3><span class="badge good">Calculated from saved data</span></div><div class="chart-wrap"><canvas id="analyticsChart"></canvas></div></div><div class="card"><div class="card-title-row"><h3>Workout consistency</h3><span class="tiny">Sessions per day</span></div><div class="bar-list">${days.slice(-14).map(d=>`<div class="bar-row"><span>${formatDay(dateFromInput(d.key))}</span><div class="bar-track"><div class="bar" style="width:${Math.min(100,d.workoutCount*50)}%"></div></div><strong>${d.workoutCount}</strong></div>`).join('')}</div></div></div>
      <div class="card"><h3>Interpretation</h3><div class="coach-msg"><span class="dot">●</span><div><strong>Highest workout burn:</strong> ${bestWorkoutDay.burned} kcal on ${formatDate(dateFromInput(bestWorkoutDay.key))}. Your burn values come from the workouts you logged, not a phone sensor.</div></div><div class="coach-msg good"><span class="dot">●</span><div><strong>Data quality:</strong> ${days.filter(d=>d.taken||d.burned||d.workoutCount).length} of the last 30 days have records.</div></div></div>`;
    drawLineChart($('#analyticsChart'), days, ['taken','burned']);
  }

  function renderGoals() {
    commonTop('Goals');
    const goals = getUserRecords('goals');
    const week = lastDays(7);
    $('#content').innerHTML = `<div class="section-head"><div><h2>Goals</h2><p>Simple measurable targets linked to your saved records.</p></div><button class="btn btn-primary" data-add-goal>+ Goal</button></div><div class="grid grid-2">${goals.length ? goals.map(g=>{const current=g.type==='workouts'?week.reduce((s,d)=>s+d.workoutCount,0):g.type==='calories'?week.reduce((s,d)=>s+d.burned,0):week.reduce((s,d)=>s+d.taken,0);const pct=Math.min(100,Math.round((current/num(g.target,1))*100));return `<div class="card"><div class="card-title-row"><h3>${esc(g.title)}</h3><button class="btn btn-sm btn-danger" data-delete-goal="${g.id}">Delete</button></div><div class="stat-card" style="padding:0;background:none;border:0"><div class="value lime">${current} / ${g.target}</div><div class="sub">${g.unit} this week</div></div><div class="progress-track" style="margin-top:13px"><div class="progress-fill" style="width:${pct}%"></div></div></div>`}).join('') : '<div class="card"><div class="empty">No goals yet.</div></div>'}</div>`;
    $('#content').onclick = e => { if(e.target.closest('[data-add-goal]')) goalModal(); const del=e.target.closest('[data-delete-goal]'); if(del){db.goals=db.goals.filter(g=>g.id!==Number(del.dataset.deleteGoal));saveDB();renderGoals();notify('Goal deleted.')}};
  }

  function goalModal() {
    openModal('Create goal', `<div class="field"><label>Title</label><input id="gTitle" placeholder="e.g. 4 workouts per week"></div><div class="field"><label>Goal type</label><select id="gType"><option value="workouts">Workouts per week</option><option value="calories">Calories burned per week</option><option value="taken">Calories taken per week</option></select></div><div class="field-row"><div class="field"><label>Target value</label><input id="gTarget" type="number" min="1" value="4"></div><div class="field"><label>Unit</label><input id="gUnit" value="workouts"></div></div><button class="btn btn-primary" id="saveGoal" style="width:100%;justify-content:center">Create goal</button>`, modal=>{$('#gType',modal).onchange=e=>{$('#gUnit',modal).value=e.target.value==='workouts'?'workouts':'kcal'};$('#saveGoal',modal).onclick=()=>{const title=$('#gTitle',modal).value.trim();const target=num($('#gTarget',modal).value);if(!title||!target)return notify('Enter a title and target.',false);db.goals.push({id:uid(),userId:session,title,type:$('#gType',modal).value,target,unit:$('#gUnit',modal).value});saveDB();closeModal();renderGoals();notify('Goal created.')}});
  }


  function renderExercises() {
    commonTop('Exercises', 'Simple exercise library for your workout sessions.');
    const library = [
      ['Push Ups','Chest / Triceps','Bodyweight'],['Squats','Legs','Strength'],['Lunges','Legs','Bodyweight'],
      ['Plank','Core','Bodyweight'],['Bench Press','Chest','Strength'],['Lat Pulldown','Back','Strength'],
      ['Shoulder Press','Shoulders','Strength'],['Bicep Curl','Biceps','Strength'],['Tricep Extension','Triceps','Strength'],['Jumping Jacks','Full body','Cardio']
    ];
    $('#content').innerHTML = `<div class="section-head"><div><h2>Exercise library</h2><p>Useful references while logging a workout.</p></div></div><div class="grid grid-3">${library.map(x=>`<div class="card"><div class="card-title-row"><h3>${x[0]}</h3><span class="badge type">${x[2]}</span></div><div class="muted" style="font-size:11px">${x[1]}</div></div>`).join('')}</div>`;
  }

  function renderProgress() {
    commonTop('Progress', 'Weight history and training trend.');
    const weights = getUserRecords('weights').sort((a,b)=>a.date-b.date);
    const all = getUserRecords('workouts');
    const first = weights[0]?.weight || userWeight();
    const latest = weights[weights.length-1]?.weight || userWeight();
    const change = latest-first;
    $('#content').innerHTML = `<div class="grid grid-3" style="margin-bottom:18px">${stat('⚖️ Current weight',latest,'kg','lime')}${stat('↕️ Change',change,change===0?'from first log':'kg from first log',change<=0?'sky':'coral')}${stat('🏋️ Total workouts',all.length,'all saved records','amber')}</div><div class="grid grid-2"><div class="card"><div class="card-title-row"><h3>Weight timeline</h3><span class="tiny">${weights.length} entries</span></div><div class="chart-wrap"><canvas id="weightChart"></canvas></div></div><div class="card"><h3>Weight logs</h3><div class="list">${weights.length?weights.slice().reverse().slice(0,12).map(w=>`<div class="list-item"><div><strong>${formatDate(w.date)}</strong><div class="meta">${w.demo?'Sample':'Personal'} log</div></div><strong>${w.weight} kg</strong></div>`).join(''):'<div class="empty">No weight data yet.</div>'}</div></div></div>`;
    const chartRows=weights.length?weights.map(w=>({key:dayKey(w.date),value:w.weight})):[{key:dayKey(Date.now()),value:userWeight()}];
    drawSingleChart($('#weightChart'),chartRows,'value');
  }

  function renderActivity() {
    commonTop('Activity', 'Latest changes across workouts, nutrition and profile data.');
    const events=[];
    getUserRecords('workouts').forEach(w=>events.push({date:w.date,icon:'🏋️',title:`${w.type} workout`,meta:`${w.duration} min · ${w.calories} kcal burned`}));
    getUserRecords('nutrition').forEach(n=>events.push({date:n.date,icon:'🍽️',title:`${n.food}`,meta:`${n.meal} · ${n.calories} kcal taken`}));
    getUserRecords('weights').forEach(w=>events.push({date:w.date,icon:'⚖️',title:'Weight updated',meta:`${w.weight} kg`}));
    events.sort((a,b)=>b.date-a.date);
    $('#content').innerHTML=`<div class="card"><div class="list">${events.slice(0,30).map(e=>`<div class="list-item"><div><div class="title">${e.icon} ${esc(e.title)}</div><div class="meta">${formatDate(e.date)} · ${e.meta}</div></div></div>`).join('')||'<div class="empty">No activity yet.</div>'}</div></div>`;
  }

  function renderCoach() {
    commonTop('AI Coach', 'Local rule-based coaching from your saved data.');
    const d = aggregateDay(dayKey(Date.now()));
    const week = lastDays(7);
    const msgs = [];
    if (!d.workoutCount) msgs.push(['warn','●','No workout is logged today. A short planned session can keep your weekly routine moving.']); else msgs.push(['good','●',`Nice — ${d.workoutCount} workout${d.workoutCount>1?'s':''} logged today with ${d.burned} kcal burned.`]);
    if (d.taken === 0) msgs.push(['warn','●','No food has been logged today, so calorie intake is currently incomplete.']); else if (d.taken <= currentUser().calorieTarget) msgs.push(['good','●',`You have logged ${d.taken} of ${currentUser().calorieTarget} kcal today.`]); else msgs.push(['warn','●',`Your logged intake is ${d.taken-currentUser().calorieTarget} kcal above your daily target.`]);
    msgs.push(['good','●',`Weekly consistency: ${week.reduce((s,x)=>s+x.workoutCount,0)} workouts across the last 7 days; current streak is ${streak()} day(s).`]);
    $('#content').innerHTML = `<div class="card" style="margin-bottom:18px"><h2>PULSE Coach</h2><p class="muted" style="font-size:11px">This is an on-device rule-based coach in the 3-file version. It does not pretend to be a medical or clinical AI.</p></div><div class="card"><div class="list">${msgs.map(m=>`<div class="coach-msg ${m[0]}"><span class="dot">${m[1]}</span><div>${m[2]}</div></div>`).join('')}</div></div>`;
  }

  function renderProfile() {
    commonTop('Profile');
    const u = currentUser();
    const latest = userWeight();
    $('#content').innerHTML = `<div class="card" style="max-width:760px"><div class="card-title-row"><div><h2>Your profile</h2><p class="muted" style="font-size:11px">These values are used for calorie estimates and goals.</p></div><span class="badge good">Saved locally</span></div><div class="field-row"><div class="field"><label>Name</label><input id="pName" value="${esc(u.name)}"></div><div class="field"><label>Email</label><input value="${esc(u.email)}" disabled></div></div><div class="field-row"><div class="field"><label>Age</label><input id="pAge" type="number" value="${u.age}"></div><div class="field"><label>Weight (kg)</label><input id="pWeight" type="number" step="0.1" value="${latest}"></div></div><div class="field-row"><div class="field"><label>Daily calorie target</label><input id="pCal" type="number" value="${u.calorieTarget}"></div><div class="field"><label>Weekly workout target</label><input id="pWeek" type="number" value="${u.weeklyWorkoutTarget}"></div></div><button class="btn btn-primary" id="saveProfile">Save profile</button></div>`;
    $('#saveProfile').onclick=()=>{u.name=$('#pName').value.trim()||u.name;u.age=num($('#pAge').value,u.age);u.weight=num($('#pWeight').value,u.weight);u.calorieTarget=num($('#pCal').value,u.calorieTarget);u.weeklyWorkoutTarget=num($('#pWeek').value,u.weeklyWorkoutTarget);db.weights.push({id:uid(),userId:session,date:todayTs(),weight:u.weight,demo:false});saveDB();authUI();route();notify('Profile updated.');};
  }

  function renderSettings() {
    commonTop('Settings');
    const u=currentUser();
    $('#content').innerHTML=`<div class="grid grid-2"><div class="card"><h2>Data</h2><p class="muted" style="font-size:11px;margin-bottom:14px">Your history is stored in browser localStorage. Export it before changing device or browser.</p><div class="hero-actions"><button class="btn btn-primary" data-export>Export JSON</button><button class="btn" data-import>Import JSON</button><input id="importFile" type="file" accept="application/json" hidden></div></div><div class="card"><h2>Demo history</h2><p class="muted" style="font-size:11px;margin-bottom:14px">Sample August and September records are marked “sample” so you can demonstrate past months to your sir.</p><button class="btn btn-danger" data-remove-demo>Remove sample data</button></div><div class="card"><h2>Account</h2><div class="toggle-row"><div><strong>${esc(u.email)}</strong><div class="tiny">Local demo account</div></div><button class="btn btn-danger" data-logout>Log out</button></div></div><div class="card"><h2>Reset</h2><p class="muted" style="font-size:11px;margin-bottom:14px">Delete all PULSE data on this browser and return to the login screen.</p><button class="btn btn-danger" data-reset>Reset PULSE</button></div></div>`;
    $('#content').onclick=async e=>{
      if(e.target.closest('[data-export]')) exportData();
      if(e.target.closest('[data-import]')) $('#importFile').click();
      if(e.target.closest('[data-remove-demo]')){db.workouts=db.workouts.filter(x=>!(x.userId===session&&x.demo));db.nutrition=db.nutrition.filter(x=>!(x.userId===session&&x.demo));saveDB();renderSettings();notify('Sample history removed.');}
      if(e.target.closest('[data-logout]')){session=null;saveSession();authUI();}
      if(e.target.closest('[data-reset]') && confirm('Delete all PULSE data on this browser?')){localStorage.removeItem(STORE_KEY);localStorage.removeItem(SESSION_KEY);db=defaultDB();session=null;authUI();notify('PULSE was reset.');}
    };
    $('#importFile').onchange=importData;
  }

  function exportData() {
    const blob=new Blob([JSON.stringify(db,null,2)],{type:'application/json'});
    const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`pulse-backup-${localMonth()}.json`;a.click();URL.revokeObjectURL(a.href);notify('Backup exported.');
  }

  function importData(e) {
    const file=e.target.files?.[0];if(!file)return;const reader=new FileReader();reader.onload=()=>{try{const incoming=JSON.parse(reader.result);if(!incoming||incoming.version!==3||!Array.isArray(incoming.users))throw new Error('Invalid PULSE backup');db=incoming;saveDB();session=db.users[0]?.id||null;saveSession();authUI();route();notify('Backup imported.');}catch(err){notify(err.message,false);}};reader.readAsText(file);
  }

  function handleRowActions(e) {
    const edit=e.target.closest('[data-edit-workout]');
    const del=e.target.closest('[data-delete-workout]');
    if(edit){const item=db.workouts.find(w=>w.id===Number(edit.dataset.editWorkout));if(item)workoutModal(item);}
    if(del){const id=Number(del.dataset.deleteWorkout);const item=db.workouts.find(w=>w.id===id);if(!item)return;if(confirm('Delete this workout?')){db.workouts=db.workouts.filter(w=>w.id!==id);saveDB();route();notify('Workout deleted.');}}
  }

  function drawLineChart(canvas, rows, keys) {
    if (!canvas) return;
    const dpr=window.devicePixelRatio||1;
    const rect=canvas.getBoundingClientRect();
    const width=Math.max(300,rect.width||600), height=Math.max(190,rect.height||250);
    canvas.width=width*dpr;canvas.height=height*dpr;const c=canvas.getContext('2d');c.scale(dpr,dpr);c.clearRect(0,0,width,height);
    const pad={l:34,r:14,t:18,b:30};const innerW=width-pad.l-pad.r, innerH=height-pad.t-pad.b;
    const values=rows.flatMap(r=>keys.map(k=>num(r[k])));const max=Math.max(100,...values);const min=0;
    c.strokeStyle='rgba(255,255,255,.07)';c.lineWidth=1;
    for(let i=0;i<5;i++){const y=pad.t+(innerH*i/4);c.beginPath();c.moveTo(pad.l,y);c.lineTo(width-pad.r,y);c.stroke();c.fillStyle='#5C665E';c.font='10px system-ui';c.fillText(Math.round(max-(max*i/4)),3,y+3)}
    const labelEvery=Math.max(1,Math.ceil(rows.length/7));
    rows.forEach((r,i)=>{if(i%labelEvery===0||i===rows.length-1){const x=pad.l+(rows.length===1?0:i/(rows.length-1))*innerW;c.fillStyle='#5C665E';c.font='10px system-ui';c.fillText(shortChartLabel(r.key),x-12,height-9)}});
    const shades=['#C6FF3D','#5BC8FF'];
    keys.forEach((key,si)=>{c.strokeStyle=shades[si%shades.length];c.lineWidth=2.2;c.beginPath();rows.forEach((r,i)=>{const x=pad.l+(rows.length===1?0:i/(rows.length-1))*innerW;const y=pad.t+(1-(num(r[key])-min)/(max-min||1))*innerH;if(i===0)c.moveTo(x,y);else c.lineTo(x,y)});c.stroke();rows.forEach((r,i)=>{if(i===rows.length-1||i%Math.max(1,Math.ceil(rows.length/10))===0){const x=pad.l+(rows.length===1?0:i/(rows.length-1))*innerW;const y=pad.t+(1-(num(r[key])-min)/(max-min||1))*innerH;c.fillStyle=shades[si%shades.length];c.beginPath();c.arc(x,y,3,0,Math.PI*2);c.fill();}})});
    c.fillStyle='#8A968D';c.font='10px system-ui';c.fillText('taken',width-84,17);c.fillStyle='#C6FF3D';c.fillRect(width-110,13,10,3);c.fillStyle='#8A968D';c.fillText('burned',width-40,17);c.fillStyle='#5BC8FF';c.fillRect(width-62,13,10,3);
  }

  function shortChartLabel(key){
    if(!key)return '';
    const parts=key.split('-');
    if(parts.length!==3)return key;
    return `${Number(parts[2])}/${Number(parts[1])}`;
  }

  // Keep charts responsive.
  window.addEventListener('resize',()=>{clearTimeout(window.__pulseResize);window.__pulseResize=setTimeout(()=>route(),180)});
  window.addEventListener('hashchange',()=>route());
  $('#menuToggle').addEventListener('click',()=>$('#sidebar').classList.toggle('open'));

  // Clean-up legacy/local data if the browser is reusing a prior PULSE page.
  if (!Array.isArray(db.users)) db = defaultDB();

  authUI();
  if (session && currentUser()) route();
})();
