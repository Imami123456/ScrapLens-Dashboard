/*
 * ScrapLens – Dashboard Core (dashboard-core.js)
 * Entry point for the dashboard tab: validates and scores data, builds the HTML
 * grid scaffold, wires all control listeners, initialises every chart, and handles
 * reset / pin / colour-mode / cluster-count changes.
 * Depends on: state.js, utils.js, kmeans.js, chart-pc.js, chart-scatter.js,
 *             chart-sankey.js, chart-bar.js, chart-heatmap.js
 */

// Prompts the user, then clears scraplens_data and scraplens_dashboard_state from localStorage and reloads
function dbClearSavedData() {
    if (!confirm("This will delete all cached data from your browser. The page will reload and you will need to upload the file again. Continue?")) return;
    try {
        localStorage.removeItem("scraplens_data");
        localStorage.removeItem("scraplens_dashboard_state");
    } catch(e) {}
    window.location.reload();
}

// Injects the full dashboard HTML grid into #scraplens-root and wires all dropdown/button event listeners
function buildDashboardHTML() {
    document.getElementById("scraplens-root").innerHTML = `

  <!-- HEADER BAR -->
  <div class="db-header">
    <span class="db-logo">⬡ ScrapLens</span>
    <div id="db-restore-badge" class="db-restore-badge" style="display:none">
      <span id="db-restore-text"></span>
    </div>
    <div style="display:flex; gap:6px; margin-left:auto; align-items:center;">
      <button class="db-btn db-btn-danger" onclick="dbClearSavedData()" title="Delete cached data from browser memory">🗑 Clear Saved Data</button>
      <button class="db-btn" onclick="dbReset()">↺ Reset Filters</button>
    </div>
  </div>

  <!-- MAIN GRID: comparison panel + 3 chart rows -->
  <div class="db-main">

    <!-- Pinned-alloy comparison panel (hidden until at least one alloy is pinned) -->
    <div id="db-comparison-panel" class="db-comparison-panel"></div>

    <!-- ROW 1: Parallel Coordinates — full width -->
    <div class="db-panel">
      <div class="db-panel-header">
        <span class="db-panel-title">⬡ Parallel Coordinates</span>
        <span class="db-why-icon" data-why="Parallel Coordinates are the only 2D technique that shows all 11 dimensions simultaneously. Each line is one alloy. Brush handles filter all other charts. Alternative: SPLOM, but it scales as O(n²) panels and loses the sequential view.">?</span>
        <div class="db-panel-actions">
          <select id="db-k-sel" class="db-panel-select">
            ${[2,3,4,5,6,7,8].map(v=>`<option value="${v}" ${v===dbK?"selected":""}>${v}</option>`).join("")}
          </select>
          <select id="db-color-mode" class="db-panel-select">
            <option value="score" selected>Score colour</option>
            <option value="cluster">Cluster colour</option>
          </select>
          <button class="db-panel-btn" onclick="dbReset()">↺ Reset</button>
          <button class="db-panel-btn db-expand-btn" onclick="toggleExpandPanel(this)" title="Toggle Fullscreen">⛶ Expand</button>
        </div>
      </div>
      <div class="db-panel-hint-bar">Drag brush handles to filter · Drag axis label to reorder · Click a line to pin that alloy</div>
      <div class="db-chart-wrap" id="db-pc-wrap"><svg id="db-pc-svg"></svg></div>
    </div>

    <!-- ROW 2: Scatterplot (left 50%) + Sankey (right 50%) -->
    <div class="db-row-sp-sk">

      <div class="db-panel">
        <div class="db-panel-header">
          <span class="db-panel-title">◎ Scatterplot</span>
          <span class="db-why-icon" data-why="Position on a common scale is the most accurately perceived visual channel (Cleveland 1984). Reveals bivariate relationships between output properties. Alternative: connected scatterplot, but PCP already covers multi-dimensional view.">?</span>
          <div class="db-panel-actions">
            <select id="db-sp-x" class="db-panel-select">
              ${KEY_OUTPUTS.map((c,i)=>`<option value="${c}" ${i===0?"selected":""}>${c}</option>`).join("")}
            </select>
            <select id="db-sp-y" class="db-panel-select">
              ${KEY_OUTPUTS.map((c,i)=>`<option value="${c}" ${i===1?"selected":""}>${c}</option>`).join("")}
            </select>
            <span id="db-lasso-badge" class="db-panel-badge" style="display:none; cursor:pointer;" onclick="dbClearLasso()">✕ Lasso</span>
            <button class="db-panel-btn db-expand-btn" onclick="toggleExpandPanel(this)" title="Toggle Fullscreen">⛶ Expand</button>
          </div>
        </div>
        <div class="db-panel-hint-bar">Shift+drag to lasso-select · Scroll to zoom · Click dot to pin</div>
        <div class="db-chart-wrap" id="db-sp-wrap"><svg id="db-sp-svg"></svg></div>
      </div>

      <div class="db-panel">
        <div class="db-panel-header">
          <span class="db-panel-title">⇌ Sankey — Scrap Stream Contributions</span>
          <span class="db-why-icon" data-why="Sankey diagrams use connection marks and flow width to encode material proportions — the only chart type that makes scrap blending physically intuitive. Alternative: stacked bar chart, but it loses the flow metaphor that connects inputs to the blend output.">?</span>
          <div class="db-panel-actions">
            <span id="db-sk-clear" style="color:#0ea5e9; cursor:pointer; font-size:10px;"></span>
            <span class="db-panel-hint">Click a stream to filter</span>
            <button class="db-panel-btn db-expand-btn" onclick="toggleExpandPanel(this)" title="Toggle Fullscreen">⛶ Expand</button>
          </div>
        </div>
        <div class="db-panel-hint-bar">Click any scrap stream to filter · Click again to clear</div>
        <div class="db-chart-wrap" id="db-sk-wrap"><svg id="db-sk-svg"></svg></div>
      </div>

    </div>

    <!-- ROW 3: Bar Chart (left 50%) + Heatmap (right 50%) -->
    <div class="db-row-ba-hm">

      <div class="db-panel">
        <div class="db-panel-header">
          <span class="db-panel-title">▤ Top Candidates</span>
          <span class="db-why-icon" data-why="Bar chart is the most accurate chart for magnitude comparison — position on a common scale is Cleveland's #1 ranked channel. Click any bar to pin that alloy across all views. Alternative: dot plot, but bars make relative magnitude differences most immediately readable.">?</span>
          <div class="db-panel-actions">
            <select id="db-ba-prop" class="db-panel-select">
              <option value="_score" selected>Feasibility Score</option>
              ${KEY_OUTPUTS.map(c=>`<option value="${c}">${c}</option>`).join("")}
            </select>
            <select id="db-ba-n" class="db-panel-select">
              <option value="10">Top 10</option>
              <option value="15" selected>Top 15</option>
              <option value="25">Top 25</option>
            </select>
            <button class="db-panel-btn" id="db-ba-sort" onclick="dbToggleSort()">Sort ↕</button>
            <button class="db-panel-btn db-expand-btn" onclick="toggleExpandPanel(this)" title="Toggle Fullscreen">⛶ Expand</button>
          </div>
        </div>
        <div class="db-chart-wrap" id="db-ba-wrap"><svg id="db-ba-svg"></svg></div>
      </div>

      <div class="db-panel">
        <div class="db-panel-header">
          <span class="db-panel-title">◫ Correlation Heatmap</span>
          <span class="db-why-icon" data-why="Heatmap is the standard technique for correlation matrices — colour channel encodes ordered data (Munzner effectiveness principle). Updates dynamically with every filter so correlations reflect the current selection. Click any cell to set those two variables as scatter X/Y axes.">?</span>
          <div class="db-panel-actions">
            <span class="db-panel-hint">Click cell → update scatter axes</span>
            <button class="db-panel-btn db-expand-btn" onclick="toggleExpandPanel(this)" title="Toggle Fullscreen">⛶ Expand</button>
          </div>
        </div>
        <div class="db-chart-wrap" id="db-hm-wrap"><svg id="db-hm-svg"></svg></div>
      </div>

    </div>

  </div>

`;

    // Wire dropdowns and buttons that are not handled by inline onclick attributes
    document.getElementById("db-ba-prop").addEventListener("change", renderBarChart);
    document.getElementById("db-ba-n").addEventListener("change", renderBarChart);
    document.getElementById("db-sp-x").addEventListener("change", renderScatter);
    document.getElementById("db-sp-y").addEventListener("change", renderScatter);
    document.getElementById("db-k-sel").addEventListener("change", function() { dbChangeK(this.value); });
    document.getElementById("db-color-mode").addEventListener("change", function() { dbChangeColorMode(this.value); });
}

