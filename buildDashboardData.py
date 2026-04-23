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

        team_data = []
        champion = None
        sacko = None
        for t in teams:
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
        o["avgFinish"] = (sum(f["rank"] for f in finishes) / len(finishes)) if finishes else 0
        o["bestFinish"] = min((f["rank"] for f in finishes), default=None)
        o["worstFinish"] = max((f["rank"] for f in finishes), default=None)
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
    league_id = sys.argv[1] if len(sys.argv) > 1 else None
    if league_id is None:
        try:
            from constants import leagueID as league_id
        except Exception:
            print("Provide a leagueID as the first argument.")
            sys.exit(1)

    standings_dir = os.path.join("output", f"{league_id}-history-standings")
    gamecenter_dir = os.path.join("output", f"{league_id}-history-teamgamecenter")
    draft_dir = os.path.join("output", f"{league_id}-history-draft")
    if not os.path.isdir(standings_dir) or not os.path.isdir(gamecenter_dir):
        print(f"Could not find data for league {league_id}.")
        print(f"  Looked in: {standings_dir} and {gamecenter_dir}")
        sys.exit(1)

    print(f"Building dashboard data for league {league_id}...")
    standings = load_standings(standings_dir)
    weekly = load_weekly(gamecenter_dir)
    seasons = build_seasons(standings, weekly)
    owners = build_owner_stats(seasons)
    h2h = build_head_to_head(seasons)
    highs, lows, blowouts, nail_biters = build_weekly_extremes(seasons)
    drafts = load_drafts(draft_dir)
    draft_owner_stats = build_draft_analytics(drafts)

    payload = {
        "leagueId": str(league_id),
        "years": [s["year"] for s in seasons],
        "seasons": seasons,
        "owners": owners,
        "headToHead": h2h,
        "weeklyHighs": highs,
        "weeklyLows": lows,
        "blowouts": blowouts,
        "nailBiters": nail_biters,
        "drafts": drafts,
        "draftOwnerStats": draft_owner_stats,
    }

    out_dir = "docs"
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, "data.json")
    with open(out_path, "w") as f:
        json.dump(payload, f, indent=2)

    print(f"Wrote {out_path}")
    print(f"  Seasons: {len(seasons)}  Owners: {len(owners)}  Drafts: {len(drafts)}")


if __name__ == "__main__":
    main()
