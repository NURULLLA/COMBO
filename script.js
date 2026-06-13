import { PMC_COEFFICIENTS, PAG_COEFFICIENTS, LOWER_DECK_TABLE, FUEL_TABLE } from './data.js';

// Volume Limits (m3)
const FWD_VOL_LIMIT = 19.0; // C1 + C2
const AFT_VOL_LIMIT = 30.7; // C3 + C4

// --- Calculation Logic ---

function interpolateFuelIndex(weight) {
    if (weight <= 0) return 0;
    if (weight < FUEL_TABLE[0].w) return FUEL_TABLE[0].i;
    for (let k = 0; k < FUEL_TABLE.length - 1; k++) {
        const p1 = FUEL_TABLE[k];
        const p2 = FUEL_TABLE[k + 1];
        if (weight >= p1.w && weight <= p2.w) {
            const ratio = (weight - p1.w) / (p2.w - p1.w);
            return p1.i + ratio * (p2.i - p1.i);
        }
    }
    return FUEL_TABLE[FUEL_TABLE.length - 1].i;
}

function getLowerDeckIndex(cpt, weight) {
    const table = LOWER_DECK_TABLE[cpt];
    if (!table) return 0;
    for (let entry of table) {
        if (weight <= entry.max) return entry.val;
    }
    return table[table.length - 1].val;
}

// Global State
const state = {
    type: 'PMC', // PMC or PAG
    dow: 0,
    dowIndex: 0,
    fob: 0,
    trip: 0,
    mainDeck: Array(15).fill(0), // Max size
    bulkItems: Array(20).fill(0),
    bulkDims: Array(20).fill({ l: 0, w: 0, h: 0 }), // Dimensions in cm
    lowerDeck: { cpt1: 0, cpt2: 0, cpt3: 0, cpt4: 0 }
};

// UI References
const els = {};

function init() {
    // Bind Elements
    els.app = document.getElementById('app');
    els.inputs = document.getElementById('inputs');
    els.results = document.getElementById('results');
    els.typeSelect = document.getElementById('typeSelect');

    // Bind Inputs
    els.typeSelect.addEventListener('change', (e) => {
        state.type = e.target.value;
        renderMainDeckInputs();
        calculate();
    });

    // Global Input Listener
    document.addEventListener('input', (e) => {
        if (e.target.matches('.calc-input')) {
            const field = e.target.dataset.field;
            const val = parseFloat(e.target.value) || 0;

            if (field === 'dow') state.dow = val;
            if (field === 'dowIndex') state.dowIndex = val;
            if (field === 'fob') state.fob = val;
            if (field === 'trip') state.trip = val;
            if (field.startsWith('main-')) {
                const idx = parseInt(field.split('-')[1]);
                state.mainDeck[idx] = val;
            }
            if (field.startsWith('cpt')) {
                state.lowerDeck[field] = val;
            }
            if (field.startsWith('bulk-dim-')) {
                // Format: bulk-dim-TYPE-INDEX (e.g., bulk-dim-l-0)
                const parts = field.split('-');
                const type = parts[2]; // l, w, or h
                const idx = parseInt(parts[3]);
                // We need to clone the object to avoid reference issues if initially filling with same object
                const currentDims = { ...state.bulkDims[idx] };
                currentDims[type] = val;
                state.bulkDims[idx] = currentDims;
            }
            calculate();
        }
    });

    document.getElementById('optimizeBtn').addEventListener('click', optimize);

    renderMainDeckInputs();
    calculate();
}

function renderMainDeckInputs() {
    const container = document.getElementById('mainDeckGrid');
    container.innerHTML = '';
    const count = state.type === 'PMC' ? 13 : 15;
    const coeffs = state.type === 'PMC' ? PMC_COEFFICIENTS : PAG_COEFFICIENTS;

    for (let i = 0; i < count; i++) {
        const div = document.createElement('div');
        div.className = 'flex flex-col';
        div.innerHTML = `
      <label class="text-xs text-slate-400 mb-1">Pos ${i + 1}</label>
      <input type="number" data-field="main-${i}" value="${state.mainDeck[i] || ''}" 
             class="calc-input bg-slate-800 border border-slate-700 rounded p-2 text-right text-white focus:border-blue-500 outline-none" 
             placeholder="kg">
      <div id="res-main-${i}" class="text-xs text-blue-400 text-right mt-1 font-mono">Idx: 0.0</div>
    `;
        container.appendChild(div);
    }
}

