/* =====================================================================
   Decision room, mobile app.
   Executives each choose High, Medium or Low for seven priorities on their
   own phone. The facilitator's screen shows, anonymously, how many have
   voted, then reveals where the room agrees, where it splits and which
   splits would change the recommended operating model. Scoring matches the
   decision tool: High 4, Medium 2, Low 1 points (inverted for appetite for
   change), split across each priority's criteria and normalised to 100.
   ===================================================================== */
(function () {
  "use strict";
  var HC = window.HC, R = window.Relay;
  var P = HC.principles, CATS = P.map(function (p) { return p.id; }), LV = ["H", "M", "L"], INV = { H: "L", M: "M", L: "H" };
  var REC = HC.recommendation.option;
  var HOST_KEY = "hcdr.host.v1";
  var app = document.getElementById("app");

  /* ---------- helpers ---------- */
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function $(id) { return document.getElementById(id); }
  function find(list, id) { for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i]; return null; }
  function opt(id) { return find(HC.options, id); }
  function lvl(cat, l) { return find(find(P, cat).levels, l); }
  function brief() { var c = {}; P.forEach(function (p) { c[p.id] = p.def; }); return c; }
  function complete(c) { return !!c && CATS.every(function (k) { return LV.indexOf(c[k]) !== -1; }); }
  function rid() { var a = new Uint8Array(8); crypto.getRandomValues(a); return Array.prototype.map.call(a, function (b) { return ("0" + b.toString(16)).slice(-2); }).join(""); }
  function load(k, d) { try { var r = localStorage.getItem(k); return r ? JSON.parse(r) : d; } catch (e) { return d; } }
  function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } }
  function today() { return new Date().toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" }); }
  function joinUrl(code) { return location.origin + location.pathname + "#/join/" + code; }
  function toast(msg) {
    var t = $("toast"); t.textContent = msg; t.classList.add("on");
    clearTimeout(toast.t); toast.t = setTimeout(function () { t.classList.remove("on"); }, 2600);
  }
  var ICONS = {
    phone: '<rect x="6.5" y="2.5" width="11" height="19" rx="1.5"/><path d="M10.5 18.5h3"/>',
    screen: '<rect x="2.5" y="4" width="19" height="13"/><path d="M8 21h8M12 17v4"/>',
    check: '<path d="M4.5 12.5l5 5 10-11"/>',
    lock: '<rect x="5" y="10.5" width="14" height="10"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>',
    people: '<circle cx="9" cy="8.5" r="3.1"/><path d="M3 19.5a6 6 0 0 1 12 0"/><circle cx="16.8" cy="8" r="2.5"/><path d="M15.6 13.4a5 5 0 0 1 5.6 5"/>',
    vote: '<path d="M4 13.5h16v7H4z"/><path d="M8 13.5V4h8v9.5"/><path d="M10.2 8.6l1.4 1.4 2.4-2.6"/>',
    eye: '<path d="M2.5 12s3.5-6.5 9.5-6.5S21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/>',
    doc: '<path d="M6 3h8.5L19 7.5V21H6z"/><path d="M14 3v5h5"/><path d="M9 12.5h7M9 16h7"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    back: '<path d="M14.5 5.5L8 12l6.5 6.5"/>',
    share: '<path d="M12 3.5v11"/><path d="M8 7.5l4-4 4 4"/><path d="M5.5 11.5v9h13v-9"/>',
    alert: '<path d="M12 3.5L2.5 20h19z"/><path d="M12 10v4.5M12 17v.3"/>',
    repeat: '<path d="M4 11V8.5A2.5 2.5 0 0 1 6.5 6H19l-3-3M20 13v2.5a2.5 2.5 0 0 1-2.5 2.5H5l3 3"/>'
  };
  function icon(id) { return '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' + (ICONS[id] || "") + "</svg>"; }

  /* ---------- scoring (mirrors the decision tool) ---------- */
  function totals(choices) {
    var w = {}, t = 0;
    P.forEach(function (p) {
      var pts = HC.levelPoints[p.invert ? INV[choices[p.id]] : choices[p.id]];
      p.criteria.forEach(function (c) { w[c] = (w[c] || 0) + pts / p.criteria.length; });
    });
    Object.keys(w).forEach(function (k) { t += w[k]; });
    var out = {};
    HC.options.forEach(function (o) {
      out[o.id] = HC.criteria.reduce(function (a, c) { return a + (100 * (w[c.id] || 0) / t) * HC.scores[o.id][c.id]; }, 0) / 100;
    });
    return out;
  }
  function verdict(choices) {
    var t = totals(choices);
    var o = HC.options.map(function (x) { return x.id; }).sort(function (a, b) {
      var d = t[b] - t[a]; return Math.abs(d) > 1e-9 ? d : (a === REC ? -1 : b === REC ? 1 : 0);
    });
    return { leader: o[0], runner: o[1], close: t[o[0]] - t[o[1]] < 0.05, totals: t };
  }
  /* Where the room agrees and splits, and which splits would change the answer. */
  function analyse(votes) {
    var n = votes.length, b = brief(), counts = {}, group = {}, agree = {};
    CATS.forEach(function (c) {
      counts[c] = { H: 0, M: 0, L: 0 };
      votes.forEach(function (v) { counts[c][v.choices[c]]++; });
      var max = Math.max(counts[c].H, counts[c].M, counts[c].L);
      var tied = LV.filter(function (l) { return counts[c][l] === max; });
      group[c] = tied.length === 1 ? tied[0] : (tied.indexOf(b[c]) !== -1 ? b[c] : (tied.indexOf("M") !== -1 ? "M" : tied[0]));
      var share = n ? counts[c][group[c]] / n : 0;
      agree[c] = !n ? "" : share === 1 ? "Agreed" : share > 0.5 ? "Majority" : "Split";
    });
    var gv = n ? verdict(group) : null, flips = {};
    if (n) CATS.forEach(function (c) {
      flips[c] = [];
      LV.forEach(function (l) {
        if (l === group[c] || !counts[c][l]) return;
        var alt = {}; CATS.forEach(function (k) { alt[k] = group[k]; }); alt[c] = l;
        var v = verdict(alt);
        if (v.leader !== gv.leader) flips[c].push({ level: l, leader: v.leader });
      });
    });
    var indiv = {}; HC.options.forEach(function (o) { indiv[o.id] = 0; });
    votes.forEach(function (v) { indiv[verdict(v.choices).leader]++; });
    return { n: n, counts: counts, group: group, agree: agree, leader: gv ? gv.leader : null, runner: gv ? gv.runner : null, close: gv ? gv.close : false, flips: flips, indiv: indiv };
  }

  /* ---------- shared renderers ---------- */
  function leaderLine(leader, close, runner) {
    var o = opt(leader);
    return "Option " + leader + ", " + o.name.toLowerCase() + (leader === REC ? ": the recommended model." : ". The recommended model from Hardware Co’s brief is option " + REC + ".") + (close ? " Very close to option " + runner + "." : "");
  }
  function resultsHtml(a, who) {
    if (!a || !a.n) return '<p class="muted">No choices were counted.</p>';
    var head = '<div class="res-head' + (a.leader === REC ? "" : " diff") + '"><span class="res-k">' + esc(who) + ' point to</span><span class="res-opt">' + a.leader + "</span>" +
      '<p class="res-t">' + esc(leaderLine(a.leader, a.close, a.runner)) + "</p></div>";
    var splits = CATS.filter(function (c) { return (a.flips[c] || []).length; });
    var rows = P.map(function (p) {
      var c = a.counts[p.id], g = a.group[p.id], f = a.flips[p.id] || [];
      return '<li class="pr' + (f.length ? " flip" : "") + '"><div class="pr-top"><span class="pr-n">' + esc(p.name) + '</span><span class="ag ag-' + a.agree[p.id].charAt(0) + '">' + esc(a.agree[p.id]) + "</span></div>" +
        '<p class="pr-g"><b>' + HC.levelNames[g] + ":</b> " + esc(lvl(p.id, g).name) + "</p>" +
        '<div class="bars" role="img" aria-label="High ' + c.H + ", medium " + c.M + ", low " + c.L + '">' + LV.map(function (l) {
          return '<span class="bar b-' + l + (l === g ? " on" : "") + '"><i style="width:' + (100 * c[l] / a.n).toFixed(1) + '%"></i><em>' + HC.levelNames[l].charAt(0) + " " + c[l] + "</em></span>";
        }).join("") + "</div>" +
        (f.length ? '<p class="pr-f">' + icon("alert") + f.map(function (x) { return "Choosing " + HC.levelNames[x.level].toLowerCase() + " instead would point to option " + x.leader; }).join("; ") + ".</p>" : "") + "</li>";
    }).join("");
    var indiv = HC.options.map(function (o) { return '<span class="iv"><b>' + a.indiv[o.id] + "</b> option " + o.id + "</span>"; }).join("");
    return head + '<p class="res-sum">' + (splits.length ? "<b>" + splits.length + (splits.length === 1 ? " split changes" : " splits change") + " the answer.</b> Discuss " + (splits.length === 1 ? "it" : "them") + " first." : "<b>No split changes the answer.</b> The disagreements that remain don’t move the recommended option.") + "</p>" +
      '<ol class="prs">' + rows + "</ol>" +
      '<div class="indiv"><p class="res-k">Each person’s own choices point to</p><div class="ivs">' + indiv + "</div></div>";
  }
  function choiceForm(choices, prefix) {
    return P.map(function (p) {
      return '<fieldset class="mf"><legend>' + esc(p.name) + '</legend><div class="seg3">' + LV.map(function (l) {
        return '<button type="button" data-f="' + prefix + '" data-c="' + p.id + '" data-l="' + l + '" aria-pressed="' + (choices[p.id] === l) + '"><b>' + HC.levelNames[l] + "</b><span>" + esc(lvl(p.id, l).name) + "</span></button>";
      }).join("") + "</div></fieldset>";
    }).join("");
  }
  function wireForm(prefix, choices, onChange) {
    document.querySelectorAll('[data-f="' + prefix + '"]').forEach(function (b) {
      b.addEventListener("click", function () {
        var c = b.getAttribute("data-c"), l = b.getAttribute("data-l");
        choices[c] = l;
        document.querySelectorAll('[data-f="' + prefix + '"][data-c="' + c + '"]').forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); });
        if (onChange) onChange();
      });
    });
  }
  function statusPill(s) {
    return '<span class="st st-' + s + '">' + ({ live: "Connected", reconnecting: "Reconnecting…", offline: "Offline", local: "This device only", connecting: "Connecting…" }[s] || s) + "</span>";
  }

  /* =================================================================
     HOME
     ================================================================= */
  function renderHome() {
    var host = load(HOST_KEY, null);
    app.innerHTML = '<main class="home">' +
      '<div class="brand"><span class="dot"></span>' + esc(HC.client) + "</div>" +
      '<h1 class="h-xl">Decision<br><b>room</b></h1>' +
      '<p class="lede">Each executive chooses what matters most for the Customer Sales operating model, privately, on their own phone. The room then sees where it agrees, where it splits, and which splits would change the answer.</p>' +
      '<div class="home-act">' +
      '<a class="card-btn" href="#/join">' + icon("phone") + '<span><b>Join a room</b><span>Scan the code on the screen, or type it</span></span></a>' +
      '<a class="card-btn dark" href="#/host">' + icon("screen") + '<span><b>' + (host && host.code ? "Return to your room" : "Run a room") + "</b><span>" + (host && host.code ? "Room " + esc(host.code) + ", round " + host.round : "For the facilitator: show the code, then reveal the results") + "</span></span></a></div>" +
      '<p class="fine">' + icon("lock") + '<span>Votes are anonymous and encrypted on the phone. <a href="#/how">How it works</a></span></p>' +
      installHint() + "</main>";
    wireInstall();
  }
  function installHint() {
    var standalone = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone;
    if (standalone || load("hcdr.hint", false)) return "";
    var ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    return '<div class="hint" id="hint"><p><b>Save it as an app.</b> ' + (ios ? "In Safari, tap Share " + icon("share") + " then <b>Add to Home Screen</b>." : "In Chrome, open the menu and choose <b>Install app</b> or <b>Add to Home screen</b>.") +
      '</p><button type="button" class="x" id="hint-x" aria-label="Dismiss">×</button></div>';
  }
  function wireInstall() { var x = $("hint-x"); if (x) x.addEventListener("click", function () { save("hcdr.hint", true); $("hint").remove(); }); }

  function renderHow() {
    app.innerHTML = '<main class="page"><a class="back" href="#/">' + icon("back") + "Back</a><h1 class=\"h-l\">How it works</h1>" +
      '<ol class="how"><li><b>The facilitator starts a room</b> and shows its six-character code and QR code on the shared screen.</li>' +
      "<li><b>Each executive joins on their phone</b> and chooses High, Medium or Low for seven priorities. Their choices stay on the phone until they send them, and they can change them until voting closes.</li>" +
      "<li><b>The screen shows only a count</b> of who has joined and voted, never who chose what.</li>" +
      "<li><b>The facilitator reveals the results</b> on the screen and every phone: where the room agrees, where it splits, which splits would change the recommended option, and where each person’s own choices point.</li>" +
      "<li><b>The facilitator records the decision</b> and downloads it as a Markdown file.</li></ol>" +
      '<h2 class="h-m">Privacy</h2><ul class="how"><li>Votes travel through a free public message relay (ntfy.sh), because this app is a set of static files with no server of its own.</li>' +
      "<li>Every message is encrypted on the device with a key derived from the room code. The relay sees only scrambled text and a channel name that is a one-way hash of the code, never the code itself.</li>" +
      "<li>The relay keeps messages for about 12 hours, then deletes them. No names, emails or device details are sent.</li>" +
      "<li>Anyone with the code can join, so share it only in the room.</li>" +
      "<li>If the relay is blocked on the venue’s network, the facilitator can enter each person’s choices by hand.</li></ul>" +
      '<h2 class="h-m">Scoring</h2><p>The same as the decision tool. High earns 4 points, medium 2 and low 1 (inverted for appetite for change); each priority’s points are split across the criteria it measures, weights are normalised to 100, and each option’s criterion scores are weighted and added. The room’s choice for each priority is its most common answer.</p></main>';
  }

  /* =================================================================
     FACILITATOR
     ================================================================= */
  var H = null;           /* host state saved on this device */
  var hostRoom = null, hostSub = null, hostConn = "connecting", hostTab = "room";
  var votes = {}, joined = {}, lastStateAt = 0;
  function saveHost() { save(HOST_KEY, H); }
  function hostVotes() {
    var list = Object.keys(votes).map(function (k) { return votes[k]; }).filter(function (v) { return v.r === H.round && complete(v.choices); });
    return list.concat(H.manual.filter(function (m) { return m.round === H.round && complete(m.choices); }));
  }
  function startHost(offline) {
    var code = R.newCode();
    H = { code: code, round: 1, status: "open", offline: !!offline, manual: [], record: null, created: Date.now(), id: rid() };
    saveHost(); votes = {}; joined = {};
    connectHost(true);
    renderHost();
  }
  function connectHost(announce) {
    if (hostSub) { hostSub.close(); hostSub = null; }
    if (H.offline) { hostConn = "local"; return; }
    hostConn = "connecting";
    R.derive(H.code).then(function (room) {
      hostRoom = room;
      hostSub = R.listen(room, onHostMessage, function (s) { hostConn = s; paintConn(); });
      if (announce) publishState();
    });
  }
  function onHostMessage(m, t) {
    if (m.t === "vote" && m.id) { var old = votes[m.id]; if (!old || old.t <= t) votes[m.id] = { id: m.id, choices: m.c, r: m.r, t: t }; joined[m.id] = 1; }
    else if (m.t === "hello" && m.id) joined[m.id] = 1;
    else if (m.t === "state" && m.h !== H.id && t > lastStateAt) { /* another facilitator device for the same room */ lastStateAt = t; H.round = m.r; H.status = m.s; saveHost(); }
    paintLive();
  }
  function publishState(res) {
    if (H.offline || !hostRoom) return Promise.resolve();
    return R.publish(hostRoom, { t: "state", s: H.status, r: H.round, h: H.id, res: res || null, at: Date.now() })
      .catch(function () { toast("The relay could not be reached. Check the connection and try again."); });
  }
  function reveal() {
    var a = analyse(hostVotes());
    if (!a.n) { toast("No choices yet. Wait for votes, or add them by hand."); return; }
    H.status = "revealed"; H.record = null; saveHost();
    publishState({ n: a.n, counts: a.counts, group: a.group, agree: a.agree, leader: a.leader, runner: a.runner, close: a.close, flips: a.flips, indiv: a.indiv });
    hostTab = "results"; renderHost();
  }
  function newRound() {
    H.round += 1; H.status = "open"; H.record = null; saveHost();
    publishState(); hostTab = "room"; renderHost();
  }
  function endRoom() {
    if (!window.confirm("End this room? Its votes are cleared from this device.")) return;
    if (hostSub) hostSub.close(); hostSub = null; hostRoom = null;
    try { localStorage.removeItem(HOST_KEY); } catch (e) { /* ignore */ }
    H = null; location.hash = "#/";
  }
  function paintConn() { var el = $("h-conn"); if (el) el.innerHTML = statusPill(hostConn); }
  function paintLive() {
    var el = $("h-count"); if (!el) return;
    var n = hostVotes().length, j = Object.keys(joined).length;
    el.innerHTML = (H.offline ? "" : '<div class="cnt"><b>' + j + '</b><span>joined</span></div>') + '<div class="cnt"><b>' + n + '</b><span>sets of choices in</span></div>';
    var rv = $("h-reveal"); if (rv) rv.disabled = !n;
  }
  function qrSvg(text) {
    try { var q = window.qrcode(0, "M"); q.addData(text); q.make(); return q.createSvgTag({ cellSize: 4, margin: 2, scalable: true, alt: "QR code to join the room" }); } catch (e) { return ""; }
  }
  function renderHost() {
    if (!H) {
      app.innerHTML = '<main class="page"><a class="back" href="#/">' + icon("back") + "Back</a>" +
        '<h1 class="h-l">Run a room</h1><p class="lede-s">Start a room, put this screen on the projector and ask everyone to scan the code. Results stay hidden until you reveal them.</p>' +
        '<button type="button" class="btn pr big" id="h-start">' + icon("screen") + "Start a room</button>" +
        '<button type="button" class="btn big" id="h-off">Run it without phones</button>' +
        '<p class="fine">Without phones, you enter each person’s choices on this device. Nothing is sent anywhere.</p></main>';
      $("h-start").addEventListener("click", function () { startHost(false); });
      $("h-off").addEventListener("click", function () { startHost(true); });
      return;
    }
    var tabs = [["room", "Room", "people"], ["enter", "Add by hand", "plus"], ["results", "Results", "eye"], ["record", "Record", "doc"]];
    var top = '<header class="hbar"><div class="hb-l"><span class="dot"></span><b>Room ' + esc(H.code) + '</b><span class="muted">Round ' + H.round + '</span></div><div id="h-conn">' + statusPill(H.offline ? "local" : hostConn) + "</div></header>" +
      '<nav class="tabs" role="tablist">' + tabs.map(function (t) {
        var dis = t[0] === "results" && H.status !== "revealed";
        return '<button type="button" role="tab" data-tab="' + t[0] + '" aria-selected="' + (hostTab === t[0]) + '"' + (dis ? " disabled" : "") + ">" + icon(t[2]) + "<span>" + t[1] + "</span></button>";
      }).join("") + "</nav>";
    var body = "";
    if (hostTab === "room") body = hostRoomView();
    else if (hostTab === "enter") body = hostEnterView();
    else if (hostTab === "results") body = '<section class="res">' + resultsHtml(analyse(hostVotes()), "The room’s priorities") + '<div class="row"><button type="button" class="btn" id="h-new">' + icon("repeat") + "Start a new round</button></div></section>";
    else body = hostRecordView();
    app.innerHTML = '<main class="host">' + top + body + "</main>";
    document.querySelectorAll("[data-tab]").forEach(function (b) { b.addEventListener("click", function () { hostTab = b.getAttribute("data-tab"); renderHost(); }); });
    if (hostTab === "room") wireRoom();
    if (hostTab === "enter") wireEnter();
    if (hostTab === "record") wireRecord();
    if ($("h-new")) $("h-new").addEventListener("click", newRound);
    paintLive();
  }
  function hostRoomView() {
    var url = joinUrl(H.code), open = H.status === "open";
    var join = H.offline ? '<div class="join off"><p class="h-m">Running without phones</p><p>Add each person’s choices on the <b>Add by hand</b> tab, then reveal.</p></div>'
      : '<div class="join"><div class="qr">' + qrSvg(url) + '</div><div class="jt"><p class="jk">Scan to join, or go to the app and type</p><p class="code" aria-label="Room code ' + H.code.split("").join(" ") + '">' + esc(H.code) + '</p><p class="url">' + esc(location.host + location.pathname) + "</p></div></div>";
    return '<section class="room">' + join +
      '<div class="live"><div class="counts" id="h-count" aria-live="polite"></div>' +
      '<p class="muted">' + (open ? "Voting is open. Only the count is shown; nobody’s choices appear on this screen." : "Voting is closed and the results have been revealed.") + "</p>" +
      '<div class="row">' + (open ? '<button type="button" class="btn pr big" id="h-reveal">' + icon("eye") + "Close voting and reveal</button>"
        : '<button type="button" class="btn pr big" id="h-show">' + icon("eye") + 'Show the results</button><button type="button" class="btn big" id="h-new2">' + icon("repeat") + "Start a new round</button>") +
      '</div><div class="row small"><button type="button" class="linkbtn" id="h-copy">Copy the join link</button><button type="button" class="linkbtn" id="h-end">End the room</button></div></div></section>';
  }
  function wireRoom() {
    if ($("h-reveal")) $("h-reveal").addEventListener("click", reveal);
    if ($("h-show")) $("h-show").addEventListener("click", function () { hostTab = "results"; renderHost(); });
    if ($("h-new2")) $("h-new2").addEventListener("click", newRound);
    $("h-end").addEventListener("click", endRoom);
    $("h-copy").addEventListener("click", function () {
      var u = joinUrl(H.code);
      try { navigator.clipboard.writeText(u).then(function () { toast("Link copied."); }, function () { toast(u); }); } catch (e) { toast(u); }
    });
  }
  var draftManual = {}, editingManual = null;
  function hostEnterView() {
    var list = H.manual.filter(function (m) { return m.round === H.round; });
    return '<section class="enter"><h2 class="h-m">' + (editingManual ? "Change these choices" : "Add someone’s choices") + '</h2><p class="muted">For anyone without a phone. A label is optional and is never shown with the results.</p>' +
      '<label class="lab">Label (optional)<input type="text" id="m-label" maxlength="40" placeholder="For example, Person 4" value="' + esc(draftManual.label || "") + '"></label>' +
      choiceForm(draftManual, "m") +
      '<div class="row"><button type="button" class="btn pr" id="m-save"' + (complete(draftManual) ? "" : " disabled") + ">" + icon("check") + (editingManual ? "Save changes" : "Add these choices") + "</button>" +
      (editingManual ? '<button type="button" class="btn" id="m-cancel">Cancel</button>' : "") + "</div>" +
      (list.length ? '<h3 class="h-s">Added by hand this round</h3><ul class="mlist">' + list.map(function (m) {
        return '<li><span>' + esc(m.label || "Unlabelled") + '</span><span class="row small"><button type="button" class="linkbtn" data-edit="' + m.id + '">Change</button><button type="button" class="linkbtn" data-del="' + m.id + '">Remove</button></span></li>';
      }).join("") + "</ul>" : "") + "</section>";
  }
  function wireEnter() {
    wireForm("m", draftManual, function () { $("m-save").disabled = !complete(draftManual); });
    $("m-label").addEventListener("input", function () { draftManual.label = $("m-label").value; });
    $("m-save").addEventListener("click", function () {
      var c = {}; CATS.forEach(function (k) { c[k] = draftManual[k]; });
      if (editingManual) { var m = find(H.manual, editingManual); m.choices = c; m.label = draftManual.label || ""; }
      else H.manual.push({ id: rid(), label: draftManual.label || "", choices: c, round: H.round });
      saveHost(); draftManual = {}; editingManual = null; toast("Choices added."); renderHost();
    });
    if ($("m-cancel")) $("m-cancel").addEventListener("click", function () { draftManual = {}; editingManual = null; renderHost(); });
    document.querySelectorAll("[data-edit]").forEach(function (b) { b.addEventListener("click", function () {
      var m = find(H.manual, b.getAttribute("data-edit")); editingManual = m.id; draftManual = Object.assign({ label: m.label }, m.choices); renderHost(); window.scrollTo(0, 0);
    }); });
    document.querySelectorAll("[data-del]").forEach(function (b) { b.addEventListener("click", function () {
      H.manual = H.manual.filter(function (m) { return m.id !== b.getAttribute("data-del"); }); saveHost(); renderHost();
    }); });
  }
  function ensureRecord(a) {
    if (!H.record || H.record.round !== H.round) {
      H.record = { round: H.round, levels: {}, notes: {}, by: "", decided: today() };
      CATS.forEach(function (c) { H.record.levels[c] = a.n ? a.group[c] : brief()[c]; H.record.notes[c] = ""; });
      saveHost();
    }
    return H.record;
  }
  function recordText(a, r) {
    var v = verdict(r.levels), lines = [];
    lines.push("# Decision record: " + HC.client + " Customer Sales operating model", "");
    lines.push("Date: " + (r.decided || today()));
    if (r.by) lines.push("Agreed by: " + r.by);
    lines.push("Sets of choices counted: " + a.n + " (round " + H.round + ")", "");
    lines.push("**Result.** The agreed priorities point to option " + v.leader + " (" + opt(v.leader).name + ")." +
      (v.leader === REC ? " This matches the recommendation from Hardware Co's brief." : " This differs from the recommendation from Hardware Co's brief, option " + REC + " (" + opt(REC).name + ").") + (v.close ? " It is very close to option " + v.runner + "." : ""), "");
    lines.push("| Priority | Agreed choice | Votes (high / medium / low) | Agreement | Note |", "|---|---|---|---|---|");
    P.forEach(function (p) {
      var c = a.counts[p.id];
      lines.push("| " + p.name + " | " + HC.levelNames[r.levels[p.id]] + ": " + lvl(p.id, r.levels[p.id]).name + " | " + (a.n ? c.H + " / " + c.M + " / " + c.L : "-") + " | " + (a.agree[p.id] || "-") + " | " + (r.notes[p.id] || "").replace(/\|/g, "/") + " |");
    });
    var splits = P.filter(function (p) { return (a.flips[p.id] || []).length; });
    lines.push("", "**Disagreements that changed the answer:** " + (splits.length ? splits.map(function (p) { return p.name; }).join(", ") : "none") + ".");
    return lines.join("\n");
  }
  function hostRecordView() {
    var a = analyse(hostVotes()), r = ensureRecord(a), v = verdict(r.levels);
    return '<section class="rec"><h2 class="h-m">Decision record</h2><p class="muted">The room’s choices are filled in. Confirm or change each one as agreed, and note why.</p>' +
      '<div class="rec-res" id="r-res">' + recResult(v) + "</div>" +
      P.map(function (p) {
        var c = a.counts[p.id];
        return '<fieldset class="mf"><legend>' + esc(p.name) + (a.n ? '<span class="muted"> · room ' + c.H + " / " + c.M + " / " + c.L + "</span>" : "") + '</legend><div class="seg3">' + LV.map(function (l) {
          return '<button type="button" data-r="' + p.id + '" data-l="' + l + '" aria-pressed="' + (r.levels[p.id] === l) + '"><b>' + HC.levelNames[l] + "</b><span>" + esc(lvl(p.id, l).name) + "</span></button>";
        }).join("") + '</div><input type="text" class="note" data-note="' + p.id + '" maxlength="160" placeholder="Note (optional)" value="' + esc(r.notes[p.id] || "") + '" aria-label="Note for ' + esc(p.name) + '"></fieldset>';
      }).join("") +
      '<label class="lab">Agreed by<input type="text" id="r-by" maxlength="120" placeholder="Names or roles" value="' + esc(r.by) + '"></label>' +
      '<label class="lab">Date<input type="text" id="r-date" maxlength="40" value="' + esc(r.decided) + '"></label>' +
      '<div class="row"><button type="button" class="btn pr" id="r-dl">' + icon("doc") + 'Download the record</button><button type="button" class="btn" id="r-copy">Copy as text</button></div></section>';
  }
  function recResult(v) { return '<span class="res-k">The agreed priorities point to</span><span class="res-opt sm">' + v.leader + '</span><p class="res-t">' + esc(leaderLine(v.leader, v.close, v.runner)) + "</p>"; }
  function wireRecord() {
    var a = analyse(hostVotes()), r = H.record;
    document.querySelectorAll("[data-r]").forEach(function (b) { b.addEventListener("click", function () {
      var c = b.getAttribute("data-r"); r.levels[c] = b.getAttribute("data-l"); saveHost();
      document.querySelectorAll('[data-r="' + c + '"]').forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); });
      $("r-res").innerHTML = recResult(verdict(r.levels));
    }); });
    document.querySelectorAll("[data-note]").forEach(function (i) { i.addEventListener("input", function () { r.notes[i.getAttribute("data-note")] = i.value; saveHost(); }); });
    $("r-by").addEventListener("input", function () { r.by = $("r-by").value; saveHost(); });
    $("r-date").addEventListener("input", function () { r.decided = $("r-date").value; saveHost(); });
    $("r-copy").addEventListener("click", function () {
      var t = recordText(a, r);
      try { navigator.clipboard.writeText(t).then(function () { toast("Copied."); }, function () { toast("Copy is blocked here. Use Download instead."); }); } catch (e) { toast("Copy is blocked here. Use Download instead."); }
    });
    $("r-dl").addEventListener("click", function () {
      var blob = new Blob([recordText(a, r)], { type: "text/markdown" }), u = URL.createObjectURL(blob), l = document.createElement("a");
      l.href = u; l.download = "decision-record-round-" + H.round + ".md"; document.body.appendChild(l); l.click(); l.remove(); setTimeout(function () { URL.revokeObjectURL(u); }, 1000);
    });
  }

  /* =================================================================
     VOTER (phone)
     ================================================================= */
  var V = null, vRoom = null, vSub = null, vConn = "connecting", vState = null, vStep = 0, vLate = false, vBack = false;
  function vKey(code) { return "hcdr.voter." + code; }
  function saveV() { save(vKey(V.code), V); }
  function renderJoinEntry(err) {
    app.innerHTML = '<main class="page"><a class="back" href="#/">' + icon("back") + "Back</a><h1 class=\"h-l\">Join a room</h1>" +
      '<p class="lede-s">Type the six-character code on the screen, or scan its QR code with your camera.</p>' +
      '<form id="j-form" class="jform" autocomplete="off"><label class="lab">Room code<input id="j-code" inputmode="text" autocapitalize="characters" spellcheck="false" maxlength="8" placeholder="ABC234" aria-describedby="j-err"></label>' +
      '<p class="err" id="j-err" role="alert">' + esc(err || "") + '</p><button type="submit" class="btn pr big">Join</button></form></main>';
    var inp = $("j-code");
    inp.addEventListener("input", function () { var c = R.cleanCode(inp.value); if (c !== inp.value) inp.value = c; });
    $("j-form").addEventListener("submit", function (e) {
      e.preventDefault(); var c = R.cleanCode(inp.value);
      if (!R.validCode(c)) { $("j-err").textContent = "Codes have six letters and numbers. Check the screen and try again."; return; }
      location.hash = "#/join/" + c;
    });
    inp.focus();
  }
  function joinRoom(code) {
    if (!R.validCode(code)) { renderJoinEntry("That code isn’t valid. Check the screen and try again."); return; }
    if (vSub && V && V.code === code) { renderVoter(); return; }
    if (vSub) vSub.close();
    V = load(vKey(code), null) || { code: code, id: rid(), draft: {}, sent: null, hello: false };
    vState = null; vConn = "connecting"; vLate = false; vStep = complete(V.draft) ? P.length : 0;
    saveV(); renderVoter();
    R.derive(code).then(function (room) {
      vRoom = room;
      vSub = R.listen(room, function (m, t) {
        if (m.t === "state" && (!vState || t >= vState.t)) {
          var newRound = vState && m.r !== vState.r;
          vState = { s: m.s, r: m.r, res: m.res, t: t };
          if (newRound) { vStep = 0; }
          renderVoter();
        }
      }, function (s) { vConn = s; var el = $("v-conn"); if (el) el.innerHTML = statusPill(s); });
      if (!V.hello) R.publish(room, { t: "hello", id: V.id }).then(function () { V.hello = true; saveV(); }, function () { /* counted when they vote */ });
      setTimeout(function () { if (!vState && V && V.code === code) { vLate = true; renderVoter(); } }, 7000);
    });
  }
  function submitVote() {
    var c = {}; CATS.forEach(function (k) { c[k] = V.draft[k]; });
    var btn = $("v-send"); if (btn) { btn.disabled = true; btn.textContent = "Sending…"; }
    R.publish(vRoom, { t: "vote", id: V.id, c: c, r: vState ? vState.r : 1 }).then(function () {
      V.sent = { r: vState ? vState.r : 1, choices: c }; saveV(); renderVoter();
    }, function () {
      if (btn) { btn.disabled = false; btn.textContent = "Send my choices"; }
      toast("Your choices didn’t send. Check your connection and try again.");
    });
  }
  function renderVoter() {
    var head = '<header class="vbar"><a class="back" href="#/" aria-label="Leave">' + icon("back") + '</a><span><b>Room ' + esc(V.code) + '</b></span><span id="v-conn">' + statusPill(vConn) + "</span></header>";
    var body;
    if (!vState) {
      body = vLate && vConn === "live"
        ? '<div class="wait"><p><b>No room with code ' + esc(V.code) + ' yet.</b></p><p class="muted">Check the code on the screen. Rooms close about 12 hours after they start.</p><a class="btn" href="#/join">Type the code again</a></div>'
        : vConn === "connecting" || vConn === "live"
        ? '<div class="wait"><div class="spin" aria-hidden="true"></div><p>Finding the room…</p></div>'
        : '<div class="wait"><p><b>Can’t reach the room.</b></p><p class="muted">The network may block the relay. Ask the facilitator to enter your choices by hand.</p></div>';
    } else if (vState.s === "revealed") {
      body = '<section class="res">' + resultsHtml(vState.res, "The room’s priorities") + (V.sent && V.sent.r === vState.r ? mine() : "") + "</section>";
    } else if (vState.s !== "open") {
      body = '<div class="wait"><p><b>Voting is closed.</b></p><p class="muted">Results will appear here when the facilitator reveals them.</p></div>';
    } else if (V.sent && V.sent.r === vState.r) {
      body = '<div class="done">' + icon("check") + '<h1 class="h-l">Your choices are in</h1><p class="muted">Nobody sees who chose what. Results appear here when the facilitator reveals them.</p>' + mine() +
        '<button type="button" class="btn big" id="v-change">Change my choices</button></div>';
    } else body = vStep < P.length ? voteStep() : review();
    app.innerHTML = '<main class="voter">' + head + body + "</main>";
    wireVoter();
  }
  function mine() {
    if (!V.sent) return "";
    var v = verdict(V.sent.choices);
    return '<div class="mine"><p class="res-k">Your own choices point to</p><p><b>Option ' + v.leader + "</b>, " + esc(opt(v.leader).name.toLowerCase()) + "</p></div>";
  }
  function voteStep() {
    var p = P[vStep], cur = V.draft[p.id];
    return '<section class="step"><div class="prog" aria-label="Priority ' + (vStep + 1) + " of " + P.length + '">' + P.map(function (x, i) { return '<i class="' + (i < vStep ? "d" : i === vStep ? "c" : "") + '"></i>'; }).join("") + "</div>" +
      '<p class="k">Priority ' + (vStep + 1) + " of " + P.length + '</p><h1 class="h-l">' + esc(p.name) + '</h1><p class="q">' + esc(p.q) + "</p>" +
      '<div class="opts">' + LV.map(function (l) {
        var L = lvl(p.id, l);
        return '<button type="button" class="opt" data-pick="' + l + '" aria-pressed="' + (cur === l) + '"><span class="ol">' + HC.levelNames[l] + '</span><b>' + esc(L.name) + "</b><span>" + esc(L.text) + "</span></button>";
      }).join("") + "</div>" +
      '<div class="nav2"><button type="button" class="btn" id="v-prev"' + (vStep === 0 ? " disabled" : "") + ">Back</button><button type=\"button\" class=\"btn pr\" id=\"v-next\"" + (cur ? "" : " disabled") + ">" + (vStep === P.length - 1 ? "Review" : "Next") + "</button></div></section>";
  }
  function review() {
    return '<section class="review"><h1 class="h-l">Check your choices</h1><p class="muted">Tap any priority to change it.</p><ul class="rv">' + P.map(function (p, i) {
      var l = V.draft[p.id];
      return '<li><button type="button" data-go="' + i + '"><span class="rv-n">' + esc(p.name) + '</span><span class="rv-l"><b>' + HC.levelNames[l] + "</b> " + esc(lvl(p.id, l).name) + "</span></button></li>";
    }).join("") + '</ul><button type="button" class="btn pr big" id="v-send">' + icon("vote") + "Send my choices</button><p class=\"fine\">" + icon("lock") + "Encrypted on this phone. Nobody sees who chose what.</p></section>";
  }
  function wireVoter() {
    document.querySelectorAll("[data-pick]").forEach(function (b) { b.addEventListener("click", function () {
      V.draft[P[vStep].id] = b.getAttribute("data-pick"); saveV();
      document.querySelectorAll("[data-pick]").forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); });
      $("v-next").disabled = false;
      /* after a change from the review screen, go straight back to it */
      setTimeout(function () { if (vStep < P.length) { vStep = vBack ? P.length : vStep + 1; vBack = false; renderVoter(); window.scrollTo(0, 0); } }, 220);
    }); });
    if ($("v-prev")) $("v-prev").addEventListener("click", function () { vStep = Math.max(0, vStep - 1); renderVoter(); });
    if ($("v-next")) $("v-next").addEventListener("click", function () { vStep++; renderVoter(); window.scrollTo(0, 0); });
    document.querySelectorAll("[data-go]").forEach(function (b) { b.addEventListener("click", function () { vStep = Number(b.getAttribute("data-go")); vBack = true; renderVoter(); }); });
    if ($("v-send")) $("v-send").addEventListener("click", submitVote);
    if ($("v-change")) $("v-change").addEventListener("click", function () { V.sent = null; saveV(); vStep = P.length; renderVoter(); });
  }

  /* ---------- router ---------- */
  function route() {
    var h = (location.hash || "#/").replace(/^#\/?/, ""), parts = h.split("/");
    if (parts[0] !== "join" && vSub) { vSub.close(); vSub = null; }
    if (parts[0] === "host") {
      H = H || load(HOST_KEY, null);
      if (H && !hostSub && !H.offline) connectHost(false);
      renderHost();
    } else if (parts[0] === "join" && parts[1]) joinRoom(R.cleanCode(parts[1]));
    else if (parts[0] === "join") renderJoinEntry();
    else if (parts[0] === "how") renderHow();
    else renderHome();
    window.scrollTo(0, 0);
  }
  window.addEventListener("hashchange", route);
  route();

  if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) navigator.serviceWorker.register("sw.js").catch(function () { /* offline cache is optional */ });
})();
