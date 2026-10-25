/* ---------- Sort the food: the screen ----------
   "Sort the food for {name}." The foods the child can have at this age, as black wobbly shapes in a field; four places
   above them (Keep out, Not a fan, Tried already, Untouched); a status row between. The big ones come first and must all
   be placed; the everyday foods follow, a food group at a time, and are optional. Every change is saved as it's made
   (profile.foodSort), and the plan reads it only through getFoodRules (sortcore.js). Numbers: sortconfig.js.
   mountSortFood({card, foot, profile, months, single, onContinue}) builds it into the onboarding's card and foot; the
   top bar isn't its own. sortUI is the live screen (the tests reach in). */

const SORT_SEEDS = {sizes:null, ready:Promise.resolve()};
/* the list, loaded once (the service worker keeps it); ready settles either way, and within 800 ms at most */
SORT_SEEDS.ready = typeof fetch!=="function" ? Promise.resolve() : Promise.race([
  fetch("curatedSeeds.json").then(r=>r.ok ? r.json() : null).then(j=>{ if(j && j.sizes) SORT_SEEDS.sizes = j.sizes; }).catch(()=>{}),
  new Promise(r=>setTimeout(r, 800))
]);
/* one of the curated seeds for this viewport (the nearest measured size), or a fresh one while the list loads */
function pickSortSeed(){
  const sizes = SORT_SEEDS.sizes, q = new URLSearchParams(location.search).get("sortseed");
  if(q) return +q;
  if(!sizes) return (Date.now() & 0x7fffffff) % 1000000;
  const key = Object.keys(sizes).map(k=>{ const [w, h] = k.split("x").map(Number); return [k, Math.abs(w - innerWidth) + Math.abs(h - innerHeight)]; }).sort((a, b)=>a[1] - b[1])[0][0];
  const list = sizes[key].seeds;
  return list[Math.floor(Math.random() * list.length)];
}

let sortUI = null;
const SF_PLACES = SORT_PLACES;
const sfSay = (k, v)=>say("sort." + k, v);
const sfLabel = id=>(FOOD_BY_ID[id] || {}).label || id;
/* a shape's label: the food's name, or, where that name alone reads as a locked food ("Grapes"), the way the plan
   serves it ("Grapes, quartered") */
function sfShapeLabel(id, months){
  const f = FOOD_BY_ID[id];
  if(!f || SORT_CONFIG.bigFoods.includes(id) || !lockedRule(f.label, months)) return sfLabel(id);
  const pool = FOOD_POOL.find(p=>foodOf(p.name)===f);
  return pool ? pool.name : f.label;
}

