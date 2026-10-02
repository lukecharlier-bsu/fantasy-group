"""Scrape The GOAT League from ESPN Fantasy and emit CSVs in the same shape as
the historical NFL.com scrapers so buildDashboardData.py can merge them.

Writes to:
    ./output/<espnLeagueID>-history-standings/<year>.csv
    ./output/<espnLeagueID>-history-teamgamecenter/<year>/<week>.csv
    ./output/<espnLeagueID>-history-draft/<year>.csv

The NFL.com historical folders (./output/7527965-history-*) are read-only and
never written to by this script.
"""

import csv
import os
import sys

from espn_api.football import League

from constants import (
    espnLeagueID,
    espnStartYear,
    espn_standings_directory,
    espn_gamecenter_directory,
    espn_draft_directory,
    espnOwnerByTeamId,
)
from espnCookies import SWID, ESPN_S2


# ESPN slot -> historical column label used in gamecenter CSV header.
SLOT_LABEL = {
    "QB": "QB",
    "RB": "RB",
    "WR": "WR",
    "TE": "TE",
    "RB/WR": "W/R",
    "K": "K",
    "D/ST": "DEF",
    "BE": "BN",
    "IR": "RES",
}

# Order and count of columns per lineup, matching the historical CSV shape.
LINEUP_ORDER = [
    ("QB", 1),
    ("RB", 2),
    ("WR", 2),
    ("TE", 1),
    ("W/R", 1),
    ("K", 1),
    ("DEF", 1),
    ("BN", 6),
    ("RES", 1),
]


def _first_initial_last(name):
    """'Lamar Jackson' -> 'L. Jackson'.  'A.J. Brown' -> 'A. Brown'."""
    parts = name.split()
    if len(parts) < 2:
        return name
    return f"{parts[0][0]}. {' '.join(parts[1:])}"


def format_player_cell(box_player):
    """Return the string the NFL.com scraper wrote into each lineup cell.
    Non-DEF: 'F. Lastname POS - TEAM ' (trailing space preserved).
    DEF:     'Mascot DEF ' (trailing space preserved)."""
    if box_player is None:
        return "-"
    pos = box_player.position
    team = (box_player.proTeam or "").strip()
    if pos == "D/ST":
        mascot = (box_player.name or "").replace(" D/ST", "").strip()
        return f"{mascot} DEF "
    short = _first_initial_last(box_player.name)
    if team:
        return f"{short} {pos} - {team} "
    return f"{short} {pos} "


def _points(box_player):
    if box_player is None:
        return 0.0
    return round(float(box_player.points or 0.0), 2)


def _group_lineup_by_label(lineup):
    """Return {label: [BoxPlayer, ...]} using SLOT_LABEL remap."""
    buckets = {label: [] for label, _ in LINEUP_ORDER}
    for p in lineup:
        label = SLOT_LABEL.get(p.slot_position)
        if label is None:
            # Any unexpected slot (OP, HC, etc.) — treat as bench so we don't drop it.
            label = "BN"
        buckets.setdefault(label, []).append(p)
    return buckets


def build_gamecenter_header():
    """Reproduce the per-week header the NFL.com scraper wrote.
    Owner, Rank, <slot, Points>*, Total, Opponent, Opponent Total.
    """
    header = ["Owner", "Rank"]
    for label, count in LINEUP_ORDER:
        for _ in range(count):
            header += [label, "Points"]
    header += ["Total", "Opponent", "Opponent Total"]
    return header


def build_gamecenter_row(team, lineup, total, opponent_owner, opponent_total, rank):
    buckets = _group_lineup_by_label(lineup)
    row = [team, rank]
    for label, count in LINEUP_ORDER:
        slots = buckets.get(label, [])
        for i in range(count):
            p = slots[i] if i < len(slots) else None
            row.append(format_player_cell(p))
            row.append(f"{_points(p):.2f}" if p is not None else "0.00")
    row += [f"{total:.2f}", opponent_owner, f"{opponent_total:.2f}"]
    return row


def _owner(team):
    return espnOwnerByTeamId.get(team.team_id, team.team_name)


