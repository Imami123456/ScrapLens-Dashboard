/*
 * ScrapLens – Shared State (state.js)
 * All global constants and mutable dashboard state that every chart module reads.
 * Load this file FIRST before any other dashboard script.
 */

// ── Column identifiers — must match the dataset file headers exactly ──────────
const SCRAP_COLS   = ["KS1295[%]","6082[%]","2024[%]","bat-box[%]","3003[%]","4032[%]"];
const SCRAP_LABELS = ["KS1295","6082","2024","bat-box","3003","4032"];
const KEY_OUTPUTS  = ["YS(MPa)","hardness(Vickers)","CSC","Density(g/cm3)","Therm.conductivity(W/(mK))"];
const PC_COLS      = [...SCRAP_COLS, ...KEY_OUTPUTS]; // all 11 axes shown in the PCP

// ── Feasibility score weights ─────────────────────────────────────────────────
const W_YS  = 0.4;  // yield strength contribution
const W_HV  = 0.4;  // Vickers hardness contribution
const W_CSC = 0.2;  // cold-spray coefficient (inverted: lower is better)

// ── Colour palettes ───────────────────────────────────────────────────────────
const AMBER_SCALE    = d3.scaleSequential(d3.interpolateBlues).domain([0, 1]);
const CLUSTER_COLORS = ["#C07820","#1D9E75","#378ADD","#7F77DD","#D85A30",
                         "#888780","#E6B800","#A63D2F","#4A90D9","#6B4F8E"];
const HIGHLIGHT      = "#0ea5e9";            // accent colour for pinned items and "Blend" node
const PIN_COLORS     = ["#FFD700","#00FFFF","#FF00FF"]; // one colour per pin slot (max 3)

// ── Heatmap short-form axis labels ────────────────────────────────────────────
const HM_LABELS = ["YS","Hardness","CSC","Density","Therm.Cond"]; // same order as KEY_OUTPUTS

// ── Dashboard filter / selection state ───────────────────────────────────────
let dbData      = [];           // full validated dataset after loading
let dbFiltered  = [];           // rows surviving the current combined filter
let dbPinned    = [];           // up to 3 pinned rows shown in the comparison panel
let dbColorMode = "score";      // "score" (gradient) or "cluster" (discrete colours)
let dbClusters  = [];           // k-means cluster index per row in dbData
let dbK         = 4;            // current number of k-means clusters
let baSortAsc   = false;        // bar-chart sort direction toggle

// ── Normalisation cache — populated by computeNorms() ────────────────────────
let _norms = {};                // { [col]: { min, max } }

// ── Resize guard — prevents double-binding the window resize listener ─────────
let dbResizeBound = false;

// ── Shared tooltip element ────────────────────────────────────────────────────
let dbTooltip;

// ── SVG root elements (set during initAllCharts) ──────────────────────────────
let pcSvg, spSvg, skSvg, baSvg;
let pcG,   spG,   skG,   baG;

// ── Parallel Coordinates state ────────────────────────────────────────────────
let pcAxes, pcScales;
let pcBrushes = {}, pcBrushSelections = {};
let pcAxisGs, pcLineG, pcX;     // pcX is the band scale mapping axis names to x-positions
let dragging  = {};             // { [col]: currentXpx } while an axis is being dragged
let pcWidth, pcHeight, pcMargin;

// ── Scatterplot state ─────────────────────────────────────────────────────────
let spWidth, spHeight, spMargin, spXScale, spYScale, spXAxisG, spYAxisG;
let spZoom      = d3.zoomIdentity; // current pan/zoom transform
let spDotsG, spLassoG;
let spLassoPath = null;            // active lasso SVG path element
let spLassoPts  = [];              // accumulated lasso polygon vertices

// ── Sankey state ──────────────────────────────────────────────────────────────
let skWidth, skHeight, skMargin;
let dbSankeyFilter = null;  // index into SCRAP_COLS of active stream filter, or null

// ── Bar chart state ───────────────────────────────────────────────────────────
let baWidth, baHeight, baMargin;
let baXAxisG, baYAxisG, baRefLine;

// ── Heatmap state ─────────────────────────────────────────────────────────────
let hmSvg, hmG, hmWidth, hmHeight, hmMargin, hmXScale, hmYScale, hmColorScale;
