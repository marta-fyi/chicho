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

/* the storage line, built from the numbers above (the words are kitchen.storage) */
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

/* ---------- Cook ahead: deriveCookAhead(plan, pantry, now, opts) (pure) ----------
   A cookable food (method isn't raw) used in two or more meals, the later ones within the food's fridge days of
   the first: cook the extra with the first. Items group into sessions by (method, first-use meal); each item's
   extra is the grams of its later uses. Only meals still ahead (and not offered) count, so a session whose
   first meal has passed never shows. One source: Kitchen's Prep and Home's "While you're at it" both read it.
   opts: {timeOf, isOffered(m, date), done:[session ids], prepped:Set("foodId|iso|mealId") already covered}
   Sessions: {id, method, first:{m, date, iso, start}, items:[{foodId, name, extra, covers}], covers, done} */
function deriveCookAhead(plan, pantry, now, opts){
  const o = opts || {}, isOffered = o.isOffered || (()=>false), done = new Set(o.done || []), prepped = o.prepped || new Set();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const meals = planMealsIn(plan, today, 8, o).filter(x=>stillAhead(x, now) && !isOffered(x.m, x.date));
  const uses = {};
  meals.forEach(x=>x.m.items.forEach(i=>{
    const id = foodKey(baseName(i));
    if(kitchenMeta(id).method==="raw" || prepped.has(id + "|" + x.iso + "|" + x.m.id)) return;
    const list = uses[id] || (uses[id] = []);
    if(!list.some(u=>u.x===x)) list.push({x, i, grams:gramsOf(i)});
  }));
  const sessions = {};
  Object.keys(uses).forEach(id=>{
    const list = uses[id], meta = kitchenMeta(id), win = meta.fridgeDays * 86400000;
    for(let k = 0; k < list.length;){
      const first = list[k];
      let j = k + 1;
      while(j < list.length && list[j].x.start - first.x.start <= win) j++;
      const later = list.slice(k + 1, j);
      if(later.length){
        const key = meta.method + ":" + first.x.iso + ":" + first.x.m.id;
        const s = sessions[key] || (sessions[key] = {id:key, method:meta.method, first:first.x, items:[]});
        s.items.push({foodId:id, name:baseName(first.i), extra:later.reduce((n, u)=>n + u.grams, 0),
                      covers:later.map(u=>({iso:u.x.iso, mealId:u.x.m.id, start:u.x.start, slot:u.x.m.slot, label:u.x.m.label}))});
        k = j;
      }else k++;
    }
  });
  return Object.values(sessions).map(s=>{
    const seen = {};
    s.items.forEach(it=>it.covers.forEach(c=>{ seen[c.iso + "|" + c.mealId] = c; }));
    s.covers = Object.values(seen).sort((a, b)=>a.start - b.start);
    s.items.sort((a, b)=>a.name.localeCompare(b.name));
    s.done = done.has(s.id);
    return s;
  }).sort((a, b)=>a.first.start - b.first.start || a.method.localeCompare(b.method));
}
/* "tonight's dinner", "today's lunch", "tomorrow's lunch", "Sunday's lunch" */
function mealPhrase(date, slot, label, now){
  const days = Math.round((new Date(date.getFullYear(), date.getMonth(), date.getDate()) - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000);
  const meal = String(label || slot).toLowerCase();
  return days===0 ? say(slot==="dinner" ? "kitchen.meal.tonight" : "kitchen.meal.today", {meal}) : days===1 ? say("kitchen.meal.tomorrow", {meal}) : say("kitchen.meal.day", {meal, weekday:fmtWeekdayK(date)});
}
/* "Roast with tonight's dinner" */
function sessionTitle(s, now){ return say("kitchen.session", {method:say("kitchen.method." + s.method), meal:mealPhrase(s.first.date, s.first.m.slot, s.first.m.label, now)}); }
/* "Pumpkin +60 g · Rice +50 g. Covers tomorrow's dinner and Sunday's lunch." */
function sessionDetail(s, now){
  const items = s.items.map(it=>say("kitchen.extra", {food:it.name, g:it.extra})).join(" · ");
  return say("kitchen.sessionDetail", {items, meals:listJoin(s.covers.map(c=>mealPhrase(localDate(c.iso), c.slot, c.label, now)))});
}

/* ---------- Freeze some: at most one suggestion (pure) ----------
   A cookable, freezable food used twice or more this plan week where the second use is beyond its fridge days
   (so cooking ahead can't cover it), and not already in the freezer. The earliest such food wins. */
function deriveFreezeSuggestion(plan, freezer, now, opts){
  const o = opts || {}, isOffered = o.isOffered || (()=>false);
  const recs = (Array.isArray(plan) ? plan : [plan]).filter(Boolean), cur = planRecOn({plans:recs}, now);
  if(!cur) return null;
  const start = localDate(cur.startsOn), end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.max(0, Math.round((end - today) / 86400000));
  const frozen = new Set((freezer || []).filter(f=>f.portions > 0).map(f=>f.foodId));
  const uses = {};
  planMealsIn(recs, today, days, o).filter(x=>x.planWeekId===cur.startsOn && stillAhead(x, now) && !isOffered(x.m, x.date)).forEach(x=>x.m.items.forEach(i=>{
    const id = foodKey(baseName(i)), meta = kitchenMeta(id);
    if(meta.method==="raw" || !meta.freezable || frozen.has(id)) return;
    const list = uses[id] || (uses[id] = []);
    if(!list.some(u=>u.x===x)) list.push({x, i});
  }));
  const hits = Object.keys(uses).filter(id=>{ const u = uses[id]; return u.length >= 2 && u[1].x.start - u[0].x.start > kitchenMeta(id).fridgeDays * 86400000; })
    .map(id=>({foodId:id, name:baseName(uses[id][0].i), first:uses[id][0].x, second:uses[id][1].x}))
    .sort((a, b)=>a.first.start - b.first.start || a.name.localeCompare(b.name));
  return hits[0] || null;
}

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
  // the glow (Veg) lives in the scroll area, centred on the title row, so it scrolls away with the content
  const glow = el("i", "k-glow");
  glow.style.backgroundImage = glowGradient(GLOW.vegetable.hex, KITCHEN_GLOW);
  body.append(glow, col);
  e.append(head, body);
  // the scroll area starts under the header (padding and scroll padding = its measured height), so nothing is
  // ever clipped behind it at rest; what scrolls under it is blurred
  const fit = ()=>{
    const hh = head.offsetHeight; body.style.paddingTop = hh + "px"; body.style.scrollPaddingTop = hh + "px"; e.style.setProperty("--kh", hh + "px");
    const t = head.querySelector(".k-title");
    glow.style.top = (t.getBoundingClientRect().top - body.getBoundingClientRect().top + body.scrollTop + t.offsetHeight / 2) + "px";   // the title's middle, in the scroll area's coordinates
  };
  if(window.ResizeObserver) new ResizeObserver(fit).observe(head);
  body.addEventListener("scroll", ()=>kitchenScrolled(body, head), {passive:true});
  watchPull(body);
  requestAnimationFrame(fit);
  if(document.fonts && document.fonts.ready) document.fonts.ready.then(()=>{ fit(); placeLine(head, false); });
  return {e, head, body, col};
}
/* scrolling: the header's surface and hairline once anything is under it; the position map dims to 35% and comes
   back 400ms after the scrolling stops */
