
// ==========================================
// 1. CONSTANTS
// ==========================================
const REF_ARM = 1037.8;
const K_CONST = 50.0;
const C_CONST = 75000.0;
const MAC_LEN = 199.7;
const LEMAC = 991.9;

const MTOW = 113398;
const MLW = 95254;
const MZFW = 90718;

// Polygons
const ZFW_POLY = [
    { x: 33.1, y: 55000 }, { x: 19.1, y: 85910 }, { x: 45.0, y: 85910 },
    { x: 45.0, y: 87996 }, { x: 47.0, y: 90718 }, { x: 79.0, y: 90718 },
    { x: 81.0, y: 85000 }, { x: 69.7, y: 55000 }, { x: 33.1, y: 55000 }
];

const TOW_POLY = [
    { x: 33.1, y: 55000 }, { x: 13.0, y: 100244 }, { x: 16.8, y: 111811 }, { x: 24.2, y: 113398 },
    { x: 57.0, y: 113398 }, { x: 81.9, y: 111130 }, { x: 91.8, y: 97976 }, { x: 69.7, y: 55000 },
    { x: 33.1, y: 55000 }
];

const LW_POLY = [
    { x: 33.1, y: 55000 }, { x: 17.6, y: 89811 }, { x: 18.0, y: 95254 },
    { x: 90.0, y: 95254 }, { x: 69.7, y: 55000 }, { x: 33.1, y: 55000 }
];

// Stab Data {Weight: [[Mac, Stab], ...]}
const STAB_DATA = {
    60000: [[9.0, 5.53], [14.7, 4.5], [37.4, 2.0], [39.0, 2.0]],
    70000: [[9.0, 5.92], [17.6, 4.5], [39.0, 2.04]],
    80000: [[9.0, 6.36], [19.7, 4.5], [39.0, 2.26]],
    90000: [[9.0, 6.82], [21.6, 4.5], [39.0, 2.48]],
    100000: [[10.2, 7.0], [23.5, 4.5], [39.0, 2.7]],
    110000: [[12.4, 7.0], [25.7, 4.5], [39.0, 2.7]],
    120000: [[14.6, 7.0], [27.9, 4.5], [39.0, 2.7]]
};
const SORTED_WEIGHTS = Object.keys(STAB_DATA).map(Number).sort((a, b) => a - b);


// ==========================================
// 2. LOGIC CLASS
// ==========================================
class TrimCalculator {
    calculate_mac(weight, index) {
        if (weight <= 0) return 0;
        let arm = (C_CONST * (index - K_CONST)) / weight + REF_ARM;
        let mac = ((arm - LEMAC) / MAC_LEN) * 100;
        return mac;
    }

    _interp_line(x, x1, y1, x2, y2) {
        if (x2 === x1) return y1;
        return y1 + (x - x1) * (y2 - y1) / (x2 - x1);
    }

    _get_stab_on_curve(weight_key, mac) {
        let points = STAB_DATA[weight_key];
        // Ensure sorted by MAC (should be already)

        // Find segment
        for (let i = 0; i < points.length - 1; i++) {
            let p1 = points[i];
            let p2 = points[i + 1];
            if (mac >= p1[0] && mac <= p2[0]) {
                return this._interp_line(mac, p1[0], p1[1], p2[0], p2[1]);
            }
        }
        // Clamp/Extrapolate behavior - use endpoints
        if (mac < points[0][0]) return points[0][1];
        return points[points.length - 1][1];
    }

    calculate_stab(weight, mac) {
        if (weight < 60000) weight = 60000;
        if (weight > 120000) weight = 120000;

        let w_low = SORTED_WEIGHTS[0];
        let w_high = SORTED_WEIGHTS[SORTED_WEIGHTS.length - 1];

        for (let w of SORTED_WEIGHTS) {
            if (w <= weight) w_low = w;
            if (w >= weight) { w_high = w; break; }
        }

        if (w_low === w_high) return this._get_stab_on_curve(w_low, mac);

        let s_low = this._get_stab_on_curve(w_low, mac);
        let s_high = this._get_stab_on_curve(w_high, mac);

        return this._interp_line(weight, w_low, s_low, w_high, s_high);
    }

    // Ray casting algorithm
    point_in_polygon(x, y, poly) {
        let inside = false;
        let p1 = poly[0];
        for (let i = 0; i <= poly.length; i++) {
            let p2 = poly[i % poly.length];
            if (y > Math.min(p1.y, p2.y)) {
                if (y <= Math.max(p1.y, p2.y)) {
                    if (x <= Math.max(p1.x, p2.x)) {
                        let xinters = 0;
                        if (p1.y !== p2.y) {
                            xinters = (y - p1.y) * (p2.x - p1.x) / (p2.y - p1.y) + p1.x;
                        }
                        if (p1.x === p2.x || x <= xinters) {
                            inside = !inside;
                        }
                    }
                }
            }
            p1 = p2;
        }
        return inside;
    }

    check_validity(weight, index, poly, max_w) {
        if (weight > max_w) return { ok: false, msg: `Weight > ${max_w}` };
        if (!this.point_in_polygon(index, weight, poly)) return { ok: false, msg: "Out of Envelope" };
        return { ok: true, msg: "OK" };
    }
}

