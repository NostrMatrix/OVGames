/*
 * app.js - Avainjahti: skannaussykli, saldohaku, halytys ja tallennetut loydot.
 */
(function () {
  'use strict';

  var LS = 'avainjahti.v1';
  var SATS = 100000000;
  /* Karkea arvio saldollisten osoitteiden maarasta, kaytetaan vain kertoimien
     havainnollistamiseen. */
  var FUNDED_ADDRESSES = 5.4e7;
  var KEYSPACE = Math.pow(2, 160);
  var MAX_BACKOFF = 300000;

  var $ = function (id) { return document.getElementById(id); };

  /* ------------------------------------------------------------------ *
   * Tila                                                                *
   * ------------------------------------------------------------------ */

  var cfg = {
    mode: 'live',
    intervalSec: 5,
    batch: 30,
    odds: 1000,
    hard: false,
    stopOnUsed: false,
    sound: true
  };

  var st = {
    running: false,
    token: 0,
    phase: 'idle',
    cycles: 0,
    keys: 0,
    addrs: 0,
    activeMs: 0,
    runStart: 0,
    fails: 0,
    finds: [],
    lastHit: null,
    rows: {},
    tickTimer: 0,
    nextTimer: 0
  };

  function persist() {
    try {
      localStorage.setItem(LS, JSON.stringify({
        cfg: cfg,
        running: st.running,
        cycles: st.cycles,
        keys: st.keys,
        addrs: st.addrs,
        activeMs: elapsedMs(),
        finds: st.finds
      }));
    } catch (e) { /* privaatti-ikkuna tms. */ }
  }

  function restore() {
    var raw;
    try { raw = JSON.parse(localStorage.getItem(LS)); } catch (e) { raw = null; }
    if (!raw) return false;
    if (raw.cfg) for (var k in cfg) if (raw.cfg[k] !== undefined) cfg[k] = raw.cfg[k];
    st.cycles = raw.cycles || 0;
    st.keys = raw.keys || 0;
    st.addrs = raw.addrs || 0;
    st.activeMs = raw.activeMs || 0;
    st.finds = Array.isArray(raw.finds) ? raw.finds : [];
    return !!raw.running;
  }

  function elapsedMs() {
    return st.activeMs + (st.runStart ? performance.now() - st.runStart : 0);
  }

  /* ------------------------------------------------------------------ *
   * Muotoilu                                                            *
   * ------------------------------------------------------------------ */

  var nf = new Intl.NumberFormat('en-US');

  function btc(sats) {
    return (sats / SATS).toFixed(8);
  }

  function sci(x) {
    if (!isFinite(x) || x <= 0) return '–';
    var e = Math.floor(Math.log10(x));
    var m = x / Math.pow(10, e);
    return m.toFixed(2) + ' × 10^' + e;
  }

  function hhmmss(ms) {
    var s = Math.floor(ms / 1000);
    var p = function (n) { return String(n).padStart(2, '0'); };
    return p(Math.floor(s / 3600)) + ':' + p(Math.floor(s / 60) % 60) + ':' + p(s % 60);
  }

  function trunc(s, head, tail) {
    return s.length <= head + tail + 1 ? s : s.slice(0, head) + '…' + s.slice(-tail);
  }

  /* ------------------------------------------------------------------ *
   * Yleinen renderointi                                                 *
   * ------------------------------------------------------------------ */

  var STATUS = {
    idle:       ['idle', 'Ready'],
    generating: ['run',  'Computing keys'],
    checking:   ['run',  'Fetching balances'],
    waiting:    ['run',  'Waiting'],
    hit:        ['hit',  'Hit — stopped'],
    error:      ['err',  'API error']
  };

  function setPhase(p) {
    st.phase = p;
    var s = STATUS[p] || STATUS.idle;
    $('status').dataset.state = s[0];
    $('statusText').textContent = s[1];
  }

  function renderStats() {
    $('sCycles').textContent = nf.format(st.cycles);
    $('sKeys').textContent = nf.format(st.keys);
    $('sAddrs').textContent = nf.format(st.addrs);
    $('sHits').textContent = nf.format(st.finds.length);
    var ms = elapsedMs();
    $('sTime').textContent = hhmmss(ms);
    var rate = ms > 500 ? st.addrs / (ms / 1000) : 0;
    $('sRate').innerHTML = rate.toFixed(1) + '<small>addr/s</small>';
    renderOdds(rate);
  }

  function renderOdds(rate) {
    var p = st.addrs * (FUNDED_ADDRESSES / KEYSPACE);
    $('oProb').textContent = p > 0 ? '1 : ' + sci(1 / p) : '1 : –';
    if (rate > 0) {
      var years = KEYSPACE / rate / 31557600;
      $('oTime').textContent = sci(years) + ' years';
    } else {
      $('oTime').textContent = '–';
    }
  }

  function renderControls() {
    $('modeLive').setAttribute('aria-pressed', String(cfg.mode === 'live'));
    $('modeDemo').setAttribute('aria-pressed', String(cfg.mode === 'demo'));
    $('demoOddsField').style.display = cfg.mode === 'demo' ? '' : 'none';
    $('cInterval').value = cfg.intervalSec;
    $('cBatch').value = cfg.batch;
    $('cOdds').value = String(cfg.odds);
    $('cHard').checked = cfg.hard;
    $('cUsed').checked = cfg.stopOnUsed;
    $('cSound').checked = cfg.sound;
    $('fBatch').textContent = cfg.batch;
    $('btnStart').textContent = st.running ? 'Stop' : 'Start';
    $('btnStart').classList.toggle('primary', !st.running);
    $('btnOnce').disabled = st.running;
  }

  function setBanner(msg) {
    var b = $('apiBanner');
    if (!msg) { b.hidden = true; return; }
    b.hidden = false;
    b.textContent = msg;
  }

  function setBar(frac, label) {
    $('cycleBar').style.width = Math.max(0, Math.min(1, frac)) * 100 + '%';
    if (label !== undefined) $('cycleLabel').innerHTML = label;
  }

  /* ------------------------------------------------------------------ *
   * Taulukko                                                            *
   * ------------------------------------------------------------------ */

  function clearTable() {
    $('rows').textContent = '';
    st.rows = {};
    $('tableEmpty').hidden = true;
  }

  function cell(cls, node) {
    var td = document.createElement('td');
    td.className = cls;
    if (node !== undefined) td.appendChild(node);
    return td;
  }

  function copyable(text, shown, cls) {
    var c = document.createElement('code');
    c.textContent = shown || text;
    c.dataset.copy = text;
    c.title = text + '  (click to copy)';
    if (cls) c.className = cls;
    return c;
  }

  function badge(text, cls) {
    var s = document.createElement('span');
    s.className = 'badge' + (cls ? ' ' + cls : '');
    s.textContent = text;
    return s;
  }

  function appendKeyRows(i, key) {
    var tb = $('rows');
    var alt = i % 2 === 1 ? ' alt' : '';

    var r1 = document.createElement('tr');
    r1.className = 'k' + alt;
    var idx = cell('idx');
    idx.rowSpan = 2;
    idx.textContent = String(i + 1).padStart(2, '0');
    var wif = cell('wif', copyable(key.wif, trunc(key.wif, 11, 8)));
    wif.rowSpan = 2;
    r1.appendChild(idx);
    r1.appendChild(wif);
    r1.appendChild(cell('type', badge('P2PKH')));
    r1.appendChild(cell('addr', copyable(key.legacy)));
    var b1 = cell('bal pending');
    b1.textContent = '·';
    r1.appendChild(b1);

    var r2 = document.createElement('tr');
    r2.className = 'k' + alt;
    r2.appendChild(cell('type', badge('P2WPKH', 'b32')));
    r2.appendChild(cell('addr', copyable(key.bech32)));
    var b2 = cell('bal pending');
    b2.textContent = '·';
    r2.appendChild(b2);

    tb.appendChild(r1);
    tb.appendChild(r2);

    st.rows[key.legacy] = { tr: r1, td: b1, key: key, type: 'P2PKH', addr: key.legacy };
    st.rows[key.bech32] = { tr: r2, td: b2, key: key, type: 'P2WPKH', addr: key.bech32 };
  }

  function paintBalance(addr, info) {
    var row = st.rows[addr];
    if (!row) return;
    row.td.textContent = btc(info.sats);
    row.td.className = 'bal ' + (info.sats > 0 ? 'hit' : info.nTx > 0 ? 'used' : 'zero');
    if (info.sats > 0 || (cfg.stopOnUsed && info.nTx > 0)) row.tr.classList.add('hitrow');
    if (info.nTx > 0 && info.sats === 0) row.td.title = nf.format(info.nTx) + ' transactions, balance 0';
  }

  /* ------------------------------------------------------------------ *
   * Saldolahteet                                                        *
   * ------------------------------------------------------------------ */

  function chunked(arr, size) {
    var out = [];
    for (var i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
  }

  async function liveBalances(addrs) {
    var map = new Map();
    var chunks = chunked(addrs, 60);
    for (var i = 0; i < chunks.length; i++) {
      var chunk = chunks[i];
      var res = await fetch(
        'https://blockchain.info/balance?active=' + chunk.join('|') + '&cors=true',
        { cache: 'no-store' }
      );
      if (!res.ok) throw new Error('blockchain.info HTTP ' + res.status);
      var json = await res.json();
      for (var j = 0; j < chunk.length; j++) {
        var info = json[chunk[j]];
        if (!info) throw new Error('blockchain.info: incomplete response');
        map.set(chunk[j], { sats: info.final_balance, nTx: info.n_tx });
      }
    }
    return { map: map, source: 'blockchain.info' };
  }

  async function fallbackBalances(addrs) {
    var map = new Map();
    var next = 0;
    async function worker() {
      while (next < addrs.length) {
        var a = addrs[next++];
        var res = await fetch('https://mempool.space/api/address/' + a, { cache: 'no-store' });
        if (!res.ok) throw new Error('mempool.space HTTP ' + res.status);
        var j = await res.json();
        var c = j.chain_stats, m = j.mempool_stats;
        map.set(a, {
          sats: (c.funded_txo_sum - c.spent_txo_sum) + (m.funded_txo_sum - m.spent_txo_sum),
          nTx: c.tx_count + m.tx_count
        });
      }
    }
    var n = Math.min(6, addrs.length);
    var workers = [];
    for (var i = 0; i < n; i++) workers.push(worker());
    await Promise.all(workers);
    return { map: map, source: 'mempool.space' };
  }

  function demoBalances(addrs) {
    var map = new Map();
    var pHit = cfg.odds > 0 ? 1 / cfg.odds : 0;
    for (var i = 0; i < addrs.length; i++) {
      var roll = Math.random();
      if (roll < pHit) {
        map.set(addrs[i], {
          sats: Math.floor(Math.exp(Math.random() * 12 + 8)),
          nTx: 1 + Math.floor(Math.random() * 40)
        });
      } else if (roll < pHit * 6) {
        map.set(addrs[i], { sats: 0, nTx: 1 + Math.floor(Math.random() * 12) });
      } else {
        map.set(addrs[i], { sats: 0, nTx: 0 });
      }
    }
    return Promise.resolve({ map: map, source: 'demo' });
  }

  async function checkBalances(addrs) {
    if (cfg.mode === 'demo') return demoBalances(addrs);
    try {
      var r = await liveBalances(addrs);
      setBanner('');
      return r;
    } catch (e) {
      setBanner('blockchain.info: ' + e.message + ' — trying mempool.space (slower)…');
      return await fallbackBalances(addrs);
    }
  }

  /* ------------------------------------------------------------------ *
   * Skannaussykli                                                       *
   * ------------------------------------------------------------------ */

  /* Luovuttaa vuoron selaimelle piirtoa varten. requestAnimationFrame yksin ei
     kelpaa: se pysahtyy kokonaan kun valilehti ei ole nakyvissa, joten mukana on
     setTimeout-varmistus. */
  function yieldUi() {
    return new Promise(function (r) {
      var done = false;
      var fin = function () { if (!done) { done = true; r(); } };
      requestAnimationFrame(fin);
      setTimeout(fin, 60);
    });
  }

  function clearTimers() {
    if (st.tickTimer) { clearInterval(st.tickTimer); st.tickTimer = 0; }
    if (st.nextTimer) { clearTimeout(st.nextTimer); st.nextTimer = 0; }
  }

  async function runCycle() {
    var token = st.token;
    setPhase('generating');
    clearTable();

    var keys = [], addrs = [];
    for (var i = 0; i < cfg.batch; i++) {
      var key = BTC.deriveKey();
      keys.push(key);
      addrs.push(key.legacy, key.bech32);
      appendKeyRows(i, key);
      setBar((i + 1) / cfg.batch, 'Computing keys <b>' + (i + 1) + ' / ' + cfg.batch + '</b>');
      if (i % 5 === 4) {
        await yieldUi();
        if (token !== st.token) return;
      }
    }

    setPhase('checking');
    setBar(1, 'Fetching balances for <b>' + addrs.length + '</b> addresses…');

    var result;
    try {
      result = await checkBalances(addrs);
    } catch (e) {
      if (token !== st.token) return;
      st.fails++;
      setPhase('error');
      var wait = Math.min(MAX_BACKOFF, cfg.intervalSec * 1000 * Math.pow(2, st.fails));
      setBanner('Balance lookup failed: ' + e.message + ' — retrying in ' +
                Math.round(wait / 1000) + ' s (attempt ' + (st.fails + 1) + ').');
      if (st.running) scheduleNext(wait, true);
      return;
    }
    if (token !== st.token) return;

    st.fails = 0;
    if (result.source === 'mempool.space') {
      setBanner('Using fallback source: mempool.space. Consider a longer refresh interval.');
    }

    var hits = [];
    for (var a = 0; a < addrs.length; a++) {
      var info = result.map.get(addrs[a]) || { sats: 0, nTx: 0 };
      paintBalance(addrs[a], info);
      if (info.sats > 0 || (cfg.stopOnUsed && info.nTx > 0)) hits.push({ addr: addrs[a], info: info });
    }

    st.cycles++;
    st.keys += keys.length;
    st.addrs += addrs.length;
    renderStats();
    persist();

    if (hits.length) { onHit(hits, result.source); return; }
    if (st.running) scheduleNext(cfg.intervalSec * 1000, false);
    else { setPhase('idle'); setBar(0, 'Stopped'); }
  }

  /* Laskuri ajetaan setTimeoutilla eika rAF:lla, jotta skannaus jatkuu myos kun
     valilehti on taustalla. setInterval hoitaa pelkan visuaalisen paivityksen. */
  function scheduleNext(ms, isRetry) {
    var token = st.token;
    var end = Date.now() + ms;
    setPhase(isRetry ? 'error' : 'waiting');
    clearTimers();

    st.tickTimer = setInterval(function () {
      if (!st.running || token !== st.token) { clearTimers(); return; }
      var left = Math.max(0, end - Date.now());
      setBar(1 - left / ms, (isRetry ? 'Retry in ' : 'Next cycle in ') +
        '<b>' + (left / 1000).toFixed(1) + ' s</b>');
      renderStats();
    }, 80);

    st.nextTimer = setTimeout(function () {
      clearTimers();
      if (!st.running || token !== st.token) return;
      setBar(1);
      if (cfg.hard) { persist(); location.reload(); }
      else runCycle();
    }, ms);
  }

  /* ------------------------------------------------------------------ *
   * Osuma                                                               *
   * ------------------------------------------------------------------ */

  function onHit(hits, source) {
    st.running = false;
    st.token++;
    clearTimers();
    st.runStart && (st.activeMs = elapsedMs());
    st.runStart = 0;
    setPhase('hit');
    setBar(1, '<b>HIT</b> — scanning stopped');

    var best = hits.slice().sort(function (a, b) { return b.info.sats - a.info.sats; })[0];
    var row = st.rows[best.addr];
    var find = {
      ts: new Date().toISOString(),
      address: best.addr,
      type: row ? row.type : '?',
      balanceSats: best.info.sats,
      balanceBtc: best.info.sats / SATS,
      txCount: best.info.nTx,
      wif: row ? row.key.wif : '',
      privateKeyHex: row ? row.key.privHex : '',
      publicKeyHex: row ? row.key.pubHex : '',
      legacyAddress: row ? row.key.legacy : '',
      bech32Address: row ? row.key.bech32 : '',
      source: source,
      mode: cfg.mode,
      otherHits: hits.length - 1
    };

    st.finds.unshift(find);
    st.lastHit = find;
    persist();
    renderStats();
    renderControls();
    renderFinds();
    showAlert(find, hits.length);
    if (cfg.sound) beep();
    if (row) row.tr.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  function showAlert(find, count) {
    $('alertAmt').innerHTML = btc(find.balanceSats) + ' <span>BTC</span>';
    $('alertLead').textContent = find.balanceSats > 0
      ? 'Found an address with a balance. Automatic refresh has been stopped.'
      : 'Found an address with transaction history. Automatic refresh has been stopped.';

    var kv = $('alertKv');
    kv.textContent = '';
    var pairs = [
      ['Address', find.address],
      ['Type', find.type],
      ['Transactions', nf.format(find.txCount)],
      ['WIF', find.wif],
      ['Private key', find.privateKeyHex],
      ['Legacy', find.legacyAddress],
      ['Bech32', find.bech32Address],
      ['Source', find.source],
      ['Time', new Date(find.ts).toLocaleString('en-US')]
    ];
    if (count > 1) pairs.push(['Other hits', String(count - 1)]);
    pairs.forEach(function (p) {
      var dt = document.createElement('dt');
      dt.textContent = p[0];
      var dd = document.createElement('dd');
      dd.appendChild(copyable(p[1]));
      kv.appendChild(dt);
      kv.appendChild(dd);
    });

    $('alertWarn').textContent = find.mode === 'demo'
      ? 'DEMO MODE: this balance is randomly generated, the address holds no real bitcoin. ' +
        'The find was saved only for testing the alert logic.'
      : 'The find has been saved to the browser\'s localStorage. Download a copy before clearing ' +
        'browser data. If the address holds a real balance, it belongs to someone else — ' +
        'moving the funds would be theft.';

    $('overlay').hidden = false;
  }

  function beep() {
    try {
      var ac = new (window.AudioContext || window.webkitAudioContext)();
      [0, 0.22, 0.44].forEach(function (t) {
        var o = ac.createOscillator(), g = ac.createGain();
        o.type = 'square';
        o.frequency.setValueAtTime(880, ac.currentTime + t);
        g.gain.setValueAtTime(0.0001, ac.currentTime + t);
        g.gain.exponentialRampToValueAtTime(0.18, ac.currentTime + t + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + t + 0.16);
        o.connect(g); g.connect(ac.destination);
        o.start(ac.currentTime + t); o.stop(ac.currentTime + t + 0.18);
      });
      setTimeout(function () { ac.close(); }, 1200);
    } catch (e) { /* aani ei ole kriittinen */ }
  }

  /* ------------------------------------------------------------------ *
   * Tallennetut loydot                                                  *
   * ------------------------------------------------------------------ */

  function renderFinds() {
    var panel = $('findsPanel'), list = $('findsList');
    panel.hidden = st.finds.length === 0;
    list.textContent = '';

    st.finds.forEach(function (f, i) {
      var box = document.createElement('div');
      box.className = 'find';

      var row1 = document.createElement('div');
      row1.className = 'row1';
      var amt = document.createElement('span');
      amt.className = 'amt';
      amt.textContent = btc(f.balanceSats) + ' BTC';
      row1.appendChild(amt);
      row1.appendChild(badge(f.type, f.type === 'P2WPKH' ? 'b32' : ''));
      if (f.mode === 'demo') row1.appendChild(badge('DEMO'));
      var when = document.createElement('span');
      when.className = 'when';
      when.textContent = new Date(f.ts).toLocaleString('en-US');
      row1.appendChild(when);
      box.appendChild(row1);

      var dl = document.createElement('dl');
      [['Address', f.address], ['WIF', f.wif], ['Private key', f.privateKeyHex]]
        .forEach(function (p) {
          var dt = document.createElement('dt');
          dt.textContent = p[0];
          var dd = document.createElement('dd');
          dd.appendChild(copyable(p[1]));
          dl.appendChild(dt);
          dl.appendChild(dd);
        });
      box.appendChild(dl);

      var acts = document.createElement('div');
      acts.className = 'acts';
      acts.appendChild(mkBtn('Copy WIF', function () { copy(f.wif, this); }));
      acts.appendChild(mkBtn('Download JSON', function () {
        download('keyhunt-find-' + f.ts.replace(/[:.]/g, '-') + '.json',
                 JSON.stringify(f, null, 2));
      }));
      acts.appendChild(mkBtn('Delete', function () {
        st.finds.splice(i, 1);
        persist(); renderFinds(); renderStats();
      }, 'ghost'));
      box.appendChild(acts);

      list.appendChild(box);
    });
  }

  /* Kahden klikkauksen vahvistus napissa itsessaan. window.confirm ei kelpaa:
     osa selainkonteksteista vaimentaa modaalit, jolloin se palauttaa false
     ilman dialogia eika toiminto koskaan suoriudu. */
  function confirmButton(btn, prompt, action) {
    var original = btn.textContent, armed = false, timer = 0;
    function disarm() {
      armed = false;
      clearTimeout(timer);
      btn.textContent = original;
      btn.classList.remove('armed');
    }
    btn.addEventListener('click', function () {
      if (armed) { disarm(); action(); return; }
      armed = true;
      btn.textContent = prompt;
      btn.classList.add('armed');
      timer = setTimeout(disarm, 4000);
    });
  }

  function mkBtn(label, fn, cls) {
    var b = document.createElement('button');
    b.className = 'btn' + (cls ? ' ' + cls : '');
    b.textContent = label;
    b.addEventListener('click', fn);
    return b;
  }

  /* ------------------------------------------------------------------ *
   * Kopiointi ja lataus                                                 *
   * ------------------------------------------------------------------ */

  function copy(text, node) {
    var done = function () {
      if (!node) return;
      var old = node.textContent;
      node.classList.add('copied');
      if (node.tagName === 'BUTTON') node.textContent = 'Copied';
      setTimeout(function () {
        node.classList.remove('copied');
        if (node.tagName === 'BUTTON') node.textContent = old;
      }, 1100);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () { legacyCopy(text); done(); });
    } else {
      legacyCopy(text);
      done();
    }
  }

  function legacyCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (e) { /* ei tuettu */ }
    document.body.removeChild(ta);
  }

  function download(name, text) {
    var url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    var a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  }

  /* ------------------------------------------------------------------ *
   * Ohjaus                                                              *
   * ------------------------------------------------------------------ */

  function start() {
    if (st.running) return;
    clearTimers();
    st.running = true;
    st.token++;
    st.runStart = performance.now();
    st.fails = 0;
    setBanner('');
    renderControls();
    persist();
    runCycle();
  }

  function stop() {
    if (!st.running) return;
    st.activeMs = elapsedMs();
    st.runStart = 0;
    st.running = false;
    st.token++;
    clearTimers();
    setPhase('idle');
    setBar(0, 'Stopped');
    renderControls();
    renderStats();
    persist();
  }

  function readControls() {
    cfg.intervalSec = Math.max(1, Math.min(3600, Number($('cInterval').value) || 5));
    cfg.batch = Math.max(1, Math.min(200, Math.round(Number($('cBatch').value) || 30)));
    cfg.odds = Number($('cOdds').value);
    cfg.hard = $('cHard').checked;
    cfg.stopOnUsed = $('cUsed').checked;
    cfg.sound = $('cSound').checked;
    $('fBatch').textContent = cfg.batch;
    persist();
  }

  function wire() {
    $('modeLive').addEventListener('click', function () {
      cfg.mode = 'live'; renderControls(); persist();
    });
    $('modeDemo').addEventListener('click', function () {
      cfg.mode = 'demo'; renderControls(); persist(); setBanner('');
    });

    ['cInterval', 'cBatch', 'cOdds', 'cHard', 'cUsed', 'cSound'].forEach(function (id) {
      $(id).addEventListener('change', readControls);
    });

    $('btnStart').addEventListener('click', function () { st.running ? stop() : start(); });
    $('btnOnce').addEventListener('click', function () {
      if (st.running) return;
      st.token++;
      if (!st.runStart) st.runStart = performance.now();
      runCycle().then(function () {
        st.activeMs = elapsedMs();
        st.runStart = 0;
        if (st.phase !== 'hit') { setPhase('idle'); setBar(1, 'Cycle complete'); }
      });
    });
    $('btnReset').addEventListener('click', function () {
      st.cycles = st.keys = st.addrs = 0;
      st.activeMs = 0;
      st.runStart = st.running ? performance.now() : 0;
      renderStats(); persist();
    });

    $('btnExport').addEventListener('click', function () {
      download('keyhunt-finds.json', JSON.stringify(st.finds, null, 2));
    });
    confirmButton($('btnClearFinds'), 'Click again — deletes all', function () {
      st.finds = [];
      persist(); renderFinds(); renderStats();
    });

    $('aCopyWif').addEventListener('click', function () { copy(st.lastHit.wif, this); });
    $('aCopyAddr').addEventListener('click', function () { copy(st.lastHit.address, this); });
    $('aDownload').addEventListener('click', function () {
      download('keyhunt-find.json', JSON.stringify(st.lastHit, null, 2));
    });
    $('aClose').addEventListener('click', function () { $('overlay').hidden = true; });
    $('aResume').addEventListener('click', function () { $('overlay').hidden = true; start(); });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !$('overlay').hidden) $('overlay').hidden = true;
    });

    document.addEventListener('click', function (e) {
      var t = e.target.closest('[data-copy]');
      if (t) copy(t.dataset.copy, t);
    });

    window.addEventListener('beforeunload', persist);
  }

  /* ------------------------------------------------------------------ *
   * Itsetesti                                                           *
   * ------------------------------------------------------------------ */

  function selfTest() {
    var el = $('selftest');
    try {
      var k = BTC.deriveKey(1n);
      var ok = k.legacy === '1BgGZ9tcN4rm9KBzDn7KprQz87SZ26SAMH' &&
               k.bech32 === 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4' &&
               k.wif === 'KwDiBf89QgGbjEhKnhXJuH7LrciVrZi3qYjgd9M7rFU73sVHnoWn';
      el.className = 'selftest ' + (ok ? 'pass' : 'fail');
      el.textContent = ok ? '✓ key derivation verified' : '✗ SELF-TEST FAILED';
      el.title = ok
        ? 'Known test vectors (k=1: address, BIP173 bech32, WIF) match.'
        : 'Key derivation does not reproduce the known test vectors — do not trust the results.';
      return ok;
    } catch (e) {
      el.className = 'selftest fail';
      el.textContent = '✗ SELF-TEST CRASHED';
      el.title = String(e);
      return false;
    }
  }

  /* ------------------------------------------------------------------ *
   * Kaynnistys                                                          *
   * ------------------------------------------------------------------ */

  var wasRunning = restore();
  wire();
  renderControls();
  renderFinds();
  renderStats();
  setPhase('idle');
  setBar(0, 'Stopped');
  var testOk = selfTest();

  setInterval(function () { if (st.running) renderStats(); }, 1000);

  if (wasRunning && testOk) start();
})();
