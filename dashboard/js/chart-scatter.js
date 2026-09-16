/*
 * ScrapLens – Scatterplot (chart-scatter.js)
 * Chart 2: two-axis scatterplot of any two KEY_OUTPUTS properties.
 * Supports mouse-wheel zoom/pan and shift+drag lasso selection.
 * Depends on: state.js, utils.js
 */

// Builds the scatterplot SVG with zoom/pan, lasso event handlers, and labelled axes
function initScatter() {
    spMargin = { top: 20, right: 20, bottom: 50, left: 60 };
    const wrap = document.getElementById("db-sp-wrap");
    spWidth  = getWrapWidth(wrap, 2) - spMargin.left - spMargin.right;
    const wrapH = wrap && wrap.clientHeight > 80 ? wrap.clientHeight : 340;
    spHeight = wrapH - spMargin.top - spMargin.bottom;

    spSvg = d3.select("#db-sp-svg")
        .attr("width",  spWidth  + spMargin.left + spMargin.right)
        .attr("height", spHeight + spMargin.top  + spMargin.bottom);

    spG = spSvg.append("g")
        .attr("transform", `translate(${spMargin.left},${spMargin.top})`);

    spXScale = d3.scaleLinear().range([0, spWidth]);
    spYScale = d3.scaleLinear().range([spHeight, 0]);

    spXAxisG = spG.append("g").attr("class", "axis").attr("transform", `translate(0,${spHeight})`);
    spYAxisG = spG.append("g").attr("class", "axis");

    spG.append("text").attr("class", "sp-xlabel")
        .attr("x", spWidth / 2).attr("y", spHeight + 44)
        .attr("text-anchor", "middle").style("font-size", "11px");
    spG.append("text").attr("class", "sp-ylabel")
        .attr("transform", "rotate(-90)")
        .attr("x", -spHeight / 2).attr("y", -48)
        .attr("text-anchor", "middle").style("font-size", "11px");

    spDotsG  = spG.append("g").attr("class", "sp-dots");
    spLassoG = spG.append("g").attr("class", "sp-lasso"); // sits above dots

    // Zoom/pan — shift key is reserved for lasso so we filter those events out
    const zoom = d3.zoom().scaleExtent([0.5, 20])
        .filter(event => !event.shiftKey)
        .on("zoom", function(event) {
            spZoom = event.transform;
            const xDim = document.getElementById("db-sp-x")?.value || KEY_OUTPUTS[0];
            const yDim = document.getElementById("db-sp-y")?.value || KEY_OUTPUTS[1];
            spDotsG.selectAll(".sp-dot")
                .attr("cx", d => spZoom.applyX(spXScale(+d[xDim])))
                .attr("cy", d => spZoom.applyY(spYScale(+d[yDim])));
        });
    spSvg.call(zoom);

    // Lasso: hold Shift and drag to draw a freehand polygon that filters dbFiltered
    spSvg.on("mousedown.lasso", function(event) {
        if (!event.shiftKey) return;
        const [mx, my] = d3.pointer(event, spG.node());
        spLassoPts = [[mx, my]];
        spLassoG.selectAll("*").remove();
        spLassoPath = spLassoG.append("path")
            .attr("class", "sp-lasso-path")
            .style("fill", "rgba(0,212,170,0.12)").style("stroke", "#00D4AA")
            .style("stroke-width", 1.5).style("stroke-dasharray", "4,3");
    });

    spSvg.on("mousemove.lasso", function(event) {
        if (!spLassoPath) return;
        const [mx, my] = d3.pointer(event, spG.node());
        spLassoPts.push([mx, my]);
        spLassoPath.attr("d", d3.line()(spLassoPts) + "Z");
    });

    spSvg.on("mouseup.lasso", function() {
        if (!spLassoPath) return;
        if (spLassoPts.length > 2) {
            const xDim = document.getElementById("db-sp-x")?.value || KEY_OUTPUTS[0];
            const yDim = document.getElementById("db-sp-y")?.value || KEY_OUTPUTS[1];
            // Keep only rows whose dots fall inside the lasso polygon
            dbFiltered = dbData.filter(d => {
                const px = spZoom.applyX(spXScale(+d[xDim]));
                const py = spZoom.applyY(spYScale(+d[yDim]));
                return d3.polygonContains(spLassoPts, [px, py]);
            });
            dbSankeyFilter = null;
            const badge = document.getElementById("db-lasso-badge");
            if (badge) badge.style.display = "inline-flex";
            renderPC(); renderScatter(); renderSankey(); renderBarChart(); renderHeatmap();
        }
        spLassoG.selectAll("*").remove();
        spLassoPath = null;
        spLassoPts  = [];
    });

    renderScatter();
}

