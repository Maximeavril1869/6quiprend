"""Essai de fumée : contre l'ordinateur, une manche jouée, sans erreur JavaScript.
Lancer : python3 -m http.server 8123 (racine du dépôt), puis python3 tests/e2e/solo.py"""
import random
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={'width': 390, 'height': 844})
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.add_init_script('window.QP_SPEED=0.02; localStorage.setItem("6qp.settings.v1", JSON.stringify({mode:"solo",bots:2,target:0,names:["Max","x","x","x"]}));')
    pg.goto('http://127.0.0.1:8123/index.html')
    pg.click('#btn-new')
    for _ in range(3000):
        if pg.locator('#overlay:not(.hidden) table.sum').count():
            break
        if pg.locator('#board .row.selectable').count():
            pg.locator('#board .row.selectable').first.click()
        elif pg.locator('#pick-ok, .zbar .btn.primary').count() and pg.locator('#zone-bottom .hand .card:not(.dim)').count():
            n = pg.locator('#zone-bottom .hand .card').count()
            pg.locator('#zone-bottom .hand .card').nth(random.randrange(n)).click()
            pg.locator('.zbar .btn.primary').click()
        pg.wait_for_timeout(30)
    ok = pg.locator('#overlay:not(.hidden) table.sum').count() == 1
    print('solo : manche terminée', ok, 'erreurs', errs[:3])
    pg.screenshot(path='/tmp/q_solo_fin.png')
    assert ok and not errs
    b.close()
print('OK')
