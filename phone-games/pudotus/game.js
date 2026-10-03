(() => {
'use strict';

/* =====================================================================
   CONFIG – kaikki säädettävät arvot yhdessä paikassa
   ===================================================================== */
const CONFIG = {
  cols: 6,
  rows: 12,
  startRows: 4,                 // montako riviä täytetään alussa

  // Vaikeuskäyrä. Vaihe valitaan seuraavan siirron numeron mukaan (fromMove <= siirto).
  //   rowEvery     = uusi rivi nousee joka N:nnen siirron jälkeen
  //   colors       = käytössä olevien värien määrä
  //   stonesPerRow = kivikuutioita per nouseva rivi (desimaali = todennäköisyys lisäkivelle, esim. 0.5)
  //   preview      = montako kuutiota jonossa näytetään (2 = pudotettava + seuraava, 1 = vain pudotettava)
  stages: [
    { fromMove: 1,   rowEvery: 8, colors: 4, stonesPerRow: 0, preview: 2, label: null },
    { fromMove: 41,  rowEvery: 6, colors: 5, stonesPerRow: 0, preview: 2, label: 'New color!' },
    { fromMove: 101, rowEvery: 5, colors: 5, stonesPerRow: 1, preview: 2, label: 'Stone cubes incoming' },
    { fromMove: 181, rowEvery: 4, colors: 6, stonesPerRow: 1, preview: 1, label: 'Sixth color – shorter preview' },
    { fromMove: 251, rowEvery: 3, colors: 6, stonesPerRow: 1, preview: 1, label: 'Full speed!' },
  ],

  scoring: {
    perCube: 10,                // pistettä per poistettu kuutio
    bigGroupSize: 4,            // tästä koosta alkaen ryhmä saa bonuksen
    bonusPerExtra: 20,          // bonus per jokainen kuutio yli kolmen
    // ketjukerroin = ketjun vaihe (1, 2, 3, ...)
  },

  anim: {                       // millisekunteja
    dropBase: 70,
    dropPerRow: 16,
    clear: 190,
    fallBase: 60,
    fallPerRow: 32,
    crack: 160,
    rise: 170,
    gameOverDelay: 800,
  },

  colors: [
    { name: 'red',       c: '#ff5a76', c2: '#d42f50', symbol: 'circle' },
    { name: 'yellow',    c: '#ffcf45', c2: '#e39a00', symbol: 'triangle' },
    { name: 'green',     c: '#3ddc84', c2: '#14984f', symbol: 'square' },
    { name: 'blue',       c: '#4f8dff', c2: '#2353d6', symbol: 'diamond' },
    { name: 'purple',    c: '#c46dff', c2: '#8a2be2', symbol: 'star' },
    { name: 'pearl',     c: '#f2f3ff', c2: '#aab0d4', symbol: 'cross' },
  ],

  storageKey: 'pudotus.bestScore',
};

const SYMBOLS = {
  circle:   '<circle cx="12" cy="12" r="7.2"/>',
  triangle: '<path d="M12 3.5 21 19.5H3z"/>',
  square:   '<rect x="5" y="5" width="14" height="14" rx="1.5"/>',
  diamond:  '<path d="M12 2.5 21.5 12 12 21.5 2.5 12z"/>',
  star:     '<path d="m12 2.6 2.8 5.8 6.3.8-4.6 4.4 1.2 6.3L12 16.8l-5.7 3.1 1.2-6.3-4.6-4.4 6.3-.8z"/>',
  cross:    '<path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z"/>',
  stone:    '<path d="M5 7.5 10 11 8 16.5M10 11l5.5-2.5L19 14M15.5 8.5 16 4"/>',
};
const svg = inner => `<svg viewBox="0 0 24 24" aria-hidden="true">${inner}</svg>`;

const EASE_FALL = 'cubic-bezier(.55,0,1,.45)';
const EASE_RISE = 'cubic-bezier(.2,.7,.3,1)';

/* =====================================================================
   DOM
   ===================================================================== */
const $ = id => document.getElementById(id);
const dom = {
  board: $('board'), boardWrap: $('boardWrap'), columns: $('columns'), cubes: $('cubes'), fx: $('fx'),
  score: $('score'), moves: $('moves'), rowIn: $('rowIn'), rowStat: $('rowStat'),
  qCurrent: $('qCurrent'), qNext: $('qNext'), qNextSlot: $('qNextSlot'),
  start: $('startScreen'), end: $('endScreen'), startBest: $('startBest'),
  endScore: $('endScore'), endMoves: $('endMoves'), endBest: $('endBest'), newBest: $('newBest'),
  debug: $('debug'),
};
const DEBUG = new URLSearchParams(location.search).get('debug') === '1';
const { cols: COLS, rows: ROWS } = CONFIG;

/* =====================================================================
   Tila
   ===================================================================== */
const S = {
  grid: [], els: new Map(), nextId: 1, queue: [],
  score: 0, moves: 0, rowIn: 0, longestChain: 0,
  busy: false, over: true, startTime: 0, stageIdx: 0,
};
let bestScore = loadBest();

function loadBest() {
  try { return parseInt(localStorage.getItem(CONFIG.storageKey), 10) || 0; } catch { return 0; }
}
function saveBest(v) {
  try { localStorage.setItem(CONFIG.storageKey, String(v)); } catch { /* ei tallennusta */ }
}

/* =====================================================================
   Apurit
   ===================================================================== */
const rand = n => Math.floor(Math.random() * n);
const sleep = ms => new Promise(res => setTimeout(res, ms));
const emptyGrid = () => Array.from({ length: ROWS }, () => Array(COLS).fill(null));

function stageIndexFor(move) {
  let idx = 0;
  CONFIG.stages.forEach((st, i) => { if (move >= st.fromMove) idx = i; });
  return idx;
}
const stage = () => CONFIG.stages[stageIndexFor(S.moves + 1)];
const randomColor = () => rand(stage().colors);
const makeCell = (color, stone = false) => ({ id: S.nextId++, color, stone });
const same = (cell, color) => !!cell && !cell.stone && cell.color === color;
const colHeight = c => S.grid.reduce((n, row) => n + (row[c] ? 1 : 0), 0);

function paintFace(face, cell) {
  if (cell.stone) {
    face.className = 'face stone';
    face.innerHTML = svg(SYMBOLS.stone);
  } else {
    const col = CONFIG.colors[cell.color];
    face.className = 'face';
    face.style.setProperty('--c', col.c);
    face.style.setProperty('--c2', col.c2);
    face.innerHTML = svg(SYMBOLS[col.symbol]);
  }
}
function makeFace(cell) {
  const face = document.createElement('div');
  paintFace(face, cell);
  return face;
}
function createEl(cell) {
  const el = document.createElement('div');
  el.className = 'cube';
  el.appendChild(makeFace(cell));
  dom.cubes.appendChild(el);
  S.els.set(cell.id, el);
  return el;
}
// Sijainti prosentteina kuution omasta koosta -> toimii ilman uudelleenlaskentaa koon muuttuessa.
function place(el, r, c, ms = 0, ease = 'linear') {
  el.style.transition = ms ? `transform ${ms}ms ${ease}` : 'none';
  el.style.transform = `translate(${c * 100}%, ${r * 100}%)`;
}
function retrigger(el, cls) {
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
  if (cls !== 'clear') el.addEventListener('animationend', () => el.classList.remove(cls), { once: true });
}
const faceOf = cell => S.els.get(cell.id).firstElementChild;

function popup(text, cls, leftPct, topPct) {
  const d = document.createElement('div');
  d.className = 'pop ' + cls;
  d.textContent = text;
  d.style.left = leftPct + '%';
  d.style.top = topPct + '%';
  dom.fx.appendChild(d);
  d.addEventListener('animationend', () => d.remove());
}

/* =====================================================================
   Ruudukon generointi
   ===================================================================== */
function initialGrid() {
  S.grid = emptyGrid();
  const nColors = stage().colors;
  for (let r = ROWS - 1; r >= ROWS - CONFIG.startRows; r--) {
    for (let c = 0; c < COLS; c++) {
      let color;
      do { color = rand(nColors); } while (
        (c >= 2 && same(S.grid[r][c - 1], color) && same(S.grid[r][c - 2], color)) ||
        (r + 2 < ROWS && same(S.grid[r + 1][c], color) && same(S.grid[r + 2][c], color))
      );
      S.grid[r][c] = makeCell(color);
    }
  }
}

function genRiseRow() {
  const st = stage();
  const stones = new Set();
  const spr = st.stonesPerRow;
  const n = Math.min(COLS - 1, Math.floor(spr) + (Math.random() < spr % 1 ? 1 : 0));
  while (stones.size < n) stones.add(rand(COLS));

  const row = Array(COLS).fill(null);
  for (let c = 0; c < COLS; c++) {
    if (stones.has(c)) { row[c] = makeCell(-1, true); continue; }
    let color;
    do { color = rand(st.colors); } while (c >= 2 && same(row[c - 1], color) && same(row[c - 2], color));
    row[c] = makeCell(color);
  }
  return row;
}

/* =====================================================================
   Osumat
   ===================================================================== */
function findMatches() {
  const g = S.grid;
  const mark = emptyGrid().map(r => r.map(() => false));
  // vaaka
  for (let r = 0; r < ROWS; r++) {
    let c = 0;
    while (c < COLS) {
      const cell = g[r][c];
      if (!cell || cell.stone) { c++; continue; }
      let e = c + 1;
      while (e < COLS && same(g[r][e], cell.color)) e++;
      if (e - c >= 3) for (let k = c; k < e; k++) mark[r][k] = true;
      c = e;
    }
  }
  // pysty
  for (let c = 0; c < COLS; c++) {
    let r = 0;
    while (r < ROWS) {
      const cell = g[r][c];
      if (!cell || cell.stone) { r++; continue; }
      let e = r + 1;
      while (e < ROWS && same(g[e][c], cell.color)) e++;
      if (e - r >= 3) for (let k = r; k < e; k++) mark[k][c] = true;
      r = e;
    }
  }
  const out = [];
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (mark[r][c]) out.push([r, c]);
  return { list: out, mark };
}

// Yhdistää merkityt solut samanvärisiksi ryhmiksi (L- ja T-muodot = yksi ryhmä) ja palauttaa koot.
function groupSizes(list, mark) {
  const seen = new Set();
  const sizes = [];
  for (const [r0, c0] of list) {
    const k0 = r0 * COLS + c0;
    if (seen.has(k0)) continue;
    const color = S.grid[r0][c0].color;
    const stack = [[r0, c0]];
    seen.add(k0);
    let size = 0;
    while (stack.length) {
      const [r, c] = stack.pop();
      size++;
      for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nr = r + dr, nc = c + dc, k = nr * COLS + nc;
        if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS || seen.has(k) || !mark[nr][nc]) continue;
        if (!same(S.grid[nr][nc], color)) continue;
        seen.add(k);
        stack.push([nr, nc]);
      }
    }
    sizes.push(size);
  }
  return sizes;
}

