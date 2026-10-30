/* ── Surf Patrol Log – script.js ── */

// ── Element references ──────────────────────────────────────────────
const dictateBtn    = document.getElementById('dictate-btn');
const statusMsg     = document.getElementById('status-msg');
const logEntries    = document.getElementById('log-entries');
const reportBtn     = document.getElementById('report-btn');
const newPatrolBtn  = document.getElementById('new-patrol-btn');
const currentTime   = document.getElementById('current-time');
const startScreen   = document.getElementById('start-screen');
const startBtn      = document.getElementById('start-btn');
const startError    = document.getElementById('start-error');
const dutyOther     = document.getElementById('duty-other');
const patrolDate    = document.getElementById('patrol-date');
const skipperInput  = document.getElementById('crew-skipper');
const driverInput   = document.getElementById('crew-driver');
const crewInputs    = [...document.querySelectorAll('.crew-extra')];
const crewNameList  = document.getElementById('crew-names');
const shiftSummary  = document.getElementById('shift-summary');
const logScreenEls  = [
  document.getElementById('shift-controls'),
  document.querySelector('main'),
  document.querySelector('footer')
];

const STORAGE_KEY = 'surfPatrolLogs';
const SHIFT_KEY   = 'surfPatrolShift';
const NAMES_KEY   = 'surfPatrolCrewNames';
const EMPTY_MSG   = '<p id="empty-msg">No entries yet. Tap Log Entry to start recording.</p>';

// ── Live clock ──────────────────────────────────────────────────────
function updateClock() {
  currentTime.textContent = new Date().toLocaleTimeString([], {
    weekday: 'short', year: 'numeric', month: 'short',
    day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit'
  });
}
updateClock();
setInterval(updateClock, 1000);

// ── Log store ───────────────────────────────────────────────────────
// Timestamps are stored as ISO strings in localStorage, converted back to
// Date objects when loaded.
const logs = []; // [{ timestamp: Date, text: string }]

// ── Text formatting ─────────────────────────────────────────────────
function formatText(raw) {
  const t = raw.trim();
  if (!t) return t;
  // Capitalise first letter
  const capped = t.charAt(0).toUpperCase() + t.slice(1);
  // Append a full stop if not already ending in sentence punctuation
  return /[.!?]$/.test(capped) ? capped : capped + '.';
}

function saveLogs() {
  const serialised = logs.map(e => ({
    timestamp: e.timestamp.toISOString(),
    text: e.text
  }));
  localStorage.setItem(STORAGE_KEY, JSON.stringify(serialised));
}

function renderEntry(entry) {
  // Remove the placeholder if it still exists
  const placeholder = document.getElementById('empty-msg');
  if (placeholder) placeholder.remove();

  const card = document.createElement('div');
  card.className = 'log-entry';

  const tsSpan = document.createElement('span');
  tsSpan.className = 'timestamp';
  tsSpan.textContent = formatTimestamp(entry.timestamp);

  const textSpan = document.createElement('span');
  textSpan.className = 'text';
  textSpan.textContent = entry.text;

  card.appendChild(tsSpan);
  card.appendChild(textSpan);
  logEntries.appendChild(card);

  addSwipeToDelete(card, entry);
  return card;
}

function addLogEntry(text) {
  if (!text.trim()) return;

  const entry = { timestamp: new Date(), text: formatText(text) };
  logs.push(entry);
  saveLogs();

  const card = renderEntry(entry);
  card.scrollIntoView({ behavior: 'smooth', block: 'end' });
}

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
      if (Math.abs(dx) < Math.abs(dy)) return; // vertical scroll — ignore
      tracking = true;
    }

    currentX = dx;
    const opacity = Math.max(0.35, 1 - Math.abs(dx) / 220);
    card.style.transform = `translateX(${dx}px)`;
    card.style.opacity   = opacity;
  }, { passive: true });

  card.addEventListener('touchend', () => {
    if (!tracking) return;

    const THRESHOLD = 80; // px needed to trigger the delete prompt

    if (Math.abs(currentX) >= THRESHOLD) {
      const confirmed = confirm('Are you sure you want to delete this entry?');

      if (confirmed) {
        // Slide fully off-screen then remove from DOM + storage
        const direction = currentX > 0 ? '110%' : '-110%';
        card.style.transition = 'transform 0.22s ease, opacity 0.22s ease';
        card.style.transform  = `translateX(${direction})`;
        card.style.opacity    = '0';

        setTimeout(() => {
          const idx = logs.indexOf(entry);
          if (idx !== -1) logs.splice(idx, 1);
          saveLogs();
          card.remove();
          if (logs.length === 0) logEntries.innerHTML = EMPTY_MSG;
        }, 230);
      } else {
        // Snap back to original position
        card.style.transition = 'transform 0.3s ease, opacity 0.3s ease';
        card.style.transform  = 'translateX(0)';
        card.style.opacity    = '1';
      }
    } else {
      // Not swiped far enough — snap back
      card.style.transition = 'transform 0.3s ease, opacity 0.3s ease';
      card.style.transform  = 'translateX(0)';
      card.style.opacity    = '1';
    }
  });
}

