// League dashboard – consumes ./data.json built by buildDashboardData.py.

const STATE = { data: null, charts: {} };

document.addEventListener("DOMContentLoaded", async () => {
    setupTabs();
    try {
        const res = await fetch("./data.json?v=" + Date.now());
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        STATE.data = await res.json();
    } catch (err) {
        document.querySelector("main").innerHTML =
            `<div class="card"><h3>Could not load data.json</h3>
             <p class="muted">Open this page through a web server (e.g. \`python3 -m http.server\`) or upload to GitHub Pages.</p>
             <pre>${err}</pre></div>`;
        return;
    }
    document.getElementById("subtitle").textContent =
        `League ${STATE.data.leagueId} · ${STATE.data.years[0]}–${STATE.data.years[STATE.data.years.length - 1]} · ${STATE.data.owners.length} owners`;
    document.getElementById("data-stamp").textContent =
        `Built from ${STATE.data.seasons.length} seasons of scraped NFL.com data.`;

    Chart.defaults.color = "#94a3b8";
    Chart.defaults.borderColor = "#334155";

    initOwnersPanel();
    initSeasonsPanel();
    initH2HPanel();
    initWeeklyPanel();
    initDraftsPanel();
    initFranchisePanel();
    initFrivolitiesPanel();
    initTradesPanel();
    initGameHistoryPanel();
    initPlayersPanel();
});

// ---------- Tabs ----------
function setupTabs() {
    document.querySelectorAll(".tab").forEach(btn => {
        btn.addEventListener("click", () => {
            const target = btn.dataset.tab;
            document.querySelectorAll(".tab").forEach(b => b.classList.toggle("active", b === btn));
            document.querySelectorAll(".panel").forEach(p =>
                p.classList.toggle("active", p.id === `panel-${target}`));
            // Resize charts when their panel becomes visible
            Object.values(STATE.charts).forEach(c => c && c.resize());
        });
    });
}

// ---------- Helpers ----------
function fmt(n, d = 2) { return Number(n).toFixed(d); }
function fmtPct(n) { return (n * 100).toFixed(1) + "%"; }
function bySort(field, dir = "desc") {
    return (a, b) => {
        const av = a[field], bv = b[field];
        if (av === bv) return 0;
        return dir === "desc" ? (bv > av ? 1 : -1) : (av > bv ? 1 : -1);
    };
}

// ---------- Owners panel ----------
function initOwnersPanel() {
    const sortSel = document.getElementById("owner-sort");
    sortSel.addEventListener("change", renderOwnerCards);
    renderOwnerCards();
    renderCareerCharts();
    renderOwnerDetailPicker();
}

function renderOwnerCards() {
    const container = document.getElementById("owner-cards");
    const field = document.getElementById("owner-sort").value;
    const dir = field === "avgFinish" ? "asc" : "desc";
    const owners = [...STATE.data.owners].sort(bySort(field, dir));
    container.innerHTML = owners.map(o => `
        <div class="owner-card" data-owner="${o.name}">
            <div class="name">${o.name}</div>
            <div class="stat-line">Record <strong>${o.wins}-${o.losses}-${o.ties}</strong> · <strong>${fmtPct(o.winPct)}</strong></div>
            <div class="stat-line">PF <strong>${fmt(o.pointsFor)}</strong> · PPG <strong>${fmt(o.avgPointsPerGame)}</strong></div>
            <div class="stat-line">Seasons <strong>${o.seasons}</strong> · Avg finish <strong>${fmt(o.avgFinish, 1)}</strong></div>
            <div class="badges">
                ${o.championships ? `<span class="badge gold">🏆 ${o.championships}</span>` : ""}
                ${o.playoffs ? `<span class="badge">PO ${o.playoffs}</span>` : ""}
                ${o.sackos ? `<span class="badge bad">💩 ${o.sackos}</span>` : ""}
            </div>
        </div>
    `).join("");
    container.querySelectorAll(".owner-card").forEach(card => {
        card.addEventListener("click", () => {
            document.getElementById("owner-detail-select").value = card.dataset.owner;
            renderOwnerDetail(card.dataset.owner);
            document.getElementById("owner-detail-body").scrollIntoView({ behavior: "smooth", block: "start" });
        });
    });
}

function renderCareerCharts() {
    const owners = [...STATE.data.owners].sort(bySort("pointsFor"));
    makeBar("chart-points-for", owners.map(o => o.name), owners.map(o => o.pointsFor),
            "Points For", "#38bdf8");
    const winSorted = [...STATE.data.owners].sort(bySort("winPct"));
    makeBar("chart-winpct", winSorted.map(o => o.name), winSorted.map(o => o.winPct * 100),
            "Win %", "#4ade80");
}

function makeBar(id, labels, values, title, color) {
    const ctx = document.getElementById(id);
    if (STATE.charts[id]) STATE.charts[id].destroy();
    STATE.charts[id] = new Chart(ctx, {
        type: "bar",
        data: {
            labels,
            datasets: [{ label: title, data: values, backgroundColor: color }],
        },
        options: {
            responsive: true,
            indexAxis: "y",
            plugins: { legend: { display: false }, title: { display: false } },
            scales: { x: { grid: { color: "#1f2937" } }, y: { grid: { display: false } } },
        },
    });
}

function renderOwnerDetailPicker() {
    const sel = document.getElementById("owner-detail-select");
    const sorted = [...STATE.data.owners].sort((a, b) => a.name.localeCompare(b.name));
    sel.innerHTML = sorted.map(o => `<option value="${o.name}">${o.name}</option>`).join("");
    sel.addEventListener("change", () => renderOwnerDetail(sel.value));
    renderOwnerDetail(sorted[0].name);
}