/* =====================================================================
   Animoidut vaiheet
   ===================================================================== */
async function dropInto(c) {
  const target = ROWS - 1 - colHeight(c);
  const cell = S.queue.shift();
  S.queue.push(makeCell(randomColor()));
  renderQueue();

  S.grid[target][c] = cell;
  const el = createEl(cell);
  place(el, -1, c);
  void el.offsetWidth;
  const ms = CONFIG.anim.dropBase + CONFIG.anim.dropPerRow * (target + 1);
  place(el, target, c, ms, EASE_FALL);
  await sleep(ms);
  retrigger(el.firstElementChild, 'land');
}

async function applyGravity() {
  const { fallBase, fallPerRow } = CONFIG.anim;
  let maxMs = 0;
  const moved = [];
  for (let c = 0; c < COLS; c++) {
    let write = ROWS - 1;
    for (let r = ROWS - 1; r >= 0; r--) {
      const cell = S.grid[r][c];
      if (!cell) continue;
      if (r !== write) {
        S.grid[write][c] = cell;
        S.grid[r][c] = null;
        const ms = fallBase + fallPerRow * (write - r);
        place(S.els.get(cell.id), write, c, ms, EASE_FALL);
        maxMs = Math.max(maxMs, ms);
        moved.push(cell);
      }
      write--;
    }
  }
  if (maxMs) {
    await sleep(maxMs);
    moved.forEach(cell => retrigger(faceOf(cell), 'land'));
  }
}

