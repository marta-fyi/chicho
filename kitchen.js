/* ====================================================================
   KITCHEN: one question at a time. Buy (what to pick up for the next
   three days), At home (what's here, as Plenty, Low or Out) and Prep
   (what to cook ahead, and the freezer). The numbers live in KITCHEN;
   the rules are pure functions over the plan, so they're tested on
   their own and Home's "While you're at it" reads the same ones.
   ==================================================================== */

/* ---------- the config: every number the Kitchen uses ----------
   FRIDGE_DAYS, FREEZER_DAYS and FREEZER_SOON_DAYS are placeholders (docs/decisions.md: verify with a food-safety source). */
const KITCHEN = Object.freeze({
  ROW_H: 56,               // px, every row but Prep's
  HORIZON_DAYS: 3,         // Buy covers today and the next two days
  LOW_COVERS_HOURS: 48,    // Low still covers what's needed within this many hours
  FRIDGE_DAYS: 2,          // cooked food keeps this long in the fridge (each food can say otherwise)
  FREEZER_DAYS: 30,        // and this long in the freezer
  FREEZER_SOON_DAYS: 21,   // a frozen portion this old says "use soon"
  MAX_PREP_SESSIONS: 3,    // cook-ahead rows before "Show more"
  DEFAULT_PORTIONS: 2,     // a new frozen batch
  UNDO_MS: 5000
});
const NEED_GRACE_MIN = 60;   // a meal still needs its food until an hour after its anchor (the "now" window)
const FOOD_GROUP_ORDER = ["grain","vegetable","fruit","protein","fat"];
const KITCHEN_METHODS = ["raw","steam","roast","boil","bake","simmer"];

/* ---------- foodMeta: the manifest's line for a food, or its group's defaults ----------
   foodId is the pantry's key (the name before the comma, lower case: "carrots", "whole wheat toast").
   Defaults come from the food group and the cooking layer's method (COOK in foods.js). */
const GROUP_DEFAULTS = {
  grain:     {shopUnit:"pack",   portionGrams:40,  unitLabelOne:"pack",  unitLabelMany:"packs", gramsPerPack:500},
  vegetable: {shopUnit:"weight", portionGrams:100, unitLabelOne:"",      unitLabelMany:"",      gramsPerPack:0},
  fruit:     {shopUnit:"piece",  portionGrams:120, unitLabelOne:"piece", unitLabelMany:"pieces", gramsPerPack:0},
  protein:   {shopUnit:"weight", portionGrams:100, unitLabelOne:"",      unitLabelMany:"",      gramsPerPack:0},
  fat:       {shopUnit:"pack",   portionGrams:10,  unitLabelOne:"jar",   unitLabelMany:"jars",  gramsPerPack:250},
  other:     {shopUnit:"pack",   portionGrams:0,   unitLabelOne:"pack",  unitLabelMany:"packs", gramsPerPack:0}
};
const MANIFEST_GROUP = {protein:"protein", dairy:"protein", veg:"vegetable", fruit:"fruit", grains:"grain", fats:"fat"};
const META_CACHE = {};
/* the pool's entry for a pantry key: by its own name first, then through the manifest's aliases */
function poolFood(foodId){
  const f = foodOf(foodId);
  return FOOD_POOL.find(p=>foodKey(baseName(p))===foodId) || (f ? FOOD_POOL.find(p=>foodOf(p.name)===f) : null) || null;
}
/* the food group a pantry key belongs to: grain · vegetable · fruit · protein · fat, or "other" (a legacy non-food) */
function foodGroup(foodId){
  const p = poolFood(foodId);
  if(p) return FOOD_GROUP_ORDER.includes(p.cats[0]) ? p.cats[0] : "other";
  const f = foodOf(foodId);
  return (f && MANIFEST_GROUP[f.group]) || "other";
}
function kitchenMeta(foodId){
  if(META_CACHE[foodId]) return META_CACHE[foodId];
  const f = foodOf(foodId), group = foodGroup(foodId), line = f && FOOD_META_KITCHEN[f.id];
  let m;
  if(line){
    const [method, fridge, freeze, portion, unit, one, many, pack] = line.split("|");
    m = {method, fridgeDays:+fridge || KITCHEN.FRIDGE_DAYS, freezable:freeze==="1", portionGrams:+portion || 0, shopUnit:unit,
         unitLabelOne:one, unitLabelMany:many, gramsPerPack:+pack || 0, defaulted:false};
  }else{
    const cook = f ? f.cook.method : "raw", method = KITCHEN_METHODS.includes(cook) ? cook : "raw";   // toast and "stirred in": nothing to cook ahead
    const p = poolFood(foodId);
    m = Object.assign({method, fridgeDays:KITCHEN.FRIDGE_DAYS, freezable:method!=="raw" && !!(p && metaOf(p.name).freezes), defaulted:true}, GROUP_DEFAULTS[group]);
  }
  m.id = f ? f.id : foodId; m.group = group;
  return (META_CACHE[foodId] = m);
}
/* every manifest food that has no line of its own (docs/decisions.md lists them) */
function defaultedFoods(){ return FOODS.filter(f=>!FOOD_META_KITCHEN[f.id]).map(f=>f.id); }