function loadLogsFromStorage() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw);
    parsed.forEach(item => {
      const entry = { timestamp: new Date(item.timestamp), text: item.text };
      logs.push(entry);
      renderEntry(entry);
    });
  } catch {
    // Corrupted data — start fresh
    localStorage.removeItem(STORAGE_KEY);
  }
}

// Restore any saved logs on page load
loadLogsFromStorage();

function formatTimestamp(date) {
  return date.toLocaleTimeString([], {
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  }) + '  –  ' + date.toLocaleDateString([], {
    weekday: 'short', year: 'numeric', month: 'short', day: 'numeric'
  });
}

// ── Shift: duty, date and crew ──────────────────────────────────────
// Stored as { duty, dutyOther, date: 'YYYY-MM-DD', skipper, driver, crew: [] }.
// Times on/off are deliberately not captured here — they're filled in after.
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

function loadShift() {
  try {
    shift = JSON.parse(localStorage.getItem(SHIFT_KEY));
  } catch {
    shift = null;
  }
}

function saveShift() {
  localStorage.setItem(SHIFT_KEY, JSON.stringify(shift));
}

// Remember names used before so the crew list autocompletes next patrol
function loadCrewNames() {
  try {
    return JSON.parse(localStorage.getItem(NAMES_KEY)) || [];
  } catch {
    return [];
  }
}

function rememberCrewNames(names) {
  const seen = new Set(names.map(n => n.toLowerCase()));
  const merged = [...names, ...loadCrewNames().filter(n => !seen.has(n.toLowerCase()))];
  localStorage.setItem(NAMES_KEY, JSON.stringify(merged.slice(0, 60)));
}

function fillCrewNameList() {
  crewNameList.replaceChildren(...loadCrewNames().map(name => {
    const opt = document.createElement('option');
    opt.value = name;
    return opt;
  }));
}

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
  crewInputs.forEach((input, i) => { input.value = s ? (s.crew[i] || '') : ''; });
  syncDutyOther();
  startScreen.querySelectorAll('[aria-invalid]').forEach(el => el.removeAttribute('aria-invalid'));
  startError.textContent = '';
}

function showStartScreen() {
  fillCrewNameList();
  fillStartForm(shift);
  startBtn.textContent = shift ? 'Save & Return to Log' : 'Start Patrol';
  logScreenEls.forEach(el => { el.hidden = true; });
  startScreen.hidden = false;
  startScreen.scrollTop = 0;
}

function showLogScreen() {
  startScreen.hidden = true;
  logScreenEls.forEach(el => { el.hidden = false; });
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

startScreen.addEventListener('change', (e) => {
  if (e.target.name === 'duty') syncDutyOther();
});

startScreen.addEventListener('input', (e) => {
  e.target.removeAttribute('aria-invalid');
});

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

  shift = {
    duty,
    dutyOther: duty === 'Other' ? clean(dutyOther.value) : '',
    date:      patrolDate.value,
    skipper:   clean(skipperInput.value),
    driver:    clean(driverInput.value),
    crew:      crewInputs.map(i => clean(i.value)).filter(Boolean)
  };
  saveShift();
  rememberCrewNames([shift.skipper, shift.driver, ...shift.crew]);
  showLogScreen();
});

shiftSummary.addEventListener('click', showStartScreen);

loadShift();
if (shift) showLogScreen(); else showStartScreen();

// ── Speech Recognition ──────────────────────────────────────────────
const SpeechRecognition =
  window.SpeechRecognition || window.webkitSpeechRecognition;

if (!SpeechRecognition) {
  statusMsg.textContent =
    '⚠️ Speech recognition is not supported in this browser. ' +
    'Try Chrome or Edge on Android / desktop.';
  dictateBtn.disabled = true;
  dictateBtn.style.opacity = '0.5';
}

