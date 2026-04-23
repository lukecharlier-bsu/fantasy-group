# Scraping NFL.com Fantasy History

## What does this project do?

1. Scrapes entire fantasy league history from NFL.com. It exports all standings and games as CSV files in `./output`
2. Aggregates standings into a single CSV file like [this](https://ibb.co/QvYprGD).
3. Iterate through all games to find biggest blowouts and narrowest victories.
4. Builds an interactive static dashboard (Chart.js) of league history under `./docs/`.

## How to run this:

1. `git clone https://github.com/PeteTheHeat/FF-Scraping`
2. In `constants.py`, update with your league ID and start/end years.
3. In `cookieString.py`, update cookie string with an active NFL.com cookie. You can find this by inspecting a request in chrome dev tools ([screenshot](https://ibb.co/7bk4fmN)).
4. `python scrapeStandings.py` will scrape all standings. `python aggregateStandings.py` will aggregate into 1 CSV.
5. `python scrapeGamecenter.py` will scrape all games. `python analyzeGamecenter.py` will find biggest blowouts and narrowest margins of victory.

## Interactive dashboard

After scraping, build a static dashboard your league can browse from any web host:

1. `python3 buildDashboardData.py <leagueID>` — reads `./output/<leagueID>-history-standings/` and `./output/<leagueID>-history-teamgamecenter/` and writes `docs/data.json`. If you omit the league ID it falls back to `constants.leagueID`.
2. Preview locally: `python3 -m http.server 8765 --directory docs` then open <http://localhost:8765>. (Opening `index.html` directly via `file://` will not work — the page needs to `fetch()` `data.json`.)
3. To share with friends: commit `docs/` (including the generated `data.json`) and enable **GitHub Pages** for the repo (Settings → Pages → Deploy from branch → `main` / `/docs`). Your league will be live at `https://<your-user>.github.io/<repo>/`.

The dashboard has four tabs:
- **Owner Career Stats** — sortable cards, points-for / win-% bar charts, and a per-owner season-by-season breakdown.
- **Seasons & Champions** — champion/sacko table plus per-year final standings and weekly matchups.
- **Head-to-Head** — all-time win-% matrix and a head-to-head log between any two owners.
- **Weekly Trends** — top/bottom weekly scores, biggest blowouts, closest games, and a per-season weekly scoring chart.

## Known Issues:

1. If multiple team managers have the same name, their results will be aggregated together.
2. The script assumes top half of the league makes playoffs.

Inspiration reddit thread [here](https://www.reddit.com/r/fantasyfootball/comments/jll2xs/i_wrote_a_script_to_scrape_nflcom_fantasy_league/).
