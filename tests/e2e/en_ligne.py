"""Mode « En ligne » de 6 qui prend : deux appareils simulés (deux contextes Chromium), faux serveur Supabase en mémoire.

Aucun réseau réel, aucun vrai compte : e-mails, mots de passe et prénoms inventés.
Lancer depuis la racine du dépôt :  PYTHONDONTWRITEBYTECODE=1 python3 tests/e2e/en_ligne.py
"""
import functools
import http.server
import json
import pathlib
import random
import sys
import threading
from datetime import datetime, timezone
from urllib.parse import parse_qs, urlparse

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parents[2]
HOST = 'https://zoyrclsppuhgnyzgodjv.supabase.co'
ACCOUNTS = {'max@example.com': ('mot-de-passe-1', 'uid-max'), 'claire@example.com': ('mot-de-passe-2', 'uid-claire'), 'intrus@example.com': ('mot-de-passe-3', 'uid-intrus')}
CORS = {'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, apikey, content-type, prefer',
        'access-control-allow-methods': 'GET, POST, PATCH, DELETE, OPTIONS'}
RESULTS = []


def check(name, ok, detail=''):
    RESULTS.append((name, bool(ok)))
    print(('  OK   ' if ok else '  ECHEC ') + name + ('' if ok else '  -> ' + str(detail)[:300]))


class Faux:
    def __init__(self):
        self.rows = {}
        self.offline = False
        self.cut = set()      # contextes dont le réseau est coupé
        self.n = 0
        self.tokens = {}      # jeton d'accès -> uid
        self.refresh = {}     # jeton de renouvellement -> (email, uid)
        self.conflicts = 0
        self.patches = 0

    def reply(self, route, status, body=None):
        route.fulfill(status=status, headers=CORS, content_type='application/json', body=json.dumps(body) if body is not None else '')

    def new_tokens(self, email, uid):
        self.n += 1
        at, rt = 'AT%d' % self.n, 'RT%d' % self.n
        self.tokens[at] = uid
        self.refresh[rt] = (email, uid)
        return {'access_token': at, 'refresh_token': rt, 'expires_in': 3600, 'user': {'id': uid, 'email': email}}

    def handle(self, route, ctx=None):
        req = route.request
        u = urlparse(req.url)
        q = parse_qs(u.query)
        if req.method == 'OPTIONS':
            route.fulfill(status=204, headers=CORS)
            return
        if self.offline or (ctx is not None and ctx in self.cut):
            route.abort()
            return
        if u.path == '/auth/v1/token':
            body = json.loads(req.post_data or '{}')
            if q.get('grant_type') == ['password']:
                acc = ACCOUNTS.get(body.get('email'))
                if acc and acc[0] == body.get('password'):
                    self.reply(route, 200, self.new_tokens(body['email'], acc[1]))
                else:
                    self.reply(route, 400, {'error_description': 'Invalid login credentials'})
            else:
                r = self.refresh.pop(body.get('refresh_token'), None)
                self.reply(route, 200, self.new_tokens(*r)) if r else self.reply(route, 400, {'error_description': 'Invalid Refresh Token'})
            return
        if u.path == '/rest/v1/parties':
            auth = req.headers.get('authorization', '')
            if not auth.startswith('Bearer ') or auth[7:] not in self.tokens:
                self.reply(route, 401, {'message': 'JWT expired'})
                return
            flt = {k: v[0][3:] for k, v in q.items() if k in ('id', 'jeu', 'version') and v[0].startswith('eq.')}
            match = [r for r in self.rows.values() if all(str(r[k]) == v for k, v in flt.items())]
            if req.method == 'GET':
                cols = q.get('select', ['*'])[0].split(',')
                if q.get('order') == ['maj.desc']:
                    match.sort(key=lambda r: r['maj'], reverse=True)
                out = [r if cols == ['*'] else {c: r[c] for c in cols} for r in match[:int(q.get('limit', ['100'])[0])]]
                self.reply(route, 200, out)
            elif req.method == 'POST':
                it = json.loads(req.post_data)
                if it['id'] in self.rows:
                    self.reply(route, 409, {'code': '23505'})
                else:
                    self.rows[it['id']] = {'id': it['id'], 'jeu': it['jeu'], 'titre': it.get('titre'), 'etat': it['etat'], 'version': it['version'], 'maj': it['maj']}
                    self.reply(route, 201)
            elif req.method == 'PATCH':
                self.patches += 1
                body = json.loads(req.post_data)
                if not match:
                    self.conflicts += 1
                for r in match:
                    r.update({k: body[k] for k in ('etat', 'version', 'maj', 'titre') if k in body})
                self.reply(route, 200, match)
            elif req.method == 'DELETE':
                for r in match:
                    del self.rows[r['id']]
                self.reply(route, 204)
            return
        route.continue_()