// Käsittelee osumat ketjuna. Palauttaa ketjun pituuden (0 = ei osumia).
async function resolve() {
  const { perCube, bigGroupSize, bonusPerExtra } = CONFIG.scoring;
  let step = 0;
  while (true) {
    const { list, mark } = findMatches();
    if (!list.length) break;
    step++;

    const bonus = groupSizes(list, mark)
      .filter(s => s >= bigGroupSize)
      .reduce((sum, s) => sum + (s - 3) * bonusPerExtra, 0);
    const pts = (list.length * perCube + bonus) * step;
    S.score += pts;
    updateHud(true);

    // Poistoanimaatio
    let sr = 0, sc = 0;
    for (const [r, c] of list) {
      faceOf(S.grid[r][c]).classList.add('clear');
      sr += r; sc += c;
    }
    popup('+' + pts, 'score', ((sc / list.length + .5) / COLS) * 100, ((sr / list.length + .5) / ROWS) * 100);
    if (step >= 2) popup(`Chain ×${step}!`, 'chain', 50, 32);
    await sleep(CONFIG.anim.clear);

    for (const [r, c] of list) {
      const cell = S.grid[r][c];
      S.els.get(cell.id).remove();
      S.els.delete(cell.id);
      S.grid[r][c] = null;
    }

    // Kivet poistojen vieressä muuttuvat tavallisiksi kuutioiksi
    const cracked = new Set();
    for (const [r, c] of list) {
      for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nr = r + dr, nc = c + dc;
        if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) continue;
        const cell = S.grid[nr][nc];
        if (cell && cell.stone && !cracked.has(cell)) {
          cracked.add(cell);
          cell.stone = false;
          cell.color = randomColor();
          const face = faceOf(cell);
          paintFace(face, cell);
          retrigger(face, 'crack');
        }
      }
    }
    if (cracked.size) await sleep(CONFIG.anim.crack);

    await applyGravity();
  }
  S.longestChain = Math.max(S.longestChain, step);
  return step;
}