function mountSortFood(o){
  const C = SORT_CONFIG, P = o.profile, card = o.card;
  if(sortUI) sortUI.destroy();
  // the sort, written down the first time the screen opens (from the old fields, for a family that had none)
  if(!P.foodSort){ P.foodSort = JSON.parse(JSON.stringify(legacyFoodSort(P))); }
  const S = P.foodSort;
  const persist = ()=>{ syncLegacyFromSort(P); o.save(); };
  // the seed: one of the curated ones, once the list is in (a fresh one if it never comes)
  const seeded = S.shapeSeed===null || S.shapeSeed===undefined ? SORT_SEEDS.ready.then(()=>{ if(S.shapeSeed===null || S.shapeSeed===undefined){ S.shapeSeed = pickSortSeed(); persist(); } }) : Promise.resolve();
  persist();

  const ui = {o, P, S, card, view:"big", tab:C.groups[0][0], selected:new Set(), undo:null, sorted:0, hint2:"idle",
              shapes:new Map(), touched:false, timers:[], gone:false};
  sortUI = ui;
  const later = (fn, ms)=>{ const t = setTimeout(()=>{ if(!ui.gone) fn(); }, ms); ui.timers.push(t); return t; };
  ui.later = later;

  /* ---------- the foods ---------- */
  const big = C.bigFoods.slice();
  const everyday = sortEverydayFoods(o.months).map(f=>f.id);
  const placeOf = id=>S.placement[id] || null;
  const bigLeft = ()=>big.filter(id=>!placeOf(id));
  const bigDone = ()=>bigLeft().length===0;
  const inPlace = place=>{
    const ids = Object.keys(S.placement).filter(id=>S.placement[id]===place);
    const order = big.concat(everyday);
    return ids.sort((a, b)=>order.indexOf(a) - order.indexOf(b));
  };
  const groupOf = id=>{ const g = (FOOD_BY_ID[id] || {}).group; const t = C.groups.find(([, gs])=>gs.includes(g)); return t ? t[0] : null; };
  /* what the field holds now: the big ones still to place, or the tab's unplaced everyday foods (MAX_PILE at most,
     Something else counting as one) */
  const pileIds = ()=>{
    if(ui.view==="big") return bigLeft();
    return everyday.filter(id=>groupOf(id)===ui.tab && !placeOf(id)).slice(0, (ui.room || C.MAX_PILE) - 1);
  };
  ui.pileIds = pileIds;
  ui.pileItems = ()=>pileItems();
  ui.pileSeed = ()=>pileSeed();

  /* ---------- the page ---------- */
  card.classList.add("fill", "sf");
  card.innerHTML = "";
  const head = document.createElement("div"); head.className = "sf-head";
  const h = document.createElement("h1"); h.className = "sf-title"; h.id = "onbTitle"; h.tabIndex = -1;
  h.textContent = sfSay("title", {name:P.name || say("mealTimes.they")});
  const prog = document.createElement("span"); prog.className = "sf-prog";
  const side = document.createElement("div"); side.className = "sf-side"; side.appendChild(prog);
  const titleRow = document.createElement("div"); titleRow.className = "sf-trow"; titleRow.append(h, side);
  const lockedBtn = textButton(sfSay("lockedLink"), ()=>openLocked(), "small inline sf-locked");
  head.append(titleRow, lockedBtn);

  const grid = document.createElement("div"); grid.className = "sf-places";
  const cells = {};
  SF_PLACES.forEach(place=>{
    const b = document.createElement("button");
    b.type = "button"; b.className = "sf-place"; b.dataset.place = place;
    b.innerHTML = `<span class="sf-pl-label">${esc(sfSay("places." + place))}</span><span class="sf-pl-mean">${esc(sfSay("meaning." + place))}</span><span class="sf-pl-names"></span><span class="sf-pl-skips"></span>`;
    b.addEventListener("click", ()=>tapPlace(place));
    cells[place] = b; grid.appendChild(b);
  });
  const status = document.createElement("p"); status.className = "sf-status";
  const pileHead = document.createElement("div"); pileHead.className = "sf-pilehead";
  const field = document.createElement("div"); field.className = "sf-field";
  const note = document.createElement("p"); note.className = "sf-note"; note.textContent = sfSay("note");
  card.append(head, grid, status, pileHead, note, field);
  ui.el = {head, h, prog, side, lockedBtn, grid, cells, status, pileHead, field, note};

  const next = onbCta(card, o.single ? say("onb.save") : sfSay("next"), ()=>finish(), {ready:bigDone()});
  next.classList.add("sf-next");
  next.addEventListener("click", ()=>{ if(!bigDone()){ ui.gateShown = true; paintStatus(); } });
  ui.next = next;

  /* ---------- placing ---------- */
  /* ids → place (null = back to the pile). One undo: the latest change only. */
  function place(ids, to, opts){
    ids = ids.filter(id=>id && placeOf(id)!==to);
    if(!ids.length) return;
    const prev = {};
    ids.forEach(id=>{ prev[id] = placeOf(id); if(to) S.placement[id] = to; else delete S.placement[id]; ui.selected.delete(id); });
    ui.sorted++;
    persist();
    if(!(opts && opts.noUndo)) setUndo({kind:"place", ids, prev, to});
    afterChange(opts);
  }
  ui.place = place;
  function setUndo(u){
    clearTimeout(ui.undoT);
    ui.undo = u;
    ui.undoT = later(()=>{ ui.undo = null; if(ui.hint2==="armed") ui.hint2 = "show"; paintStatus(); }, C.UNDO_MS);
  }
  function undo(){
    const u = ui.undo;
    if(!u) return;
    clearTimeout(ui.undoT); ui.undo = null;
    if(u.kind==="place") Object.entries(u.prev).forEach(([id, p])=>{ if(p) S.placement[id] = p; else delete S.placement[id]; });
    if(u.restore) u.restore();
    persist();
    afterChange({undo:true});
    if(ui.list) ui.list.paint();
  }
  ui.undoNow = undo;
  function afterChange(opts){
    if(ui.sorted===1 && ui.hint2==="idle") ui.hint2 = "armed";
    paintPlaces(); paintProgress(); paintStatus(); paintPileHead();
    next.ready(bigDone());
    if(ui.view!=="big" && !bigDone()){ ui.view = "big"; clearTimeout(ui.secondT); ui.secondT = null; paintPileHead(); paintProgress(); sortLayout(ui); buildPile(); entrance(); }
    else syncPile(opts);
    if(ui.view==="big" && bigDone()) firstPileDone();
    if(ui.onChange) ui.onChange(opts);
  }
  /* ---------- the first pile done: the glow pulses once, the summary holds the status row for SUMMARY_MS, and
     SECOND_PILE_MS later the everyday foods come in (or, before solids, the line that says when) ---------- */
  function firstPileDone(){
    if(ui.secondT) return;
    const first = !S.firstPileComplete;
    if(first){
      S.firstPileComplete = true; persist();
      pulseGlow();
      const n = p=>big.filter(id=>placeOf(id)===p).length;
      const parts = SF_PLACES.map(p=>[p, n(p)]).filter(([, k])=>k > 0).map(([p, k])=>sfSay("summary." + p, {n:k}));
      showMoment("summary", parts.join(" · ") + ".", C.SUMMARY_MS);
    }
    ui.secondT = later(()=>{
      ui.secondT = null;
      if(!bigDone() || ui.finishing) return;
      if(everyday.length){ ui.view = "everyday"; ui.tab = C.groups.find(([k])=>everyday.some(id=>groupOf(id)===k))[0]; }
      else{ ui.view = "none"; const m = Math.max(1, 6 - o.months); ui.noSolids = sfSay("noSolids", {n:m}); }
      ui.selected.clear();
      paintPileHead(); paintProgress(); paintStatus(); sortLayout(ui); buildPile(); entrance();
    }, first ? C.SECOND_PILE_MS : 0);
  }
  function showMoment(mode, text, ms){
    clearTimeout(ui.momentT);
    ui.moment = {mode, text};
    paintStatus();
    ui.momentT = later(()=>{ ui.moment = null; paintStatus(); }, ms);
  }
  function pulseGlow(){
    const g = document.querySelector("#onboarding .glow-plane");
    if(!g || calm()) return;
    g.animate([{opacity:1, transform:"scale(1)"}, {opacity:1, transform:"scale(1.14)", offset:.35}, {opacity:1, transform:"scale(1)"}], {duration:C.PULSE_MS, easing:"cubic-bezier(.22,.61,.36,1)"});
    ui.pulsed = (ui.pulsed || 0) + 1;
  }
  /* ---------- a pile's entrance: composed, a 200 ms fade; if nothing's touched in 1.2 s, the first shape wiggles once ---------- */
  function entrance(){
    if(!calm()) field.animate([{opacity:0}, {opacity:1}], {duration:C.ENTRANCE_MS});
    clearTimeout(ui.wiggleT);
    ui.touched = false;
    ui.wiggleT = later(()=>{
      if(ui.touched || ui.press || calm()) return;
      const first = [...ui.shapes.values()].find(x=>x.id!=="+else");
      if(!first) return;
      first.wiggle = performance.now(); ui.wiggled = first.id;
      ui.wake();
    }, C.WIGGLE_AFTER_MS);
  }
  ui.cancelWiggle = ()=>{ clearTimeout(ui.wiggleT); ui.shapes.forEach(x=>{ x.wiggle = null; }); };
  ui.afterChange = afterChange;

  /* ---------- the places: a label, a meaning, then what's in each (two lines at most, then "+n") ---------- */
  const reach = ()=>{
    const r = getFoodRules(P, FOODS), never = new Set(r.neverIds);
    const own = new Set(inPlace("keepOut"));
    S.custom.filter(c=>c.place==="keepOut").forEach(c=>own.add("+" + c.id));
    // the foods kept out only because of something else: a kept-out allergen or a custom match
    return [...never].filter(id=>!own.has(id) && S.placement[id]!=="keepOut" && !big.includes(id));
  };
  ui.reach = reach;
  function namesIn(place){
    const n = inPlace(place).map(sfLabel);
    S.custom.filter(c=>c.place===place).forEach(c=>n.push(c.label));
    return n;
  }
  ui.namesIn = namesIn;
  /* the names as one comma line that fits two lines of the cell (mono: every character is 0.6em), then "+n" */
  function fitNames(names, width, px){
    const per = Math.max(4, Math.floor(width / (px * MONO_ADVANCE)));
    for(let k = names.length; k >= 0; k--){
      const rest = names.length - k, text = names.slice(0, k).join(", ") + (rest ? (k ? " " : "") + sfSay("more", {n:rest}) : "");
      if(lineCount(text, per) <= 2) return text;
    }
    return sfSay("more", {n:names.length});
  }
  function lineCount(text, per){
    let lines = 1, col = 0;
    text.split(" ").forEach(w=>{ const l = w.length; if(col===0){ col = l; return; } if(col + 1 + l > per){ lines++; col = l; } else col += 1 + l; });
    return lines;
  }
  function paintPlaces(){
    SF_PLACES.forEach(place=>{
      const c = cells[place], names = namesIn(place);
      const box = c.querySelector(".sf-pl-names");
      box.textContent = names.length ? fitNames(names, (c.clientWidth || 160) - 24, 15) : "";
      const sk = c.querySelector(".sf-pl-skips");
      if(place==="keepOut"){ const n = reach().length; sk.textContent = n ? sfSay("skips", {n}) : ""; sk.hidden = !n; }
      else sk.hidden = true;
      c.classList.toggle("has", names.length > 0);
    });
  }
  function paintProgress(){
    const ids = ui.view==="big" ? big : big.concat(everyday);
    prog.textContent = sfSay("progress", {n:ids.filter(id=>placeOf(id)).length, m:ids.length});
  }

  /* ---------- the status row: one thing at a time ----------
     Undo, then a selection, then the gate (once there's been a sort, or Next was tapped), then a hint (Drag {food} …
     before the first sort; "Tap several…" once, after it) */
  function paintStatus(){
    status.innerHTML = "";
    status.dataset.mode = "";
    const set = (mode, text, btn)=>{
      status.dataset.mode = mode;
      const t = document.createElement("span"); t.className = "sf-st-t"; t.textContent = text; status.appendChild(t);
      if(btn){ status.append(" · "); status.appendChild(btn); }
    };
    if(ui.moment){ set(ui.moment.mode, ui.moment.text); return; }
    const u = ui.undo;
    if(u){
      const text = u.text || (u.ids.length===1 ? sfSay("moved", {food:sfLabel(u.ids[0]), place:u.to ? sfSay("places." + u.to) : sfSay("back")}) : sfSay("movedMany", {n:u.ids.length, place:u.to ? sfSay("places." + u.to) : sfSay("back")}));
      set("undo", text, textButton(sfSay("undo"), undo, "small inline sf-undo"));
      return;
    }
    if(ui.selected.size){
      set("selection", sfSay("selected", {n:ui.selected.size}));
      const cl = textButton(sfSay("clear"), ()=>{ ui.selected.clear(); paintSelection(); }, "small inline sf-clear");
      status.appendChild(cl);
      return;
    }
    if(ui.view==="big" && !bigDone() && (ui.sorted > 0 || ui.gateShown) && ui.hint2!=="show"){ set("gate", sfSay("gate", {n:bigLeft().length})); return; }
    if(ui.hint2==="show"){ set("hint", sfSay("hintTap")); return; }
    if(ui.sorted===0 && ui.view==="big"){ const first = pileIds()[0]; if(first){ set("hint", sfSay("hintDrag", {food:sfLabel(first)})); return; } }
    if(ui.view==="none" && ui.noSolids){ set("info", ui.noSolids); return; }
  }
  ui.paintStatus = paintStatus;

  /* ---------- the pile's header: its name (or the five tabs), and Select all ---------- */
  function paintPileHead(){
    note.hidden = ui.view!=="big";
    pileHead.innerHTML = "";
    pileHead.classList.toggle("tabs", ui.view==="everyday");
    if(ui.view==="big"){
      const n = document.createElement("span"); n.className = "sf-pilename"; n.textContent = sfSay("pileBig");
      pileHead.appendChild(n);
    }else if(ui.view==="everyday"){
      const t = document.createElement("div"); t.className = "sf-tabs";
      C.groups.forEach(([key], k)=>{
        if(k) t.append(" · ");
        const b = document.createElement("button");
        b.type = "button"; b.className = "sf-tab"; b.dataset.tab = key; b.textContent = sfSay("tabs." + key);
        b.setAttribute("aria-pressed", String(ui.tab===key));
        b.addEventListener("click", ()=>{ if(ui.tab===key) return; ui.tab = key; try{ sessionStorage.setItem("sortTab", key); }catch(e){} ui.selected.clear(); paintPileHead(); paintStatus(); buildPile(); entrance(); });
        t.appendChild(b);
      });
      pileHead.appendChild(t);
      const on = t.querySelector('[aria-pressed="true"]');
      if(on) requestAnimationFrame(()=>{ t.scrollLeft = Math.max(0, on.offsetLeft - (t.clientWidth - on.offsetWidth) / 2); });
    }else return;
    const ids = pileIds();
    const all = ids.length && ids.every(id=>ui.selected.has(id));
    const sa = textButton(all ? sfSay("clear") : sfSay("selectAll"), ()=>{
      if(all) ui.selected.clear(); else ids.forEach(id=>ui.selected.add(id));
      paintSelection();
    }, "small sf-selall");
    sa.hidden = !ids.length;
    pileHead.appendChild(sa);
  }
  ui.paintPileHead = paintPileHead;
  function paintSelection(){
    ui.shapes.forEach((s, id)=>s.el.classList.toggle("is-sel", ui.selected.has(id)));
    paintStatus(); paintPileHead();
  }
  ui.paintSelection = paintSelection;

  /* ---------- the field: the shapes, sized and packed from the seed ---------- */
  ui.fieldSize = ()=>{ const r = field.getBoundingClientRect(); return {w:r.width, h:r.height, left:r.left, top:r.top}; };
  function shapeEl(id, s, d){
    const b = document.createElement("button");
    b.type = "button"; b.className = "sf-shape"; b.dataset.id = id;
    const box = shapeBox(s, d), label = id==="+else" ? sfSay("somethingElse") : sfShapeLabel(id, o.months);
    if(id==="+else") b.classList.add("else");
    b.style.width = box.w.toFixed(1) + "px"; b.style.height = box.h.toFixed(1) + "px";
    b.style.borderRadius = shapeRadiusCSS(s);
    const lines = labelLines(label), px = labelSize(label, box.w);
    b.innerHTML = `<span class="sf-lbl" style="font-size:${px}px">${lines.map(esc).join("<br>")}</span>`;
    b.setAttribute("aria-label", label);
    return b;
  }
  ui.shapeEl = shapeEl;
  function render(s){
    const b = s.body;
    let k = 1;
    if(s.grow){ const t = Math.min(1, (performance.now() - s.grow.t0) / C.FLOW_MS); k = s.grow.from + (1 - s.grow.from) * (1 - Math.pow(1 - t, 3)); if(t >= 1) s.grow = null; }
    let wig = 0;
    if(s.wiggle){ const t = (performance.now() - s.wiggle) / C.WIGGLE_MS; if(t >= 1) s.wiggle = null; else { wig = C.WIGGLE_DEG * Math.sin(t * Math.PI * 2) * (1 - t * .3); world.still = 0; } }
    s.el.style.transform = `translate3d(${(b.x - s.w / 2).toFixed(1)}px, ${(b.y - s.h / 2).toFixed(1)}px, 0) rotate(${(bodyDeg(b) + wig).toFixed(2)}deg)` + (k!==1 ? ` scale(${k.toFixed(3)})` : "");
  }
  ui.render = render;
  const paintBodies = ()=>ui.shapes.forEach(render);
  ui.paintBodies = paintBodies;

  /* ---------- the engine's loop: a fixed DT with an accumulator, and no rAF at all while it sleeps or the tab is
     hidden. ui.frames counts rAF callbacks (the tests check it stops). Woken by a touch, a sort, a resize, a new pile. */
  const world = sortWorld(0, 0);
  ui.world = world; ui.frames = 0;
  let raf = 0, last = 0, acc = 0;
  function frame(t){
    raf = 0; ui.frames++;
    if(document.hidden || ui.gone) return;
    const dt = Math.min(.1, (t - (last || t)) / 1000); last = t; acc += dt;
    let asleep = false;
    while(acc >= C.DT){ acc -= C.DT; asleep = sortStep(world); if(asleep) break; }
    paintBodies();
    if(ui.onFrame) ui.onFrame();
    if(asleep){ last = 0; acc = 0; return; }
    raf = requestAnimationFrame(frame);
  }
  ui.wake = ()=>{ world.still = 0; world.asleep = false; if(raf || ui.gone || document.hidden) return; last = 0; acc = 0; raf = requestAnimationFrame(frame); };
  ui.stopEngine = ()=>{ if(raf) cancelAnimationFrame(raf); raf = 0; document.removeEventListener("visibilitychange", onVis); if(ui.ro) ui.ro.disconnect(); };
  ui.running = ()=>!!raf;
  /* the tests: n steps at once (or until asleep) */
  ui.step = n=>{ for(let k = 0; k < n; k++) if(sortStep(world)) break; paintBodies(); return world.asleep; };
  const onVis = ()=>{ if(document.hidden){ if(raf) cancelAnimationFrame(raf); raf = 0; } else if(!world.asleep) ui.wake(); };
  document.addEventListener("visibilitychange", onVis);
  function pileItems(){
    const ids = pileIds().map(id=>({id, label:sfShapeLabel(id, o.months)}));
    if(ui.view==="everyday") ids.push({id:"+else", label:sfSay("somethingElse")});
    return ids;
  }
  /* each pile's seed: the family's, and the tab's place among the five */
  const pileSeed = ()=>(S.shapeSeed + (ui.view==="everyday" ? 7919 * (C.groups.findIndex(g=>g[0]===ui.tab) + 1) : 0)) >>> 0;
  /* the pile from scratch: new shapes, packed from the seed (a new pile, a tab, a resize) */
  /* MAX_PILE is a maximum: an everyday pile shows as many as pack in this field (a small phone holds fewer) */
  function roomFor(fs){
    if(ui.view!=="everyday") return C.MAX_PILE;
    for(let n = C.MAX_PILE; n > 4; n--){
      ui.room = n;
      if(pileFor(pileItems(), {w:fs.w, h:fs.h}, pileSeed()).pack.ok) return n;
    }
    return 4;
  }
  function buildPile(){
    field.querySelectorAll(".sf-shape, .sf-empty").forEach(x=>x.remove());
    ui.shapes.clear();
    const fs = ui.fieldSize();
    if(!fs.w || !fs.h) return;
    ui.room = roomFor(fs);
    const items = pileItems();
    const pile = pileFor(items, {w:fs.w, h:fs.h}, pileSeed());
    ui.pack = pile.pack;
    world.W = fs.w; world.H = fs.h; world.bodies = [];
    pile.items.forEach((it, k)=>{
      const b = pile.pack.bodies[k], el = shapeEl(it.id, it.shape, b.d);
      const body = sortBody({id:it.id, x:b.x, y:b.y, w:b.w, h:b.h, rot:b.rot});
      const s = {id:it.id, label:it.label, el, shape:it.shape, w:b.w, h:b.h, d:b.d, body};
      bindShape(s);
      world.bodies.push(body);
      ui.shapes.set(it.id, s);
      field.appendChild(el);
      render(s);
    });
    world.still = 0; world.asleep = true;   // composed and still: nothing moves until it's touched
    paintEmpty();
    paintSelection();
    if(ui.onPile) ui.onPile();
  }
  ui.buildPile = buildPile;
  function paintEmpty(){
    let e = field.querySelector(".sf-empty");
    const none = !pileIds().length && ui.view!=="none";
    if(none && !e){ e = document.createElement("p"); e.className = "sf-empty"; e.textContent = sfSay("empty"); field.appendChild(e); }
    if(!none && e) e.remove();
  }
  /* after a change: shapes that left the pile go, the rest stay where they are (the physics and the re-flow take over
     in later layers); a change that brings one back rebuilds */
  function syncPile(opts){
    const items = pileItems(), want = new Set(items.map(x=>x.id));
    let changed = !!(opts && opts.dropped);
    ui.shapes.forEach((s, id)=>{ if(!want.has(id)){ s.el.remove(); detach(id); changed = true; } });
    const back = items.filter(x=>!ui.shapes.has(x.id));
    if(back.length){ addShapes(back); changed = true; }
    if(changed) reflow();
    paintEmpty();
  }
  /* shapes coming (back) into the pile: their own shape, rising from the field's lower middle, then the re-flow */
  function addShapes(items){
    const fs = ui.fieldSize(), seed = pileSeed();
    items.forEach((it, k)=>{
      const shape = makeShape(sortRng(sortHash(it.id, seed))), d = C.MIN_D, box = shapeBox(shape, d);
      const el = shapeEl(it.id, shape, d);
      const body = sortBody({id:it.id, x:fs.w / 2 + (k - (items.length - 1) / 2) * 30, y:fs.h - box.h / 2, w:box.w, h:box.h, rot:shape.rot});
      const s = {id:it.id, label:it.label, el, shape, w:box.w, h:box.h, d, body};
      bindShape(s);
      world.bodies.push(body); ui.shapes.set(it.id, s); field.appendChild(el); render(s);
      if(!calm()) el.animate([{opacity:0}, {opacity:1}], {duration:C.FLOW_MS});
    });
    paintSelection();
  }
  function detach(id){
    const s = ui.shapes.get(id);
    if(!s) return null;
    ui.shapes.delete(id); world.bodies = world.bodies.filter(b=>b!==s.body);
    return s;
  }
  /* the rest of the pile grows toward the same coverage (MAX_D at most) and glides to its new packing, FLOW_MS */
  function reflow(){
    const list = [...ui.shapes.values()];
    if(!list.length) return;
    const fs = ui.fieldSize(), start = {};
    list.forEach(x=>{ start[x.id] = {x:x.body.x, y:x.body.y}; });
    const its = list.map(x=>({id:x.id, label:x.label, shape:x.shape})), rr = sortRng(S.shapeSeed ^ list.length);
    let pack = packShapes(its, {w:fs.w, h:fs.h}, rr, start, C.PACK_ROOMY);
    if(!(pack.ok && pack.scale===1)) pack = packShapes(its, {w:fs.w, h:fs.h}, sortRng(S.shapeSeed ^ list.length), start);
    pack.bodies.forEach(b=>{
      const x = ui.shapes.get(b.id), body = x.body;
      if(x.held || body.held) return;
      if(Math.abs(b.d - x.d) > .5){
        // the new size at once, drawn at the old size and scaled up to it (the label scales with it)
        x.grow = {from:x.w / b.w, t0:performance.now()};
        x.w = b.w; x.h = b.h; x.d = b.d;
        x.el.style.width = b.w.toFixed(1) + "px"; x.el.style.height = b.h.toFixed(1) + "px";
        x.el.firstChild.style.fontSize = labelSize(x.label, b.w) + "px";
        Object.assign(body, sortBody({id:b.id, x:body.x, y:body.y, w:b.w, h:b.h, rot:body.rot0}), {a:body.a});
      }
      body.flow = {x0:body.x, y0:body.y, x1:b.x, y1:b.y, t0:world.t, ms:C.FLOW_MS};
    });
    ui.wake();
  }
  ui.reflow = reflow;
  ui.syncPile = syncPile;

  /* ---------- the gestures: a press on a shape is a tap or a drag ----------
     Pointer capture; past DRAG_THRESHOLD the shape lifts and follows the finger 1:1 (keeping where it was held) and
     pushes what it meets; a drag never changes the selection. While it's held, the place under the finger (or the
     nearest within SNAP_RADIUS) swells and the other three dim; let go over it and the food is sorted there; let go
     anywhere else and the shape stays where it stops. */
  function bindShape(s){
    s.el.addEventListener("pointerdown", e=>down(s, e));
    // Enter or Space: a tap. A click that follows a press (any pointer) is that press's own, already handled
    s.el.addEventListener("click", ()=>{ if(performance.now() - (s.pressedAt || -1e9) > 800) keyTap(s); });
  }
  const toField = (cx, cy)=>{ const r = field.getBoundingClientRect(); return {x:cx - r.left, y:cy - r.top}; };
  function down(s, e){
    if(ui.finishing || ui.press || !ui.shapes.has(s.id)) return;
    e.preventDefault();
    try{ s.el.setPointerCapture(e.pointerId); }catch(err){}
    const p = toField(e.clientX, e.clientY), b = s.body;
    ui.touched = true; s.pressedAt = performance.now();
    ui.press = {s, id:e.pointerId, x0:e.clientX, y0:e.clientY, t0:performance.now(), dx:p.x - b.x, dy:p.y - b.y, lifted:false,
                moving:Math.hypot(b.vx, b.vy) > C.TAP_MOVING_SPEED || !!b.flow};
    const move = ev=>{ if(ev.pointerId===ui.press.id) drag(ev); };
    const up = ev=>{ if(ev.pointerId!==ui.press.id) return; s.el.removeEventListener("pointermove", move); s.el.removeEventListener("pointerup", up); s.el.removeEventListener("pointercancel", up); release(ev, ev.type==="pointercancel"); };
    s.el.addEventListener("pointermove", move);
    s.el.addEventListener("pointerup", up);
    s.el.addEventListener("pointercancel", up);
  }
  function drag(e){
    const pr = ui.press, s = pr.s;
    if(!pr.lifted){
      if(Math.hypot(e.clientX - pr.x0, e.clientY - pr.y0) <= C.DRAG_THRESHOLD) return;
      pr.lifted = true;
      if(ui.cancelWiggle) ui.cancelWiggle();
      s.held = true; s.body.held = true; s.body.flow = null;
      s.el.classList.add("is-held");
      field.appendChild(s.el);   // the top layer
    }
    const p = toField(e.clientX, e.clientY);
    s.body.tx = p.x - pr.dx; s.body.ty = p.y - pr.dy;
    ui.wake();
    target(placeAt(e.clientX, e.clientY));
  }
  function release(e, cancelled){
    const pr = ui.press, s = pr.s;
    ui.press = null;
    if(pr.lifted){
      const to = cancelled ? null : placeAt(e.clientX, e.clientY);
      target(null);
      s.held = false; s.body.held = false;
      s.el.classList.remove("is-held");
      if(to && s.id!=="+else"){ drop([s.id], to); return; }
      ui.wake();   // it keeps the finger's speed, then stops where it stops
      return;
    }
    if(cancelled) return;
    if(performance.now() - pr.t0 > C.TAP_MAX_MS || pr.moving) return;   // too long, or it was still moving
    tap(s);
  }
  function keyTap(s){ if(!ui.press) tap(s); }
  /* a tap toggles the shape's selection (a 3px ink ring at a 4px offset); Something else opens its sheet instead */
  function tap(s){
    if(s.id==="+else"){ if(ui.openCustom) ui.openCustom(); return; }
    if(ui.selected.has(s.id)) ui.selected.delete(s.id); else ui.selected.add(s.id);
    ui.touched = true;
    if(ui.cancelWiggle) ui.cancelWiggle();
    haptic();
    paintSelection();
  }
  ui.tap = id=>{ const s = ui.shapes.get(id); if(s) tap(s); };
  /* the place under (cx, cy), or the nearest within SNAP_RADIUS */
  function placeAt(cx, cy){
    let best = null, bd = Infinity;
    SF_PLACES.forEach(pl=>{
      const r = cells[pl].getBoundingClientRect();
      const dx = Math.max(r.left - cx, 0, cx - r.right), dy = Math.max(r.top - cy, 0, cy - r.bottom), d = Math.hypot(dx, dy);
      if(d < bd){ bd = d; best = pl; }
    });
    return bd <= C.SNAP_RADIUS ? best : null;
  }
  ui.placeAt = placeAt;
  function target(pl){
    if(ui.target===pl) return;
    ui.target = pl;
    grid.classList.toggle("is-aiming", !!pl);
    SF_PLACES.forEach(k=>cells[k].classList.toggle("is-target", k===pl));
    if(pl) haptic();
  }
  ui.aim = target;
  /* the drop: each shape shrinks and fades into its cell (DROP_MS, a spring, DROP_STAGGER_MS apart), one ring ripples
     out from the cell, and the food is sorted at once (its name in the list, the counts, the re-flow) */
  function drop(ids, to){
    const cell = cells[to], cr = cell.getBoundingClientRect(), fr = field.getBoundingClientRect();
    const cx = cr.left + cr.width / 2 - fr.left, cy = cr.top + cr.height / 2 - fr.top;
    ids.forEach((id, k)=>{
      const s = detach(id);
      if(!s) return;
      s.el.classList.remove("is-sel", "is-held");
      s.el.style.pointerEvents = "none";
      const from = s.el.style.transform, b = s.body;
      const toT = `translate3d(${(cx - s.w / 2).toFixed(1)}px, ${(cy - s.h / 2).toFixed(1)}px, 0) rotate(${bodyDeg(b).toFixed(2)}deg) scale(.2)`;
      const a = s.el.animate([{transform:from, opacity:1}, {transform:toT, opacity:0}], {duration:C.DROP_MS, delay:k * C.DROP_STAGGER_MS, easing:"cubic-bezier(.32,1.25,.5,1)", fill:"both"});
      a.onfinish = ()=>s.el.remove();
    });
    ripple(cell, (ids.length - 1) * C.DROP_STAGGER_MS + C.DROP_MS * .6);
    haptic();
    place(ids, to, {dropped:true});
  }
  ui.drop = drop;
  function ripple(cell, delay){
    const r = document.createElement("i");
    r.className = "sf-ripple";
    cell.appendChild(r);
    r.animate([{transform:"scale(.6)", opacity:.5}, {transform:"scale(1.25)", opacity:0}], {duration:420, delay, easing:"cubic-bezier(.22,.61,.36,1)", fill:"both"}).onfinish = ()=>r.remove();
  }

  /* ---------- tapping a place: send the selection, or open its list ---------- */
  function tapPlace(place){
    if(ui.finishing) return;
    if(ui.selected.size){ drop([...ui.selected].filter(id=>ui.shapes.has(id)), place); return; }   // the selection goes, 40 ms apart
    if(ui.openList) ui.openList(place);
  }
  ui.tapPlace = tapPlace;

  /* ---------- a place's list: what's in it, each with Move (or Remove, for the family's own) ----------
     A bottom sheet with a scrim, Close and a swipe down; 44px rows. Move opens inline into the other places and "Back to
     the pile"; every move shows the undo line and closes the row. Keep out adds what's skipped with each allergen. */
  function openList(pl){
    const sh = onbSheet({modal:true, title:sfSay("places." + pl), cls:"sf-sheet sf-list", onClose:()=>{ ui.list = null; cells[pl].focus({preventScroll:true}); }});
    const mean = document.createElement("p"); mean.className = "sh-hint sf-list-mean"; mean.textContent = sfSay("meaning." + pl);
    sh.body.querySelector(".sh-title").after(mean);
    const box = document.createElement("div"); box.className = "sf-list-box";
    sh.body.appendChild(box);
    ui.list = {place:pl, sheet:sh, paint};
    function row(label, actions){
      const r = document.createElement("div"); r.className = "sf-row";
      const t = document.createElement("span"); t.className = "sf-row-t"; t.textContent = label;
      r.append(t, ...actions);
      return r;
    }
    function paint(){
      box.innerHTML = "";
      const ids = inPlace(pl), own = S.custom.filter(c=>c.place===pl);
      if(!ids.length && !own.length){ const n = document.createElement("p"); n.className = "sf-list-none"; n.textContent = sfSay("nothingHere"); box.appendChild(n); }
      ids.forEach(id=>{
        const opts = document.createElement("div"); opts.className = "sf-moves"; opts.hidden = true;
        SF_PLACES.filter(p=>p!==pl).map(p=>[p, sfSay("places." + p)]).concat([[null, sfSay("back")]]).forEach(([to, label], k)=>{
          if(k) opts.append(" · ");
          opts.appendChild(textButton(label, ()=>{ place([id], to); paint(); }, "small inline sf-move-to"));
        });
        const mv = textButton(sfSay("move"), ()=>{ box.querySelectorAll(".sf-moves").forEach(x=>{ if(x!==opts) x.hidden = true; }); opts.hidden = !opts.hidden; }, "small sf-move");
        const r = row(sfLabel(id), [mv]); r.dataset.id = id;
        r.appendChild(opts);
        box.appendChild(r);
      });
      own.forEach(c=>{
        const r = row(c.label, [textButton(sfSay("remove"), ()=>{ removeCustom(c.id); paint(); }, "small sf-remove")]);
        r.dataset.custom = c.id;
        box.appendChild(r);
      });
      if(pl==="keepOut"){
        const fromBig = new Set(big.filter(a=>placeOf(a)==="keepOut"));
        S.custom.filter(c=>c.place==="keepOut").forEach(c=>(c.matchedFoodIds || []).forEach(id=>{ if(big.includes(id)) fromBig.add(id); }));
        fromBig.forEach(a=>{
          const foods = FOODS.filter(f=>f.id!==a && f.group!=="other" && f.contains.includes(a)).map(f=>f.label);
          if(!foods.length) return;
          const h = document.createElement("h3"); h.className = "sf-also"; h.textContent = sfSay("alsoSkipped", {allergen:lower1(sfLabel(a))});
          const p = document.createElement("p"); p.className = "sf-also-list"; p.textContent = listJoin(foods.map(lower1)).replace(/^./, c=>c.toUpperCase()) + ".";
          box.append(h, p);
        });
        const tr = document.createElement("p"); tr.className = "sf-traces"; tr.textContent = sfSay("traces");
        box.appendChild(tr);
      }
    }
    paint();
    sfSwipeToClose(sh);
    return sh;
  }
  ui.openList = openList;
  function removeCustom(id){
    const k = S.custom.findIndex(c=>c.id===id);
    if(k < 0) return;
    const [c] = S.custom.splice(k, 1);
    ui.sorted++;
    persist();
    setUndo({kind:"custom", text:sfSay("removed", {food:c.label}), restore:()=>{ S.custom.splice(Math.min(k, S.custom.length), 0, c); }});
    afterChange();
  }
  ui.removeCustom = removeCustom;

  /* ---------- Something else: a food not on the board ----------
     "Also keep out ____." with Keep out (the default) or Not a fan, and Add (Enter too; it waits while the field is
     empty). The keyboard opens in the same tap (focus() inside the handler). What's typed is matched to the manifest;
     the sheet says what it skips (or that it couldn't match it) for RESULT_MS, then closes. Same text again merges;
     MAX_CUSTOM at most. */
  function openCustom(){
    let kind = "keepOut";
    const sh = onbSheet({modal:true, cls:"sf-sheet else-sheet sf-custom", onClose:()=>{ ui.custom = null; }});
    const p = document.createElement("p"); p.className = "sh-sent";
    const inp = document.createElement("input");
    inp.type = "text"; inp.className = "sh-input"; inp.maxLength = 30; inp.id = "sfElse"; inp.autocomplete = "off"; inp.enterKeyHint = "done";
    inp.setAttribute("autocapitalize", "none"); inp.setAttribute("autocorrect", "off"); inp.spellcheck = false;
    const [pre, post] = sfSay("alsoKeepOut").split("____");
    const lb = document.createElement("label"); lb.htmlFor = inp.id; lb.textContent = pre.trim();
    p.append(lb, " ", inp, post);
    const kinds = document.createElement("div"); kinds.className = "kind-toggle sf-kinds";
    ["keepOut", "notFan"].forEach(k=>{
      const kb = document.createElement("button");
      kb.type = "button"; kb.textContent = sfSay("places." + k); kb.dataset.kind = k; kb.setAttribute("aria-pressed", String(kind===k));
      kb.addEventListener("click", ()=>{ kind = k; kinds.querySelectorAll("button").forEach(z=>z.setAttribute("aria-pressed", String(z===kb))); inp.focus(); });
      kinds.appendChild(kb);
    });
    const add = document.createElement("button");
    add.type = "button"; add.className = "btn-ink sf-add"; add.textContent = sfSay("add");
    const res = document.createElement("p"); res.className = "sf-result";
    const full = S.custom.length >= C.MAX_CUSTOM;
    const ready = ()=>{ const on = !!inp.value.trim() && !done; add.disabled = !on; add.classList.toggle("wait", !on); };
    let done = false;
    const commit = ()=>{
      const v = inp.value.trim();
      if(!v || done) return;
      const key = sortKey(v), have = S.custom.find(c=>sortKey(c.label)===key);
      if(!have && S.custom.length >= C.MAX_CUSTOM){ res.textContent = sfSay("full"); return; }
      done = true; ready();
      const ids = matchFood(v, FOODS), before = have ? Object.assign({}, have) : null;
      if(have) Object.assign(have, {place:kind, matchedFoodIds:ids});
      else S.custom.push({id:"c:" + key, label:v, place:kind, matchedFoodIds:ids});
      ui.sorted++;
      persist();
      setUndo({kind:"custom", text:sfSay("moved", {food:v, place:sfSay("places." + kind)}), restore:()=>{
        const k = S.custom.findIndex(c=>c.id===(before ? before.id : "c:" + key));
        if(k < 0) return;
        if(before) S.custom[k] = before; else S.custom.splice(k, 1);
      }});
      afterChange();
      const reach = matchReach(ids, FOODS).map(id=>lower1(sfLabel(id)));
      res.textContent = ids.length ? sfSay("skipsFoods", {foods:listJoin(reach)}) : sfSay("noMatch");
      later(()=>sh.close(), C.RESULT_MS);
    };
    add.addEventListener("click", commit);
    inp.addEventListener("input", ready);
    inp.addEventListener("keydown", e=>{ if(e.key==="Enter"){ e.preventDefault(); commit(); } });
    sh.body.append(p, kinds, add, res);
    if(full) res.textContent = sfSay("full");
    ready();
    sfSwipeToClose(sh);
    inp.focus();   // in the tap itself: iOS opens the keyboard only then
    ui.custom = {sheet:sh, input:inp, add, result:res};
    return sh;
  }
  ui.openCustom = openCustom;

  /* ---------- Always off the plate at this age: the stage's locked foods, each with its reason ---------- */
  function openLocked(){
    const sh = onbSheet({modal:true, title:sfSay("lockedTitle"), cls:"sf-sheet locked-sheet", onClose:()=>lockedBtn.focus()});
    const ul = document.createElement("ul"); ul.className = "lk-list";
    sortLockedItems(o.months).forEach(it=>{ const li = document.createElement("li"); li.innerHTML = `<b>${esc(upper1(it.label))}.</b> ${esc(it.why)}`; ul.appendChild(li); });
    sh.body.appendChild(ul);
  }
  ui.openLocked = openLocked;

  /* ---------- Next ---------- */
  function finish(){
    if(!bigDone() || ui.finishing) return;
    ui.finishing = true;
    if(!S.completedAt) S.completedAt = new Date().toISOString();
    persist();
    const done = ()=>{ if(ui.gone) return; ui.gone = true; o.onContinue(); };
    fall(done);
  }
  ui.finish = finish;
  /* the remaining shapes fall out through the bottom of the field (about FALL_MS, staggered, transform only); taps
     are ignored meanwhile (ui.finishing) */
  function fall(done){
    ui.cancelWiggle(); ui.stopEngine();
    const list = [...ui.shapes.values()].sort((a, b)=>b.body.y - a.body.y);
    if(!list.length || calm()){ done(); return; }
    const H = field.getBoundingClientRect().height, step = Math.min(40, (C.FALL_MS * .4) / list.length);
    let last = null;
    list.forEach((x, k)=>{
      const from = x.el.style.transform, dy = H - x.body.y + x.h + 40;
      last = x.el.animate([{transform:from}, {transform:`translate3d(0, ${dy.toFixed(0)}px, 0) ` + from}], {duration:C.FALL_MS * .6, delay:k * step, easing:"cubic-bezier(.55,0,.9,.4)", fill:"forwards"});
    });
    ui.falling = true;
    last.onfinish = done;
  }

  /* ---------- first paint ---------- */
  ui.destroy = ()=>{ ui.gone = true; ui.timers.forEach(clearTimeout); if(ui.stopEngine) ui.stopEngine(); if(sortUI===ui) sortUI = null; };
  if(bigDone() && S.firstPileComplete && everyday.length){
    // a reload comes back to the same pile and tab; the shapes are packed again from the seed and what's left
    ui.view = "everyday";
    let t = null; try{ t = sessionStorage.getItem("sortTab"); }catch(e){}
    ui.tab = C.groups.some(([k])=>k===t) ? t : C.groups.find(([k])=>everyday.some(id=>groupOf(id)===k))[0];
  }
  else if(bigDone() && S.firstPileComplete){ ui.view = "none"; ui.noSolids = sfSay("noSolids", {n:Math.max(1, 6 - o.months)}); }
  paintPlaces(); paintProgress(); paintPileHead(); paintStatus();
  if(ui.view==="big" && bigDone()) firstPileDone();
  Promise.all([seeded, new Promise(r=>requestAnimationFrame(r))]).then(()=>{
    if(ui.gone) return;
    sortLayout(ui); buildPile(); paintPlaces(); entrance();
    // a new size (a rotation, the keyboard, a font arriving): the pile is packed again for it
    let was = ui.fieldSize();
    ui.ro = new ResizeObserver(()=>{ const n = ui.fieldSize(); if(Math.abs(n.w - was.w) > 1 || Math.abs(n.h - was.h) > 1){ was = n; buildPile(); ui.wake(); } });
    ui.ro.observe(field);
    if(ui.onMount) ui.onMount();
    if(/[?&]tune=1\b/.test(location.search) && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)) sortTuneLoad(ui);
  });
  return ui;
}

