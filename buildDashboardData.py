"""
Builds a single docs/data.json from the scraped CSVs for a given league.

Usage:
    python buildDashboardData.py [leagueID]

If leagueID is not supplied it falls back to constants.leagueID.
The script reads:
    ./output/<leagueID>-history-standings/<year>.csv
    ./output/<leagueID>-history-teamgamecenter/<year>/<week>.csv
and writes:
    ./docs/data.json
"""

import csv
import json
import os
import sys
from collections import defaultdict


def parse_float(value):
    if value in (None, "", "-"):
        return None
    return float(str(value).replace(",", ""))


def parse_record(value):
    wins, losses, ties = (int(x) for x in value.split("-"))
    return wins, losses, ties


def load_standings(standings_dir):
    """Return {year: [team_dict, ...]} with duplicate team rows removed."""
    seasons = {}
    for filename in sorted(os.listdir(standings_dir)):
        if not filename.endswith(".csv"):
            continue
        year = int(filename[:-4])
        seen = set()
        teams = []
        with open(os.path.join(standings_dir, filename), newline="") as f:
            reader = csv.DictReader(f)
            for row in reader:
                if not row.get("ManagerName"):
                    continue
                key = (row["ManagerName"], row["TeamName"])
                if key in seen:
                    continue
                seen.add(key)
                wins, losses, ties = parse_record(row["Record"])
                teams.append({
                    "manager": row["ManagerName"],
                    "team": row["TeamName"],
                    "regularSeasonRank": int(row["RegularSeasonRank"]),
                    "playoffRank": int(row["PlayoffRank"]),
                    "wins": wins,
                    "losses": losses,
                    "ties": ties,
                    "pointsFor": parse_float(row["PointsFor"]),
                    "pointsAgainst": parse_float(row["PointsAgainst"]),
                    "moves": int(row["Moves"] or 0),
                    "trades": int(row["Trades"] or 0),
                    "draftPosition": int(row["DraftPosition"] or 0),
                })
        seasons[year] = teams
    return seasons


def load_weekly(gamecenter_dir):
    """Return {year: [{week, owner, total, opponent, opponentTotal}, ...]}."""
    weekly = {}
    for year_name in sorted(os.listdir(gamecenter_dir)):
        year_path = os.path.join(gamecenter_dir, year_name)
        if not os.path.isdir(year_path):
            continue
        year = int(year_name)
        rows = []
        for filename in sorted(os.listdir(year_path), key=lambda n: int(n[:-4]) if n.endswith(".csv") else 99):
            if not filename.endswith(".csv"):
                continue
            week = int(filename[:-4])
            with open(os.path.join(year_path, filename), newline="") as f:
                reader = csv.DictReader(f)
                for row in reader:
                    if not row.get("Owner"):
                        continue
                    total = parse_float(row.get("Total"))
                    opp_total = parse_float(row.get("Opponent Total"))
                    if total is None or opp_total is None:
                        continue
                    rows.append({
                        "week": week,
                        "owner": row["Owner"],
                        "total": total,
                        "opponent": row["Opponent"],
                        "opponentTotal": opp_total,
                    })
        weekly[year] = rows
    return weekly


def build_seasons(standings, weekly):
    """Combine standings + weekly games into per-season records."""
    seasons = []
    for year in sorted(standings.keys()):
        teams = standings[year]
        num_teams = len(teams)
        last_rank = max(t["playoffRank"] for t in teams)
        playoff_cutoff = num_teams // 2  # top half makes the playoffs
        # If every team has playoffRank == 0 the playoffs haven't been played
        # yet (season still in progress) — don't crown a champion, don't call
        # everyone the sacko, and don't flag anyone as having made it.
        in_progress = last_rank == 0

        team_data = []
        champion = None
        sacko = None
        for t in teams:
            if in_progress:
                made_playoffs = False
                is_champion = False
                is_sacko = False
            else:
                made_playoffs = t["playoffRank"] <= playoff_cutoff
                is_champion = t["playoffRank"] == 1
                is_sacko = t["playoffRank"] == last_rank
                if is_champion:
                    champion = t["manager"]
                if is_sacko:
                    sacko = t["manager"]
            team_data.append({**t, "madePlayoffs": made_playoffs,
                              "champion": is_champion, "sacko": is_sacko})

        # Pair up weekly rows into matchups (one row per side -> dedupe by sorted owner pair)
        matchups_by_week = defaultdict(list)
        seen_pair = set()
        for row in weekly.get(year, []):
            key = (row["week"], tuple(sorted([row["owner"], row["opponent"]])))
            if key in seen_pair:
                continue
            seen_pair.add(key)
            matchups_by_week[row["week"]].append({
                "home": row["owner"],
                "homePts": row["total"],
                "away": row["opponent"],
                "awayPts": row["opponentTotal"],
            })

        weeks_sorted = sorted(matchups_by_week.keys())
        weeks = [{"week": w, "matchups": matchups_by_week[w]} for w in weeks_sorted]

        seasons.append({
            "year": year,
            "numTeams": num_teams,
            "champion": champion,
            "sacko": sacko,
            "playoffCutoff": playoff_cutoff,
            "inProgress": in_progress,
            "standings": team_data,
            "weeks": weeks,
        })
    return seasons