// Validates rows, computes feasibility scores, runs k-means, then builds and renders the full dashboard
function initDashboard(_data) {
    // Reset all state so re-uploading a new file starts completely fresh
    pcBrushes = {}; pcBrushSelections = {};
    dbPinned  = []; dbClusters = [];
    baSortAsc = false; dbColorMode = "score"; dbSankeyFilter = null;

    // Discard any row missing a required numeric value
    const required = [...SCRAP_COLS, ...KEY_OUTPUTS];
    dbData = _data.filter(row =>
        required.every(c => row[c] !== undefined && row[c] !== "" && !isNaN(+row[c]))
    );

    if (dbData.length === 0) {
        console.warn("ScrapLens: no valid rows — check column names match the dataset.");
        return;
    }

    computeNorms();                             // build _norms for every PC_COLS column
    dbData.forEach(d => { d._score = feasibility(d); }); // attach _score to each row
    dbFiltered = dbData.slice();               // start with all rows visible
    runKMeans(dbK);                            // initial cluster assignment

    buildDashboardHTML();

    // Create or reuse the shared floating tooltip div
    dbTooltip = d3.select("body").select(".db-tooltip");
    if (dbTooltip.empty()) {
        dbTooltip = d3.select("body").append("div").attr("class", "db-tooltip");
    }

    initAllCharts();

    // Bind the window resize listener once; the debounced handler prevents resize storms
    if (!dbResizeBound) {
        window.addEventListener("resize", debounce(() => { initAllCharts(); }, 300));
        dbResizeBound = true;
    }
    requestAnimationFrame(function() { requestAnimationFrame(resizeDashboardCharts); });

    showDetailCard();
}

