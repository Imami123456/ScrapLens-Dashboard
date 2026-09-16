/*
* Data Visualization - Framework
* Copyright (C) University of Passau
*   Faculty of Computer Science and Mathematics
*   Chair of Cognitive sensor systems
* Maintenance:
*   2025, Alexander Gall <alexander.gall@uni-passau.de>
*
* All rights reserved.
*/

// svg containers / data globals used by the dashboard
let dataTable;
let data, dataColumns;

let dtCurrentPage = 1;
const dtPageSize = 100;
let dtData = [];

// ── STORAGE ────────────────────────────────────────────────────────────────────

/** Save loaded data to browser localStorage for persistence across page reloads. */
function saveDataToStorage() {
    try {
        const storageData = {
            timestamp: new Date().toISOString(),
            columns: data.columns,
            rows: data,
            dataSize: data.length
        };
        localStorage.setItem('scraplens_data', JSON.stringify(storageData));
        console.log("✓ Data saved to storage:", data.length, "rows");
    } catch (e) {
        console.warn("Storage save failed:", e.message);
    }
}

/**
 * Load previously saved data from localStorage.
 * @returns {Object|null} Parsed data object with a .columns property, or null.
 */
function loadDataFromStorage() {
    try {
        const stored = localStorage.getItem('scraplens_data');
        if (!stored) return null;
        const storageData = JSON.parse(stored);
        const loadedData = storageData.rows;
        loadedData.columns = storageData.columns;
        console.log("✓ Data restored from storage:", loadedData.length, "rows");
        return loadedData;
    } catch (e) {
        console.warn("Storage load failed:", e.message);
        return null;
    }
}

// ── ENTRY POINT ────────────────────────────────────────────────────────────────