def build_owner_stats(seasons):
    owners = {}
    for season in seasons:
        for t in season["standings"]:
            o = owners.setdefault(t["manager"], {
                "name": t["manager"],
                "seasons": 0,
                "wins": 0, "losses": 0, "ties": 0,
                "pointsFor": 0.0, "pointsAgainst": 0.0,
                "moves": 0, "trades": 0,
                "championships": 0, "playoffs": 0, "sackos": 0,
                "finishes": [],          # list of (year, playoffRank, numTeams)
                "regSeasonFinishes": [], # list of (year, regSeasonRank, numTeams)
                "seasonsPlayed": [],     # list of years
                "teamNames": [],
                "draftPositions": [],
            })
            o["seasons"] += 1
            o["wins"] += t["wins"]
            o["losses"] += t["losses"]
            o["ties"] += t["ties"]
            o["pointsFor"] += t["pointsFor"] or 0.0
            o["pointsAgainst"] += t["pointsAgainst"] or 0.0
            o["moves"] += t["moves"]
            o["trades"] += t["trades"]
            if t["champion"]:
                o["championships"] += 1
            if t["madePlayoffs"]:
                o["playoffs"] += 1
            if t["sacko"]:
                o["sackos"] += 1
            o["finishes"].append({"year": season["year"], "rank": t["playoffRank"],
                                   "numTeams": season["numTeams"]})
            o["regSeasonFinishes"].append({"year": season["year"], "rank": t["regularSeasonRank"]})
            o["seasonsPlayed"].append(season["year"])
            o["teamNames"].append({"year": season["year"], "team": t["team"]})
            o["draftPositions"].append({"year": season["year"], "pick": t["draftPosition"]})

    # Derived fields
    for o in owners.values():
        games = o["wins"] + o["losses"] + o["ties"]
        o["games"] = games
        o["winPct"] = ((o["wins"] + 0.5 * o["ties"]) / games) if games else 0.0
        o["avgPointsPerGame"] = (o["pointsFor"] / games) if games else 0.0
        o["avgPointsAgainstPerGame"] = (o["pointsAgainst"] / games) if games else 0.0
        finishes = o["finishes"]
        # Rank 0 means the season is still in progress (no final rank yet) —
        # don't let it drag down averages or masquerade as the "best finish".
        completed = [f for f in finishes if f["rank"] > 0]
        o["avgFinish"] = (sum(f["rank"] for f in completed) / len(completed)) if completed else 0
        o["bestFinish"] = min((f["rank"] for f in completed), default=None)
        o["worstFinish"] = max((f["rank"] for f in completed), default=None)
        # Round floats
        o["pointsFor"] = round(o["pointsFor"], 2)
        o["pointsAgainst"] = round(o["pointsAgainst"], 2)
        o["winPct"] = round(o["winPct"], 4)
        o["avgPointsPerGame"] = round(o["avgPointsPerGame"], 2)
        o["avgPointsAgainstPerGame"] = round(o["avgPointsAgainstPerGame"], 2)
        o["avgFinish"] = round(o["avgFinish"], 2)
    return list(owners.values())