function renderOwnerDetail(name) {
    const o = STATE.data.owners.find(x => x.name === name);
    if (!o) return;
    const body = document.getElementById("owner-detail-body");
    const finishes = [...o.finishes].sort((a, b) => a.year - b.year);
    body.innerHTML = `
        <div class="season-summary">
            <div class="tile"><div class="lbl">Record</div><div class="val">${o.wins}-${o.losses}-${o.ties}</div></div>
            <div class="tile"><div class="lbl">Win %</div><div class="val">${fmtPct(o.winPct)}</div></div>
            <div class="tile"><div class="lbl">Points For</div><div class="val">${fmt(o.pointsFor)}</div></div>
            <div class="tile"><div class="lbl">Avg PPG</div><div class="val">${fmt(o.avgPointsPerGame)}</div></div>
            <div class="tile"><div class="lbl">Championships</div><div class="val">${o.championships}</div></div>
            <div class="tile"><div class="lbl">Playoffs</div><div class="val">${o.playoffs} / ${o.seasons}</div></div>
            <div class="tile"><div class="lbl">Sackos</div><div class="val">${o.sackos}</div></div>
            <div class="tile"><div class="lbl">Best Finish</div><div class="val">${o.bestFinish ?? "-"}</div></div>
            <div class="tile"><div class="lbl">Worst Finish</div><div class="val">${o.worstFinish ?? "-"}</div></div>
            <div class="tile"><div class="lbl">Moves / Trades</div><div class="val">${o.moves} / ${o.trades}</div></div>
        </div>
        <h4 style="margin-top:1rem">Season-by-season finishes</h4>
        <table class="data-table">
            <thead><tr><th>Year</th><th>Team</th><th>Finish</th><th>Reg Rank</th><th>Record</th><th class="right">PF</th><th class="right">PA</th><th>Draft</th></tr></thead>
            <tbody>
                ${finishes.map(f => {
                    const season = STATE.data.seasons.find(s => s.year === f.year);
                    const t = season.standings.find(x => x.manager === name);
                    const finishMark = t.champion ? " 🏆" : (t.sacko ? " 💩" : (t.madePlayoffs ? " ✓" : ""));
                    const finishCell = season.inProgress
                        ? `In progress (reg #${t.regularSeasonRank})`
                        : `${t.playoffRank} of ${season.numTeams}${finishMark}`;
                    return `<tr>
                        <td>${f.year}</td>
                        <td>${t.team}</td>
                        <td>${finishCell}</td>
                        <td>${t.regularSeasonRank}</td>
                        <td>${t.wins}-${t.losses}-${t.ties}</td>
                        <td class="right">${fmt(t.pointsFor)}</td>
                        <td class="right">${fmt(t.pointsAgainst)}</td>
                        <td>${t.draftPosition}</td>
                    </tr>`;
                }).join("")}
            </tbody>
        </table>
    `;
}

// ---------- Seasons panel ----------
function initSeasonsPanel() {
    const seasons = STATE.data.seasons;
    const t = document.getElementById("champions-table");
    t.innerHTML = `
        <thead><tr><th>Year</th><th>Champion</th><th>Sacko</th><th>Teams</th><th>Top Scorer</th><th class="right">Top PF</th></tr></thead>
        <tbody>
        ${seasons.map(s => {
            const top = [...s.standings].sort((a, b) => b.pointsFor - a.pointsFor)[0];
            const champCell = s.inProgress ? "In progress" : `🏆 ${s.champion ?? "-"}`;
            const sackoCell = s.inProgress ? "-" : (s.sacko ?? "-");
            return `<tr>
                <td><strong>${s.year}</strong></td>
                <td>${champCell}</td>
                <td>${sackoCell}</td>
                <td>${s.numTeams}</td>
                <td>${top.manager} (${top.team})</td>
                <td class="right">${fmt(top.pointsFor)}</td>
            </tr>`;
        }).join("")}
        </tbody>
    `;

    const yearSel = document.getElementById("season-year");
    yearSel.innerHTML = seasons.map(s => `<option value="${s.year}">${s.year}</option>`).reverse().join("");
    yearSel.addEventListener("change", () => renderSeason(parseInt(yearSel.value)));
    renderSeason(parseInt(yearSel.value));
}

function renderSeason(year) {
    const s = STATE.data.seasons.find(x => x.year === year);
    if (!s) return;
    const body = document.getElementById("season-body");
    const standings = s.inProgress
        ? [...s.standings].sort((a, b) => a.regularSeasonRank - b.regularSeasonRank)
        : [...s.standings].sort((a, b) => a.playoffRank - b.playoffRank);
    body.innerHTML = `
        <h4>${s.inProgress ? "Current Standings (season in progress)" : "Final Standings"}</h4>
        <table class="data-table">
            <thead><tr><th>#</th><th>Owner</th><th>Team</th><th>Record</th><th class="right">PF</th><th class="right">PA</th><th>Reg Rank</th><th>Draft</th></tr></thead>
            <tbody>
            ${standings.map(t => {
                const mark = t.champion ? "🏆" : (t.sacko ? "💩" : (t.madePlayoffs ? "✓" : ""));
                const rankCell = s.inProgress ? `${t.regularSeasonRank}` : `${t.playoffRank} ${mark}`;
                return `<tr>
                    <td><strong>${rankCell}</strong></td>
                    <td>${t.manager}</td>
                    <td>${t.team}</td>
                    <td>${t.wins}-${t.losses}-${t.ties}</td>
                    <td class="right">${fmt(t.pointsFor)}</td>
                    <td class="right">${fmt(t.pointsAgainst)}</td>
                    <td>${t.regularSeasonRank}</td>
                    <td>${t.draftPosition}</td>
                </tr>`;
            }).join("")}
            </tbody>
        </table>
        <h4 style="margin-top:1rem">Weekly Matchups</h4>
        <table class="data-table">
            <thead><tr><th>Week</th><th>Team A</th><th class="right">A</th><th class="right">B</th><th>Team B</th></tr></thead>
            <tbody>
            ${s.weeks.flatMap(w => w.matchups.map(m => {
                const aWin = m.homePts > m.awayPts;
                return `<tr data-goto-game data-game-year="${s.year}" data-game-week="${w.week}" data-game-a="${m.home}" data-game-b="${m.away}">
                    <td>${w.week}</td>
                    <td class="${aWin ? "win" : "loss"}">${m.home}</td>
                    <td class="right ${aWin ? "win" : "loss"}">${fmt(m.homePts)}</td>
                    <td class="right ${!aWin ? "win" : "loss"}">${fmt(m.awayPts)}</td>
                    <td class="${!aWin ? "win" : "loss"}">${m.away}</td>
                </tr>`;
            })).join("")}
            </tbody>
        </table>
    `;
}

// ---------- Head-to-head ----------
function initH2HPanel() {
    const owners = [...STATE.data.owners].map(o => o.name).sort();
    const h2h = STATE.data.headToHead;

    // Matrix
    const t = document.getElementById("h2h-matrix");
    t.innerHTML = `
        <thead><tr><th></th>${owners.map(n => `<th>${n}</th>`).join("")}</tr></thead>
        <tbody>
        ${owners.map(a => `
            <tr>
                <th>${a}</th>
                ${owners.map(b => {
                    if (a === b) return `<td class="self">—</td>`;
                    const r = h2h[a]?.[b];
                    if (!r || r.games === 0) return `<td>·</td>`;
                    const pct = (r.wins + 0.5 * r.ties) / r.games;
                    const color = pct >= 0.5 ? "var(--good)" : "var(--bad)";
                    const tip = `${r.wins}-${r.losses}-${r.ties} (${fmt(r.pointsFor)} - ${fmt(r.pointsAgainst)})`;
                    return `<td title="${tip}" style="color:${color}">${fmtPct(pct)}</td>`;
                }).join("")}
            </tr>
        `).join("")}
        </tbody>
    `;

    // Detail picker
    const aSel = document.getElementById("h2h-a");
    const bSel = document.getElementById("h2h-b");
    aSel.innerHTML = owners.map(n => `<option value="${n}">${n}</option>`).join("");
    bSel.innerHTML = owners.map(n => `<option value="${n}">${n}</option>`).join("");
    bSel.value = owners[1] || owners[0];
    [aSel, bSel].forEach(s => s.addEventListener("change", renderH2HDetail));
    renderH2HDetail();
}

function renderH2HDetail() {
    const a = document.getElementById("h2h-a").value;
    const b = document.getElementById("h2h-b").value;
    const out = document.getElementById("h2h-detail");
    if (a === b) { out.innerHTML = `<p class="muted">Pick two different owners.</p>`; return; }
    const r = STATE.data.headToHead[a]?.[b];
    if (!r) { out.innerHTML = `<p class="muted">No matchups recorded.</p>`; return; }

    const games = [];
    for (const s of STATE.data.seasons) {
        for (const w of s.weeks) {
            for (const m of w.matchups) {
                if ((m.home === a && m.away === b) || (m.home === b && m.away === a)) {
                    games.push({ year: s.year, week: w.week, ...m });
                }
            }
        }
    }
    games.sort((x, y) => x.year - y.year || x.week - y.week);
    const pct = (r.wins + 0.5 * r.ties) / r.games;

    out.innerHTML = `
        <div class="season-summary">
            <div class="tile"><div class="lbl">${a}'s Record vs ${b}</div><div class="val">${r.wins}-${r.losses}-${r.ties}</div></div>
            <div class="tile"><div class="lbl">${a}'s Win %</div><div class="val">${fmtPct(pct)}</div></div>
            <div class="tile"><div class="lbl">${a} Points</div><div class="val">${fmt(r.pointsFor)}</div></div>
            <div class="tile"><div class="lbl">${b} Points</div><div class="val">${fmt(r.pointsAgainst)}</div></div>
        </div>
        <table class="data-table">
            <thead><tr><th>Year</th><th>Week</th><th>${a}</th><th class="right">Pts</th><th class="right">Pts</th><th>${b}</th><th>Margin</th></tr></thead>
            <tbody>
            ${games.map(g => {
                const aPts = g.home === a ? g.homePts : g.awayPts;
                const bPts = g.home === b ? g.homePts : g.awayPts;
                const aWon = aPts > bPts;
                return `<tr>
                    <td>${g.year}</td>
                    <td>${g.week}</td>
                    <td class="${aWon ? "win" : "loss"}">${a}</td>
                    <td class="right ${aWon ? "win" : "loss"}">${fmt(aPts)}</td>
                    <td class="right ${!aWon ? "win" : "loss"}">${fmt(bPts)}</td>
                    <td class="${!aWon ? "win" : "loss"}">${b}</td>
                    <td>${(aPts > bPts ? "+" : "") + fmt(aPts - bPts)}</td>
                </tr>`;
            }).join("")}
            </tbody>
        </table>
    `;
}

// ---------- Weekly ----------
function initWeeklyPanel() {
    fillExtremesTable("highs-table", STATE.data.weeklyHighs, "points");
    fillExtremesTable("lows-table", STATE.data.weeklyLows, "points");
    fillBlowoutTable("blowouts-table", STATE.data.blowouts);
    fillBlowoutTable("nailbiters-table", STATE.data.nailBiters);

    const yearSel = document.getElementById("weekly-year");
    yearSel.innerHTML = STATE.data.seasons.map(s => `<option value="${s.year}">${s.year}</option>`).reverse().join("");
    yearSel.addEventListener("change", () => renderWeeklyChart(parseInt(yearSel.value)));
    renderWeeklyChart(parseInt(yearSel.value));
}

function fillExtremesTable(id, rows, key) {
    document.getElementById(id).innerHTML = `
        <thead><tr><th>Year</th><th>Wk</th><th>Owner</th><th class="right">Points</th><th>vs</th></tr></thead>
        <tbody>
        ${rows.map(r => `<tr data-goto-game data-game-year="${r.year}" data-game-week="${r.week}" data-game-a="${r.owner}" data-game-b="${r.opponent}">
            <td>${r.year}</td><td>${r.week}</td><td>${r.owner}</td>
            <td class="right"><strong>${fmt(r[key])}</strong></td>
            <td>${r.opponent} (${fmt(r.opponentPoints)})</td>
        </tr>`).join("")}
        </tbody>
    `;
}

function fillBlowoutTable(id, rows) {
    document.getElementById(id).innerHTML = `
        <thead><tr><th>Year</th><th>Wk</th><th>Winner</th><th class="right">W</th><th class="right">L</th><th>Loser</th><th class="right">Margin</th></tr></thead>
        <tbody>
        ${rows.map(r => `<tr data-goto-game data-game-year="${r.year}" data-game-week="${r.week}" data-game-a="${r.winner}" data-game-b="${r.loser}">
            <td>${r.year}</td><td>${r.week}</td>
            <td class="win">${r.winner}</td>
            <td class="right">${fmt(r.winnerPoints)}</td>
            <td class="right">${fmt(r.loserPoints)}</td>
            <td class="loss">${r.loser}</td>
            <td class="right"><strong>${fmt(r.margin)}</strong></td>
        </tr>`).join("")}
        </tbody>
    `;
}

function renderWeeklyChart(year) {
    const season = STATE.data.seasons.find(s => s.year === year);
    if (!season) return;
    const ownersSet = new Set();
    season.weeks.forEach(w => w.matchups.forEach(m => { ownersSet.add(m.home); ownersSet.add(m.away); }));
    const owners = [...ownersSet].sort();
    const palette = ["#38bdf8","#4ade80","#fbbf24","#f87171","#a78bfa","#fb923c","#34d399","#f472b6","#facc15","#22d3ee"];

    const datasets = owners.map((name, i) => {
        const data = season.weeks.map(w => {
            const m = w.matchups.find(mm => mm.home === name || mm.away === name);
            if (!m) return null;
            return m.home === name ? m.homePts : m.awayPts;
        });
        return { label: name, data, borderColor: palette[i % palette.length], backgroundColor: palette[i % palette.length] + "33", tension: 0.3, fill: false };
    });
    const labels = season.weeks.map(w => `Wk ${w.week}`);
    const id = "chart-weekly";
    if (STATE.charts[id]) STATE.charts[id].destroy();
    STATE.charts[id] = new Chart(document.getElementById(id), {
        type: "line",
        data: { labels, datasets },
        options: {
            responsive: true,
            interaction: { mode: "nearest", intersect: false },
            scales: { y: { grid: { color: "#1f2937" } }, x: { grid: { display: false } } },
        },
    });
}

// ---------- Drafts ----------
function initDraftsPanel() {
    const drafts = STATE.data.drafts || {};
    const years = Object.keys(drafts).map(Number).sort((a, b) => b - a);
    if (!years.length) {
        document.getElementById("panel-drafts").innerHTML =
            `<div class="card"><h3>No draft data found</h3><p class="muted">Run <code>python3 scrapeDraft.py</code> then rebuild data.json.</p></div>`;
        return;
    }

    const owners = [...STATE.data.owners].map(o => o.name).sort();

    // Year + owner-filter selectors for the draft board
    const yearSel = document.getElementById("draft-year");
    yearSel.innerHTML = years.map(y => `<option value="${y}">${y}</option>`).join("");
    const ownerFilterSel = document.getElementById("draft-owner-filter");
    ownerFilterSel.innerHTML = `<option value="">All owners</option>` +
        owners.map(n => `<option value="${n}">${n}</option>`).join("");
    [yearSel, ownerFilterSel].forEach(s => s.addEventListener("change", renderDraftBoard));
    renderDraftBoard();

    // Round 1 history table
    renderRound1Table();
    renderDraftPositionsChart();

    // Owner detail
    const detailSel = document.getElementById("draft-owner-detail");
    detailSel.innerHTML = owners.map(n => `<option value="${n}">${n}</option>`).join("");
    detailSel.addEventListener("change", () => renderDraftOwnerDetail(detailSel.value));
    renderDraftOwnerDetail(owners[0]);
}

function renderDraftBoard() {
    const year = parseInt(document.getElementById("draft-year").value);
    const filterOwner = document.getElementById("draft-owner-filter").value;
    const picks = STATE.data.drafts[year] || [];
    const byRound = {};
    for (const p of picks) (byRound[p.round] = byRound[p.round] || []).push(p);
    const rounds = Object.keys(byRound).map(Number).sort((a, b) => a - b);

    const out = document.getElementById("draft-board");
    out.innerHTML = rounds.map(r => `
        <h4 style="margin: 1rem 0 .4rem; color: var(--accent);">Round ${r}</h4>
        <table class="data-table">
            <thead><tr><th>#</th><th>Player</th><th>Pos</th><th>NFL</th><th>Owner</th><th>Fantasy Team</th></tr></thead>
            <tbody>
            ${byRound[r].map(p => {
                const dim = filterOwner && p.manager !== filterOwner;
                const style = dim ? "opacity:0.25" : "";
                return `<tr style="${style}">
                    <td>${p.pick}</td>
                    <td><strong>${p.player}</strong></td>
                    <td>${p.position}</td>
                    <td>${p.nflTeam}</td>
                    <td>${p.manager}</td>
                    <td class="muted">${p.fantasyTeam}</td>
                </tr>`;
            }).join("")}
            </tbody>
        </table>
    `).join("");
}

function renderRound1Table() {
    const drafts = STATE.data.drafts;
    const years = Object.keys(drafts).map(Number).sort((a, b) => a - b);
    const owners = [...new Set([].concat(...years.map(y => drafts[y].map(p => p.manager))))].sort();
    // Build {owner: {year: pick}}
    const board = {};
    for (const y of years) {
        for (const p of drafts[y]) {
            if (p.round !== 1) continue;
            (board[p.manager] = board[p.manager] || {})[y] = p;
        }
    }
    const t = document.getElementById("round1-table");
    t.innerHTML = `
        <thead><tr><th>Owner</th>${years.map(y => `<th>${y}</th>`).join("")}</tr></thead>
        <tbody>
        ${owners.map(o => `
            <tr>
                <td><strong>${o}</strong></td>
                ${years.map(y => {
                    const p = board[o]?.[y];
                    if (!p) return `<td class="muted">—</td>`;
                    return `<td title="Pick ${p.pick} (${p.position} - ${p.nflTeam})">
                        <span class="badge">#${p.pick}</span><br>
                        <small>${p.player}</small>
                    </td>`;
                }).join("")}
            </tr>
        `).join("")}
        </tbody>
    `;
}

function renderDraftPositionsChart() {
    const stats = STATE.data.draftOwnerStats || {};
    const owners = Object.keys(stats).sort();
    // Top positions across the league
    const allPositions = new Set();
    owners.forEach(o => Object.keys(stats[o].positionCounts || {}).forEach(p => allPositions.add(p)));
    const standardOrder = ["QB", "RB", "WR", "TE", "K", "DEF"];
    const positions = standardOrder.filter(p => allPositions.has(p))
        .concat([...allPositions].filter(p => !standardOrder.includes(p)));
    const palette = {
        QB: "#38bdf8", RB: "#4ade80", WR: "#fbbf24", TE: "#a78bfa",
        K: "#fb923c", DEF: "#f87171"
    };
    const datasets = positions.map(pos => ({
        label: pos,
        data: owners.map(o => stats[o].positionCounts[pos] || 0),
        backgroundColor: palette[pos] || "#94a3b8",
        stack: "pos",
    }));
    const id = "chart-draft-positions";
    if (STATE.charts[id]) STATE.charts[id].destroy();
    STATE.charts[id] = new Chart(document.getElementById(id), {
        type: "bar",
        data: { labels: owners, datasets },
        options: {
            responsive: true,
            plugins: { legend: { position: "bottom" } },
            scales: {
                x: { stacked: true, grid: { display: false } },
                y: { stacked: true, grid: { color: "#1f2937" } },
            },
        },
    });
}

function renderDraftOwnerDetail(name) {
    const stats = (STATE.data.draftOwnerStats || {})[name];
    const body = document.getElementById("draft-owner-body");
    if (!stats) { body.innerHTML = `<p class="muted">No draft data for ${name}.</p>`; return; }

    const round1Rows = stats.round1Picks.map(p =>
        `<tr><td>${p.year}</td><td>#${p.pick}</td><td><strong>${p.player}</strong></td><td>${p.position} - ${p.nflTeam}</td></tr>`
    ).join("");

    const recurringRows = stats.recurringPlayers.length
        ? stats.recurringPlayers.map(r => {
            const summary = r.picks.map(p => `${p.year} (R${p.round}, #${p.pick})`).join(" · ");
            return `<tr><td><strong>${r.player}</strong></td><td>${r.times}×</td><td class="muted">${summary}</td></tr>`;
          }).join("")
        : `<tr><td colspan="3" class="muted">No players drafted more than once.</td></tr>`;

    const posRows = Object.entries(stats.positionCounts)
        .sort((a, b) => b[1] - a[1])
        .map(([pos, n]) => {
            const avg = stats.avgPickByPosition[pos];
            return `<tr><td>${pos}</td><td>${n}</td><td>${avg != null ? avg : "-"}</td></tr>`;
        }).join("");

    body.innerHTML = `
        <div class="season-summary">
            <div class="tile"><div class="lbl">Total Picks</div><div class="val">${stats.totalPicks}</div></div>
            <div class="tile"><div class="lbl">Round 1 Picks</div><div class="val">${stats.round1Picks.length}</div></div>
            <div class="tile"><div class="lbl">Repeat Players</div><div class="val">${stats.recurringPlayers.length}</div></div>
        </div>
        <div class="grid-two">
            <div>
                <h4>1st-Round Picks</h4>
                <table class="data-table">
                    <thead><tr><th>Year</th><th>Pick</th><th>Player</th><th>Pos / NFL</th></tr></thead>
                    <tbody>${round1Rows}</tbody>
                </table>
            </div>
            <div>
                <h4>Position Tendencies</h4>
                <table class="data-table">
                    <thead><tr><th>Pos</th><th>Total drafted</th><th>Avg overall pick</th></tr></thead>
                    <tbody>${posRows}</tbody>
                </table>
            </div>
        </div>
        <h4 style="margin-top:1rem">Players drafted in multiple seasons</h4>
        <table class="data-table">
            <thead><tr><th>Player</th><th>Times</th><th>When</th></tr></thead>
            <tbody>${recurringRows}</tbody>
        </table>
    `;
}

