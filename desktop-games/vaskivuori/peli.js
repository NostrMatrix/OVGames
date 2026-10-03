/* Vaskivuori – pelilogiikka. Ei DOM-riippuvuuksia: index.html hoitaa piirtämisen. */
(function (root) {
  'use strict';

  // Kartta jaetaan 4×3 ruudukkoon; kussakin solussa on yksi huone tai käytävän risteys.
  const W = 76, H = 27;
  const GRID_COLS = 4, GRID_ROWS = 3, CW = 19, CH = 9;
  const MAX_DEPTH = 10;
  const PACK_SIZE = 9;

  const ROCK = 0, FLOOR = 1, CORR = 2, WALL_H = 3, WALL_V = 4, DOOR = 5, STAIRS = 6, SPRING = 7, DRY = 8;
  const PASSABLE = [false, true, true, false, false, true, true, true, true];
  const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];

  const FLOOR_NAMES = [
    'Mouth of the Stone Hill', 'Rock Vaults', 'Gnome Mines', 'Alleys of Hiisi', 'Halls of Kalma',
    'Copper Veins', 'Troll Halls', 'Borderland of Tuoni', 'The Ninth Lock', "Louhi's Chamber",
  ];

  const XP_TABLE = [0, 12, 35, 75, 135, 220, 340, 500, 720, 1000, 1400, 1900, 2600, 3500];

  const CLASSES = [
    {
      id: 'urho', name: 'Hero', hp: 32, voima: 6, hpPerLevel: 7, voimaEvery: 1,
      weapon: 'kirves', armor: 'nahkaroijy', items: [['rieska', 2], ['mesivoide', 1]],
      desc: 'A sturdy fighter who can take heavy blows.',
      abilityName: 'Rage', abilityDesc: 'For six turns your blows deal double damage.',
    },
    {
      id: 'tietaja', name: 'Sage', hp: 20, voima: 3, mana: 12, hpPerLevel: 4, voimaEvery: 2, manaPerLevel: 3,
      weapon: 'sauva', armor: 'villaviitta', items: [['mahla', 2], ['tulituohi', 1]],
      desc: 'Frail of body, but casts fire from afar.',
      abilityName: "Ukko's Fire", abilityDesc: 'Lightning strikes the nearest visible enemy. Costs 3 mana.',
    },
    {
      id: 'eramies', name: 'Woodsman', hp: 28, voima: 4, arrows: 24, hpPerLevel: 6, voimaEvery: 2, dodge: 15,
      weapon: 'puukko', armor: 'nahkaroijy', items: [['rieska', 1], ['siirtotuohi', 1]],
      desc: 'A nimble wanderer of the woods. Dodges blows and sees farther in corridors.',
      abilityName: 'Shoot', abilityDesc: 'Fires an arrow at the nearest visible enemy. Half of the arrows can be recovered.',
    },
  ];

  // w = yleisyys satunnaisissa löydöissä, depth = ensimmäinen kerros, jolla esine voi löytyä.
  const ITEMS = {
    puukko:      { name: 'Knife', kind: 'weapon', ch: ')', min: 1, max: 4, depth: 1, w: 0 },
    sauva:       { name: "Sage's Staff", kind: 'weapon', ch: ')', min: 1, max: 3, spell: 2, depth: 1, w: 0 },
    kirves:      { name: 'Axe', kind: 'weapon', ch: ')', min: 2, max: 6, depth: 1, w: 3 },
    keihas:      { name: 'Spear', kind: 'weapon', ch: ')', min: 2, max: 8, depth: 2, w: 4 },
    miekka:      { name: 'Sword', kind: 'weapon', ch: ')', min: 3, max: 9, depth: 4, w: 4 },
    taikasauva:  { name: 'Magic Staff', kind: 'weapon', ch: ')', min: 2, max: 5, spell: 5, depth: 4, w: 3 },
    sotakirves:  { name: 'Battle Axe', kind: 'weapon', ch: ')', min: 4, max: 11, depth: 6, w: 3 },
    tulimiekka:  { name: 'Fire Sword', kind: 'weapon', ch: ')', min: 5, max: 14, depth: 8, w: 3 },
    villaviitta: { name: 'Wool Cloak', kind: 'armor', ch: '[', def: 1, depth: 1, w: 0 },
    nahkaroijy:  { name: 'Leather Jerkin', kind: 'armor', ch: '[', def: 2, depth: 1, w: 3 },
    karhuntalja: { name: 'Bearskin', kind: 'armor', ch: '[', def: 3, depth: 2, w: 4 },
    rengaspaita: { name: 'Ring Mail', kind: 'armor', ch: '[', def: 4, depth: 4, w: 4 },
    vaskipaita:  { name: 'Copper Mail', kind: 'armor', ch: '[', def: 5, depth: 6, w: 3 },
    ilmarisen:   { name: "Ilmarinen's Armor", kind: 'armor', ch: '[', def: 7, depth: 8, w: 3 },
    rieska:      { name: 'Flatbread', kind: 'food', ch: '%', heal: 6, depth: 1, w: 10, stack: true },
    kalakukko:   { name: 'Fish Pie', kind: 'food', ch: '%', heal: 14, depth: 3, w: 7, stack: true },
    mesivoide:   { name: 'Honey Salve', kind: 'potion', ch: '!', heal: 30, depth: 2, w: 5, stack: true },
    mahla:       { name: 'Birch Sap', kind: 'potion', ch: '!', mana: 8, depth: 1, w: 6, stack: true },
    vakijuoma:   { name: 'Strength Potion', kind: 'potion', ch: '!', depth: 3, w: 2, stack: true },
    tulituohi:   { name: 'Fire Scroll', kind: 'scroll', ch: '?', depth: 2, w: 4, stack: true },
    nakotuohi:   { name: 'Sight Scroll', kind: 'scroll', ch: '?', depth: 1, w: 3, stack: true },
    siirtotuohi: { name: 'Warp Scroll', kind: 'scroll', ch: '?', depth: 1, w: 3, stack: true },
    suojatuohi:  { name: 'Shield Scroll', kind: 'scroll', ch: '?', depth: 2, w: 3, stack: true },
    nuolet:      { name: 'Arrows', kind: 'arrows', ch: '(' },
    hopea:       { name: 'Silver', kind: 'silver', ch: '$' },
    sampo:       { name: 'Sampo', kind: 'sampo', ch: '&' },
  };

  // lvl vaikuttaa osumatarkkuuteen, speed 10 = sama tahti kuin pelaajalla.
  const MONSTERS = {
    ampiainen:   { name: 'Wasp', ch: 'a', color: '#e8d44d', hp: 3, min: 1, max: 2, def: 0, lvl: 1, xp: 1, speed: 15, erratic: 0.5, depth: [1, 3], w: 5, verb: 'stings', death: 'drops' },
    susi:        { name: 'Wolf', ch: 's', color: '#aab3bd', hp: 8, min: 1, max: 4, def: 1, lvl: 1, xp: 3, speed: 12, depth: [1, 4], w: 8, verb: 'bites' },
    maahinen:    { name: 'Gnome', ch: 'm', color: '#c0915c', hp: 11, min: 2, max: 5, def: 1, lvl: 2, xp: 5, speed: 10, depth: [2, 5], w: 8, verb: 'hits' },
    liekkio:     { name: 'Will-o-wisp', ch: 'l', color: '#ff8c3a', hp: 7, min: 3, max: 6, def: 0, lvl: 2, xp: 5, speed: 13, erratic: 0.4, depth: [2, 6], w: 5, verb: 'burns', death: 'goes out' },
    kyopeli:     { name: 'Ghost', ch: 'k', color: '#d4e4ff', hp: 18, min: 3, max: 8, def: 2, lvl: 4, xp: 8, speed: 10, depth: [3, 7], w: 6, verb: 'claws at', death: 'vanishes' },
    hiisi:       { name: 'Hiisi', ch: 'h', color: '#72c25c', hp: 23, min: 4, max: 9, def: 2, lvl: 5, xp: 11, speed: 10, depth: [3, 8], w: 8, verb: 'strikes' },
    kratti:      { name: 'Kratti', ch: 'K', color: '#e6c15a', hp: 19, min: 3, max: 7, def: 2, lvl: 5, xp: 8, speed: 10, depth: [4, 8], w: 3, verb: 'scratches', death: 'falls apart', silver: true },
    nakki:       { name: 'Nix', ch: 'n', color: '#4fa8e0', hp: 28, min: 5, max: 10, def: 3, lvl: 6, xp: 14, speed: 10, depth: [5, 9], w: 6, verb: 'strangles', death: 'sinks away' },
    painajainen: { name: 'Nightmare', ch: 'P', color: '#b884e0', hp: 23, min: 5, max: 9, def: 2, lvl: 6, xp: 13, speed: 14, depth: [5, 9], w: 4, verb: 'presses down on', death: 'fades away' },
    peikko:      { name: 'Troll', ch: 'p', color: '#9bb86f', hp: 43, min: 6, max: 12, def: 3, lvl: 7, xp: 20, speed: 8, depth: [6, 10], w: 6, verb: 'smashes' },
    otso:        { name: 'Otso', ch: 'O', color: '#a8743f', hp: 50, min: 7, max: 13, def: 4, lvl: 8, xp: 26, speed: 10, depth: [7, 10], w: 5, verb: 'mauls' },
    tuonenkoira: { name: 'Hound of Tuoni', ch: 'T', color: '#e0564f', hp: 38, min: 7, max: 13, def: 3, lvl: 9, xp: 28, speed: 14, depth: [8, 10], w: 5, verb: 'tears at' },
    surma:       { name: 'Surma', ch: 'S', color: '#ff3b6b', hp: 63, min: 8, max: 15, def: 5, lvl: 10, xp: 45, speed: 10, depth: [9, 10], w: 3, verb: 'rends' },
    louhi:       { name: 'Louhi', ch: 'L', color: '#8fe3ff', hp: 150, min: 10, max: 17, def: 6, lvl: 11, xp: 150, speed: 10, depth: [99, 99], w: 0, verb: 'hits', death: 'falls', boss: true,
                   ranged: { chance: 0.4, min: 6, max: 12, text: 'Louhi casts icy frost' } },
  };

  // --- apurit ---------------------------------------------------------------

  function makeRng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const idx = (x, y) => y * W + x;
  const inb = (x, y) => x >= 0 && y >= 0 && x < W && y < H;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const ri = (g, a, b) => a + Math.floor(g.rng() * (b - a + 1));
  const chance = (g, p) => g.rng() < p;
  const pick = (g, arr) => arr[Math.floor(g.rng() * arr.length)];

  function weighted(g, entries) {
    let total = 0;
    for (const e of entries) total += e[1];
    let r = g.rng() * total;
    for (const e of entries) if ((r -= e[1]) < 0) return e[0];
    return entries[entries.length - 1][0];
  }

  function shuffled(g, arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(g.rng() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function say(g, text, kind) {
    g.log.push({ text, kind: kind || '', turn: g.turn });
    if (g.log.length > 200) g.log.shift();
  }

  const classOf = p => CLASSES.find(c => c.id === p.cls);
  const monsterAt = (g, x, y) => g.monsters.find(m => m.x === x && m.y === y);

  // --- hahmon laskennalliset arvot -----------------------------------------

  const armorDef = p => ITEMS[p.armor.id].def + (p.shield > 0 ? 4 : 0);
  const dodge = p => classOf(p).dodge || 0;
  const dmgBonus = p => Math.floor(p.voima / 2);

  function dmgRange(p) {
    const w = ITEMS[p.weapon.id], b = dmgBonus(p);
    return [w.min + b, w.max + b];
  }

  function abilityInfo(g) {
    const p = g.player, c = classOf(p);
    if (p.cls === 'urho') {
      if (p.raivo > 0) return { name: c.abilityName, ready: false, text: `active, ${p.raivo} turns` };
      if (p.raivoCd > 0) return { name: c.abilityName, ready: false, text: `recharging, ${p.raivoCd} turns` };
      return { name: c.abilityName, ready: true, text: 'ready' };
    }
    if (p.cls === 'tietaja') {
      const [lo, hi] = spellRange(p);
      return { name: c.abilityName, ready: p.mana >= 3, text: `3 mana, damage ${lo}–${hi}` };
    }
    const [lo, hi] = bowRange(p);
    return { name: c.abilityName, ready: p.arrows > 0, text: `1 arrow, damage ${lo}–${hi}` };
  }

  function spellRange(p) {
    const s = (ITEMS[p.weapon.id].spell || 0) + p.level;
    return [3 + s, 7 + s];
  }
  const bowRange = p => [4 + p.level, 8 + p.level];

  function itemLabel(it) {
    return ITEMS[it.id].name + (it.n > 1 ? ` ×${it.n}` : '');
  }

  function itemInfo(it, p) {
    const d = ITEMS[it.id];
    switch (d.kind) {
      case 'weapon': return `damage ${d.min}–${d.max}` + (d.spell && p && p.cls === 'tietaja' ? `, spell +${d.spell}` : '');
      case 'armor': return `armor ${d.def}`;
      case 'food': return `+${d.heal} HP`;
      case 'potion':
        if (it.id === 'mesivoide') return `+${d.heal} HP`;
        if (it.id === 'mahla') return p && p.cls === 'tietaja' ? `+${d.mana} mana` : `+${d.mana} HP`;
        return 'strength +1, max HP +3';
      case 'scroll':
        return {
          tulituohi: 'fire on all visible enemies',
          nakotuohi: 'reveals the map',
          siirtotuohi: 'teleports you elsewhere',
          suojatuohi: 'armor +4, 20 turns',
        }[it.id];
      default: return '';
    }
  }

  // 1 = parempi kuin nykyinen varuste, -1 = huonompi, 0 = sama tai ei vertailtavissa.
  function compareItem(it, p) {
    const d = ITEMS[it.id];
    if (d.kind === 'weapon') {
      const val = w => (w.min + w.max) / 2 + (p.cls === 'tietaja' ? (w.spell || 0) * 3 : 0);
      return Math.sign(val(d) - val(ITEMS[p.weapon.id]));
    }
    if (d.kind === 'armor') return Math.sign(d.def - ITEMS[p.armor.id].def);
    return 0;
  }

  function score(g) {
    const p = g.player;
    return p.silver + p.xp + 100 * g.maxDepth + (g.won ? 2000 : 0);
  }

  // --- kentän luonti --------------------------------------------------------

  function carveRoom(map, r) {
    for (let y = r.y1; y <= r.y2; y++) {
      for (let x = r.x1; x <= r.x2; x++) {
        let t = FLOOR;
        if (y === r.y1 || y === r.y2) t = WALL_H;
        else if (x === r.x1 || x === r.x2) t = WALL_V;
        map[idx(x, y)] = t;
      }
    }
  }

  function carve(map, x, y) {
    if (map[idx(x, y)] === ROCK) map[idx(x, y)] = CORR;
  }

  function carveH(map, x1, x2, y) {
    for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x++) carve(map, x, y);
  }

  function carveV(map, x, y1, y2) {
    for (let y = Math.min(y1, y2); y <= Math.max(y1, y2); y++) carve(map, x, y);
  }

  // a on b:n vasemmalla puolella. Käytävä kulkee solujen välisessä raossa, joten se ei osu muihin huoneisiin.
  function connectH(g, a, b) {
    const map = g.map;
    const ay = a.gone ? a.y1 : ri(g, a.y1 + 1, a.y2 - 1);
    const by = b.gone ? b.y1 : ri(g, b.y1 + 1, b.y2 - 1);
    const ax = a.gone ? a.x1 : a.x2 + 1;
    const bx = b.gone ? b.x1 : b.x1 - 1;
    if (!a.gone) map[idx(a.x2, ay)] = DOOR;
    if (!b.gone) map[idx(b.x1, by)] = DOOR;
    const mx = ri(g, ax, bx);
    carveH(map, ax, mx, ay);
    carveV(map, mx, ay, by);
    carveH(map, mx, bx, by);
  }

  // a on b:n yläpuolella.
  function connectV(g, a, b) {
    const map = g.map;
    const ax = a.gone ? a.x1 : ri(g, a.x1 + 1, a.x2 - 1);
    const bx = b.gone ? b.x1 : ri(g, b.x1 + 1, b.x2 - 1);
    const ay = a.gone ? a.y1 : a.y2 + 1;
    const by = b.gone ? b.y1 : b.y1 - 1;
    if (!a.gone) map[idx(ax, a.y2)] = DOOR;
    if (!b.gone) map[idx(bx, b.y1)] = DOOR;
    const my = ri(g, ay, by);
    carveV(map, ax, ay, my);
    carveH(map, ax, bx, my);
    carveV(map, bx, my, by);
  }

  function cellNeighbors(i) {
    const c = i % GRID_COLS, r = Math.floor(i / GRID_COLS), out = [];
    if (c > 0) out.push(i - 1);
    if (c < GRID_COLS - 1) out.push(i + 1);
    if (r > 0) out.push(i - GRID_COLS);
    if (r < GRID_ROWS - 1) out.push(i + GRID_COLS);
    return out;
  }

  function freeTile(g, room) {
    for (let tries = 0; tries < 60; tries++) {
      const x = ri(g, room.x1 + 1, room.x2 - 1), y = ri(g, room.y1 + 1, room.y2 - 1);
      const i = idx(x, y);
      if (g.map[i] !== FLOOR || g.items.has(i) || monsterAt(g, x, y)) continue;
      if (g.player.x === x && g.player.y === y) continue;
      return { x, y };
    }
    return null;
  }

  function randomItemId(g) {
    const entries = [];
    for (const id in ITEMS) {
      const d = ITEMS[id];
      if (!d.w) continue;
      if (d.depth > g.depth + 1) continue;
      let w = d.w;
      if (d.depth === g.depth + 1) w /= 3;
      if ((d.kind === 'weapon' || d.kind === 'armor') && g.depth - d.depth > 4) w /= 3;
      if (id === 'taikasauva' && g.player.cls !== 'tietaja') w /= 3;
      if (id === 'mahla' && g.player.cls !== 'tietaja') w /= 2;
      entries.push([id, w]);
    }
    return weighted(g, entries);
  }

  function placeItem(g, room, it) {
    const t = freeTile(g, room);
    if (t) g.items.set(idx(t.x, t.y), it);
  }

  function randomMonsterId(g) {
    const d = g.depth < MAX_DEPTH && chance(g, 0.1) ? g.depth + 1 : g.depth;
    const entries = [];
    for (const id in MONSTERS) {
      const m = MONSTERS[id];
      if (m.w && d >= m.depth[0] && d <= m.depth[1]) entries.push([id, m.w]);
    }
    return weighted(g, entries);
  }

  function spawnMonster(g, id, x, y, asleep) {
    const d = MONSTERS[id];
    const m = { id, x, y, hp: d.hp, maxHp: d.hp, energy: 0, asleep, lastSeen: -999 };
    g.monsters.push(m);
    return m;
  }

  function generate(g) {
    const map = g.map;
    map.fill(ROCK);
    g.seen.fill(0);
    g.items = new Map();
    g.monsters = [];

    const boss = g.depth === MAX_DEPTH;
    const goneCount = boss ? 0 : ri(g, 0, 3);
    const gone = new Set();
    while (gone.size < goneCount) gone.add(ri(g, 0, GRID_COLS * GRID_ROWS - 1));

    const cells = [];
    for (let r = 0; r < GRID_ROWS; r++) {
      for (let c = 0; c < GRID_COLS; c++) {
        const cx = c * CW, cy = r * CH;
        let room;
        if (gone.has(cells.length)) {
          const px = ri(g, cx + 2, cx + CW - 3), py = ri(g, cy + 2, cy + CH - 3);
          room = { x1: px, y1: py, x2: px, y2: py, gone: true };
          map[idx(px, py)] = CORR;
        } else {
          const tw = ri(g, 6, CW - 2), th = ri(g, 4, CH - 2);
          const x1 = ri(g, cx + 1, cx + CW - 1 - tw), y1 = ri(g, cy + 1, cy + CH - 1 - th);
          room = { x1, y1, x2: x1 + tw - 1, y2: y1 + th - 1, gone: false };
        }
        cells.push(room);
      }
    }

    // Satunnainen virittävä puu takaa, että kaikki huoneet ovat saavutettavissa; lisäkäytävät tekevät silmukoita.
    const n = cells.length;
    const edges = new Set();
    const key = (a, b) => (a < b ? a + ':' + b : b + ':' + a);
    const inTree = new Set([ri(g, 0, n - 1)]);
    while (inTree.size < n) {
      const frontier = [];
      for (const a of inTree) for (const b of cellNeighbors(a)) if (!inTree.has(b)) frontier.push([a, b]);
      const [a, b] = pick(g, frontier);
      edges.add(key(a, b));
      inTree.add(b);
    }
    const extra = ri(g, 1, 3);
    for (let k = 0; k < extra; k++) {
      const a = ri(g, 0, n - 1);
      edges.add(key(a, pick(g, cellNeighbors(a))));
    }

    let bossRoomIndex = -1;
    if (boss) {
      // Louhen sali on keskirivillä ja täysikokoinen.
      bossRoomIndex = GRID_COLS + (chance(g, 0.5) ? 1 : 2);
      const c = bossRoomIndex % GRID_COLS, cx = c * CW, cy = CH;
      cells[bossRoomIndex] = { x1: cx + 1, y1: cy + 1, x2: cx + CW - 2, y2: cy + CH - 2, gone: false };
    }
    for (const room of cells) if (!room.gone) carveRoom(map, room);

    for (const e of edges) {
      const [a, b] = e.split(':').map(Number);
      if (b - a === 1) connectH(g, cells[a], cells[b]);
      else connectV(g, cells[a], cells[b]);
    }

    g.rooms = cells.filter(r => !r.gone);
    const bossRoom = boss ? cells[bossRoomIndex] : null;

    // Pelaaja aloittaa satunnaisesta huoneesta, portaat ovat kaukana.
    const startCandidates = g.rooms.filter(r => r !== bossRoom);
    let start = pick(g, startCandidates);
    if (boss) {
      // Aloitetaan Louhen salista kauimmasta huoneesta.
      const far = startCandidates.slice().sort((a, b) =>
        Math.abs(b.x1 - bossRoom.x1) + Math.abs(b.y1 - bossRoom.y1) - Math.abs(a.x1 - bossRoom.x1) - Math.abs(a.y1 - bossRoom.y1));
      start = pick(g, far.slice(0, 3));
    }
    const p = g.player;
    p.x = -1; p.y = -1;
    const st = freeTile(g, start);
    p.x = st.x; p.y = st.y;
    computeDist(g);

    const roomDist = r => g.dist[idx(Math.floor((r.x1 + r.x2) / 2), r.y1 + 1)];
    const others = g.rooms.filter(r => r !== start && r !== bossRoom);
    others.sort((a, b) => roomDist(b) - roomDist(a));

    if (!boss) {
      const stairsRoom = pick(g, others.slice(0, Math.max(1, Math.ceil(others.length / 2))));
      const t = freeTile(g, stairsRoom);
      map[idx(t.x, t.y)] = STAIRS;
    }

    if (others.length && chance(g, 0.45)) {
      const t = freeTile(g, pick(g, others));
      if (t) map[idx(t.x, t.y)] = SPRING;
    }

    // Esineet. Jokaisesta kerroksesta löytyy parannusesine, syvemmältä kaksi.
    const nHeals = g.depth >= 5 ? 2 : 1;
    for (let k = 0; k < nHeals; k++) {
      const id = weighted(g, [['rieska', 5], ['kalakukko', g.depth >= 3 ? 4 : 0], ['mesivoide', g.depth >= 2 ? 3 : 0]]);
      placeItem(g, pick(g, g.rooms), { id, n: 1 });
    }
    const nItems = ri(g, 3, 5);
    for (let k = 0; k < nItems; k++) placeItem(g, pick(g, g.rooms), { id: randomItemId(g), n: 1 });
    const nSilver = ri(g, 2, 4);
    for (let k = 0; k < nSilver; k++) placeItem(g, pick(g, g.rooms), { id: 'hopea', n: ri(g, 3, 8) * (g.depth + 1) });
    if (p.cls === 'eramies') {
      const nArrows = ri(g, 1, 2);
      for (let k = 0; k < nArrows; k++) placeItem(g, pick(g, g.rooms), { id: 'nuolet', n: ri(g, 4, 8) });
    }

    // Hirviöt eivät aloita pelaajan huoneesta.
    const monsterRooms = g.rooms.filter(r => r !== start);
    const nMon = boss ? 5 : 3 + g.depth + ri(g, 0, 2);
    for (let k = 0; k < nMon; k++) {
      const room = pick(g, monsterRooms);
      const t = freeTile(g, room);
      if (t) spawnMonster(g, randomMonsterId(g), t.x, t.y, chance(g, 0.5));
    }
    if (boss) {
      const cx = Math.floor((bossRoom.x1 + bossRoom.x2) / 2), cy = Math.floor((bossRoom.y1 + bossRoom.y2) / 2);
      const old = monsterAt(g, cx, cy);
      if (old) g.monsters.splice(g.monsters.indexOf(old), 1);
      spawnMonster(g, 'louhi', cx, cy, true);
      for (let k = 0; k < 2; k++) {
        const t = freeTile(g, bossRoom);
        if (t) spawnMonster(g, randomMonsterId(g), t.x, t.y, true);
      }
    }
  }

  // --- näkyvyys ja etäisyydet -----------------------------------------------

  const transparent = t => PASSABLE[t];

  function lineOfSight(g, x0, y0, x1, y1) {
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy, x = x0, y = y0;
    for (;;) {
      if (x === x1 && y === y1) return true;
      if ((x !== x0 || y !== y0) && !transparent(g.map[idx(x, y)])) return false;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x += sx; }
      if (e2 <= dx) { err += dx; y += sy; }
    }
  }

  // Huoneet ovat valaistuja: huoneessa tai sen ovella näkee koko huoneen. Käytävissä näkee vain lähelle.
  function updateVision(g) {
    const p = g.player, vis = g.vis;
    vis.fill(0);
    for (const r of g.rooms) {
      if (p.x < r.x1 || p.x > r.x2 || p.y < r.y1 || p.y > r.y2) continue;
      for (let y = r.y1; y <= r.y2; y++) for (let x = r.x1; x <= r.x2; x++) vis[idx(x, y)] = 1;
    }
    const rad = p.cls === 'eramies' ? 2 : 1;
    for (let dy = -rad; dy <= rad; dy++) {
      for (let dx = -rad; dx <= rad; dx++) {
        const x = p.x + dx, y = p.y + dy;
        if (inb(x, y) && lineOfSight(g, p.x, p.y, x, y)) vis[idx(x, y)] = 1;
      }
    }
    for (let i = 0; i < vis.length; i++) if (vis[i]) g.seen[i] = 1;
  }

  function computeDist(g) {
    const dist = g.dist, p = g.player;
    dist.fill(-1);
    const queue = new Int32Array(W * H);
    let head = 0, tail = 0;
    dist[idx(p.x, p.y)] = 0;
    queue[tail++] = idx(p.x, p.y);
    while (head < tail) {
      const i = queue[head++], x = i % W, y = (i - x) / W;
      for (const [dx, dy] of DIRS) {
        const nx = x + dx, ny = y + dy;
        if (!inb(nx, ny)) continue;
        const j = idx(nx, ny);
        if (dist[j] !== -1 || !PASSABLE[g.map[j]]) continue;
        dist[j] = dist[i] + 1;
        queue[tail++] = j;
      }
    }
  }

  // Lyhin reitti tunnettuja ruutuja pitkin. Palauttaa askeleet [dx, dy] tai null.
  function pathTo(g, tx, ty) {
    const p = g.player;
    if (!inb(tx, ty) || !g.seen[idx(tx, ty)] || !PASSABLE[g.map[idx(tx, ty)]]) return null;
    const prev = new Int32Array(W * H).fill(-1);
    const start = idx(p.x, p.y), goal = idx(tx, ty);
    const queue = [start];
    prev[start] = start;
    for (let h = 0; h < queue.length; h++) {
      const i = queue[h];
      if (i === goal) break;
      const x = i % W, y = (i - x) / W;
      for (const [dx, dy] of DIRS) {
        const nx = x + dx, ny = y + dy;
        if (!inb(nx, ny)) continue;
        const j = idx(nx, ny);
        if (prev[j] !== -1 || !g.seen[j] || !PASSABLE[g.map[j]]) continue;
        prev[j] = i;
        queue.push(j);
      }
    }
    if (prev[goal] === -1) return null;
    const steps = [];
    for (let i = goal; i !== start; i = prev[i]) {
      const j = prev[i];
      steps.push([(i % W) - (j % W), Math.floor(i / W) - Math.floor(j / W)]);
    }
    return steps.reverse();
  }

  function visibleMonsters(g) {
    const p = g.player;
    return g.monsters
      .filter(m => g.vis[idx(m.x, m.y)])
      .map(m => ({ m, d: Math.hypot(m.x - p.x, m.y - p.y) }))
      .sort((a, b) => a.d - b.d)
      .map(e => e.m);
  }

  const nearestTarget = g => visibleMonsters(g)[0] || null;

  // --- pelaajan toiminnot ---------------------------------------------------

  function addToPack(g, it) {
    const pack = g.player.pack;
    if (ITEMS[it.id].stack) {
      const same = pack.findIndex(s => s && s.id === it.id);
      if (same >= 0) { pack[same].n += it.n; return same; }
    }
    const free = pack.indexOf(null);
    if (free < 0) return -1;
    pack[free] = { id: it.id, n: it.n };
    return free;
  }

  function consume(p, slot) {
    if (--p.pack[slot].n <= 0) p.pack[slot] = null;
  }

  function heal(p, amount) {
    const before = p.hp;
    p.hp = Math.min(p.maxHp, p.hp + amount);
    return p.hp - before;
  }

  function pickup(g) {
    const p = g.player, k = idx(p.x, p.y), it = g.items.get(k);
    if (!it) return;
    const d = ITEMS[it.id];
    if (d.kind === 'silver') {
      p.silver += it.n;
      g.items.delete(k);
      say(g, `You found ${it.n} silver.`, 'kulta');
      return;
    }
    if (d.kind === 'arrows') {
      p.arrows += it.n;
      g.items.delete(k);
      say(g, `You found ${it.n} arrows.`, 'hyva');
      return;
    }
    if (d.kind === 'sampo') {
      g.items.delete(k);
      g.won = true;
      g.over = true;
      say(g, 'You lift the Sampo! Its bright lid rumbles and the copper mountain shakes.', 'kulta');
      return;
    }
    // Huonompia varusteita ei poimita automaattisesti, jotta reppu ei täyty turhasta.
    if ((d.kind === 'weapon' || d.kind === 'armor') && compareItem(it, p) <= 0) {
      say(g, `Here lies: ${d.name} (${itemInfo(it, p)}), but your current gear is better. You leave it.`);
      return;
    }
    const slot = addToPack(g, it);
    if (slot < 0) {
      say(g, `Here lies: ${d.name}, but your pack is full. Drop something (Shift+number) to take this instead.`, 'tieto');
      return;
    }
    g.items.delete(k);
    let hint = '';
    if (compareItem(it, p) > 0) hint = ` Better than your current one – equip it with key ${slot + 1}.`;
    say(g, `Picked up: ${itemLabel(it)} (${itemInfo(it, p)}).${hint}`, hint ? 'hyva' : '');
  }

  function doMove(g, dx, dy) {
    const p = g.player, nx = p.x + dx, ny = p.y + dy;
    if (!inb(nx, ny)) return false;
    const m = monsterAt(g, nx, ny);
    if (m) {
      playerAttack(g, m);
      return true;
    }
    const t = g.map[idx(nx, ny)];
    if (!PASSABLE[t]) return false;
    p.x = nx;
    p.y = ny;
    pickup(g);
    if (t === STAIRS) say(g, 'Stairs down. Press Space to descend.', 'tieto');
    if (t === SPRING) say(g, 'A sacred spring. Press Space to drink.', 'tieto');
    return true;
  }

  // Välilyönti: juo lähteestä, laskeudu portaita tai odota vuoro.
  function doAction(g) {
    const p = g.player, i = idx(p.x, p.y), t = g.map[i];
    if (t === SPRING) {
      g.map[i] = DRY;
      p.hp = p.maxHp;
      p.mana = p.maxMana;
      say(g, 'You drink from the sacred spring. Your strength is fully restored! The spring runs dry.', 'hyva');
      return true;
    }
    if (t === STAIRS) {
      g.depth++;
      g.maxDepth = Math.max(g.maxDepth, g.depth);
      say(g, `You descend deeper. Locks remaining: ${Math.max(0, MAX_DEPTH - g.depth)}.`, 'tieto');
      enterLevel(g);
      return true;
    }
    return true;
  }

  function useItem(g, slot) {
    const p = g.player, it = p.pack[slot];
    if (!it) return false;
    const d = ITEMS[it.id];
    switch (d.kind) {
      case 'weapon':
        p.pack[slot] = p.weapon;
        p.weapon = it;
        say(g, `You wield: ${d.name} (${itemInfo(it, p)}).`);
        return true;
      case 'armor':
        p.pack[slot] = p.armor;
        p.armor = it;
        say(g, `You put on: ${d.name} (${itemInfo(it, p)}).`);
        return true;
      case 'food': {
        if (p.hp >= p.maxHp) { say(g, 'You are already at full health – you save the food.'); return false; }
        const got = heal(p, d.heal);
        consume(p, slot);
        say(g, `You ate: ${d.name} (+${got} HP).`, 'hyva');
        return true;
      }
      case 'potion':
        if (it.id === 'mesivoide') {
          if (p.hp >= p.maxHp) { say(g, 'You are already at full health – you save the salve.'); return false; }
          const got = heal(p, d.heal);
          consume(p, slot);
          say(g, `You drank: ${d.name} (+${got} HP).`, 'hyva');
          return true;
        }
        if (it.id === 'mahla') {
          if (p.cls === 'tietaja') {
            if (p.mana >= p.maxMana) { say(g, 'Your mana is already full – you save the sap.'); return false; }
            const before = p.mana;
            p.mana = Math.min(p.maxMana, p.mana + d.mana);
            consume(p, slot);
            say(g, `You drank: ${d.name} (+${p.mana - before} mana).`, 'hyva');
            return true;
          }
          if (p.hp >= p.maxHp) { say(g, 'You are already at full health – you save the sap.'); return false; }
          const got = heal(p, d.mana);
          consume(p, slot);
          say(g, `You drank: ${d.name} (+${got} HP).`, 'hyva');
          return true;
        }
        p.voima++;
        p.maxHp += 3;
        p.hp += 3;
        consume(p, slot);
        say(g, 'The strength potion courses through your veins: strength +1, max HP +3.', 'hyva');
        return true;
      case 'scroll':
        return readScroll(g, slot);
      default:
        return false;
    }
  }

  function readScroll(g, slot) {
    const p = g.player, id = p.pack[slot].id;
    if (id === 'tulituohi') {
      const targets = visibleMonsters(g);
      if (!targets.length) { say(g, 'No visible enemies – you save the fire scroll.'); return false; }
      consume(p, slot);
      say(g, 'You read the fire scroll. The origin of fire blazes forth!', 'hyva');
      for (const m of targets) damageMonster(g, m, ri(g, 6, 12) + p.level, 'The flames burn:');
      return true;
    }
    if (id === 'nakotuohi') {
      consume(p, slot);
      for (let i = 0; i < g.map.length; i++) if (g.map[i] !== ROCK) g.seen[i] = 1;
      say(g, 'You read the sight scroll. The map of the whole floor etches itself into your mind.', 'hyva');
      return true;
    }
    if (id === 'siirtotuohi') {
      const here = g.rooms.filter(r => !(p.x >= r.x1 && p.x <= r.x2 && p.y >= r.y1 && p.y <= r.y2));
      const t = freeTile(g, pick(g, here.length ? here : g.rooms));
      if (!t) { say(g, 'The scroll crackles, but nothing happens.'); return false; }
      consume(p, slot);
      p.x = t.x;
      p.y = t.y;
      say(g, 'You read the warp scroll. A wind whisks you away!', 'hyva');
      pickup(g);
      return true;
    }
    consume(p, slot);
    p.shield = 21;
    say(g, 'You read the shield scroll. A protective spell surrounds you (armor +4, 20 turns).', 'hyva');
    return true;
  }

  function dropItem(g, slot) {
    const p = g.player, it = p.pack[slot];
    if (!it) return false;
    const k = idx(p.x, p.y), floor = g.items.get(k);
    g.items.set(k, it);
    p.pack[slot] = floor || null;
    if (floor) say(g, `Dropped: ${itemLabel(it)}. Picked up: ${itemLabel(floor)}.`);
    else say(g, `Dropped: ${itemLabel(it)}.`);
    return true;
  }

  function useAbility(g) {
    const p = g.player;
    if (p.cls === 'urho') {
      if (p.raivo > 0) { say(g, 'Rage is already active.'); return false; }
      if (p.raivoCd > 0) { say(g, `Rage is not ready yet (${p.raivoCd} turns).`); return false; }
      p.raivo = 7;
      p.raivoCd = 31;
      say(g, 'Rage takes hold of you! Your blows deal double damage.', 'hyva');
      return true;
    }
    const target = nearestTarget(g);
    if (p.cls === 'tietaja') {
      if (p.mana < 3) { say(g, "Not enough mana for Ukko's Fire (3 needed)."); return false; }
      if (!target) { say(g, "No visible target for Ukko's Fire."); return false; }
      p.mana -= 3;
      const [lo, hi] = spellRange(p);
      damageMonster(g, target, ri(g, lo, hi), "Ukko's Fire strikes:");
      return true;
    }
    if (p.arrows <= 0) { say(g, 'You are out of arrows.'); return false; }
    if (!target) { say(g, 'No visible target for an arrow.'); return false; }
    p.arrows--;
    const back = chance(g, 0.5);
    if (back) p.arrows++;
    const tail = back ? ' (arrow recovered)' : '';
    const td = MONSTERS[target.id];
    if (ri(g, 1, 100) > clamp(85 + p.level * 2 - td.def * 3, 40, 97)) {
      target.asleep = false;
      target.lastSeen = g.turn;
      say(g, `The arrow misses: ${td.name}.${tail}`);
      return true;
    }
    const [lo, hi] = bowRange(p);
    damageMonster(g, target, ri(g, lo, hi), 'The arrow hits:', tail);
    return true;
  }

  function playerAttack(g, m) {
    const p = g.player, d = MONSTERS[m.id];
    const hit = clamp(78 + p.level * 2 - d.def * 4 + (p.raivo > 0 ? 10 : 0), 30, 97);
    if (ri(g, 1, 100) > hit) {
      m.asleep = false;
      m.lastSeen = g.turn;
      say(g, `Miss! ${d.name} dodges.`);
      return;
    }
    const [lo, hi] = dmgRange(p);
    let dmg = ri(g, lo, hi);
    if (p.raivo > 0) dmg *= 2;
    damageMonster(g, m, dmg, p.raivo > 0 ? 'Furious blow!' : 'Hit!');
  }

  function damageMonster(g, m, dmg, prefix, tail) {
    const d = MONSTERS[m.id];
    m.hp -= dmg;
    m.asleep = false;
    m.lastSeen = g.turn;
    if (m.hp > 0) {
      say(g, `${prefix} ${d.name} −${dmg}.${tail || ''}`);
      return;
    }
    say(g, `${prefix} ${d.name} ${d.death || 'falls'}! (+${d.xp} XP)${tail || ''}`, 'hyva');
    killMonster(g, m);
    gainXp(g, d.xp);
  }

  function dropNear(g, x, y, it) {
    for (let r = 0; r <= 2; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const nx = x + dx, ny = y + dy, i = idx(nx, ny);
          if (inb(nx, ny) && PASSABLE[g.map[i]] && !g.items.has(i)) { g.items.set(i, it); return; }
        }
      }
    }
  }

  function killMonster(g, m) {
    const d = MONSTERS[m.id], p = g.player;
    g.monsters.splice(g.monsters.indexOf(m), 1);
    p.kills++;
    if (d.boss) {
      dropNear(g, m.x, m.y, { id: 'sampo', n: 1 });
      say(g, "The Sampo rolls from Louhi's hands! Step on it to pick it up.", 'kulta');
    } else if (d.silver) {
      dropNear(g, m.x, m.y, { id: 'hopea', n: ri(g, 20, 40) + g.depth * 5 });
    } else if (chance(g, 0.12)) {
      dropNear(g, m.x, m.y, { id: randomItemId(g), n: 1 });
    }
  }

  function gainXp(g, amount) {
    const p = g.player, c = classOf(p);
    p.xp += amount;
    while (p.level < XP_TABLE.length - 1 && p.xp >= XP_TABLE[p.level]) {
      p.level++;
      const gains = [`+${c.hpPerLevel} HP`];
      p.maxHp += c.hpPerLevel;
      p.hp += c.hpPerLevel;
      if (p.level % c.voimaEvery === 0) { p.voima++; gains.push('strength +1'); }
      if (c.manaPerLevel) { p.maxMana += c.manaPerLevel; p.mana += c.manaPerLevel; gains.push(`+${c.manaPerLevel} mana`); }
      say(g, `You reached level ${p.level}! (${gains.join(', ')})`, 'kulta');
    }
  }

  // --- hirviöiden vuoro -----------------------------------------------------

  function monsterAttack(g, m, d) {
    const p = g.player, def = armorDef(p);
    const hit = clamp(62 + d.lvl * 3 - def * 3 - dodge(p), 20, 95);
    if (ri(g, 1, 100) > hit) {
      say(g, `${d.name} attacks, but you dodge.`);
      return;
    }
    const dmg = Math.max(1, ri(g, d.min, d.max) - ri(g, 0, Math.floor(def / 2)));
    hurtPlayer(g, dmg, `${d.name} ${d.verb} you: −${dmg} HP.`, d.name);
  }

  function hurtPlayer(g, dmg, text, cause) {
    const p = g.player;
    p.hp -= dmg;
    say(g, text, 'paha');
    if (p.hp <= 0) {
      p.hp = 0;
      g.over = true;
      g.cause = cause;
      say(g, `You died. Killed by: ${cause}.`, 'paha');
    }
  }

  function tryStep(g, m, nx, ny) {
    const p = g.player;
    if (!inb(nx, ny) || !PASSABLE[g.map[idx(nx, ny)]]) return false;
    if ((nx === p.x && ny === p.y) || monsterAt(g, nx, ny)) return false;
    m.x = nx;
    m.y = ny;
    return true;
  }

  function randomStep(g, m) {
    for (const [dx, dy] of shuffled(g, DIRS)) if (tryStep(g, m, m.x + dx, m.y + dy)) return;
  }

  function stepToward(g, m) {
    const cur = g.dist[idx(m.x, m.y)];
    let best = null, bestD = cur, side = null;
    for (const [dx, dy] of shuffled(g, DIRS)) {
      const nx = m.x + dx, ny = m.y + dy;
      if (!inb(nx, ny) || monsterAt(g, nx, ny)) continue;
      const dd = g.dist[idx(nx, ny)];
      if (dd < 0) continue;
      if (dd < bestD) { best = [nx, ny]; bestD = dd; }
      else if (dd === cur && !side) side = [nx, ny];
    }
    if (best) tryStep(g, m, best[0], best[1]);
    else if (side && chance(g, 0.3)) tryStep(g, m, side[0], side[1]);
  }

  function monsterTurn(g, m, d) {
    const p = g.player;
    if (Math.abs(m.x - p.x) + Math.abs(m.y - p.y) === 1) {
      monsterAttack(g, m, d);
      return;
    }
    const sees = g.vis[idx(m.x, m.y)] === 1;
    if (d.ranged && sees && chance(g, d.ranged.chance)) {
      const def = armorDef(p);
      const dmg = Math.max(1, ri(g, d.ranged.min, d.ranged.max) - ri(g, 0, Math.floor(def / 2)));
      hurtPlayer(g, dmg, `${d.ranged.text}: −${dmg} HP.`, d.name);
      return;
    }
    if (d.erratic && chance(g, d.erratic)) {
      randomStep(g, m);
      return;
    }
    const hunting = g.turn - m.lastSeen <= 25;
    const dist = g.dist[idx(m.x, m.y)];
    if (hunting && dist > 0 && dist < 40) stepToward(g, m);
    else if (chance(g, 0.4)) randomStep(g, m);
  }

  function monstersAct(g) {
    const p = g.player;
    for (const m of g.monsters.slice()) {
      if (g.over) return;
      if (m.hp <= 0) continue;
      const d = MONSTERS[m.id];
      const sees = g.vis[idx(m.x, m.y)] === 1;
      if (m.asleep) {
        const near = Math.abs(m.x - p.x) + Math.abs(m.y - p.y) <= 2;
        if ((sees && chance(g, p.cls === 'eramies' ? 0.2 : 0.35)) || (near && chance(g, 0.5))) {
          m.asleep = false;
          m.lastSeen = g.turn;
          if (sees) say(g, `${d.name} notices you!`, 'paha');
          else say(g, 'You hear movement very close by.', 'paha');
        }
        continue;
      }
      if (sees) m.lastSeen = g.turn;
      m.energy += d.speed;
      while (m.energy >= 10 && !g.over && m.hp > 0) {
        m.energy -= 10;
        monsterTurn(g, m, d);
      }
    }
  }

  // Uusia hirviöitä vaeltaa hiljalleen näkyvien alueiden ulkopuolelle.
  function maybeSpawn(g) {
    if (g.depth >= MAX_DEPTH || g.monsters.length >= 6 + g.depth * 2 || !chance(g, 1 / 150)) return;
    const p = g.player;
    const rooms = g.rooms.filter(r => !(p.x >= r.x1 && p.x <= r.x2 && p.y >= r.y1 && p.y <= r.y2));
    if (!rooms.length) return;
    const t = freeTile(g, pick(g, rooms));
    if (t && !g.vis[idx(t.x, t.y)]) spawnMonster(g, randomMonsterId(g), t.x, t.y, false);
  }

  function endTurn(g) {
    const p = g.player;
    g.turn++;
    if (p.raivo > 0) p.raivo--;
    if (p.raivoCd > 0) p.raivoCd--;
    if (p.shield > 0 && --p.shield === 0) say(g, 'The shield spell fades.');

    const hpEvery = Math.max(3, 7 - Math.floor(p.level / 2));
    if (g.turn % hpEvery === 0) heal(p, Math.max(1, Math.floor(p.maxHp / 30)));
    if (p.maxMana && g.turn % (p.level >= 5 ? 3 : 4) === 0) p.mana = Math.min(p.maxMana, p.mana + 1);

    computeDist(g);
    updateVision(g);
    monstersAct(g);
    if (g.over) return;
    maybeSpawn(g);
    updateVision(g);
  }

  function enterLevel(g) {
    generate(g);
    updateVision(g);
    say(g, `Floor ${g.depth}/${MAX_DEPTH}: ${FLOOR_NAMES[g.depth - 1]}.`, 'tieto');
    if (g.depth === MAX_DEPTH) say(g, 'A cold breath fills the corridors. Louhi (L) guards the Sampo somewhere here.', 'paha');
  }

  // --- julkinen rajapinta ---------------------------------------------------

  function newGame(name, classId, seed) {
    const cls = CLASSES.find(c => c.id === classId) || CLASSES[0];
    if (seed === undefined) seed = (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
    const g = {
      seed, rng: makeRng(seed), turn: 0, depth: 1, maxDepth: 1,
      over: false, won: false, cause: '',
      map: new Uint8Array(W * H), seen: new Uint8Array(W * H), vis: new Uint8Array(W * H), dist: new Int16Array(W * H),
      items: new Map(), monsters: [], rooms: [], log: [],
      player: null,
    };
    g.player = {
      name, cls: cls.id, x: 0, y: 0, level: 1, xp: 0,
      hp: cls.hp, maxHp: cls.hp, voima: cls.voima,
      mana: cls.mana || 0, maxMana: cls.mana || 0, arrows: cls.arrows || 0,
      weapon: { id: cls.weapon, n: 1 }, armor: { id: cls.armor, n: 1 },
      pack: new Array(PACK_SIZE).fill(null),
      silver: 0, kills: 0, raivo: 0, raivoCd: 0, shield: 0,
    };
    for (const [id, n] of cls.items) addToPack(g, { id, n });
    say(g, `Welcome, ${name}! Louhi has hidden the Sampo in the belly of the copper mountain, ten floors deep.`, 'kulta');
    say(g, 'Move with the arrow keys or WASD. Attack by walking into an enemy. Pick up items by stepping on them.', 'tieto');
    say(g, 'Find the stairs down (>) and press Space to descend.', 'tieto');
    enterLevel(g);
    return g;
  }

  // Palauttaa true, jos toiminto kulutti vuoron.
  function act(g, a) {
    if (g.over) return false;
    let spent = false;
    switch (a.type) {
      case 'move': spent = doMove(g, a.dx, a.dy); break;
      case 'action': spent = doAction(g); break;
      case 'use': spent = useItem(g, a.slot); break;
      case 'drop': spent = dropItem(g, a.slot); break;
      case 'ability': spent = useAbility(g); break;
    }
    if (spent && !g.over) endTurn(g);
    return spent;
  }

  const api = {
    W, H, MAX_DEPTH, PACK_SIZE, XP_TABLE, FLOOR_NAMES, CLASSES, ITEMS, MONSTERS,
    T: { ROCK, FLOOR, CORR, WALL_H, WALL_V, DOOR, STAIRS, SPRING, DRY }, PASSABLE,
    newGame, act, pathTo, visibleMonsters, nearestTarget, abilityInfo,
    itemLabel, itemInfo, compareItem, armorDef, dodge, dmgRange, score, classOf,
  };
  root.Vaskivuori = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