def build_head_to_head(seasons):
    """h2h[a][b] = {wins, losses, ties, pointsFor, pointsAgainst, games}"""
    h2h = defaultdict(lambda: defaultdict(lambda: {
        "wins": 0, "losses": 0, "ties": 0,
        "pointsFor": 0.0, "pointsAgainst": 0.0, "games": 0,
    }))
    for season in seasons:
        for week in season["weeks"]:
            for m in week["matchups"]:
                a, b = m["home"], m["away"]
                pa, pb = m["homePts"], m["awayPts"]
                rec_a = h2h[a][b]
                rec_b = h2h[b][a]
                rec_a["games"] += 1
                rec_b["games"] += 1
                rec_a["pointsFor"] += pa
                rec_a["pointsAgainst"] += pb
                rec_b["pointsFor"] += pb
                rec_b["pointsAgainst"] += pa
                if pa > pb:
                    rec_a["wins"] += 1
                    rec_b["losses"] += 1
                elif pb > pa:
                    rec_b["wins"] += 1
                    rec_a["losses"] += 1
                else:
                    rec_a["ties"] += 1
                    rec_b["ties"] += 1

    # Round and convert defaultdict -> dict
    out = {}
    for a, opps in h2h.items():
        out[a] = {}
        for b, rec in opps.items():
            out[a][b] = {
                **rec,
                "pointsFor": round(rec["pointsFor"], 2),
                "pointsAgainst": round(rec["pointsAgainst"], 2),
            }
    return out


def build_biggest_upsets(seasons, n=20):
    """For each completed matchup, measure how heavily the loser was favored
    coming in (pre-matchup PPG + pre-matchup win %, both season-to-date). The
    bigger that pre-game gap, the bigger the upset.
    """
    out = []
    for s in seasons:
        year = s["year"]
        pre = {t["manager"]: {"wins": 0, "losses": 0, "ties": 0,
                              "pf": 0.0, "games": 0}
               for t in s["standings"]}
        for week in s["weeks"]:
            w_num = week["week"]
            # Score the week's matchups against pre-week running stats first,
            # then roll this week's results into pre. Only count games played
            # after week 6, so pre-game records have enough signal.
            for m in week["matchups"]:
                h, hp, a, ap = m["home"], m["homePts"], m["away"], m["awayPts"]
                if hp == ap or h not in pre or a not in pre:
                    continue
                if w_num <= 6:
                    continue
                winner, loser = (h, a) if hp > ap else (a, h)
                winner_pts = max(hp, ap)
                loser_pts = min(hp, ap)
                wp, lp = pre[winner], pre[loser]
                if wp["games"] == 0 or lp["games"] == 0:
                    continue  # no prior data to compare
                w_wpct = (wp["wins"] + 0.5 * wp["ties"]) / wp["games"]
                l_wpct = (lp["wins"] + 0.5 * lp["ties"]) / lp["games"]
                w_ppg = wp["pf"] / wp["games"]
                l_ppg = lp["pf"] / lp["games"]
                ppg_diff = l_ppg - w_ppg
                wpct_diff = l_wpct - w_wpct
                upset = ppg_diff + 100 * wpct_diff
                if upset <= 0:
                    continue  # loser wasn't actually favored
                out.append({
                    "year": year, "week": w_num,
                    "winner": winner, "loser": loser,
                    "winnerPts": round(winner_pts, 2),
                    "loserPts": round(loser_pts, 2),
                    "winnerPreRecord": f'{wp["wins"]}-{wp["losses"]}'
                        + (f'-{wp["ties"]}' if wp["ties"] else ''),
                    "loserPreRecord": f'{lp["wins"]}-{lp["losses"]}'
                        + (f'-{lp["ties"]}' if lp["ties"] else ''),
                    "winnerPrePPG": round(w_ppg, 2),
                    "loserPrePPG": round(l_ppg, 2),
                    "ppgDiff": round(ppg_diff, 2),
                    "winPctDiff": round(wpct_diff, 3),
                    "upsetScore": round(upset, 2),
                })
            for m in week["matchups"]:
                h, hp, a, ap = m["home"], m["homePts"], m["away"], m["awayPts"]
                if h not in pre or a not in pre:
                    continue
                pre[h]["pf"] += hp
                pre[a]["pf"] += ap
                pre[h]["games"] += 1
                pre[a]["games"] += 1
                if hp > ap:
                    pre[h]["wins"] += 1
                    pre[a]["losses"] += 1
                elif ap > hp:
                    pre[a]["wins"] += 1
                    pre[h]["losses"] += 1
                else:
                    pre[h]["ties"] += 1
                    pre[a]["ties"] += 1
    out.sort(key=lambda g: -g["upsetScore"])
    return out[:n]


