/*
 * ScrapLens – Parallel Coordinates Plot (chart-pc.js)
 * Chart 1: one polyline per alloy across all 11 axes.
 * Supports brush-to-filter on each axis and drag-to-reorder axes.
 * Depends on: state.js, utils.js
 */

// Builds the PCP SVG with 11 axes, brushes for range-filtering, and drag handlers to reorder axes
function initPC() {
    pcMargin = { top: 50, right: 40, bottom: 30, left: 40 };
    const wrap = document.getElementById("db-pc-wrap");
    pcWidth  = getWrapWidth(wrap, 1) - pcMargin.left - pcMargin.right;
    const wrapH = wrap && wrap.clientHeight > 60 ? wrap.clientHeight : 220;
    pcHeight = wrapH - pcMargin.top - pcMargin.bottom;

    pcSvg = d3.select("#db-pc-svg")
        .attr("width",  pcWidth  + pcMargin.left + pcMargin.right)
        .attr("height", pcHeight + pcMargin.top  + pcMargin.bottom);

    pcG = pcSvg.append("g")
        .attr("transform", `translate(${pcMargin.left},${pcMargin.top})`);

    pcLineG = pcG.append("g").attr("class", "pc-lines");

    // Band scale placing each axis at an equal horizontal interval
    pcAxes   = PC_COLS.slice();
    pcX      = d3.scalePoint().domain(pcAxes).range([0, pcWidth]).padding(0.1);
    pcScales = {};
    PC_COLS.forEach(c => {
        pcScales[c] = d3.scaleLinear()
            .domain(d3.extent(dbData, d => +d[c]))
            .range([pcHeight, 0]);
    });

    // One <g> per axis — supports drag-to-reorder via d3.drag
    pcAxisGs = pcG.selectAll(".pc-axis")
        .data(pcAxes).enter().append("g")
        .attr("class", "pc-axis")
        .attr("transform", c => `translate(${pcX(c)},0)`)
        .call(d3.drag()
            .on("start", (event, c) => { dragging[c] = pcX(c); })
            .on("drag",  (event, c) => {
                dragging[c] = Math.max(0, Math.min(pcWidth, event.x));
                pcLineG.selectAll(".pc-line").attr("d", d => pcPath(d));
                pcAxisGs.attr("transform", col => `translate(${pcPosition(col)},0)`);
            })
            .on("end", (event, c) => {
                delete dragging[c];
                pcAxes.sort((a, b) => pcPosition(a) - pcPosition(b));
                pcX.domain(pcAxes);
                pcAxisGs.transition().duration(300)
                    .attr("transform", col => `translate(${pcX(col)},0)`);
                pcLineG.selectAll(".pc-line").transition().duration(300)
                    .attr("d", d => pcPath(d));
            })
        );

    // Tick marks for each axis
    pcAxisGs.append("g").attr("class", "pc-ax-ticks")
        .each(function(c) { d3.select(this).call(d3.axisLeft(pcScales[c]).ticks(5)); });

    // Axis label above each axis; full name shown in SVG <title> tooltip
    pcAxisGs.append("text")
        .attr("class", "pc-ax-label").attr("y", -12).attr("text-anchor", "middle")
        .text(c => c.length > 12 ? c.slice(0, 11) + "…" : c)
        .append("title").text(c => c);

    // Vertical brush on each axis — brush event triggers pcOnBrush()
    pcAxisGs.each(function(c) {
        const brush = d3.brushY()
            .extent([[-12, 0], [12, pcHeight]])
            .on("brush end", () => pcOnBrush());
        d3.select(this).append("g").attr("class", "pc-brush").call(brush);
        pcBrushes[c] = brush;
    });

    renderPC();
}

// Returns the current x-pixel position of axis c (dragged position while dragging, otherwise scale value)
function pcPosition(c) {
    return dragging[c] !== undefined ? dragging[c] : pcX(c);
}

// Builds the SVG path "d" string for one data row across all active axes in their current order
function pcPath(d) {
    return d3.line()(pcAxes.map(c => [pcPosition(c), pcScales[c](+d[c])]));
}

// Reads all active brush selections, updates dbFiltered accordingly, and re-renders every chart
function pcOnBrush() {
    pcAxisGs.each(function(c) {
        const sel = d3.brushSelection(this.querySelector(".pc-brush"));
        if (sel) {
            pcBrushSelections[c] = sel.map(pcScales[c].invert).sort(d3.ascending);
        } else {
            delete pcBrushSelections[c];
        }
    });

    dbFiltered = dbData.filter(d =>
        Object.entries(pcBrushSelections).every(([c, [lo, hi]]) => {
            const v = +d[c]; return v >= lo && v <= hi;
        })
    );
    dbSankeyFilter = null; // brushing clears any active Sankey stream filter

    renderPC(); renderScatter(); renderSankey(); renderBarChart(); renderHeatmap();
}

// Draws/updates polylines for dbFiltered: spotlight on hover, pin on click, subsampled for performance
function renderPC() {
    const limit  = window.maxRowsAllowed || 5000;
    const sample = dbFiltered.length <= limit
        ? dbFiltered
        : dbFiltered.filter((_, i) => i % Math.ceil(dbFiltered.length / limit) === 0);

    const lines = pcLineG.selectAll(".pc-line")
        .data(sample, d => dbData.indexOf(d));

    const entered = lines.enter().append("path")
        .attr("class", "pc-line").style("fill", "none").style("opacity", 0)
        .on("mouseover", function(event, d) {
            if (dbPinned.includes(d)) return;
            // Spotlight: dim all other lines, highlight this one
            pcLineG.selectAll(".pc-line")
                .filter(o => o !== d && !dbPinned.includes(o))
                .classed("pc-dimmed", true).classed("pc-hovered", false);
            d3.select(this).raise()
                .classed("pc-hovered", true).classed("pc-dimmed", false)
                .style("stroke", "#0ea5e9").style("stroke-width", "3");
            showTooltip(event, spTooltipHTML(d));
        })
        .on("mousemove", moveTooltip)
        .on("mouseout", function(event, d) {
            if (dbPinned.includes(d)) return;
            // Restore all lines to their normal colours
            pcLineG.selectAll(".pc-line")
                .classed("pc-dimmed", false).classed("pc-hovered", false)
                .style("stroke", o => dbPinned.includes(o) ? PIN_COLORS[dbPinned.indexOf(o)] : rowColor(o))
                .style("stroke-width", o => dbPinned.includes(o) ? "3" : "0.7")
                .style("opacity",      o => dbPinned.includes(o) ? 1 : 0.45);
            hideTooltip();
        })
        .on("click", function(event, d) { event.stopPropagation(); dbPin(d); });

    entered.merge(lines)
        .attr("d", d => pcPath(d))
        .style("stroke",       d => dbPinned.includes(d) ? PIN_COLORS[dbPinned.indexOf(d)] : rowColor(d))
        .style("stroke-width", d => dbPinned.includes(d) ? "3" : "0.7")
        .style("cursor", "pointer")
        .transition().duration(400)
        .style("opacity", d => dbPinned.includes(d) ? 1 : 0.45);

    lines.exit().transition().duration(200).style("opacity", 0).remove();

    // Raise pinned lines to the top so they sit above all other lines
    pcLineG.selectAll(".pc-line").filter(d => dbPinned.includes(d)).raise();
}