// ---------- Franchise Leaders ----------
const FRANCHISE_STATE = { owner: null, pos: "", sortField: "startPts", sortDir: "desc" };

function initFranchisePanel() {
    const byOwner = STATE.data.playersByOwner || {};
    const owners = Object.keys(byOwner).sort();
    if (!owners.length) return;
    renderFranchiseGoats(owners, byOwner);
    const sel = document.getElementById("franchise-owner");
    sel.innerHTML = owners.map(n => `<option value="${n}">${n}</option>`).join("");
    FRANCHISE_STATE.owner = owners[0];
    sel.addEventListener("change", () => {
        FRANCHISE_STATE.owner = sel.value;
        renderFranchise();
    });
    const posSel = document.getElementById("franchise-pos");
    posSel.addEventListener("change", () => {
        FRANCHISE_STATE.pos = posSel.value;
        renderFranchise();
    });
    renderFranchise();
}

const ESPN_HEADSHOT = id => `https://a.espncdn.com/i/headshots/nfl/players/full/${id}.png`;
const PLAYER_PLACEHOLDER = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><circle cx='50' cy='38' r='18' fill='%23334155'/><rect x='22' y='60' width='56' height='40' rx='22' fill='%23334155'/></svg>";

function renderFranchiseGoats(owners, byOwner) {
    const host = document.getElementById("franchise-goats");
    const cards = owners.map(owner => {
        const top = (byOwner[owner] || [])[0];
        if (!top) return "";
        const name = top.fullName || top.display;
        const img = top.espnId ? ESPN_HEADSHOT(top.espnId) : PLAYER_PLACEHOLDER;
        const years = top.seasons.length === 1
            ? top.seasons[0]
            : `${top.seasons[0]}–${top.seasons[top.seasons.length - 1]}`;
        return `
            <div class="goat-card" title="Click a manager below for the full roster of scorers">
                <div class="owner">${owner}</div>
                <img class="photo" src="${img}" alt="${name}"
                     onerror="this.onerror=null;this.src='${PLAYER_PLACEHOLDER}';">
                <div class="player">${name}</div>
                <div class="meta">${top.pos} · ${years}</div>
                <div class="pts">${fmt(top.startPts)}</div>
                <div class="sub">${top.starts} starts · ${fmt(top.avgPerStart)} avg</div>
            </div>`;
    }).join("");
    host.innerHTML = cards;
}