function calculate() {
    const coeffs = state.type === 'PMC' ? PMC_COEFFICIENTS : PAG_COEFFICIENTS;
    const count = state.type === 'PMC' ? 13 : 15;

    // Main Deck
    let totalMainWt = 0;
    let totalMainIdx = 0;
    for (let i = 0; i < count; i++) {
        const w = state.mainDeck[i] || 0;
        const idx = w * (coeffs[i] || 0);
        totalMainWt += w;
        totalMainIdx += idx;

        // Update individual display
        const el = document.getElementById(`res-main-${i}`);
        if (el) el.textContent = `Idx: ${idx.toFixed(1)}`;
    }

    // Lower Deck
    let totalLowerWt = 0;
    let totalLowerIdx = 0;
    ['cpt1', 'cpt2', 'cpt3', 'cpt4'].forEach(key => {
        const w = state.lowerDeck[key] || 0;
        const idx = getLowerDeckIndex(key, w);
        totalLowerWt += w;
        totalLowerIdx += idx;

        const el = document.getElementById(`res-${key}`);
        if (el) el.textContent = `Idx: ${idx.toFixed(1)}`;
    });

    // Totals
    const loadWt = totalMainWt + totalLowerWt;
    const loadIdx = totalMainIdx + totalLowerIdx;

    // Fuel
    const TAXI = 380;
    const toFuel = Math.max(0, state.fob - TAXI);
    const toFuelIdx = interpolateFuelIndex(toFuel);

    const remFuel = Math.max(0, toFuel - state.trip);
    const remFuelIdx = interpolateFuelIndex(remFuel); // Index of remaining fuel
    // Note: Trip Fuel Index Display usually shows the delta or the trip fuel index itself?
    // User says: "index box app should put the following formula TO fuel minus Trip fuel ... and for index we use index of [Result]"
    // This means the "Trip Fuel Index" box actually displays the Index of the Remaining Fuel? Or the Index of the Trip Fuel part?
    // Re-reading: "lets assume input was 15174kg ... index box app should put ... 21451-15174 = 6277kg and for index we use index of 6277"
    // So the "Trip Index" box shows the Index of the REMAINING fuel (Landing Fuel).

    // ZFW
    const zfw = state.dow + loadWt;
    const zfwIdx = state.dowIndex + loadIdx;

    // TOW
    const tow = zfw + toFuel;
    const towIdx = zfwIdx + toFuelIdx;

    // LW
    // "Landing weight formula for this is TOW minus Trip fuel"
    const lw = tow - state.trip;
    // "index formula is ZFW index plus that index of 6277 [Remaining Fuel]"
    const lwIdx = zfwIdx + remFuelIdx;

    // Render Results
    updateVal('val-load-wt', loadWt);
    updateVal('val-load-idx', loadIdx);
    updateVal('val-zfw-wt', zfw);
    updateVal('val-zfw-idx', zfwIdx);
    updateVal('val-to-fuel-wt', toFuel);
    updateVal('val-to-fuel-idx', toFuelIdx);
    updateVal('val-tow-wt', tow);
    updateVal('val-tow-idx', towIdx);
    updateVal('val-trip-rem-wt', remFuel); // Display remaining fuel in the box logic?
    // Wait, the Trip Fuel Input is 15174. The "Index" next to it is the Remaining Fuel Index.
    updateVal('val-trip-idx', remFuelIdx);
    updateVal('val-lw-wt', lw);
    updateVal('val-lw-idx', lwIdx);
}

function updateVal(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val.toFixed(1);
}