// Switches the colour encoding between feasibility-score gradient and discrete cluster colours
function dbChangeColorMode(mode) {
    dbColorMode = mode;
    renderPC(); renderScatter(); renderBarChart();
}

// Updates dbK, re-runs k-means, and re-renders the three colour-encoded charts
function dbChangeK(val) {
    dbK = +val;
    runKMeans(dbK);
    renderPC(); renderScatter(); renderBarChart();
}

// Clears each chart's SVG then reinitialises all five charts from scratch
function initAllCharts() {
    ["#db-pc-svg","#db-sp-svg","#db-sk-svg","#db-ba-svg","#db-hm-svg"]
        .forEach(sel => d3.select(sel).selectAll("*").remove());
    initPC(); initScatter(); initSankey(); initBarChart(); initHeatmap();
}

// Remeasures all panel widths and updates SVG dimensions without a full chart reinitialisation
function resizeDashboardCharts() {
    if (!pcSvg || dbData.length === 0) return;

    const pcWrap = document.getElementById("db-pc-wrap");
    const spWrap = document.getElementById("db-sp-wrap");
    const skWrap = document.getElementById("db-sk-wrap");
    const baWrap = document.getElementById("db-ba-wrap");
    if (!pcWrap || !spWrap || !skWrap || !baWrap) return;

    // If the panel height changed significantly, a full reinit is safer than a partial resize
    const newSpHeight = spWrap.clientHeight > 80
        ? spWrap.clientHeight - spMargin.top - spMargin.bottom : spHeight;
    if (Math.abs(newSpHeight - spHeight) > 20) { initAllCharts(); return; }

    const newPcWidth = getWrapWidth(pcWrap, 1) - pcMargin.left - pcMargin.right;
    const newSpWidth = getWrapWidth(spWrap, 2) - spMargin.left - spMargin.right;
    const newSkWidth = getWrapWidth(skWrap, 2) - skMargin.left - skMargin.right;
    const newBaWidth = getWrapWidth(baWrap, 2) - baMargin.left - baMargin.right;

    if (newPcWidth > 100 && newPcWidth !== pcWidth) {
        pcWidth = newPcWidth;
        pcSvg.attr("width", pcWidth + pcMargin.left + pcMargin.right);
        pcX.range([0, pcWidth]);
        pcAxisGs.attr("transform", col => `translate(${pcPosition(col)},0)`);
        pcAxisGs.each(function(c) {
            d3.select(this).select(".pc-brush")
                .call(pcBrushes[c].extent([[-12, 0], [12, pcHeight]]));
        });
        renderPC();
    }

    if (newSpWidth > 80 && newSpWidth !== spWidth) {
        spWidth = newSpWidth;
        spSvg.attr("width", spWidth + spMargin.left + spMargin.right);
        spXScale.range([0, spWidth]);
        spXAxisG.attr("transform", `translate(0,${spHeight})`);
        spG.select(".sp-xlabel").attr("x", spWidth / 2).attr("y", spHeight + 44);
        spG.select(".sp-ylabel").attr("x", -spHeight / 2);
        renderScatter();
    }

    if (newSkWidth > 80 && newSkWidth !== skWidth) {
        skWidth = newSkWidth;
        skSvg.attr("width", skWidth + skMargin.left + skMargin.right);
        renderSankey();
    }

    if (newBaWidth > 80 && newBaWidth !== baWidth) {
        baWidth = newBaWidth;
        baSvg.attr("width", baWidth + baMargin.left + baMargin.right);
        renderBarChart();
    }

    // Heatmap needs a full reinit to recalculate the square size constraint
    const hmWrap = document.getElementById("db-hm-wrap");
    if (hmWrap) {
        const newHmWidth = Math.max(160, Math.min(getWrapWidth(hmWrap, 2), 360)) - hmMargin.left - hmMargin.right;
        if (newHmWidth !== hmWidth) {
            d3.select("#db-hm-svg").selectAll("*").remove();
            initHeatmap();
        }
    }
}