// Nostaa uuden rivin alhaalta. Palauttaa false, jos kasa työntyy yli reunan.
async function riseRow() {
  const overflow = S.grid[0].some(Boolean);
  const newRow = genRiseRow();
  const ms = CONFIG.anim.rise;

  const fresh = newRow.map((cell, c) => { const el = createEl(cell); place(el, ROWS, c); return el; });
  void dom.cubes.offsetWidth;

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const cell = S.grid[r][c];
      if (cell) place(S.els.get(cell.id), r - 1, c, ms, EASE_RISE);
    }
  }
  fresh.forEach((el, c) => place(el, ROWS - 1, c, ms, EASE_RISE));
  await sleep(ms);

  if (overflow) return false;
  S.grid.shift();
  S.grid.push(newRow);
  return true;
}

/* =====================================================================
   Siirto
   ===================================================================== */
async function onColumn(c) {
  if (S.over || S.busy || c < 0 || c >= COLS) return;
  pressFeedback(c);

  if (colHeight(c) >= ROWS) {
    retrigger(dom.columns.children[c], 'full');
    for (let r = 0; r < ROWS; r++) if (S.grid[r][c]) retrigger(faceOf(S.grid[r][c]), 'shake');
    return;
  }

  S.busy = true;
  await dropInto(c);
  await resolve();

  const prevStage = stageIndexFor(S.moves + 1);
  S.moves++;
  S.rowIn--;
  updateHud();

  if (S.rowIn <= 0) {
    const ok = await riseRow();
    if (!ok) return gameOver('stack rose over the top');
    await resolve();
    S.rowIn = stage().rowEvery;
  }

  const newStage = stageIndexFor(S.moves + 1);
  if (newStage !== prevStage) onStageChange(newStage);

  if (S.grid[0].every(Boolean)) return gameOver('all columns full');

  updateHud();
  renderQueue();
  S.busy = false;
}

