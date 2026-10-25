/* ---------- Sort the food: the screen ----------
   "Sort the food for {name}." The foods the child can have at this age, as black wobbly shapes in a field; four places
   above them (Keep out, Not a fan, Tried already, Untouched); a status row between. The big ones come first and must all
   be placed; the everyday foods follow, a food group at a time, and are optional. Every change is saved as it's made
   (profile.foodSort), and the plan reads it only through getFoodRules (sortcore.js). Numbers: sortconfig.js.
   mountSortFood({card, foot, profile, months, single, onContinue}) builds it into the onboarding's card and foot; the
   top bar isn't its own. sortUI is the live screen (the tests reach in). */

const SORT_SEEDS = {sizes:null};
(function loadSeeds(){
  if(typeof fetch!=="function") return;
  fetch("curatedSeeds.json").then(r=>r.ok ? r.json() : null).then(j=>{ if(j && j.sizes) SORT_SEEDS.sizes = j.sizes; }).catch(()=>{});
})();
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

function mountSortFood(o){
  const C = SORT_CONFIG, P = o.profile, card = o.card;
  if(sortUI) sortUI.destroy();
  // the sort, written down the first time the screen opens (from the old fields, for a family that had none)
  if(!P.foodSort){ P.foodSort = JSON.parse(JSON.stringify(legacyFoodSort(P))); }
  const S = P.foodSort;
  if(S.shapeSeed===null || S.shapeSeed===undefined) S.shapeSeed = pickSortSeed();
  const persist = ()=>{ syncLegacyFromSort(P); o.save(); };
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
    return everyday.filter(id=>groupOf(id)===ui.tab && !placeOf(id)).slice(0, C.MAX_PILE - 1);
  };
  ui.pileIds = pileIds;

  /* ---------- the page ---------- */
  card.classList.add("fill", "sf");
  card.innerHTML = "";
  const head = document.createElement("div"); head.className = "sf-head";
  const h = document.createElement("h1"); h.className = "sf-title"; h.id = "onbTitle"; h.tabIndex = -1;
  h.textContent = sfSay("title", {name:P.name || say("mealTimes.they")});
  const prog = document.createElement("span"); prog.className = "sf-prog";
  const titleRow = document.createElement("div"); titleRow.className = "sf-trow"; titleRow.append(h, prog);
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
  card.append(head, grid, status, pileHead, field);
  ui.el = {head, h, prog, lockedBtn, grid, cells, status, pileHead, field, note};

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
  }
  ui.undoNow = undo;
  function afterChange(opts){
    if(ui.sorted===1 && ui.hint2==="idle") ui.hint2 = "armed";
    paintPlaces(); paintProgress(); paintStatus(); paintPileHead();
    next.ready(bigDone());
    syncPile(opts);
    if(ui.onChange) ui.onChange(opts);
  }
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
        b.addEventListener("click", ()=>{ if(ui.tab===key) return; ui.tab = key; ui.selected.clear(); paintPileHead(); paintStatus(); buildPile(); });
        t.appendChild(b);
      });
      pileHead.appendChild(t);
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
    const box = shapeBox(s, d), label = id==="+else" ? sfSay("somethingElse") : sfLabel(id);
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
    s.el.style.transform = `translate3d(${(b.x - s.w / 2).toFixed(1)}px, ${(b.y - s.h / 2).toFixed(1)}px, 0) rotate(${bodyDeg(b).toFixed(2)}deg)` + (k!==1 ? ` scale(${k.toFixed(3)})` : "");
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
    const ids = pileIds().map(id=>({id, label:sfLabel(id)}));
    if(ui.view==="everyday") ids.push({id:"+else", label:sfSay("somethingElse")});
    return ids;
  }
  /* each pile's seed: the family's, and the tab's place among the five */
  const pileSeed = ()=>(S.shapeSeed + (ui.view==="everyday" ? 7919 * (C.groups.findIndex(g=>g[0]===ui.tab) + 1) : 0)) >>> 0;
  /* the pile from scratch: new shapes, packed from the seed (a new pile, a tab, a resize) */
  function buildPile(){
    field.querySelectorAll(".sf-shape, .sf-empty").forEach(x=>x.remove());
    ui.shapes.clear();
    const items = pileItems(), fs = ui.fieldSize();
    if(!fs.w || !fs.h) return;
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
    const pack = packShapes(list.map(x=>({id:x.id, label:x.label, shape:x.shape})), {w:fs.w, h:fs.h}, sortRng(S.shapeSeed ^ list.length), start);
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
    s.el.addEventListener("click", e=>{ if(e.detail===0) keyTap(s); });   // Enter or Space: a tap
  }
  const toField = (cx, cy)=>{ const r = field.getBoundingClientRect(); return {x:cx - r.left, y:cy - r.top}; };
  function down(s, e){
    if(ui.finishing || ui.press || !ui.shapes.has(s.id)) return;
    e.preventDefault();
    try{ s.el.setPointerCapture(e.pointerId); }catch(err){}
    const p = toField(e.clientX, e.clientY), b = s.body;
    ui.touched = true;
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
  function tap(s){ if(ui.onTap) ui.onTap(s); }
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
    if(ui.selected.size){ place_([...ui.selected], place); return; }
    if(ui.openList) ui.openList(place);
  }
  const place_ = (ids, to)=>place(ids, to);
  ui.tapPlace = tapPlace;

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
    if(ui.fall) ui.fall(done); else done();
  }
  ui.finish = finish;

  /* ---------- first paint ---------- */
  ui.destroy = ()=>{ ui.gone = true; ui.timers.forEach(clearTimeout); if(ui.stopEngine) ui.stopEngine(); if(sortUI===ui) sortUI = null; };
  if(bigDone() && S.firstPileComplete && everyday.length) ui.view = "everyday";
  else if(bigDone() && S.firstPileComplete) ui.view = "none";
  paintPlaces(); paintProgress(); paintPileHead(); paintStatus();
  requestAnimationFrame(()=>{
    if(ui.gone) return;
    sortLayout(ui); buildPile(); paintPlaces();
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
   The places' rows are 118px on a tall phone, 96px on a short one (never under 92), and the field the rest. */
function sortLayout(ui){
  const {card, grid, field} = Object.assign({card:ui.card}, ui.el);
  const tall = innerHeight >= 800;
  const row = tall ? 118 : 96;
  grid.style.setProperty("--row", row + "px");
  grid.classList.toggle("no-mean", row < 100);
  // the field reaches EDGE_INSET from the screen's edges, whatever the card's own padding
  const cr = card.getBoundingClientRect();
  field.style.marginLeft = (SORT_CONFIG.EDGE_INSET - cr.left).toFixed(1) + "px";
  field.style.marginRight = (SORT_CONFIG.EDGE_INSET - (innerWidth - cr.right)).toFixed(1) + "px";
}

/* the dev tuning panel (?tune=1, on localhost only): sorttune.js is never part of the app's shell and never loads in
   production */
function sortTuneLoad(ui){
  if(typeof sortTune==="function"){ sortTune(ui); return; }
  const sc = document.createElement("script");
  sc.src = "tools/sorttune.js"; sc.onload = ()=>sortTune(ui);
  document.head.appendChild(sc);
}