function renderFranchise() {
    const t = document.getElementById("franchise-table");
    const owner = FRANCHISE_STATE.owner;
    const posFilter = FRANCHISE_STATE.pos;
    const all = STATE.data.playersByOwner[owner] || [];
    const rows = posFilter ? all.filter(p => p.pos === posFilter) : all;
    const { sortField, sortDir } = FRANCHISE_STATE;
    const sortVal = (p, field) => {
        if (field === "seasonsLen") return p.seasons.length;
        if (field === "bestWeek") return p.bestWeek ? p.bestWeek.points : 0;
        if (field === "seasons") return p.seasons[p.seasons.length - 1] || 0;
        return p[field];
    };
    const sorted = [...rows].sort((a, b) => {
        const av = sortVal(a, sortField), bv = sortVal(b, sortField);
        if (typeof av === "number") return sortDir === "desc" ? bv - av : av - bv;
        return sortDir === "desc" ? String(bv).localeCompare(String(av)) : String(av).localeCompare(String(bv));
    });
    const cols = [
        { field: "display",     label: "Name",
          render: p => `<span data-goto-player="${p.key}">${p.display}</span>` },
        { field: "pos",         label: "Pos" },
        { field: "startPts",    label: "Pts Scored",   align: "right", fmt: v => fmt(v) },
        { field: "benchPts",    label: "Bench Pts",    align: "right", fmt: v => fmt(v) },
        { field: "starts",      label: "Started",      align: "right" },
        { field: "benchApps",   label: "Benched",      align: "right" },
        { field: "avgPerStart", label: "Avg / Start",  align: "right", fmt: v => fmt(v) },
        { field: "bestWeek",    label: "Best Week",    render: p => {
            const bw = p.bestWeek;
            if (!bw) return "-";
            const opp = bw.opponent ? ` vs ${bw.opponent}` : "";
            return `${fmt(bw.points)} <span class="muted">(wk ${bw.week}, ${bw.year}${opp})</span>`;
        }},
        { field: "seasonsLen",  label: "Seasons",      align: "right", render: p => p.seasons.length },
        { field: "seasons",     label: "Years",        render: p => p.seasons.join(" ") },
    ];
    t.innerHTML = `
        <thead><tr>${cols.map(c => {
            const align = c.align === "right" ? ' class="right"' : "";
            const dirAttr = c.field === sortField ? ` data-sort-dir="${sortDir}"` : "";
            return `<th${align}${dirAttr}>${c.label}</th>`;
        }).join("")}</tr></thead>
        <tbody>
            ${sorted.map(p => `<tr>${cols.map(c => {
                const align = c.align === "right" ? ' class="right"' : "";
                let val;
                if (c.render) val = c.render(p);
                else if (c.fmt) val = c.fmt(p[c.field]);
                else val = p[c.field];
                return `<td${align}>${val}</td>`;
            }).join("")}</tr>`).join("")}
        </tbody>
    `;
    // Sorting is handled by the generic .data-table click delegate below.
}

// ---------- Frivolities ----------
const FRIVOLITIES = [
    { id: "upsets",   title: "Biggest Upsets",     icon: "🙃",
      desc: "David vs Goliath games where the heavy favorite lost.",
      preview: (d) => (d.biggestUpsets || [])[0],
      previewText: (r) => `${r.year} wk${r.week}: <strong>${r.winner}</strong> beat ${r.loser} ${fmt(r.winnerPts)}–${fmt(r.loserPts)}` },
    { id: "carries",  title: "Biggest Carry Jobs", icon: "💪",
      desc: "Wins where one starter put the team on their back.",
      preview: (d) => (d.biggestCarries || [])[0],
      previewText: (r) => `${r.year} wk${r.week}: <strong>${r.player}</strong> = ${(r.pct * 100).toFixed(1)}% of ${r.owner}'s pts` },
    { id: "even",     title: "Most Balanced Wins", icon: "⚖️",
      desc: "Every starter contributed — low-variance team days.",
      preview: (d) => (d.mostEvenGames || [])[0],
      previewText: (r) => `${r.year} wk${r.week}: <strong>${r.owner}</strong> CV ${r.cv.toFixed(3)}, mean ${fmt(r.mean)}` },
    { id: "touches",  title: "Most Efficient Wins", icon: "🎯",
      desc: "Highest team-wide points per touch in a win.",
      preview: (d) => (d.mostEfficientWins || [])[0],
      previewText: (r) => `${r.year} wk${r.week}: <strong>${r.owner}</strong> ${fmt(r.offPts)} on ${r.touches} touches = ${fmt(r.ptsPerTouch)}/touch` },
    { id: "goat",     title: "GOAT Teams",         icon: "🏆",
      desc: "All-time best team-seasons by composite score.",
      preview: (d) => (d.goatTeams || [])[0],
      previewText: (r) => `${r.year} <strong>${r.owner}</strong> (${r.record}) — ${fmt(r.composite, 1)}` },
    { id: "winning",  title: "Winning Players",    icon: "🏆",
      desc: "Championship-roster appearances & win % as a starter.",
      preview: (d) => (d.winningPlayers || [])[0],
      previewText: (r) => `<strong>${r.display}</strong> ${r.pos} — ${r.chipAppearances} chips, ${(r.winPct * 100).toFixed(1)}% win rate (${r.starts} starts)` },
    { id: "mia",      title: "Mia Khalifa's",      icon: "💋",
      desc: "The most passed-around players in league history.",
      preview: (d) => (d.miaKhalifas || []).find(p => p.pos !== "K" && p.pos !== "DEF") || (d.miaKhalifas || [])[0],
      previewText: (r) => `<strong>${r.display}</strong> ${r.pos} — ${r.uniqueOwners} different managers, ${r.transitions} transitions` },
    { id: "drops",    title: "Worst Drops OAT",    icon: "🪣",
      desc: "The ones you let get away for free. Trades excluded.",
      preview: (d) => (d.worstDrops || [])[0],
      previewText: (r) => `<strong>${r.droppedBy}</strong> cut ${r.display} ${r.year} wk${r.droppedAfterWeek} → ${fmt(r.laterPts)} pts elsewhere` },
    { id: "odds",     title: "Playoff Odds",       icon: "🎲",
      desc: "Live Monte Carlo projection for the in-progress season.",
      preview: (d) => (d.playoffOdds && d.playoffOdds.teams) ? d.playoffOdds.teams[0] : null,
      previewText: (r) => `<strong>${r.owner}</strong> — ${(r.playoffPct * 100).toFixed(1)}% to make it` },
    { id: "onestart", title: "The One Start Club", icon: "☕",
      desc: "Players started exactly once in league history.",
      preview: (d) => (d.oneStartClub || [])[0],
      previewText: (r) => `<strong>${r.display}</strong> ${r.pos} — ${fmt(r.points)} pts, ${r.year} wk${r.week} (${r.owner})` },
];

function initFrivolitiesPanel() {
    // Render each frivolity's content once (hidden by default)
    renderBiggestUpsets();
    renderBiggestCarries();
    renderMostEvenGames();
    renderMostEfficientWins();
    renderGoatTeams();
    renderOneStartClub();
    renderPlayoffOdds();
    renderWinningPlayers();
    renderMiaKhalifas();
    renderWorstDrops();

    // Build the nav grid
    const nav = document.getElementById("frivolities-nav");
    nav.innerHTML = FRIVOLITIES.map(f => {
        const p = f.preview(STATE.data);
        const previewHTML = p ? `<div class="friv-preview">${f.previewText(p)}</div>` : "";
        return `<div class="friv-card" data-friv="${f.id}">
            <div class="friv-icon">${f.icon}</div>
            <h4>${f.title}</h4>
            <div class="friv-desc">${f.desc}</div>
            ${previewHTML}
        </div>`;
    }).join("");
    nav.querySelectorAll(".friv-card").forEach(card => {
        card.addEventListener("click", () => showFrivolity(card.dataset.friv));
    });
    document.getElementById("frivolities-back").addEventListener("click", showFrivolityNav);
}

function showFrivolity(id) {
    document.getElementById("frivolities-nav").style.display = "none";
    document.getElementById("frivolities-detail").style.display = "block";
    document.querySelectorAll("#frivolities-detail .friv-detail").forEach(el => {
        el.style.display = el.id === `friv-${id}` ? "" : "none";
    });
    window.scrollTo({ top: document.getElementById("panel-frivolities").offsetTop - 20, behavior: "smooth" });
}

function showFrivolityNav() {
    document.getElementById("frivolities-nav").style.display = "";
    document.getElementById("frivolities-detail").style.display = "none";
}

function renderMostEvenGames() {
    const t = document.getElementById("even-games-table");
    const rows = STATE.data.mostEvenGames || [];
    if (!rows.length) { t.innerHTML = `<tbody><tr><td class="muted">no data</td></tr></tbody>`; return; }
    const body = rows.map((r, i) => `
        <tr data-goto-game data-game-year="${r.year}" data-game-week="${r.week}" data-game-a="${r.owner}" data-game-b="${r.opponent}">
            <td class="right">${i + 1}</td>
            <td>${r.year}</td>
            <td>${r.week}</td>
            <td><strong>${r.owner}</strong></td>
            <td class="right">${fmt(r.teamPts)}</td>
            <td class="right">${fmt(r.mean)}</td>
            <td class="right">${fmt(r.std)}</td>
            <td class="right"><strong>${r.cv.toFixed(3)}</strong></td>
            <td>${r.topPlayer} <span class="muted">${r.topPos} ${fmt(r.topPts)}</span></td>
            <td>${r.opponent} <span class="muted">(${fmt(r.opponentPts)})</span></td>
        </tr>`).join("");
    t.innerHTML = `
        <thead><tr>
            <th class="right">#</th><th>Year</th><th>Wk</th>
            <th>Owner</th>
            <th class="right">Team Pts</th>
            <th class="right">Mean</th>
            <th class="right">Std</th>
            <th class="right" title="Coefficient of variation: std / mean. Lower = more even.">CV</th>
            <th>Top Scorer</th>
            <th>Opponent</th>
        </tr></thead>
        <tbody>${body}</tbody>
    `;
}