function onStageChange(idx) {
  S.stageIdx = idx;
  // Uuden vaiheen rivitahti tulee voimaan heti, jos se on tiukempi kuin jäljellä oleva laskuri
  S.rowIn = Math.min(S.rowIn, CONFIG.stages[idx].rowEvery);
  const label = CONFIG.stages[idx].label;
  if (label) popup(label, 'stage', 50, 45);
}

function pressFeedback(c) {
  const col = dom.columns.children[c];
  col.classList.add('press');
  setTimeout(() => col.classList.remove('press'), 110);
}

/* =====================================================================
   HUD ja jono
   ===================================================================== */
let lastScoreShown = 0;
function updateHud(bumpScore = false) {
  dom.score.textContent = S.score;
  if (bumpScore && S.score !== lastScoreShown) retrigger(dom.score, 'bump');
  lastScoreShown = S.score;
  dom.moves.textContent = S.moves;
  dom.rowIn.textContent = S.rowIn;
  dom.rowStat.classList.toggle('now', S.rowIn === 1);
  dom.rowStat.classList.toggle('soon', S.rowIn === 2);

  let maxH = 0;
  for (let c = 0; c < COLS; c++) maxH = Math.max(maxH, colHeight(c));
  dom.board.classList.toggle('danger', maxH >= ROWS - 2);

  if (DEBUG) updateDebug();
}

function renderQueue() {
  const show = stage().preview;
  dom.qCurrent.replaceChildren(makeFace(S.queue[0]));
  dom.qNextSlot.classList.toggle('hidden', show < 2);
  if (show >= 2) dom.qNext.replaceChildren(makeFace(S.queue[1]));
}

/* =====================================================================
   Pelin kulku
   ===================================================================== */
function newGame() {
  S.els.forEach(el => el.remove());
  S.els.clear();
  dom.fx.replaceChildren();
  dom.board.classList.remove('over', 'danger');

  Object.assign(S, { nextId: 1, score: 0, moves: 0, longestChain: 0, busy: false, over: false });
  S.stageIdx = stageIndexFor(1);
  S.rowIn = stage().rowEvery;
  initialGrid();
  S.queue = [makeCell(randomColor()), makeCell(randomColor())];

  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const cell = S.grid[r][c];
    if (cell) place(createEl(cell), r, c);
  }
  updateHud();
  renderQueue();
  S.startTime = performance.now();
}

function gameOver(reason) {
  S.over = true;
  S.busy = false;
  dom.board.classList.add('over');

  const isBest = S.score > bestScore;
  if (isBest) { bestScore = S.score; saveBest(bestScore); }

  const stats = {
    duration_s: Math.round((performance.now() - S.startTime) / 1000),
    moves: S.moves,
    score: S.score,
    longest_chain: S.longestChain,
    reason: reason,
  };
  console.log('[Drop] Game over', stats);
  console.table(stats);

  setTimeout(() => {
    dom.endScore.textContent = S.score;
    dom.endMoves.textContent = S.moves;
    dom.endBest.textContent = bestScore;
    dom.newBest.classList.toggle('hidden', !isBest);
    dom.end.classList.remove('hidden');
  }, CONFIG.anim.gameOverDelay);
}

/* =====================================================================
   Asettelu
   ===================================================================== */
function fit() {
  const wrap = dom.boardWrap;
  const w = wrap.clientWidth;
  const h = wrap.clientHeight;
  const cell = Math.max(16, Math.floor(Math.min(w / COLS, h / ROWS)));
  const root = document.documentElement.style;
  root.setProperty('--cell', cell + 'px');
  root.setProperty('--cols', COLS);
  root.setProperty('--rows', ROWS);
}