let recognition          = null;
let isListening          = false;
let accumulatedTranscript = '';
let userStopped          = false;
let lastError            = null;

function startRecognition() {
  recognition = new SpeechRecognition();
  recognition.lang            = 'en-AU'; // Australian English
  recognition.interimResults  = false;
  recognition.maxAlternatives = 1;
  recognition.continuous      = true;  // Keep recording until user taps Stop

  accumulatedTranscript = '';
  userStopped           = false;
  lastError             = null;

  recognition.onstart = () => {
    isListening = true;
    dictateBtn.textContent = '⏹️ Stop & Save Entry';
    dictateBtn.classList.add('listening');
    statusMsg.textContent = 'Recording… tap Stop & Save when done.';
  };

  recognition.onresult = (event) => {
    // Append each new final result as it arrives
    for (let i = event.resultIndex; i < event.results.length; i++) {
      if (event.results[i].isFinal) {
        const piece = event.results[i][0].transcript.trim();
        accumulatedTranscript += (accumulatedTranscript ? ' ' : '') + piece;
      }
    }
  };

  recognition.onerror = (event) => {
    // 'no-speech' in continuous mode is non-fatal — keep listening.
    // Other errors are followed by onend, which saves whatever was heard.
    if (event.error === 'no-speech') return;
    lastError = event.error;
  };

  // Always save what was heard, whether the user tapped Stop or the browser
  // ended the session itself (signal drop, timeout, screen lock).
  recognition.onend = () => {
    const heard = accumulatedTranscript.trim();
    if (heard) addLogEntry(heard);
    statusMsg.textContent = endMessage(Boolean(heard));
    resetButton();
  };

  recognition.start();
}

function endMessage(saved) {
  if (lastError === 'not-allowed' || lastError === 'service-not-allowed') {
    return '⚠️ Microphone access denied. Please allow mic access and reload.';
  }
  if (lastError === 'network') {
    return saved
      ? '⚠️ Lost signal — what was heard has been saved. Tap Log Entry to continue.'
      : '⚠️ No signal — voice entry needs mobile data. Try again when back in range.';
  }
  if (lastError) {
    return saved
      ? `⚠️ Recording stopped (${lastError}) — what was heard has been saved.`
      : `⚠️ Error: ${lastError}. Tap to try again.`;
  }
  if (!userStopped) {
    return saved
      ? '⚠️ Recording stopped by the phone — what was heard has been saved.'
      : 'Recording stopped. Tap Log Entry to try again.';
  }
  return saved ? '✅ Entry saved.' : 'Nothing recorded. Tap to try again.';
}

function stopRecognition() {
  if (recognition) {
    userStopped = true;
    recognition.stop();
  }
}

function resetButton() {
  isListening           = false;
  recognition           = null;
  accumulatedTranscript = '';
  dictateBtn.textContent = '🎙️ Log Entry';
  dictateBtn.classList.remove('listening');
}

dictateBtn.addEventListener('click', () => {
  if (isListening) {
    stopRecognition();
  } else {
    startRecognition();
  }
});

// ── New Patrol ──────────────────────────────────────────────────────
newPatrolBtn.addEventListener('click', () => {
  const confirmed = confirm(
    'Are you sure you want to start a new patrol? This will clear the current log.'
  );
  if (!confirmed) return;

  logs.length = 0;
  localStorage.removeItem(STORAGE_KEY);
  logEntries.innerHTML = EMPTY_MSG;

  shift = null;
  localStorage.removeItem(SHIFT_KEY);
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
        ...shift.crew.map(name => `  C  ${name}`)
      ]
    : [];

  const header = [
    '========================================',
    '    SURF RESCUE 30 PATROL SHIFT LOG',
    '========================================',
    ...(shift ? [`Duty     : ${dutyLabel(shift)}`] : []),
    `Date     : ${date.toLocaleDateString('en-AU', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`,
    `Generated: ${today.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`,
    `Total entries: ${logs.length}`,
    ...(crewLines.length ? ['----------------------------------------', ...crewLines] : []),
    '========================================',
    ''
  ].join('\n');

  const body = logs.map((entry, i) =>
    `[${String(i + 1).padStart(3, '0')}] ${formatTimestamp(entry.timestamp)}\n      ${entry.text}`
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