function init() {
    // Start at the Load Data tab
    document.getElementById("defaultOpen").click();

    // Data table D3 selection
    dataTable = d3.select('#dataTable');

    // ── Try to restore data from storage ──
    const storedData = loadDataFromStorage();
    if (storedData) {
        data = storedData;
        dataColumns = data.columns;
        CreateDataTable(data);
        initDashboard(data);
    }

    // ── File upload ──
    const fileInput = document.getElementById("upload");
    const readFile = function () {
        // Clear existing table content before loading new file
        dataTable.selectAll("*").remove();

        // Show loading overlay
        let overlay = document.getElementById("db-loading-overlay");
        if (!overlay) {
            overlay = document.createElement("div");
            overlay.id = "db-loading-overlay";
            overlay.innerHTML = `
                <div class="db-loading-box">
                    <div class="db-progress-ring-wrap">
                        <svg class="db-progress-ring" viewBox="0 0 120 120" width="120" height="120">
                            <defs>
                                <linearGradient id="ringGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                                    <stop offset="0%" stop-color="#0ea5e9"/>
                                    <stop offset="100%" stop-color="#6366f1"/>
                                </linearGradient>
                                <filter id="ringGlow">
                                    <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
                                    <feMerge><feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/></feMerge>
                                </filter>
                            </defs>
                            <circle class="db-ring-track" cx="60" cy="60" r="50"
                                fill="none" stroke="#e5e7eb" stroke-width="8"/>
                            <circle class="db-ring-progress" id="db-ring-arc" cx="60" cy="60" r="50"
                                fill="none" stroke="url(#ringGrad)" stroke-width="8"
                                stroke-linecap="round" filter="url(#ringGlow)"
                                stroke-dasharray="314.16" stroke-dashoffset="314.16"
                                transform="rotate(-90 60 60)"/>
                            <text id="db-ring-pct" x="60" y="55" text-anchor="middle"
                                dominant-baseline="middle" class="db-ring-pct-text">0%</text>
                            <text x="60" y="75" text-anchor="middle"
                                class="db-ring-sub-text">Loading</text>
                        </svg>
                    </div>
                    <div class="db-loading-title">Loading ScrapLens…</div>
                    <div class="db-loading-sub">Sampling dataset for interactive exploration.</div>
                    <div id="db-loading-progress" class="db-loading-progress">Starting…</div>
                </div>`;
            document.body.appendChild(overlay);
        }
        overlay.style.display = "flex";

        const CIRCUMFERENCE = 314.159;
        let currentPct = 0;
        let animationPhase = "loading";

        function updateRing(pct) {
            const arc = document.getElementById("db-ring-arc");
            const txt = document.getElementById("db-ring-pct");
            const clamped = Math.max(0, Math.min(100, pct));
            if (arc) arc.setAttribute("stroke-dashoffset", String(CIRCUMFERENCE - (clamped / 100) * CIRCUMFERENCE));
            if (txt) txt.textContent = Math.round(clamped) + "%";
        }

        updateRing(0);
        const pEl = document.getElementById("db-loading-progress");
        if (pEl) pEl.textContent = "Starting…";

        function animateTo100() {
            if (currentPct < 100) {
                currentPct = Math.min(100, currentPct + 1.5);
                updateRing(currentPct);
                requestAnimationFrame(animateTo100);
            } else {
                if (animationPhase === "done") {
                    setTimeout(function() { overlay.style.display = "none"; }, 400);
                } else {
                    requestAnimationFrame(animateTo100);
                }
            }
        }

        const file = fileInput.files[0];
        if (!file) { overlay.style.display = "none"; return; }

        const maxRowsInput = document.getElementById('max-rows-input');
        window.maxRowsAllowed = maxRowsInput ? parseInt(maxRowsInput.value) || 5000 : 5000;
        const SAMPLE_ROWS = window.maxRowsAllowed;

        function readAndParseFile() {
            const reader = new FileReader();
            reader.onload = function(e) {
                const text = e.target.result;
                const lines = text.split("\n");
                let headerLine = "", separator = ",", rows = [];

                for (let i = 0; i < lines.length; i++) {
                    const line = lines[i];
                    if (!line.trim()) continue;
                    if (!headerLine) {
                        headerLine = line;
                        separator = line.indexOf("\t") !== -1 ? "\t" : ",";
                        continue;
                    }
                    if (rows.length < SAMPLE_ROWS) rows.push(line);
                }

                try {
                    data = d3.dsvFormat(separator).parse(headerLine + "\n" + rows.join("\n"));
                    dataColumns = data.columns;
                    saveDataToStorage();
                    CreateDataTable(data);
                    initDashboard(data);
                    animationPhase = "done";
                    if (pEl) pEl.textContent = "✓ Done! " + data.length + " rows loaded.";
                } catch(err) {
                    console.error("Parse error:", err);
                    if (pEl) pEl.textContent = "Error: " + err.message;
                }
            };
            const sliceLimit = Math.max(1024 * 1024 * 10, window.maxRowsAllowed * 1024);
            reader.readAsText(file.slice(0, sliceLimit));
        }

        requestAnimationFrame(animateTo100);
        setTimeout(readAndParseFile, 50);
    };

    if (fileInput) fileInput.addEventListener("change", readFile);

    const reloadBtn = document.getElementById("reload-btn");
    if (reloadBtn) {
        reloadBtn.addEventListener("click", function() {
            if (fileInput && fileInput.files.length > 0) {
                readFile();
            } else {
                alert("Please click 'Choose File' to select your dataset first.");
            }
        });
    }

    // ── Storage status UI ──
    const storageStatus = document.getElementById('storage-status');
    const storageMsg    = document.getElementById('storage-message');
    const clearBtn      = document.getElementById('clear-storage-btn');

    if (loadDataFromStorage()) {
        const stored = JSON.parse(localStorage.getItem('scraplens_data'));
        storageMsg.textContent = `✓ Data cached: ${stored.dataSize} rows available. Page will auto-restore on load.`;
        storageStatus.style.display = 'flex';
    }

    if (clearBtn) {
        clearBtn.addEventListener('click', function() {
            try { localStorage.removeItem('scraplens_data'); localStorage.removeItem('scraplens_dashboard_state'); } catch(e) {}
            storageStatus.style.display = 'none';
            alert('Saved data cleared. Page will use fresh file uploads from now on.');
        });
    }
}

// ── INSTANT DEMO SAMPLE DATASET ────────────────────────────────────────────────
/**
 * Loads the bundled sample dataset (1,000 real alloys from IEEE SciVis Contest 2025)
 * for instant one-click exploration without requiring a 150MB download.
 */
