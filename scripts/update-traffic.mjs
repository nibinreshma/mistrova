// Builds data/traffic.json for the MISTROVA Live Pulse traffic panel, using TomTom.
//  • Routing API (traffic-aware): Thamarassery ⇄ Vythiri over the Churam, both directions.
//    Gives travel time, delay vs free-flow, average speed and where jams sit on the route.
//  • Traffic Incidents API: accidents, closures, roadworks along the NH 766 corridor
//    (fetched at most every 30 min to stay inside the free monthly allowance).
// Needs the TOMTOM_API_KEY environment variable (a GitHub Actions secret). Node 18+.
import { readFile, writeFile } from 'node:fs/promises';

const KEY = process.env.TOMTOM_API_KEY;
const BASE = process.env.TOMTOM_BASE || 'https://api.tomtom.com';   // override only for testing
const OUT = new URL('../data/traffic.json', import.meta.url);

// Route ends: town centres, so TomTom snaps to the right roads even if slightly off.
const ENDS = {
  thamarassery: { name: 'Thamarassery', lat: 11.4140, lon: 75.9370 },
  vythiri:      { name: 'Vythiri',      lat: 11.5530, lon: 76.0410 }
};
// Rough landmarks used only to describe where a jam is ("near Lakkidi").
// Tweak these if a label ever looks off.
const LANDMARKS = [
  { name: 'Thamarassery town', lat: 11.4140, lon: 75.9370 },
  { name: 'Adivaram (Churam foot)', lat: 11.4900, lon: 75.9600 },
  { name: 'Churam hairpin bends', lat: 11.5050, lon: 75.9900 },
  { name: 'Lakkidi viewpoint', lat: 11.5180, lon: 76.0220 },
  { name: 'Vythiri town', lat: 11.5530, lon: 76.0410 }
];
// Incident search box around the corridor: minLon,minLat,maxLon,maxLat
const BBOX = '75.90,11.38,76.12,11.60';
const INCIDENT_EVERY_MS = 30 * 60 * 1000;

const ICON = { 0: 'Incident', 1: 'Accident', 2: 'Fog', 3: 'Dangerous conditions', 4: 'Rain', 5: 'Ice', 6: 'Traffic jam',
  7: 'Lane closed', 8: 'Road closed', 9: 'Road works', 10: 'Wind', 11: 'Flooding', 14: 'Broken-down vehicle' };
const MAGNITUDE = { 0: 'unknown', 1: 'minor', 2: 'moderate', 3: 'major', 4: 'closure' };

async function getJSON(url, ms = 20000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return await res.json();
  } finally { clearTimeout(t); }
}

function km(a, b) {
  const R = 6371, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
function nearestLandmark(p) {
  let best = null;
  for (const l of LANDMARKS) { const d = km(p, l); if (!best || d < best.d) best = { name: l.name, d }; }
  return best && best.d <= 4 ? `near ${best.name}` : `at ${p.lat.toFixed(3)}, ${p.lon.toFixed(3)}`;
}

async function route(from, to) {
  const locs = `${from.lat},${from.lon}:${to.lat},${to.lon}`;
  // Newer keys use TomTom Orbis Maps; older keys the original Routing API. Try Orbis first.
  const urls = [
    `${BASE}/maps/orbis/routing/calculateRoute/${locs}/json?key=${KEY}&apiVersion=2&traffic=live&travelMode=car&routeType=fast&sectionType=traffic`,
    `${BASE}/routing/1/calculateRoute/${locs}/json?key=${KEY}&traffic=true&travelMode=car&routeType=fastest&sectionType=traffic&computeTravelTimeFor=all`
  ];
  let data, lastErr;
  for (const u of urls) {
    try { data = await getJSON(u); if (data.routes?.length) break; } catch (e) { lastErr = e; data = null; }
  }
  if (!data) throw lastErr || new Error('No route returned');
  const r = data.routes?.[0];
  if (!r) throw new Error('No route returned');
  const pts = r.legs.flatMap(l => l.points).map(p => ({ lat: p.latitude, lon: p.longitude }));

  // cumulative distance so each traffic section can be placed as a 0–1 fraction of the route
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + km(pts[i - 1], pts[i]));
  const total = cum[cum.length - 1] || 1;

  const s = r.summary;
  const sections = (r.sections || [])
    .filter(x => x.sectionType === 'TRAFFIC')
    .map(x => ({
      from: +(cum[x.startPointIndex] / total).toFixed(3),
      to: +(cum[x.endPointIndex] / total).toFixed(3),
      kind: x.simpleCategory || 'OTHER',                 // JAM | ROAD_WORK | ROAD_CLOSURE | OTHER
      magnitude: MAGNITUDE[x.magnitudeOfDelay] || 'unknown',
      delayMin: Math.round((x.delayInSeconds || 0) / 60),
      speedKmh: x.effectiveSpeedInKmh ?? null,
      where: nearestLandmark(pts[Math.round((x.startPointIndex + x.endPointIndex) / 2)])
    }));

  return {
    from: from.name, to: to.name,
    lengthKm: +(s.lengthInMeters / 1000).toFixed(1),
    travelMin: Math.round(s.travelTimeInSeconds / 60),
    freeFlowMin: Math.round((s.noTrafficTravelTimeInSeconds ?? (s.travelTimeInSeconds - (s.trafficDelayInSeconds || 0))) / 60),
    delayMin: Math.round((s.trafficDelayInSeconds || 0) / 60),
    avgSpeedKmh: +((s.lengthInMeters / 1000) / (s.travelTimeInSeconds / 3600)).toFixed(1),
    sections
  };
}