// ==========================================
// 3. UI CONTROLLER
// ==========================================
const calc = new TrimCalculator();
let myChart = null;

function initChart() {
    const ctx = document.getElementById('envelopeChart').getContext('2d');

    myChart = new Chart(ctx, {
        type: 'scatter',
        data: {
            datasets: [
                {
                    label: 'Flight Envelope',
                    data: TOW_POLY,
                    borderColor: 'black',
                    backgroundColor: 'rgba(0,0,0,0)',
                    showLine: true,
                    borderWidth: 2,
                    pointRadius: 0
                },
                {
                    label: 'ZFW Envelope',
                    data: ZFW_POLY,
                    borderColor: 'blue',
                    backgroundColor: 'rgba(0,0,255,0.05)',
                    showLine: true,
                    borderDash: [5, 5],
                    pointRadius: 0
                },
                {
                    label: 'Landing Envelope',
                    data: LW_POLY,
                    borderColor: 'red',
                    backgroundColor: 'rgba(255,0,0,0)',
                    showLine: true,
                    borderDash: [2, 2],
                    pointRadius: 0
                },
                // User Points — one dataset per weight type
                {
                    label: 'ZFW',
                    data: [],
                    pointRadius: 7,
                    pointHoverRadius: 9,
                    backgroundColor: '#3B82F6',
                    borderColor: '#3B82F6',
                    borderWidth: 2,
                    pointStyle: 'circle'
                },
                {
                    label: 'TOW',
                    data: [],
                    pointRadius: 7,
                    pointHoverRadius: 9,
                    backgroundColor: '#F97316',
                    borderColor: '#F97316',
                    borderWidth: 2,
                    pointStyle: 'circle'
                },
                {
                    label: 'LW',
                    data: [],
                    pointRadius: 7,
                    pointHoverRadius: 9,
                    backgroundColor: '#10B981',
                    borderColor: '#10B981',
                    borderWidth: 2,
                    pointStyle: 'circle'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    type: 'linear',
                    position: 'bottom',
                    title: { display: true, text: 'Index' },
                    min: 0, max: 100
                },
                y: {
                    title: { display: true, text: 'Weight (kg)' },
                    min: 40000, max: 120000
                }
            },
            plugins: {
                legend: { position: 'top' }
            }
        }
    });
}

function calculate() {
    // Inputs
    const w_zfw = parseFloat(document.getElementById('w_zfw').value);
    const i_zfw = parseFloat(document.getElementById('i_zfw').value);

    const w_tow = parseFloat(document.getElementById('w_tow').value);
    const i_tow = parseFloat(document.getElementById('i_tow').value);

    const w_lw = parseFloat(document.getElementById('w_lw').value);
    const i_lw = parseFloat(document.getElementById('i_lw').value);

    // Calc
    const inputs = [
        { name: 'ZFW', w: w_zfw, i: i_zfw, poly: ZFW_POLY, lim: MZFW },
        { name: 'TOW', w: w_tow, i: i_tow, poly: TOW_POLY, lim: MTOW },
        { name: 'LW', w: w_lw, i: i_lw, poly: LW_POLY, lim: MLW }
    ];

    // Base colors for each point type (shown when OK)
    const BASE_COLORS = { ZFW: '#3B82F6', TOW: '#F97316', LW: '#10B981' };
    const FAIL_COLOR = '#EF4444';

    let resultsHtml = '';

    inputs.forEach((item, idx) => {
        let mac = calc.calculate_mac(item.w, item.i);
        let valid = calc.check_validity(item.w, item.i, item.poly, item.lim);
        let statusClass = valid.ok ? 'status-ok' : 'status-fail';
        let color = valid.ok ? BASE_COLORS[item.name] : FAIL_COLOR;

        resultsHtml += `
            <div class="result-item">
                <span class="res-type" style="color:${color}">${item.name}</span>
                <span class="res-val">${mac.toFixed(1)}% MAC</span>
                <span class="res-status ${statusClass}">${valid.ok ? 'OK' : 'FAIL'}</span>
            </div>
        `;

        // Update corresponding dataset (3=ZFW, 4=TOW, 5=LW)
        myChart.data.datasets[3 + idx].data = [{ x: item.i, y: item.w }];
        myChart.data.datasets[3 + idx].backgroundColor = color;
        myChart.data.datasets[3 + idx].borderColor = color;
    });

    // STAB display
    let mac_tow = calc.calculate_mac(w_tow, i_tow);
    let valid_tow = calc.check_validity(w_tow, i_tow, TOW_POLY, MTOW);
    if (valid_tow.ok) {
        let stab = calc.calculate_stab(w_tow, mac_tow);
        resultsHtml += `<div class="stab-box">STAB TRIM: ${stab.toFixed(2)}</div>`;
    }

    document.getElementById('results-content').innerHTML = resultsHtml;
    document.getElementById('results-card').classList.remove('hidden');

    myChart.update();
}

// Init
window.onload = initChart;