def build_weekly_extremes(seasons, n=10):
    """Top N highest and lowest scoring weeks."""
    all_scores = []
    for season in seasons:
        for week in season["weeks"]:
            for m in week["matchups"]:
                all_scores.append({
                    "year": season["year"], "week": week["week"],
                    "owner": m["home"], "points": m["homePts"],
                    "opponent": m["away"], "opponentPoints": m["awayPts"],
                })
                all_scores.append({
                    "year": season["year"], "week": week["week"],
                    "owner": m["away"], "points": m["awayPts"],
                    "opponent": m["home"], "opponentPoints": m["homePts"],
                })
    all_scores.sort(key=lambda r: r["points"], reverse=True)
    highs = all_scores[:n]
    lows = sorted(all_scores, key=lambda r: r["points"])[:n]

    # Biggest blowouts and narrowest wins
    margins = []
    for season in seasons:
        for week in season["weeks"]:
            for m in week["matchups"]:
                diff = m["homePts"] - m["awayPts"]
                if diff == 0:
                    continue
                winner = m["home"] if diff > 0 else m["away"]
                loser = m["away"] if diff > 0 else m["home"]
                wpts = m["homePts"] if diff > 0 else m["awayPts"]
                lpts = m["awayPts"] if diff > 0 else m["homePts"]
                margins.append({
                    "year": season["year"], "week": week["week"],
                    "winner": winner, "loser": loser,
                    "winnerPoints": wpts, "loserPoints": lpts,
                    "margin": round(abs(diff), 2),
                })
    margins.sort(key=lambda r: r["margin"], reverse=True)
    blowouts = margins[:n]
    nail_biters = sorted(margins, key=lambda r: r["margin"])[:n]
    return highs, lows, blowouts, nail_biters


_PLAYER_RE = __import__("re").compile(r"^(.+?)\s+(QB|RB|WR|TE|K)\s+-\s+([A-Z]{2,3})")
_NAME_SUFFIXES = {"jr", "sr", "ii", "iii", "iv"}


def _strip_suffix_tokens(parts):
    """Return name tokens with trailing Jr/Sr/II/III/IV removed."""
    return [p for p in parts if p.lower().rstrip(".") not in _NAME_SUFFIXES]


def _norm_last(parts):
    """Drop common suffixes from last-name token list, lowercase, strip dots."""
    cleaned = _strip_suffix_tokens(parts)
    return "".join(cleaned).lower().replace(".", "")


def _display_name(name):
    """Strip name suffixes (Jr/Sr/III) from a display name so historical
    'J. Cook' and current 'J. Cook III' render as the same label."""
    parts = name.split()
    kept = _strip_suffix_tokens(parts)
    return " ".join(kept) if kept else name


def parse_gc_player(text):
    """Parse a gamecenter player cell into structured fields, or None if empty/bye.

    The key intentionally OMITS the NFL team so a player who switches teams
    (e.g. A. Jones GB -> MIN) still aggregates as one entity. The current team
    is kept on the record and we collect every team the player has appeared on.
    DEF entries DO key on team (mascot), since a defense IS the team.
    """
    text = (text or "").strip()
    if not text or text == "-":
        return None
    if text.endswith("DEF") or " DEF " in text:
        name = text.split(" DEF")[0].strip()
        return {"display": f"{name} DEF", "key": f"DEF||{name.lower()}",
                "pos": "DEF", "team": "", "last": name.lower(), "fi": ""}
    m = _PLAYER_RE.match(text)
    if not m:
        return None
    name, pos, team = m.group(1).strip(), m.group(2), m.group(3)
    parts = name.split()
    if len(parts) >= 2:
        fi = parts[0].rstrip(".").upper()[:1]
        last = _norm_last(parts[1:])
    else:
        fi, last = "", _norm_last(parts)
    return {"display": _display_name(name), "key": f"{pos}|{last}|{fi}",
            "pos": pos, "team": team, "last": last, "fi": fi}


def draft_match_key(player_name, position, nfl_team):
    """Build the same key used by parse_gc_player from a draft pick.
    Team is omitted to allow players-changed-teams to merge."""
    if position == "DEF":
        return f"DEF||{player_name.lower()}"
    parts = player_name.split()
    if len(parts) >= 2:
        fi = parts[0][:1].upper()
        last = _norm_last(parts[1:])
    else:
        fi, last = "", _norm_last(parts)
    return f"{position}|{last}|{fi}"


