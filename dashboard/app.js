// League dashboard – consumes ./data.json built by buildDashboardData.py.

const STATE = { data: null, charts: {} };

document.addEventListener("DOMContentLoaded", async () => {
    setupTabs();
    try {
        const res = await fetch("./data.json");
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
                    return `<tr>
                        <td>${f.year}</td>
                        <td>${t.team}</td>
                        <td>${t.playoffRank} of ${season.numTeams}${finishMark}</td>
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
            return `<tr>
                <td><strong>${s.year}</strong></td>
                <td>🏆 ${s.champion ?? "-"}</td>
                <td>${s.sacko ?? "-"}</td>
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
    const standings = [...s.standings].sort((a, b) => a.playoffRank - b.playoffRank);
    body.innerHTML = `
        <h4>Final Standings</h4>
        <table class="data-table">
            <thead><tr><th>#</th><th>Owner</th><th>Team</th><th>Record</th><th class="right">PF</th><th class="right">PA</th><th>Reg Rank</th><th>Draft</th></tr></thead>
            <tbody>
            ${standings.map(t => {
                const mark = t.champion ? "🏆" : (t.sacko ? "💩" : (t.madePlayoffs ? "✓" : ""));
                return `<tr>
                    <td><strong>${t.playoffRank}</strong> ${mark}</td>
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
