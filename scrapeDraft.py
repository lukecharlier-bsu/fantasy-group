"""
Scrapes full draft results (every round, every pick) for each season.
Writes ./output/<leagueID>-history-draft/<year>.csv with columns:
    Round, Pick, PlayerId, Player, Position, NFLTeam, FantasyTeam, ManagerName
"""

import csv
import os
import re
import requests
from bs4 import BeautifulSoup as bs

from cookieString import cookies
from constants import leagueID, leagueStartYear, leagueEndYear


def parse_draft_page(html):
    """Parse a 'View All Rounds' draft page into a list of pick dicts."""
    soup = bs(html, "html.parser")
    picks = []
    rounds = soup.find_all("h4")
    for h4 in rounds:
        m = re.match(r"Round (\d+)", h4.text.strip())
        if not m:
            continue
        round_num = int(m.group(1))
        ul = h4.find_next_sibling("ul")
        if not ul:
            continue
        for li in ul.find_all("li", recursive=False):
            count = li.find("span", class_="count")
            if not count:
                continue
            pick_num = int(count.text.strip().rstrip("."))
            player_a = li.find("a", class_="playerName")
            player_name = player_a.text.strip() if player_a else ""
            player_id = ""
            if player_a:
                cls = player_a.get("class") or []
                for c in cls:
                    pm = re.match(r"playerNameId-(\d+)", c)
                    if pm:
                        player_id = pm.group(1)
                        break
            em = li.find("em")
            pos, nfl_team = "", ""
            if em:
                em_text = em.text.strip()
                # Examples: "RB - SF", "RB - SF Q", "DEF" (rare)
                parts = em_text.split(" - ")
                pos = parts[0].strip()
                if len(parts) > 1:
                    nfl_team = parts[1].split()[0]  # strip Q/IR/etc
            team_a = li.find("a", class_="teamName")
            fantasy_team = team_a.text.strip() if team_a else ""
            manager = ""
            tw = li.find("span", class_="tw")
            if tw:
                inner_li = tw.find("li")
                if inner_li:
                    manager = inner_li.text.strip()
            picks.append({
                "Round": round_num,
                "Pick": pick_num,
                "PlayerId": player_id,
                "Player": player_name,
                "Position": pos,
                "NFLTeam": nfl_team,
                "FantasyTeam": fantasy_team,
                "ManagerName": manager,
            })
    return picks


def main():
    out_dir = f"./output/{leagueID}-history-draft/"
    os.makedirs(out_dir, exist_ok=True)
    fields = ["Round", "Pick", "PlayerId", "Player", "Position", "NFLTeam",
              "FantasyTeam", "ManagerName"]
    for year in range(leagueStartYear, leagueEndYear):
        season = str(year)
        url = (f"https://fantasy.nfl.com/league/{leagueID}/history/{season}"
               f"/draftresults?draftResultsDetail=0&draftResultsTab=round&draftResultsType=results")
        r = requests.get(url, cookies=cookies)
        if r.status_code != 200:
            print(f"{season}: HTTP {r.status_code}, skipping")
            continue
        picks = parse_draft_page(r.text)
        if not picks:
            print(f"{season}: no picks parsed (page may be empty)")
            continue
        path = os.path.join(out_dir, f"{season}.csv")
        with open(path, "w", newline="") as f:
            w = csv.DictWriter(f, fieldnames=fields)
            w.writeheader()
            w.writerows(picks)
        print(f"{season}: wrote {len(picks)} picks -> {path}")


if __name__ == "__main__":
    main()