def load_player_scoring(gamecenter_dirs):
    """Aggregate player scoring across all weeks/years from gamecenter CSVs.

    gamecenter_dirs: a path, or a list of paths — each a <leagueID>-history-
    teamgamecenter directory. Years are expected to be non-overlapping across
    the given dirs (e.g. NFL ≤2025, ESPN ≥2026).

    Returns:
        per_year: {year: {key: {display, pos, team, totalPoints, starts,
                                benchApps, weekHigh, weekHighInfo, owners}}}
        career: same shape but aggregated over all years
    """
    if isinstance(gamecenter_dirs, str):
        gamecenter_dirs = [gamecenter_dirs]
    year_paths = {}
    for d in gamecenter_dirs:
        if not os.path.isdir(d):
            continue
        for year_name in sorted(os.listdir(d)):
            yp = os.path.join(d, year_name)
            if os.path.isdir(yp):
                year_paths[year_name] = yp
    BENCH_SLOTS = {"BN", "RES"}
    per_year = {}
    career = {}
    # Ownership-aware per-player stats, for the Franchise Leaders tab.
    #   by_owner[owner][player_key] = {display, pos, startPts, benchPts,
    #                                  starts, benchApps, seasons, bestWeek}
    by_owner = {}

    for year_name in sorted(year_paths):
        year_path = year_paths[year_name]
        year = int(year_name)
        season_players = {}
        for filename in sorted(os.listdir(year_path),
                               key=lambda n: int(n[:-4]) if n.endswith(".csv") else 999):
            if not filename.endswith(".csv"):
                continue
            week = int(filename[:-4])
            with open(os.path.join(year_path, filename), newline="") as f:
                reader = csv.reader(f)
                header = next(reader, None)
                if not header:
                    continue
                # Pair each non-Owner/Rank/Total/Opponent column with the
                # following Points column so we can iterate (slot, name, pts)
                slot_indexes = []  # list of (slot_label, name_idx, points_idx)
                opp_idx = header.index("Opponent") if "Opponent" in header else -1
                i = 0
                while i < len(header):
                    h = header[i]
                    if h in {"Owner", "Rank", "Total", "Opponent", "Opponent Total"}:
                        i += 1
                        continue
                    if h == "Points":
                        i += 1
                        continue
                    # h is a slot label (QB, RB, WR, TE, K, DEF, W/R, BN, RES)
                    if i + 1 < len(header) and header[i + 1] == "Points":
                        slot_indexes.append((h, i, i + 1))
                        i += 2
                    else:
                        i += 1
                for row in reader:
                    if not row or len(row) < 2:
                        continue
                    owner = (row[0] or "").strip()
                    opp = (row[opp_idx] if 0 <= opp_idx < len(row) else "").strip()
                    for slot, ni, pi in slot_indexes:
                        if ni >= len(row) or pi >= len(row):
                            continue
                        info = parse_gc_player(row[ni])
                        if not info:
                            continue
                        try:
                            pts = float((row[pi] or "0").replace(",", ""))
                        except ValueError:
                            pts = 0.0
                        rec = season_players.setdefault(info["key"], {
                            "display": info["display"], "pos": info["pos"],
                            "team": info["team"], "totalPoints": 0.0,
                            "starts": 0, "benchApps": 0,
                            "weekHigh": 0.0, "weekHighInfo": None,
                            "owners": set(),
                        })
                        if slot in BENCH_SLOTS:
                            rec["benchApps"] += 1
                        else:
                            rec["totalPoints"] += pts
                            rec["starts"] += 1
                            rec["owners"].add(owner)
                            if pts > rec["weekHigh"]:
                                rec["weekHigh"] = pts
                                rec["weekHighInfo"] = {"year": year, "week": week,
                                                        "owner": owner, "points": pts}
                        # Always update display to most-recent (catches name changes)
                        rec["display"] = info["display"]
                        rec["team"] = info["team"]
                        # Per-owner split for Franchise Leaders.
                        owner_bucket = by_owner.setdefault(owner, {})
                        orec = owner_bucket.setdefault(info["key"], {
                            "display": info["display"], "pos": info["pos"],
                            "startPts": 0.0, "benchPts": 0.0,
                            "starts": 0, "benchApps": 0,
                            "seasons": set(),
                            "bestWeek": None,  # {points, year, week, opponent}
                        })
                        orec["display"] = info["display"]
                        orec["seasons"].add(year)
                        if slot in BENCH_SLOTS:
                            orec["benchPts"] += pts
                            orec["benchApps"] += 1
                        else:
                            orec["startPts"] += pts
                            orec["starts"] += 1
                            if orec["bestWeek"] is None or pts > orec["bestWeek"]["points"]:
                                orec["bestWeek"] = {"points": pts, "year": year,
                                                     "week": week, "opponent": opp}
        # Finalize season
        for k, r in season_players.items():
            r["owners"] = sorted(r["owners"])
            r["totalPoints"] = round(r["totalPoints"], 2)
            r["weekHigh"] = round(r["weekHigh"], 2)
            r["avgPerStart"] = round(r["totalPoints"] / r["starts"], 2) if r["starts"] else 0.0
            # Roll into career
            c = career.setdefault(k, {
                "display": r["display"], "pos": r["pos"], "team": r["team"],
                "totalPoints": 0.0, "starts": 0, "benchApps": 0,
                "weekHigh": 0.0, "weekHighInfo": None,
                "owners": set(), "seasons": set(),
            })
            c["display"] = r["display"]
            c["team"] = r["team"]
            c["totalPoints"] += r["totalPoints"]
            c["starts"] += r["starts"]
            c["benchApps"] += r["benchApps"]
            c["seasons"].add(year)
            c["owners"].update(r["owners"])
            if r["weekHigh"] > c["weekHigh"]:
                c["weekHigh"] = r["weekHigh"]
                c["weekHighInfo"] = r["weekHighInfo"]
        per_year[year] = season_players

    # Finalize career
    career_out = {}
    for k, c in career.items():
        career_out[k] = {
            "display": c["display"], "pos": c["pos"], "team": c["team"],
            "totalPoints": round(c["totalPoints"], 2),
            "starts": c["starts"], "benchApps": c["benchApps"],
            "weekHigh": round(c["weekHigh"], 2),
            "weekHighInfo": c["weekHighInfo"],
            "avgPerStart": round(c["totalPoints"] / c["starts"], 2) if c["starts"] else 0.0,
            "owners": sorted(c["owners"]),
            "seasons": sorted(c["seasons"]),
        }

    # Finalize per-owner records.
    by_owner_out = {}
    for owner, players in by_owner.items():
        out_players = []
        for key, r in players.items():
            start_pts = round(r["startPts"], 2)
            starts = r["starts"]
            bw = r["bestWeek"]
            if bw is not None:
                bw = {**bw, "points": round(bw["points"], 2)}
            out_players.append({
                "key": key,
                "display": r["display"],
                "pos": r["pos"],
                "startPts": start_pts,
                "benchPts": round(r["benchPts"], 2),
                "starts": starts,
                "benchApps": r["benchApps"],
                "avgPerStart": round(start_pts / starts, 2) if starts else 0.0,
                "seasons": sorted(r["seasons"]),
                "bestWeek": bw,
            })
        out_players.sort(key=lambda p: -p["startPts"])
        by_owner_out[owner] = out_players
    return per_year, career_out, by_owner_out


