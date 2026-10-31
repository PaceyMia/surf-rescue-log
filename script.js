/* ── Surf Patrol Log – script.js ── */

// ── Element references ──────────────────────────────────────────────
const dictateBtn    = document.getElementById('dictate-btn');
const markBtn       = document.getElementById('mark-btn');
const statusMsg     = document.getElementById('status-msg');
const logEntries    = document.getElementById('log-entries');
const reportBtn     = document.getElementById('report-btn');
const newPatrolBtn  = document.getElementById('new-patrol-btn');
const currentTime   = document.getElementById('current-time');
const liveBox       = document.getElementById('live-box');
const liveText      = document.getElementById('live-text');
const liveTimer     = document.getElementById('live-timer');
const startScreen   = document.getElementById('start-screen');
const startBtn      = document.getElementById('start-btn');
const startCancel   = document.getElementById('start-cancel');
const startError    = document.getElementById('start-error');
const dutyOther     = document.getElementById('duty-other');
const patrolDate    = document.getElementById('patrol-date');
const skipperInput  = document.getElementById('crew-skipper');
const driverInput   = document.getElementById('crew-driver');
const crewExtras    = document.getElementById('crew-extras');
const addCrewBtn    = document.getElementById('add-crew-btn');
const loggedOffMsg  = document.getElementById('logged-off');
const crewNameList  = document.getElementById('crew-names');
const shiftSummary  = document.getElementById('shift-summary');
const appEl         = document.getElementById('app');
const tabButtons    = [...document.querySelectorAll('#tabs [role="tab"]')];
const editDialog    = document.getElementById('edit-dialog');
const editText      = document.getElementById('edit-text');

const STORAGE_KEY = 'surfPatrolLogs';
const SHIFT_KEY   = 'surfPatrolShift';
const NAMES_KEY   = 'surfPatrolCrewNames';
const DRAFT_KEY   = 'surfPatrolDraft';
const EMPTY_MSG   = '<p id="empty-msg">No entries yet. Tap Log Entry to start recording.</p>';

// Storage can throw in private mode or when full; the in-memory log still works
function storeSet(key, value) {
  try { localStorage.setItem(key, value); } catch { statusMsg.textContent = '⚠️ Could not save to this device — export the report before closing.'; }
}
function storeGet(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function storeRemove(key) {
  try { localStorage.removeItem(key); } catch { /* nothing to do */ }
}

// ── Live clock ──────────────────────────────────────────────────────
function updateClock() {
  currentTime.textContent = new Date().toLocaleTimeString('en-AU', {
    weekday: 'short', year: 'numeric', month: 'short',
    day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
  });
}
updateClock();
setInterval(updateClock, 1000);

// ── Tabs ────────────────────────────────────────────────────────────
const TAB_KEY = 'surfPatrolTab';

function showTab(name) {
  storeSet(TAB_KEY, name);
  // Start the new tab at its top, with the header scrolled away if it already was
  const headerH = document.querySelector('header').offsetHeight;
  if (window.scrollY > headerH) window.scrollTo(0, headerH);
  tabButtons.forEach(btn => {
    const active = btn.dataset.tab === name;
    btn.setAttribute('aria-selected', String(active));
    document.getElementById(`panel-${btn.dataset.tab}`).hidden = !active;
  });
  document.dispatchEvent(new CustomEvent('tabshown', { detail: name }));
}
tabButtons.forEach(btn => btn.addEventListener('click', () => showTab(btn.dataset.tab)));

// ── Log store ───────────────────────────────────────────────────────
// Timestamps are stored as ISO strings in localStorage, converted back to
// Date objects when loaded. pos = { lat, lon, acc } when GPS was available.
const logs = []; // [{ timestamp: Date, text: string, pos?: object }]
const cardFor = new WeakMap();

// ── Text formatting ─────────────────────────────────────────────────
function formatText(raw) {
  const t = correctTranscript(raw.trim());
  if (!t) return t;
  // Capitalise first letter
  const capped = t.charAt(0).toUpperCase() + t.slice(1);
  // Append a full stop if not already ending in sentence punctuation
  return /[.!?]$/.test(capped) ? capped : capped + '.';
}

function saveLogs() {
  const serialised = logs.map(e => ({
    timestamp: e.timestamp.toISOString(),
    text: e.text,
    ...(e.pos ? { pos: e.pos } : {})
  }));
  storeSet(STORAGE_KEY, JSON.stringify(serialised));
}

function positionLine(pos) {
  const where = describeFromLandmark(pos.lat, pos.lon);
  return `${formatDDM(pos.lat, pos.lon)}${where ? ' · ' + where : ''}`;
}

function fillCard(card, entry) {
  card.replaceChildren();
  const tsSpan = document.createElement('span');
  tsSpan.className = 'timestamp';
  tsSpan.textContent = formatTimestamp(entry.timestamp);

  const textSpan = document.createElement('span');
  textSpan.className = 'text';
  textSpan.textContent = entry.text;
  card.append(tsSpan, textSpan);

  if (entry.pos) {
    const posSpan = document.createElement('span');
    posSpan.className = 'pos';
    posSpan.textContent = '📍 ' + positionLine(entry.pos);
    card.append(posSpan);
  }
}

function renderEntry(entry) {
  // Remove the placeholder if it still exists
  const placeholder = document.getElementById('empty-msg');
  if (placeholder) placeholder.remove();

  const card = document.createElement('div');
  card.className = 'log-entry';
  card.tabIndex = 0;
  card.setAttribute('role', 'button');
  card.setAttribute('aria-label', 'Log entry — tap to edit');
  fillCard(card, entry);
  logEntries.appendChild(card);
  cardFor.set(entry, card);

  addSwipeToDelete(card, entry);
  card.addEventListener('click', () => {
    if (card.dataset.swiped) { delete card.dataset.swiped; return; }
    openEditor(entry);
  });
  card.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openEditor(entry); }
  });
  return card;
}

