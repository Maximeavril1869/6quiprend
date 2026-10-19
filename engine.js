/* Moteur « 6 qui prend » : règles pures + robots. Utilisable dans le navigateur (window.Engine) et sous Node (tests). */
(function (root) {
  'use strict';

  const ROW_MAX = 5;

  /** Nombre de têtes de bœuf d'une carte. */
  function heads(n) {
    if (n === 55) return 7;
    if (n % 11 === 0) return 5;
    if (n % 10 === 0) return 3;
    if (n % 5 === 0) return 2;
    return 1;
  }

  function rowHeads(row) {
    let s = 0;
    for (const c of row) s += heads(c);
    return s;
  }

  function newDeck() {
    return Array.from({ length: 104 }, (_, i) => i + 1);
  }

  function shuffle(a, rnd) {
    rnd = rnd || Math.random;
    const r = a.slice();
    for (let i = r.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [r[i], r[j]] = [r[j], r[i]];
    }
    return r;
  }

  /** Index de la rangée dont la dernière carte est la plus grande tout en restant < card. -1 si aucune. */
  function targetRow(rows, card) {
    let best = -1;
    let bestLast = -1;
    for (let i = 0; i < rows.length; i++) {
      const last = rows[i][rows[i].length - 1];
      if (last < card && last > bestLast) {
        bestLast = last;
        best = i;
      }
    }
    return best;
  }

  /**
   * Pose une carte. Modifie `rows`.
   * `chosenRow` n'est requis que si la carte est plus petite que toutes les rangées.
   * Retourne { row, taken, penalty }.
   */
  function place(rows, card, chosenRow) {
    let r = targetRow(rows, card);
    if (r === -1) {
      if (typeof chosenRow !== 'number' || chosenRow < 0 || chosenRow >= rows.length) {
        throw new Error('Rangée à ramasser requise');
      }
      const taken = rows[chosenRow];
      rows[chosenRow] = [card];
      return { row: chosenRow, taken, penalty: rowHeads(taken) };
    }
    if (rows[r].length >= ROW_MAX) {
      const taken = rows[r];
      rows[r] = [card];
      return { row: r, taken, penalty: rowHeads(taken) };
    }
    rows[r].push(card);
    return { row: r, taken: [], penalty: 0 };
  }

  function minRowHeads(rows) {
    let m = Infinity;
    for (const r of rows) m = Math.min(m, rowHeads(r));
    return m;
  }

  function fact(k) {
    let f = 1;
    for (let i = 2; i <= k; i++) f *= i;
    return f;
  }

  function poissonPmf(e, k) {
    return Math.exp(-e) * Math.pow(e, k) / fact(k);
  }

  /**
   * Choix d'une carte par un robot.
   * info = { others: nombre d'autres joueurs, seen: Set des cartes déjà apparues sur la table }
   */
  function botPick(hand, rows, info) {
    const mine = new Set(hand);
    const seen = info.seen || new Set();
    let unseen = 0;
    for (let n = 1; n <= 104; n++) if (!seen.has(n) && !mine.has(n)) unseen++;
    unseen = Math.max(1, unseen);
    const others = Math.max(1, info.others || 1);

    let bestCard = hand[0];
    let bestCost = Infinity;

    for (const card of hand) {
      const r = targetRow(rows, card);
      let cost;
      if (r === -1) {
        cost = minRowHeads(rows) + 1.5;
      } else {
        const row = rows[r];
        const L = row.length;
        const last = row[L - 1];
        const k = ROW_MAX - L; // nombre de cartes qui doivent s'insérer avant la mienne pour que je ramasse
        if (k === 0) {
          cost = rowHeads(row);
        } else {
          let gapUnseen = 0;
          for (let n = last + 1; n < card; n++) if (!seen.has(n) && !mine.has(n)) gapUnseen++;
          const e = (gapUnseen * others) / unseen;
          const p = poissonPmf(e, k);
          cost = p * (rowHeads(row) + k * 1.2) + (L === ROW_MAX - 1 ? 0.5 : 0);
        }
      }
      cost += (card / 104) * 0.25 + Math.random() * 0.35;
      if (cost < bestCost) {
        bestCost = cost;
        bestCard = card;
      }
    }
    return bestCard;
  }

  /** Rangée qu'un robot ramasse quand sa carte est trop petite. */
  function botRow(rows) {
    let best = [];
    let bh = Infinity;
    rows.forEach((r, i) => {
      const h = rowHeads(r);
      if (h < bh) {
        bh = h;
        best = [i];
      } else if (h === bh) {
        best.push(i);
      }
    });
    const minLen = Math.min(...best.map((i) => rows[i].length));
    const c = best.filter((i) => rows[i].length === minLen);
    return c[Math.floor(Math.random() * c.length)];
  }

  const api = { ROW_MAX, heads, rowHeads, newDeck, shuffle, targetRow, place, botPick, botRow, minRowHeads };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Engine = api;
})(typeof self !== 'undefined' ? self : this);
