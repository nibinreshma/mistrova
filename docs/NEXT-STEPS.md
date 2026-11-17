# MISTROVA — where we left off (15 Nov 2026)

## Done so far
- **Homepage** (`index.html`) — teal/glass design. Agriculture section: four tiles, then
  "Explore by topic" (7 cards, no numbering), then View All → `agriculture/all-agri.html`.
- **Destinations** — `explore/all-explore.html` + 24 destination pages.
- **Agriculture** — `agriculture/all-agri.html` hub + 7 pages:
  tea-estates (14), coffee-spice (15), farms (40), nurseries (44), research (7),
  gi-crops (4), cooperatives (5). 129 entries in all.
- **Towns** — model page built: `towns/ambalavayal.html`.
- **Master document** — `docs/Mistrova_Master_Subpages_v4.docx`.

## Next job: finish the Towns section
Agreed scope: **the All Towns hub page + the remaining 17 town pages.**

1. **Extract what the site already knows** — `townsData` in `index.html` (id, name, region,
   elevation, image for all 18), the Essentials arrays (hospitals, police, government
   offices, worship, each tagged by town), destination areas, agriculture entries by place.
2. **Research per town** — population (2011 census), PIN, STD code, road distances,
   what the town is known for.
3. **Generate 18 pages** — extend `/home/claude/build/town_gen.py`; it already builds
   Ambalavayal from a data dict, so the rest is data.
4. ~~**Build `towns/all-towns.html`**~~ — DONE. The hub lists all 18 towns in four
   regional groups (3 main towns / ghat and rain belt / southern plateau / east and
   forest edge), each card carrying elevation, what the town is known for and its
   highlights. Built by `/home/claude/build/towns_hub.py` + `towns_hub.css`.
5. ~~**Wire**~~ — DONE. The Towns section View All button, the top nav Towns link, the
   nav dropdown View All and the mobile menu panel all open `towns/all-towns.html`.
   Homepage town cards use `townHref()`: a town with a page opens it, the rest fall back
   to the hub, so no card 404s. Still to do with each new page: add the slug to
   `TOWN_PAGES` in index.html, set `built=True` in `towns_hub.py`, update the master doc.

## Still unbuilt elsewhere (links lead nowhere)
`essentials/*.html` (5), `privacy.html`, `terms.html`, `contact.html`.

## Also outstanding
- Real photos for the galleries — placeholders say "Photo coming soon".
- 14 farms and 6 nurseries have no confirmed location.
- Town elevations on the homepage need a check (e.g. Vythiri's 1,300 m).

## Build files (not part of the site)
`/home/claude/build/` — `town_gen.py`, `town.css`, `agri_gen.py`, `agri_pages.py`,
`agri_hub.py`, `agri_engine.js`, `gen.py`, `dests.py`, `template.html`.
