/* ── Surf Patrol Log – script.js ── */

// ── Element references ──────────────────────────────────────────────
const dictateBtn    = document.getElementById('dictate-btn');
const statusMsg     = document.getElementById('status-msg');
const logEntries    = document.getElementById('log-entries');
const reportBtn     = document.getElementById('report-btn');
const newPatrolBtn  = document.getElementById('new-patrol-btn');
const currentTime   = document.getElementById('current-time');


const STORAGE_KEY = 'surfPatrolLogs';

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
          if (logs.length === 0) {
            logEntries.innerHTML =
              '<p id="empty-msg">No entries yet. Tap Log Entry to start recording.</p>';
          }
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

function startRecognition() {
  recognition = new SpeechRecognition();
  recognition.lang            = 'en-AU'; // Australian English
  recognition.interimResults  = false;
  recognition.maxAlternatives = 1;
  recognition.continuous      = true;  // Keep recording until user taps Stop

  accumulatedTranscript = '';
  userStopped           = false;

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
    // 'no-speech' in continuous mode is non-fatal — keep listening
    if (event.error === 'no-speech') return;
    let msg = '⚠️ Error: ' + event.error;
    if (event.error === 'not-allowed') {
      msg = '⚠️ Microphone access denied. Please allow mic access and reload.';
    }
    statusMsg.textContent = msg;
    resetButton();
  };

  recognition.onend = () => {
    if (userStopped) {
      if (accumulatedTranscript.trim()) {
        addLogEntry(accumulatedTranscript);
        statusMsg.textContent = '✅ Entry saved.';
      } else {
        statusMsg.textContent = 'Nothing recorded. Tap to try again.';
      }
    }
    resetButton();
  };

  recognition.start();
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

  logEntries.innerHTML =
    '<p id="empty-msg">No entries yet. Start dictating to add a log.</p>';

  statusMsg.textContent = 'New patrol started. Log cleared.';
});

// ── End-of-Shift Report ─────────────────────────────────────────────
function buildReportContent() {
  const today = new Date();

  const header = [
    '========================================',
    '    SURF RESCUE 30 PATROL SHIFT LOG',
    '========================================',
    `Date     : ${today.toLocaleDateString('en-AU', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`,
    `Generated: ${today.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`,
    `Total entries: ${logs.length}`,
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

  const today   = new Date();
  const dateStr = today.toLocaleDateString('en-AU', {
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