function addLogEntry(text, { timestamp = new Date(), pos = null, raw = false } = {}) {
  if (!text.trim()) return null;

  const entry = { timestamp, text: raw ? text.trim() : formatText(text) };
  if (pos) entry.pos = pos;
  logs.push(entry);
  logs.sort((a, b) => a.timestamp - b.timestamp);
  saveLogs();

  // Keep the on-screen order in step with timestamps
  const card = renderEntry(entry);
  const next = logs[logs.indexOf(entry) + 1];
  if (next && cardFor.get(next)) logEntries.insertBefore(card, cardFor.get(next));
  card.scrollIntoView({ behavior: 'smooth', block: 'end' });
  return entry;
}

function updateEntry(entry) {
  saveLogs();
  const card = cardFor.get(entry);
  if (card) fillCard(card, entry);
}

function removeEntry(entry) {
  const idx = logs.indexOf(entry);
  if (idx !== -1) logs.splice(idx, 1);
  saveLogs();
  cardFor.get(entry)?.remove();
  if (logs.length === 0) logEntries.innerHTML = EMPTY_MSG;
}

// ── Edit / delete dialog (tap an entry) ─────────────────────────────
let editing = null;

function openEditor(entry) {
  editing = entry;
  editText.value = entry.text;
  editDialog.showModal();
  editText.focus();
}

editDialog.addEventListener('close', () => {
  const entry = editing;
  editing = null;
  if (!entry) return;
  if (editDialog.returnValue === 'save') {
    const text = editText.value.trim();
    if (text && text !== entry.text) {
      entry.text = text;
      updateEntry(entry);
      statusMsg.textContent = '✅ Entry updated.';
    }
  } else if (editDialog.returnValue === 'delete') {
    if (confirm('Are you sure you want to delete this entry?')) {
      removeEntry(entry);
      statusMsg.textContent = 'Entry deleted.';
    }
  }
});