function renderMostEfficientWins() {
    const t = document.getElementById("touches-table");
    const rows = STATE.data.mostEfficientWins || [];
    if (!rows.length) { t.innerHTML = `<tbody><tr><td class="muted">no data</td></tr></tbody>`; return; }
    const body = rows.map((r, i) => `
        <tr data-goto-game data-game-year="${r.year}" data-game-week="${r.week}" data-game-a="${r.owner}" data-game-b="${r.opponent}">
            <td class="right">${i + 1}</td>
            <td>${r.year}</td>
            <td>${r.week}</td>
            <td><strong>${r.owner}</strong></td>
            <td class="right" title="Starter pts from QB/RB/WR/TE only (K and DEF don't have touches)">${fmt(r.offPts)}</td>
            <td class="right">${r.touches}</td>
            <td class="right"><strong>${fmt(r.ptsPerTouch)}</strong></td>
            <td>${r.topPlayer} <span class="muted">${r.topPos} ${fmt(r.topPts)}</span></td>
            <td class="right">${fmt(r.finalPts)}</td>
            <td>${r.opponent} <span class="muted">(${fmt(r.opponentPts)})</span></td>
        </tr>`).join("");
    t.innerHTML = `
        <thead><tr>
            <th class="right">#</th><th>Year</th><th>Wk</th>
            <th>Owner</th>
            <th class="right" title="Starter fantasy pts from QB/RB/WR/TE only">Off Pts</th>
            <th class="right">Touches</th>
            <th class="right" title="Offensive pts ÷ touches">Pts/Touch</th>
            <th>Top Scorer</th>
            <th class="right">Final</th>
            <th>Opponent</th>
        </tr></thead>
        <tbody>${body}</tbody>
    `;
}

function renderGoatTeams() {
    const t = document.getElementById("goat-teams-table");
    const teams = STATE.data.goatTeams || [];
    if (!teams.length) {
        t.innerHTML = `<tbody><tr><td class="muted">No teams scored yet.</td></tr></tbody>`;
        return;
    }
    const breakdown = (g) =>
        `PPG ${fmt(g.ppgScore)} + AP ${fmt(g.allPlayScore)} + SS ${fmt(g.startSitScore)} + Elite ${fmt(g.eliteScore)}${g.champBonus ? " + Ring +15" : ""}`;
    const rows = teams.map((g, i) => `
        <tr>
            <td class="right">${i + 1}</td>
            <td>${g.year}</td>
            <td><strong>${g.owner}</strong></td>
            <td>${g.team}</td>
            <td>${g.record}${g.champion ? " 🏆" : ""}</td>
            <td class="right">${fmt(g.ppg)}</td>
            <td class="right">${(g.allPlayWinPct * 100).toFixed(1)}%</td>
            <td class="right">${(g.startSitEff * 100).toFixed(1)}%</td>
            <td class="right">${g.elitePlayers}</td>
            <td class="right" title="${breakdown(g)}"><strong>${fmt(g.composite, 1)}</strong></td>
        </tr>`).join("");
    t.innerHTML = `
        <thead><tr>
            <th class="right">#</th><th>Year</th>
            <th>Owner</th><th>Team</th>
            <th>Record</th>
            <th class="right" title="Points per game">PPG</th>
            <th class="right" title="Win % if you played every other team each week">All-Play %</th>
            <th class="right" title="Starter pts / optimal lineup pts across the season">Start/Sit %</th>
            <th class="right" title="Top-10 at QB/RB/WR/TE rostered this season">Elite</th>
            <th class="right" title="Composite out of 100 (hover for breakdown)">Score</th>
        </tr></thead>
        <tbody>${rows}</tbody>
    `;
}

function renderBiggestUpsets() {
    const t = document.getElementById("upsets-table");
    const upsets = STATE.data.biggestUpsets || [];
    if (!upsets.length) {
        t.innerHTML = `<tbody><tr><td class="muted">No upsets yet (need multiple weeks of data).</td></tr></tbody>`;
        return;
    }
    const rows = upsets.map((u, i) => `
        <tr data-goto-game data-game-year="${u.year}" data-game-week="${u.week}" data-game-a="${u.winner}" data-game-b="${u.loser}">
            <td class="right">${i + 1}</td>
            <td>${u.year}</td>
            <td>${u.week}</td>
            <td><strong>${u.winner}</strong> <span class="muted">(${u.winnerPreRecord}, ${fmt(u.winnerPrePPG)} PPG)</span></td>
            <td class="right">${fmt(u.winnerPts)} – ${fmt(u.loserPts)}</td>
            <td>${u.loser} <span class="muted">(${u.loserPreRecord}, ${fmt(u.loserPrePPG)} PPG)</span></td>
            <td class="right">${u.ppgDiff > 0 ? "+" : ""}${fmt(u.ppgDiff)}</td>
            <td class="right">${u.winPctDiff > 0 ? "+" : ""}${(u.winPctDiff * 100).toFixed(1)}%</td>
            <td class="right"><strong>${fmt(u.upsetScore, 1)}</strong></td>
        </tr>`).join("");
    t.innerHTML = `
        <thead><tr>
            <th class="right">#</th><th>Year</th><th>Wk</th>
            <th>Winner <span class="muted">(pre)</span></th>
            <th class="right">Score</th>
            <th>Loser <span class="muted">(pre)</span></th>
            <th class="right">PPG Gap</th>
            <th class="right">Win% Gap</th>
            <th class="right">Upset Score</th>
        </tr></thead>
        <tbody>${rows}</tbody>
    `;
}


function renderBiggestCarries() {
    const t = document.getElementById("carries-table");
    const carries = STATE.data.biggestCarries || [];
    if (!carries.length) {
        t.innerHTML = `<tbody><tr><td class="muted">No carry jobs yet.</td></tr></tbody>`;
        return;
    }
    const rows = carries.map((c, i) => `
        <tr data-goto-game data-game-year="${c.year}" data-game-week="${c.week}" data-game-a="${c.owner}" data-game-b="${c.opponent}">
            <td class="right">${i + 1}</td>
            <td>${c.year}</td>
            <td>${c.week}</td>
            <td><strong>${c.owner}</strong></td>
            <td>${c.player} <span class="muted">${c.pos}</span></td>
            <td class="right">${fmt(c.playerPts)}</td>
            <td class="right">${fmt(c.teamPts)}</td>
            <td class="right"><strong>${(c.pct * 100).toFixed(1)}%</strong></td>
            <td>${c.opponent} <span class="muted">(${fmt(c.opponentPts)})</span></td>
        </tr>`).join("");
    t.innerHTML = `
        <thead><tr>
            <th class="right">#</th><th>Year</th><th>Wk</th>
            <th>Owner</th>
            <th>Carrier</th>
            <th class="right">Player Pts</th>
            <th class="right">Team Pts</th>
            <th class="right">Share</th>
            <th>Opponent</th>
        </tr></thead>
        <tbody>${rows}</tbody>
    `;
}

// ---------- Trades ----------
const TRADES_STATE = { year: "all", owner: "", conf: "" };

function initTradesPanel() {
    const trades = STATE.data.trades || [];
    const years = Array.from(new Set(trades.map(t => t.year))).sort((a, b) => b - a);
    const owners = Array.from(new Set(trades.flatMap(t => [t.teamA, t.teamB]))).sort();
    const yearSel = document.getElementById("trades-year");
    yearSel.innerHTML = `<option value="all">All years</option>` +
        years.map(y => `<option value="${y}">${y}</option>`).join("");
    const ownerSel = document.getElementById("trades-owner");
    ownerSel.innerHTML = `<option value="">All</option>` +
        owners.map(o => `<option value="${o}">${o}</option>`).join("");
    const confSel = document.getElementById("trades-conf");
    [yearSel, ownerSel, confSel].forEach(sel => sel.addEventListener("change", () => {
        TRADES_STATE.year = yearSel.value;
        TRADES_STATE.owner = ownerSel.value;
        TRADES_STATE.conf = confSel.value;
        renderTrades();
    }));
    renderTrades();
}

