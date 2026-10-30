/* ── Surf Patrol Log – vocab.js ──
   Cleans up speech-recognition output for an offshore rescue boat:
   local place names, marine terms and 12/24-hour times.

   Runs on every browser (it only post-processes text). On Chrome, the same
   word list is also passed to the recogniser as phrase hints — see
   recognitionPhrases().
*/

// ── Marine & SLS terms: what the recogniser tends to hear → what we log ──
// Patterns are matched case-insensitively on word boundaries.
const MARINE_TERMS = [
  [/\bmay ?day\b/gi, 'MAYDAY'],
  [/\bpan[ -]?pan\b/gi, 'PAN-PAN'],
  [/\b(securite|security|say cure e tay|securitay)( securite| security)*\b(?= all stations)/gi, 'SÉCURITÉ'],
  [/\b(13|thirteen) ?surf\b/gi, '13SURF'],
  [/\b(e ?perb|e ?pirb|epirb)\b/gi, 'EPIRB'],
  [/\bp ?l ?b\b/gi, 'PLB'],
  [/\ba ?i ?s target\b/gi, 'AIS target'],
  [/\bv ?h ?f\b/gi, 'VHF'],
  [/\bu ?h ?f\b/gi, 'UHF'],
  [/\bi ?r ?b\b/gi, 'IRB'],
  [/\br ?w ?c\b/gi, 'RWC'],
  [/\bj ?r ?c ?c\b/gi, 'JRCC'],
  [/\b(pol ?air|pole air|pull air)\b/gi, 'PolAir'],
  [/\bwater police\b/gi, 'Water Police'],
  [/\bmarine rescue\b/gi, 'Marine Rescue'],
  [/\bwestpac (helicopter|chopper|rescue helicopter)\b/gi, 'Westpac Rescue Helicopter'],
  [/\bc ?p ?r\b/gi, 'CPR'],
  [/\ba ?e ?d\b/gi, 'AED'],
  [/\bp ?o ?b\b/gi, 'POB'],
  [/\bp ?i ?w\b/gi, 'PIW'],
  [/\be ?t ?a\b/gi, 'ETA'],
  [/\bs ?o ?c\b/gi, 'SOC'],
  [/\bsar\b/gi, 'SAR'],
  [/\bm ?a ?c liaison\b/gi, 'MAC liaison'],
  [/\b(\d+(?:\.\d+)?) (nots?|nuts|knot)\b/gi, (m, n) => `${n} knots`],
  [/\bnautical miles?\b/gi, m => m.toLowerCase()],
  [/\bchannel (sixteen|16)\b/gi, 'channel 16'],
  [/\bstar ?board\b/gi, 'starboard'],
  [/\bblue ?bottles?\b/gi, m => m.toLowerCase().replace(' ', '')],
  [/\brip current\b/gi, 'rip current'],
  [/\bjet ?ski\b/gi, 'jet ski'],
  [/\bstand ?up paddle ?board(er)?\b/gi, m => /er$/i.test(m) ? 'SUP paddler' : 'SUP'],
  [/\brock ?fisher(man|men|s)?\b/gi, m => 'rock fisher' + (/s$|men$/i.test(m) ? 's' : '')]
];

