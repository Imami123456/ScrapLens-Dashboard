/*
 * ScrapLens – Correlation Heatmap (chart-heatmap.js)
 * Chart 5: 5×5 Pearson correlation matrix for KEY_OUTPUTS.
 * Recomputed on every filter change so values always reflect the visible subset.
 * Clicking a cell updates the scatterplot's X/Y axes to those two properties.
 * Depends on: state.js, utils.js (pearsonCorr, corrLabel)
 */

// Builds the heatmap SVG with scaleBand scales, axis labels, and a diverging colour legend bar
function initHeatmap() {
    hmMargin = { top: 45, right: 10, bottom: 44, left: 66 };
    const wrap = document.getElementById("db-hm-wrap");
    // No upper-size cap — let the heatmap fill the panel in expand mode
    const size = Math.max(160, getWrapWidth(wrap, 2));
    hmWidth  = size - hmMargin.left - hmMargin.right;
    hmHeight = size - hmMargin.top  - hmMargin.bottom;

    hmSvg = d3.select("#db-hm-svg")
        .attr("width",  hmWidth  + hmMargin.left + hmMargin.right)
        .attr("height", hmHeight + hmMargin.top  + hmMargin.bottom + 46);

    hmG = hmSvg.append("g")
        .attr("transform", `translate(${hmMargin.left},${hmMargin.top})`);

    hmXScale     = d3.scaleBand().domain(KEY_OUTPUTS).range([0, hmWidth]).padding(0.06);
    hmYScale     = d3.scaleBand().domain(KEY_OUTPUTS).range([0, hmHeight]).padding(0.06);
    hmColorScale = d3.scaleDiverging(d3.interpolateRdBu).domain([-1, 0, 1]); // red=negative, blue=positive

    // Row labels on the left (one per KEY_OUTPUTS property)
    hmG.selectAll(".hm-row-label").data(KEY_OUTPUTS).enter().append("text")
        .attr("x", -6).attr("y", c => hmYScale(c) + hmYScale.bandwidth() / 2 + 3)
        .attr("text-anchor", "end").style("font-size", "9px").style("fill", "#6b7280")
        .text((c, i) => HM_LABELS[i]);

    // Column labels rotated 40° above the matrix
    hmG.selectAll(".hm-col-label").data(KEY_OUTPUTS).enter().append("text")
        .attr("transform", c =>
            `translate(${hmXScale(c) + hmXScale.bandwidth() / 2},-4) rotate(-40)`)
        .attr("text-anchor", "start").style("font-size", "9px").style("fill", "#6b7280")
        .text((c, i) => HM_LABELS[i]);

    // Diverging colour legend — built from 30 solid-colour segments instead of
    // fill:url(#gradient), which breaks when an ancestor has a CSS transform
    // (as used by expand mode). Solid rects have no url() dependency.
    const legG = hmSvg.append("g")
        .attr("transform", `translate(${hmMargin.left},${hmMargin.top + hmHeight + 20})`);

    const STEPS = 30;
    const stepW = hmWidth / STEPS;
    d3.range(STEPS).forEach(i => {
        const t = i / (STEPS - 1);          // 0 → 1 across the bar width
        legG.append("rect")
            .attr("x",      i * stepW)
            .attr("y",      0)
            .attr("width",  stepW + 0.5)   // tiny overlap prevents hairline gaps
            .attr("height", 8)
            .attr("rx",     i === 0 ? 2 : 0)
            .style("fill",  hmColorScale(-1 + t * 2));
    });

    // Tick labels below the bar
    legG.append("text").attr("x", 0).attr("y", 20)
        .style("font-size", "8px").style("fill", "#6b7280").text("−1");
    legG.append("text").attr("x", hmWidth / 2).attr("y", 20)
        .attr("text-anchor", "middle").style("font-size", "8px").style("fill", "#6b7280").text("0");
    legG.append("text").attr("x", hmWidth).attr("y", 20)
        .attr("text-anchor", "end").style("font-size", "8px").style("fill", "#6b7280").text("+1");

    // Axis label so the legend is self-explanatory
    legG.append("text").attr("x", hmWidth / 2).attr("y", 32)
        .attr("text-anchor", "middle").style("font-size", "8px")
        .style("fill", "#9ca3af").style("font-style", "italic").text("Pearson r");

    renderHeatmap();
}