function loadSampleDataset() {
    dataTable.selectAll("*").remove();

    let overlay = document.getElementById("db-loading-overlay");
    if (!overlay) {
        overlay = document.createElement("div");
        overlay.id = "db-loading-overlay";
        overlay.innerHTML = `
            <div class="db-loading-box">
                <div class="db-progress-ring-wrap">
                    <svg class="db-progress-ring" viewBox="0 0 120 120" width="120" height="120">
                        <defs>
                            <linearGradient id="ringGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                                <stop offset="0%" stop-color="#0ea5e9"/>
                                <stop offset="100%" stop-color="#6366f1"/>
                            </linearGradient>
                            <filter id="ringGlow">
                                <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
                                <feMerge><feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/></feMerge>
                            </filter>
                        </defs>
                        <circle class="db-ring-track" cx="60" cy="60" r="50"
                            fill="none" stroke="#e5e7eb" stroke-width="8"/>
                        <circle class="db-ring-progress" id="db-ring-arc" cx="60" cy="60" r="50"
                            fill="none" stroke="url(#ringGrad)" stroke-width="8"
                            stroke-linecap="round" filter="url(#ringGlow)"
                            stroke-dasharray="314.16" stroke-dashoffset="314.16"
                            transform="rotate(-90 60 60)"/>
                        <text id="db-ring-pct" x="60" y="55" text-anchor="middle"
                            dominant-baseline="middle" class="db-ring-pct-text">0%</text>
                        <text x="60" y="75" text-anchor="middle"
                            class="db-ring-sub-text">Loading</text>
                    </svg>
                </div>
                <div class="db-loading-title">Loading ScrapLens Sample Data…</div>
                <div class="db-loading-sub">Preparing 1,000 alloy candidates for instant exploration.</div>
                <div id="db-loading-progress" class="db-loading-progress">Starting…</div>
            </div>`;
        document.body.appendChild(overlay);
    }
    overlay.style.display = "flex";

    const CIRCUMFERENCE = 314.159;
    let currentPct = 0;
    let animationPhase = "loading";

    function updateRing(pct) {
        const arc = document.getElementById("db-ring-arc");
        const txt = document.getElementById("db-ring-pct");
        const clamped = Math.max(0, Math.min(100, pct));
        if (arc) arc.setAttribute("stroke-dashoffset", String(CIRCUMFERENCE - (clamped / 100) * CIRCUMFERENCE));
        if (txt) txt.textContent = Math.round(clamped) + "%";
    }

    updateRing(0);
    const pEl = document.getElementById("db-loading-progress");
    if (pEl) pEl.textContent = "Fetching sample dataset…";

    function animateTo100() {
        if (currentPct < 100) {
            currentPct = Math.min(100, currentPct + 2.5);
            updateRing(currentPct);
            requestAnimationFrame(animateTo100);
        } else {
            if (animationPhase === "done") {
                setTimeout(function() {
                    overlay.style.display = "none";
                    const storageStatus = document.getElementById('storage-status');
                    const storageMsg = document.getElementById('storage-message');
                    if (storageStatus && storageMsg) {
                        storageMsg.textContent = `✓ Sample dataset cached: ${data.length} alloys loaded. Page will auto-restore on reload.`;
                        storageStatus.style.display = 'flex';
                    }
                    const dashTab = document.querySelectorAll(".tablink")[1];
                    if (dashTab) openPage("Dashboard", dashTab);
                }, 300);
            } else {
                requestAnimationFrame(animateTo100);
            }
        }
    }

    requestAnimationFrame(animateTo100);

    fetch("data/sample_alloy_data.tsv")
        .then(response => {
            if (!response.ok) throw new Error("Could not find sample dataset (" + response.status + ")");
            return response.text();
        })
        .then(text => {
            if (pEl) pEl.textContent = "Parsing alloys…";
            data = d3.dsvFormat("\t").parse(text);
            dataColumns = data.columns;
            saveDataToStorage();
            CreateDataTable(data);
            initDashboard(data);
            animationPhase = "done";
            if (pEl) pEl.textContent = "✓ Done! " + data.length + " alloys ready.";
        })
        .catch(err => {
            console.error("Sample data load error:", err);
            animationPhase = "done";
            if (pEl) pEl.textContent = "Error: " + err.message;
            setTimeout(function() { overlay.style.display = "none"; }, 2000);
        });
}

// ── DATA TABLE ─────────────────────────────────────────────────────────────────