async function incidents() {
  const fields = '{incidents{type,geometry{type,coordinates},properties{iconCategory,magnitudeOfDelay,events{description},startTime,endTime,from,to,delay,roadNumbers}}}';
  const url = `${BASE}/traffic/services/5/incidentDetails?key=${KEY}&bbox=${BBOX}`
    + `&fields=${encodeURIComponent(fields)}&language=en-GB&timeValidityFilter=present`;
  const data = await getJSON(url);
  return (data.incidents || []).map(i => {
    const p = i.properties || {};
    const c = i.geometry?.type === 'Point' ? i.geometry.coordinates : i.geometry?.coordinates?.[0];
    const at = c ? { lat: c[1], lon: c[0] } : null;
    return {
      type: ICON[p.iconCategory] || 'Incident',
      description: p.events?.map(e => e.description).filter(Boolean).join('; ') || ICON[p.iconCategory] || 'Incident',
      magnitude: MAGNITUDE[p.magnitudeOfDelay] || 'unknown',
      delayMin: p.delay ? Math.round(p.delay / 60) : null,
      road: (p.roadNumbers || []).join(', '),
      fromTo: [p.from, p.to].filter(Boolean).join(' → '),
      where: at ? nearestLandmark(at) : '',
      start: p.startTime || null, end: p.endTime || null
    };
  }).sort((a, b) => ['closure', 'major', 'moderate', 'minor', 'unknown'].indexOf(a.magnitude)
                  - ['closure', 'major', 'moderate', 'minor', 'unknown'].indexOf(b.magnitude))
    .slice(0, 6);
}

const previous = await readFile(OUT, 'utf8').then(JSON.parse).catch(() => ({}));

if (!KEY) {
  console.log('TOMTOM_API_KEY is not set — skipping traffic update.');
  process.exit(0);
}

const out = { ...previous, provider: 'TomTom' };
try {
  out.ascent = await route(ENDS.thamarassery, ENDS.vythiri);   // Kozhikode side → Wayanad
  out.descent = await route(ENDS.vythiri, ENDS.thamarassery);  // Wayanad → Kozhikode side
  out.updated = new Date().toISOString();
  out.status = 'ok';
} catch (e) {
  console.warn('Routing failed, keeping previous reading:', e.message);
  out.status = 'stale';
}

const lastInc = Date.parse(previous.incidentsChecked || 0) || 0;
if (Date.now() - lastInc >= INCIDENT_EVERY_MS - 60000) {
  try {
    out.incidents = await incidents();
    out.incidentsChecked = new Date().toISOString();
  } catch (e) {
    console.warn('Incidents failed, keeping previous list:', e.message);
  }
}

await writeFile(OUT, JSON.stringify(out, null, 2) + '\n');
const a = out.ascent;
console.log(a ? `Thamarassery → Vythiri: ${a.travelMin} min (${a.delayMin} min delay, ${a.avgSpeedKmh} km/h), ${a.sections.length} traffic section(s); ${(out.incidents || []).length} incident(s).` : 'No traffic data yet.');
