/* ── Surf Patrol Log – setup.js ──
   Phone setup check (Info tab): shows whether microphone, location and
   notifications are allowed, and asks for them with one tap. Browsers only
   show permission prompts in response to a tap, so this is the reliable way
   to get everything allowed before the patrol starts.
*/
(() => {
  const list = document.getElementById('perm-list');
  const btn = document.getElementById('perm-request');

  const ITEMS = [
    { key: 'microphone', label: '🎙️ Microphone', why: 'voice entries' },
    { key: 'geolocation', label: '📍 Location', why: 'positions, job route, 2 NM alarm' },
    { key: 'notifications', label: '🔔 Notifications', why: 'boundary alerts' }
  ];
  const LABEL = { granted: '✅ Allowed', denied: '⛔ Blocked', prompt: '❔ Not asked yet', unknown: '❔ Unknown', unsupported: '— Not available' };

  async function state(key) {
    if (key === 'notifications') {
      if (!('Notification' in window)) return 'unsupported';
      return Notification.permission === 'default' ? 'prompt' : Notification.permission;
    }
    if (key === 'microphone' && !navigator.mediaDevices?.getUserMedia) return 'unsupported';
    if (key === 'geolocation' && !navigator.geolocation) return 'unsupported';
    try {
      const status = await navigator.permissions.query({ name: key });
      return status.state;
    } catch {
      return 'unknown'; // some browsers (older Safari) can't report this
    }
  }

  async function render() {
    const rows = await Promise.all(ITEMS.map(async item => ({ ...item, state: await state(item.key) })));
    list.replaceChildren(...rows.map(r => {
      const li = document.createElement('li');
      li.className = `perm-${r.state}`;
      const name = document.createElement('strong');
      name.textContent = r.label;
      const st = document.createElement('span');
      st.textContent = LABEL[r.state] || r.state;
      const why = document.createElement('small');
      why.textContent = r.why;
      li.append(name, st, why);
      // Tap a row: ask for that permission if it hasn't been asked yet. Once
      // it's Blocked, phones don't let a website ask again, so open the steps.
      if (r.state === 'prompt' || r.state === 'unknown' || r.state === 'denied') {
        li.classList.add('tappable');
        li.tabIndex = 0;
        li.setAttribute('role', 'button');
        const hint = document.createElement('small');
        hint.className = 'perm-hint';
        hint.textContent = r.state === 'denied' ? 'Tap for how to unblock' : 'Tap to allow';
        li.append(hint);
        const act = () => (r.state === 'denied' ? showFix() : ask(r.key));
        li.addEventListener('click', act);
        li.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); act(); } });
      }
      return li;
    }));
    btn.hidden = rows.every(r => r.state === 'granted' || r.state === 'unsupported');
  }

  async function ask(key) {
    if (key === 'microphone') {
      try {
        const stream = await navigator.mediaDevices?.getUserMedia({ audio: true });
        stream?.getTracks().forEach(t => t.stop());
      } catch { /* denied or no mic — shown in the list */ }
    } else if (key === 'geolocation') {
      await getPosition(15000);
    } else if (key === 'notifications' && 'Notification' in window && Notification.permission === 'default') {
      try { await Notification.requestPermission(); } catch { /* ignore */ }
    }
    render();
  }

  function showFix() {
    const help = document.querySelector('#setup-card details');
    if (help) { help.open = true; help.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
  }

  btn.addEventListener('click', async () => {
    btn.disabled = true;
    for (const key of ['microphone', 'geolocation', 'notifications']) await ask(key);
    btn.disabled = false;
  });

  document.addEventListener('tabshown', e => { if (e.detail === 'info') render(); });
  render();
})();
