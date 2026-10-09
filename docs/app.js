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
                return `<tr>
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
        ${rows.map(r => `<tr>
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
        ${rows.map(r => `<tr>
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
        { field: "display",     label: "Name" },
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
function initFrivolitiesPanel() {
    renderBiggestUpsets();
    renderBiggestCarries();
}

function renderBiggestUpsets() {
    const t = document.getElementById("upsets-table");
    const upsets = STATE.data.biggestUpsets || [];
    if (!upsets.length) {
        t.innerHTML = `<tbody><tr><td class="muted">No upsets yet (need multiple weeks of data).</td></tr></tbody>`;
        return;
    }
    const rows = upsets.map((u, i) => `
        <tr>
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
        <tr>
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
                <tr>
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