/* =====================================================================
   Debug (?debug=1)
   ===================================================================== */
function setupDebug() {
  dom.debug.classList.remove('hidden');
  dom.debug.innerHTML = `
    <div id="dbgInfo"></div>
    <div class="row">
      <input id="dbgMove" type="number" min="0" step="1" value="100">
      <button id="dbgJump">Jump to move</button>
    </div>
    <div class="row"><button id="dbgRise">Raise row</button><button id="dbgEnd">End game</button></div>`;
  dom.debug.addEventListener('pointerdown', e => e.stopPropagation());
  // Napauta tietoriviä pienentääksesi paneelin, ettei se peitä alimpia rivejä
  $('dbgInfo').addEventListener('click', () => dom.debug.classList.toggle('min'));

  $('dbgJump').addEventListener('click', () => {
    if (S.over || S.busy) return;
    const target = Math.max(0, parseInt($('dbgMove').value, 10) || 0);
    S.moves = target;
    S.stageIdx = stageIndexFor(S.moves + 1);
    S.rowIn = stage().rowEvery;
    S.queue = [makeCell(randomColor()), makeCell(randomColor())];
    renderQueue();
    updateHud();
  });
  $('dbgRise').addEventListener('click', async () => {
    if (S.over || S.busy) return;
    S.busy = true;
    if (!(await riseRow())) return gameOver('debug: row raise');
    await resolve();
    updateHud();
    S.busy = false;
  });
  $('dbgEnd').addEventListener('click', () => { if (!S.over && !S.busy) gameOver('debug: end'); });
}

function updateDebug() {
  const idx = stageIndexFor(S.moves + 1);
  const st = CONFIG.stages[idx];
  const info = $('dbgInfo');
  if (!info) return;
  info.innerHTML =
    `stage ${idx + 1}/${CONFIG.stages.length} (from move ${st.fromMove})<br>` +
    `N=${st.rowEvery} · colors ${st.colors} · stones/row ${st.stonesPerRow} · preview ${st.preview}<br>` +
    `row in ${S.rowIn} moves · longest chain ${S.longestChain}`;
}

/* =====================================================================
   Syötteet
   ===================================================================== */
dom.board.addEventListener('pointerdown', e => {
  e.preventDefault();
  const rect = dom.board.getBoundingClientRect();
  onColumn(Math.floor(((e.clientX - rect.left) / rect.width) * COLS));
});

document.addEventListener('keydown', e => {
  const n = parseInt(e.key, 10);
  if (n >= 1 && n <= COLS) onColumn(n - 1);
  if (e.key === 'Enter') {
    if (!dom.start.classList.contains('hidden')) $('playBtn').click();
    else if (!dom.end.classList.contains('hidden')) $('againBtn').click();
  }
});

// Estä zoomaus, pull-to-refresh ja kontekstivalikko
document.addEventListener('touchmove', e => { if (!e.target.closest('#debug')) e.preventDefault(); }, { passive: false });
document.addEventListener('gesturestart', e => e.preventDefault());
document.addEventListener('dblclick', e => e.preventDefault());
document.addEventListener('contextmenu', e => e.preventDefault());

$('playBtn').addEventListener('click', () => { dom.start.classList.add('hidden'); newGame(); });
$('againBtn').addEventListener('click', () => { dom.end.classList.add('hidden'); newGame(); });

window.addEventListener('resize', fit);
window.addEventListener('orientationchange', fit);

/* =====================================================================
   Käynnistys
   ===================================================================== */
for (let c = 0; c < COLS; c++) {
  const col = document.createElement('div');
  col.className = 'col';
  dom.columns.appendChild(col);
}
$('logo').replaceChildren(...CONFIG.colors.slice(0, 4).map((_, i) => makeFace({ color: i, stone: false })));
dom.startBest.textContent = bestScore;
fit();
if (DEBUG) setupDebug();

// Pelilauta näkyy taustalla aloitusruudun alla
newGame();
S.over = true;
})();