// ── Places commonly misheard by the recogniser ──────────────────────
const MISHEARD_PLACES = [
  [/\bbear island\b/gi, 'Bare Island'],
  [/\bboorah? point\b|\bbora point\b|\bboorer point\b/gi, 'Boora Point'],
  [/\bcape bank\b|\bcape banks?\b|\bkate banks\b|\bcape bangs\b/gi, 'Cape Banks'],
  [/\bcape bailey\b|\bcape baley\b/gi, 'Cape Baily'],
  [/\bmolyneux point\b|\bmolly ?new point\b/gi, 'Molineux Point'],
  [/\bcrewe(?:y)? cove\b|\bcrewy cove\b/gi, 'Cruwee Cove'],
  [/\bla pa?rouse\b|\bla pirouse\b|\blapa ?rouse\b/gi, 'La Perouse'],
  [/\blurlene bay\b|\blurline bay\b/gi, 'Lurline Bay'],
  [/\bmac ?kenzie'?s bay\b|\bmckenzies? bay\b/gi, 'Mackenzies Bay'],
  [/\bgordon'?s bay\b/gi, 'Gordons Bay'],
  [/\bfrenchman'?s bay\b/gi, 'Frenchmans Bay'],
  [/\bwater ?molar\b|\bwatta ?molla\b/gi, 'Wattamolla'],
  [/\bella ?rare\b|\bel ?oera\b|\belouera\b/gi, 'Elouera'],
  [/\btamara ?ma\b|\btama rama\b/gi, 'Tamarama'],
  [/\bmaroo ?bra\b/gi, 'Maroubra'],
  [/\bwedding cake\b(?! island)/gi, 'Wedding Cake Island'],
  [/\bbarren ?joey\b/gi, 'Barrenjoey'],
  [/\bben buckle(r)?\b/gi, 'Ben Buckler'],
  [/\bhornby light(house)?\b/gi, m => /house/i.test(m) ? 'Hornby Lighthouse' : 'Hornby Light'],
  [/\bmac ?quarie light(house)?\b/gi, 'Macquarie Lighthouse'],
  [/\bsolander\b/gi, 'Solander']
];

// ── Times: "1430 hours", "14 30 hrs", "2:30 p.m.", "2 pm" → 24-hour HH:MM ──
function normaliseTimes(text) {
  const hhmm = (h, m) => `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  const valid = (h, m) => h >= 0 && h <= 23 && m >= 0 && m <= 59;

  return text
    // 12-hour with minutes: 2:30 pm, 2.30pm, 2 30 p.m.
    .replace(/\b(1[0-2]|0?[1-9])[:. ]([0-5]\d)\s*([ap])\.?\s?m\b\.?/gi, (all, h, m, ap) => {
      let hour = Number(h) % 12;
      if (ap.toLowerCase() === 'p') hour += 12;
      return hhmm(hour, Number(m));
    })
    // 12-hour, hour only: 2 pm, 11am
    .replace(/\b(1[0-2]|0?[1-9])\s*([ap])\.?\s?m\b\.?/gi, (all, h, ap) => {
      let hour = Number(h) % 12;
      if (ap.toLowerCase() === 'p') hour += 12;
      return hhmm(hour, 0);
    })
    // 24-hour with "hours"/"hrs": 1430 hours, 14 30 hrs, 0900 hours, 14:30 hours
    .replace(/\b([01]?\d|2[0-3])[: ]?([0-5]\d)\s*(hours|hrs|hundred hours)\b/gi, (all, h, m) =>
      valid(Number(h), Number(m)) ? `${hhmm(Number(h), Number(m))} hrs` : all)
    // "fourteen hundred hours" style is usually transcribed as "1400 hours" — covered above.
    // Bare four-digit 24-hour times after "at": "at 1430" → "at 14:30"
    .replace(/\b(at|from|until|till|by)\s([01]\d|2[0-3])([0-5]\d)\b(?!\s*(metres|m\b|kn|knots|nm|degrees))/gi,
      (all, w, h, m) => `${w} ${hhmm(Number(h), Number(m))}`);
}

// ── Place-name pass ─────────────────────────────────────────────────
const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Canonical capitalisation for exact (case-insensitive) mentions of a place
// or one of its aliases. Aliases map to the full place name so the log is
// unambiguous ("the Cake" → "Wedding Cake Island"); a nickname that *is* a
// place in its own right (Ours, Voodoo) keeps its own name.
const PLACE_RULES = (() => {
  const ambiguous = new Set(AMBIGUOUS_NAMES.map(n => n.toLowerCase()));
  const rules = [];
  for (const place of PLACES) {
    const variants = [place.name, ...place.aliases];
    for (const v of variants) {
      if (ambiguous.has(v.toLowerCase())) continue;
      const canonical = place.name === 'Shelly Beach Manly' ? 'Shelly Beach' : place.name;
      // "North Narrabeen", "Bulli Point", "Barrenjoey Head" say more than the
      // canonical name, so keep them as spoken (just capitalised).
      const target = v !== place.name && v.toLowerCase().includes(canonical.toLowerCase()) ? v : canonical;
      rules.push([new RegExp(`\\b${escapeRe(v).replace(/'/g, "'?")}\\b`, 'gi'), target, v.length]);
    }
  }
  // Longest first so "North Cronulla" wins over "Cronulla"
  return rules.sort((a, b) => b[2] - a[2]);
})();

function applyPlaces(text) {
  // Protect matches already made so shorter names don't rewrite inside them
  const slots = [];
  let out = text;
  for (const [re, target] of PLACE_RULES) {
    out = out.replace(re, () => {
      slots.push(target);
      return `\u0000${slots.length - 1}\u0000`;
    });
  }
  return out.replace(/\u0000(\d+)\u0000/g, (_, i) => slots[Number(i)]);
}

// ── Fuzzy match next to a geographic word ("boorer point", "cape bangs") ──
// Only fires when the phrase ends in point/head/bay/island/beach/cape/reef so
// ordinary words ("bronze medallion") are never touched.
const GEO_WORDS = /^(point|head|bay|island|beach|cape|reef|cove|rocks?|lighthouse)$/i;

function levenshtein(a, b) {
  const dp = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[b.length];
}

const GEO_PLACES = PLACES.filter(p => GEO_WORDS.test(p.name.split(' ').pop()) || /^cape /i.test(p.name));

function fuzzyGeoPlaces(text) {
  const words = text.split(/(\s+)/); // keep whitespace tokens
  const tokens = words.filter((_, i) => i % 2 === 0);
  const result = [...tokens];
  for (let i = 0; i < tokens.length; i++) {
    const w = tokens[i].replace(/[^\w']/g, '');
    for (const span of [2, 3]) {
      const start = i - span + 1;
      if (start < 0) continue;
      const isCape = /^cape$/i.test(tokens[start].replace(/\W/g, ''));
      if (!GEO_WORDS.test(w) && !isCape) continue;
      const phrase = tokens.slice(start, i + 1).join(' ').replace(/[^\w' ]/g, '').toLowerCase();
      if (/[A-Z]/.test(tokens.slice(start, i + 1).join(' ').replace(/^\S/, ''))) continue; // already proper-cased
      let best = null;
      for (const p of GEO_PLACES) {
        const name = p.name.toLowerCase();
        if (name.split(' ').length !== span) continue;
        const d = levenshtein(phrase, name);
        const sim = 1 - d / Math.max(phrase.length, name.length);
        if (sim >= 0.75 && sim < 1 && (!best || sim > best.sim)) best = { sim, name: p.name };
      }
      if (best) {
        const trailing = tokens[i].match(/[^\w']+$/)?.[0] || '';
        result[start] = best.name + trailing;
        for (let k = start + 1; k <= i; k++) result[k] = '';
        break;
      }
    }
  }
  // Re-join, dropping emptied tokens and their following whitespace
  let out = '';
  result.forEach((t, idx) => {
    if (t === '') return;
    out += (out ? ' ' : '') + t;
  });
  return out;
}

// ── Public: clean a final transcript ───────────────────────────────
function correctTranscript(raw) {
  let text = raw.replace(/\s+/g, ' ').trim();
  if (!text) return text;
  for (const [re, rep] of MISHEARD_PLACES) text = text.replace(re, rep);
  text = fuzzyGeoPlaces(text);
  text = applyPlaces(text);
  for (const [re, rep] of MARINE_TERMS) text = text.replace(re, rep);
  text = normaliseTimes(text);
  return text;
}

// Phrase hints for recognisers that support contextual biasing (Chrome).
function recognitionPhrases() {
  const names = new Set();
  PLACES.forEach(p => { names.add(p.name.replace(' Manly', '')); p.aliases.forEach(a => names.add(a)); });
  ['MAYDAY', 'PAN-PAN', 'Sécurité', '13SURF', 'EPIRB', 'PLB', 'AIS', 'VHF', 'UHF', 'IRB', 'jet ski',
   'PolAir', 'Water Police', 'Marine Rescue', 'Westpac Rescue Helicopter', 'nautical miles', 'knots',
   'starboard', 'port side', 'rip current', 'bluebottles', 'rock fishers', 'swimmer', 'kayaker',
   'snorkeller', 'diver', 'person in water', 'Surf Rescue 30'].forEach(t => names.add(t));
  return [...names];
}

if (typeof module !== 'undefined') module.exports = { correctTranscript, normaliseTimes, recognitionPhrases };