/** Build the paginated data table in the Load Data tab. */
function CreateDataTable(_data) {
    dtData = _data;
    dtCurrentPage = 1;

    dataTable.selectAll("*").remove();

    const controls = dataTable.append("div")
        .attr("class", "dt-controls")
        .style("margin-bottom", "14px")
        .style("display", "flex")
        .style("gap", "10px")
        .style("align-items", "center")
        .style("justify-content", "center");

    controls.append("button").attr("class", "db-btn").text("⏮ First")
        .on("click", () => { dtCurrentPage = 1; renderTableBody(); });

    controls.append("button").attr("class", "db-btn").text("◀ Prev")
        .on("click", () => { if (dtCurrentPage > 1) dtCurrentPage--; renderTableBody(); });

    const pageSelectWrap = controls.append("div")
        .style("display", "flex").style("align-items", "center")
        .style("gap", "6px").style("margin", "0 10px");

    pageSelectWrap.append("span").text("Page")
        .style("font-size", "14px").style("font-weight", "600").style("color", "#475569");

    pageSelectWrap.append("select").attr("id", "dt-page-select")
        .style("font-size", "14px").style("padding", "4px 8px")
        .style("border", "1px solid #cbd5e1").style("border-radius", "6px")
        .style("cursor", "pointer")
        .on("change", function() { dtCurrentPage = +this.value; renderTableBody(); });

    pageSelectWrap.append("span").attr("id", "dt-page-total")
        .style("font-size", "14px").style("font-weight", "600").style("color", "#475569");

    controls.append("span").attr("id", "dt-row-info")
        .style("font-size", "13px").style("color", "#64748b").style("min-width", "130px");

    controls.append("button").attr("class", "db-btn").text("Next ▶")
        .on("click", () => { if (dtCurrentPage < Math.ceil(dtData.length / dtPageSize)) dtCurrentPage++; renderTableBody(); });

    controls.append("button").attr("class", "db-btn").text("Last ⏭")
        .on("click", () => { dtCurrentPage = Math.ceil(dtData.length / dtPageSize); renderTableBody(); });

    const table = dataTable.append("table").attr("class", "dataTableClass");
    table.append("thead").append("tr")
        .selectAll("th").data(dataColumns).enter()
        .append("th").attr("class", "tableHeaderClass").text(d => d);

    table.append("tbody").attr("id", "dt-tbody");
    renderTableBody();
}

function renderTableBody() {
    const tbody = dataTable.select("#dt-tbody");
    tbody.selectAll("*").remove();

    const start = (dtCurrentPage - 1) * dtPageSize;
    const end   = start + dtPageSize;
    const pageData   = dtData.slice(start, end);
    const totalPages = Math.ceil(dtData.length / dtPageSize);

    const select = d3.select("#dt-page-select");
    if (select.selectAll("option").size() !== totalPages) {
        select.selectAll("*").remove();
        for (let i = 1; i <= totalPages; i++) {
            select.append("option").attr("value", i).text(i);
        }
    }
    select.property("value", dtCurrentPage);

    d3.select("#dt-page-total").text(`of ${totalPages}`);
    d3.select("#dt-row-info").text(`(Rows ${start + 1} - ${Math.min(end, dtData.length)})`);

    const rows = tbody.selectAll("tr").data(pageData).enter().append("tr");
    const cells = rows.selectAll("td")
        .data(row => dataColumns.map(c => row[c]))
        .enter().append("td")
        .attr("class", "tableBodyClass").text(d => d);

    cells.on("mouseover", function() { d3.select(this).style("background-color", "powderblue"); })
         .on("mouseout",  function() { d3.select(this).style("background-color", null); });
}

// ── TAB SWITCHING ──────────────────────────────────────────────────────────────

function openPage(pageName, elmnt) {
    document.getElementsByClassName("tabcontent");
    Array.from(document.getElementsByClassName("tabcontent"))
        .forEach(el => el.style.display = "none");
    Array.from(document.getElementsByClassName("tablink"))
        .forEach(el => el.classList.remove("active-tab"));

    document.getElementById(pageName).style.display = "block";
    elmnt.classList.add("active-tab");

    if (pageName === "Dashboard") {
        setTimeout(function() {
            if (typeof resizeDashboardCharts === "function") resizeDashboardCharts();
        }, 60);
    }
}