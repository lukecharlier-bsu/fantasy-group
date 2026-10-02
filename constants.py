leagueID = "7527965"
leagueStartYear = 2019
leagueEndYear = 2025  # last NFL.com season; ESPN takes over 2026+

standings_directory = './output/'+ leagueID + '-history-standings/'
gamecenter_directory = './output/'+ leagueID + '-history-teamgamecenter/'

# ESPN takeover (NFL.com Fantasy shut down after 2025).
espnLeagueID = "1579300904"
espnStartYear = 2026

espn_standings_directory = './output/' + espnLeagueID + '-history-standings/'
espn_gamecenter_directory = './output/' + espnLeagueID + '-history-teamgamecenter/'
espn_draft_directory = './output/' + espnLeagueID + '-history-draft/'

# Map ESPN team_id -> ManagerName used in historical CSVs so aggregate stats
# stay continuous across the platform switch.
espnOwnerByTeamId = {
    1: "Alex",
    2: "Joshua",
    3: "Justin",
    4: "Luke",
    5: "Matthew",
    6: "Aiden",
    7: "Howard",
    8: "Sean",
    9: "Todd",
    10: "Ulises",
}
