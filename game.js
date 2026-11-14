/* 6 qui prend — interface et déroulement de la partie.
   Un « plateau » (iPad en affichage seul) peut se brancher sur une partie en ligne : les téléphones cachent alors la table commune. */
(function () {
  'use strict';

  const E = window.Engine;
  const ABORT = { aborted: true };
  const LS_SETTINGS = '6qp.settings.v1';
  const LS_SAVE = '6qp.save.v1';
  const LS_ONLINE = '6qp.online.v1';
  const APP_VERSION = '7';
  const EL = window.EnLigne;
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
    mode: 'solo', // solo | online
    humans: 2,
    names: ['Joueur 1', 'Joueur 2', 'Joueur 3', 'Joueur 4'],
    bots: 3,
    target: 66, // 0 = une seule manche
    fast: false,
  };
  let settings = Object.assign({}, DEFAULTS, readJSON(LS_SETTINGS) || {});
  if (settings.mode !== 'solo' && settings.mode !== 'online') settings.mode = 'online'; // anciens modes passe-passe / face à face
  settings.names = DEFAULTS.names.map((d, i) => (settings.names && settings.names[i]) || d);

  /* ---------- État ---------- */

  let G = null; // partie en cours
  let runId = 0; // sert à abandonner une boucle de jeu devenue obsolète

  function sleep(ms) {
    const k = window.QP_SPEED != null ? window.QP_SPEED : (settings.fast ? 0.4 : 1);
    return new Promise((r) => setTimeout(r, ms * k));
  }

  /** Attend une promesse et abandonne si une autre partie a pris le relais. */
  async function A(my, p) {
    const v = await p;
    if (my !== runId) throw ABORT;
    return v;
  }

  function newGame() {
    const mode = 'solo';
    const nh = 1;
    const players = [];
    let id = 0;
    for (let i = 0; i < nh; i++) {
      players.push({
        id: id++,
        name: (settings.names[i] || '').trim() || 'Joueur ' + (i + 1),
        human: true,
        seat: 'bottom',
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
    if (!G || G.mode === 'online') return;
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
      const chip = el('div', 'chip' + ((G.mode === 'online' ? G.phase === 'pick' && p.picked != null : false) ? ' ready' : ''));
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
    online: 'À deux, chacun sur son appareil (iPhone, iPad, téléphone Android…). Les robots peuvent compléter la table.',
  };

  function showMenu() {
    const m = JSON.parse(JSON.stringify(settings));
    const sv = readJSON(LS_SAVE);
    let olError = '';
    modal((box) => {
      const build = () => {
        box.innerHTML = '';
        const online = m.mode === 'online';
        const minB = online ? 0 : 1;
        const maxB = online ? 8 : 9;
        m.bots = Math.max(minB, Math.min(maxB, m.bots));

        box.append(el('h1', 'title', '6 qui prend'));
        box.append(el('p', 'sub', 'Évite de ramasser les têtes de bœuf !'));

        const modeField = seg('Mode de jeu',
          [['solo', 'Contre l’ordi'], ['online', 'En ligne']],
          m.mode, (v) => { m.mode = v; olError = ''; build(); });
        modeField.append(el('div', 'hint', MODE_HINTS[m.mode]));
        box.append(modeField);

        if (online && !EL.connecte()) {
          const f = el('div', 'field');
          f.append(el('div', 'lbl', 'Compte pour jouer en ligne'));
          const em = el('input'); em.type = 'email'; em.placeholder = 'E-mail du compte'; em.autocomplete = 'username'; em.autocapitalize = 'none'; em.id = 'ol-email';
          const pw = el('input'); pw.type = 'password'; pw.placeholder = 'Mot de passe'; pw.autocomplete = 'current-password'; pw.id = 'ol-pwd';
          const go = el('button', 'btn primary', 'Se connecter'); go.id = 'ol-login';
          go.addEventListener('click', () => {
            olError = '';
            EL.login(em.value.trim(), pw.value).then(() => build()).catch((e) => {
              olError = e.kind === 'bad' ? 'E-mail ou mot de passe refusé.' : e.kind === 'reseau' ? 'Pas de réseau.' : 'Erreur : ' + e.message;
              build();
            });
          });
          f.append(em, pw, go);
          box.append(f);
          if (olError) box.append(el('p', 'olerr', olError));
          return;
        }

        const names = el('div', 'field');
        names.append(el('div', 'lbl', 'Prénom'));
        const inp = el('input');
        inp.type = 'text'; inp.maxLength = 14; inp.value = m.names[0]; inp.placeholder = 'Joueur 1'; inp.autocomplete = 'off'; inp.id = 'ol-name';
        inp.addEventListener('input', () => { m.names[0] = inp.value; });
        names.append(inp);
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
        const play = el('button', 'btn primary', online ? 'Créer une partie en ligne' : 'Nouvelle partie');
        play.id = 'btn-new';
        play.addEventListener('click', () => {
          settings = Object.assign({}, settings, m);
          writeJSON(LS_SETTINGS, settings);
          if (online) onlineCreate(); else startGame(null);
        });
        actions.append(play);
        if (!online && sv && sv.players && sv.mode === 'solo') {
          const resume = el('button', 'btn', 'Reprendre la partie (manche ' + sv.round + ', tour ' + (sv.turn + 1) + ')');
          resume.addEventListener('click', () => startGame(sv));
          actions.append(resume);
        }
        box.append(actions);

        if (online) {
          const jf = el('div', 'field');
          jf.append(el('div', 'lbl', 'Rejoindre une partie'));
          const row = el('div', 'olrow');
          const code = el('input'); code.maxLength = 4; code.placeholder = 'Code'; code.autocapitalize = 'characters'; code.autocomplete = 'off'; code.id = 'ol-code';
          const jb = el('button', 'btn', 'Rejoindre'); jb.id = 'ol-join';
          jb.addEventListener('click', () => {
            settings = Object.assign({}, settings, m); writeJSON(LS_SETTINGS, settings);
            onlineJoin(code.value);
          });
          row.append(code, jb);
          jf.append(row);
          const pb = el('button', 'linkbtn', 'Ouvrir comme plateau (affichage seul, sans jouer)'); pb.id = 'ol-plateau';
          pb.addEventListener('click', () => plateauStart(code.value));
          jf.append(pb);
          box.append(jf);
          const lf = el('div', 'field');
          lf.append(el('div', 'lbl', 'Parties en cours'));
          const list = el('div', 'ollist'); list.id = 'ol-list';
          lf.append(list);
          box.append(lf);
          EL.liste('6quiprend').then((a) => {
            if (!a.length) { list.append(el('div', 'hint', 'Aucune pour l’instant.')); return; }
            a.forEach((r) => {
              const it = el('div', 'olitem');
              const t = el('div', 't'); t.append(el('b', '', r.id), el('small', '', r.titre || ''));
              const rs = el('button', '', 'Reprendre'); rs.dataset.ol = 'resume';
              rs.addEventListener('click', () => onlineResume(r.id));
              const del = el('button', '', '✕'); del.dataset.ol = 'del'; del.setAttribute('aria-label', 'Supprimer la partie ' + r.id);
              del.addEventListener('click', () => {
                if (confirm('Supprimer la partie ' + r.id + ' pour les deux joueurs ?')) EL.supprimer(r.id).then(() => build()).catch(() => {});
              });
              it.append(t, rs, del);
              list.append(it);
            });
          }).catch((e) => { list.append(el('div', 'olerr', e.kind === 'reseau' ? 'Pas de réseau.' : 'Erreur : ' + e.message)); });
          const who = el('div', 'hint');
          who.append('Connecté : ' + EL.email() + ' ');
          const lo = el('button', 'linkbtn', 'Se déconnecter'); lo.id = 'ol-logout';
          lo.addEventListener('click', () => { EL.logout(); build(); });
          who.append(lo);
          box.append(who);
          if (olError) box.append(el('p', 'olerr', olError));
        }

        const more = el('div', 'actions');
        const rules = el('button', 'btn ghost', 'Règles du jeu');
        rules.addEventListener('click', () => showRules());
        more.append(rules);
        if (G) {
          if (G.mode === 'online') {
            const quit = el('button', 'btn ghost', 'Quitter la partie en ligne (elle reste ouverte)'); quit.id = 'btn-quit';
            quit.addEventListener('click', goHome);
            more.append(quit);
          }
          const close = el('button', 'btn ghost', 'Fermer');
          close.addEventListener('click', closeModal);
          more.append(close);
        }
        box.append(more);
        box.append(el('p', 'ver', 'Version ' + APP_VERSION));
      };
      build();
      showMenu.setError = (t) => { olError = t; build(); };
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

  function summaryBody(box, over) {
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
  }

  function summaryModal(over) {
    return new Promise((resolve) => {
      modal((box) => {
        summaryBody(box, over);
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

    for (const h of needPick) await A(my, askPick(h, false));

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
    onlineStop();
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


  /* ---------- En ligne ---------- */

  let ONL = null; // { id, me, version, dirty, pushing, busy, ops[], status, watch, retry, looping, plat }
  let PL = null;  // plateau (affichage seul) : { id, version, watch, rowId, rowVer, timer, t2, busy }
  let pickSel = null;
  let modalKey = '';

  function wireOf(g) { return JSON.parse(JSON.stringify(Object.assign({}, g, { seen: Array.from(g.seen) }))); }
  function unwire(g) { g.seen = new Set(g.seen); return g; }
  function titre(g) {
    g = g || G;
    return g.players.filter((p) => p.human && p.name !== '…').map((p) => p.name).join(' et ') + ' · ' + (g.online.joined ? 'manche ' + g.round : 'en attente') + (g.phase === 'over' ? ' (terminée)' : '');
  }
  function getMap() { return readJSON(LS_ONLINE) || {}; }
  function setMap(id, me) { const m = getMap(); m[id] = me; writeJSON(LS_ONLINE, m); }
  function seatFor(id, g) {
    const m = getMap();
    let me = m[id];
    if (me == null && g.online) { const k = g.online.uids.indexOf(EL.uid()); if (k >= 0) me = k; }
    return me;
  }
  function notice(text) { if (showMenu.setError) showMenu.setError(text); }

  function onlineStart(id, me, version) {
    onlineStop();
    runId++;
    ONL = { id, me, version, dirty: false, pushing: false, busy: false, ops: [], status: 'ok', watch: null, retry: null, looping: false };
    setMap(id, me);
    ONL.watch = EL.surveiller(id, () => (ONL ? ONL.version : 0), onRemote, onStatus);
    platWatch(ONL);
  }
  function onlineStop() {
    if (ONL) { if (ONL.watch) ONL.watch.stop(); clearTimeout(ONL.retry); if (ONL.plat) { ONL.plat.stopped = true; clearTimeout(ONL.plat.timer); } }
    ONL = null; modalKey = '';
    const b = $('#offbar'); if (b) b.hidden = true;
    const a = $('#app'); if (a) a.classList.remove('notable');
  }
  function goHome(msg) {
    plStop();
    onlineStop();
    G = null; pickSel = null;
    clearHands(); closeModal(); renderAll(); setStatus('');
    showMenu();
    if (msg) notice(msg);
  }
  function onStatus(st) {
    if (!ONL) return;
    ONL.status = st;
    $('#offbar').hidden = st !== 'hors-ligne';
    if (st === 'supprimee') { goHome('Cette partie a été supprimée.'); return; }
    if (st === 'auth') { goHome('Session expirée : reconnecte-toi.'); return; }
    if (st === 'ok') { if (ONL.dirty && !ONL.pushing) flush(); if (ONL.ops.length && !ONL.busy) guestFlush(); }
  }

  /* L'hôte (siège 0) possède l'état : il le publie en entier. L'invité n'envoie que des « actions » (sa carte, son choix de rangée, « manche suivante », son arrivée). */
  function applyOps(s, ops) {
    ops.forEach((op) => {
      if (op.k === 'pick') {
        const p = s.players[op.pid];
        if (s.phase === 'pick' && p && p.picked == null && p.hand.indexOf(op.card) >= 0) p.picked = op.card;
      } else if (op.k === 'answer') {
        if (s.phase === 'ask' && s.ask && s.ask.pid === op.pid && s.answer == null) s.answer = op.row;
      } else if (op.k === 'next') {
        if ((s.phase === 'roundend' || s.phase === 'over') && !s.next) s.next = op.act;
      } else if (op.k === 'join') {
        if (!s.online.joined) { s.players[1].name = op.name; s.online.uids[1] = op.uid; s.online.joined = true; }
      }
    });
  }

  function publish() {     // hôte : affiche tout de suite, puis envoie
    if (!ONL) return;
    onlineRender();
    ONL.dirty = true;
    flush();
  }
  function flush() {
    const o = ONL;
    if (!o || o.pushing || !o.dirty) return;
    o.pushing = true; o.dirty = false;
    EL.ecrire(o.id, o.version, wireOf(G), titre()).then((nv) => {
      if (ONL !== o) return;
      o.pushing = false;
      if (nv) { o.version = nv; if (o.status === 'hors-ligne') onStatus('ok'); if (o.dirty) flush(); return; }
      return EL.lire(o.id).then((row) => {      // un invité a écrit avant nous : on garde ses champs et on renvoie
        if (ONL !== o || !row) return;
        o.version = row.version;
        absorb(unwire(row.etat));
        o.dirty = true; flush();
      });
    }).catch((e) => {
      if (ONL !== o) return;
      o.pushing = false; o.dirty = true;
      onStatus(e && e.kind === 'reseau' ? 'hors-ligne' : 'erreur');
      if (e && e.kind === 'auth') return;
      clearTimeout(o.retry);
      o.retry = setTimeout(() => { if (ONL === o) flush(); }, 2000);
    });
  }
  function absorb(r) {     // hôte : reprend ce que l'invité a écrit
    if (G.phase === 'pick' && r.phase === 'pick') {
      G.players.forEach((p, i) => { if (p.human && i !== 0 && p.picked == null && r.players[i].picked != null) p.picked = r.players[i].picked; });
    }
    if (G.phase === 'ask' && r.phase === 'ask' && r.answer != null && G.answer == null) G.answer = r.answer;
    if ((G.phase === 'roundend' || G.phase === 'over') && r.next && !G.next) G.next = r.next;
    if (!G.online.joined && r.online.joined) { G.online = r.online; G.players[1].name = r.players[1].name; }
  }

  function guestOp(op) {
    ONL.ops.push(op);
    applyOps(G, [op]);          // effet immédiat à l'écran
    onlineRender();
    guestFlush();
  }
  function guestFlush() {
    const o = ONL;
    if (!o || o.busy || !o.ops.length) return;
    o.busy = true;
    EL.lire(o.id).then((row) => {
      if (ONL !== o) return;
      if (!row) throw { kind: 'gone' };
      const s = unwire(row.etat), ops = o.ops.slice();
      applyOps(s, ops);
      return EL.ecrire(o.id, row.version, wireOf(s), titre(s)).then((nv) => {
        if (ONL !== o) return;
        o.busy = false;
        if (!nv) { guestFlush(); return; }        // conflit : on relit et on recommence
        o.ops = o.ops.filter((x) => ops.indexOf(x) < 0);
        o.version = nv; G = s;
        if (o.status === 'hors-ligne') onStatus('ok');
        if (G.online.uids.indexOf(EL.uid()) < 0) { goHome('Cette partie a déjà ses deux joueurs.'); return; }
        onlineShow();
        if (o.ops.length) guestFlush();
      });
    }).catch((e) => {
      if (ONL !== o) return;
      o.busy = false;
      if (e && e.kind === 'gone') { goHome('Cette partie a été supprimée.'); return; }
      onStatus(e && e.kind === 'reseau' ? 'hors-ligne' : 'erreur');
      if (e && e.kind === 'auth') return;
      clearTimeout(o.retry);
      o.retry = setTimeout(() => { if (ONL === o) guestFlush(); }, 2000);
    });
  }

  function onRemote() {
    const o = ONL;
    if (!o || o.pushing || o.dirty || o.busy || o.ops.length) return;
    return EL.lire(o.id).then((row) => {
      if (ONL !== o || !row || row.version <= o.version || o.pushing || o.dirty || o.busy || o.ops.length) return;
      o.version = row.version;
      const r = unwire(row.etat);
      if (o.me === 0) { absorb(r); onlineShow(); }
      else { G = r; onlineShow(); }
    });
  }

  function newOnlineState(g) {
    g.players.forEach((p) => { p.total = 0; p.round = 0; p.picked = null; });
    g.round = 1;
  }

  function onlineCreate() {
    runId++;
    const nm = (settings.names[0] || '').trim() || 'Joueur 1';
    const players = [
      { id: 0, name: nm, human: true, seat: 'bottom', hand: [], total: 0, round: 0, picked: null },
      { id: 1, name: '…', human: true, seat: 'bottom', hand: [], total: 0, round: 0, picked: null },
    ];
    const nb = Math.max(0, Math.min(settings.bots, 8));
    for (let i = 0; i < nb; i++) players.push({ id: 2 + i, name: BOT_NAMES[i], human: false, seat: 'bottom', hand: [], total: 0, round: 0, picked: null });
    G = { mode: 'online', target: settings.target, round: 1, turn: 0, players, rows: [], seen: new Set(),
      phase: 'pick', cue: null, ask: null, answer: null, next: null, online: { uids: [EL.uid(), null], joined: false } };
    deal();
    const g = G;
    EL.creer('6quiprend', wireOf(g), nm + ' · en attente').then((r) => {
      if (G !== g) return;
      onlineStart(r.id, 0, r.version);
      onlineShow();
    }).catch((e) => { G = null; showMenu(); notice(e.kind === 'reseau' ? 'Pas de réseau.' : e.kind === 'auth' ? 'Session expirée : reconnecte-toi.' : 'Erreur : ' + e.message); });
  }
  function onlineJoin(code) {
    code = (code || '').trim().toUpperCase();
    if (code.length !== 4) { notice('Le code a 4 lettres.'); return; }
    EL.lire(code).then((row) => {
      if (!row || row.jeu !== '6quiprend') { notice('Code inconnu.'); return; }
      const g = unwire(row.etat), me = seatFor(code, g);
      if (me != null && (g.online.joined || me === 0)) { G = g; onlineStart(code, me, row.version); closeModal(); onlineShow(); return; }
      if (g.online.joined) { notice('Cette partie a déjà ses deux joueurs.'); return; }
      let nm = (settings.names[0] || '').trim() || 'Joueur 2';
      if (nm === g.players[0].name) nm += ' (2)';
      G = g; onlineStart(code, 1, row.version);
      guestOp({ k: 'join', name: nm, uid: EL.uid() });
      closeModal();
    }).catch((e) => notice(e.kind === 'reseau' ? 'Pas de réseau.' : e.kind === 'auth' ? 'Session expirée : reconnecte-toi.' : 'Erreur : ' + e.message));
  }
  function onlineResume(id) {
    EL.lire(id).then((row) => {
      if (!row) { notice('Partie introuvable.'); return; }
      const g = unwire(row.etat), me = seatFor(id, g);
      G = g; onlineStart(row.id, me != null ? me : 0, row.version); closeModal(); onlineShow();
    }).catch((e) => notice('Erreur : ' + (e.message || 'inconnue')));
  }

  function onlineShow() {
    if (!G.online.joined) {
      const key = 'wait';
      if (modalKey !== key) {
        modalKey = key;
        modal((box) => {
          box.append(el('div', 'big', '⏳'));
          const h = el('h2', '', 'Partie '); const c = el('span', '', ONL.id); c.id = 'wait-code'; h.append(c);
          box.append(h);
          box.append(el('p', 'sub', 'Demande à l’autre joueur de choisir « En ligne », puis « Rejoindre », et de taper ce code.'));
          box.append(el('p', 'sub', 'En attente de l’autre joueur…'));
          const actions = el('div', 'actions');
          const home = el('button', 'btn ghost', 'Revenir au menu (la partie reste ouverte)'); home.id = 'wait-home';
          home.addEventListener('click', () => goHome());
          const cancel = el('button', 'btn ghost', 'Annuler la partie'); cancel.id = 'wait-cancel';
          cancel.addEventListener('click', () => { const id = ONL && ONL.id; goHome(); if (id && confirm('Supprimer la partie ' + id + ' ?')) EL.supprimer(id).catch(() => {}); });
          actions.append(cancel, home);
          box.append(actions);
        });
      }
      renderAll();
      return;
    }
    if (modalKey === 'wait') { closeModal(); modalKey = ''; }
    onlineRender();
    if (ONL.me === 0 && !ONL.looping) { ONL.looping = true; hostRun(ONL); }
  }

  function commitPick(card) {
    pickSel = null;
    if (ONL.me === 0) { G.players[0].picked = card; publish(); }
    else guestOp({ k: 'pick', pid: ONL.me, card });
  }
  function answerRow(i) {
    if (ONL.me === 0) { G.answer = i; publish(); }
    else guestOp({ k: 'answer', pid: ONL.me, row: i });
  }
  function nextAct(act) {
    if (act === 'menu') { goHome(); return; }
    if (ONL.me === 0) { G.next = act; publish(); }
    else guestOp({ k: 'next', act });
  }

  function rowButtons() {
    const box = el('div', 'rowbtns');
    G.rows.forEach((row, i) => {
      const b = el('button', 'btn rowbtn', 'Rangée ' + (i + 1) + ' · ' + row.length + (row.length > 1 ? ' cartes' : ' carte') + ' · ' + E.rowHeads(row) + ' 🐮');
      b.dataset.row = i;
      b.addEventListener('click', () => answerRow(i));
      box.append(b);
    });
    return box;
  }

  function onlineRender() {
    if (!G || !ONL) return;
    const me = ONL.me, mine = G.players[me], cue = G.cue || {};
    const asking = G.phase === 'ask' && G.ask && G.ask.pid === me;
    const nt = noTable(), plOn = platOn();
    $('#app').classList.toggle('notable', nt);
    renderScores();
    renderBoard({ hl: cue.hl, warn: cue.warn, select: asking ? answerRow : null });
    renderPlayed(cue.order ? cue.order.map((id) => G.players[id]) : null, cue.active != null ? cue.active : -1);
    clearHands();
    const zone = $('#zone-bottom');
    let status = cue.status || '';
    if (G.phase === 'pick') {
      status = 'Manche ' + G.round + ' · tour ' + (G.turn + 1) + '/10';
      if (mine.picked == null && mine.hand.length > 1) {
        status += ' · choisis une carte';
        zone.append(el('div', 'zlabel', mine.name + ' · choisis une carte'));
        const hand = el('div', 'hand');
        mine.hand.forEach((n) => {
          const c = cardEl(n, { sel: n === pickSel });
          c.addEventListener('click', () => { if (pickSel === n) commitPick(n); else { pickSel = n; onlineRender(); } });
          hand.append(c);
        });
        zone.append(hand);
        const bar = el('div', 'zbar');
        const ok = el('button', 'btn primary', pickSel != null ? 'Jouer le ' + pickSel : 'Touche une carte');
        ok.id = 'pick-ok'; ok.disabled = pickSel == null;
        ok.addEventListener('click', () => { if (pickSel != null) commitPick(pickSel); });
        bar.append(ok);
        zone.append(bar);
      } else {
        const waiting = G.players.filter((p) => p.human && p.picked == null && p.id !== me).map((p) => p.name);
        status += mine.picked != null ? ' · ta carte est choisie' + (waiting.length ? ', on attend ' + waiting.join(' & ') : '') : '';
        if (mine.hand.length === 1) status += ' · dernière carte jouée automatiquement';
        zone.append(el('div', 'zlabel ready', mine.name + ' · prêt ✓'));
      }
    } else {
      if (mine.hand.length) {
        zone.append(el('div', 'zlabel', 'Ta main'));
        const hand = el('div', 'hand');
        mine.hand.forEach((n) => hand.append(cardEl(n, { dim: true })));
        zone.append(hand);
      }
      if (asking) status = mine.name + ' : touche la rangée à ramasser (le ' + G.ask.card + ' est trop petit)';
      if (asking && nt) zone.append(rowButtons());     // table cachée : on choisit la rangée avec des boutons
    }
    if (plOn) {
      const tb = el('button', 'btn ghost small', nt ? 'Afficher la table' : 'Masquer la table'); tb.id = 'btn-table';
      tb.addEventListener('click', () => { if (ONL && ONL.plat) { ONL.plat.override = !ONL.plat.override; onlineRender(); } });
      zone.append(tb);
    }
    setStatus(status, !!cue.alert || asking);
    // fenêtre de fin de manche
    if (G.phase === 'roundend' || G.phase === 'over') {
      const key = G.phase + G.round;
      if (modalKey !== key) {
        modalKey = key;
        const over = G.phase === 'over';
        modal((box) => {
          summaryBody(box, over);
          const actions = el('div', 'actions');
          const main = el('button', 'btn primary', over ? 'Rejouer' : 'Manche suivante'); main.id = 'sum-next';
          main.addEventListener('click', () => { main.disabled = true; nextAct(over ? 'again' : 'next'); });
          const menu = el('button', 'btn ghost', 'Quitter vers le menu'); menu.id = 'sum-menu';
          menu.addEventListener('click', () => nextAct('menu'));
          actions.append(main, menu);
          box.append(actions);
        });
      }
    } else if (modalKey && modalKey !== 'wait') { closeModal(); modalKey = ''; }
  }

  /* ---------- Plateau : détection côté téléphone ---------- */
  // Le plateau écrit régulièrement dans sa propre ligne (jeu « plateau », titre = code de la partie) : la ligne de la partie n'est
  // jamais touchée. Le téléphone cache la table tant que cette ligne change (< 30 s) et la réaffiche seul si le plateau disparaît.
  // Au 1er passage on note seulement la version : un reste d'une séance précédente ne compte pas. Pas de comparaison d'horloges.
  const platPoll = () => (window.PLATEAU_POLL != null ? window.PLATEAU_POLL : 5000);
  const platFresh = () => (window.PLATEAU_FRESH != null ? window.PLATEAU_FRESH : 30000);
  const platBeatMs = () => (window.PLATEAU_BEAT != null ? window.PLATEAU_BEAT : 10000);
  function platOn() { return !!(ONL && ONL.plat && ONL.plat.present); }
  function noTable() { return platOn() && !ONL.plat.override; }
  function platWatch(o) {
    const P = o.plat = { present: false, override: false, ver: null, seen: 0, timer: null, stopped: false };
    const next = () => { if (ONL === o && !P.stopped) P.timer = setTimeout(tick, platPoll()); };
    function tick() {
      if (ONL !== o || P.stopped) return;
      clearTimeout(P.timer);
      if (document.hidden || !G || !G.online || !G.online.joined) { next(); return; }
      EL.liste('plateau').then((rows) => {
        if (ONL !== o || P.stopped) return;
        const r = rows.find((x) => x.titre === o.id) || null, now = Date.now();
        if (!r) { P.ver = null; P.seen = 0; }
        else if (P.ver == null) P.ver = r.version;
        else if (r.version !== P.ver) { P.ver = r.version; P.seen = now; }
        const pres = !!r && P.seen > 0 && now - P.seen < platFresh();
        if (pres !== P.present) { P.present = pres; if (!pres) P.override = false; if (G) onlineRender(); }
      }).catch(() => { /* réseau : on garde l'état connu */ }).then(next);
    }
    tick();
  }

  /* ---------- Plateau : affichage seul (iPad commun) ---------- */
  const OFF_TXT = $('#offbar') ? $('#offbar').textContent : '';
  function plStop() {
    const o = PL; if (!o) return;
    if (o.watch) o.watch.stop();
    clearInterval(o.timer); clearTimeout(o.t2);
    if (o.rowId) EL.supprimer(o.rowId).catch(() => { /* la ligne vieillira toute seule */ });
    PL = null;
    document.body.classList.remove('plateau');
    const b = $('#offbar'); if (b) { b.hidden = true; b.textContent = OFF_TXT; }
  }
  function plBeat() {
    const o = PL; if (!o || o.busy) return;
    o.busy = true;
    const data = { code: o.id, t: Date.now() };
    let p;
    if (o.rowId) {
      p = EL.ecrire(o.rowId, o.rowVer, data, o.id).then((nv) => {
        if (nv) { o.rowVer = nv; return null; }
        return EL.lire(o.rowId).then((row) => { if (row) o.rowVer = row.version; else o.rowId = null; });
      });
    } else {
      p = EL.liste('plateau').then((rows) => {
        const r = rows.find((x) => x.titre === o.id);
        if (r) { o.rowId = r.id; o.rowVer = r.version; return null; }
        return EL.creer('plateau', data, o.id).then((x) => { o.rowId = x.id; o.rowVer = x.version; });
      });
    }
    p.catch(() => { /* hors ligne : le prochain battement réessaiera */ }).then(() => {
      o.busy = false;
      if (PL !== o && o.rowId) EL.supprimer(o.rowId).catch(() => {});
    });
  }
  function plRender() {
    if (!G || !PL) return;
    const cue = G.cue || {};
    clearHands();
    renderScores();
    if (!G.online.joined) {
      $('#board').innerHTML = ''; renderPlayed(null);
      setStatus('Plateau ' + PL.id + ' · en attente des joueurs…');
      return;
    }
    renderBoard({ hl: cue.hl, warn: cue.warn });
    renderPlayed(cue.order ? cue.order.map((id) => G.players[id]) : null, cue.active != null ? cue.active : -1);
    let status = cue.status || '', alert = !!cue.alert;
    if (G.phase === 'pick') {
      const waiting = G.players.filter((p) => p.picked == null).map((p) => p.name);
      status = 'Manche ' + G.round + ' · tour ' + (G.turn + 1) + '/10 · ' + (waiting.length ? 'on attend ' + waiting.join(' & ') : 'tout le monde est prêt');
      alert = false;
    } else if (G.phase === 'ask' && G.ask) {
      status = G.players[G.ask.pid].name + ' : le ' + G.ask.card + ' est plus petit que toutes les rangées, il choisit celle à ramasser';
      alert = true;
    }
    setStatus(status, alert);
    if (G.phase === 'roundend' || G.phase === 'over') {
      const key = 'pl-' + G.phase + G.round;
      if (modalKey !== key) { modalKey = key; modal((box) => summaryBody(box, G.phase === 'over')); }
    } else if (modalKey && modalKey !== 'plmenu') { closeModal(); modalKey = ''; }
  }
  function plRemote() {
    const o = PL; if (!o) return;
    return EL.lire(o.id).then((row) => {
      if (PL !== o || !row || row.version <= o.version) return;
      G = unwire(row.etat); o.version = row.version; plRender();
    });
  }
  function plStatus(st) {
    if (!PL) return;
    if (st === 'supprimee') { goHome('Cette partie a été supprimée.'); return; }
    if (st === 'auth') { goHome('Session expirée : reconnecte-toi.'); return; }
    const b = $('#offbar');
    b.textContent = 'Hors ligne : le plateau se remettra à jour au retour du réseau';
    b.hidden = st !== 'hors-ligne';
  }
  function plateauStart(code) {
    code = (code || '').trim().toUpperCase();
    if (code.length !== 4) { notice('Le code a 4 lettres.'); return; }
    EL.lire(code).then((row) => {
      if (!row || row.jeu !== '6quiprend') { notice('Code inconnu.'); return; }
      onlineStop(); plStop(); runId++;
      G = unwire(row.etat); pickSel = null;
      const o = PL = { id: code, version: row.version, watch: null, rowId: null, rowVer: 0, timer: null, t2: null, busy: false };
      document.body.classList.add('plateau');
      closeModal(); modalKey = '';
      plRender();
      o.watch = EL.surveiller(code, () => (PL ? PL.version : 0), plRemote, plStatus);
      plBeat();
      o.t2 = setTimeout(plBeat, 1500);
      o.timer = setInterval(plBeat, platBeatMs());
    }).catch((e) => notice(e.kind === 'reseau' ? 'Pas de réseau.' : e.kind === 'auth' ? 'Session expirée : reconnecte-toi.' : 'Erreur : ' + e.message));
  }
  function plMenu() {
    modalKey = 'plmenu';
    modal((box) => {
      box.append(el('h2', '', 'Plateau · ' + PL.id));
      box.append(el('p', 'sub', 'Affichage seul : personne ne joue sur le plateau.'));
      const actions = el('div', 'actions');
      const quit = el('button', 'btn primary', 'Quitter le plateau'); quit.id = 'pl-quit';
      quit.addEventListener('click', () => goHome());
      const close = el('button', 'btn ghost', 'Fermer'); close.addEventListener('click', () => { closeModal(); modalKey = ''; if (PL) plRender(); });
      actions.append(quit, close);
      box.append(actions);
    });
  }

  async function hostRun(o) {
    const alive = () => ONL === o;
    const wait = async (cond) => { while (alive() && !cond()) await new Promise((r) => setTimeout(r, 60)); if (!alive()) throw ABORT; };
    const nap = async (ms) => { await sleep(ms); if (!alive()) throw ABORT; };
    const hands = () => G.players.every((p) => p.picked != null);
    try {
      for (;;) {
        while (G.turn < 10) {
          if (G.phase === 'pick') {
            G.players.forEach((p) => {
              if (p.picked != null) return;
              if (!p.human) p.picked = E.botPick(p.hand, G.rows, { others: G.players.length - 1, seen: G.seen });
              else if (p.hand.length === 1) p.picked = p.hand[0];
            });
            G.cue = null;
            publish();
            await wait(hands);
            const order = G.players.slice().sort((a, b) => a.picked - b.picked);
            G.phase = 'reveal';
            G.cue = { status: 'Les cartes sont révélées !', order: order.map((p) => p.id), done: 0, active: -1 };
            publish();
            await nap(1000);
          }
          const ids = G.cue.order, order = ids.map((id) => G.players[id]);
          for (let i = G.cue.done; i < order.length; i++) {
            const p = order[i], card = p.picked;
            const base = { order: ids, done: i, active: i };
            const r = E.targetRow(G.rows, card);
            let chosen = null, takeIdx = -1;
            if (r === -1) {
              if (p.human) {
                G.phase = 'ask'; G.ask = { pid: p.id, card }; G.answer = null;
                G.cue = Object.assign({}, base, { status: p.name + ' : le ' + card + ' est plus petit que toutes les rangées', alert: true });
                publish();
                await wait(() => G.answer != null);
                chosen = G.answer; G.answer = null; G.ask = null; G.phase = 'reveal';
              } else {
                chosen = E.botRow(G.rows);
                G.cue = Object.assign({}, base, { status: p.name + ' : le ' + card + ' est trop petit, il prend la rangée ' + (chosen + 1) });
                publish();
                await nap(800);
              }
              takeIdx = chosen;
            } else if (G.rows[r].length >= E.ROW_MAX) {
              takeIdx = r;
            }
            let status = '';
            if (takeIdx >= 0) {
              const row = G.rows[takeIdx];
              status = p.name + ' ramasse ' + row.length + ' cartes : +' + E.rowHeads(row) + ' 🐮';
              G.cue = Object.assign({}, base, { status, alert: true, warn: takeIdx });
              publish();
              await nap(1100);
            }
            const res = E.place(G.rows, card, chosen);
            G.seen.add(card);
            p.round += res.penalty;
            G.cue = { order: ids, done: i + 1, active: i, hl: { row: res.row, card }, status: takeIdx < 0 ? p.name + ' pose le ' + card : status, alert: takeIdx >= 0 };
            publish();
            await nap(res.penalty ? 800 : 700);
          }
          G.players.forEach((p) => { p.hand.splice(p.hand.indexOf(p.picked), 1); p.picked = null; });
          G.turn++; G.phase = 'pick'; G.cue = null;
          publish();
        }
        G.players.forEach((p) => { p.total += p.round; });
        const over = G.target === 0 || G.players.some((p) => p.total >= G.target);
        G.phase = over ? 'over' : 'roundend'; G.next = null;
        publish();
        await wait(() => G.next);
        const act = G.next; G.next = null;
        if (act === 'again') newOnlineState(G); else G.round++;
        deal();
        G.phase = 'pick'; G.cue = null;
        publish();
      }
    } catch (e) {
      if (e !== ABORT) console.error(e);
    }
  }

  window.addEventListener('offline', () => { if (ONL) onStatus('hors-ligne'); });
  window.addEventListener('online', () => { if (ONL && ONL.watch) ONL.watch.poke(); });

  /* ---------- Démarrage ---------- */

  window.addEventListener('DOMContentLoaded', () => {
    $('#btn-menu').addEventListener('click', () => (PL ? plMenu() : showMenu()));
    showMenu();
    if ('serviceWorker' in navigator && location.protocol.indexOf('http') === 0) {
      navigator.serviceWorker.register('sw.js').catch(() => { /* hors ligne non dispo */ });
    }
  });
})();