/* ---------- shopping units: grams the plan needs → what to pick up ----------
   pack: whole packs (at least one) · weight: up to the next 100 g, 200 g at least · piece: whole ones */
function shopUnits(grams, meta){
  const g = Math.max(0, grams || 0);
  if(meta.shopUnit==="weight"){ const w = Math.max(200, Math.ceil(g / 100) * 100); return {kind:"weight", n:w, text:say("kitchen.weight", {g:w})}; }
  const per = meta.shopUnit==="piece" ? meta.portionGrams : meta.gramsPerPack;
  const n = Math.max(1, per > 0 ? Math.ceil(g / per) : 1);
  return {kind:meta.shopUnit, n, text:say("kitchen.unit", {n, label:n===1 ? meta.unitLabelOne : meta.unitLabelMany})};
}
/* "35 g" → 35 (a food with no amount counts as none) */
function gramsOf(item){ const m = String(item && item.qty || "").match(/(\d+(?:\.\d+)?)\s*g\b/); return m ? +m[1] : 0; }

/* the storage line, from the numbers above: "Fridge 2 days · freezer 1 month · reheat once, …" */
function spanText(days){ return days % 30===0 ? say("kitchen.span.months", {n:days / 30}) : say("kitchen.span.days", {n:days}); }
function storageNote(){ return say("kitchen.storage", {fridge:spanText(KITCHEN.FRIDGE_DAYS), freezer:spanText(KITCHEN.FREEZER_DAYS)}); }

/* ---------- the plan's meals between two days, in time order (pure) ----------
   plan: one dated plan ({startsOn, days}) or the list of them (a date uses the latest that has started).
   opts.timeOf(slot, date) → "HH:mm" (the app passes mealTime); without it, the fallback times. */
function planMealsIn(plan, fromDay, days, opts){
  const recs = (Array.isArray(plan) ? plan : [plan]).filter(Boolean), timeOf = (opts && opts.timeOf) || (slot=>FALLBACK_TIMES[slot] || "12:00");
  const out = [];
  for(let k = 0; k < days; k++){
    const date = new Date(fromDay.getFullYear(), fromDay.getMonth(), fromDay.getDate() + k);
    const rec = planRecOn({plans:recs}, date);
    if(!rec) continue;
    const dayIdx = rec.days.findIndex(d=>d.name===DAY_ORDER[date.getDay()]);
    if(dayIdx < 0) continue;
    rec.days[dayIdx].meals.forEach((m, j)=>{
      if(!m.items.length || m.skipped) return;
      out.push({m, k:j, dayIdx, date, iso:isoOf(date), start:atTime(date, timeOf(m.slot, date)), planWeekId:rec.startsOn});
    });
  }
  return out.sort((a, b)=>a.start - b.start);
}
/* a meal still needs its food until an hour after its anchor */
function stillAhead(x, now){ return now < new Date(x.start.getTime() + NEED_GRACE_MIN * 60000); }

/* ---------- Buy: deriveBuyList(plan, pantry, shop, now, opts) (pure) ----------
   1. needs: planned grams per food from every meal not offered whose anchor + 60 min hasn't passed, through the end
      of day (today + HORIZON_DAYS - 1)
   2. cover: Plenty covers the lot; Low only what's needed within LOW_COVERS_HOURS; Out (or not in the pantry) nothing
   3. one row per food, the uncovered grams summed, in shopping units (never the plan's grams)
   4. plus shop.manual (even when covered), minus shop.notThisWeek for the running plan week, minus what's in Got it
   5. soonest uncovered need first, then food group order, then name
   opts: {timeOf(slot, date), isOffered(m, date, item)}. Rows: {foodId, name, group, grams, unit, first, firstSlot, manual} */