function renderTrades() {
    const t = document.getElementById("trades-table");
    const summary = document.getElementById("trades-summary");
    const all = STATE.data.trades || [];
    const { year, owner, conf } = TRADES_STATE;
    let rows = all;
    if (year && year !== "all") rows = rows.filter(r => r.year === parseInt(year));
    if (owner) rows = rows.filter(r => r.teamA === owner || r.teamB === owner);
    if (conf) rows = rows.filter(r => r.confidence === conf);
    rows = [...rows].sort((a, b) => (b.year - a.year) || (b.week - a.week));
    const hi = rows.filter(r => r.confidence === "high").length;
    const lo = rows.length - hi;
    summary.textContent = `${rows.length} trade${rows.length === 1 ? "" : "s"} — ${hi} high confidence, ${lo} low confidence.`;
    if (!rows.length) {
        t.innerHTML = `<tbody><tr><td class="muted">No trades match.</td></tr></tbody>`;
        return;
    }
    const playersCell = (list) =>
        `<div class="trade-cell">${list.map(p => `${p.display} <span class="pos">${p.pos}</span>`).join("<br>")}</div>`;
    const verdict = (r) => {
        if (r.aScore === 0 && r.bScore === 0) {
            return `<span class="muted">no post-trade starts</span>`;
        }
        const d = r.scoreDelta;
        if (Math.abs(d) < 0.05) return `<span class="muted">wash</span>`;
        const winner = d > 0 ? r.teamA : r.teamB;
        return `<strong>${winner}</strong> <span class="muted">+${fmt(Math.abs(d))}</span>`;
    };
    const scoreTitle = (side) =>
        `Concentration-weighted score: top player 100%, next 50%, next 25%, …\n` +
        `Raw starter pts received: ${fmt(side.total)} across ${side.count} player${side.count === 1 ? "" : "s"} ` +
        `(avg ${fmt(side.per)}/player)`;
    t.innerHTML = `
        <thead><tr>
            <th>Year</th><th>Wk</th>
            <th>Team A</th><th>Gave</th><th class="right">Score</th>
            <th>Team B</th><th>Gave</th><th class="right">Score</th>
            <th>Winner</th>
            <th>Conf</th>
        </tr></thead>
        <tbody>
            ${rows.map(r => {
                const aSide = { total: r.aTotal, per: r.aPerPlayer, count: r.bGave.length };
                const bSide = { total: r.bTotal, per: r.bPerPlayer, count: r.aGave.length };
                return `
                <tr data-goto-game data-game-year="${r.year}" data-game-week="${r.week}" data-game-a="${r.teamA}" data-game-b="${r.teamB}">
                    <td>${r.year}</td>
                    <td>${r.week}</td>
                    <td><strong>${r.teamA}</strong></td>
                    <td>${playersCell(r.aGave)}</td>
                    <td class="right" title="${scoreTitle(aSide)}">${fmt(r.aScore)} <span class="muted">(${fmt(r.aTotal)})</span></td>
                    <td><strong>${r.teamB}</strong></td>
                    <td>${playersCell(r.bGave)}</td>
                    <td class="right" title="${scoreTitle(bSide)}">${fmt(r.bScore)} <span class="muted">(${fmt(r.bTotal)})</span></td>
                    <td>${verdict(r)}</td>
                    <td><span class="conf-badge conf-${r.confidence}">${r.confidence}</span></td>
                </tr>
            `;}).join("")}
        </tbody>
    `;
}

// ---------- Generic click-to-sort for all .data-table tables ----------
// Any <table class="data-table"> gets its columns click-sortable. Opt out
// per-table by adding class "h2h" (used by the Head-to-Head matrix where
// column ordering is semantic, not a sort axis). Cells can override the
// sort value with a data-sort-value attribute; otherwise we pull the first
// number out of the cell's text (stripping commas) and sort numerically,
// falling back to a case-insensitive string compare when the column isn't
// mostly numbers.
document.addEventListener("click", (e) => {
    const th = e.target.closest(".data-table:not(.h2h) thead th");
    if (!th) return;
    const table = th.closest("table");
    if (!table || !table.tBodies[0]) return;
    const header = th.parentElement;
    const headerCells = Array.from(header.children);
    const colIdx = headerCells.indexOf(th);
    const prevDir = th.dataset.sortDir || "";
    const dir = prevDir === "asc" ? "desc" : "asc";
    headerCells.forEach(c => { if (c !== th) c.dataset.sortDir = ""; });
    th.dataset.sortDir = dir;

    const tbody = table.tBodies[0];
    const rows = Array.from(tbody.querySelectorAll(":scope > tr"));
    const extract = (row) => {
        const cell = row.children[colIdx];
        if (!cell) return { n: null, s: "" };
        const explicit = cell.dataset.sortValue;
        if (explicit != null && explicit !== "") {
            const n = parseFloat(explicit);
            return { n: isNaN(n) ? null : n, s: explicit.toLowerCase() };
        }
        const txt = cell.textContent.replace(/,/g, "").trim();
        const m = txt.match(/-?\d+(?:\.\d+)?/);
        return { n: m ? parseFloat(m[0]) : null, s: txt.toLowerCase() };
    };
    const vals = rows.map(extract);
    const numericCount = vals.filter(v => v.n !== null).length;
    const useNumeric = numericCount > vals.length / 2;
    rows.sort((a, b) => {
        const va = extract(a), vb = extract(b);
        let cmp;
        if (useNumeric) {
            const av = va.n == null ? -Infinity : va.n;
            const bv = vb.n == null ? -Infinity : vb.n;
            cmp = av - bv;
        } else {
            cmp = va.s.localeCompare(vb.s);
        }
        return dir === "asc" ? cmp : -cmp;
    });
    rows.forEach(r => tbody.appendChild(r));
});

// ---------- Game History ----------
const GAMES_STATE = { year: "", a: "", b: "", week: "" };

function initGameHistoryPanel() {
    const years = STATE.data.seasons.map(s => s.year).sort((a, b) => b - a);
    const owners = Array.from(new Set(STATE.data.seasons.flatMap(s => s.standings.map(t => t.manager)))).sort();
    const weeks = Array.from(new Set(STATE.data.seasons.flatMap(s => s.weeks.map(w => w.week)))).sort((a, b) => a - b);
    const yr = document.getElementById("games-year");
    const aSel = document.getElementById("games-a");
    const bSel = document.getElementById("games-b");
    const wkSel = document.getElementById("games-week");
    yr.innerHTML = `<option value="">All</option>` + years.map(y => `<option value="${y}">${y}</option>`).join("");
    aSel.innerHTML = `<option value="">Any</option>` + owners.map(o => `<option value="${o}">${o}</option>`).join("");
    bSel.innerHTML = `<option value="">Any</option>` + owners.map(o => `<option value="${o}">${o}</option>`).join("");
    wkSel.innerHTML = `<option value="">Any</option>` + weeks.map(w => `<option value="${w}">${w}</option>`).join("");
    [yr, aSel, bSel, wkSel].forEach(sel => sel.addEventListener("change", () => {
        GAMES_STATE.year = yr.value;
        GAMES_STATE.a = aSel.value;
        GAMES_STATE.b = bSel.value;
        GAMES_STATE.week = wkSel.value;
        renderGameHistory();
    }));
    document.getElementById("games-reset").addEventListener("click", () => {
        yr.value = ""; aSel.value = ""; bSel.value = ""; wkSel.value = "";
        GAMES_STATE.year = GAMES_STATE.a = GAMES_STATE.b = GAMES_STATE.week = "";
        renderGameHistory();
    });
    renderGameHistory();
}

function findMatchingGames() {
    const { year, a, b, week } = GAMES_STATE;
    const yearN = year ? parseInt(year) : null;
    const weekN = week ? parseInt(week) : null;
    const matches = [];
    for (const s of STATE.data.seasons) {
        if (yearN && s.year !== yearN) continue;
        for (const wk of s.weeks) {
            if (weekN && wk.week !== weekN) continue;
            for (const m of wk.matchups) {
                const pair = [m.home, m.away];
                if (a && !pair.includes(a)) continue;
                if (b && !pair.includes(b)) continue;
                if (a && b && a === b) continue;
                matches.push({ year: s.year, week: wk.week, matchup: m });
            }
        }
    }
    matches.sort((x, y) => (y.year - x.year) || (y.week - x.week));
    return matches;
}