// Toggles the expanded/collapsed CSS class on a chart panel and redraws after the CSS transition ends
function toggleExpandPanel(btn) {
    const panel = btn.closest(".db-panel");
    if (!panel) return;
    if (panel.classList.contains("expanded-panel")) {
        panel.classList.remove("expanded-panel");
        btn.innerHTML = "⛶ Expand";
    } else {
        panel.classList.add("expanded-panel");
        btn.innerHTML = "✖ Close";
    }
    setTimeout(resizeDashboardCharts, 260); // wait for CSS transition to finish
}

// Pins or unpins a row: unpins if already pinned, or replaces the oldest pin when the 3-pin limit is reached
function dbPin(d) {
    if (dbPinned.includes(d)) {
        dbPinned = dbPinned.filter(p => p !== d);
    } else {
        if (dbPinned.length >= 3) dbPinned.shift(); // evict oldest pin
        dbPinned.push(d);
    }
    renderPC(); renderScatter(); renderBarChart();
    showDetailCard();
}

// Exposes removePin(idx) on window so the comparison card's ✕ button can call it by slot index
window.removePin = function(idx) { dbPin(dbPinned[idx]); };

// Rebuilds the comparison panel HTML with a property card for each pinned alloy (or an empty-state hint)
function showDetailCard() {
    const panel = document.getElementById("db-comparison-panel");
    if (!panel) return;
    panel.style.display = "flex";

    if (dbPinned.length === 0) {
        panel.innerHTML = `<div style="padding:20px; color:#64748b; font-size:15px; font-style:italic; width:100%; text-align:center;">Click on up to 3 different alloys in the charts below to compare their properties side-by-side here.</div>`;
        return;
    }

    let html = "";
    dbPinned.forEach((d, idx) => {
        const rowIdx     = dbData.indexOf(d);
        const clusterNum = dbClusters[rowIdx] !== undefined ? dbClusters[rowIdx] + 1 : "—";
        const color      = PIN_COLORS[idx];

        const fields = [
            ...SCRAP_COLS.map((c, i) => [SCRAP_LABELS[i], (+d[c]).toFixed(2) + "%"]),
            ["YS",           (+d["YS(MPa)"]).toFixed(1) + " MPa"],
            ["Hardness",     (+d["hardness(Vickers)"]).toFixed(1) + " HV"],
            ["CSC",          (+d["CSC"]).toFixed(4)],
            ["Density",      (+d["Density(g/cm3)"]).toFixed(3)],
            ["Therm. Cond.", (+d["Therm.conductivity(W/(mK))"]).toFixed(2)],
            ["Score",        d._score.toFixed(4)],
        ];

        html += `
        <div class="db-comparison-card" style="border-top: 4px solid ${color};">
            <div class="db-comp-header">
                <span class="db-comp-title" style="color:${color}">Alloy ${rowIdx + 1}</span>
                <div>
                    <span class="db-comp-cluster">Cluster ${clusterNum}</span>
                    <button class="db-comp-remove" onclick="window.removePin(${idx})">✕</button>
                </div>
            </div>
            <div class="db-comp-body">
                ${fields.map(([k, v]) => `<div class="db-comp-row"><span>${k}</span><span>${v}</span></div>`).join("")}
            </div>
        </div>`;
    });

    panel.innerHTML = html;
}

