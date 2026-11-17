// Builds data/alerts.json for the MISTROVA Live Pulse SOS panel.
//  1. Official alerts: NDMA SACHET Kerala CAP feed, filtered to Wayanad.
//  2. Local alerts: data/local-alerts.json, edited by your team.
// Run: node scripts/update-alerts.mjs   (Node 18+)
import { readFile, writeFile } from 'node:fs/promises';
import { XMLParser } from 'fast-xml-parser';

const RSS_URL = process.env.SACHET_RSS || 'https://sachet.ndma.gov.in/cap_public_website/rss/rss_kerala.xml';
const DISTRICT = /wayanad|wynad/i;
const MAX_ITEMS = 40;           // newest feed items to inspect
const OUT = new URL('../data/alerts.json', import.meta.url);
const LOCAL = new URL('../data/local-alerts.json', import.meta.url);

const xml = new XMLParser({ ignoreAttributes: false, removeNSPrefix: true, trimValues: true });
const asArray = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);
const text = (v) => (typeof v === 'object' && v !== null ? v['#text'] ?? '' : v ?? '').toString().trim();
const toISO = (v) => { const t = Date.parse(text(v)); return Number.isNaN(t) ? null : new Date(t).toISOString(); };
const clip = (s, n = 220) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);

async function get(url, ms = 20000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': 'MISTROVA-alerts/1.0' } });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return await res.text();
  } finally { clearTimeout(timer); }
}

function levelFrom(severity = '', urgency = '') {
  const s = severity.toLowerCase();
  if (s === 'extreme' || s === 'severe') return 'critical';
  if (s === 'moderate' || urgency.toLowerCase() === 'immediate') return 'warning';
  return 'info';
}

async function officialAlerts() {
  const rss = xml.parse(await get(RSS_URL));
  const items = asArray(rss?.rss?.channel?.item).slice(0, MAX_ITEMS);
  const out = [];

  for (const item of items) {
    const link = text(item.link);
    const rssText = `${text(item.title)} ${text(item.description)}`;
    let cap = null;
    if (link) {
      try { cap = xml.parse(await get(link))?.alert ?? null; } catch (e) { console.warn('CAP fetch failed:', link, e.message); }
    }

    if (cap) {
      const infos = asArray(cap.info);
      const info = infos.find(i => /^en/i.test(text(i.language))) || infos[0];
      if (!info) continue;
      const areas = asArray(info.area).map(a => text(a.areaDesc)).join(', ');
      const blob = `${areas} ${text(info.headline)} ${text(info.description)}`;
      if (!DISTRICT.test(blob)) continue;
      out.push({
        id: text(cap.identifier) || link,
        source: 'official',
        level: levelFrom(text(info.severity), text(info.urgency)),
        category: (text(info.event) || 'Alert').toUpperCase().slice(0, 24),
        title: text(info.headline) || text(info.event) || text(item.title),
        detail: clip(text(info.description) || text(info.instruction)),
        area: areas,
        issued: toISO(cap.sent) || toISO(item.pubDate),
        expires: toISO(info.expires),
        author: text(info.senderName) || text(item.author),
        link
      });
    } else if (DISTRICT.test(rssText)) {
      out.push({
        id: link || text(item.guid) || text(item.title),
        source: 'official', level: 'warning', category: 'ALERT',
        title: text(item.title), detail: clip(text(item.description)),
        issued: toISO(item.pubDate), expires: null, author: text(item.author), link
      });
    }
  }
  return out;
}

async function readJSON(url, fallback) {
  try { return JSON.parse(await readFile(url, 'utf8')); } catch { return fallback; }
}

const now = Date.now();
const live = (a) => !a.expires || Date.parse(a.expires) > now;
const previous = await readJSON(OUT, { alerts: [] });
const local = (await readJSON(LOCAL, { alerts: [] })).alerts.map(a => ({ ...a, source: 'local' }));

let official;
let officialOk = true;
try {
  official = await officialAlerts();
} catch (e) {
  // Feed unreachable: keep the last official alerts that haven't expired
  officialOk = false;
  console.warn('SACHET feed unavailable, keeping previous official alerts:', e.message);
  official = previous.alerts.filter(a => a.source === 'official');
}

const seen = new Set();
const alerts = [...official, ...local].filter(live).filter(a => !seen.has(a.id) && seen.add(a.id));

// Only rewrite when something changed, so the scheduled job doesn't commit every run
const unchanged = JSON.stringify(previous.alerts) === JSON.stringify(alerts)
  && previous.officialFeed === (officialOk ? 'ok' : 'unavailable');
if (unchanged) {
  console.log(`No change (${alerts.length} active alert(s)).`);
  process.exit(0);
}
await writeFile(OUT, JSON.stringify({
  updated: new Date().toISOString(),
  officialFeed: officialOk ? 'ok' : 'unavailable',
  alerts
}, null, 2) + '\n');
console.log(`Wrote ${alerts.length} alert(s): ${official.filter(live).length} official, ${local.filter(live).length} local.`);
