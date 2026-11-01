"""End-to-end test: one facilitator screen and several phones, through the relay.
Run: python3 tests/e2e.py http://localhost:8765/ [relay-base]"""
import os, sys, time, json
from playwright.sync_api import sync_playwright
URL = sys.argv[1]
RELAY = sys.argv[2] if len(sys.argv) > 2 else None
OUT = os.environ.get("OUT", "/tmp")
PICKS = ["HHHMMLM", "HHLMHLM", "MHLLHLL", "HMMMMLM"]   # four phones
ARGS = ["--proxy-server=" + os.environ["HTTPS_PROXY"]] if os.environ.get("HTTPS_PROXY") and not RELAY else []
q = ("?relay=" + RELAY) if RELAY else ""
errs = []
with sync_playwright() as p:
    b = p.chromium.launch(args=ARGS)
    def ctx(w, h, mobile=False):
        c = b.new_context(viewport={"width": w, "height": h}, ignore_https_errors=True, is_mobile=mobile, has_touch=mobile)
        pg = c.new_page(); pg.on("pageerror", lambda e: errs.append(str(e))); pg.on("console", lambda m: errs.append("console:" + m.text) if m.type == "error" else None)
        return pg
    host = ctx(1366, 900)
    host.goto(URL + q + "#/host"); host.click("#h-start")
    host.wait_for_selector(".code"); code = host.inner_text(".code").strip()
    host.wait_for_selector(".st-live", timeout=20000)
    print("room", code)
    host.screenshot(path=OUT + "/host-room.png")
    phones = []
    for i, pick in enumerate(PICKS):
        ph = ctx(390, 844, True); ph.goto(URL + q + "#/join/" + code)
        ph.wait_for_selector(".step", timeout=20000)
        for k, l in enumerate(pick):
            ph.click('[data-pick="%s"]' % l); ph.wait_for_timeout(320)
            if i == 0 and k == 0: ph.screenshot(path=OUT + "/phone-step.png")
        ph.wait_for_selector("#v-send"); 
        if i == 0: ph.screenshot(path=OUT + "/phone-review.png", full_page=True)
        ph.click("#v-send"); ph.wait_for_selector(".done", timeout=20000)
        if i == 0: ph.screenshot(path=OUT + "/phone-done.png")
        phones.append(ph)
    host.wait_for_function("document.querySelectorAll('.cnt b')[1] && document.querySelectorAll('.cnt b')[1].textContent==='4'", timeout=20000)
    print("host counts", host.inner_text("#h-count").replace("\n", " "))
    host.screenshot(path=OUT + "/host-counted.png")
    # phone changes its mind
    phones[3].click("#v-change"); phones[3].click('[data-go="2"]'); phones[3].click('[data-pick="L"]'); phones[3].wait_for_timeout(400)
    phones[3].click("#v-send"); phones[3].wait_for_selector(".done")
    time.sleep(1.5)
    print("after change", host.inner_text("#h-count").replace("\n", " "))
    host.click("#h-reveal"); host.wait_for_selector(".res-head")
    print("host result:", host.inner_text(".res-head").replace("\n", " | "))
    host.screenshot(path=OUT + "/host-results.png", full_page=True)
    for ph in phones: ph.wait_for_selector(".res-head", timeout=20000)
    print("phone result:", phones[0].inner_text(".res-head").replace("\n", " | "))
    phones[0].screenshot(path=OUT + "/phone-results.png", full_page=True)
    # facilitator reload recovers the room
    host.reload(); host.wait_for_selector(".tabs"); host.click('[data-tab="room"]')
    host.wait_for_function("document.querySelectorAll('.cnt b')[1] && document.querySelectorAll('.cnt b')[1].textContent==='4'", timeout=20000)
    print("after reload", host.inner_text("#h-count").replace("\n", " "))
    # record
    host.click('[data-tab="record"]'); host.wait_for_selector("#r-dl")
    with host.expect_download() as d: host.click("#r-dl")
    print("record file", d.value.suggested_filename)
    host.screenshot(path=OUT + "/host-record.png", full_page=True)
    # new round reaches phones
    host.click('[data-tab="room"]'); host.click("#h-new2")
    for ph in phones: ph.wait_for_selector(".step", timeout=20000)
    print("new round reached phones; host:", host.inner_text(".hb-l").replace("\n", " "))
    # a phone with a wrong code
    bad = ctx(390, 844, True); bad.goto(URL + q + "#/join/ZZZZ22"); bad.wait_for_timeout(9000)
    print("bad code:", bad.inner_text(".wait").replace("\n", " ")[:80])
    print("errors", errs)
    b.close()