// ── Swipe-to-delete ─────────────────────────────────────────────────
function addSwipeToDelete(card, entry) {
  let startX   = 0;
  let startY   = 0;
  let currentX = 0;
  let tracking = false; // true once we've committed to a horizontal swipe

  card.addEventListener('touchstart', (e) => {
    startX   = e.touches[0].clientX;
    startY   = e.touches[0].clientY;
    currentX = 0;
    tracking = false;
    card.style.transition = 'none';
  }, { passive: true });

  card.addEventListener('touchmove', (e) => {
    const dx = e.touches[0].clientX - startX;
    const dy = e.touches[0].clientY - startY;

    // Commit to horizontal-swipe mode only if horiz movement dominates
    if (!tracking) {
      if (Math.abs(dx) < 10 || Math.abs(dx) < Math.abs(dy)) return; // tap or vertical scroll — ignore
      tracking = true;
      card.dataset.swiped = '1'; // suppress the click that follows a swipe
    }

    currentX = dx;
    const opacity = Math.max(0.35, 1 - Math.abs(dx) / 220);
    card.style.transform = `translateX(${dx}px)`;
    card.style.opacity   = opacity;
  }, { passive: true });

  card.addEventListener('touchend', () => {
    if (!tracking) return;
    // The click (if any) fires right after touchend; clear the flag after it
    setTimeout(() => { delete card.dataset.swiped; }, 400);

    const THRESHOLD = 80; // px needed to trigger the delete prompt
    const snapBack = () => {
      card.style.transition = 'transform 0.3s ease, opacity 0.3s ease';
      card.style.transform  = 'translateX(0)';
      card.style.opacity    = '1';
    };

    if (Math.abs(currentX) >= THRESHOLD) {
      const confirmed = confirm('Are you sure you want to delete this entry?');

      if (confirmed) {
        // Slide fully off-screen then remove from DOM + storage
        const direction = currentX > 0 ? '110%' : '-110%';
        card.style.transition = 'transform 0.22s ease, opacity 0.22s ease';
        card.style.transform  = `translateX(${direction})`;
        card.style.opacity    = '0';
        setTimeout(() => removeEntry(entry), 230);
      } else {
        snapBack();
      }
    } else {
      snapBack();
    }
  });
}

function loadLogsFromStorage() {
  const raw = storeGet(STORAGE_KEY);
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw);
    parsed.forEach(item => {
      const entry = { timestamp: new Date(item.timestamp), text: item.text };
      if (item.pos) entry.pos = item.pos;
      logs.push(entry);
      renderEntry(entry);
    });
  } catch {
    // Corrupted data — start fresh
    storeRemove(STORAGE_KEY);
  }
}

function formatTimestamp(date) {
  return date.toLocaleTimeString('en-AU', {
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
  }) + '  –  ' + date.toLocaleDateString('en-AU', {
    weekday: 'short', year: 'numeric', month: 'short', day: 'numeric'
  });
}

// ── Shift: duty, date and crew ──────────────────────────────────────
// Stored as { duty, dutyOther, date: 'YYYY-MM-DD', skipper, driver, crew: [],
// loggedOff: [{ name, role, at }] }. Times on/off are filled in afterwards.
let shift = null;