// Clears all PCP brushes, lasso filter, Sankey filter, and pins, then re-renders every chart
function dbReset() {
    if (!dbData || dbData.length === 0) return;

    // Programmatically clear all active brush selections on each PCP axis
    pcBrushSelections = {};
    if (pcAxisGs) {
        pcAxisGs.each(function(c) {
            if (pcBrushes[c]) pcBrushes[c].move(d3.select(this).select(".pc-brush"), null);
        });
    }

    dbFiltered     = dbData.slice();
    dbPinned       = [];
    dbSankeyFilter = null;

    const lassoBadge = document.getElementById("db-lasso-badge");
    if (lassoBadge) lassoBadge.style.display = "none";

    const skClear = document.getElementById("db-sk-clear");
    if (skClear) skClear.textContent = "";

    renderPC(); renderScatter(); renderSankey(); renderBarChart(); renderHeatmap();
    showDetailCard();
}

// ── DB NAMESPACE ───────────────────────────────────────────────────────────────
// Read-only accessors so external code can inspect dashboard state without
// accidentally mutating the flat globals directly.
const DB = {};
Object.defineProperty(DB, "data",         { get: () => dbData });
Object.defineProperty(DB, "filtered",     { get: () => dbFiltered });
Object.defineProperty(DB, "pinned",       { get: () => dbPinned });
Object.defineProperty(DB, "colorMode",    { get: () => dbColorMode });
Object.defineProperty(DB, "sankeyFilter", { get: () => dbSankeyFilter });

// Re-renders all five charts — use this as the single "something changed" cascade
DB.renderAll = function() {
    renderPC(); renderScatter(); renderSankey(); renderBarChart(); renderHeatmap();
};