def enrich_with_espn_ids(players_by_owner, players_career, drafts):
    """Attach espnId to each franchise-player and career-player record by
    cross-referencing our normalized (first-initial, last) key against ESPN's
    name-to-id dict (dumped by scrapeESPN). Ambiguous matches on first-initial
    (e.g. "K. Murray" -> Kyler vs Kenneth) are resolved by looking the player
    up in the draft history, which carries full names."""
    import json as _json
    try:
        from constants import espnLeagueID
    except Exception:
        return
    pm_path = os.path.join("output", f"{espnLeagueID}-players.json")
    if not os.path.isfile(pm_path):
        return
    with open(pm_path) as f:
        name_to_id = _json.load(f).get("nameToId", {})
    # Reverse index: (fi, normalized-last) -> list of (espnId, full_name)
    rev = {}
    for name, pid in name_to_id.items():
        parts = name.split()
        if len(parts) < 2:
            continue
        fi = parts[0][:1].upper()
        last = _norm_last(parts[1:])
        rev.setdefault((fi, last), []).append((pid, name))
    # Draft-based disambiguator: our player_key -> full name from drafts
    #   (same key the scoring loader uses). Last write wins; near-duplicates
    #   collapse because draft_match_key already strips suffixes.
    key_to_drafted_name = {}
    for picks in drafts.values():
        for p in picks:
            k = draft_match_key(p["player"], p["position"], p["nflTeam"])
            key_to_drafted_name[k] = p["player"]

    def resolve(key):
        # key is "POS|last|FI" or "DEF||mascot"
        parts = key.split("|")
        if len(parts) != 3:
            return None, None
        pos, last, fi = parts
        if pos == "DEF" or not fi or not last:
            return None, None
        matches = rev.get((fi, last), [])
        if len(matches) == 1:
            return matches[0]
        if len(matches) > 1:
            # Use draft history to pick the correct candidate by exact name.
            drafted_name = key_to_drafted_name.get(key)
            if drafted_name:
                drafted_last = _norm_last(drafted_name.split()[1:])
                for pid, full in matches:
                    if full == drafted_name:
                        return pid, full
                    # Loose match: same normalized last-name tokens
                    full_last = _norm_last(full.split()[1:])
                    if drafted_last == full_last and full.split()[0] == drafted_name.split()[0]:
                        return pid, full
        return None, None

    for owner, players in players_by_owner.items():
        for p in players:
            pid, full = resolve(p["key"])
            if pid is not None:
                p["espnId"] = pid
                p["fullName"] = full
    for key, c in players_career.items():
        pid, full = resolve(key)
        if pid is not None:
            c["espnId"] = pid
            c["fullName"] = full


