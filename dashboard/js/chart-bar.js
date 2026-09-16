/*
 * ScrapLens – Sortable Bar Chart (chart-bar.js)
 * Chart 4: top-N alloys ranked by any KEY_OUTPUTS property or the feasibility score.
 * A dashed reference line marks the mean of the selected property across dbFiltered.
 * Depends on: state.js, utils.js
 */

// Builds the bar chart SVG with axis groups, a rotated Y label, and an invisible dashed reference line
function initBarChart() {
    baMargin = { top: 16, right: 16, bottom: 60, left: 50 };
    const wrap = document.getElementById("db-ba-wrap");
    baWidth  = getWrapWidth(wrap, 2) - baMargin.left - baMargin.right;
    const wrapH = wrap && wrap.clientHeight > 80 ? wrap.clientHeight : 340;
    baHeight = wrapH - baMargin.top - baMargin.bottom;

    baSvg = d3.select("#db-ba-svg")
        .attr("width",  baWidth  + baMargin.left + baMargin.right)
        .attr("height", baHeight + baMargin.top  + baMargin.bottom);

    baG = baSvg.append("g")
        .attr("transform", `translate(${baMargin.left},${baMargin.top})`);

    baXAxisG = baG.append("g").attr("class", "axis")
        .attr("transform", `translate(0,${baHeight})`);
    baYAxisG = baG.append("g").attr("class", "axis");

    // Rotated Y-axis label
    baG.append("text").attr("class", "ba-ylabel")
        .attr("transform", "rotate(-90)")
        .attr("x", -baHeight / 2).attr("y", -38)
        .attr("text-anchor", "middle").style("font-size", "10px").style("fill", "#6b7280")
        .text("Score / Value");

    // Dashed mean-reference line (made visible on first render)
    baRefLine = baG.append("line").attr("class", "ba-ref-line")
        .style("stroke", "#9aa0b4").style("stroke-width", 1)
        .style("stroke-dasharray", "4,3").style("opacity", 0);

    renderBarChart();
}

// Renders top-N bars (sorted by property), numeric labels above bars, pin-star markers, and mean reference line
function renderBarChart() {
    if (dbFiltered.length === 0) {
        baG.selectAll(".ba-bar, .ba-label, .ba-star").remove();
        baRefLine.style("opacity", 0);
        return;
    }

    const propSel = document.getElementById("db-ba-prop")?.value || "_score";
    const N       = +(document.getElementById("db-ba-n")?.value || 15);
    const prop    = propSel === "Feasibility Score" ? "_score" : propSel;
    const valueOf = d => prop === "_score" ? d._score : +d[prop];

    // Sort descending, slice top-N, optionally reverse for ascending view
    const sorted = dbFiltered.slice().sort((a, b) => valueOf(b) - valueOf(a));
    const top    = sorted.slice(0, N);
    if (baSortAsc) top.reverse();

    const vals = top.map(valueOf);
    const yMax = d3.max(vals) || 1;
    const yMin = prop === "_score" ? 0 : Math.min(0, d3.min(vals));

    const xScale = d3.scaleBand().domain(top.map((_, i) => i)).range([0, baWidth]).padding(0.2);
    const yScale = d3.scaleLinear().domain([yMin, yMax]).nice().range([baHeight, 0]);

    baXAxisG.transition().duration(300)
        .call(d3.axisBottom(xScale).tickFormat(i => `#${i + 1}`));
    baYAxisG.transition().duration(300).call(d3.axisLeft(yScale).ticks(5));
    baG.select(".ba-ylabel").text(prop === "_score" ? "Feasibility Score" : prop);

    // Animate the dashed mean reference line to the mean of the selected property
    const meanVal = d3.mean(dbFiltered, valueOf);
    baRefLine.transition().duration(300).style("opacity", 1)
        .attr("x1", 0).attr("x2", baWidth)
        .attr("y1", yScale(meanVal)).attr("y2", yScale(meanVal));

    // Bars — keyed by row index in the full dataset so D3 can animate transitions correctly
    const bars = baG.selectAll(".ba-bar").data(top, d => dbData.indexOf(d));

    bars.enter().append("rect").attr("class", "ba-bar").attr("rx", 3)
        .attr("y", baHeight).attr("height", 0)
        .on("mouseover", function(event, d) {
            showTooltip(event, baTooltipHTML(d, top.indexOf(d) + 1));
            d3.select(this).style("opacity", 0.7);
        })
        .on("mousemove", moveTooltip)
        .on("mouseout", function(event, d) {
            hideTooltip();
            d3.select(this).style("opacity", dbPinned.includes(d) ? 1 : 0.85);
        })
        .on("click", (event, d) => dbPin(d))
        .merge(bars).transition().duration(500)
        .attr("x",      (d, i) => xScale(i))
        .attr("width",  xScale.bandwidth())
        .attr("y",      d => yScale(valueOf(d)))
        .attr("height", d => baHeight - yScale(valueOf(d)))
        .style("fill",         d => dbPinned.includes(d) ? PIN_COLORS[dbPinned.indexOf(d)] : rowColor(d))
        .style("opacity",      d => dbPinned.includes(d) ? 1 : 0.85)
        .style("stroke",       d => dbPinned.includes(d) ? "#fff" : "none")
        .style("stroke-width", d => dbPinned.includes(d) ? 2 : 0);

    bars.exit().transition().duration(300).style("opacity", 0).remove();

    // Numeric value labels above each bar (hidden when bars are too narrow to fit text)
    const labels = baG.selectAll(".ba-label").data(top, d => dbData.indexOf(d));
    labels.enter().append("text").attr("class", "ba-label")
        .attr("text-anchor", "middle").style("font-size", "8px").style("fill", "#374151")
        .merge(labels).transition().duration(500)
        .attr("x", (d, i) => xScale(i) + xScale.bandwidth() / 2)
        .attr("y", d => yScale(valueOf(d)) - 4)
        .style("opacity", xScale.bandwidth() > 12 ? 1 : 0)
        .text(d => valueOf(d).toFixed(2));
    labels.exit().remove();

    // Gold star above pinned bars that appear in the current top-N view
    const starDatum = dbPinned.filter(p => top.includes(p));
    const stars = baG.selectAll(".ba-star").data(starDatum);
    stars.enter().append("text").attr("class", "ba-star")
        .attr("text-anchor", "middle").style("font-size", "11px").style("fill", HIGHLIGHT)
        .merge(stars).transition().duration(500)
        .attr("x", d => xScale(top.indexOf(d)) + xScale.bandwidth() / 2)
        .attr("y", d => yScale(valueOf(d)) - (xScale.bandwidth() > 12 ? 16 : 6))
        .text("★");
    stars.exit().remove();
}

// Toggles bar sort direction between descending (default) and ascending, and updates the button label
function dbToggleSort() {
    baSortAsc = !baSortAsc;
    document.getElementById("db-ba-sort").textContent = baSortAsc ? "Sort ↑" : "Sort ↓";
    renderBarChart();
}
