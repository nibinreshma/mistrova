# MISTROVA — Live data (SOS advisories, weather, traffic)

The SOS panel in Live Pulse reads `data/alerts.json` every 10 minutes.
That file is built by `scripts/update-alerts.mjs` from two sources:

| Source | What | Who updates it |
|---|---|---|
| **Official** | NDMA SACHET Kerala alert feed (IMD / KSDMA rain, landslide, flood warnings), filtered to Wayanad | Automatic |
| **Local** | `data/local-alerts.json` — road curfews, trek closures, events | Your team |

Expired alerts disappear on their own. If the official feed is down, the last
official alerts are kept and the page still works.

## Setup (GitHub Pages, free)

1. Put this folder in a GitHub repository and push.
2. **Settings → Pages**: deploy from the `main` branch, root folder.
3. **Settings → Actions → General → Workflow permissions**: choose *Read and write*.
4. **Actions** tab → *Update live data* → *Run workflow* once to test.

After that it runs every 15 minutes, and again whenever `data/local-alerts.json` changes.
Any other host works too, as long as something runs `npm run update-alerts` on a schedule
and the page and `data/` folder are served from the same site.

## Adding a local alert

Edit `data/local-alerts.json` (you can do it in the GitHub website editor):

```json
{
  "id": "local-unique-name",
  "level": "warning",
  "category": "TREKKING",
  "title": "Short headline",
  "detail": "One or two sentences.",
  "issued": "2026-11-11T08:00:00+05:30",
  "expires": "2026-11-15T18:00:00+05:30",
  "author": "MISTROVA desk"
}
```

`level` is `critical` (red), `warning` (amber) or `info` (blue). Use `"expires": null` for standing advisories.

## Notes
- Opening `index.html` straight from your computer shows the built-in sample advisories;
  live loading needs the site to be served (GitHub Pages, or `npx serve` locally).
- "Share my location" needs HTTPS (GitHub Pages provides it) and the visitor's permission.

# Live weather

The Weather card loads current conditions for Vythiri, Kalpetta, Sulthan Bathery,
Mananthavady and Meppadi from **Open-Meteo** (free, no API key, no server needed)
every 15 minutes. It works even when `index.html` is opened from your computer.

- Temperature, humidity, wind and condition come straight from Open-Meteo.
- Rain probability and visibility are taken from the current hour's forecast.
- "Mist Density" is estimated from visibility (10 km+ = 0%, near-zero visibility = 100%).
- If Open-Meteo can't be reached, the card keeps showing the built-in sample values.
- Town coordinates live in the `TOWNS` list inside `initLiveWeather` in `index.html`.
- Open-Meteo's free tier is for non-commercial use; if MISTROVA becomes a commercial
  site, check their terms and API plans.

# Live traffic (TomTom)

The Traffic card shows the Thamarassery Churam (NH 766) in both directions:
trip time, delay compared with free-flowing traffic, average speed, where the
slow stretches are (coloured on the route drawing), and incidents such as
accidents, closures and road works.

`scripts/update-traffic.mjs` asks TomTom every 15 minutes and writes `data/traffic.json`.
Your API key stays in GitHub's secret storage and is never in the page.

## Setup

1. Sign in at **developer.tomtom.com** → *Dashboard* → *API Keys* and copy your key
   (create one if the list is empty).
2. In your GitHub repository: **Settings → Secrets and variables → Actions →
   New repository secret**. Name: `TOMTOM_API_KEY`, value: your key.
3. **Actions** tab → *Update live data* → *Run workflow*. Within a minute the
   Traffic card shows "Live • TomTom".

Don't paste the key into `index.html`, chats or commits — anyone could reuse it.

## Usage and cost

Each run makes 2 route requests (up and down the Churam) and, every 30 minutes,
1 incident request: roughly 5,800 routing and 1,500 incident requests a month,
inside TomTom's free monthly allowance at the time of writing (20,000 routing,
2,500 incident details — see docs.tomtom.com/pricing).

## Adjusting

- Route ends, landmark names used in notes ("near Lakkidi viewpoint") and the
  incident search area are at the top of `scripts/update-traffic.mjs`.
- If TomTom can't be reached, the last reading stays up, labelled "Last reading".
- Until the first successful run, the card shows its built-in sample numbers.
