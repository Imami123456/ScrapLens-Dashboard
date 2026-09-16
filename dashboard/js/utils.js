/*
 * ScrapLens – Utility Helpers (utils.js)
 * Pure, stateless helper functions for layout, math, colour resolution, and tooltips.
 * Depends on: state.js
 */

// Delays fn until `delay` ms after the last call — prevents excessive redraws on resize events
function debounce(fn, delay) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), delay); };
}

// Returns the usable inner pixel width of a chart wrapper div, falling back to viewport width for hidden tabs
function getWrapWidth(wrap, columnsInRow) {
    if (wrap && wrap.clientWidth > 0) return wrap.clientWidth;
    const pageWidth  = Math.max(document.documentElement.clientWidth - 40, 960);
    const innerWidth = pageWidth - 24;
    if (columnsInRow === 1) return innerWidth - 20;
    return Math.floor((innerWidth - 10 * (columnsInRow - 1)) / columnsInRow) - 20;
}

// Builds _norms[col] = {min, max} for every PC_COLS column using the full dataset
function computeNorms() {
    PC_COLS.forEach(c => {
        const ext = d3.extent(dbData, d => +d[c]);
        _norms[c] = { min: ext[0], max: ext[1] };
    });
}

// Maps a raw column value to [0, 1] using its precomputed min/max; returns 0 if the column has zero variance
function norm(val, col) {
    const { min, max } = _norms[col];
    if (max === min) return 0;
    return (val - min) / (max - min);
}

// Computes the weighted feasibility score: 0.4·norm(YS) + 0.4·norm(Hardness) + 0.2·(1 - norm(CSC))
function feasibility(d) {
    const nYS  = norm(+d["YS(MPa)"],          "YS(MPa)");
    const nHV  = norm(+d["hardness(Vickers)"], "hardness(Vickers)");
    const nCSC = 1 - norm(+d["CSC"],           "CSC");
    return W_YS * nYS + W_HV * nHV + W_CSC * nCSC;
}

// Returns the Euclidean distance between two equal-length numeric vectors
function euclidean(a, b) {
    return Math.sqrt(a.reduce((s, v, i) => s + (v - b[i]) ** 2, 0));
}

// Picks a display colour for a row: pin slot colour > cluster colour > feasibility-score gradient
function rowColor(d) {
    if (dbPinned.includes(d)) return PIN_COLORS[dbPinned.indexOf(d)];
    if (dbColorMode === "cluster") {
        const idx = dbData.indexOf(d);
        return CLUSTER_COLORS[(dbClusters[idx] || 0) % CLUSTER_COLORS.length];
    }
    return AMBER_SCALE(d._score);
}

// Makes the shared tooltip visible and fills it with the provided HTML string
function showTooltip(event, html) {
    dbTooltip.style("opacity", 1).html(html);
}

// Repositions the shared tooltip to follow the mouse cursor
function moveTooltip(event) {
    dbTooltip.style("left", (event.pageX + 14) + "px")
             .style("top",  (event.pageY - 28) + "px");
}

// Hides the shared tooltip
function hideTooltip() {
    dbTooltip.style("opacity", 0);
}

// Builds the HTML string shown when hovering a scatterplot dot or a PCP line
function spTooltipHTML(d) {
    return `<b>Feasibility: ${d._score.toFixed(3)}</b><br/>
YS: ${(+d["YS(MPa)"]).toFixed(1)} MPa<br/>
Hardness: ${(+d["hardness(Vickers)"]).toFixed(1)} HV<br/>
CSC: ${(+d["CSC"]).toFixed(4)}<br/>
Density: ${(+d["Density(g/cm3)"]).toFixed(3)} g/cm³<br/>
Therm.Cond.: ${(+d["Therm.conductivity(W/(mK))"]).toFixed(2)} W/(mK)`;
}

// Builds the HTML string shown when hovering a bar in the bar chart
function baTooltipHTML(d, rank) {
    return `<b>#${rank} — Feasibility: ${d._score.toFixed(3)}</b><br/>
YS: ${(+d["YS(MPa)"]).toFixed(1)} MPa<br/>
Hardness: ${(+d["hardness(Vickers)"]).toFixed(1)} HV<br/>
CSC: ${(+d["CSC"]).toFixed(4)}`;
}

// Returns a human-readable strength/direction label for a Pearson r value (e.g. "strong positive")
function corrLabel(r) {
    const mag = Math.abs(r);
    if (mag < 0.1) return "negligible correlation";
    const strength = mag >= 0.7 ? "strong" : mag >= 0.4 ? "moderate" : "weak";
    return `${strength} ${r > 0 ? "positive" : "negative"}`;
}

// Computes the Pearson correlation coefficient between two equal-length numeric arrays; returns 0 for zero variance
function pearsonCorr(arr1, arr2) {
    const n = arr1.length;
    if (n === 0) return 0;
    const mean1 = d3.mean(arr1), mean2 = d3.mean(arr2);
    let num = 0, den1 = 0, den2 = 0;
    for (let i = 0; i < n; i++) {
        const a = arr1[i] - mean1, b = arr2[i] - mean2;
        num += a * b; den1 += a * a; den2 += b * b;
    }
    const den = Math.sqrt(den1 * den2);
    return den === 0 ? 0 : num / den;
}

// Truncates a label to maxLen characters and appends "…" if it overflows — keeps Sankey labels readable
function truncateLabel(s, maxLen = 7) {
    return s.length > maxLen ? s.slice(0, maxLen) + "…" : s;
}
