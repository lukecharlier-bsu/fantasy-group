"""One-time (idempotent) scrape of historical NFL player stat lines from
ESPN's public NFL API, joined to the NFL.com fantasy league CSVs we already
have. Writes files that mirror the shape of scrapeESPN.py's stats CSVs:
    output/<nflLeagueID>-history-stats/<year>/<week>.csv

ESPN's public NFL API has no auth; the fantasy-league rule about not touching
output/7527965-history-{standings,draft,teamgamecenter} still applies — this
only writes to a NEW sibling folder derived from ESPN's NFL data joined to
the untouched fantasy CSVs.

Run:
    python3 scrapeHistoricalNFLStats.py              # 2019-2025 all weeks
    python3 scrapeHistoricalNFLStats.py 2023         # only 2023
    python3 scrapeHistoricalNFLStats.py 2023 5       # only 2023 week 5
"""

import csv
import os
import sys
import time
from collections import defaultdict

import requests

from constants import leagueID as nflLeagueID
from buildDashboardData import parse_gc_player, _norm_last

HIST_STATS_DIR = os.path.join("output", f"{nflLeagueID}-history-stats")
FANTASY_GAMES_DIR = os.path.join("output", f"{nflLeagueID}-history-teamgamecenter")

STAT_FIELDS = ["rushAtt", "rushYds", "rushTds",
               "rec", "recYds", "recTds", "tgts",
               "passAtt", "passCmp", "passYds", "passTds", "ints"]

SCOREBOARD = "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard"
SUMMARY = "https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary"

session = requests.Session()


def _get(url, **params):
    for attempt in range(4):
        try:
            r = session.get(url, params=params, timeout=20)
            if r.status_code == 429:
                time.sleep(2 ** attempt)
                continue
            r.raise_for_status()
            return r.json()
        except Exception as exc:
            if attempt == 3:
                raise
            time.sleep(1 + attempt)


def _parse_stat(raw):
    """ESPN stat values come as strings like '12', '0', '18/33' (C/ATT)."""
    try:
        return float(raw)
    except (TypeError, ValueError):
        return 0.0


def _split_catt(raw):
    """'18/33' -> (18.0, 33.0). Falls back to (0, 0)."""
    if not raw or "/" not in str(raw):
        return 0.0, 0.0
    parts = str(raw).split("/", 1)
    try:
        return float(parts[0]), float(parts[1])
    except ValueError:
        return 0.0, 0.0


def week_game_ids(year, week):
    data = _get(SCOREBOARD, dates=year, seasontype=2, week=week)
    return [e["id"] for e in data.get("events", [])]


def pull_week_stats(year, week):
    """Return dict {(fi, last, team_abbr): {STAT_FIELDS..., _name}} aggregating
    all games in the week. Team abbreviation disambiguates players with the
    same (fi, last) like Bijan vs Brian Robinson."""
    out = {}
    gids = week_game_ids(year, week)
    for gid in gids:
        try:
            bs = _get(SUMMARY, event=gid)
        except Exception as exc:
            print(f"    skip game {gid}: {exc}")
            continue
        for team in bs.get("boxscore", {}).get("players", []):
            team_abbr = (team.get("team", {}).get("abbreviation") or "").upper()
            for group in team.get("statistics", []):
                cat = group.get("name")
                if cat not in ("passing", "rushing", "receiving"):
                    continue
                labels = group.get("labels", [])
                idx = {label: i for i, label in enumerate(labels)}
                for a in group.get("athletes", []):
                    name = a.get("athlete", {}).get("displayName", "")
                    parts = name.split()
                    if len(parts) < 2:
                        continue
                    fi = parts[0][:1].upper()
                    last = _norm_last(parts[1:])
                    key = (fi, last, team_abbr)
                    stat_vals = a.get("stats", [])
                    rec = out.setdefault(key, {k: 0.0 for k in STAT_FIELDS})
                    rec["_name"] = name
                    if cat == "passing":
                        cmp, att = _split_catt(stat_vals[idx["C/ATT"]] if "C/ATT" in idx else "")
                        rec["passCmp"] += cmp
                        rec["passAtt"] += att
                        if "YDS" in idx:
                            rec["passYds"] += _parse_stat(stat_vals[idx["YDS"]])
                        if "TD" in idx:
                            rec["passTds"] += _parse_stat(stat_vals[idx["TD"]])
                        if "INT" in idx:
                            rec["ints"] += _parse_stat(stat_vals[idx["INT"]])
                    elif cat == "rushing":
                        if "CAR" in idx:
                            rec["rushAtt"] += _parse_stat(stat_vals[idx["CAR"]])
                        if "YDS" in idx:
                            rec["rushYds"] += _parse_stat(stat_vals[idx["YDS"]])
                        if "TD" in idx:
                            rec["rushTds"] += _parse_stat(stat_vals[idx["TD"]])
                    elif cat == "receiving":
                        if "REC" in idx:
                            rec["rec"] += _parse_stat(stat_vals[idx["REC"]])
                        if "YDS" in idx:
                            rec["recYds"] += _parse_stat(stat_vals[idx["YDS"]])
                        if "TD" in idx:
                            rec["recTds"] += _parse_stat(stat_vals[idx["TD"]])
                        if "TGTS" in idx:
                            rec["tgts"] += _parse_stat(stat_vals[idx["TGTS"]])
        time.sleep(0.15)  # be nice
    return out