function deriveBuyList(plan, pantry, shop, now, opts){
  const o = opts || {}, isOffered = o.isOffered || (()=>false), S = shop || {};
  const stock = {}; (pantry || []).forEach(p=>{ stock[p.foodId] = p; });
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const rows = {};
  planMealsIn(plan, today, KITCHEN.HORIZON_DAYS, o).forEach(x=>{
    if(!stillAhead(x, now)) return;
    x.m.items.forEach(i=>{
      if(isOffered(x.m, x.date, i)) return;
      const id = foodKey(baseName(i)), st = stock[id] ? stock[id].state : "out";
      const covered = st==="plenty" || (st==="low" && x.start - now <= KITCHEN.LOW_COVERS_HOURS * 3600000);
      if(covered) return;
      const r = rows[id] || (rows[id] = {foodId:id, name:baseName(i), grams:0, first:null, firstSlot:null, manual:false});
      r.grams += gramsOf(i);
      if(!r.first || x.start < r.first){ r.first = x.start; r.firstSlot = x.m.slot; }
    });
  });
  (S.manual || []).forEach(x=>{
    const r = rows[x.foodId] || (rows[x.foodId] = {foodId:x.foodId, name:stock[x.foodId] ? stock[x.foodId].name : foodName(x.foodId), grams:0, first:null, firstSlot:null, manual:false});
    r.manual = true;
  });
  const cur = planRecOn({plans:(Array.isArray(plan) ? plan : [plan]).filter(Boolean)}, now), week = cur ? cur.startsOn : null;
  (S.notThisWeek || []).forEach(x=>{ if(x.planWeekId===week) delete rows[x.foodId]; });
  (S.got || []).forEach(x=>{ delete rows[x.foodId]; });
  const order = g=>{ const k = FOOD_GROUP_ORDER.indexOf(g); return k < 0 ? 99 : k; };
  return Object.values(rows).map(r=>{
    const meta = kitchenMeta(r.foodId);
    return Object.assign(r, {group:meta.group, unit:shopUnits(r.grams, meta)});
  }).sort((a, b)=>(a.first ? +a.first : Infinity) - (b.first ? +b.first : Infinity) || order(a.group) - order(b.group) || a.name.localeCompare(b.name));
}
/* a food's display name from its key: the pool's name before the comma, else the key itself */
function foodName(foodId){ const p = poolFood(foodId); return p ? baseName(p) : upper1(foodId); }
/* when a row is first needed: "tonight" (today's dinner), "today", "tomorrow", or the weekday */
const fmtWeekdayK = d=>new Intl.DateTimeFormat(undefined, {weekday:"long"}).format(d);
function whenLabel(first, slot, now){
  if(!first) return "";
  const days = Math.round((new Date(first.getFullYear(), first.getMonth(), first.getDate()) - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000);
  return days===0 ? say(slot==="dinner" ? "kitchen.when.tonight" : "kitchen.when.today") : days===1 ? say("kitchen.when.tomorrow") : fmtWeekdayK(first);
}
/* "1 pack · tomorrow" (an item added by hand, needed by no meal, is just its unit) */
function buyMeta(r, now){ const w = whenLabel(r.first, r.firstSlot, now); return w ? say("kitchen.rowMeta", {unit:r.unit.text, when:w}) : r.unit.text; }

/* ====================================================================
   THE SCREEN: a pinned header (Home, In the store, the title, the view
   switch) over one scroll area that starts under it. Three views, one
   at a time; each keeps its own scroll position. Horizontal swipes
   switch views (the pager has nothing beside the Kitchen); vertical
   drags on the header, or a pull past a scroll edge, still navigate.
   ==================================================================== */
const KITCHEN_VIEWS = ["buy","home","prep"];
const KITCHEN_GROUPS = FOOD_GROUP_ORDER.concat("other");
const kitchenUI = {view:savedView(), scroll:{buy:0, home:0, prep:0}, open:{}, adding:false, store:false, wakeOurs:false,
                   expanded:null, showGot:false, undo:null};
function savedView(){ try{ const v = sessionStorage.getItem("chicho.kitchenView"); return KITCHEN_VIEWS.includes(v) ? v : "buy"; }catch(e){ return "buy"; } }
function keepView(v){ try{ sessionStorage.setItem("chicho.kitchenView", v); }catch(e){} }
function groupName(c){ return c==="other" ? say("kitchen.other") : say("home.groups." + c); }

/* the shell is built once per mount; a refresh redraws the header's state and the view, never the scroll area */
function kitchenShell(){
  const e = screenEl("kitchen");
  const found = e.querySelector(".k-head");
  if(found) return {e, head:found, body:e.querySelector(".k-body"), col:e.querySelector(".k-view")};
  e.innerHTML = "";
  e.style.setProperty("--row-h", KITCHEN.ROW_H + "px");
  const head = el("header", "k-head"), hc = el("div", "scr-col k-head-col"), top = el("div", "k-top");
  head.appendChild(el("i", "k-surface"));
  const home = textBtn(say("screens.home"), ()=>go("home"), "small home-link"); home.dataset.f = "kitchen:home";
  const store = textBtn("", ()=>setStoreMode(!kitchenUI.store), "small k-store"); store.dataset.f = "instore";
  top.append(home, store);
  const h = el("h1", "k-title", say("screens.kitchen")); h.tabIndex = -1;
  const sw = el("div", "k-switch");
  KITCHEN_VIEWS.forEach(v=>{
    const b = document.createElement("button");
    b.type = "button"; b.className = "k-tab"; b.dataset.view = v; b.dataset.f = "view:" + v;
    b.append(el("span", "k-tab-t", say("kitchen.views." + v)), el("small", "k-count"));
    b.addEventListener("click", ()=>switchView(v));
    sw.appendChild(b);
  });
  sw.appendChild(el("i", "k-line"));
  hc.append(top, h, sw); head.appendChild(hc);
  const body = el("div", "scr-body k-body"), col = el("div", "scr-col k-view");
  body.appendChild(col);
  e.append(head, body);
  // the scroll area starts under the header (padding and scroll padding = its measured height), so nothing is
  // ever clipped behind it at rest; what scrolls under it is blurred
  const fit = ()=>{ const hh = head.offsetHeight; body.style.paddingTop = hh + "px"; body.style.scrollPaddingTop = hh + "px"; e.style.setProperty("--kh", hh + "px"); };
  if(window.ResizeObserver) new ResizeObserver(fit).observe(head);
  body.addEventListener("scroll", ()=>kitchenScrolled(body, head), {passive:true});
  watchPull(body);
  requestAnimationFrame(fit);
  if(document.fonts && document.fonts.ready) document.fonts.ready.then(()=>{ fit(); placeLine(head, false); });
  return {e, head, body, col};
}
function kitchenScrolled(body, head){
  head.classList.toggle("is-under", body.scrollTop > 0);
}
/* the underline sits under the active label (transform only); it slides when the view changes */
function placeLine(head, slide){
  const line = head.querySelector(".k-line"), on = head.querySelector(".k-tab.is-on .k-tab-t");
  if(!line || !on) return;
  const sw = line.parentNode.getBoundingClientRect(), r = on.getBoundingClientRect();
  if(!r.width) return;
  if(!slide) line.style.transition = "none";
  line.style.transform = `translateX(${(r.left - sw.left).toFixed(1)}px) scaleX(${(r.width / 100).toFixed(3)})`;
  if(!slide){ line.getBoundingClientRect(); line.style.transition = ""; }
}
function renderKitchen(slide){
  const {e, head, col} = kitchenShell(), v = kitchenUI.view;
  const list = buyRows();
  const store = head.querySelector(".k-store");
  store.hidden = v!=="buy" || !wakeSupported();
  store.textContent = say(kitchenUI.store ? "kitchen.storeOn" : "kitchen.storeOff");
  head.querySelectorAll(".k-tab").forEach(b=>{
    b.classList.toggle("is-on", b.dataset.view===v);
    if(b.dataset.view==="buy") setText(b.querySelector(".k-count"), list.length && !kitchenUI.store ? String(list.length) : "");
  });
  placeLine(head, !!slide);
  col.innerHTML = ""; col.dataset.view = v;
  [...e.querySelectorAll(".k-pin")].forEach(x=>x.remove());
  [...e.querySelectorAll(".k-undo")].forEach(x=>x.remove());
  ({buy:renderBuy, home:renderAtHome, prep:renderPrep})[v](col, list, e);
  undoLine(e, !!e.querySelector(".k-pin"));
}
/* switching views: a crossfade with an 8px slide in the direction of travel, 180ms; each view keeps its scroll */
function switchView(to){
  const cur = kitchenUI.view;
  if(to===cur || !KITCHEN_VIEWS.includes(to)) return;
  const {e, body, col} = kitchenShell(), dir = KITCHEN_VIEWS.indexOf(to) > KITCHEN_VIEWS.indexOf(cur) ? 1 : -1;
  kitchenUI.scroll[cur] = body.scrollTop;
  const r = col.getBoundingClientRect(), s = e.getBoundingClientRect(), ghost = col.cloneNode(true);
  ghost.classList.add("k-ghost"); ghost.removeAttribute("data-view");
  ghost.querySelectorAll("[data-f], [id]").forEach(x=>{ x.removeAttribute("data-f"); x.removeAttribute("id"); });
  ghost.style.left = (r.left - s.left) + "px"; ghost.style.top = (r.top - s.top) + "px"; ghost.style.width = r.width + "px";
  const from = col.style.transform || "none", fromO = col.style.opacity || "1";
  col.style.transform = ""; col.style.opacity = "";
  e.appendChild(ghost);
  kitchenUI.view = to; keepView(to);
  renderKitchen(true);
  body.scrollTop = kitchenUI.scroll[to];
  kitchenScrolled(body, e.querySelector(".k-head"));
  const o = {duration:180, easing:"cubic-bezier(.22,.61,.36,1)"};
  col.animate([{opacity:0, transform:`translateX(${8 * dir}px)`}, {opacity:1, transform:"none"}], o);
  ghost.animate([{opacity:+fromO, transform:from}, {opacity:0, transform:`translateX(${-8 * dir}px)`}], Object.assign({fill:"forwards"}, o)).onfinish = ()=>ghost.remove();
  haptic();
}
/* the finger drives the view sideways; past the first or last view it rubber-bands */
function kitchenNext(dx){ return KITCHEN_VIEWS[KITCHEN_VIEWS.indexOf(kitchenUI.view) + (dx < 0 ? 1 : -1)] || null; }
function kitchenDrag(dx){
  const {body, col} = kitchenShell(), off = kitchenNext(dx) ? dx : dx * RUBBER;
  col.style.transform = `translateX(${off.toFixed(1)}px)`;
  col.style.opacity = String(1 - Math.min(.6, Math.abs(off) / (body.clientWidth || innerWidth)));
}
function kitchenDragEnd(dx, v){
  const {body, col} = kitchenShell(), W = body.clientWidth || innerWidth, to = kitchenNext(dx);
  if(to && (Math.abs(dx) > W * COMMIT_SHARE || (Math.abs(v) > COMMIT_SPEED && Math.sign(v)===Math.sign(dx)))){ switchView(to); return; }
  const from = col.style.transform || "none", fromO = col.style.opacity || "1";
  col.style.transform = ""; col.style.opacity = "";
  col.animate([{transform:from, opacity:+fromO}, {transform:"none", opacity:1}], {duration:180, easing:"cubic-bezier(.32,1.25,.5,1)"});
}

/* ---------- In the store ---------- */
function setStoreMode(on){
  kitchenUI.store = on;
  if(on){ if(wakeSupported() && !wake.on){ kitchenUI.wakeOurs = true; wakeSet(true); } }
  else if(kitchenUI.wakeOurs){ kitchenUI.wakeOurs = false; if(wake.on) wakeSet(false); }
  haptic(); refresh("kitchen");
}
/* ---------- Buy: what to pick up, one row per food ----------
   A tap on the ring: it fills, the row folds away, the food is at home (Plenty) and in Got it, and a quiet line
   offers Undo for 5 seconds. A tap on the row opens Have it and Not this week under it. */
function buyRows(){
  pruneGot();
  return deriveBuyList(state.plans, state.pantry, state.shop, now(), {timeOf:mealTime, isOffered:(m, d, i)=>itemOffered(m, i, d)});
}
/* Got it is today's: at local midnight it empties (what was bought stays at home) */
function pruneGot(){
  const iso = todayISO(), keep = state.shop.got.filter(g=>isoOf(new Date(g.at))===iso);
  if(keep.length!==state.shop.got.length){ state.shop.got = keep; save(); }
}
function planWeekNow(){ const p = planRecOn(state, now()); return p ? p.startsOn : ""; }
/* the ring: 28px drawn, 44px to tap, a 1.5px ink line; filled when done */
function kRing(on, fn, f){
  const b = document.createElement("button");
  b.type = "button"; b.className = "ring-btn" + (on ? " on" : ""); b.dataset.f = f;
  b.innerHTML = RING;
  b.addEventListener("click", fn);
  return b;
}
/* a fixed-height row: name (and an optional meta line), each on one line, and a control on the right */
function kRow(name, meta, right, onTap, f){
  const r = el("div", "k-row");
  const main = document.createElement(onTap ? "button" : "div");
  main.className = "k-main";
  if(onTap){ main.type = "button"; main.dataset.f = f; main.addEventListener("click", onTap); }
  main.appendChild(el("span", "k-name", name));
  if(meta) main.appendChild(el("span", "k-meta", meta));
  r.appendChild(main);
  if(right) r.appendChild(right);
  return r;
}
/* the row folds away (transform only): it shrinks to nothing while everything below it slides up its height */
function collapseRow(row, done){
  const h = row.offsetHeight + (row.nextElementSibling && row.nextElementSibling.classList.contains("k-acts") ? row.nextElementSibling.offsetHeight : 0);
  const after = [];
  let n = row;
  while(n && !n.classList.contains("k-view")){
    for(let s = n.nextElementSibling; s; s = s.nextElementSibling) if(!s.classList.contains("k-acts") || n!==row) after.push(s);
    n = n.parentElement;
  }
  const o = {duration:200, easing:"cubic-bezier(.22,.61,.36,1)", fill:"forwards"};
  row.style.transformOrigin = "50% 0";
  const a = row.animate([{transform:"scaleY(1)", opacity:1}, {transform:"scaleY(0)", opacity:0}], o);
  if(row.nextElementSibling && row.nextElementSibling.classList.contains("k-acts")) row.nextElementSibling.animate([{opacity:1}, {opacity:0}], o);
  after.forEach(s=>s.animate([{transform:"none"}, {transform:`translateY(${-h}px)`}], o));
  a.onfinish = done;
}
/* the quiet undo line above the pill: "{Food} · got it · Undo", 5 seconds */
function setKitchenUndo(text, restore){
  clearTimeout(kitchenUI.undo && kitchenUI.undo.timer);
  kitchenUI.undo = {text, restore, timer:setTimeout(()=>{ kitchenUI.undo = null; refresh("kitchen"); }, KITCHEN.UNDO_MS)};
}
function undoLine(e, hasPin){
  const u = kitchenUI.undo;
  if(!u) return;
  const wrap = el("div", "k-undo" + (hasPin ? "" : " no-pin")), c = el("p", "scr-col");
  const k = u.text.lastIndexOf(say("meal.undo"));
  c.append(u.text.slice(0, k));
  const b = textBtn(say("meal.undo"), ()=>{ clearTimeout(u.timer); kitchenUI.undo = null; u.restore(); save(); changed(); }, "inline");
  b.dataset.f = "kitchen:undo";
  c.appendChild(b);
  wrap.appendChild(c);
  e.appendChild(wrap);
}
function gotIt(r){
  const p = pantryOf(r.foodId), prev = p ? p.state : null, manual = state.shop.manual.some(x=>x.foodId===r.foodId);
  setStock(r.foodId, r.name, "plenty");
  pantryOf(r.foodId).prevState = prev || "out";
  state.shop.manual = state.shop.manual.filter(x=>x.foodId!==r.foodId);
  state.shop.got = state.shop.got.filter(g=>g.foodId!==r.foodId).concat(Object.assign({foodId:r.foodId, at:now().toISOString(), prevState:prev}, manual ? {manual:true} : {}));
  kitchenUI.expanded = null;
  setKitchenUndo(say("kitchen.gotUndo", {food:r.name}), ()=>unGot(r.foodId));
  save(); haptic();
}
/* back on the list: the stock it had before (or none), and a hand-added food is hand-added again */
function unGot(foodId){
  const g = state.shop.got.find(x=>x.foodId===foodId);
  if(!g) return;
  const p = pantryOf(foodId);
  if(g.prevState) setStock(foodId, p ? p.name : foodName(foodId), g.prevState); else setStock(foodId, "", null);
  const q = pantryOf(foodId); if(q) delete q.prevState;
  if(g.manual && !state.shop.manual.some(x=>x.foodId===foodId)) state.shop.manual.push({foodId});
  state.shop.got = state.shop.got.filter(x=>x!==g);
}
function haveIt(r){
  setStock(r.foodId, r.name, "plenty");
  state.shop.manual = state.shop.manual.filter(x=>x.foodId!==r.foodId);
  if(!state.hints.haveIt) state.hints.haveIt = todayISO();
  kitchenUI.expanded = null;
  save(); haptic();
}
function notThisWeek(r){
  const week = planWeekNow();
  state.shop.manual = state.shop.manual.filter(x=>x.foodId!==r.foodId);
  if(!state.shop.notThisWeek.some(x=>x.foodId===r.foodId && x.planWeekId===week)) state.shop.notThisWeek.push({foodId:r.foodId, planWeekId:week});
  kitchenUI.expanded = null;
  save(); haptic();
}
function renderBuy(col, list, e){
  const rowFor = r=>{
    const box = document.createDocumentFragment();
    const ringB = kRing(false, ()=>{
      ringB.classList.add("on");
      setTimeout(()=>collapseRow(row, ()=>{ gotIt(r); changed(); }), 180);
    }, "buy:" + r.foodId);
    const row = kRow(r.name, buyMeta(r, now()), ringB, ()=>{ kitchenUI.expanded = kitchenUI.expanded===r.foodId ? null : r.foodId; refresh("kitchen"); }, "row:" + r.foodId);
    row.dataset.food = r.foodId;
    box.appendChild(row);
    if(kitchenUI.expanded===r.foodId){
      const acts = el("div", "k-acts");
      const have = textBtn(say("kitchen.haveIt"), ()=>collapseRow(row, ()=>{ haveIt(r); changed(); }), "small"); have.dataset.f = "have:" + r.foodId;
      const skip = textBtn(say("kitchen.notThisWeek"), ()=>collapseRow(row, ()=>{ notThisWeek(r); changed(); }), "small"); skip.dataset.f = "skip:" + r.foodId;
      acts.append(have, skip);
      box.appendChild(acts);
    }
    return box;
  };
  const sec = section(col, "buy", "");
  if(!list.length) sec.appendChild(el("p", "k-empty", say("kitchen.nothingToBuy")));
  else{
    if(!state.pantry.length && !state.hints.haveIt) sec.appendChild(el("p", "k-hint", say("kitchen.haveItHint")));
    if(kitchenUI.store) KITCHEN_GROUPS.forEach(c=>{
      const rows = list.filter(r=>r.group===c);
      if(!rows.length) return;
      sec.appendChild(el("h2", "k-label", groupName(c)));
      rows.forEach(r=>sec.appendChild(rowFor(r)));
    });
    else list.forEach(r=>sec.appendChild(rowFor(r)));
  }
  if(list.length){
    const p = el("p", "quiet-line");
    const s = textBtn(say("kitchen.send"), ()=>sendGroceries(), "small");
    s.dataset.f = "kitchen:send";
    p.appendChild(s); sec.appendChild(p);
  }
  // Got it: today's, folded away until shown; its ring puts the food back on the list
  const got = state.shop.got;
  if(got.length){
    const g = section(col, "got", "");
    const h = el("div", "k-sechead");
    const lab = el("h2", "k-label", say("kitchen.got"));
    lab.appendChild(el("span", "k-label-n", String(got.length)));
    const t = textBtn(say(kitchenUI.showGot ? "kitchen.hide" : "kitchen.show"), ()=>{ kitchenUI.showGot = !kitchenUI.showGot; refresh("kitchen"); }, "small"); t.dataset.f = "got:toggle";
    h.append(lab, t); g.appendChild(h);
    if(kitchenUI.showGot) got.slice().reverse().forEach(x=>{
      const p = pantryOf(x.foodId), name = p ? p.name : foodName(x.foodId);
      const ringB = kRing(true, ()=>{ unGot(x.foodId); save(); haptic(); changed(); }, "ungot:" + x.foodId);
      g.appendChild(kRow(name, "", ringB, null));
    });
  }
  return list.length;
}

/* ---------- At home ---------- */
const STOCK_NEXT = {plenty:"low", low:"out", out:"plenty"};
function renderAtHome(col){
  const low = state.pantry.filter(p=>p.state==="low");
  if(low.length){
    const sec = section(col, "low", say("kitchen.low"));
    low.forEach(p=>sec.appendChild(stockRow(p)));
  }
  const home = section(col, "athome", "");
  KITCHEN_GROUPS.forEach(c=>{
    const items = state.pantry.filter(p=>foodGroup(p.foodId)===c);
    if(c==="other" && !items.length) return;
    const open = !!kitchenUI.open[c];
    const b = document.createElement("button");
    b.type = "button"; b.className = "group-btn"; b.dataset.f = "group:" + c;
    b.innerHTML = `<span>${esc(groupName(c))}</span><i class="chev" aria-hidden="true"></i>`;
    b.addEventListener("click", ()=>{ kitchenUI.open[c] = !open; refresh("kitchen"); });
    home.appendChild(b);
    const box = el("div", "group-list"); box.hidden = !open;
    if(open){
      if(!items.length) box.appendChild(el("p", "quiet-line", say("kitchen.groupEmpty")));
      items.forEach(p=>box.appendChild(stockRow(p)));
    }
    home.appendChild(box);
  });
  home.appendChild(addSomething());
}
/* a pantry line: its name and its state in words; a tap moves it on (Plenty → Low → Out → Plenty) */
function stockRow(p){
  const b = document.createElement("button");
  b.type = "button"; b.className = "row-btn"; b.dataset.f = "stock:" + p.foodId;
  b.innerHTML = `<span class="row-t">${esc(p.name)}</span><span class="state-word">${esc(say("kitchen.state." + p.state))}</span>`;
  b.addEventListener("click", ()=>{ setStock(p.foodId, p.name, STOCK_NEXT[p.state]); save(); haptic(); changed(); focusLater("stock:" + p.foodId); });
  return b;
}
/* "Add something": one field, suggestions as it's typed, one tap puts it at home */
function addSomething(){
  const wrap = el("div", "add-line");
  if(!kitchenUI.adding){
    const b = textBtn(say("kitchen.add"), ()=>{ kitchenUI.adding = true; refresh("kitchen"); focusLater("kitchen:adding"); }, "small");
    b.dataset.f = "kitchen:add";
    wrap.appendChild(b);
    return wrap;
  }
  const put = name=>{
    kitchenUI.adding = false;
    if(name){ const id = foodKey(baseName({name})); setStock(id, baseName({name}), "plenty"); kitchenUI.open[foodGroup(id)] = true; save(); haptic(); }
    changed(); focusLater("kitchen:add");
  };
  const list = el("div", "suggest-list");
  const fill = q=>{
    list.innerHTML = "";
    const t = String(q || "").trim().toLowerCase();
    if(t.length < 2) return;
    FOOD_POOL.filter(f=>f.name.toLowerCase().split(/[ ,]+/).some(w=>w.startsWith(t)) && !pantryOf(foodKey(baseName(f)))).slice(0, 4).forEach(f=>{
      const sb = document.createElement("button");
      sb.type = "button"; sb.className = "alt"; sb.dataset.f = "sug:" + f.name; sb.textContent = baseName(f);
      sb.addEventListener("click", ()=>put(f.name));
      list.appendChild(sb);
    });
  };
  const b = blank({min:8, maxLength:30, onInput:fill, onEnter:()=>{ const first = list.querySelector("button"); put(first ? first.dataset.f.slice(4) : b.input.value.trim()); }});
  b.input.dataset.f = "kitchen:adding";
  b.input.addEventListener("keydown", e=>{ if(e.key==="Escape"){ e.preventDefault(); e.stopPropagation(); kitchenUI.adding = false; refresh("kitchen"); focusLater("kitchen:add"); } });
  const parts = say("kitchen.addSentence").split("{blank}");
  const l = document.createElement("label"); l.htmlFor = b.input.id; l.textContent = parts[0].trim();
  wrap.append(l, b.el, list);
  return wrap;
}

/* ---------- Prep ---------- */
function renderPrep(col){
  const fz = section(col, "freezer", "");
  state.freezer.forEach(f=>{
    const r = el("div", "row");
    r.appendChild(el("p", "row-t", say("kitchen.portions", {food:f.name, n:f.portions, date:fmtDayShort(localDate(f.madeOn))}))).style.margin = "0";
    const use = textBtn(say("kitchen.useOne"), ()=>{ f.portions--; if(f.portions <= 0) state.freezer = state.freezer.filter(z=>z!==f); save(); haptic(); refresh("kitchen"); }, "small");
    use.dataset.f = "useone:" + f.foodId;
    r.appendChild(use);
    fz.appendChild(r);
  });
  const tasks = prepTasks();
  tasks.forEach(s=>{
    const r = el("div", "row");
    const t = el("p", "row-t"); t.style.margin = "0"; t.textContent = s.text;
    r.appendChild(t);
    r.appendChild(ring(false, say("kitchen.prepDone", {task:s.text}), ()=>donePrep(s), "prep:" + s.id));
    fz.appendChild(r);
  });
  if(!state.freezer.length && !tasks.length) fz.appendChild(el("p", "quiet-line", say("kitchen.freezerEmpty")));
  if(state.freezer.length || tasks.some(s=>s.kind==="freeze" || s.kind==="defrost")) fz.appendChild(el("p", "storage-note", storageNote()));
}
/* the prep left open: "While you're at it" for the meals still to come today and tomorrow */
function prepTasks(){
  const t = now(), refs = refsOn(t).concat(refsOn(tomorrowOf(t))).filter(x=>x.status==="upcoming" || x.status==="now");
  const seen = new Set(), out = [];
  refs.forEach(x=>alsoFor(x, 3).forEach(s=>{ if(s.kind==="salt" || seen.has(s.id)) return; seen.add(s.id); out.push(s); }));
  return out;
}
function donePrep(s){
  state.prepped = {date:todayISO(), done:prepDone().concat(s.id)};
  const id = foodKey(baseName({name:s.food}));
  if(s.kind==="freeze"){ const f = state.freezer.find(z=>z.foodId===id && z.madeOn===todayISO()); if(f) f.portions += 2; else state.freezer.push({foodId:id, name:baseName({name:s.food}), portions:2, madeOn:todayISO()}); }
  if(s.kind==="defrost"){ const f = state.freezer.find(z=>z.foodId===id); if(f){ f.portions--; if(f.portions <= 0) state.freezer = state.freezer.filter(z=>z!==f); } }
  save(); haptic(); changed();
}

/* ---------- In the store: the Screen Wake Lock ----------
   Only where the browser has it. It lets go when the page is hidden or left, when the Kitchen is left, and after
   60 minutes; it comes back only if it was left on and the page is visible again within the hour. */
const WAKE_MAX_MS = 60 * 60000;
const wake = {on:false, lock:null, until:0, timer:0};
function wakeSupported(){ return "wakeLock" in navigator && !!navigator.wakeLock; }
async function wakeAcquire(){
  if(!wake.on || document.hidden || wake.lock) return;
  try{ wake.lock = await navigator.wakeLock.request("screen"); wake.lock.addEventListener("release", ()=>{ wake.lock = null; }); }
  catch(e){ wake.on = false; }
}
function wakeRelease(){ const l = wake.lock; wake.lock = null; if(l) try{ l.release(); }catch(e){} }
function wakeSet(on){
  wake.on = on; clearTimeout(wake.timer);
  if(on){ wake.until = Date.now() + WAKE_MAX_MS; wake.timer = setTimeout(()=>{ wakeSet(false); kitchenUI.store = false; kitchenUI.wakeOurs = false; refresh("kitchen"); }, WAKE_MAX_MS); wakeAcquire(); }
  else wakeRelease();
}
document.addEventListener("visibilitychange", ()=>{
  if(document.hidden) wakeRelease();
  else if(wake.on && Date.now() < wake.until) wakeAcquire();
  else if(wake.on) wakeSet(false);
});
addEventListener("pagehide", wakeRelease);