function openGameHistory(year, week, a, b) {
    const tab = document.querySelector('.tab[data-tab="games"]');
    if (tab) tab.click();
    GAMES_STATE.year = year ? String(year) : "";
    GAMES_STATE.week = week ? String(week) : "";
    GAMES_STATE.a = a || "";
    GAMES_STATE.b = b || "";
    document.getElementById("games-year").value = GAMES_STATE.year;
    document.getElementById("games-a").value = GAMES_STATE.a;
    document.getElementById("games-b").value = GAMES_STATE.b;
    document.getElementById("games-week").value = GAMES_STATE.week;
    renderGameHistory();
    document.getElementById("panel-games").scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderGameHistory() {
    const body = document.getElementById("games-body");
    const matches = findMatchingGames();
    if (!matches.length) {
        body.innerHTML = `<p class="muted">No games match these filters.</p>`;
        return;
    }
    if (matches.length === 1) {
        body.innerHTML = renderGameDetail(matches[0]);
        return;
    }
    // Multiple matches — show list
    body.innerHTML = `
        <p class="muted">${matches.length} games match. Click one for the full breakdown.</p>
        <div class="scroll-x"><table class="data-table h2h">
            <thead><tr><th>Year</th><th>Wk</th><th>Home</th><th class="right">Score</th><th>Away</th><th class="right">Score</th><th>Winner</th></tr></thead>
            <tbody>
                ${matches.map(g => {
                    const m = g.matchup;
                    const winner = m.homePts > m.awayPts ? m.home : (m.awayPts > m.homePts ? m.away : "tie");
                    return `<tr class="games-list-row" data-goto-game data-game-year="${g.year}" data-game-week="${g.week}" data-game-a="${m.home}" data-game-b="${m.away}">
                        <td>${g.year}</td>
                        <td>${g.week}</td>
                        <td>${m.home}</td>
                        <td class="right">${fmt(m.homePts)}</td>
                        <td>${m.away}</td>
                        <td class="right">${fmt(m.awayPts)}</td>
                        <td><strong>${winner}</strong></td>
                    </tr>`;
                }).join("")}
            </tbody>
        </table></div>
    `;
}

function renderGameDetail(g) {
    const m = g.matchup;
    const homeWon = m.homePts > m.awayPts;
    const awayWon = m.awayPts > m.homePts;
    const homeTop = Math.max(0, ...m.homeLineup.filter(p => !["BN","RES"].includes(p.slot)).map(p => p.pts));
    const awayTop = Math.max(0, ...m.awayLineup.filter(p => !["BN","RES"].includes(p.slot)).map(p => p.pts));
    const lineupTable = (lineup, topStarterPts) => {
        if (!lineup.length) return `<p class="muted">no lineup data</p>`;
        const starters = lineup.filter(p => !["BN","RES"].includes(p.slot));
        const bench = lineup.filter(p => p.slot === "BN");
        const ir = lineup.filter(p => p.slot === "RES");
        const starterTotal = starters.reduce((s, p) => s + p.pts, 0);
        const benchTotal = bench.reduce((s, p) => s + p.pts, 0);
        const row = (p) => {
            const top = p.pts === topStarterPts && topStarterPts > 0 && !["BN","RES"].includes(p.slot);
            return `<tr${top ? ' class="top-scorer"' : ''}>
                <td class="slot">${p.slot}</td>
                <td>${p.player} <span class="pos">${p.pos}</span></td>
                <td class="pts">${fmt(p.pts)}</td>
            </tr>`;
        };
        return `<table class="lineup-table">
            <thead><tr><th>Slot</th><th>Player</th><th class="right">Pts</th></tr></thead>
            <tbody>
                ${starters.map(row).join("")}
                <tr class="totals"><td></td><td>Starter total</td><td class="pts">${fmt(starterTotal)}</td></tr>
                ${bench.length ? `<tr class="section-header"><td colspan="3">Bench</td></tr>` + bench.map(row).join("") : ""}
                ${bench.length ? `<tr class="totals"><td></td><td>Bench total</td><td class="pts">${fmt(benchTotal)}</td></tr>` : ""}
                ${ir.length ? `<tr class="section-header"><td colspan="3">IR</td></tr>` + ir.map(row).join("") : ""}
            </tbody>
        </table>`;
    };
    const homeTeam = findTeam(g.year, m.home);
    const awayTeam = findTeam(g.year, m.away);
    return `
        <div class="game-detail-header">
            <div class="side">
                <div class="owner">${m.home}</div>
                <div class="team">${homeTeam ? homeTeam.team : ""}</div>
                <div class="score ${homeWon ? "" : (awayWon ? "lost" : "")}">${fmt(m.homePts)}</div>
            </div>
            <div class="vs">${g.year} · Week ${g.week}</div>
            <div class="side">
                <div class="owner">${m.away}</div>
                <div class="team">${awayTeam ? awayTeam.team : ""}</div>
                <div class="score ${awayWon ? "" : (homeWon ? "lost" : "")}">${fmt(m.awayPts)}</div>
            </div>
        </div>
        <div class="game-detail-grid">
            <div>${lineupTable(m.homeLineup, homeTop)}</div>
            <div>${lineupTable(m.awayLineup, awayTop)}</div>
        </div>
    `;
}

function findTeam(year, manager) {
    const s = STATE.data.seasons.find(x => x.year === year);
    if (!s) return null;
    return s.standings.find(t => t.manager === manager);
}

// Global deep-link: any element with [data-goto-game] opens Game History
// with the game pre-selected. Attributes: data-game-year, data-game-week,
// data-game-a (first manager), data-game-b (second manager, optional).
document.addEventListener("click", (e) => {
    // Player links sit inside game rows; let them take precedence.
    if (e.target.closest("[data-goto-player]")) return;
    const target = e.target.closest("[data-goto-game]");
    if (!target) return;
    const { gameYear, gameWeek, gameA, gameB } = target.dataset;
    if (!gameYear) return;
    e.preventDefault();
    openGameHistory(gameYear, gameWeek, gameA, gameB);
});

function renderOneStartClub() {
    const t = document.getElementById("onestart-table");
    const rows = STATE.data.oneStartClub || [];
    if (!rows.length) { t.innerHTML = `<tbody><tr><td class="muted">no data</td></tr></tbody>`; return; }
    const body = rows.map((r, i) => `
        <tr data-goto-game data-game-year="${r.year}" data-game-week="${r.week}" data-game-a="${r.owner}">
            <td class="right">${i + 1}</td>
            <td><span data-goto-player="${r.key}">${r.display}</span> <span class="muted">${r.pos}</span></td>
            <td class="right"><strong>${fmt(r.points)}</strong></td>
            <td>${r.year}</td>
            <td>${r.week}</td>
            <td>${r.owner}</td>
            <td class="right">${r.benchApps}</td>
        </tr>`).join("");
    t.innerHTML = `
        <thead><tr>
            <th class="right">#</th>
            <th>Player</th>
            <th class="right">Pts</th>
            <th>Year</th>
            <th>Wk</th>
            <th>Started by</th>
            <th class="right" title="Weeks the player was on this owner's bench">Benched</th>
        </tr></thead>
        <tbody>${body}</tbody>
    `;
}

// ---------- Players ----------
let PLAYER_LIST = [];        // [{key, display, pos, totalPoints, starts, benchApps, seasons, owners, espnId, weekHighInfo}]
let PLAYER_BY_LABEL = {};    // "D. Adams WR" -> key

function initPlayersPanel() {
    const career = STATE.data.playersCareer || {};
    PLAYER_LIST = Object.entries(career).map(([key, v]) => ({ key, ...v }))
        .filter(p => p.display && p.display !== "-")
        .sort((a, b) => b.totalPoints - a.totalPoints);
    const dl = document.getElementById("players-datalist");
    PLAYER_BY_LABEL = {};
    const seen = new Set();
    const options = [];
    for (const p of PLAYER_LIST) {
        const niceName = p.fullName || p.display;
        const label = `${niceName} (${p.pos})`;
        if (seen.has(label)) continue;
        seen.add(label);
        PLAYER_BY_LABEL[label] = p.key;
        PLAYER_BY_LABEL[niceName] = p.key;    // allow bare full name
        PLAYER_BY_LABEL[p.display] = p.key;   // and the first-initial form
        options.push(`<option value="${label}"></option>`);
    }
    dl.innerHTML = options.join("");
    const search = document.getElementById("players-search");
    const pos = document.getElementById("players-pos");
    search.addEventListener("input", () => tryRenderPlayer(search.value));
    search.addEventListener("change", () => tryRenderPlayer(search.value));
    pos.addEventListener("change", () => filterDatalist(pos.value));
    document.getElementById("players-reset").addEventListener("click", () => {
        search.value = ""; pos.value = "";
        filterDatalist("");
        document.getElementById("players-body").innerHTML =
            `<p class="muted">Start typing a player name above.</p>`;
    });
    document.getElementById("players-body").innerHTML =
        `<p class="muted">Start typing a player name above. ${PLAYER_LIST.length} players in the index.</p>`;
}

function filterDatalist(posFilter) {
    const dl = document.getElementById("players-datalist");
    const seen = new Set();
    const opts = [];
    for (const p of PLAYER_LIST) {
        if (posFilter && p.pos !== posFilter) continue;
        const niceName = p.fullName || p.display;
        const label = `${niceName} (${p.pos})`;
        if (seen.has(label)) continue;
        seen.add(label);
        opts.push(`<option value="${label}"></option>`);
    }
    dl.innerHTML = opts.join("");
}

function tryRenderPlayer(value) {
    const v = (value || "").trim();
    if (!v) return;
    const key = PLAYER_BY_LABEL[v];
    if (!key) return;  // user still typing
    const player = PLAYER_LIST.find(p => p.key === key);
    if (player) renderPlayerDetail(player);
}

function openPlayer(key) {
    const player = PLAYER_LIST.find(p => p.key === key);
    if (!player) return;
    const tab = document.querySelector('.tab[data-tab="players"]');
    if (tab) tab.click();
    const search = document.getElementById("players-search");
    search.value = `${player.fullName || player.display} (${player.pos})`;
    renderPlayerDetail(player);
    document.getElementById("panel-players").scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderPlayerDetail(player) {
    const body = document.getElementById("players-body");
    // Per-owner split from playersByOwner
    const perOwner = [];
    for (const [owner, playerList] of Object.entries(STATE.data.playersByOwner || {})) {
        const rec = playerList.find(p => p.key === player.key);
        if (rec) perOwner.push({ owner, ...rec });
    }
    perOwner.sort((a, b) => b.startPts - a.startPts);

    // Game log — scan every matchup lineup for this player's key
    const games = [];
    for (const s of STATE.data.seasons) {
        for (const wk of s.weeks) {
            for (const m of wk.matchups) {
                for (const [owner, lineup, opp, oppPts] of [
                    [m.home, m.homeLineup, m.away, m.awayPts],
                    [m.away, m.awayLineup, m.home, m.homePts],
                ]) {
                    for (const entry of lineup || []) {
                        if (entry.key !== player.key) continue;
                        games.push({
                            year: s.year, week: wk.week,
                            owner, opp, oppPts,
                            slot: entry.slot, pts: entry.pts,
                            started: !["BN", "RES"].includes(entry.slot),
                        });
                    }
                }
            }
        }
    }
    games.sort((a, b) => (b.year - a.year) || (b.week - a.week));

    const img = player.espnId
        ? `https://a.espncdn.com/i/headshots/nfl/players/full/${player.espnId}.png`
        : "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><circle cx='50' cy='38' r='18' fill='%23334155'/><rect x='22' y='60' width='56' height='40' rx='22' fill='%23334155'/></svg>";
    const name = player.fullName || player.display;
    const yrs = player.seasons.length
        ? (player.seasons.length === 1
            ? String(player.seasons[0])
            : `${player.seasons[0]}–${player.seasons[player.seasons.length - 1]}`)
        : "";
    const avgPerStart = player.starts ? (player.totalPoints / player.starts) : 0;
    // Totals for tiles
    const totalBenchPts = games.filter(g => !g.started).reduce((s, g) => s + g.pts, 0);

    const perOwnerRows = perOwner.map(o => `
        <tr>
            <td><strong data-goto-owner="${o.owner}">${o.owner}</strong></td>
            <td class="right">${fmt(o.startPts)}</td>
            <td class="right">${fmt(o.benchPts)}</td>
            <td class="right">${o.starts}</td>
            <td class="right">${o.benchApps}</td>
            <td class="right">${fmt(o.avgPerStart)}</td>
            <td>${o.seasons.join(" ")}</td>
            <td>${o.bestWeek ? `${fmt(o.bestWeek.points)} <span class="muted">(wk ${o.bestWeek.week}, ${o.bestWeek.year}${o.bestWeek.opponent ? " vs " + o.bestWeek.opponent : ""})</span>` : "-"}</td>
        </tr>`).join("");

    const gameRows = games.map(g => `
        <tr data-goto-game data-game-year="${g.year}" data-game-week="${g.week}" data-game-a="${g.owner}" data-game-b="${g.opp}">
            <td>${g.year}</td>
            <td>${g.week}</td>
            <td>${g.owner}</td>
            <td class="muted">${g.slot}</td>
            <td class="right"><strong>${fmt(g.pts)}</strong></td>
            <td>${g.opp} <span class="muted">(${fmt(g.oppPts)})</span></td>
        </tr>`).join("");

    body.innerHTML = `
        <div class="player-header">
            <img class="photo" src="${img}" alt="${name}" onerror="this.onerror=null;this.src='data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><circle cx=%2250%22 cy=%2238%22 r=%2218%22 fill=%22%23334155%22/><rect x=%2222%22 y=%2260%22 width=%2256%22 height=%2240%22 rx=%2222%22 fill=%22%23334155%22/></svg>';">
            <div class="meta">
                <div class="name">${name}</div>
                <div class="sub">${player.pos} · ${yrs}${player.team ? ` · last on ${player.team}` : ""}</div>
            </div>
        </div>
        <div class="player-tiles">
            <div class="tile"><div class="lbl">Career Pts</div><div class="val">${fmt(player.totalPoints)}</div></div>
            <div class="tile"><div class="lbl">Starts</div><div class="val">${player.starts}</div></div>
            <div class="tile"><div class="lbl">Bench Apps</div><div class="val">${player.benchApps}</div></div>
            <div class="tile"><div class="lbl">Avg / Start</div><div class="val">${fmt(avgPerStart)}</div></div>
            <div class="tile"><div class="lbl">Bench Pts</div><div class="val">${fmt(totalBenchPts)}</div></div>
            <div class="tile"><div class="lbl">Best Week</div><div class="val">${player.weekHigh ? fmt(player.weekHigh) : "-"}</div></div>
            <div class="tile"><div class="lbl">Seasons</div><div class="val">${player.seasons.length}</div></div>
            <div class="tile"><div class="lbl">Managers</div><div class="val">${perOwner.length}</div></div>
        </div>

        <div class="player-section-title">By manager</div>
        <div class="scroll-x"><table class="data-table">
            <thead><tr>
                <th>Owner</th>
                <th class="right">Start Pts</th>
                <th class="right">Bench Pts</th>
                <th class="right">Started</th>
                <th class="right">Benched</th>
                <th class="right">Avg / Start</th>
                <th>Years</th>
                <th>Best Week</th>
            </tr></thead>
            <tbody>${perOwnerRows}</tbody>
        </table></div>

        <div class="player-section-title">Game log (${games.length})</div>
        <div class="scroll-x"><table class="data-table">
            <thead><tr>
                <th>Year</th><th>Wk</th><th>Owner</th><th>Slot</th>
                <th class="right">Pts</th><th>Opponent</th>
            </tr></thead>
            <tbody>${gameRows}</tbody>
        </table></div>
    `;
}

// Deep-link: any [data-goto-player] opens that player
document.addEventListener("click", (e) => {
    const target = e.target.closest("[data-goto-player]");
    if (!target) return;
    const key = target.dataset.gotoPlayer;
    if (!key) return;
    e.preventDefault();
    openPlayer(key);
});

function renderPlayoffOdds() {
    const t = document.getElementById("odds-table");
    const summary = document.getElementById("odds-summary");
    const odds = STATE.data.playoffOdds;
    if (!odds || !odds.teams || !odds.teams.length) {
        if (t) t.innerHTML = `<tbody><tr><td class="muted">No in-progress season — playoff odds don't apply until the regular season is live.</td></tr></tbody>`;
        if (summary) summary.textContent = "";
        return;
    }
    const total = odds.teams.reduce((s, r) => s + r.playoffPct, 0);
    summary.textContent = `${odds.year} season, through week ${odds.weeksPlayed} of ${odds.regSeasonWeeks} · ${odds.sims.toLocaleString()} simulations · top ${odds.playoffCount} make playoffs · total odds = ${(total * 100).toFixed(1)}%`;
    const bar = (pct) => {
        const w = Math.max(0.8, Math.min(100, pct * 100));
        const hue = Math.round(pct * 120); // 0 = red, 1 = green
        return `<div style="position:relative;background:#1f2937;border-radius:4px;height:16px;min-width:70px"><div style="position:absolute;top:0;left:0;height:100%;width:${w}%;background:hsl(${hue},70%,45%);border-radius:4px"></div><div style="position:relative;text-align:center;line-height:16px;font-size:0.75rem;font-weight:600">${(pct * 100).toFixed(1)}%</div></div>`;
    };
    const body = odds.teams.map((r, i) => {
        const rec = `${r.wins}-${r.losses}${r.ties ? "-" + r.ties : ""}`;
        return `
            <tr>
                <td class="right">${i + 1}</td>
                <td><strong>${r.owner}</strong></td>
                <td>${rec}</td>
                <td class="right">${fmt(r.pf)}</td>
                <td class="right">${fmt(r.ppg)}</td>
                <td class="right">${fmt(r.projWins)}</td>
                <td class="right">${fmt(r.projPF)}</td>
                <td style="min-width:120px">${bar(r.playoffPct)}</td>
                <td class="right">${(r.oneSeedPct * 100).toFixed(1)}%</td>
            </tr>`;
    }).join("");
    t.innerHTML = `
        <thead><tr>
            <th class="right">#</th>
            <th>Owner</th>
            <th>Record</th>
            <th class="right">PF</th>
            <th class="right" title="Season-to-date points per game">PPG</th>
            <th class="right" title="Projected final wins (avg across sims)">Proj W</th>
            <th class="right" title="Projected final points for (avg across sims)">Proj PF</th>
            <th title="Share of simulations in which this team made the top 4">Playoff %</th>
            <th class="right" title="Share of simulations in which this team finished #1">1-Seed %</th>
        </tr></thead>
        <tbody>${body}</tbody>
    `;
}

function renderWinningPlayers() {
    const t = document.getElementById("winning-table");
    const rows = STATE.data.winningPlayers || [];
    if (!rows.length) { t.innerHTML = `<tbody><tr><td class="muted">no data</td></tr></tbody>`; return; }
    const body = rows.map((r, i) => `
        <tr>
            <td class="right">${i + 1}</td>
            <td><span data-goto-player="${r.key}">${r.display}</span> <span class="muted">${r.pos}</span></td>
            <td class="right"><strong>${r.chipAppearances}</strong></td>
            <td class="right muted">${r.chipYears.join(" ") || "-"}</td>
            <td class="right">${r.starts}</td>
            <td class="right"><strong>${(r.winPct * 100).toFixed(1)}%</strong></td>
            <td class="right">${r.wins}-${r.losses}${r.ties ? "-" + r.ties : ""}</td>
            <td class="right">${fmt(r.avgPerStart)}</td>
        </tr>`).join("");
    t.innerHTML = `
        <thead><tr>
            <th class="right">#</th>
            <th>Player</th>
            <th class="right" title="Seasons the player was on the champion's roster at any point">Chips</th>
            <th class="right">Years</th>
            <th class="right">Starts</th>
            <th class="right" title="Owner's win % when this player was in the starting lineup">Win%</th>
            <th class="right">Record</th>
            <th class="right">Avg/Start</th>
        </tr></thead>
        <tbody>${body}</tbody>
    `;
}

const MIA_STATE = { hideKD: true };
function renderMiaKhalifas() {
    const t = document.getElementById("mia-table");
    const toggle = document.getElementById("mia-defk-off");
    if (toggle && !toggle.dataset.wired) {
        toggle.addEventListener("change", () => {
            MIA_STATE.hideKD = toggle.checked;
            renderMiaKhalifas();
        });
        toggle.dataset.wired = "1";
    }
    const all = STATE.data.miaKhalifas || [];
    const rows = MIA_STATE.hideKD ? all.filter(r => r.pos !== "K" && r.pos !== "DEF") : all;
    if (!rows.length) { t.innerHTML = `<tbody><tr><td class="muted">no data</td></tr></tbody>`; return; }
    const body = rows.map((r, i) => `
        <tr>
            <td class="right">${i + 1}</td>
            <td><span data-goto-player="${r.key}">${r.display}</span> <span class="muted">${r.pos}</span></td>
            <td class="right"><strong>${r.uniqueOwners}</strong></td>
            <td class="right">${r.transitions}</td>
            <td class="muted">${r.owners.join(", ")}</td>
            <td class="right">${fmt(r.totalPoints)}</td>
        </tr>`).join("");
    t.innerHTML = `
        <thead><tr>
            <th class="right">#</th>
            <th>Player</th>
            <th class="right" title="Number of different managers who've rostered the player">Owners</th>
            <th class="right" title="Total ownership changes (same owner twice counts twice)">Transitions</th>
            <th>Managers</th>
            <th class="right">Career Pts</th>
        </tr></thead>
        <tbody>${body}</tbody>
    `;
}

function renderWorstDrops() {
    const t = document.getElementById("drops-table");
    const rows = STATE.data.worstDrops || [];
    if (!rows.length) { t.innerHTML = `<tbody><tr><td class="muted">no data</td></tr></tbody>`; return; }
    const body = rows.map((r, i) => `
        <tr>
            <td class="right">${i + 1}</td>
            <td>${r.year}</td>
            <td class="right">${r.droppedAfterWeek}</td>
            <td><strong>${r.droppedBy}</strong></td>
            <td><span data-goto-player="${r.key}">${r.display}</span> <span class="muted">${r.pos}</span></td>
            <td class="right"><strong>${fmt(r.laterPts)}</strong></td>
            <td class="right">${r.laterStarts}</td>
            <td>${r.pickedUpBy}</td>
        </tr>`).join("");
    t.innerHTML = `
        <thead><tr>
            <th class="right">#</th>
            <th>Year</th>
            <th class="right" title="Last week on the dropping owner's roster">After Wk</th>
            <th>Dropped By</th>
            <th>Player</th>
            <th class="right" title="Starter pts the player went on to score for other owners that same season">Lost Pts</th>
            <th class="right">Later Starts</th>
            <th>Picked Up By</th>
        </tr></thead>
        <tbody>${body}</tbody>
    `;
}
