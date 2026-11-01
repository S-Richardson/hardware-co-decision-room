"""Facilitator screen at several sizes, plus the home and join screens on a phone."""
import os, sys
from playwright.sync_api import sync_playwright
URL = sys.argv[1]; OUT = os.environ.get("OUT", "/tmp")
with sync_playwright() as p:
    b = p.chromium.launch(args=["--proxy-server=" + os.environ["HTTPS_PROXY"]] if os.environ.get("HTTPS_PROXY") else [])
    errs = []
    for w, h in [(1920, 1080), (1366, 768), (1024, 768), (390, 844), (360, 640)]:
        c = b.new_context(viewport={"width": w, "height": h}, ignore_https_errors=True); pg = c.new_page()
        pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.goto(URL + "#/"); pg.wait_for_selector(".home")
        ov = pg.evaluate("document.documentElement.scrollWidth - innerWidth")
        if w < 500: pg.screenshot(path=f"{OUT}/home-{w}.png", full_page=True)
        pg.goto(URL + "#/host"); pg.click("#h-start"); pg.wait_for_selector(".code"); pg.wait_for_timeout(800)
        ov2 = pg.evaluate("document.documentElement.scrollWidth - innerWidth")
        code = pg.locator(".code").bounding_box(); live = pg.locator(".live").bounding_box()
        overlap = code["x"] + code["width"] > live["x"] and code["y"] < live["y"] + live["height"] and live["y"] < code["y"] + code["height"]
        print(w, "overflow home", ov, "host", ov2, "code overlaps counts", overlap)
        pg.screenshot(path=f"{OUT}/host-{w}.png")
        c.close()
    print("errors", errs); b.close()
