/* 6 qui prend — interface et déroulement de la partie. */
(function () {
  'use strict';

  const E = window.Engine;
  const ABORT = { aborted: true };
  const LS_SETTINGS = '6qp.settings.v1';
  const LS_SAVE = '6qp.save.v1';
  const BOT_NAMES = ['Bouba', 'Mina', 'Zoé', 'Léo', 'Maxou', 'Inès', 'Tom', 'Éva', 'Sam'];
  const SVGNS = 'http://www.w3.org/2000/svg';

  const $ = (s) => document.querySelector(s);

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = String(text);
    return e;
  }

  function readJSON(key) {
    try {
      const v = localStorage.getItem(key);
      return v ? JSON.parse(v) : null;
    } catch (e) {
      return null;
    }
  }
  function writeJSON(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* stockage indisponible */ }
  }
  function removeKey(key) {
    try { localStorage.removeItem(key); } catch (e) { /* rien */ }
  }

  /* ---------- Réglages ---------- */

  const DEFAULTS = {
    mode: 'solo', // solo | pass | face
    humans: 2,
    names: ['Joueur 1', 'Joueur 2', 'Joueur 3', 'Joueur 4'],
    bots: 3,
    target: 66, // 0 = une seule manche
    fast: false,
  };
  let settings = Object.assign({}, DEFAULTS, readJSON(LS_SETTINGS) || {});
  settings.names = DEFAULTS.names.map((d, i) => (settings.names && settings.names[i]) || d);

  /* ---------- État ---------- */

  let G = null; // partie en cours
  let runId = 0; // sert à abandonner une boucle de jeu devenue obsolète

  function sleep(ms) {
    const k = settings.fast ? 0.4 : 1;
    return new Promise((r) => setTimeout(r, ms * k));
  }

  /** Attend une promesse et abandonne si une autre partie a pris le relais. */
  async function A(my, p) {
    const v = await p;
    if (my !== runId) throw ABORT;
    return v;
  }

  function newGame() {
    const mode = settings.mode;
    const nh = mode === 'solo' ? 1 : mode === 'face' ? 2 : settings.humans;
    const players = [];
    let id = 0;
    for (let i = 0; i < nh; i++) {
      players.push({
        id: id++,
        name: (settings.names[i] || '').trim() || 'Joueur ' + (i + 1),
        human: true,
        seat: mode === 'face' && i === 1 ? 'top' : 'bottom',
        hand: [], total: 0, round: 0, picked: null,
      });
    }
    let nb = Math.max(0, Math.min(settings.bots, 10 - nh));
    if (players.length + nb < 2) nb = 1;
    for (let i = 0; i < nb; i++) {
      players.push({
        id: id++, name: BOT_NAMES[i], human: false, seat: 'bottom',
        hand: [], total: 0, round: 0, picked: null,
      });
    }
    return { mode, target: settings.target, round: 1, turn: 0, players, rows: [], seen: new Set() };
  }

  function deal() {
    const deck = E.shuffle(E.newDeck());
    G.players.forEach((p) => {
      p.hand = deck.splice(0, 10).sort((a, b) => a - b);
      p.picked = null;
      p.round = 0;
    });
    G.rows = [0, 1, 2, 3].map(() => [deck.shift()]);
    G.seen = new Set(G.rows.map((r) => r[0]));
    G.turn = 0;
  }

  function saveGame() {
    if (!G) return;
    writeJSON(LS_SAVE, {
      v: 1, mode: G.mode, target: G.target, round: G.round, turn: G.turn,
      rows: G.rows, seen: Array.from(G.seen),
      players: G.players.map((p) => ({
        id: p.id, name: p.name, human: p.human, seat: p.seat,
        hand: p.hand, total: p.total, round: p.round,
      })),
    });
  }

  function hydrate(s) {
    return {
      mode: s.mode, target: s.target, round: s.round, turn: s.turn,
      rows: s.rows, seen: new Set(s.seen),
      players: s.players.map((p) => Object.assign({ picked: null }, p)),
    };
  }

  /* ---------- Rendu ---------- */

  function bull(size) {
    const s = document.createElementNS(SVGNS, 'svg');
    s.setAttribute('class', 'bull');
    s.setAttribute('viewBox', '0 0 24 24');
    s.style.width = size;
    s.style.height = size;
    const u = document.createElementNS(SVGNS, 'use');
    u.setAttribute('href', '#bull');
    s.appendChild(u);
    return s;
  }

  function cardEl(n, o) {
    o = o || {};
    const h = E.heads(n);
    let cls = 'card h' + h;
    if (o.mini) cls += ' mini';
    if (o.sel) cls += ' sel';
    if (o.pop) cls += ' pop';
    if (o.dim) cls += ' dim';
    const c = el('div', cls);
    c.append(el('span', 'k k1', n), el('span', 'n', n));
    const hd = el('div', 'hd');
    const size = h <= 3 ? '.17' : h <= 5 ? '.14' : '.115';
    for (let i = 0; i < h; i++) hd.append(bull('calc(var(--cw) * ' + size + ')'));
    c.append(hd);
    c.dataset.n = n;
    return c;
  }

  function backEl() {
    return el('div', 'card back');
  }

  function setStatus(text, alert) {
    const s = $('#status');
    s.textContent = text || '';
    s.classList.toggle('alert', !!alert);
  }

  function renderScores() {
    const box = $('#scores');
    box.innerHTML = '';
    if (!G) return;
    G.players.forEach((p) => {
      const chip = el('div', 'chip' + (p.picked != null && G.mode === 'face' && p.human ? ' ready' : ''));
      chip.append(el('div', 'nm', (p.human ? '' : '🤖 ') + p.name));
      const pts = el('div', 'pts');
      pts.append(el('span', 'r', '🐮 ' + p.round));
      if (G.target !== 0) pts.append(el('span', 't', 'Σ ' + p.total));
      chip.append(pts);
      box.append(chip);
    });
    $('#round-info').innerHTML = '';
    $('#round-info').append(
      el('div', '', 'Manche ' + G.round),
      el('div', '', G.target ? 'Objectif ' + G.target : 'Manche unique')
    );
  }

  /** opts: { hl: {row, card}, warn: index, select: fn(index) } */
  function renderBoard(opts) {
    opts = opts || {};
    const b = $('#board');
    b.innerHTML = '';
    if (!G) return;
    G.rows.forEach((row, i) => {
      let cls = 'row';
      if (row.length >= E.ROW_MAX) cls += ' full';
      if (opts.warn === i) cls += ' warn';
      if (opts.select) cls += ' selectable';
      const r = el('div', cls);
      for (let s = 0; s < E.ROW_MAX; s++) {
        const slot = el('div', 'slot');
        if (s < row.length) {
          const isNew = opts.hl && opts.hl.row === i && opts.hl.card === row[s];
          slot.append(cardEl(row[s], { pop: isNew }));
        }
        r.append(slot);
      }
      const badge = el('div', 'rb');
      badge.append(bull('11px'), el('span', '', E.rowHeads(row)));
      r.append(badge);
      if (opts.select) r.addEventListener('click', () => opts.select(i));
      b.append(r);
    });
  }

  function renderPlayed(order, active) {
    const box = $('#played');
    box.innerHTML = '';
    if (!order) return;
    order.forEach((p, i) => {
      const w = el('div', 'pl' + (i < active ? ' done' : i === active ? ' active' : ''));
      w.append(cardEl(p.picked, { mini: true }), el('div', 'who', p.name));
      box.append(w);
    });
  }

  function renderAll() {
    document.body.classList.toggle('face', !!G && G.mode === 'face');
    renderScores();
    renderBoard();
    renderPlayed(null);
  }

  /* ---------- Fenêtres ---------- */

  function modal(build) {
    const ov = $('#overlay');
    ov.innerHTML = '';
    const box = el('div', 'modal');
    ov.append(box);
    ov.classList.remove('hidden');
    build(box);
  }
  function closeModal() {
    const ov = $('#overlay');
    ov.classList.add('hidden');
    ov.innerHTML = '';
  }

  function seg(label, options, value, onChange) {
    const f = el('div', 'field');
    f.append(el('div', 'lbl', label));
    const s = el('div', 'seg');
    options.forEach(([v, t]) => {
      const b = el('button', v === value ? 'on' : '', t);
      b.type = 'button';
      b.addEventListener('click', () => onChange(v));
      s.append(b);
    });
    f.append(s);
    return f;
  }

  function stepper(label, value, min, max, onChange) {
    const f = el('div', 'field');
    f.append(el('div', 'lbl', label));
    const s = el('div', 'stepper');
    const minus = el('button', '', '−');
    const plus = el('button', '', '+');
    minus.type = plus.type = 'button';
    minus.disabled = value <= min;
    plus.disabled = value >= max;
    minus.addEventListener('click', () => onChange(value - 1));
    plus.addEventListener('click', () => onChange(value + 1));
    s.append(minus, el('div', 'val', value), plus);
    f.append(s);
    return f;
  }

  const MODE_HINTS = {
    solo: 'Toi contre des robots.',
    pass: 'Plusieurs humains sur le même appareil : on se le passe pour choisir sa carte en secret.',
    face: 'Deux joueurs assis de chaque côté de l’iPad. Chaque main reste cachée tant qu’on ne touche pas « Voir ma main ».',
  };

  function showMenu() {
    const m = JSON.parse(JSON.stringify(settings));
    const sv = readJSON(LS_SAVE);
    modal((box) => {
      const build = () => {
        box.innerHTML = '';
        const nh = m.mode === 'solo' ? 1 : m.mode === 'face' ? 2 : m.humans;
        const minB = m.mode === 'solo' ? 1 : 0;
        const maxB = 10 - nh;
        m.bots = Math.max(minB, Math.min(maxB, m.bots));

        box.append(el('h1', 'title', '6 qui prend'));
        box.append(el('p', 'sub', 'Évite de ramasser les têtes de bœuf !'));

        const modeField = seg('Mode de jeu',
          [['solo', 'Contre l’ordi'], ['pass', 'Passe-passe'], ['face', 'Face à face']],
          m.mode, (v) => { m.mode = v; build(); });
        modeField.append(el('div', 'hint', MODE_HINTS[m.mode]));
        box.append(modeField);

        if (m.mode === 'pass') {
          box.append(stepper('Joueurs humains', m.humans, 2, 4, (v) => { m.humans = v; build(); }));
        }

        const names = el('div', 'field');
        names.append(el('div', 'lbl', nh > 1 ? 'Prénoms' : 'Prénom'));
        for (let i = 0; i < nh; i++) {
          const inp = el('input');
          inp.type = 'text';
          inp.maxLength = 14;
          inp.value = m.names[i];
          inp.placeholder = 'Joueur ' + (i + 1);
          inp.autocomplete = 'off';
          inp.addEventListener('input', () => { m.names[i] = inp.value; });
          names.append(inp);
        }
        box.append(names);

        box.append(stepper('Robots', m.bots, minB, maxB, (v) => { m.bots = v; build(); }));
        box.append(seg('Fin de partie',
          [[66, 'Partie à 66'], [0, 'Une seule manche']],
          m.target, (v) => { m.target = v; build(); }));

        const fast = el('div', 'field');
        const lab = el('label', 'check');
        const cb = el('input');
        cb.type = 'checkbox';
        cb.checked = !!m.fast;
        cb.addEventListener('change', () => {
          m.fast = cb.checked;
          settings.fast = cb.checked;
          writeJSON(LS_SETTINGS, settings);
        });
        lab.append(cb, el('span', '', 'Animations rapides'));
        fast.append(lab);
        box.append(fast);

        const actions = el('div', 'actions');
        const play = el('button', 'btn primary', 'Nouvelle partie');
        play.addEventListener('click', () => {
          settings = Object.assign({}, settings, m);
          writeJSON(LS_SETTINGS, settings);
          startGame(null);
        });
        actions.append(play);
        if (sv && sv.players) {
          const resume = el('button', 'btn', 'Reprendre la partie (manche ' + sv.round + ', tour ' + (sv.turn + 1) + ')');
          resume.addEventListener('click', () => startGame(sv));
          actions.append(resume);
        }
        const rules = el('button', 'btn ghost', 'Règles du jeu');
        rules.addEventListener('click', () => showRules());
        actions.append(rules);
        if (G) {
          const close = el('button', 'btn ghost', 'Fermer');
          close.addEventListener('click', closeModal);
          actions.append(close);
        }
        box.append(actions);
      };
      build();
    });
  }

  function showRules() {
    modal((box) => {
      box.append(el('h2', '', 'Règles du jeu'));
      const ul = el('ul', 'rules');
      [
        '104 cartes (1 à 104). Chacune vaut 1 à 7 têtes de bœuf : le 55 vaut 7, les multiples de 11 valent 5, les multiples de 10 valent 3, les multiples de 5 valent 2, les autres 1.',
        'Chacun reçoit 10 cartes. 4 cartes sont posées pour former 4 rangées.',
        'À chaque tour, tout le monde choisit une carte en secret. Elles sont révélées, puis posées de la plus petite à la plus grande.',
        'Une carte se pose à la fin de la rangée dont la dernière carte est la plus proche en dessous de la sienne.',
        'Celui qui pose la 6e carte d’une rangée ramasse les 5 premières (leurs têtes de bœuf sont des points de pénalité) et sa carte démarre une nouvelle rangée.',
        'Si ta carte est plus petite que la fin de toutes les rangées, tu choisis une rangée à ramasser.',
        'Après 10 tours, la manche est finie. En « partie à 66 », on enchaîne les manches jusqu’à ce qu’un joueur atteigne 66 têtes de bœuf : le plus petit total gagne.',
      ].forEach((t) => ul.append(el('li', '', t)));
      box.append(ul);
      const actions = el('div', 'actions');
      const back = el('button', 'btn primary', 'Retour');
      back.addEventListener('click', () => (G ? closeModal() : showMenu()));
      actions.append(back);
      box.append(actions);
    });
  }

  function handover(p) {
    return new Promise((resolve) => {
      modal((box) => {
        box.append(el('div', 'big', '📱'));
        box.append(el('h2', '', 'Passe l’appareil à ' + p.name));
        box.append(el('p', 'sub', 'Les autres ne regardent pas !'));
        const actions = el('div', 'actions');
        const ok = el('button', 'btn primary', 'C’est moi, ' + p.name);
        ok.addEventListener('click', () => { closeModal(); resolve(); });
        actions.append(ok);
        box.append(actions);
      });
    });
  }

  function summaryModal(over) {
    return new Promise((resolve) => {
      modal((box) => {
        const sorted = G.players.slice().sort((a, b) => (over ? a.total - b.total : a.round - b.round));
        box.append(el('h2', '', over ? 'Partie terminée' : 'Fin de la manche ' + G.round));
        let bestVal = Infinity;
        if (over) {
          bestVal = Math.min(...G.players.map((p) => p.total));
          const winners = G.players.filter((p) => p.total === bestVal).map((p) => p.name);
          box.append(el('div', 'big', '🏆'));
          box.append(el('div', 'winner', (winners.length > 1 ? 'Égalité : ' : 'Victoire de ') + winners.join(' & ') + ' avec ' + bestVal + ' 🐮'));
        } else if (G.target) {
          box.append(el('p', 'sub', 'La partie se termine quand un joueur atteint ' + G.target + ' 🐮.'));
        }
        const t = el('table', 'sum');
        const head = el('tr');
        head.append(el('th', '', 'Joueur'), el('th', '', 'Manche'));
        if (G.target) head.append(el('th', '', 'Total'));
        t.append(head);
        sorted.forEach((p) => {
          const tr = el('tr', over && p.total === bestVal ? 'win' : '');
          tr.append(el('td', '', (p.human ? '' : '🤖 ') + p.name), el('td', '', '+' + p.round));
          if (G.target) tr.append(el('td', '', p.total));
          t.append(tr);
        });
        box.append(t);
        const actions = el('div', 'actions');
        const main = el('button', 'btn primary', over ? 'Rejouer' : 'Manche suivante');
        main.addEventListener('click', () => { closeModal(); resolve(over ? 'again' : 'next'); });
        const menu = el('button', 'btn ghost', 'Menu');
        menu.addEventListener('click', () => { closeModal(); resolve('menu'); });
        actions.append(main, menu);
        box.append(actions);
      });
    });
  }

  /* ---------- Interactions de jeu ---------- */

  function zoneFor(p) {
    return p.seat === 'top' ? $('#zone-top') : $('#zone-bottom');
  }

  function clearHands() {
    $('#zone-top').innerHTML = '';
    $('#zone-bottom').innerHTML = '';
  }

  function drawPassiveHand() {
    const zone = $('#zone-bottom');
    zone.innerHTML = '';
    const me = G.players.find((p) => p.human);
    if (!me) return;
    zone.append(el('div', 'zlabel', 'Ta main'));
    const hand = el('div', 'hand');
    me.hand.forEach((n) => hand.append(cardEl(n, { dim: true })));
    zone.append(hand);
  }

  /** Demande à un humain de choisir sa carte. `face` : mains cachées par défaut (deux joueurs côte à côte). */
  function askPick(p, face) {
    return new Promise((resolve) => {
      const zone = zoneFor(p);
      let sel = null;
      let shown = !face;

      const commit = () => {
        if (sel == null) return;
        p.picked = sel;
        zone.innerHTML = '';
        if (face) zone.append(el('div', 'zlabel ready', p.name + ' · prêt ✓'));
        renderScores();
        resolve();
      };

      const draw = () => {
        zone.innerHTML = '';
        zone.append(el('div', 'zlabel', p.name + (shown ? ' · choisis une carte' : ' · main cachée')));
        const hand = el('div', 'hand');
        p.hand.forEach((n) => {
          if (shown) {
            const c = cardEl(n, { sel: n === sel });
            c.addEventListener('click', () => {
              if (sel === n) commit();
              else { sel = n; draw(); }
            });
            hand.append(c);
          } else {
            hand.append(backEl());
          }
        });
        zone.append(hand);
        const bar = el('div', 'zbar');
        if (face) {
          const tog = el('button', 'btn ghost', shown ? 'Masquer ma main' : 'Voir ma main');
          tog.addEventListener('click', () => { shown = !shown; if (!shown) sel = null; draw(); });
          bar.append(tog);
        }
        if (shown) {
          const ok = el('button', 'btn primary', sel != null ? 'Jouer le ' + sel : 'Touche une carte');
          ok.disabled = sel == null;
          ok.addEventListener('click', commit);
          bar.append(ok);
        }
        zone.append(bar);
      };
      draw();
    });
  }

  function askRow(p, card) {
    return new Promise((resolve) => {
      const zone = zoneFor(p);
      zone.innerHTML = '';
      zone.append(el('div', 'zlabel ready', p.name + ' : touche la rangée à ramasser'));
      renderBoard({
        select: (i) => {
          zone.innerHTML = '';
          renderBoard();
          resolve(i);
        },
      });
    });
  }

  /* ---------- Déroulement ---------- */

  async function playTurn(my) {
    const humans = G.players.filter((p) => p.human);
    const bots = G.players.filter((p) => !p.human);
    setStatus('Manche ' + G.round + ' · tour ' + (G.turn + 1) + '/10');
    renderAll();

    bots.forEach((b) => {
      b.picked = E.botPick(b.hand, G.rows, { others: G.players.length - 1, seen: G.seen });
    });

    const needPick = humans.filter((h) => {
      if (h.hand.length === 1) { h.picked = h.hand[0]; return false; }
      return true;
    });

    if (G.mode === 'face') {
      await A(my, Promise.all(needPick.map((h) => askPick(h, true))));
    } else {
      for (const h of needPick) {
        if (humans.length > 1) await A(my, handover(h));
        await A(my, askPick(h, false));
      }
    }

    clearHands();
    const order = G.players.slice().sort((a, b) => a.picked - b.picked);
    order.forEach((p) => p.hand.splice(p.hand.indexOf(p.picked), 1));
    if (G.mode === 'solo') drawPassiveHand();

    renderPlayed(order, -1);
    setStatus('Les cartes sont révélées !');
    await A(my, sleep(1000));

    for (let i = 0; i < order.length; i++) {
      const p = order[i];
      const card = p.picked;
      renderPlayed(order, i);

      const r = E.targetRow(G.rows, card);
      let chosen = null;
      let takeIdx = -1;
      if (r === -1) {
        if (p.human) {
          setStatus(p.name + ' : le ' + card + ' est plus petit que toutes les rangées', true);
          chosen = await A(my, askRow(p, card));
        } else {
          chosen = E.botRow(G.rows);
          setStatus(p.name + ' : le ' + card + ' est trop petit, il prend la rangée ' + (chosen + 1));
          await A(my, sleep(800));
        }
        takeIdx = chosen;
      } else if (G.rows[r].length >= E.ROW_MAX) {
        takeIdx = r;
      }

      if (takeIdx >= 0) {
        const row = G.rows[takeIdx];
        setStatus(p.name + ' ramasse ' + row.length + ' cartes : +' + E.rowHeads(row) + ' 🐮', true);
        renderBoard({ warn: takeIdx });
        await A(my, sleep(1100));
      }

      const res = E.place(G.rows, card, chosen);
      G.seen.add(card);
      p.round += res.penalty;
      renderBoard({ hl: { row: res.row, card } });
      renderScores();
      if (takeIdx < 0) setStatus(p.name + ' pose le ' + card);
      await A(my, sleep(res.penalty ? 800 : 700));
    }

    renderPlayed(null);
    await A(my, sleep(300));
  }

  async function endRound(my) {
    G.players.forEach((p) => { p.total += p.round; });
    const over = G.target === 0 || G.players.some((p) => p.total >= G.target);
    renderAll();
    setStatus(over ? 'Partie terminée' : 'Fin de la manche ' + G.round);
    if (over) removeKey(LS_SAVE);
    const act = await A(my, summaryModal(over));
    if (act === 'menu') {
      runId++;
      if (over) {
        G = null;
        clearHands();
        renderAll();
        setStatus('');
      }
      showMenu();
      throw ABORT;
    }
    return act;
  }

  async function run(my) {
    try {
      for (;;) {
        while (G.turn < 10) {
          G.players.forEach((p) => { p.picked = null; });
          saveGame();
          await playTurn(my);
          G.turn++;
        }
        const act = await endRound(my);
        if (act === 'again') G = newGame();
        else G.round++;
        deal();
      }
    } catch (e) {
      if (e !== ABORT) {
        console.error(e);
        setStatus('Oups, une erreur est survenue. Ouvre le menu pour relancer.', true);
      }
    }
  }

  function startGame(saved) {
    runId++;
    const my = runId;
    closeModal();
    clearHands();
    if (saved) {
      G = hydrate(saved);
    } else {
      G = newGame();
      deal();
    }
    run(my);
  }

  /* ---------- Démarrage ---------- */

  window.addEventListener('DOMContentLoaded', () => {
    $('#btn-menu').addEventListener('click', showMenu);
    showMenu();
    if ('serviceWorker' in navigator && location.protocol.indexOf('http') === 0) {
      navigator.serviceWorker.register('sw.js').catch(() => { /* hors ligne non dispo */ });
    }
  });
})();
