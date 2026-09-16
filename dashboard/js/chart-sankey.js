/*
 * ScrapLens – Sankey Diagram (chart-sankey.js)
 * Chart 3: visualises average scrap-stream proportions across the filtered alloys.
 * Each stream is a source node; all flows converge to a single "Blend" destination node.
 * Clicking a stream filters dbFiltered to rows where that stream is dominant.
 * Depends on: state.js, utils.js
 */

// Builds the Sankey SVG container and calls renderSankey() for the initial draw
function initSankey() {
    skMargin = { top: 20, right: 60, bottom: 20, left: 70 };
    const wrap = document.getElementById("db-sk-wrap");
    skWidth  = getWrapWidth(wrap, 2) - skMargin.left - skMargin.right;
    const wrapH = wrap && wrap.clientHeight > 80 ? wrap.clientHeight : 340;
    skHeight = wrapH - skMargin.top - skMargin.bottom;

    skSvg = d3.select("#db-sk-svg")
        .attr("width",  skWidth  + skMargin.left + skMargin.right)
        .attr("height", skHeight + skMargin.top  + skMargin.bottom);

    skG = skSvg.append("g")
        .attr("transform", `translate(${skMargin.left},${skMargin.top})`);

    renderSankey();
}

// Clears and redraws the entire Sankey: source nodes, animated flow paths, labels, and the Blend output node
function renderSankey() {
    skG.selectAll("*").remove();

    // Update the "✕ Clear" hint that appears in the panel header when a stream filter is active
    const clearEl = document.getElementById("db-sk-clear");
    if (clearEl) {
        clearEl.textContent  = dbSankeyFilter !== null ? "· ✕ Clear" : "";
        clearEl.style.cursor = dbSankeyFilter !== null ? "pointer" : "default";
        clearEl.onclick      = dbSankeyFilter !== null ? () => skFilterByStream(dbSankeyFilter) : null;
    }

    if (dbFiltered.length === 0) {
        skG.append("text")
            .attr("x", skWidth / 2).attr("y", skHeight / 2)
            .attr("text-anchor", "middle").style("fill", "#888")
            .text("No data matches the current filter.");
        return;
    }

    // Compute average mixing percentages across filtered rows and normalise to proportions
    const avgs  = SCRAP_COLS.map(c => d3.mean(dbFiltered, d => +d[c]) || 0);
    const total = d3.sum(avgs) || 1;
    const fracs = avgs.map(v => v / total);

    const padY = 6;
    const outH = skHeight * 0.85;
    const outY = (skHeight - outH) / 2;

    // "Blend" destination node on the right side
    skG.append("rect").attr("x", skWidth).attr("y", outY)
        .attr("width", 18).attr("height", outH).attr("rx", 3).style("fill", HIGHLIGHT);
    skG.append("text").attr("x", skWidth + 24).attr("y", outY + outH / 2 + 4)
        .style("font-size", "11px").style("font-weight", "bold").style("fill", "#111827")
        .text(truncateLabel("Blend"));

    let curY = 0;
    fracs.forEach((f, i) => {
        const col      = SCRAP_COLS[i];
        const color    = CLUSTER_COLORS[i];
        const srcH     = Math.max(6, f * skHeight - padY); // source node height proportional to share
        const flowH    = Math.max(4, f * outH);            // flow band height proportional to share
        const dstMid   = outY + (i + 0.5) * (outH / fracs.length);
        const y0       = curY;
        const n        = dbFiltered.filter(d => +d[col] > 0).length; // rows using this stream
        const isActive = dbSankeyFilter === i;

        // Cubic bezier path forming the flow ribbon from source node to destination node
        const flowPath = `M18,${y0}
            C${skWidth * 0.5},${y0}
             ${skWidth * 0.5},${dstMid - flowH / 2}
             ${skWidth},${dstMid - flowH / 2}
            L${skWidth},${dstMid + flowH / 2}
            C${skWidth * 0.5},${dstMid + flowH / 2}
             ${skWidth * 0.5},${y0 + srcH}
             18,${y0 + srcH} Z`;

        const flowTip = () =>
            `<b>${SCRAP_LABELS[i]}</b><br/>Avg: ${(f * 100).toFixed(1)}% across ${n.toLocaleString()} alloys. Click to filter.`;

        // Animated flow ribbon with hover highlight and click-to-filter
        const flow = skG.append("path").attr("class", "sk-flow")
            .attr("d", flowPath).style("fill", color)
            .style("cursor", "pointer").style("opacity", 0);
        flow.transition().duration(500).style("opacity", isActive ? 0.5 : 0.25);
        flow.on("mouseover", function(event) {
                d3.select(this).transition().duration(150).style("opacity", 0.6);
                showTooltip(event, flowTip());
            })
            .on("mousemove", moveTooltip)
            .on("mouseout", function() {
                d3.select(this).transition().duration(150).style("opacity", isActive ? 0.5 : 0.25);
                hideTooltip();
            })
            .on("click", () => skFilterByStream(i));

        // Source node rectangle with height animated in from zero
        const src = skG.append("rect")
            .attr("x", 0).attr("y", y0).attr("width", 18).attr("height", 0)
            .attr("rx", 3).style("fill", color).style("cursor", "pointer")
            .style("stroke", isActive ? "#fff" : "none")
            .style("stroke-width", isActive ? 2 : 0);
        src.transition().duration(500).attr("height", srcH);

        // Vertical distribution tick (min–max line) drawn inside the source node
        const ext = d3.extent(dbData, d => +d[col]);
        if (ext[0] !== undefined && srcH > 10) {
            const distScale = d3.scaleLinear().domain(ext).range([2, srcH - 2]);
            skG.append("line")
                .attr("x1", 9).attr("x2", 9)
                .attr("y1", y0 + distScale(ext[0])).attr("y2", y0 + distScale(ext[1]))
                .style("stroke", "rgba(255,255,255,0.55)").style("stroke-width", 3)
                .style("stroke-linecap", "round").style("pointer-events", "none");
        }

        src.on("mouseover", event => showTooltip(event, flowTip()))
           .on("mousemove", moveTooltip).on("mouseout", hideTooltip)
           .on("click", () => skFilterByStream(i));

        // Text labels to the left of the source node: stream name and percentage
        skG.append("text").attr("x", -8).attr("y", y0 + srcH / 2 - 3)
            .attr("text-anchor", "end").style("font-size", "10px").style("fill", "#374151")
            .text(truncateLabel(SCRAP_LABELS[i]));
        skG.append("text").attr("x", -8).attr("y", y0 + srcH / 2 + 9)
            .attr("text-anchor", "end").style("font-size", "9px").style("fill", "#6b7280")
            .text(`${(f * 100).toFixed(1)}%`);

        curY += srcH + padY;
    });
}

// Filters dbFiltered to rows where stream i exceeds its median; clicking the active stream clears the filter
function skFilterByStream(i) {
    if (dbSankeyFilter === i) {
        dbSankeyFilter = null;
        dbFiltered = dbData.slice(); // clear: restore full dataset
    } else {
        dbSankeyFilter = i;
        const col = SCRAP_COLS[i];
        const med = d3.median(dbData, d => +d[col]);
        dbFiltered = dbData.filter(d => +d[col] > med);
    }
    renderPC(); renderScatter(); renderSankey(); renderBarChart(); renderHeatmap();
}
