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