def compute_busts_and_risers(drafts, players_by_year, n=10):
    """For each season, match drafted players to their actual season points.
    Bust = high pick that finished low among drafted players.
    Riser = late pick that finished high.
    Returns {year: {busts: [...], risers: [...]}}.
    """
    out = {}
    for year, picks in drafts.items():
        season_stats = players_by_year.get(year, {})
        rows = []
        for p in picks:
            key = draft_match_key(p["player"], p["position"], p["nflTeam"])
            stats = season_stats.get(key)
            actual = stats["totalPoints"] if stats else 0.0
            starts = stats["starts"] if stats else 0
            rows.append({
                "year": year, "pick": p["pick"], "round": p["round"],
                "player": p["player"], "position": p["position"],
                "nflTeam": p["nflTeam"], "manager": p["manager"],
                "actualPoints": actual, "starts": starts,
                "matched": stats is not None,
            })
        # Rank by actualPoints
        ranked = sorted(rows, key=lambda r: -r["actualPoints"])
        for i, r in enumerate(ranked, start=1):
            r["actualRank"] = i
        # Reattach actualRank
        rank_by_pick = {(r["year"], r["pick"]): r["actualRank"] for r in ranked}
        for r in rows:
            r["actualRank"] = rank_by_pick[(r["year"], r["pick"])]
            r["delta"] = r["pick"] - r["actualRank"]   # positive = riser
        # Bust: matched, drafted in top half, dropped most rank slots
        top_half = max(1, len(rows) // 2)
        bust_pool = [r for r in rows if r["matched"] and r["pick"] <= top_half]
        busts = sorted(bust_pool, key=lambda r: r["delta"])[:n]
        # Riser: matched, drafted outside top quarter, jumped most rank slots
        late_pool = [r for r in rows if r["matched"] and r["pick"] > max(1, len(rows) // 4)]
        risers = sorted(late_pool, key=lambda r: -r["delta"])[:n]
        out[year] = {"busts": busts, "risers": risers}
    return out


def load_drafts(draft_dir):
    """Return {year: [pick_dict, ...]}."""
    drafts = {}
    if not os.path.isdir(draft_dir):
        return drafts
    for filename in sorted(os.listdir(draft_dir)):
        if not filename.endswith(".csv"):
            continue
        year = int(filename[:-4])
        picks = []
        with open(os.path.join(draft_dir, filename), newline="") as f:
            reader = csv.DictReader(f)
            for row in reader:
                picks.append({
                    "round": int(row["Round"]),
                    "pick": int(row["Pick"]),
                    "playerId": row["PlayerId"],
                    "player": row["Player"],
                    "position": row["Position"],
                    "nflTeam": row["NFLTeam"],
                    "fantasyTeam": row["FantasyTeam"],
                    "manager": row["ManagerName"],
                })
        drafts[year] = picks
    return drafts


def build_draft_analytics(drafts):
    """Per-owner aggregates: position counts, recurring players, avg pick by position."""
    by_owner = defaultdict(lambda: {
        "totalPicks": 0,
        "positionCounts": defaultdict(int),
        "round1Picks": [],
        "playerYears": defaultdict(list),
        "avgPickByPosition": defaultdict(list),
    })
    for year, picks in drafts.items():
        for p in picks:
            o = by_owner[p["manager"]]
            o["totalPicks"] += 1
            o["positionCounts"][p["position"]] += 1
            if p["round"] == 1:
                o["round1Picks"].append({
                    "year": year, "pick": p["pick"],
                    "player": p["player"], "position": p["position"],
                    "nflTeam": p["nflTeam"],
                })
            o["playerYears"][p["player"]].append({
                "year": year, "round": p["round"], "pick": p["pick"],
                "position": p["position"],
            })
            if p["position"]:
                o["avgPickByPosition"][p["position"]].append(p["pick"])

    out = {}
    for owner, data in by_owner.items():
        recurring = []
        for player, years in data["playerYears"].items():
            if len(years) >= 2:
                recurring.append({
                    "player": player,
                    "times": len(years),
                    "picks": sorted(years, key=lambda x: x["year"]),
                })
        recurring.sort(key=lambda r: (-r["times"], r["player"]))

        avg_by_pos = {}
        for pos, picks in data["avgPickByPosition"].items():
            if picks:
                avg_by_pos[pos] = round(sum(picks) / len(picks), 1)

        out[owner] = {
            "totalPicks": data["totalPicks"],
            "positionCounts": dict(data["positionCounts"]),
            "round1Picks": sorted(data["round1Picks"], key=lambda x: x["year"]),
            "recurringPlayers": recurring[:25],
            "avgPickByPosition": avg_by_pos,
        }
    return out


def main():
    # Accept one or more league IDs on the command line; default to the
    # NFL + ESPN pair from constants so historical and current seasons merge.
    args = sys.argv[1:]
    if args:
        league_ids = args
    else:
        try:
            from constants import leagueID, espnLeagueID
            league_ids = [leagueID, espnLeagueID]
        except Exception:
            try:
                from constants import leagueID
                league_ids = [leagueID]
            except Exception:
                print("Provide a leagueID as the first argument.")
                sys.exit(1)

    standings_dirs = [os.path.join("output", f"{lid}-history-standings") for lid in league_ids]
    gamecenter_dirs = [os.path.join("output", f"{lid}-history-teamgamecenter") for lid in league_ids]
    draft_dirs = [os.path.join("output", f"{lid}-history-draft") for lid in league_ids]
    present = [d for d in standings_dirs + gamecenter_dirs if os.path.isdir(d)]
    if not present:
        print(f"Could not find any data for leagues {league_ids}.")
        sys.exit(1)

    print(f"Building dashboard data for leagues {league_ids}...")
    standings = {}
    for d in standings_dirs:
        if os.path.isdir(d):
            standings.update(load_standings(d))
    weekly = {}
    for d in gamecenter_dirs:
        if os.path.isdir(d):
            weekly.update(load_weekly(d))
    seasons = build_seasons(standings, weekly)
    owners = build_owner_stats(seasons)
    h2h = build_head_to_head(seasons)
    highs, lows, blowouts, nail_biters = build_weekly_extremes(seasons)
    biggest_upsets = build_biggest_upsets(seasons)
    drafts = {}
    for d in draft_dirs:
        if os.path.isdir(d):
            drafts.update(load_drafts(d))
    draft_owner_stats = build_draft_analytics(drafts)
    players_by_year, players_career, players_by_owner = load_player_scoring(gamecenter_dirs)
    bust_riser = compute_busts_and_risers(drafts, players_by_year)
    enrich_with_espn_ids(players_by_owner, players_career, drafts)

    payload = {
        "leagueIds": [str(x) for x in league_ids],
        "leagueId": str(league_ids[0]),
        "playersByOwner": players_by_owner,
        "years": [s["year"] for s in seasons],
        "seasons": seasons,
        "owners": owners,
        "headToHead": h2h,
        "weeklyHighs": highs,
        "weeklyLows": lows,
        "blowouts": blowouts,
        "nailBiters": nail_biters,
        "biggestUpsets": biggest_upsets,
        "drafts": drafts,
        "draftOwnerStats": draft_owner_stats,
        "playersCareer": players_career,
        "playersByYear": players_by_year,
        "draftBustsRisers": bust_riser,
    }

    out_dir = "docs"
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, "data.json")
    with open(out_path, "w") as f:
        json.dump(payload, f, indent=2)

    # Stamp a fresh version string into index.html so browsers pick up new
    # app.js / styles.css instead of serving a stale cached copy.
    import time, re
    build_tag = str(int(time.time()))
    index_path = os.path.join(out_dir, "index.html")
    if os.path.isfile(index_path):
        with open(index_path) as f:
            html = f.read()
        html = re.sub(r'(app\.js|styles\.css)\?v=\d+', rf'\1?v={build_tag}', html)
        html = html.replace("__BUILD__", build_tag)
        with open(index_path, "w") as f:
            f.write(html)

    print(f"Wrote {out_path}")
    print(f"  Seasons: {len(seasons)}  Owners: {len(owners)}  Drafts: {len(drafts)}")


if __name__ == "__main__":
    main()
