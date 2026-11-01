"""Facilitator entry without phones, and the app opening offline from the cache."""
import os, sys
from playwright.sync_api import sync_playwright
URL = sys.argv[1]
with sync_playwright() as p:
    b = p.chromium.launch(); c = b.new_context(viewport={"width": 390, "height": 844}); pg = c.new_page(); errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(URL + "#/host"); pg.click("#h-off"); pg.wait_for_selector(".join.off")
    for pick in ["HHHMMLM", "MMLHHLL", "HHHMMLM"]:
        pg.click('[data-tab="enter"]')
        for i, l in enumerate(pick):
            pg.locator('fieldset.mf').nth(i).locator('[data-l="%s"]' % l).click()
        pg.click("#m-save")
    pg.click('[data-tab="room"]'); print("counted", pg.inner_text("#h-count").replace("\n", " "))
    pg.click("#h-reveal"); pg.wait_for_selector(".res-head"); print("result", pg.inner_text(".res-head").replace("\n", " | "))
    pg.wait_for_timeout(1500)
    print("sw", pg.evaluate("navigator.serviceWorker && navigator.serviceWorker.controller ? 'controlling' : 'registered-not-yet-controlling'"))
    pg.reload(); pg.wait_for_timeout(800)
    c.set_offline(True); pg.reload(); pg.wait_for_selector(".tabs", timeout=8000)
    print("offline reload ok:", pg.inner_text(".hb-l").replace("\n", " "))
    print("errors", errs); b.close()