// Optimization
function optimize() {
    const coeffs = state.type === 'PMC' ? PMC_COEFFICIENTS : PAG_COEFFICIENTS;
    const count = state.type === 'PMC' ? 13 : 15; // Should this include Pos 14/15 for PMC if data exists? No.

    // Gather all Main Deck weights
    let weights = state.mainDeck.slice(0, count).filter(w => w > 0);

    while (weights.length < count) weights.push(0);

    // --- BULK OPTIMIZATION START ---
    // We need to distribute bulk items into C1, C2, C3, C4
    // Constraints:
    // 1. Weight limits per compartment (LOWER_DECK_TABLE/Limits are checked in index.html logic usually, but here we need them)
    //    Actually, limits are in data.js or defined locally? In original file limits were in index.html script?
    //    Wait, limits are NOT imported in script.js in the refactored version?
    //    Checking previous file content...
    //    Ah, LOWER_DECK_TABLE is imported. But max weights?
    //    In the `index.html` file (Step 10), `LOWER_DECK_MAX` was defined.
    //    In `script.js` (Step 11), `LOWER_DECK_TABLE` is imported.
    //    I need the max weights. I will define them here to be safe.

    const CPT_MAX_WEIGHTS = [2469, 4672, 3773, 5606]; // C1, C2, C3, C4

    // Prepare Bulk Items with Indices to track dimensions
    // We only care about items with Weight > 0
    let bulkItems = state.bulkItems
        .map((w, i) => ({ w, i, dims: state.bulkDims[i] }))
        .filter(item => item.w > 0);

    let bestBulkConfig = null;
    let bestBulkScore = Infinity; // Lower is better (spread)

    // Strategy: Random shuffle distribution for Bulk Logic
    // We need to persist this result to State?
    // The previous implementation in index.html handled bulk distribution.
    // The current `script.js` ONLY optimizes Main Deck??
    // Let me check `script.js` lines 187+.
    // It seems `script.js` provided earlier DOES NOT have the bulk distribution logic!
    // It only has `optimize()` for Main Deck?
    // "Function optimize()... Gather all Main Deck weights... Shuffle... Apply Best Order".
    // YES! The bulk distribution logic was lost or needs to be ported/added.
    // I MUST ADD IT BACK.

    // Calculate Volume for an item in m3
    const getVol = (dims) => {
        if (!dims || !dims.l || !dims.w || !dims.h) return 0;
        return (dims.l * dims.w * dims.h) / 1000000;
    };

    let bestLowerDeck = [0, 0, 0, 0];
    let distributionFound = false;

    // Try to distribute Bulk Items first (or independently)
    // 5000 Iterations for Bulk Distribution
    for (let k = 0; k < 5000; k++) {
        const shuffledBulk = [...bulkItems].sort(() => Math.random() - 0.5);
        let buckets = [0, 0, 0, 0]; // Weights
        let bucketVols = [0, 0, 0, 0]; // Volumes
        let valid = true;

        for (let item of shuffledBulk) {
            let placed = false;
            const vol = getVol(item.dims);

            // Try random compartment first to avoid always filling C1
            const startBin = Math.floor(Math.random() * 4);

            for (let i = 0; i < 4; i++) {
                const b = (startBin + i) % 4;

                // Check Weight Limit
                if (buckets[b] + item.w > CPT_MAX_WEIGHTS[b]) continue;

                // Check Volume Limit
                // Pushing to this bucket, will it exceed Group Volume?
                let newVolFWD = (b < 2 ? buckets[b] + vol : buckets[b]); // Actually we need sum
                // Easier: Temp add, check, revert if fail.

                // Forecast volumes
                let fwdVol = bucketVols[0] + bucketVols[1];
                let aftVol = bucketVols[2] + bucketVols[3];

                if (b === 0 || b === 1) fwdVol += vol;
                else aftVol += vol;

                if (fwdVol <= FWD_VOL_LIMIT && aftVol <= AFT_VOL_LIMIT) {
                    buckets[b] += item.w;
                    bucketVols[b] += vol;
                    placed = true;
                    break;
                }
            }

            if (!placed) {
                valid = false;
                break;
            }
        }

        if (valid) {
            distributionFound = true;
            // Spread Score: Max % utilization of weight
            let maxUtil = 0;
            for (let i = 0; i < 4; i++) maxUtil = Math.max(maxUtil, buckets[i] / CPT_MAX_WEIGHTS[i]);

            if (maxUtil < bestBulkScore) {
                bestBulkScore = maxUtil;
                bestLowerDeck = buckets;
            }
        }
    }

    if (bulkItems.length > 0 && !distributionFound) {
        alert("Bulk Optimization Failed: Weights or Volumes exceed limits!");
        return; // Stop main deck opt if bulk fails
    }

    // Apply best bulk distribution to State
    state.lowerDeck.cpt1 = bestLowerDeck[0];
    state.lowerDeck.cpt2 = bestLowerDeck[1];
    state.lowerDeck.cpt3 = bestLowerDeck[2];
    state.lowerDeck.cpt4 = bestLowerDeck[3];
    // --- BULK OPTIMIZATION END ---


    // Target: Total Load Index = 20.
    // Equation: Sum(MainWeights * Coeffs) + LowerDeckIndex = 20
    // TargetMainIndex = 20 - LowerDeckIndex

    // Get current lower deck index
    let totalLowerIdx = 0;
    ['cpt1', 'cpt2', 'cpt3', 'cpt4'].forEach(key => {
        totalLowerIdx += getLowerDeckIndex(key, state.lowerDeck[key] || 0);
    });

    const targetMain = 20 - totalLowerIdx;

    let bestOrder = [...weights];
    let bestDiff = Infinity;

    // Shuffle 5000 times
    for (let i = 0; i < 5000; i++) {
        const shuffled = [...weights].sort(() => Math.random() - 0.5);

        let currentIdx = 0;
        shuffled.forEach((w, pos) => {
            currentIdx += w * (coeffs[pos] || 0);
        });

        const diff = Math.abs(currentIdx - targetMain);
        if (diff < bestDiff) {
            bestDiff = diff;
            bestOrder = shuffled;
            if (diff < 0.1) break;
        }
    }

    // Apply Best Order
    for (let i = 0; i < count; i++) {
        state.mainDeck[i] = bestOrder[i];
    }
    renderMainDeckInputs();
    calculate();
    alert(`Optimization Complete! Target Index Diff: ${bestDiff.toFixed(2)}`);
}

// Start
init();