/* the stage's locked foods with their reasons (content.js: sort.lockedWhy) */
function sortLockedItems(months){
  return stageFor(Math.max(6, months)).locked.split(", ").map(label=>({label, why:say("sort.lockedWhy." + label)}));
}

/* ---------- the layout: the page never scrolls ----------
   The title block, the places, the status row and the pile's header take their heights; the field takes the rest.
   The places' rows are 118px on a tall phone (800px and up), 96px on a short one, never under 92 (and the meaning
   line hides in a cell under 100px). When the field is shorter than its minimum (220px tall, 170px short) or can't
   pack its pile, the fallbacks go in order: hide the meaning lines, hide Keep out's "Skips" line, fold the "Always off
   the plate" link into the title row, then let the pile go down to 150px. ui.fallbacks says which applied. */
function sortLayout(ui){
  const C = SORT_CONFIG, {grid, field, head, side, lockedBtn} = ui.el, card = ui.card;
  const tall = innerHeight >= 800;
  let min = tall ? 220 : 170;
  ui.fallbacks = [];
  grid.classList.remove("no-mean", "no-skips"); head.classList.remove("inline", "tight");
  if(lockedBtn.parentNode!==head) head.appendChild(lockedBtn);
  grid.style.setProperty("--row", (tall ? 118 : 96) + "px");
  grid.classList.toggle("no-mean", !tall);   // 96px cells are under 100px: the meaning line goes first
  // the field reaches EDGE_INSET from the screen's edges, whatever the card's own padding
  const cr = card.getBoundingClientRect();
  field.style.marginLeft = (C.EDGE_INSET - cr.left).toFixed(1) + "px";
  field.style.marginRight = (C.EDGE_INSET - (innerWidth - cr.right)).toFixed(1) + "px";
  const short = ()=>{
    const r = field.getBoundingClientRect();
    if(r.height < min) return true;
    const items = ui.pileItems();
    return items.length > 0 && !pileFor(items, {w:r.width, h:r.height}, ui.pileSeed()).pack.ok;
  };
  const steps = [
    ["meaning", ()=>{ grid.classList.add("no-mean"); grid.style.setProperty("--row", "92px"); }],
    ["skips", ()=>grid.classList.add("no-skips")],
    ["link", ()=>{ head.classList.add("inline"); side.appendChild(lockedBtn); }],
    ["pile150", ()=>{ min = 150; }],
    // past the brief's list: a long name can still leave the pile short, so the title gives up its 26px minimum
    ["title", ()=>head.classList.add("tight")]
  ];
  if(!tall) ui.fallbacks.push("meaning");
  for(const [name, apply] of steps){
    if(!short()) break;
    if(ui.fallbacks.includes(name) && name!=="meaning") continue;
    apply();
    if(!ui.fallbacks.includes(name)) ui.fallbacks.push(name);
  }
  if(ui.fallbacks.includes("meaning")) grid.style.setProperty("--row", (tall ? 118 : 96) <= 100 || short() ? "92px" : grid.style.getPropertyValue("--row"));
  ui.short = short();
}