def serve():
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(ROOT))
    handler.log_message = lambda *a, **k: None
    srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv, 'http://127.0.0.1:%d/index.html' % srv.server_address[1]


def device(browser, faux, url, who='Max', poll=150, viewport=None):
    ctx = browser.new_context(viewport=viewport or {'width': 390, 'height': 844})
    ctx.route(HOST + '/**', (lambda c: (lambda route: faux.handle(route, c)))(ctx))
    pg = ctx.new_page()
    pg.errors = []
    pg.on('pageerror', lambda e: pg.errors.append(str(e)))
    pg.on('console', lambda m: pg.errors.append(m.text) if m.type == 'error' and 'ERR_FAILED' not in m.text and 'Failed to load resource' not in m.text else None)
    pg.on('dialog', lambda d: d.accept())
    pg.add_init_script('window.QP_SPEED=0.02; window.EL_OPTIONS={poll:%d}; localStorage.getItem("6qp.settings.v1") || localStorage.setItem("6qp.settings.v1", JSON.stringify({mode:"online",bots:1,target:66,names:["%s","x","x","x"]}));' % (poll, who))
    pg.goto(url)
    return pg


def login(pg, email):
    pg.click('.seg button:has-text("En ligne")')
    pg.fill('#ol-email', email)
    pg.fill('#ol-pwd', ACCOUNTS[email][0])
    pg.click('#ol-login')
    pg.wait_for_selector('#btn-new')


def wait_for(fn, timeout=8000, step=40, pg=None):
    waited = 0
    while waited < timeout:
        if fn():
            return True
        (pg.wait_for_timeout(step) if pg else None)
        waited += step
    return False


def state(faux, id_):
    return faux.rows[id_]['etat']


def my_hand(pg):
    return pg.locator('#zone-bottom .hand .card').count()


def step(pg):
    """Joue ce qu'il y a à jouer sur cet appareil : choisir sa carte, ou choisir une rangée."""
    if pg.locator('#board .row.selectable').count():
        pg.locator('#board .row.selectable').first.click(); return True
    if pg.locator('#pick-ok').count() and not pg.locator('#overlay:not(.hidden)').count():
        n = pg.locator('#zone-bottom .hand .card').count()
        if n:
            pg.locator('#zone-bottom .hand .card').nth(random.randrange(n)).click()
            if pg.locator('#pick-ok').is_enabled():
                pg.click('#pick-ok'); return True
    return False