// Draws/updates dots for dbFiltered: colour by rowColor, enlarged and drop-shadowed when pinned
function renderScatter() {
    const xDim = document.getElementById("db-sp-x")?.value || KEY_OUTPUTS[0];
    const yDim = document.getElementById("db-sp-y")?.value || KEY_OUTPUTS[1];
    if (!xDim || !yDim) return;

    spXScale.domain(d3.extent(dbFiltered, d => +d[xDim])).nice();
    spYScale.domain(d3.extent(dbFiltered, d => +d[yDim])).nice();

    spXAxisG.transition().duration(350).call(d3.axisBottom(spXScale).ticks(6));
    spYAxisG.transition().duration(350).call(d3.axisLeft(spYScale).ticks(6));
    spG.select(".sp-xlabel").text(xDim);
    spG.select(".sp-ylabel").text(yDim);

    // Subsample very large datasets to stay within the allowed row cap
    const limit  = window.maxRowsAllowed || 5000;
    const sample = dbFiltered.length > limit
        ? dbFiltered.filter((_, i) => i % Math.ceil(dbFiltered.length / limit) === 0)
        : dbFiltered;

    const dots = spDotsG.selectAll(".sp-dot")
        .data(sample, d => dbData.indexOf(d));

    dots.enter().append("circle")
        .attr("class", "sp-dot").attr("r", 4.5)
        .style("stroke", "rgba(255,255,255,0.5)").style("stroke-width", "0.8")
        .style("cursor", "crosshair")
        .on("mouseover", function(event, d) {
            showTooltip(event, spTooltipHTML(d));
            d3.select(this).raise().attr("r", 10)
                .style("stroke", "#fff").style("stroke-width", 2)
                .style("filter", "drop-shadow(0 0 6px rgba(14,165,233,0.9))");
        })
        .on("mousemove", moveTooltip)
        .on("mouseout", function(event, d) {
            hideTooltip();
            const isPinned = dbPinned.includes(d);
            d3.select(this)
                .attr("r",             isPinned ? 9 : 4.5)
                .style("stroke",       isPinned ? "#fff" : "rgba(255,255,255,0.5)")
                .style("stroke-width", isPinned ? 2 : "0.8")
                .style("filter",       isPinned ? `drop-shadow(0 0 5px ${PIN_COLORS[dbPinned.indexOf(d)]})` : "none");
        })
        .on("click", (event, d) => dbPin(d))
        .merge(dots)
        .attr("cx",  d => spZoom.applyX(spXScale(+d[xDim])))
        .attr("cy",  d => spZoom.applyY(spYScale(+d[yDim])))
        .style("fill",         d => rowColor(d))
        .style("opacity",      d => dbPinned.includes(d) ? 1 : 0.78)
        .attr("r",             d => dbPinned.includes(d) ? 9 : 4.5)
        .style("stroke",       d => dbPinned.includes(d) ? PIN_COLORS[dbPinned.indexOf(d)] : "rgba(255,255,255,0.5)")
        .style("stroke-width", d => dbPinned.includes(d) ? 2.5 : "0.8")
        .style("filter",       d => dbPinned.includes(d) ? `drop-shadow(0 0 5px ${PIN_COLORS[dbPinned.indexOf(d)]})` : "none");

    dots.exit().remove();
}

// Clears the active lasso selection, resets dbFiltered to the full dataset, and hides the lasso badge
function dbClearLasso() {
    dbFiltered = dbData.slice();
    dbSankeyFilter = null;
    const badge = document.getElementById("db-lasso-badge");
    if (badge) badge.style.display = "none";
    renderPC(); renderScatter(); renderSankey(); renderBarChart(); renderHeatmap();
}