// Recomputes the 5×5 Pearson r matrix from dbFiltered and updates cell fill colours and text labels
function renderHeatmap() {
    if (!hmG) return;

    // Guard: show a message instead of meaningless correlations on tiny selections
    if (dbFiltered.length < 10) {
        hmG.selectAll(".hm-cell, .hm-text").remove();
        let msg = hmG.select(".hm-empty-msg");
        if (msg.empty()) {
            msg = hmG.append("text").attr("class", "hm-empty-msg")
                .attr("text-anchor", "middle").attr("dy", "0.35em")
                .style("font-size", "10px").style("fill", "#6B7280");
        }
        msg.attr("x", hmWidth / 2).attr("y", hmHeight / 2)
            .text("Not enough data for correlation");
        return;
    }
    hmG.select(".hm-empty-msg").remove();

    // Build the flat 25-element cell array with precomputed Pearson r for each (row, col) pair
    const cells = [];
    KEY_OUTPUTS.forEach((rowCol, ri) => {
        const arr1 = dbFiltered.map(d => +d[rowCol]);
        KEY_OUTPUTS.forEach((colCol, ci) => {
            const r = rowCol === colCol ? 1 : pearsonCorr(arr1, dbFiltered.map(d => +d[colCol]));
            cells.push({ rowCol, colCol, ri, ci, r });
        });
    });

    // Coloured rectangles — clicking a cell sets those two properties as scatter axes
    const rects = hmG.selectAll(".hm-cell")
        .data(cells, d => d.rowCol + "|" + d.colCol);

    rects.enter().append("rect").attr("class", "hm-cell")
        .attr("x",      d => hmXScale(d.colCol))
        .attr("y",      d => hmYScale(d.rowCol))
        .attr("width",  hmXScale.bandwidth())
        .attr("height", hmYScale.bandwidth())
        .attr("rx", 2).style("cursor", "pointer")
        .on("mouseover", function(event, d) {
            showTooltip(event,
                `Correlation between ${HM_LABELS[d.ri]} and ${HM_LABELS[d.ci]}: ` +
                `${d.r.toFixed(2)} (${corrLabel(d.r)})`);
            d3.select(this).style("stroke", "#fff").style("stroke-width", 1.5);
        })
        .on("mousemove", moveTooltip)
        .on("mouseout", function() {
            hideTooltip();
            d3.select(this).style("stroke", "none");
        })
        .on("click", function(event, d) {
            // Set scatterplot axes to the two clicked properties
            const spX = document.getElementById("db-sp-x");
            const spY = document.getElementById("db-sp-y");
            if (spX) spX.value = d.rowCol;
            if (spY) spY.value = d.colCol;
            renderScatter();
        })
        .merge(rects).transition().duration(400)
        .style("fill", d => hmColorScale(d.r));

    rects.exit().remove();

    // Animated numeric r-value labels inside each cell; white text on dark cells, dark text on light cells
    const texts = hmG.selectAll(".hm-text")
        .data(cells, d => d.rowCol + "|" + d.colCol);

    texts.enter().append("text").attr("class", "hm-text")
        .attr("x",  d => hmXScale(d.colCol) + hmXScale.bandwidth() / 2)
        .attr("y",  d => hmYScale(d.rowCol) + hmYScale.bandwidth() / 2)
        .attr("text-anchor", "middle").attr("dy", "0.35em")
        .style("font-size", "9px").style("pointer-events", "none")
        .text(d => d.r.toFixed(2))
        .merge(texts)
        .style("fill", d => Math.abs(d.r) > 0.55 ? "#ffffff" : "#111827")
        .transition().duration(400)
        .tween("text", function(d) {
            // Count-up animation: interpolate from the previous displayed value to the new r
            const node = this;
            const prev = parseFloat(node.textContent);
            const interp = d3.interpolateNumber(isNaN(prev) ? d.r : prev, d.r);
            return t => { node.textContent = interp(t).toFixed(2); };
        });

    texts.exit().remove();
}