def join_week(year, week):
    fantasy_csv = os.path.join(FANTASY_GAMES_DIR, str(year), f"{week}.csv")
    if not os.path.isfile(fantasy_csv):
        return 0, 0  # no fantasy data for this week
    nfl_stats = pull_week_stats(year, week)
    # Also build a (fi, last) index for fallback when the team doesn't match
    by_fi_last = {}
    for (fi, last, team_abbr), rec in nfl_stats.items():
        by_fi_last.setdefault((fi, last), []).append((team_abbr, rec))
    out_dir = os.path.join(HIST_STATS_DIR, str(year))
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, f"{week}.csv")
    # FullName column lets buildDashboardData's resolution map disambiguate
    # Bijan vs Brian Robinson (same fi/last, different NFL team).
    header = ["Owner", "Player", "FullName", "Position", "Slot", "Points"] + STAT_FIELDS
    matched = 0
    total = 0
    with open(fantasy_csv, newline="") as src, open(out_path, "w", newline="") as dst:
        reader = csv.reader(src)
        header_row = next(reader, None)
        if not header_row:
            return 0, 0
        slot_cols = []
        i = 0
        while i < len(header_row):
            h = header_row[i]
            if h in {"Owner", "Rank", "Total", "Opponent", "Opponent Total", "Points"}:
                i += 1
                continue
            if i + 1 < len(header_row) and header_row[i + 1] == "Points":
                slot_cols.append((h, i, i + 1))
                i += 2
            else:
                i += 1
        w = csv.writer(dst)
        w.writerow(header)
        for row in reader:
            if not row or len(row) < 2:
                continue
            owner = (row[0] or "").strip()
            for slot, ni, pi in slot_cols:
                if ni >= len(row):
                    continue
                info = parse_gc_player(row[ni])
                if not info or info["pos"] in ("K", "DEF"):
                    continue
                try:
                    pts = float((row[pi] or "0").replace(",", "")) if pi < len(row) else 0.0
                except ValueError:
                    pts = 0.0
                fi = info.get("fi", "")
                last = info.get("last", "")
                team = (info.get("team") or "").upper()
                # Try (fi, last, team) first — unambiguous
                stats = nfl_stats.get((fi, last, team)) if team else None
                full_name = ""
                if stats:
                    full_name = stats.get("_name", "")
                else:
                    # Fallback: unique (fi, last) match → use it but keep full name
                    candidates = by_fi_last.get((fi, last), [])
                    if len(candidates) == 1:
                        stats = candidates[0][1]
                        full_name = stats.get("_name", "")
                stat_row = [stats.get(k, 0) if stats else 0 for k in STAT_FIELDS]
                total += 1
                if stats:
                    matched += 1
                w.writerow([owner, info["display"], full_name, info["pos"], slot, pts] + stat_row)
    return matched, total


def main():
    args = sys.argv[1:]
    years = range(2019, 2026)
    only_week = None
    if args:
        years = [int(args[0])]
        if len(args) > 1:
            only_week = int(args[1])
    for year in years:
        year_dir = os.path.join(FANTASY_GAMES_DIR, str(year))
        if not os.path.isdir(year_dir):
            print(f"[{year}] no fantasy data; skip")
            continue
        weeks = sorted(int(f[:-4]) for f in os.listdir(year_dir) if f.endswith(".csv"))
        if only_week is not None:
            weeks = [w for w in weeks if w == only_week]
        print(f"[{year}] processing weeks {weeks}")
        for week in weeks:
            m, t = join_week(year, week)
            rate = f"{100*m/t:.0f}%" if t else "n/a"
            print(f"  wk{week}: matched {m}/{t} players ({rate})")


if __name__ == "__main__":
    main()