/* the dev tuning panel (?tune=1, on localhost only): sorttune.js is never part of the app's shell and never loads in
   production */
function sortTuneLoad(ui){
  if(typeof sortTune==="function"){ sortTune(ui); return; }
  const sc = document.createElement("script");
  sc.src = "tools/sorttune.js"; sc.onload = ()=>sortTune(ui);
  document.head.appendChild(sc);
}

/* a sheet that a swipe down closes (from its top, or anywhere while it's scrolled to the top): it follows the finger and
   goes past 90px, or on a quick flick; otherwise it springs back */
function sfSwipeToClose(sh){
  const el = sh.el;
  let y0 = null, t0 = 0, dy = 0, id = null;
  el.addEventListener("pointerdown", e=>{
    if(el.scrollTop > 0 || e.target.closest("button, input")) return;
    y0 = e.clientY; t0 = performance.now(); dy = 0; id = e.pointerId;
  });
  el.addEventListener("pointermove", e=>{
    if(y0===null || e.pointerId!==id) return;
    dy = Math.max(0, e.clientY - y0);
    if(dy > 6) el.style.transform = `translateY(${dy.toFixed(1)}px)`;
  });
  const end = e=>{
    if(y0===null || e.pointerId!==id) return;
    const fast = dy / Math.max(1, performance.now() - t0) > .6;
    y0 = null;
    if(dy > 90 || (fast && dy > 30)){ el.style.transform = ""; sh.close(); return; }
    if(dy > 0) el.animate([{transform:`translateY(${dy.toFixed(1)}px)`}, {transform:"none"}], {duration:220, easing:"cubic-bezier(.25,1.1,.4,1)"});
    el.style.transform = "";
  };
  el.addEventListener("pointerup", end);
  el.addEventListener("pointercancel", end);
}

