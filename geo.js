/* ── Surf Patrol Log – geo.js ──
   Position formatting, distance/bearing and nearest-landmark lookup.
   Distances in nautical miles, bearings in degrees true.
*/

const EARTH_RADIUS_NM = 3440.065;
const toRad = d => d * Math.PI / 180;
const toDeg = r => r * 180 / Math.PI;

// Great-circle distance in NM
function distanceNm(lat1, lon1, lat2, lon2) {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_NM * Math.asin(Math.sqrt(a));
}

// Initial bearing from point 1 to point 2, degrees true 0–359
function bearingDeg(lat1, lon1, lat2, lon2) {
  const y = Math.sin(toRad(lon2 - lon1)) * Math.cos(toRad(lat2));
  const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
            Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(toRad(lon2 - lon1));
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

const pad3 = n => String(Math.round(n) % 360).padStart(3, '0');

// Degrees and decimal minutes — the format positions are passed over radio
function formatDDM(lat, lon) {
  const part = (v, pos, neg, degWidth) => {
    const hemi = v < 0 ? neg : pos;
    const abs = Math.abs(v);
    let deg = Math.floor(abs);
    let min = (abs - deg) * 60;
    if (min >= 59.9995) { deg += 1; min = 0; }
    return `${String(deg).padStart(degWidth, '0')}°${min.toFixed(3).padStart(6, '0')}′${hemi}`;
  };
  return `${part(lat, 'N', 'S', 2)} ${part(lon, 'E', 'W', 3)}`;
}

function formatDMS(lat, lon) {
  const part = (v, pos, neg) => {
    const hemi = v < 0 ? neg : pos;
    const abs = Math.abs(v);
    const deg = Math.floor(abs);
    const minF = (abs - deg) * 60;
    const min = Math.floor(minF);
    const sec = (minF - min) * 60;
    return `${deg}°${String(min).padStart(2, '0')}′${sec.toFixed(1).padStart(4, '0')}″${hemi}`;
  };
  return `${part(lat, 'N', 'S')} ${part(lon, 'E', 'W')}`;
}

function formatDecimal(lat, lon) {
  return `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
}

// Nearest named landmark with coordinates
function nearestPlace(lat, lon) {
  let best = null;
  for (const p of PLACES) {
    if (p.lat == null) continue;
    const d = distanceNm(p.lat, p.lon, lat, lon);
    if (!best || d < best.dist) best = { place: p, dist: d };
  }
  return best;
}

// "0.8 NM 095°T from Cape Banks" — range and bearing of the position FROM the landmark
function describeFromLandmark(lat, lon) {
  const near = nearestPlace(lat, lon);
  if (!near) return '';
  const name = near.place.name.replace(' Manly', '');
  if (near.dist < 0.05) return `at ${name}`;
  const brg = bearingDeg(near.place.lat, near.place.lon, lat, lon);
  return `${near.dist.toFixed(1)} NM ${pad3(brg)}°T from ${name}`;
}

// Parse decimal, DDM or DMS input; Southern/Eastern hemisphere assumed if no sign/letter.
// Accepts "33 58.12 S 151 15.45 E", "-33.9687, 151.2575", "33°58'07\"S 151°15'27\"E".
function parsePosition(input) {
  const s = input.trim().toUpperCase().replace(/[°′″'"]/g, ' ').replace(/,/g, ' ');
  const hemis = s.match(/[NSEW]/g) || [];
  const nums = s.replace(/[NSEW]/g, ' ').trim().split(/\s+/).filter(Boolean).map(Number);
  if (!nums.length || nums.some(Number.isNaN)) return null;

  let latParts, lonParts;
  if (nums.length === 2) { latParts = [nums[0]]; lonParts = [nums[1]]; }
  else if (nums.length === 4) { latParts = nums.slice(0, 2); lonParts = nums.slice(2); }
  else if (nums.length === 6) { latParts = nums.slice(0, 3); lonParts = nums.slice(3); }
  else return null;

  const toDec = parts => {
    const sign = parts[0] < 0 ? -1 : 1;
    const [d, m = 0, sec = 0] = parts.map(Math.abs);
    if (m >= 60 || sec >= 60) return NaN;
    return sign * (d + m / 60 + sec / 3600);
  };
  let lat = toDec(latParts);
  let lon = toDec(lonParts);
  if (Number.isNaN(lat) || Number.isNaN(lon)) return null;

  // Hemisphere letters win; otherwise default to S/E (we're off Sydney)
  const latHemi = hemis.find(h => h === 'N' || h === 'S');
  const lonHemi = hemis.find(h => h === 'E' || h === 'W');
  if (latHemi) lat = Math.abs(lat) * (latHemi === 'S' ? -1 : 1);
  else if (latParts[0] > 0) lat = -lat;
  if (lonHemi) lon = Math.abs(lon) * (lonHemi === 'W' ? -1 : 1);

  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat, lon };
}

// One-shot GPS fix, resolving to null on failure/denial instead of throwing
function getPosition(timeout = 15000) {
  return new Promise(resolve => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      p => resolve({ lat: p.coords.latitude, lon: p.coords.longitude, acc: Math.round(p.coords.accuracy) }),
      () => resolve(null),
      { enableHighAccuracy: true, maximumAge: 20000, timeout }
    );
  });
}

if (typeof module !== 'undefined') {
  module.exports = { distanceNm, bearingDeg, formatDDM, formatDMS, formatDecimal, describeFromLandmark, parsePosition };
}