let mapTimer = 0;
function kitchenScrolled(body, head){
  head.classList.toggle("is-under", body.scrollTop > 0);
  const map = $("map");
  if(!map) return;
  map.classList.add("is-dim");
  clearTimeout(mapTimer);
  mapTimer = setTimeout(()=>map.classList.remove("is-dim"), 400);
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
    if(b.dataset.view==="buy"){ const c = b.querySelector(".k-count"), n = list.length && !kitchenUI.store ? String(list.length) : ""; setText(c, n); c.hidden = !n; }
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

/* ---------- In the store: the list regroups by food group, the count leaves the switch, and the screen stays
   awake (Screen Wake Lock) until the store is left, the Kitchen is left, the page is hidden, or an hour passes.
   Off by default and never remembered: a new session starts with it off. ---------- */
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
  // Send the list: a pill pinned above the safe area, only while there's something on the list
  if(list.length){
    const pin = el("div", "k-pin"), pc = el("div", "scr-col");
    const s = document.createElement("button");
    s.type = "button"; s.className = "k-pill"; s.dataset.f = "kitchen:send"; s.textContent = say("kitchen.send");
    s.addEventListener("click", ()=>sendGroceries());
    pc.appendChild(s); pin.appendChild(pc); e.appendChild(pin);
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

/* ---------- At home: what's here, as Plenty, Low or Out (never grams) ----------
   Low first, each with "Add to list"; then the five food groups, each a row with its count, opened in place.
   A tap on a food moves it on (Plenty → Low → Out → Plenty); an Out food stays until it's removed. */
const STOCK_NEXT = {plenty:"low", low:"out", out:"plenty"};
/* keyed rows slide to their new place when a group opens or closes (transform only); new rows fade in */
function flipKitchen(fn){
  const col = screenEl("kitchen").querySelector(".k-view"), before = {};
  if(col) col.querySelectorAll("[data-k]").forEach(x=>{ before[x.dataset.k] = x.getBoundingClientRect().top; });
  fn();
  const now_ = screenEl("kitchen").querySelector(".k-view");
  if(!now_) return;
  const o = {duration:220, easing:"cubic-bezier(.22,.61,.36,1)"};
  now_.querySelectorAll("[data-k]").forEach(x=>{
    const k = x.dataset.k, top = x.getBoundingClientRect().top;
    if(k in before){ const dy = before[k] - top; if(Math.abs(dy) > .5) x.animate([{transform:`translateY(${dy}px)`}, {transform:"none"}], o); }
    else x.animate([{opacity:0, transform:"translateY(-8px)"}, {opacity:1, transform:"none"}], o);
  });
}
function onList(foodId){ return state.shop.manual.some(x=>x.foodId===foodId); }
function toggleList(p){
  if(onList(p.foodId)) state.shop.manual = state.shop.manual.filter(x=>x.foodId!==p.foodId);
  else state.shop.manual.push({foodId:p.foodId});
  save(); haptic(); changed();
}
function renderAtHome(col){
  const low = state.pantry.filter(p=>p.state==="low");
  if(low.length){
    const sec = section(col, "low", "");
    sec.appendChild(el("h2", "k-label", say("kitchen.low")));
    low.forEach(p=>{
      const on = onList(p.foodId);
      const b = textBtn(say(on ? "kitchen.onList" : "kitchen.addToList"), ()=>toggleList(p), "small k-act" + (on ? " quiet" : ""));
      b.dataset.f = "list:" + p.foodId;
      const r = kRow(p.name, "", b, null); r.dataset.k = "low:" + p.foodId;
      sec.appendChild(r);
    });
  }
  const sec = section(col, "groups", "");
  KITCHEN_GROUPS.forEach(c=>{
    const items = state.pantry.filter(p=>foodGroup(p.foodId)===c);
    if(c==="other" && !items.length) return;
    const open = !!kitchenUI.open[c];
    const n = items.filter(p=>p.state!=="out").length, m = items.filter(p=>p.state==="low").length;
    const toggle = ()=>flipKitchen(()=>{ kitchenUI.open[c] = !open; refresh("kitchen"); });
    const t = textBtn(say(open ? "kitchen.hide" : "kitchen.show"), toggle, "small k-act"); t.dataset.f = "group:" + c;
    const r = kRow(groupName(c), m ? say("kitchen.groupLow", {n, m}) : String(n), t, toggle, "grouprow:" + c);
    r.classList.add("k-group"); r.dataset.k = "grp:" + c;
    sec.appendChild(r);
    if(open) items.forEach(p=>sec.appendChild(stockRow(p)));
  });
  sec.appendChild(addSomething());
}
/* a food at home: its name, its state as a word; a tap moves it on. Out shows Remove beside the word */
function stockRow(p){
  const right = el("span", "k-right");
  if(p.state==="out"){
    const rm = textBtn(say("kitchen.remove"), e=>{ e.stopPropagation(); flipKitchen(()=>{ setStock(p.foodId, p.name, null); save(); haptic(); changed(); }); }, "small k-act"); rm.dataset.f = "remove:" + p.foodId;
    right.appendChild(rm);
  }
  right.appendChild(el("span", "k-state", say("kitchen.state." + p.state)));
  const r = kRow(p.name, "", right, ()=>{ setStock(p.foodId, p.name, STOCK_NEXT[p.state]); save(); haptic(); changed(); }, "stock:" + p.foodId);
  r.classList.add("k-item"); r.dataset.k = "item:" + p.foodId;
  return r;
}
/* "Add something": a text link that becomes the sentence "Add to the kitchen: ____." in place, with live
   suggestions from the food manifest. The field is built and focused inside the tap itself (iOS opens the
   keyboard only for a focus made during a tap). Enter adds the first suggestion as Plenty, in its group. */
function addSomething(){
  const wrap = el("div", "add-line k-add"); wrap.dataset.k = "add";
  const link = textBtn(say("kitchen.add"), ()=>{ link.remove(); const inp = addSentence(wrap); inp.focus(); }, "small"); link.dataset.f = "kitchen:add";
  wrap.appendChild(link);
  return wrap;
}
function addSentence(wrap){
  const list = el("div", "suggest-list");
  const matches = q=>{
    const t = String(q || "").trim().toLowerCase();
    return t.length < 2 ? [] : FOOD_POOL.filter(f=>f.name.toLowerCase().split(/[ ,]+/).some(w=>w.startsWith(t)) && !pantryOf(foodKey(baseName(f)))).slice(0, 4);
  };
  const put = f=>{
    const id = foodKey(baseName(f));
    setStock(id, baseName(f), "plenty"); kitchenUI.open[foodGroup(id)] = true;
    save(); haptic(); changed();
  };
  const fill = q=>{
    list.innerHTML = "";
    matches(q).forEach(f=>{
      const sb = document.createElement("button");
      sb.type = "button"; sb.className = "alt"; sb.dataset.f = "sug:" + f.name; sb.textContent = baseName(f);
      sb.addEventListener("click", ()=>put(f));
      list.appendChild(sb);
    });
  };
  const b = blank({min:8, maxLength:30, onInput:fill, onEnter:()=>{ const f = matches(b.input.value)[0]; if(f) put(f); }});
  b.input.dataset.f = "kitchen:adding";
  b.input.addEventListener("keydown", e=>{ if(e.key==="Escape"){ e.preventDefault(); e.stopPropagation(); refresh("kitchen"); } });
  const [before, after] = say("kitchen.addSentence").split("{blank}");
  const l = document.createElement("label"); l.htmlFor = b.input.id; l.textContent = before.trim();
  const s = el("p", "k-sentence"); s.append(l, " ", b.el, after || "");
  wrap.append(s, list);
  return b.input;
}


/* ---------- the app's side of cook-ahead: one source, one done-state ----------
   A session ticked done (in Prep, or on Home) is kept as a record with its covered meals: those meals then show
   "{food} · prepped", and their uses no longer make new sessions. The record carries what it needs to be drawn
   until its first meal has passed (so it can be unticked). */
function preppedKeys(){ const s = new Set(); state.cookAhead.done.forEach(r=>r.covers.forEach(c=>s.add(c.foodId + "|" + c.iso + "|" + c.mealId))); return s; }
function cookAhead(){
  return deriveCookAhead(state.plans, state.pantry, now(), {timeOf:mealTime, isOffered:(m, d)=>mealOffered(m, d), done:state.cookAhead.done.map(r=>r.id), prepped:preppedKeys()});
}
function isPrepped(item, iso, mealId){ return preppedKeys().has(foodIdOf(item) + "|" + iso + "|" + mealId); }
function markCooked(s){
  if(state.cookAhead.done.some(r=>r.id===s.id)) return;
  const iso = d=>new Date(d).toISOString();
  state.cookAhead.done.push({id:s.id, at:now().toISOString(),
    covers:s.items.flatMap(it=>it.covers.map(c=>({foodId:it.foodId, iso:c.iso, mealId:c.mealId}))),
    session:{method:s.method, first:{iso:s.first.iso, mealId:s.first.m.id, slot:s.first.m.slot, label:s.first.m.label, start:iso(s.first.start)},
             items:s.items.map(it=>({foodId:it.foodId, name:it.name, extra:it.extra})),
             covers:s.covers.map(c=>({iso:c.iso, mealId:c.mealId, slot:c.slot, label:c.label, start:iso(c.start)}))}});
}
function unmarkCooked(id){ state.cookAhead.done = state.cookAhead.done.filter(r=>r.id!==id); }
/* a done record, drawn like a live session */
function recordSession(r){
  const S = r.session, f = S.first;
  return {id:r.id, method:S.method, done:true, items:S.items,
          first:{iso:f.iso, date:localDate(f.iso), start:new Date(f.start), m:{id:f.mealId, slot:f.slot, label:f.label}},
          covers:S.covers.map(c=>Object.assign({}, c, {start:new Date(c.start)}))};
}
/* Prep's list: what's still to cook ahead, and what's been ticked whose first meal hasn't passed */
function prepSessions(){
  const t = now();
  state.cookAhead.done = state.cookAhead.done.filter(r=>!r.session || (t - new Date(r.session.first.start)) < 14 * 86400000);
  const done = state.cookAhead.done.filter(r=>r.session && stillAhead({start:new Date(r.session.first.start)}, t)).map(recordSession);
  return cookAhead().filter(s=>!s.done).concat(done).sort((a, b)=>a.first.start - b.first.start || a.method.localeCompare(b.method));
}

/* ---------- Prep: Cook ahead, then In the freezer ---------- */
function prepRow(title, detail, right, f){
  const r = el("div", "k-prep");
  if(f) r.dataset.f = f;
  const t = el("div", "k-prep-t");
  t.append(el("span", "k-prep-title", title), el("span", "k-prep-detail", detail));
  r.append(t, right);
  return r;
}
function renderPrep(col, list, e){
  const t = now();
  // Cook ahead
  const cook = section(col, "cook", "");
  cook.appendChild(el("h2", "k-label", say("kitchen.cookAhead")));
  const all = prepSessions(), shown = kitchenUI.morePrep ? all : all.slice(0, KITCHEN.MAX_PREP_SESSIONS);
  if(!all.length) cook.appendChild(el("p", "k-quiet", say("kitchen.nothingToCook")));
  shown.forEach(s=>{
    const ringB = kRing(s.done, ()=>{ if(s.done) unmarkCooked(s.id); else markCooked(s); save(); haptic(); changed(); }, "cook:" + s.id);
    const r = prepRow(sessionTitle(s, t), sessionDetail(s, t), ringB);
    r.dataset.session = s.id;
    cook.appendChild(r);
  });
  if(all.length > shown.length){
    const more = textBtn(say("kitchen.showMore"), ()=>{ kitchenUI.morePrep = true; refresh("kitchen"); }, "small k-more"); more.dataset.f = "prep:more";
    cook.appendChild(more);
  }
  cook.appendChild(el("p", "k-foot", storageNote()));
  // In the freezer
  const fz = section(col, "freezer", "");
  fz.appendChild(el("h2", "k-label", say("kitchen.inFreezer")));
  const sug = deriveFreezeSuggestion(state.plans, state.freezer, t, {timeOf:mealTime, isOffered:(m, d)=>mealOffered(m, d)});
  if(sug){
    const ringB = kRing(false, ()=>{
      ringB.classList.add("on");
      const entry = {foodId:sug.foodId, name:sug.name, portions:KITCHEN.DEFAULT_PORTIONS, madeOn:todayISO()};
      setTimeout(()=>{
        state.freezer.push(entry);
        setKitchenUndo(say("kitchen.frozeUndo", {food:sug.name}), ()=>{ state.freezer = state.freezer.filter(z=>z!==entry); });
        save(); haptic(); changed();
      }, 180);
    }, "freeze:" + sug.foodId);
    fz.appendChild(prepRow(say("kitchen.freezeSome", {food:lower1(sug.name)}),
      say("kitchen.freezeWhy", {meal:String(sug.second.m.label).toLowerCase(), weekday:fmtWeekdayK(sug.second.date)}), ringB, "freezesug"));
  }
  state.freezer.forEach(f=>{
    const key = f.foodId + "|" + f.madeOn, age = Math.round((localDate(todayISO()) - localDate(f.madeOn)) / 86400000);
    const meta = say("kitchen.portionsMeta", {n:f.portions, date:fmtDayShort(localDate(f.madeOn))}) + (age >= KITCHEN.FREEZER_SOON_DAYS ? " · " + say("kitchen.useSoon") : "");
    const use = textBtn(say("kitchen.usedOne"), ev=>{
      ev.stopPropagation();
      f.portions--;
      if(f.portions <= 0){
        const at = state.freezer.indexOf(f);
        state.freezer = state.freezer.filter(z=>z!==f);
        setKitchenUndo(say("kitchen.usedLast", {food:lower1(f.name)}), ()=>{ f.portions = 1; state.freezer.splice(Math.min(at, state.freezer.length), 0, f); });
      }
      save(); haptic(); changed();
    }, "small k-act"); use.dataset.f = "useone:" + f.foodId;
    const r = kRow(f.name, meta, use, ()=>{ kitchenUI.fzOpen = kitchenUI.fzOpen===key ? null : key; refresh("kitchen"); }, "frozen:" + f.foodId);
    fz.appendChild(r);
    if(kitchenUI.fzOpen===key){
      const acts = el("div", "k-acts");
      const rm = textBtn(say("kitchen.remove"), ()=>{ state.freezer = state.freezer.filter(z=>z!==f); kitchenUI.fzOpen = null; save(); haptic(); changed(); }, "small"); rm.dataset.f = "fzremove:" + f.foodId;
      acts.appendChild(rm); fz.appendChild(acts);
    }
  });
  if(!state.freezer.length) fz.appendChild(el("p", "k-quiet", say("kitchen.freezerEmpty")));
  fz.appendChild(addFrozen());
}
/* "Add a frozen portion": the sentence "Frozen: ____." with food suggestions, and how many portions (16px, numeric,
   2 to start). Built and focused inside the tap. */
function addFrozen(){
  const wrap = el("div", "add-line k-add");
  const link = textBtn(say("kitchen.addFrozen"), ()=>{ link.remove(); frozenSentence(wrap).focus(); }, "small"); link.dataset.f = "frozen:add";
  wrap.appendChild(link);
  return wrap;
}
function frozenSentence(wrap){
  const list = el("div", "suggest-list");
  const n = document.createElement("input");
  n.type = "text"; n.inputMode = "numeric"; n.className = "k-num"; n.value = String(KITCHEN.DEFAULT_PORTIONS); n.maxLength = 2; n.dataset.f = "frozen:portions";
  n.addEventListener("input", ()=>{ n.value = n.value.replace(/\D/g, ""); });
  const matches = q=>{ const t = String(q || "").trim().toLowerCase(); return t.length < 2 ? [] : FOOD_POOL.filter(f=>f.name.toLowerCase().split(/[ ,]+/).some(w=>w.startsWith(t))).slice(0, 4); };
  const put = f=>{
    const id = foodKey(baseName(f)), portions = Math.max(1, Math.min(99, parseInt(n.value, 10) || KITCHEN.DEFAULT_PORTIONS)), iso = todayISO();
    const same = state.freezer.find(z=>z.foodId===id && z.madeOn===iso);
    if(same) same.portions += portions; else state.freezer.push({foodId:id, name:baseName(f), portions, madeOn:iso});
    save(); haptic(); changed();
  };
  const fill = q=>{
    list.innerHTML = "";
    matches(q).forEach(f=>{
      const sb = document.createElement("button");
      sb.type = "button"; sb.className = "alt"; sb.dataset.f = "fsug:" + f.name; sb.textContent = baseName(f);
      sb.addEventListener("click", ()=>put(f));
      list.appendChild(sb);
    });
  };
  const b = blank({min:8, maxLength:30, onInput:fill, onEnter:()=>{ const f = matches(b.input.value)[0]; if(f) put(f); }});
  b.input.dataset.f = "frozen:food";
  n.addEventListener("keydown", e=>{ if(e.key==="Enter"){ e.preventDefault(); const f = matches(b.input.value)[0]; if(f) put(f); } });
  const [before, after] = say("kitchen.frozenSentence").split("{blank}");
  const l = document.createElement("label"); l.htmlFor = b.input.id; l.textContent = before.trim();
  const s = el("p", "k-sentence"); s.append(l, " ", b.el, after || "");
  const p = el("p", "k-portions"), pl = document.createElement("label");
  n.id = "fz" + uid(); pl.htmlFor = n.id; pl.textContent = say("kitchen.portionsLabel");
  p.append(pl, n);
  wrap.append(s, p, list);
  return b.input;
}

/* ---------- In the store: the Screen Wake Lock ----------
   Only where the browser has it. It lets go when the page is hidden or left, when the Kitchen is left, and after
   60 minutes; it comes back only if it was left on and the page is visible again within the hour. */
const WAKE_MAX_MS = 60 * 60000;
const wake = {on:false, lock:null, until:0, timer:0, max:WAKE_MAX_MS};
function wakeSupported(){ return "wakeLock" in navigator && !!navigator.wakeLock; }
async function wakeAcquire(){
  if(!wake.on || document.hidden || wake.lock) return;
  try{ wake.lock = await navigator.wakeLock.request("screen"); wake.lock.addEventListener("release", ()=>{ wake.lock = null; }); }
  catch(e){ wake.on = false; }
}
function wakeRelease(){ const l = wake.lock; wake.lock = null; if(l) try{ l.release(); }catch(e){} }
function wakeSet(on){
  wake.on = on; clearTimeout(wake.timer);
  if(on){ wake.until = Date.now() + wake.max; wake.timer = setTimeout(()=>{ wakeSet(false); kitchenUI.store = false; kitchenUI.wakeOurs = false; refresh("kitchen"); }, wake.max); wakeAcquire(); }
  else wakeRelease();
}
document.addEventListener("visibilitychange", ()=>{
  if(document.hidden) wakeRelease();
  else if(wake.on && Date.now() < wake.until) wakeAcquire();
  else if(wake.on) wakeSet(false);
});
addEventListener("pagehide", wakeRelease);