/* ---------- the same shapes elsewhere: a field of blobs that a tap pops (the Kitchen step) ----------
   blobField(zone, items:[{id, label}], seed, {onTap(id, el)}) packs the items as Sort the food's shapes, on the same
   engine: a drag past DRAG_THRESHOLD lifts a shape and pushes the others, a quick tap calls onTap. Returns
   {els, add(item), remove(id), stop(), fall(done), world, running(), frames}. */
function blobField(zone, items, seed, o){
  const C = SORT_CONFIG, shapes = new Map(), world = sortWorld(0, 0);
  const api = {world, frames:0, shapes};
  let raf = 0, last = 0, acc = 0, press = null;
  const size = ()=>{ const r = zone.getBoundingClientRect(); return {w:r.width, h:r.height}; };
  const render = s=>{
    const b = s.body;
    let k = 1;
    if(s.grow){ const t = Math.min(1, (performance.now() - s.grow.t0) / C.FLOW_MS); k = s.grow.from + (1 - s.grow.from) * (1 - Math.pow(1 - t, 3)); if(t >= 1) s.grow = null; }
    s.el.style.transform = `translate3d(${(b.x - s.w / 2).toFixed(1)}px, ${(b.y - s.h / 2).toFixed(1)}px, 0) rotate(${bodyDeg(b).toFixed(2)}deg)` + (k!==1 ? ` scale(${k.toFixed(3)})` : "");
  };
  const paint = ()=>shapes.forEach(render);
  const frame = t=>{
    raf = 0; api.frames++;
    if(document.hidden || !zone.isConnected) return;
    const dt = Math.min(.1, (t - (last || t)) / 1000); last = t; acc += dt;
    let asleep = false;
    while(acc >= C.DT){ acc -= C.DT; asleep = sortStep(world); if(asleep) break; }
    paint();
    if(asleep){ last = 0; acc = 0; return; }
    raf = requestAnimationFrame(frame);
  };
  const wake = ()=>{ world.still = 0; world.asleep = false; if(raf || document.hidden) return; last = 0; acc = 0; raf = requestAnimationFrame(frame); };
  api.wake = wake; api.running = ()=>!!raf;
  api.stop = ()=>{ if(raf) cancelAnimationFrame(raf); raf = 0; };
  const el = (it, shape, d)=>{
    const b = document.createElement("button"), box = shapeBox(shape, d);
    b.type = "button"; b.className = "sf-shape ab-blob"; b.dataset.id = it.id; b.dataset.name = it.name || it.label;
    b.style.width = box.w.toFixed(1) + "px"; b.style.height = box.h.toFixed(1) + "px"; b.style.borderRadius = shapeRadiusCSS(shape);
    b.innerHTML = `<span class="sf-lbl" style="font-size:${labelSize(it.label, box.w)}px">${labelLines(it.label).map(esc).join("<br>")}</span>`;
    if(it.aria) b.setAttribute("aria-label", it.aria);
    return b;
  };
  const toZone = (cx, cy)=>{ const r = zone.getBoundingClientRect(); return {x:cx - r.left, y:cy - r.top}; };
  const bind = s=>{
    s.el.addEventListener("pointerdown", e=>{
      if(press || s.gone) return;
      e.preventDefault();
      try{ s.el.setPointerCapture(e.pointerId); }catch(err){}
      s.pressedAt = performance.now();
      const p = toZone(e.clientX, e.clientY), b = s.body;
      press = {s, id:e.pointerId, x0:e.clientX, y0:e.clientY, t0:performance.now(), dx:p.x - b.x, dy:p.y - b.y, lifted:false, moving:Math.hypot(b.vx, b.vy) > C.TAP_MOVING_SPEED || !!b.flow};
      const move = ev=>{
        if(!press || ev.pointerId!==press.id) return;
        if(!press.lifted){ if(Math.hypot(ev.clientX - press.x0, ev.clientY - press.y0) <= C.DRAG_THRESHOLD) return; press.lifted = true; b.held = true; b.flow = null; s.el.classList.add("is-held"); zone.appendChild(s.el); }
        const q = toZone(ev.clientX, ev.clientY); b.tx = q.x - press.dx; b.ty = q.y - press.dy; wake();
      };
      const up = ev=>{
        if(!press || ev.pointerId!==press.id) return;
        s.el.removeEventListener("pointermove", move); s.el.removeEventListener("pointerup", up); s.el.removeEventListener("pointercancel", up);
        const pr = press; press = null;
        if(pr.lifted){ b.held = false; s.el.classList.remove("is-held"); wake(); return; }
        if(ev.type==="pointercancel" || performance.now() - pr.t0 > C.TAP_MAX_MS || pr.moving) return;
        o.onTap(s.id, s.el);
      };
      s.el.addEventListener("pointermove", move); s.el.addEventListener("pointerup", up); s.el.addEventListener("pointercancel", up);
    });
    // Enter or Space (a click no press came before)
    s.el.addEventListener("click", ()=>{ if(performance.now() - (s.pressedAt || -1e9) > 800 && !s.gone) o.onTap(s.id, s.el); });
  };
  const make = (it, shape, d, x, y)=>{
    const node = el(it, shape, d), box = shapeBox(shape, d);
    const s = {id:it.id, label:it.label, el:node, shape, w:box.w, h:box.h, d, body:sortBody({id:it.id, x, y, w:box.w, h:box.h, rot:shape.rot})};
    bind(s); shapes.set(it.id, s); world.bodies.push(s.body); zone.appendChild(node); render(s);
    return s;
  };
  const reflow = ()=>{
    const list = [...shapes.values()].filter(s=>!s.gone);
    if(!list.length) return;
    const fs = size(), start = {};
    list.forEach(s=>{ start[s.id] = {x:s.body.x, y:s.body.y}; });
    const its = list.map(s=>({id:s.id, label:s.label, shape:s.shape}));
    let pack = packShapes(its, fs, sortRng(seed ^ list.length), start, C.PACK_ROOMY);
    if(!(pack.ok && pack.scale===1)) pack = packShapes(its, fs, sortRng(seed ^ list.length), start);
    pack.bodies.forEach(b=>{
      const s = shapes.get(b.id), body = s.body;
      if(body.held) return;
      if(Math.abs(b.d - s.d) > .5){
        s.grow = {from:s.w / b.w, t0:performance.now()}; s.w = b.w; s.h = b.h; s.d = b.d;
        s.el.style.width = b.w.toFixed(1) + "px"; s.el.style.height = b.h.toFixed(1) + "px"; s.el.firstChild.style.fontSize = labelSize(s.label, b.w) + "px";
        Object.assign(body, sortBody({id:b.id, x:body.x, y:body.y, w:b.w, h:b.h, rot:body.rot0}), {a:body.a});
      }
      body.flow = {x0:body.x, y0:body.y, x1:b.x, y1:b.y, t0:world.t, ms:C.FLOW_MS};
    });
    wake();
  };
  const fs = size();
  world.W = fs.w; world.H = fs.h;
  const pile = pileFor(items.map(it=>({id:it.id, label:it.label})), fs, seed);
  pile.items.forEach((p, k)=>{ const b = pile.pack.bodies[k]; make(items[k], p.shape, b.d, b.x, b.y); });
  api.pack = pile.pack;
  api.els = items.map(it=>shapes.get(it.id).el);
  /* a shape leaves (popped): the rest re-flow */
  api.remove = id=>{ const s = shapes.get(id); if(!s) return; s.gone = true; shapes.delete(id); world.bodies = world.bodies.filter(b=>b!==s.body); reflow(); };
  /* one comes back: it rises from the lower middle and the re-flow finds it a place */
  api.add = it=>{
    if(shapes.has(it.id)) return shapes.get(it.id).el;
    const z = size(), shape = makeShape(sortRng(sortHash(it.id, seed))), d = C.MIN_D, box = shapeBox(shape, d);
    const s = make(it, shape, d, z.w / 2, z.h - box.h / 2);
    if(!calm()) s.el.animate([{opacity:0}, {opacity:1}], {duration:C.FLOW_MS});
    reflow();
    return s.el;
  };
  api.reflow = reflow;
  /* Next: what's left falls out through the bottom (transform only), then done() */
  api.fall = done=>{
    api.stop();
    const list = [...shapes.values()].sort((a, b)=>b.body.y - a.body.y);
    if(!list.length || calm()){ done(); return; }
    const H = size().h, step = Math.min(40, C.FALL_MS * .4 / list.length);
    let lastA = null;
    list.forEach((s, k)=>{ const from = s.el.style.transform, dy = H - s.body.y + s.h + 40;
      lastA = s.el.animate([{transform:from}, {transform:`translate3d(0, ${dy.toFixed(0)}px, 0) ` + from}], {duration:C.FALL_MS * .6, delay:k * step, easing:"cubic-bezier(.55,0,.9,.4)", fill:"forwards"}); });
    api.falling = true;
    lastA.onfinish = done;
  };
  new ResizeObserver(()=>{ const n = size(); if(Math.abs(n.w - world.W) > 1 || Math.abs(n.h - world.H) > 1){ world.W = n.w; world.H = n.h; reflow(); } }).observe(zone);
  document.addEventListener("visibilitychange", ()=>{ if(document.hidden) api.stop(); else if(!world.asleep && zone.isConnected) wake(); });
  return api;
}
