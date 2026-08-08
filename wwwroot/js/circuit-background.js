// ============================================================
// Generador del fondo de placa de circuito.
// Se ejecuta solo, busca <div id="board"></div> y dibuja el SVG ahí.
// Editá los parámetros marcados con "AJUSTA ACÁ" para personalizar.
// ============================================================
(function () {

    function init() {
        const boardEl = document.getElementById('board');
        if (!boardEl) return; // si esta página no tiene el fondo, no hace nada

        // RNG con semilla fija para que el layout sea estable entre recargas.
        // Cambiá el número para obtener otra distribución de vías/resistencias.
        function mulberry32(a) {
            return function () {
                a |= 0; a = a + 0x6D2B79F5 | 0;
                let t = Math.imul(a ^ a >>> 15, 1 | a);
                t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
                return ((t ^ t >>> 14) >>> 0) / 4294967296;
            };
        }
        const rand = mulberry32(20260721);
        const W = 1200, H = 700;

        // Traza tipo PCB: recto en el eje dominante + chaflán corto de 45°
        const CHAMFER_MAX = 16;
        function routePoints(x1, y1, x2, y2) {
            const dx = x2 - x1, dy = y2 - y1;
            const adx = Math.abs(dx), ady = Math.abs(dy);
            if (adx < 0.6 || ady < 0.6) return [{ x: x1, y: y1 }, { x: x2, y: y2 }];
            const sx = dx > 0 ? 1 : -1, sy = dy > 0 ? 1 : -1;
            const chamfer = Math.min(CHAMFER_MAX, adx, ady);
            const hFirst = adx >= ady;
            const p1 = hFirst ? { x: x2 - sx * chamfer, y: y1 } : { x: x1, y: y2 - sy * chamfer };
            const p2 = hFirst ? { x: x2, y: y1 + sy * chamfer } : { x: x1 + sx * chamfer, y: y2 };
            return [{ x: x1, y: y1 }, p1, p2, { x: x2, y: y2 }];
        }
        function pointsToPath(pts) {
            return pts.map((p, i) => (i === 0 ? 'M ' : 'L ') + p.x.toFixed(1) + ' ' + p.y.toFixed(1)).join(' ');
        }
        function tracePath(x1, y1, x2, y2) { return pointsToPath(routePoints(x1, y1, x2, y2)); }
        function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

        // ---- Detección de colisiones con los cuerpos de los componentes ----
        const keepouts = []; // rectángulos {x,y,w,h} que ningún trazo debe atravesar
        function addKeepout(cx, cy, w, h, margin) {
            margin = margin || 3;
            keepouts.push({ x: cx - w / 2 - margin, y: cy - h / 2 - margin, w: w + margin * 2, h: h + margin * 2 });
        }
        function cross(ax, ay, bx, by) { return ax * by - ay * bx; }
        function segSeg(ax1, ay1, ax2, ay2, bx1, by1, bx2, by2) {
            const d1 = cross(bx2 - bx1, by2 - by1, ax1 - bx1, ay1 - by1);
            const d2 = cross(bx2 - bx1, by2 - by1, ax2 - bx1, ay2 - by1);
            const d3 = cross(ax2 - ax1, ay2 - ay1, bx1 - ax1, by1 - ay1);
            const d4 = cross(ax2 - ax1, ay2 - ay1, bx2 - ax1, by2 - ay1);
            return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
        }
        function segRectHit(x1, y1, x2, y2, r) {
            if (x1 >= r.x && x1 <= r.x + r.w && y1 >= r.y && y1 <= r.y + r.h) return true;
            if (x2 >= r.x && x2 <= r.x + r.w && y2 >= r.y && y2 <= r.y + r.h) return true;
            const rx = r.x, ry = r.y, rw = r.w, rh = r.h;
            return segSeg(x1, y1, x2, y2, rx, ry, rx + rw, ry) ||
                segSeg(x1, y1, x2, y2, rx + rw, ry, rx + rw, ry + rh) ||
                segSeg(x1, y1, x2, y2, rx + rw, ry + rh, rx, ry + rh) ||
                segSeg(x1, y1, x2, y2, rx, ry + rh, rx, ry);
        }
        function pathClear(x1, y1, x2, y2) {
            const pts = routePoints(x1, y1, x2, y2);
            for (let i = 0; i < pts.length - 1; i++) {
                const a = pts[i], b = pts[i + 1];
                for (const r of keepouts) { if (segRectHit(a.x, a.y, b.x, b.y, r)) return false; }
            }
            return true;
        }

        let svg = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">`;

        const anchors = [];   // puntos de pines/leads disponibles para rutear
        const vias = [];      // vías generadas

        // ---------- Chip grande QFP (protagonista) ----------
        // AJUSTA ACÁ: posición (cx,cy) y tamaño (half = mitad del lado)
        const qfp = { cx: 600, cy: 330, half: 62 };
        addKeepout(qfp.cx, qfp.cy, qfp.half * 2, qfp.half * 2, 2);
        svg += `<rect class="chip-body" x="${qfp.cx - qfp.half}" y="${qfp.cy - qfp.half}" width="${qfp.half * 2}" height="${qfp.half * 2}" rx="3"/>`;
        svg += `<line class="chip-detail" x1="${qfp.cx - 40}" y1="${qfp.cy}" x2="${qfp.cx + 40}" y2="${qfp.cy}"/>`;
        svg += `<line class="chip-detail" x1="${qfp.cx}" y1="${qfp.cy - 40}" x2="${qfp.cx}" y2="${qfp.cy + 40}"/>`;
        svg += `<circle class="chip-dot" cx="${qfp.cx - qfp.half + 8}" cy="${qfp.cy - qfp.half + 8}" r="2.4"/>`;

        const pinsPerSide = 9, pinLen = 16, pitch = (qfp.half * 2 - 20) / (pinsPerSide - 1);
        const qfpPins = [];
        const SIDE_DX = [0, 1, 0, -1], SIDE_DY = [-1, 0, 1, 0];
        for (let side = 0; side < 4; side++) {
            for (let i = 0; i < pinsPerSide; i++) {
                const off = -qfp.half + 10 + i * pitch;
                let x1, y1, x2, y2;
                if (side === 0) { x1 = qfp.cx + off; y1 = qfp.cy - qfp.half; x2 = qfp.cx + off; y2 = qfp.cy - qfp.half - pinLen; }
                if (side === 1) { x1 = qfp.cx + qfp.half; y1 = qfp.cy + off; x2 = qfp.cx + qfp.half + pinLen; y2 = qfp.cy + off; }
                if (side === 2) { x1 = qfp.cx + off; y1 = qfp.cy + qfp.half; x2 = qfp.cx + off; y2 = qfp.cy + qfp.half + pinLen; }
                if (side === 3) { x1 = qfp.cx - qfp.half; y1 = qfp.cy + off; x2 = qfp.cx - qfp.half - pinLen; y2 = qfp.cy + off; }
                svg += `<line class="chip-pin" x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"/>`;
                qfpPins.push({ x: x2, y: y2, dx: SIDE_DX[side], dy: SIDE_DY[side] });
            }
        }
        qfpPins.forEach(p => anchors.push(p));

        // ---------- Chips pequeños (SOIC) ----------
        // orientation: 'h' (pines a los costados, por defecto) o 'v' (pines arriba/abajo)
        function smallChip(cx, cy, w, h, pins, orientation) {
            orientation = orientation || 'h';
            addKeepout(cx, cy, w, h, 2);
            svg += `<rect class="chip-body" x="${cx - w / 2}" y="${cy - h / 2}" width="${w}" height="${h}" rx="3"/>`;
            svg += `<circle class="chip-dot" cx="${cx - w / 2 + 6}" cy="${cy - h / 2 + 6}" r="2"/>`;

            if (orientation === 'v') {
                const pitchX = (w - 14) / (pins - 1);
                for (let i = 0; i < pins; i++) {
                    const x = cx - w / 2 + 7 + i * pitchX;
                    const y1T = cy - h / 2, y2T = cy - h / 2 - 12;
                    const y1B = cy + h / 2, y2B = cy + h / 2 + 12;
                    svg += `<line class="chip-pin" x1="${x.toFixed(1)}" y1="${y1T}" x2="${x.toFixed(1)}" y2="${y2T}"/>`;
                    svg += `<line class="chip-pin" x1="${x.toFixed(1)}" y1="${y1B}" x2="${x.toFixed(1)}" y2="${y2B}"/>`;
                    anchors.push({ x: x, y: y2T, dx: 0, dy: -1 }); anchors.push({ x: x, y: y2B, dx: 0, dy: 1 });
                }
            } else {
                const pitchY = (h - 14) / (pins - 1);
                for (let i = 0; i < pins; i++) {
                    const y = cy - h / 2 + 7 + i * pitchY;
                    const x1L = cx - w / 2, x2L = cx - w / 2 - 12;
                    const x1R = cx + w / 2, x2R = cx + w / 2 + 12;
                    svg += `<line class="chip-pin" x1="${x1L}" y1="${y.toFixed(1)}" x2="${x2L}" y2="${y.toFixed(1)}"/>`;
                    svg += `<line class="chip-pin" x1="${x1R}" y1="${y.toFixed(1)}" x2="${x2R}" y2="${y.toFixed(1)}"/>`;
                    anchors.push({ x: x2L, y: y, dx: -1, dy: 0 }); anchors.push({ x: x2R, y: y, dx: 1, dy: 0 });
                }
            }
        }

        // AJUSTA ACÁ: agregá, quitá, reposicioná o reorientá chips.
        // smallChip(cx, cy, ancho, alto, pines_por_lado, 'h'|'v')
        smallChip(940, 150, 70, 60, 4, 'h');
        smallChip(270, 520, 64, 50, 3, 'h');
        smallChip(860, 560, 60, 44, 3, 'h');
        smallChip(1080, 340, 54, 40, 3, 'h');
        smallChip(150, 150, 58, 42, 3, 'h');
        smallChip(650, 600, 66, 46, 4, 'h');
        // Ejemplos de chips en orientación vertical (pines arriba/abajo):
        // smallChip(500,80,60,44,3,'v');
        // smallChip(1050,600,70,50,4,'v');

        // ---------- Conectores tipo header ----------
        // connector(x, y, ancho, alto, pines, direccion) — direccion: 1 = pines hacia la derecha, -1 = hacia la izquierda
        function connector(x, y, w, h, pins, dir) {
            addKeepout(x + w / 2, y + h / 2, w, h, 2);
            svg += `<rect class="conn-body" x="${x}" y="${y}" width="${w}" height="${h}" rx="2"/>`;
            const pitch = h / (pins + 1);
            for (let i = 1; i <= pins; i++) {
                const py = y + i * pitch;
                const px1 = dir > 0 ? x + w : x;
                const px2 = dir > 0 ? x + w + 18 : x - 18;
                svg += `<line class="conn-pin" x1="${px1}" y1="${py.toFixed(1)}" x2="${px2}" y2="${py.toFixed(1)}"/>`;
                anchors.push({ x: px2, y: py, dx: (dir > 0 ? 1 : -1), dy: 0 });
            }
        }
        // AJUSTA ACÁ: conectores tipo header
        connector(30, 40, 22, 60, 4, 1);
        connector(20, 270, 20, 80, 5, 1);
        connector(20, 540, 24, 140, 8, 1);
        connector(W - 52, 80, 22, 70, 5, -1);
        connector(W - 46, 470, 20, 90, 6, -1);

        // ---------- Grid de fabricación (para un layout más ordenado) ----------
        const GRID = 20;
        function buildGridPool() {
            const pts = [];
            for (let gx = GRID; gx < W - GRID; gx += GRID) {
                for (let gy = GRID; gy < H - GRID; gy += GRID) {
                    pts.push({ x: gx, y: gy });
                }
            }
            for (let i = pts.length - 1; i > 0; i--) {
                const j = Math.floor(rand() * (i + 1));
                const tmp = pts[i]; pts[i] = pts[j]; pts[j] = tmp;
            }
            return pts;
        }
        const gridPool = buildGridPool();
        const usedSpots = [];
        function spotOk(p, minSpacing) {
            if (dist(p, { x: qfp.cx, y: qfp.cy }) < qfp.half + 20) return false;
            for (const k of keepouts) {
                if (p.x >= k.x - 3 && p.x <= k.x + k.w + 3 && p.y >= k.y - 3 && p.y <= k.y + k.h + 3) return false;
            }
            for (const a of anchors) if (dist(p, a) < minSpacing) return false;
            for (const s of usedSpots) if (dist(p, s) < minSpacing) return false;
            return true;
        }

        // ---------- Vías (agujeros metalizados), alineadas a la grilla ----------
        // AJUSTA ACÁ: subí/bajá el número para más o menos vías (nodos de conexión)
        for (const p of gridPool) {
            if (vias.length >= 132) break;
            if (spotOk(p, 22)) { vias.push(p); usedSpots.push(p); }
        }
        vias.forEach(v => {
            svg += `<circle class="via-ring" cx="${v.x.toFixed(1)}" cy="${v.y.toFixed(1)}" r="4.2"/>`;
            svg += `<circle class="via-hole" cx="${v.x.toFixed(1)}" cy="${v.y.toFixed(1)}" r="1.7"/>`;
        });

        // ---------- Resistencias SMD, también alineadas a la grilla ----------
        // AJUSTA ACÁ: subí/bajá el número para más o menos resistencias
        const resistors = [];
        for (const p of gridPool) {
            if (resistors.length >= 34) break;
            if (spotOk(p, 24)) {
                const rot = rand() > 0.5 ? 0 : 90;
                resistors.push({ x: p.x, y: p.y, rot });
                usedSpots.push(p);
            }
        }
        resistors.forEach(r => {
            const w = 16, h = 7;
            const kw = r.rot === 0 ? w + 12 : h;
            const kh = r.rot === 0 ? h : w + 12;
            addKeepout(r.x, r.y, kw, kh, 2);
            svg += `<g transform="translate(${r.x.toFixed(1)},${r.y.toFixed(1)}) rotate(${r.rot})">`;
            svg += `<rect class="res-body" x="${-w / 2}" y="${-h / 2}" width="${w}" height="${h}" rx="1.2"/>`;
            svg += `<line class="res-band" x1="${-w / 2 + 4}" y1="${-h / 2}" x2="${-w / 2 + 4}" y2="${h / 2}"/>`;
            svg += `<line class="res-lead" x1="${-w / 2 - 6}" y1="0" x2="${-w / 2}" y2="0"/>`;
            svg += `<line class="res-lead" x1="${w / 2}" y1="0" x2="${w / 2 + 6}" y2="0"/>`;
            svg += `</g>`;
            const rad = r.rot * Math.PI / 180;
            const ux = Math.cos(rad), uy = Math.sin(rad);
            const offX = ux * (w / 2 + 6), offY = uy * (w / 2 + 6);
            anchors.push({ x: r.x - offX, y: r.y - offY, dx: -ux, dy: -uy });
            anchors.push({ x: r.x + offX, y: r.y + offY, dx: ux, dy: uy });
        });

        // ---------- Agujeros de montaje ----------
        [[36, 36], [W - 36, 36], [36, H - 36], [W - 36, H - 36]].forEach(([x, y]) => {
            addKeepout(x, y, 30, 30, 2);
            svg += `<circle class="mount-hole" cx="${x}" cy="${y}" r="13"/>`;
        });

        // ---------- Ruteo de trazos ----------
        const traces = [];
        function viasSortedByDist(p) {
            return vias.map(v => ({ v, d: dist(p, v) })).sort((a, b) => a.d - b.d).map(o => o.v);
        }
        function routeToNearestClearVia(p, maxTry) {
            maxTry = maxTry || 8;
            const candidates = viasSortedByDist(p);
            for (let i = 0; i < Math.min(maxTry, candidates.length); i++) {
                const v = candidates[i];
                if (dist(p, v) < 6) continue;
                if (pathClear(p.x, p.y, v.x, v.y)) return v;
            }
            return null;
        }
        function polylineClear(points) {
            for (let i = 0; i < points.length - 1; i++) {
                const [x1, y1] = points[i], [x2, y2] = points[i + 1];
                for (const r of keepouts) { if (segRectHit(x1, y1, x2, y2, r)) return false; }
            }
            return true;
        }
        function polylineD(points) {
            return points.map((pt, i) => (i === 0 ? 'M ' : 'L ') + pt[0].toFixed(1) + ' ' + pt[1].toFixed(1)).join(' ');
        }
        function routePinToNearestClearVia(p, maxTry) {
            maxTry = maxTry || 10;
            const candidates = viasSortedByDist(p);
            for (let i = 0; i < Math.min(maxTry, candidates.length); i++) {
                const v = candidates[i];
                if (dist(p, v) < 10) continue;
                const breakout = 16 + rand() * 20;
                const bx = p.x + p.dx * breakout, by = p.y + p.dy * breakout;
                const sub = routePoints(bx, by, v.x, v.y);
                const pts = [[p.x, p.y]].concat(sub.map(pt => [pt.x, pt.y]));
                if (polylineClear(pts)) return { v, d: polylineD(pts) };
            }
            return null;
        }

        // AJUSTA ACÁ: 0.96 = se rutea ~96% de los pines. Bajalo para más huecos, subilo para más líneas.
        anchors.forEach((p) => {
            if (rand() > 0.96) return;
            const r = routePinToNearestClearVia(p);
            if (!r) return;
            traces.push({ d: r.d });
        });

        // Vías conectadas entre sí: cada vía se une a sus vecinas más cercanas
        const viaEdgeSeen = new Set();
        function neighborKey(i, j) { return i < j ? i + '_' + j : j + '_' + i; }
        vias.forEach((v, i) => {
            const scored = vias.map((o, j) => {
                if (j === i) return null;
                const ddx = Math.abs(o.x - v.x), ddy = Math.abs(o.y - v.y);
                const d = Math.hypot(ddx, ddy);
                if (d > 190 || d < 4) return null;
                const aligned = (ddx < 6 || ddy < 6);
                return { o, j, score: aligned ? d * 0.5 : d };
            }).filter(Boolean).sort((a, b) => a.score - b.score);
            let made = 0;
            for (const cand of scored) {
                if (made >= 2) break; // AJUSTA ACÁ: más conexiones por vía = más líneas
                const key = neighborKey(i, cand.j);
                if (viaEdgeSeen.has(key)) continue;
                if (!pathClear(v.x, v.y, cand.o.x, cand.o.y)) continue;
                viaEdgeSeen.add(key);
                traces.push({ d: tracePath(v.x, v.y, cand.o.x, cand.o.y) });
                made++;
            }
        });

        // ---------- Líneas que entran/salen por los bordes del fondo ----------
        function edgePoint() {
            const side = Math.floor(rand() * 4);
            if (side === 0) return { x: rand() * W, y: -20 };
            if (side === 1) return { x: W + 20, y: rand() * H };
            if (side === 2) return { x: rand() * W, y: H + 20 };
            return { x: -20, y: rand() * H };
        }
        // AJUSTA ACÁ: cantidad de líneas que entran/salen por los bordes
        let edgeAdded = 0, edgeTries = 0;
        while (edgeAdded < 46 && edgeTries < 600) {
            edgeTries++;
            const e = edgePoint();
            let target = null;
            if (rand() < 0.7) target = routeToNearestClearVia(e, 12);
            if (!target) {
                const e2 = edgePoint();
                if (pathClear(e.x, e.y, e2.x, e2.y)) target = e2;
            }
            if (!target) continue;
            traces.push({ d: tracePath(e.x, e.y, target.x, target.y), edge: true });
            edgeAdded++;
        }

        traces.forEach((t) => {
            svg += `<path class="${rand() > 0.6 ? 'trace-line' : 'trace-thin'}" d="${t.d}"/>`;
        });

        // AJUSTA ACÁ: proporción de líneas con el pulso animado de corriente
        const pulseSample = traces.filter(t => rand() < (t.edge ? 0.42 : 0.16));
        pulseSample.forEach((t) => {
            const dur = (3.5 + rand() * 2.5).toFixed(2);
            const delay = (rand() * 4).toFixed(2);
            svg += `<path class="pulse" pathLength="100" d="${t.d}" style="animation-duration:${dur}s; animation-delay:${delay}s;"/>`;
        });

        svg += `</svg>`;
        boardEl.innerHTML = svg;
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();