// Local calendar date as YYYY-MM-DD. toISOString() is UTC, which in Sydney
// gives yesterday's date for any patrol starting before 10–11am.
function localDateValue(d = new Date()) {
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function parseDateValue(value) {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function dutyLabel(s) {
  return s.duty === 'Other' ? `Other – ${s.dutyOther}` : s.duty;
}

function shortTime(iso) {
  return new Date(iso).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function loadShift() {
  try {
    shift = JSON.parse(storeGet(SHIFT_KEY));
    if (shift && !shift.loggedOff) shift.loggedOff = [];
  } catch {
    shift = null;
  }
}

function saveShift() {
  storeSet(SHIFT_KEY, JSON.stringify(shift));
}

// Remember names used before so the crew list autocompletes next patrol
function loadCrewNames() {
  try {
    return JSON.parse(storeGet(NAMES_KEY)) || [];
  } catch {
    return [];
  }
}

function rememberCrewNames(names) {
  const seen = new Set(names.map(n => n.toLowerCase()));
  const merged = [...names, ...loadCrewNames().filter(n => !seen.has(n.toLowerCase()))];
  storeSet(NAMES_KEY, JSON.stringify(merged.slice(0, 60)));
}

function fillCrewNameList() {
  crewNameList.replaceChildren(...loadCrewNames().map(name => {
    const opt = document.createElement('option');
    opt.value = name;
    return opt;
  }));
}

function crewInputs() {
  return [...crewExtras.querySelectorAll('.crew-extra')];
}

function addCrewRow(value = '', focus = false) {
  const editingShift = Boolean(shift);
  const row = document.createElement('div');
  row.className = 'crew-row';

  const badge = document.createElement('span');
  badge.className = 'award award-c';
  badge.setAttribute('aria-hidden', 'true');
  badge.textContent = 'C';

  const input = document.createElement('input');
  Object.assign(input, { type: 'text', className: 'crew-extra', placeholder: 'Crew (optional)', value, autocomplete: 'off' });
  input.setAttribute('list', 'crew-names');
  input.setAttribute('autocapitalize', 'words');
  input.setAttribute('enterkeyhint', 'next');
  input.setAttribute('aria-label', 'Crew');

  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'row-remove';
  // Mid-patrol this records the person leaving; before the patrol it just clears the row
  remove.textContent = editingShift && value ? 'Log off' : '✕';
  remove.setAttribute('aria-label', editingShift && value ? `Log off ${value}` : 'Remove crew row');
  remove.addEventListener('click', () => {
    row.remove();
    if (!crewInputs().length && !editingShift) addCrewRow();
  });

  row.append(badge, input, remove);
  crewExtras.appendChild(row);
  if (focus) input.focus();
}

addCrewBtn.addEventListener('click', () => addCrewRow('', true));

function selectedDuty() {
  return startScreen.querySelector('input[name="duty"]:checked').value;
}

function syncDutyOther() {
  const isOther = selectedDuty() === 'Other';
  dutyOther.hidden = !isOther;
  if (isOther && !dutyOther.value) dutyOther.focus();
}

function fillStartForm(s) {
  startScreen.querySelector(`input[name="duty"][value="${s ? s.duty : 'Patrol'}"]`).checked = true;
  dutyOther.value    = s ? s.dutyOther : '';
  patrolDate.value   = s ? s.date : localDateValue();
  skipperInput.value = s ? s.skipper : '';
  driverInput.value  = s ? s.driver : '';
  crewExtras.replaceChildren();
  if (s) s.crew.forEach(name => addCrewRow(name));
  else for (let i = 0; i < 3; i++) addCrewRow();

  const off = s ? s.loggedOff : [];
  loggedOffMsg.hidden = !off.length;
  loggedOffMsg.textContent = off.length
    ? 'Logged off: ' + off.map(o => `${o.name} (${o.role}) ${shortTime(o.at)}`).join(' · ')
    : '';

  syncDutyOther();
  startScreen.querySelectorAll('[aria-invalid]').forEach(el => el.removeAttribute('aria-invalid'));
  startError.textContent = '';
}

function showStartScreen() {
  fillCrewNameList();
  fillStartForm(shift);
  startBtn.textContent = shift ? 'Save & Return to Log' : 'Start Patrol';
  startCancel.hidden = !shift;
  appEl.hidden = true;
  startScreen.hidden = false;
  window.scrollTo(0, 0);
}

function showLogScreen() {
  startScreen.hidden = true;
  appEl.hidden = false;
  showTab(storeGet(TAB_KEY) || 'log');
  renderShiftSummary();
}

function renderShiftSummary() {
  const date = parseDateValue(shift.date).toLocaleDateString('en-AU', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric'
  });
  const crew = shift.crew.length ? ` · C: ${shift.crew.join(', ')}` : '';
  shiftSummary.innerHTML = '';
  const strong = document.createElement('strong');
  strong.textContent = `${dutyLabel(shift)} · ${date}`;
  shiftSummary.append(strong, ` — S: ${shift.skipper} · D: ${shift.driver}${crew} ✎`);
}

function roster(s) {
  return [
    { role: 'S', name: s.skipper },
    { role: 'D', name: s.driver },
    ...s.crew.map(name => ({ role: 'C', name }))
  ];
}

// Records who got off / on, so the log shows who was aboard when
function crewChangeText(before, after) {
  const key = n => n.toLowerCase();
  const beforeMap = new Map(roster(before).map(r => [key(r.name), r]));
  const afterMap  = new Map(roster(after).map(r => [key(r.name), r]));
  const off   = [...beforeMap.values()].filter(r => !afterMap.has(key(r.name)));
  const on    = [...afterMap.values()].filter(r => !beforeMap.has(key(r.name)));
  const moved = [...afterMap.values()].filter(r => beforeMap.has(key(r.name)) && beforeMap.get(key(r.name)).role !== r.role);

  const parts = [];
  if (off.length)   parts.push('Off: ' + off.map(r => `${r.name} (${r.role})`).join(', '));
  if (on.length)    parts.push('On: ' + on.map(r => `${r.name} (${r.role})`).join(', '));
  if (moved.length) parts.push('Now: ' + moved.map(r => `${r.name} (${r.role})`).join(', '));
  return { text: parts.length ? `Crew change — ${parts.join('. ')}.` : '', off };
}

startScreen.addEventListener('change', (e) => {
  if (e.target.name === 'duty') syncDutyOther();
});

startScreen.addEventListener('input', (e) => {
  e.target.removeAttribute('aria-invalid');
});

startCancel.addEventListener('click', showLogScreen);

startScreen.addEventListener('submit', (e) => {
  e.preventDefault();
  const clean = v => v.trim().replace(/\s+/g, ' ');
  const duty  = selectedDuty();

  const missing = [];
  if (duty === 'Other' && !clean(dutyOther.value)) missing.push([dutyOther, 'other duty']);
  if (!patrolDate.value)                            missing.push([patrolDate, 'date']);
  if (!clean(skipperInput.value))                   missing.push([skipperInput, 'skipper']);
  if (!clean(driverInput.value))                    missing.push([driverInput, 'driver']);

  if (missing.length) {
    missing.forEach(([el]) => el.setAttribute('aria-invalid', 'true'));
    startError.textContent = `Please enter the ${missing.map(m => m[1]).join(', ')}.`;
    missing[0][0].focus();
    return;
  }

  const next = {
    duty,
    dutyOther: duty === 'Other' ? clean(dutyOther.value) : '',
    date:      patrolDate.value,
    skipper:   clean(skipperInput.value),
    driver:    clean(driverInput.value),
    crew:      crewInputs().map(i => clean(i.value)).filter(Boolean),
    loggedOff: shift ? [...shift.loggedOff] : []
  };

  if (shift) {
    const change = crewChangeText(shift, next);
    if (change.text) {
      const at = new Date();
      change.off.forEach(r => next.loggedOff.push({ name: r.name, role: r.role, at: at.toISOString() }));
      addLogEntry(change.text, { timestamp: at, raw: true });
    }
  }

  shift = next;
  saveShift();
  rememberCrewNames(roster(shift).map(r => r.name));
  showLogScreen();
});

shiftSummary.addEventListener('click', showStartScreen);

// ── Speech Recognition ──────────────────────────────────────────────
// Push to talk: tap Log Entry to start one listening session, tap Stop to
// save it. Sessions are never restarted automatically: on Android each
// restart plays the phone's start/stop tone and re-sends earlier words.
// If the phone stops listening by itself (a long silence), what was heard is
// saved and the button offers "Continue entry" to keep adding to it.
// Text is saved as a draft as it arrives, so a crash or a closed app can't
// lose what was said.
const SpeechRecognition =
  window.SpeechRecognition || window.webkitSpeechRecognition;

if (!SpeechRecognition) {
  statusMsg.textContent =
    '⚠️ Voice entry is not supported in this browser. ' +
    'Use Chrome on Android, or Safari on iPhone/iPad.';
  dictateBtn.disabled = true;
  dictateBtn.style.opacity = '0.5';
}

const CONTINUE_WINDOW_MS = 60000;

let recognition = null;
let isListening = false;
let finishing   = false;
let userStopped = false;
let lastError   = null;
let baseText    = '';    // text already in the entry when continuing it
let heardText   = '';    // this session, rebuilt from every result event
let lastIsFinal = true;
let startedAt   = null;
let entryPos    = null;
let posPromise  = null;
let timerId     = null;
let wakeLock    = null;
let usePhrases  = true;
let continueEntry = null; // entry the next tap adds to, after the phone stopped listening
let continueTimer = null;

// Android sends each result as the whole phrase so far ("departing",
// "departing Botany", "departing Botany Bay"); desktop sends new pieces.
// Merge either into one clean sentence without repeats.
// Compare ignoring case and punctuation (Safari re-sends phrases re-cased)
const normWords = t => t.toLowerCase().replace(/[^a-z0-9' ]+/g, ' ').replace(/\s+/g, ' ').trim();

function mergeText(a, b) {
  if (!a) return b;
  const na = normWords(a), nb = normWords(b);
  if (nb.startsWith(na)) return b;      // cumulative result: the new one supersedes
  if (na.endsWith(nb)) return a;        // the last words re-sent
  return `${a} ${b}`;
}

function sessionText(results) {
  let text = '';
  for (let i = 0; i < results.length; i++) {
    const t = results[i][0].transcript.trim();
    if (t) text = mergeText(text, t);
  }
  return text;
}

const fullText = () => [baseText, heardText].filter(Boolean).join(' ').trim();

function saveDraft() {
  const text = fullText();
  if (!text) return;
  const continuing = Boolean(continueEntry && logs.includes(continueEntry));
  storeSet(DRAFT_KEY, JSON.stringify({ startedAt: startedAt.toISOString(), text, pos: entryPos, continuing }));
}

function renderLive() {
  liveText.replaceChildren();
  if (!baseText && !heardText) {
    liveText.textContent = 'Listening… speak now.';
    return;
  }
  const strong = document.createElement('span');
  strong.textContent = correctTranscript(fullText());
  liveText.append(strong);
  liveText.scrollTop = liveText.scrollHeight;
}

function tickTimer() {
  const s = Math.floor((Date.now() - startedAt) / 1000);
  liveTimer.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

async function requestWakeLock() {
  try {
    if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen');
  } catch { wakeLock = null; }
}

function releaseWakeLock() {
  wakeLock?.release().catch(() => {});
  wakeLock = null;
}

document.addEventListener('visibilitychange', () => {
  if (isListening && document.visibilityState === 'visible') requestWakeLock();
});

function clearContinue() {
  continueEntry = null;
  clearTimeout(continueTimer);
  if (!isListening) dictateBtn.textContent = '🎙️ Log Entry';
}

function beginRecording() {
  const continuing = continueEntry && logs.includes(continueEntry) ? continueEntry : null;
  baseText    = continuing ? continuing.text.replace(/[.!?]$/, '') : '';
  heardText   = '';
  lastIsFinal = true;
  userStopped = false;
  finishing   = false;
  lastError   = null;
  startedAt   = continuing ? continuing.timestamp : new Date();
  entryPos    = continuing ? continuing.pos || null : null;
  isListening = true;
  clearTimeout(continueTimer);

  dictateBtn.textContent = '⏹️ Stop & Save Entry';
  dictateBtn.classList.add('listening');
  dictateBtn.setAttribute('aria-label', 'Stop and save entry');
  liveBox.hidden = false;
  statusMsg.textContent = '';
  renderLive();
  tickTimer();
  timerId = setInterval(tickTimer, 1000);
  requestWakeLock();

  if (!entryPos) posPromise = getPosition().then(p => { if (p) entryPos = p; return p; });

  const rec = new SpeechRecognition();
  recognition = rec;
  rec.lang            = 'en-AU'; // Australian English
  rec.interimResults  = true;    // show words as they're heard
  rec.maxAlternatives = 1;
  rec.continuous      = true;    // one session until Stop (or a long silence)

  if (usePhrases && 'phrases' in rec && window.SpeechRecognitionPhrase) {
    try {
      rec.phrases = recognitionPhrases().map(p => new SpeechRecognitionPhrase(p, 3.0));
    } catch { usePhrases = false; }
  }

  rec.onresult = (event) => {
    heardText = sessionText(event.results);
    lastIsFinal = event.results[event.results.length - 1]?.isFinal ?? true;
    renderLive();
    saveDraft();
  };

  rec.onerror = (event) => {
    if (event.error === 'aborted') return;
    if (event.error === 'phrases-not-supported') { usePhrases = false; return; }
    lastError = event.error;
  };

  rec.onend = () => {
    if (recognition === rec) recognition = null;
    if (isListening) finishRecording();
  };

  try {
    rec.start();
  } catch {
    lastError = 'start-failed';
    finishRecording();
  }
}

function finishRecording() {
  if (finishing) return;
  finishing = true;
  isListening = false;

  const continuing = continueEntry && logs.includes(continueEntry) ? continueEntry : null;
  const text = fullText();
  let entry = null;
  if (continuing && heardText) {
    continuing.text = formatText(text);
    updateEntry(continuing);
    entry = continuing;
  } else if (!continuing && text) {
    entry = addLogEntry(text, { timestamp: startedAt, pos: entryPos });
    // GPS may still be arriving — attach it when it does
    if (entry && !entry.pos && posPromise) {
      posPromise.then(p => { if (p && !entry.pos) { entry.pos = p; updateEntry(entry); } });
    }
  } else if (continuing) {
    entry = continuing;
  }
  storeRemove(DRAFT_KEY);
  resetButton();

  // The phone stopped listening by itself: offer to keep adding to this entry
  if (!userStopped && entry && !lastError) {
    continueEntry = entry;
    dictateBtn.textContent = '🎙️ Continue entry';
    statusMsg.textContent = '⏸ The phone stopped listening — what was heard is saved. Tap Continue entry to add more (within a minute).';
    continueTimer = setTimeout(() => { clearContinue(); statusMsg.textContent = ''; }, CONTINUE_WINDOW_MS);
    return;
  }
  clearContinue();
  statusMsg.textContent = endMessage(Boolean(entry && (heardText || baseText)));
}

function endMessage(saved) {
  if (lastError === 'not-allowed' || lastError === 'service-not-allowed') {
    return saved
      ? '⚠️ Microphone stopped by the phone — what was heard has been saved.'
      : '⚠️ Microphone access denied. Allow mic access for this site (Info → Phone Setup Check).';
  }
  if (lastError === 'audio-capture') {
    return '⚠️ No microphone found. Check a headset is connected, then try again.';
  }
  if (lastError === 'network') {
    return saved
      ? '⚠️ Lost signal — what was heard has been saved.'
      : '⚠️ No signal — voice entry needs mobile data. Try again when back in range.';
  }
  if (lastError === 'no-speech') {
    return saved ? '✅ Entry saved.' : "Didn't hear anything. Tap Log Entry and speak after the tone.";
  }
  return saved ? '✅ Entry saved.' : 'Nothing recorded. Tap Log Entry to try again.';
}

function stopRecognition() {
  userStopped = true;
  if (recognition) {
    recognition.stop();
    // Some browsers occasionally never fire onend — don't leave it hanging
    setTimeout(() => { if (!finishing) finishRecording(); }, 2500);
  } else {
    finishRecording();
  }
}

function resetButton() {
  isListening = false;
  recognition = null;
  clearInterval(timerId);
  releaseWakeLock();
  liveBox.hidden = true;
  dictateBtn.textContent = '🎙️ Log Entry';
  dictateBtn.classList.remove('listening');
  dictateBtn.setAttribute('aria-label', 'Log Entry');
}

dictateBtn.addEventListener('click', () => {
  if (isListening) {
    stopRecognition();
  } else {
    beginRecording();
  }
});

// ── Mark position ───────────────────────────────────────────────────
markBtn.addEventListener('click', async () => {
  const at = new Date();
  statusMsg.textContent = '📍 Getting GPS fix…';
  markBtn.disabled = true;
  const pos = await getPosition(20000);
  markBtn.disabled = false;
  if (!pos) {
    statusMsg.textContent = '⚠️ GPS unavailable — allow location access for this site.';
    return;
  }
  addLogEntry('Position marked.', { timestamp: at, pos, raw: true });
  statusMsg.textContent = `📍 Marked (±${pos.acc} m).`;
});

// ── New Patrol ──────────────────────────────────────────────────────
newPatrolBtn.addEventListener('click', () => {
  const confirmed = confirm(
    'Are you sure you want to start a new patrol? This will clear the current log.'
  );
  if (!confirmed) return;

  logs.length = 0;
  storeRemove(STORAGE_KEY);
  logEntries.innerHTML = EMPTY_MSG;

  shift = null;
  storeRemove(SHIFT_KEY);
  statusMsg.textContent = '';
  showStartScreen();
});

// ── End-of-Shift Report ─────────────────────────────────────────────
function buildReportContent() {
  const today = new Date();
  const date  = shift ? parseDateValue(shift.date) : today;

  const crewLines = shift
    ? [
        'Crew on board:',
        `  S  ${shift.skipper}`,
        `  D  ${shift.driver}`,
        ...shift.crew.map(name => `  C  ${name}`),
        ...(shift.loggedOff.length
          ? ['Logged off:', ...shift.loggedOff.map(o => `  ${o.role}  ${o.name} (off ${shortTime(o.at)})`)]
          : [])
      ]
    : [];

  const header = [
    '========================================',
    '    SURF RESCUE 30 PATROL SHIFT LOG',
    '========================================',
    ...(shift ? [`Duty     : ${dutyLabel(shift)}`] : []),
    `Date     : ${date.toLocaleDateString('en-AU', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`,
    `Generated: ${today.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}`,
    `Total entries: ${logs.length}`,
    ...(crewLines.length ? ['----------------------------------------', ...crewLines] : []),
    '========================================',
    ''
  ].join('\n');

  const body = logs.map((entry, i) =>
    `[${String(i + 1).padStart(3, '0')}] ${formatTimestamp(entry.timestamp)}\n      ${entry.text}` +
    (entry.pos ? `\n      Pos: ${positionLine(entry.pos)}` : '')
  ).join('\n\n');

  const footer = [
    '',
    '========================================',
    '           END OF SHIFT REPORT',
    '========================================',
    ''
  ].join('\n');

  return header + body + footer;
}

function downloadReport(content, filename) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

reportBtn.addEventListener('click', async () => {
  if (logs.length === 0) {
    alert('No log entries to export yet.');
    return;
  }

  const patrolDay = shift ? parseDateValue(shift.date) : new Date();
  const dateStr   = patrolDay.toLocaleDateString('en-AU', {
    year: 'numeric', month: '2-digit', day: '2-digit'
  }).replace(/\//g, '-'); // e.g. 09-03-2026

  const content  = buildReportContent();
  const filename = `Surf_Log_${dateStr}.txt`;

  // ── Try Web Share API first (mobile-native share sheet) ──
  if (navigator.share) {
    try {
      await navigator.share({
        title: `Surf Rescue 30 Patrol Log – ${dateStr}`,
        text: content
      });
      statusMsg.textContent = '✅ Report shared successfully.';
    } catch (err) {
      // User cancelled the share dialog — don't fall through to download
      if (err.name !== 'AbortError') {
        // Genuine failure — fall back to download
        downloadReport(content, filename);
        statusMsg.textContent = `📥 Share failed. Report downloaded as "${filename}"`;
      } else {
        statusMsg.textContent = 'Share cancelled.';
      }
    }
  } else {
    // ── Fallback: .txt download for non-supporting browsers ──
    downloadReport(content, filename);
    statusMsg.textContent = `📥 Report downloaded as "${filename}"`;
  }
});

// ── Startup ─────────────────────────────────────────────────────────
loadLogsFromStorage();

// A draft left behind means the page closed mid-recording — save it now
(() => {
  try {
    const draft = JSON.parse(storeGet(DRAFT_KEY));
    if (draft && draft.text) {
      const when = new Date(draft.startedAt);
      // Closed during "Continue entry": update that entry rather than add a copy
      const existing = draft.continuing && logs.find(e => e.timestamp.getTime() === when.getTime());
      if (existing) {
        existing.text = formatText(`${draft.text} [recovered]`);
        updateEntry(existing);
      } else {
        addLogEntry(`${draft.text} [recovered]`, { timestamp: when, pos: draft.pos });
      }
      statusMsg.textContent = '⚠️ Recovered an entry that was being recorded when the app closed.';
    }
  } catch { /* unreadable draft — nothing to recover */ }
  storeRemove(DRAFT_KEY);
})();

loadShift();
if (shift) showLogScreen(); else showStartScreen();

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