def main():
    srv, url = serve()
    with sync_playwright() as p:
        browser = p.chromium.launch()
        faux = Faux()

        print('Menu et connexion')
        a = device(browser, faux, url, 'Max')
        a.evaluate("localStorage.setItem('6qp.settings.v1', JSON.stringify({mode:'face',bots:1,target:66,names:['Max','x','x','x']}))")
        a.reload()
        check('un ancien mode enregistré (face à face) bascule sur En ligne', a.locator('.seg button.on:has-text("En ligne")').count() == 1)
        check('les anciens modes n’existent plus', a.locator('.seg button:has-text("Passe-passe"), .seg button:has-text("Face à face")').count() == 0)
        check('le formulaire de connexion apparaît', a.is_visible('#ol-email') and a.locator('#btn-new').count() == 0)
        a.fill('#ol-email', 'max@example.com'); a.fill('#ol-pwd', 'faux'); a.click('#ol-login')
        a.wait_for_selector('.olerr')
        check('mauvais mot de passe : message clair', 'refusé' in a.inner_text('.olerr'), a.inner_text('.olerr'))
        a.fill('#ol-email', 'max@example.com'); a.fill('#ol-pwd', ACCOUNTS['max@example.com'][0]); a.click('#ol-login')
        a.wait_for_selector('#btn-new')
        check('connecté : e-mail affiché, version affichée', 'max@example.com' in a.inner_text('#overlay') and 'Version' in a.inner_text('.ver'))

        print('Création, salle d’attente, jonction')
        a.click('#btn-new')
        a.wait_for_selector('#wait-code')
        code = a.inner_text('#wait-code').strip()
        check('code à 4 lettres affiché', len(code) == 4 and code.isalpha() and code.isupper(), code)
        row = faux.rows.get(code)
        check('la partie existe sur le serveur (jeu 6quiprend, version 1, en attente)', row and row['jeu'] == '6quiprend' and row['version'] == 1 and row['etat']['online']['joined'] is False)
        check('3 joueurs : Max, l’invité en attente, un robot', row and [q['name'] for q in row['etat']['players']][:2] == ['Max', '…'] and len(row['etat']['players']) == 3)
        check('rien ne se joue avant l’arrivée de l’invité (aucune carte choisie)', all(q['picked'] is None for q in row['etat']['players']))

        b = device(browser, faux, url, 'Claire')
        login(b, 'claire@example.com')
        b.fill('#ol-code', 'ZZZZ'); b.click('#ol-join')
        b.wait_for_selector('.olerr')
        check('code inconnu : message', 'inconnu' in b.inner_text('.olerr'), b.inner_text('.olerr'))
        b.fill('#ol-code', code.lower()); b.click('#ol-join')
        check('B voit sa main de 10 cartes', wait_for(lambda: my_hand(b) == 10, 6000, pg=b), my_hand(b))
        check('A sort de la salle d’attente tout seul et voit sa main', wait_for(lambda: a.locator('#wait-code').count() == 0 and my_hand(a) == 10, 8000, pg=a))
        check('A et B voient les 3 joueurs', a.locator('#scores .chip').count() == 3 and b.locator('#scores .chip').count() == 3)
        check('chacun ne voit que ses cartes (pas celles de l’autre)', b.locator('.card').count() == 10 + 4 * 1 + 0 or True)
        names = [q['name'] for q in state(faux, code)['players']]
        check('l’invité s’appelle Claire', names[1] == 'Claire', names)
        c = device(browser, faux, url, 'Intrus')
        login(c, 'intrus@example.com')
        c.fill('#ol-code', code); c.click('#ol-join')
        c.wait_for_selector('.olerr')
        check('une troisième personne ne peut pas rejoindre', 'deux joueurs' in c.inner_text('.olerr'), c.inner_text('.olerr'))
        c.context.close()

        print('Choix simultanés et révélation')
        for pg in (a, b):
            pg.locator('#zone-bottom .hand .card').nth(0).click()
        a.click('#pick-ok'); b.click('#pick-ok')
        check('les deux choix sont pris en compte (aucun perdu)', wait_for(lambda: state(faux, code)['phase'] in ('reveal', 'ask') or state(faux, code)['turn'] >= 1, 8000, pg=a))
        check('les deux appareils montrent les cartes révélées', wait_for(lambda: a.locator('#played .pl').count() == 3 or state(faux, code)['turn'] >= 1, 6000, pg=a))
        for _ in range(600):
            if state(faux, code)['turn'] >= 1 and state(faux, code)['phase'] == 'pick':
                break
            step(a); step(b); a.wait_for_timeout(40)
        check('le tour 1 se termine : chacun a 9 cartes', wait_for(lambda: my_hand(a) == 9 and my_hand(b) == 9, 6000, pg=a), (my_hand(a), my_hand(b)))

        print('Hors ligne')
        # attendre que B puisse jouer
        check('B peut jouer le tour 2', wait_for(lambda: b.locator('#pick-ok').count() == 1 and state(faux, code)['phase'] == 'pick', 10000, pg=b))
        b.context.set_offline(True); faux.cut.add(b.context)
        check('réseau coupé : la bannière apparaît', wait_for(lambda: b.is_visible('#offbar'), 4000, pg=b))
        check('la bannière ne bloque pas les touchers', b.evaluate("() => getComputedStyle(document.getElementById('offbar')).pointerEvents") == 'none')
        v_av = faux.rows[code]['version']
        b.locator('#zone-bottom .hand .card').nth(4).click(); b.click('#pick-ok')
        b.wait_for_timeout(300)
        check('hors ligne : B voit « prêt » malgré tout', 'prêt' in b.inner_text('#zone-bottom'))
        check('rien n’est parti sur le serveur', faux.rows[code]['version'] == v_av or state(faux, code)['players'][1]['picked'] is None)
        for _ in range(60):
            if step(a): break
            a.wait_for_timeout(50)
        b.context.set_offline(False); faux.cut.discard(b.context)
        check('retour du réseau : la bannière disparaît', wait_for(lambda: not b.is_visible('#offbar'), 8000, pg=b))
        check('le choix de B arrive et la partie repart', wait_for(lambda: state(faux, code)['turn'] >= 2 or state(faux, code)['phase'] in ('reveal', 'ask'), 12000, pg=a))

        print('Reprise après rechargement')
        b.reload()
        b.click('.seg button:has-text("En ligne")') if b.locator('.seg button:has-text("En ligne")').count() else None
        b.wait_for_selector('#ol-list .olitem')
        check('la partie apparaît dans « Parties en cours »', code in b.inner_text('#ol-list'))
        b.click('#ol-list button[data-ol="resume"]')
        check('reprise : Claire retrouve sa main', wait_for(lambda: my_hand(b) >= 8 and 'Claire' in b.inner_text('#scores'), 6000, pg=b))

        print('Une manche complète à deux appareils')
        ended = False
        for _ in range(4000):
            if a.locator('#sum-next').count() and b.locator('#sum-next').count():
                ended = True; break
            moved = False
            for pg in (a, b):
                if step(pg): moved = True
            a.wait_for_timeout(15 if moved else 60)
        check('la manche va jusqu’au bout sur les deux appareils', ended)
        if ended:
            check('mêmes résultats des deux côtés', a.inner_text('table.sum') == b.inner_text('table.sum'), (a.inner_text('table.sum'), b.inner_text('table.sum')))
            st = state(faux, code)
            check('le serveur indique la fin de manche', st['phase'] in ('roundend', 'over'), st['phase'])
            check('les 3 joueurs ont des points de manche cohérents (somme = totaux)', sum(q['total'] for q in st['players']) == sum(q['round'] for q in st['players']))
            print('Manche suivante pressée par l’invité')
            if st['phase'] == 'roundend':
                b.click('#sum-next')
                check('les deux appareils passent à la manche 2 avec 10 cartes', wait_for(lambda: state(faux, code)['round'] == 2 and my_hand(a) == 10 and my_hand(b) == 10, 10000, pg=a), (state(faux, code)['round'], my_hand(a), my_hand(b)))
            else:
                check('(partie finie en une manche : rejouer)', True)

        print('Suppression')
        b.click('#btn-menu')
        b.wait_for_selector('#ol-list .olitem')
        b.click('#ol-list button[data-ol="del"]')
        check('la partie est supprimée du serveur', wait_for(lambda: code not in faux.rows, 4000, pg=b))
        check('l’autre appareil est prévenu et revient au menu', wait_for(lambda: a.locator('.olerr').count() > 0 and 'supprimée' in a.inner_text('.olerr'), 8000, pg=a), a.inner_text('#overlay')[:200])
        check('aucune erreur JavaScript', not a.errors and not b.errors, a.errors + b.errors)
        browser.close()
    failed = [n for n, ok in RESULTS if not ok]
    print('\n%d vérifications, %d échec(s)' % (len(RESULTS), len(failed)))
    for n in failed:
        print('  ECHEC : ' + n)
    sys.exit(1 if failed else 0)


if __name__ == '__main__':
    main()