def write_gamecenter(league, year):
    year_dir = os.path.join(espn_gamecenter_directory, str(year))
    os.makedirs(year_dir, exist_ok=True)
    reg = league.settings.reg_season_count or 14
    # Only pull FULLY-COMPLETED weeks. ESPN advances current_week once the week
    # is done, so current_week itself is in-progress — skip it, or the dashboard
    # will show mid-week zeros as real low scores.
    last_week = min(league.current_week - 1, reg + 3)  # reg season + playoff weeks
    header = build_gamecenter_header()
    written = []
    for week in range(1, last_week + 1):
        try:
            scores = league.box_scores(week)
        except Exception as exc:
            print(f"  week {week}: skip ({exc})")
            continue
        if not scores:
            continue
        rows = []
        # Compute team ranks within the week (1 = highest total).
        totals = []
        for m in scores:
            totals.append((_owner(m.home_team), m.home_score))
            if m.away_team:
                totals.append((_owner(m.away_team), m.away_score))
        ranked = sorted(totals, key=lambda t: -t[1])
        rank_by_owner = {name: i + 1 for i, (name, _) in enumerate(ranked)}
        for m in scores:
            home_owner = _owner(m.home_team)
            away_owner = _owner(m.away_team) if m.away_team else ""
            rows.append(build_gamecenter_row(
                home_owner, m.home_lineup, m.home_score,
                away_owner, m.away_score, rank_by_owner.get(home_owner, 0),
            ))
            if m.away_team:
                rows.append(build_gamecenter_row(
                    away_owner, m.away_lineup, m.away_score,
                    home_owner, m.home_score, rank_by_owner.get(away_owner, 0),
                ))
        out = os.path.join(year_dir, f"{week}.csv")
        with open(out, "w", newline="") as f:
            w = csv.writer(f)
            w.writerow(header)
            w.writerows(rows)
        written.append(week)
    print(f"  gamecenter: wrote weeks {written}")


def write_standings(league, year):
    os.makedirs(espn_standings_directory, exist_ok=True)
    header = [
        "TeamName", "RegularSeasonRank", "Record", "PointsFor", "PointsAgainst",
        "PlayoffRank", "ManagerName", "Moves", "Trades", "DraftPosition",
    ]
    rows = []
    # Sort by standing for stable output.
    teams = sorted(league.teams, key=lambda t: t.standing or 99)
    for t in teams:
        record = f"{t.wins}-{t.losses}-{t.ties}"
        rows.append([
            t.team_name,
            t.standing or 0,
            record,
            f"{t.points_for:,.2f}" if isinstance(t.points_for, float) else t.points_for,
            f"{t.points_against:,.2f}" if isinstance(t.points_against, float) else t.points_against,
            t.final_standing or 0,
            _owner(t),
            (t.acquisitions or 0) + (t.drops or 0),
            t.trades or 0,
            t.draft_projected_rank or 0,
        ])
    out = os.path.join(espn_standings_directory, f"{year}.csv")
    with open(out, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(header)
        w.writerows(rows)
    print(f"  standings: wrote {out}")


def _resolve_player_meta(league):
    """Build {playerId: (position, proTeam)} from current rosters + player_info fallback."""
    meta = {}
    for t in league.teams:
        for p in t.roster:
            meta[p.playerId] = (p.position, p.proTeam)
    return meta


def write_draft(league, year):
    if not league.draft:
        print("  draft: none yet")
        return
    os.makedirs(espn_draft_directory, exist_ok=True)
    header = ["Round", "Pick", "PlayerId", "Player", "Position", "NFLTeam",
              "FantasyTeam", "ManagerName"]
    meta = _resolve_player_meta(league)
    rows = []
    for pick in league.draft:
        pid = pick.playerId
        pos_team = meta.get(pid)
        if pos_team is None:
            try:
                pi = league.player_info(playerId=pid)
                pos_team = (pi.position, pi.proTeam) if pi else ("", "")
            except Exception:
                pos_team = ("", "")
            meta[pid] = pos_team
        pos, pro_team = pos_team
        rows.append([
            pick.round_num,
            pick.round_pick,
            pid,
            pick.playerName,
            pos,
            pro_team,
            pick.team.team_name,
            _owner(pick.team),
        ])
    out = os.path.join(espn_draft_directory, f"{year}.csv")
    with open(out, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(header)
        w.writerows(rows)
    print(f"  draft: wrote {out} ({len(rows)} picks)")


def scrape_year(year):
    print(f"[{year}] connecting...")
    league = League(league_id=int(espnLeagueID), year=year,
                    swid=SWID, espn_s2=ESPN_S2)
    print(f"  league: {league.settings.name}  current_week={league.current_week}")
    write_standings(league, year)
    write_draft(league, year)
    write_gamecenter(league, year)


def main():
    years = sys.argv[1:] if len(sys.argv) > 1 else [str(espnStartYear)]
    for y in years:
        scrape_year(int(y))


if __name__ == "__main__":
    main()
