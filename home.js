/* ====================================================================
   CHICHO: a spatial app. Five full-screen views on a 2D canvas, reached
   by swiping, by the position map's links, by the keyboard, or by the
   moment line on Home. Home is where you offer; every other screen does
   one job and is one swipe away. Gestures are shortcuts, never the only
   path. Nothing responds to hover.
   ==================================================================== */
const $ = id=>document.getElementById(id);
const GROUPS = ["protein","vegetable","fruit","grain","fat"];
/* only touch the DOM when the words actually change (the clock ticks every minute) */
function setText(el, text){ if(el && el.textContent!==text) el.textContent = text; }
function hasPlan(){ return !!state.plan && state.plan.days.some(d=>d.meals.some(m=>m.items.length)); }
function milkOnly(){ return ageNow() < 6 && !state.profile.exploreEarly; }
function weekStart(){ const d = localDate(state.weekStarted); return isNaN(d) ? now() : d; }
function addDays(d, n){ return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); }
/* the running week's seven days, from the day it started (not Monday) */
function weekDays(){ const s = weekStart(); return Array.from({length:7}, (_, pos)=>({pos, date:addDays(s, pos)})); }
function weekDone(){ return now() >= addDays(weekStart(), 7); }
const fmt = (o=>d=>new Intl.DateTimeFormat(undefined, o).format(d));
const fmtWeekday = fmt({weekday:"long"}), fmtDayMonth = fmt({day:"numeric", month:"long"}), fmtDayShort = fmt({day:"numeric", month:"short"});
/* the top-right corner: "Thursday 22 Oct" over the time (the reader's own clock, no seconds) */
function fmtCornerDate(d){
  const parts = new Intl.DateTimeFormat(undefined, {weekday:"long", day:"numeric", month:"short"}).formatToParts(d);
  const part = t=>(parts.find(p=>p.type===t) || {}).value || "";
  return `${part("weekday")} ${part("day")} ${part("month").replace(/\.$/, "")}`;
}
/* days from today to a date (calendar days) */
function daysFromToday(date){ return Math.round((new Date(date.getFullYear(), date.getMonth(), date.getDate()) - new Date(now().getFullYear(), now().getMonth(), now().getDate())) / 86400000); }
/* "today's", "tomorrow's", "Friday's" */
function possDay(date){ const n = daysFromToday(date); return n===0 ? say("days.poss.today") : n===1 ? say("days.poss.tomorrow") : say("days.possDay", {weekday:fmtWeekday(date)}); }
function textBtn(label, fn, cls){
  const b = document.createElement("button");
  b.type = "button"; b.className = "btn-text" + (cls ? " " + cls : ""); b.textContent = label;
  b.addEventListener("click", fn);
  return b;
}
function el(tag, cls, text){ const e = document.createElement(tag); if(cls) e.className = cls; if(text!==undefined) e.textContent = text; return e; }
/* keep focus on the same control across a redraw (by its data-f key) */
function focusMemo(){ const a = document.activeElement; return a && a.dataset && a.dataset.f ? a.dataset.f : null; }
function focusRestore(k){ if(!k) return; const e = document.querySelector(`[data-f="${CSS.escape(k)}"]`); if(e) e.focus({preventScroll:true}); }
function focusLater(f){ requestAnimationFrame(()=>focusRestore(f)); }

/* ---------- foods by id: the pool's own entry when there is one ---------- */
const FOOD_INFO = {};
function foodInfo(foodId){
  if(FOOD_INFO[foodId]) return FOOD_INFO[foodId];
  const f = FOOD_POOL.find(x=>foodKey(baseName(x))===foodId);
  if(f) return (FOOD_INFO[foodId] = {name:f.name, label:baseName(f), cat:f.cats[0]});
  for(const p of state.plans) for(const d of p.days) for(const m of d.meals) for(const i of m.items) if(foodIdOf(i)===foodId) return {name:i.name, label:baseName(i), cat:i.cats[0] || "other"};
  return {name:upper1(foodId), label:upper1(foodId), cat:"other"};
}

/* ---------- offering: "I put this in front of {name}" ---------- */
function offerMeal(m, date, on){
  const iso = isoOf(date);
  if(on){
    if(mealOffered(m, date)) return;
    const known = knownFoods(), intro = introducedAllergens(state.profile), at = now().toISOString();
    m.items.forEach(i=>{
      if(itemOffered(m, i, date)) return;
      const foodId = foodIdOf(i), als = allergensOf(i.name);
      state.offers.push({id:uid(), at, date:iso, mealId:m.id, itemId:i.id, foodId, outcome:null,
                         firstOfFood:!known.has(foodId), firstAllergen:als.some(a=>!intro.has(a))});
      known.add(foodId); als.forEach(a=>intro.add(a));
    });
  }else{
    // Undo takes back the tick's own events (and any outcome given since)
    const ids = new Set(state.offers.filter(e=>e.mealId===m.id && e.date===iso).map(e=>e.id));
    state.offers = state.offers.filter(e=>!ids.has(e.id) && !ids.has(e.corrects));
  }
  offersChanged();
}
/* how it went: optional and equal. The first answer fills the events in; a change of mind is a new event */
function setOutcome(m, date, v){
  const next = mealOutcome(m, date)===v ? null : v, at = now().toISOString();
  offersOf(m, date).forEach(e=>{
    const raw = state.offers.find(x=>x.id===e.id);
    if(raw.outcome===null && !state.offers.some(x=>x.corrects===e.id)) raw.outcome = next;
    else state.offers.push({id:uid(), at, corrects:e.id, outcome:next});
  });
  offersChanged();
}
/* the foods of a group offered between two dates (inclusive), by label */
function offeredFoods(cat, fromISO, toISO){
  const out = new Set();
  liveOffers().forEach(e=>{ if(e.date >= fromISO && e.date <= toISO && foodInfo(e.foodId).cat===cat) out.add(foodInfo(e.foodId).label); });
  return [...out];
}
/* allergens met before a day: tried before Chicho (onboarding), or carried by an earlier offer */
function allergensKnownBefore(iso){
  const P = state.profile, known = new Set(Object.entries(P.allergens || {}).filter(([,v])=>v==="ok").map(([k])=>k));
  liveOffers().forEach(e=>{ if(e.date < iso) allergensOf(foodInfo(e.foodId).name).forEach(a=>known.add(a)); });
  return known;
}
/* the common allergens this meal brings {name} for the first time: [{id, label, foods}]. Known: met before its day,
   or carried by another meal already offered that day (a second wheat meal isn't a first). Only this meal's: a
   raspberry snack never says wheat because breakfast had toast. */
function firstAllergensIn(ref){
  const iso = isoOf(ref.date), known = allergensKnownBefore(iso), out = {};
  liveOffers().forEach(e=>{ if(e.date===iso && e.mealId!==ref.m.id) allergensOf(foodInfo(e.foodId).name).forEach(a=>known.add(a)); });
  ref.m.items.forEach(i=>allergensOf(i.name).forEach(a=>{
    if(known.has(a)) return;
    const al = ALLERGENS.find(z=>z.id===a);
    (out[a] = out[a] || {id:a, label:al ? al.label.split(" /")[0] : a, foods:[]}).foods.push(i);
  }));
  return Object.values(out);
}
/* the allergen record, separate from preferences: notyet · introduced (on a date, maybe no reaction noted) · keepout */
function allergenRecord(id){
  const P = state.profile, note = state.allergyNotes[id] || {};
  if(P.allergens[id]==="avoid") return {state:"keepout"};
  const first = liveOffers().filter(e=>allergensOf(foodInfo(e.foodId).name).includes(id)).sort((a, b)=>a.date < b.date ? -1 : 1)[0];
  if(first) return {state:"introduced", on:first.date, noReactionOn:note.noReactionOn || null};
  if(P.allergens[id]==="ok") return {state:"introduced", on:null, noReactionOn:note.noReactionOn || null};
  return {state:"notyet"};
}

/* ---------- the cooking layer ---------- */
function cookOf(name){ const f = foodOf(name); return (f && f.cook) || {method:"raw", min:0}; }
function textureOf(item){ return item.tex || stageFor(planMonths()).textureShort || "soft pieces"; }
function foodHow(item){
  const c = cookOf(item.name);
  return say("cook.how." + c.method, {food:lower1(baseName(item)), min:c.min, texture:textureOf(item)});
}
/* one or two lines: how to cook the longest-cooking food, then how to serve it all */
function mealHow(m){
  if(!m.items.length) return [];
  const cooked = m.items.filter(i=>cookOf(i.name).method!=="raw").sort((a, b)=>cookOf(b.name).min - cookOf(a.name).min);
  const lines = [foodHow(cooked[0] || m.items[0])];
  if(m.items.length > 1 || cooked.length) lines.push(say("cook.serve", {texture:stageFor(planMonths()).textureShort || "soft pieces"}));
  return lines.slice(0, 2);
}
/* "Lentils · 40 g · mashed" */
function foodLine(i){ return [baseName(i), i.qty, textureOf(i)].filter(Boolean).join(" · "); }
/* a different way in, for a food that's still warming up: another texture, shape or pairing */
function anotherWay(foodId, k){
  const info = foodInfo(foodId), c = cookOf(info.name);
  const loved = lovedFoods().filter(f=>f!==foodId)[k || 0];
  if(loved) return say("profile.way.pair", {food:lower1(foodInfo(loved).label)});
  return say("profile.way." + (["steam","roast","boil","raw"].includes(c.method) ? c.method : "raw"));
}

/* ---------- the moment line: one line, picked by the first rule that applies. It's also the router: its
   text action goes to the screen that does the job ---------- */
const QUIET_FROM_MIN = 21*60 + 30;   // after 21:30 only tomorrow's first meal, no actions
const LATE_QUESTIONS = ["priorities","people"];   // meal times and the kitchen are asked in the onboarding, never late
function momentLine(){
  const P = state.profile, t = now(), iso = todayISO(), name = P.name || "", st = stageNow(), months = ageNow();
  const later = state.moment && state.moment.date===iso ? state.moment.later || [] : [];
  const open = key=>!later.includes(key);
  const L = (key, text, actions, tone)=>({key, text, actions:actions || [], tone:tone || "plain"});
  const putAway = key=>()=>{ state.moment = {date:iso, later:later.concat(key)}; save(); changed(); };
  const hintSeen = k=>!!state.hints[k];
  const hint = (k, text, fn)=>L("hint:" + k, "", [[text, fn], [say("moment.later"), ()=>{ state.hints[k] = iso; save(); changed(); }]]);
  if(months < 6 && !P.exploreEarly) return L("milk", say("moment.milk", {n:Math.max(1, 6 - months)}));
  const nx = nextMeal(), today = mealsOn(t);
  const tmFirst = mealsOn(tomorrowOf(t))[0];
  const minutes = t.getHours()*60 + t.getMinutes();
  if(minutes >= QUIET_FROM_MIN){
    if(!tmFirst) return L("quiet", "");
    const f = tmFirst.m.items.map(i=>lower1(baseName(i)));
    return L("quiet", f.length > 1 ? say("moment.quiet", {meal:tmFirst.m.label, food1:f[0], food2:f[1]}) : say("moment.quietOne", {meal:tmFirst.m.label, food1:f[0] || ""}));
  }
  // a boundary that changes the meals: "{name} is {n} months. New meals, new times. Set them?" → Meal times, in Profile
  if(st.solids && mealSlotsStale(months, st) && open("stage"))
    return L("stage", say("moment.stage", {name, months}), [[say("moment.set"), ()=>openOnboarding("mealtimes", {single:true})], [say("moment.later"), putAway("stage")]]);
  if(!today.length) return L("noplan", say("moment.noPlan", {name}), [[say("moment.noPlanAction"), ()=>go("week")]]);
  if(weekDone()) return L("weekdone", say("moment.weekDone"), [[say("moment.weekNext"), ()=>go("week")]]);
  // a planned food that's run out, for a meal still to come today: swap it on Shuffle
  const miss = today.filter(x=>x.status==="upcoming" || x.status==="now").map(x=>({x, i:x.m.items.find(i=>stockState(foodIdOf(i))==="out")})).find(y=>y.i);
  if(miss && open("missing")){
    const target = ()=>go("shuffle", {date:miss.x.date, mealId:miss.x.m.id});
    if(!hintSeen("shuffle")) return hint("shuffle", say("moment.hint.shuffle", {meal:miss.x.m.label.toLowerCase()}), target);
    return L("missing", say("moment.missing", {food:lower1(baseName(miss.i))}), [[say("moment.missingAction", {meal:miss.x.m.label.toLowerCase()}), target], [say("moment.later"), putAway("missing")]]);
  }
  // things to pick up: soon, on shopping day, or new since a shuffle
  const list = toBuyList(), n = list.length;
  const fresh = state.newToBuy.filter(id=>list.some(x=>x.foodId===id)).length;
  const soon = list.some(x=>Math.round((x.date - new Date(t.getFullYear(), t.getMonth(), t.getDate())) / 86400000) <= 1);
  const shopDay = P.shopDay!==undefined && P.shopDay!==null && t.getDay()===P.shopDay;
  if(n && t.getHours() < 19 && open("shop")){
    if(!hintSeen("kitchen")) return hint("kitchen", say("moment.hint.kitchen"), ()=>go("kitchen"));
    if(soon || shopDay || fresh) return L("shop", "", [[fresh ? say("moment.shopNew", {n:fresh}) : say("moment.shop", {n}), ()=>go("kitchen")], [say("moment.later"), putAway("shop")]]);
  }
  // day 2 (once), never when already installed: how to add Chicho to the Home Screen
  if(installLineDue(today)) return L("install", say("moment.install"), [[say("moment.later"), ()=>{ state.asked = Object.assign({}, state.asked, {installLater:iso}); putAway("install")(); }]]);
  const dayOver = !(nx && nx.when==="today");
  if(dayOver && tmFirst && open("tomorrow")){
    const f = tmFirst.m.items.map(i=>lower1(baseName(i)));
    const text = f.length > 1 ? say("moment.tomorrow", {food1:f[0], food2:f[1]}) : say("moment.tomorrowOne", {food1:f[0] || ""});
    const who = P.people[0];
    return L("tomorrow", text, [[who ? say("moment.sendTo", {person:who.name}) : say("moment.sendTomorrow"), ()=>sendDay(tomorrowOf(t), who)]]);
  }
  const q = lateQuestion(today);
  if(q) return L("ask:" + q, say("moment.ask." + q, {name}), [[say("moment.set"), ()=>answerLate(q)], [say("moment.later"), ()=>{ markAsked(q, false); putAway("ask:" + q)(); }]]);
  // after the first week of offers: how they're doing lives above
  const firstOffer = liveOffers().reduce((a, e)=>!a || e.date < a ? e.date : a, null);
  if(firstOffer && !hintSeen("profile") && isoOf(addDays(localDate(firstOffer), 7)) <= iso) return hint("profile", say("moment.hint.profile", {name}), ()=>go("profile"));
  // a daily food tip from today's foods (the same all day)
  const food = today.flatMap(x=>x.m.items)[0];
  return L("tip", say("cook.tips", {name, food:food ? lower1(baseName(food)) : "food"}, "tip"));
}
/* have the stage's meals changed since the family last set theirs? (their snack choice was made against other slots;
   with none made yet, the month a new stage starts, as before: a baby who turns 6 months, or a family from before) */
function mealSlotsStale(months, st){
  const P = state.profile;
  return P.mealSlots ? P.mealSlots.base!==slotSig(slotsFor(months)) : P.lastStage!==st.id && months===st.from;
}
/* ---------- the install line ---------- */
function isStandalone(){ return matchMedia("(display-mode: standalone)").matches || navigator.standalone===true; }
/* the second day (or the first one after it that Chicho is opened), on an iPhone or iPad in the browser, once:
   it shows all that day unless "Later", and never on another day. Not while a meal is "now". */
function installLineDue(today){
  const P = state.profile, A = state.asked || {}, iso = todayISO();
  if(isStandalone() || platform()!=="apple" || !navigator.maxTouchPoints) return false;
  if(!P.firstDay || P.firstDay >= iso || A.installLater) return false;
  if(A.install && A.install!==iso) return false;
  if(today.some(x=>x.status==="now")) return false;
  if(!A.install){ state.asked = Object.assign({}, A, {install:iso}); save(); }
  return true;
}
/* at most one late question a day, never on day one, never while a meal is "now" */
function lateQuestion(today){
  const P = state.profile, iso = todayISO(), A = state.asked || {};
  if(!P.firstDay || P.firstDay >= iso) return null;
  if(today.some(x=>x.status==="now")) return null;
  if(A.day===iso) return A.today && !A[A.today] && !(state.moment.later || []).includes("ask:" + A.today) ? A.today : null;
  const weekOld = isoOf(addDays(localDate(P.firstDay), 7)) <= iso;
  const want = {priorities:weekOld && !(P.priorities || []).length,
                people:!!A.shared && !P.people.length};
  const q = LATE_QUESTIONS.find(k=>want[k] && !A[k]);
  if(!q) return null;
  state.asked = Object.assign({}, A, {day:iso, today:q});
  save();
  return q;
}
function markAsked(q, answered){ state.asked = Object.assign({}, state.asked, answered ? {[q]:todayISO()} : {}); save(); }
function answerLate(q){
  markAsked(q, true);
  if(q==="priorities") openOnboarding("priorities", {single:true});
  else go("profile", {section:"people"});
}

/* ---------- "While you're at it": lead times, cooking ahead and the family's salt, using only foods already in
   the plan. Pure: reads only its arguments (and the stage table), so it can never suggest anything the
   generator didn't already pass through the safety rules. seen.isOffered(meal, date) says whether a later meal
   is already offered; seen.sessions are the cook-ahead sessions (deriveCookAhead: one source with the Kitchen). */
const LEAD = {defrost:8, soak:8};   // hours a lead-time step needs before the meal
const SALT_MAX_SHOWINGS = 3;
const LEGUMES = ["lentils","chickpeas"];
function planMealsBetween(plan, profile, from, to){
  const out = [];
  for(let d = new Date(from.getFullYear(), from.getMonth(), from.getDate()); d <= to; d = addDays(d, 1)){
    const dayIdx = plan.days.findIndex(x=>x.name===DAY_ORDER[d.getDay()]);
    if(dayIdx < 0) continue;
    plan.days[dayIdx].meals.forEach((m, k)=>{
      if(!m.items.length) return;
      const hm = (profile.timesToday && profile.timesToday.date===isoOf(d) && profile.timesToday.times[m.slot]) || (profile.mealTimes || {})[m.slot] || stageTimes(Math.max(6, ageMonths(profile.birthDate, from) || 6))[m.slot];
      const start = atTime(d, hm);
      if(start > from && start <= to) out.push({m, k, dayIdx, date:d, start});
    });
  }
  return out.sort((a, b)=>a.start - b.start);
}
function whenWord(start, nowD){
  const d0 = new Date(nowD.getFullYear(), nowD.getMonth(), nowD.getDate()), d1 = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const days = Math.round((d1 - d0) / 86400000);
  return days===0 ? say("also.when.today") : days===1 ? say("also.when.tomorrow") : say("also.when.later", {weekday:fmtWeekday(start)});
}
function suggestAlso(meal, plan, nowD, profile, pantry, seen){
  const S = seen || {}, done = new Set(S.done || []), out = [], isOffered = S.isOffered || (()=>false);
  // two lines about the same food would repeat each other (the salt line is about the meal, not a food)
  const add = s=>{ if(out.length < (S.max || 2) && !done.has(s.id) && (s.kind==="salt" || !out.some(o=>o.food===s.food && o.kind!=="salt"))) out.push(s); };
  const ref = meal, m = ref.m, months = ageMonths(profile.birthDate, nowD) || 0;
  const name = profile.name || "";
  const ahead = h=>planMealsBetween(plan, profile, ref.start, new Date(ref.start.getTime() + h*3600000)).filter(x=>!(x.dayIdx===ref.dayIdx && x.k===ref.k) && !isOffered(x.m, x.date));
  const label = x=>x.m.label.toLowerCase();
  // 1. lead time: a later meal needs a frozen portion defrosted or dried legumes soaked, while there's still time
  ahead(36).forEach(x=>{
    const hours = (x.start - nowD) / 3600000;
    x.m.items.forEach(i=>{
      const key = foodKey(i.name);
      if(x.m.from && metaOf(i.name).freezes && hours >= LEAD.defrost)
        add({id:`defrost:${i.name}:${isoOf(x.date)}:${x.k}`, kind:"defrost", food:i.name, target:{dayIdx:x.dayIdx, k:x.k},
             text:say("also.defrost", {food:lower1(baseName(i)), meal:label(x), when:whenWord(x.start, nowD)})});
      const p = pantry && (pantry[key] || pantry[foodKey(baseName(i))]);
      if(LEGUMES.includes(foodKey(baseName(i))) && p && p.dried && hours >= LEAD.soak)
        add({id:`soak:${i.name}:${isoOf(x.date)}:${x.k}`, kind:"soak", food:i.name, target:{dayIdx:x.dayIdx, k:x.k},
             text:say("also.soak", {food:lower1(baseName(i)), meal:label(x), when:whenWord(x.start, nowD)})});
    });
  });
  // 2. cook ahead: the session (deriveCookAhead, passed in as seen.sessions) whose first meal is this one
  (S.sessions || []).filter(s=>!s.done && s.first.iso===isoOf(ref.date) && s.first.m.id===m.id).forEach(s=>
    add({id:s.id, kind:"cook", food:s.items[0].name, target:null, session:s, text:sessionDetail(s, nowD)}));
  // 5. family meals: from 12 months, at lunch and dinner, a few times
  if(months >= 12 && ["lunch","dinner"].includes(m.slot) && (S.salt || 0) < SALT_MAX_SHOWINGS)
    add({id:`salt:${isoOf(nowD)}`, kind:"salt", food:m.items[0] ? m.items[0].name : "", target:null, text:say("also.salt", {name})});
  return out;
}
function prepDone(){ const iso = todayISO(); return state.prepped && state.prepped.date===iso ? state.prepped.done || [] : []; }
function alsoFor(ref, max){
  const iso = todayISO();
  const items = suggestAlso(ref, ref.plan || state.plan, now(), state.profile, {}, {done:prepDone(), salt:(state.shown && state.shown.salt) || 0, isOffered:mealOffered, max, sessions:cookAhead()});
  items.forEach(s=>{ if(s.kind==="salt" && state.shown.saltDay!==iso){ state.shown = Object.assign({}, state.shown, {salt:(state.shown.salt || 0) + 1, saltDay:iso}); save(); } });
  return items;
}

/* ====================================================================
   THE CANVAS: one config constant. Swipe directions come from it, so the
   layout changes in one place. [column, row]; Home is the origin.
   ==================================================================== */
const LAYOUT = {profile:[0,-1], home:[0,0], shuffle:[1,0], kitchen:[0,1], week:[0,2]};
const SCREEN_GLOW = {shuffle:"protein", week:"fruit", profile:"grain"};   // the Kitchen's glow scrolls with its content (kitchen.js)
const EDGE = 24, HEADER_ZONE = 60, AXIS_LOCK = 10, COMMIT_SHARE = .35, COMMIT_SPEED = .5, RUBBER = .3, PARALLAX = .3, SETTLE_MS = 320, PULL_AT = 48;
/* under 6 months only Home and Profile exist */
function screensNow(){ return milkOnly() ? ["home","profile"] : Object.keys(LAYOUT); }
function screenAt(c, r){ return screensNow().find(k=>LAYOUT[k][0]===c && LAYOUT[k][1]===r) || null; }
/* the screen on one side of another: "right" is where a left swipe goes, "up" where a pull down goes */
function neighbour(name, side){
  const [c, r] = LAYOUT[name];
  return side==="right" ? screenAt(c + 1, r) : side==="left" ? screenAt(c - 1, r) : side==="up" ? screenAt(c, r - 1) : screenAt(c, r + 1);
}
const pg = {cur:"home", x:0, y:0, drag:null, anim:null, opts:{}, justDragged:false};
const screenEl = name=>$("scr-" + name);
const cameraEl = $("camera"), pagerEl = $("pager");
function size(){ return {W:pagerEl.clientWidth || innerWidth, H:pagerEl.clientHeight || innerHeight}; }
const camT = (x, y, k)=>{ const {W, H} = size(); return `translate3d(${(-x * W * k).toFixed(2)}px, ${(-y * H * k).toFixed(2)}px, 0)`; };
/* the glow of each screen, by how close the camera is to it (crossfading as it pans) */
function glowShares(x, y){
  const out = {};
  Object.keys(LAYOUT).forEach(k=>{ const d = Math.max(Math.abs(x - LAYOUT[k][0]), Math.abs(y - LAYOUT[k][1])); out[k] = Math.max(0, Math.min(1, 1 - d)); });
  return out;
}
function backdropParts(){ return [$("glowPlane"), $("bgSky")]; }
function applyCamera(x, y){
  cameraEl.style.transform = camT(x, y, 1);
  const k = calm() ? 0 : PARALLAX;
  backdropParts().forEach(p=>{ p.style.transform = camT(x, y, k); });
  const g = glowShares(x, y);
  document.querySelectorAll(".glow-s").forEach(l=>{ l.style.opacity = String(g[l.dataset.screen]); });
}
/* the camera eases to where it's going; with reduced motion, a 150ms crossfade instead of a slide */
function settle(toX, toY, done){
  const from = {x:pg.x, y:pg.y};
  pg.x = toX; pg.y = toY;
  if(pg.anim) pg.anim.forEach(a=>a.cancel());
  pg.anim = null;
  applyCamera(toX, toY);
  if(calm() || (from.x===toX && from.y===toY)){
    if(from.x!==toX || from.y!==toY) screenEl(pg.cur).animate([{opacity:0}, {opacity:1}], {duration:150, easing:"linear"});
    done && done(); return;
  }
  const o = {duration:SETTLE_MS, easing:"cubic-bezier(.2,.9,.25,1)"};
  const anims = [cameraEl.animate([{transform:camT(from.x, from.y, 1)}, {transform:camT(toX, toY, 1)}], o)];
  backdropParts().forEach(p=>anims.push(p.animate([{transform:camT(from.x, from.y, PARALLAX)}, {transform:camT(toX, toY, PARALLAX)}], o)));
  const g0 = glowShares(from.x, from.y), g1 = glowShares(toX, toY);
  document.querySelectorAll(".glow-s").forEach(l=>{ const s = l.dataset.screen; if(g0[s]!==g1[s]) anims.push(l.animate([{opacity:g0[s]}, {opacity:g1[s]}], o)); });
  pg.anim = anims;
  anims[0].onfinish = ()=>{ if(pg.anim===anims) pg.anim = null; done && done(); };
}
/* screens sit on the grid; only the current one and its neighbours are rendered, the rest are emptied */
function placeScreens(){
  Object.keys(LAYOUT).forEach(k=>{ const e = screenEl(k); e.style.transform = `translate(${LAYOUT[k][0] * 100}%, ${LAYOUT[k][1] * 100}%)`; });
}
const mounted = new Set(["home"]);
function wanted(){ const out = new Set([pg.cur]); ["left","right","up","down"].forEach(s=>{ const n = neighbour(pg.cur, s); if(n) out.add(n); }); return out; }
function mountAround(){
  const want = wanted();
  want.forEach(k=>{ if(!mounted.has(k)){ mounted.add(k); renderScreen(k); } });
  return want;
}
/* only the current screen is live: the others are inert and hidden from screen readers */
function markCurrent(keep){
  const want = wanted();
  Object.keys(LAYOUT).forEach(k=>{
    const e = screenEl(k), on = k===pg.cur;
    e.inert = !on;
    if(on) e.removeAttribute("aria-hidden"); else e.setAttribute("aria-hidden", "true");
    e.classList.toggle("is-off", !want.has(k) && k!==keep);
  });
}
/* after a move: the screens that are no longer neighbours are emptied */
function unmountFar(){
  markCurrent();
  const want = wanted();
  Object.keys(LAYOUT).forEach(k=>{ if(k!=="home" && !want.has(k) && mounted.has(k)){ mounted.delete(k); screenEl(k).innerHTML = ""; } });
}
function renderScreen(k){ if(k==="home") renderHome(); else SCREENS[k](); }
/* re-render what's on the canvas after a change (keeping scroll and focus) */
function changed(){
  layoutSig = "";
  renderHome();
  // the screens that exist can change (a birthday under 6 months leaves only Home and Profile)
  if(!screensNow().includes(pg.cur)){ go("home", {quiet:true}); return; }
  if(!pg.anim){ mountAround(); unmountFar(); }
  mounted.forEach(k=>{ if(k!=="home") refresh(k); });
}
function refresh(k){
  if(!mounted.has(k) || k==="home") return;
  const e = screenEl(k), body = e.querySelector(".scr-body"), top = body ? body.scrollTop : 0, f = focusMemo();
  SCREENS[k]();
  const nb = e.querySelector(".scr-body");
  if(nb) nb.scrollTop = top;
  focusRestore(f);
}
/* ---------- going somewhere ---------- */
function go(name, opts){
  opts = opts || {};
  if(!screensNow().includes(name)) name = "home";
  const from = pg.cur;
  pg.opts = opts;
  if(from==="kitchen" && name!=="kitchen" && kitchenUI.store) setStoreMode(false);   // leaving the store lets the screen sleep
  if(name===from){ arrived(name, opts, false); settle(LAYOUT[name][0], LAYOUT[name][1]); return; }
  if(name==="shuffle" && name!==from){ shuffleUI.target = opts.mealId ? {iso:isoOf(opts.date || now()), mealId:opts.mealId} : null; shuffleUI.changing = null; shuffleUI.note = null; }
  pg.cur = name;
  mountAround();
  if(mounted.has(name) && name!=="home") refresh(name);
  route(from, name, opts.fromHistory);
  markCurrent(from);
  navClose(false);
  settle(LAYOUT[name][0], LAYOUT[name][1], ()=>{ unmountFar(); arrived(name, opts, true); });
  if(!opts.quiet) haptic();
}
/* the screen has arrived: its heading takes focus, its hint is seen, its content fades in */
function arrived(name, opts, moved){
  if(name!=="home" && !state.hints[name]){ state.hints[name] = todayISO(); save(); if(momentKey && /^hint:/.test(momentKey)) renderHome(); }
  if(name==="kitchen" && state.newToBuy.length){ state.newToBuy = []; save(); layoutSig = ""; renderHome(); }
  const e = screenEl(name);
  if(name==="profile" && opts.section){
    const fold = PF_FOLD[opts.section];
    if(fold && !pfUI.open[fold]){ pfUI.open[fold] = true; renderProfile(); }
    const t = e.querySelector(`[data-sec="${CSS.escape(opts.section)}"]`);
    if(t){ t.scrollIntoView({block:"start", behavior:"auto"}); t.focus({preventScroll:true}); }
  }else if(moved && !opts.keepFocus){
    const h = e.querySelector("h1");
    if(h) h.focus({preventScroll:true});
  }
  if(moved && !calm()){
    const body = e.querySelector(".scr-body") || e.querySelector(".home-in");
    if(body){ [...body.children].slice(0, 8).forEach((c, k)=>{ c.style.animationDelay = (k * 40) + "ms"; }); body.classList.add("arrive"); setTimeout(()=>body.classList.remove("arrive"), 700); }
  }
}
/* ---------- routes: #home, #shuffle, #kitchen, #week, #profile. Leaving Home pushes one history entry;
   moving between the others replaces it, so Back always comes home ---------- */
function screenFromHash(){ const h = location.hash.replace(/^#/, ""); return LAYOUT[h] ? h : "home"; }
function route(from, to, fromHistory){
  if(fromHistory) return;
  if(to==="home"){ if(history.state && history.state.chicho) history.back(); else history.replaceState(null, "", "#home"); }
  else if(from==="home") history.pushState({chicho:1}, "", "#" + to);
  else history.replaceState({chicho:1}, "", "#" + to);
}
addEventListener("popstate", ()=>{ if(SNAPSHOT) return; const to = screenFromHash(); if(to!==pg.cur) go(to, {fromHistory:true}); });
/* ---------- the position map: five dots laid out like the canvas; each is a real link ---------- */
/* the screens, from the name: a short list under it (a disclosure: the name's aria-expanded, a nav of links, the
   current one aria-current). Picking one goes there; the dimmed screen, Esc or the name again closes it, and focus
   goes back to the name. Up and Down move through the links, Home and End to the ends. */
const NAV_ORDER = ["home", "profile", "shuffle", "kitchen", "week"];
function navIsOpen(){ return !$("navList").hidden; }
function navOpen(fromKeys){
  const list = $("navList"), btn = $("profileBtn"), avail = screensNow();
  list.innerHTML = "";
  NAV_ORDER.filter(k=>avail.includes(k)).forEach(k=>{
    const a = document.createElement("a");
    a.href = "#" + k; a.dataset.f = "nav:" + k; a.textContent = say("screens." + k);
    if(k===pg.cur) a.setAttribute("aria-current", "page");
    a.addEventListener("click", e=>{ e.preventDefault(); navClose(false); go(k, {keepFocus:false}); });
    list.appendChild(a);
  });
  const r = btn.getBoundingClientRect(), app = $("app").getBoundingClientRect();
  list.style.left = Math.round(r.left - app.left - 12) + "px";   // the words line up with the name
  list.style.top = Math.round(r.bottom - app.top + 6) + "px";
  list.hidden = false; $("navScrim").hidden = false;
  btn.setAttribute("aria-expanded", "true");
  if(!calm()){
    list.animate([{opacity:0, transform:"translateY(-6px)"}, {opacity:1, transform:"none"}], {duration:160, easing:"cubic-bezier(.2,.8,.2,1)"});
    $("navScrim").animate([{opacity:0}, {opacity:1}], {duration:160});
  }
  // from the keys, focus goes into the list; a tap leaves it on the name (Down still goes in)
  if(fromKeys) (list.querySelector('[aria-current="page"]') || list.firstChild).focus();
}
function navClose(refocus){
  if(!navIsOpen()) return;
  $("navList").hidden = true; $("navScrim").hidden = true;
  const inside = $("navList").contains(document.activeElement);
  $("profileBtn").setAttribute("aria-expanded", "false");
  if(refocus!==false && inside) $("profileBtn").focus({preventScroll:true});
}
function navKeys(e){
  const links = [...$("navList").querySelectorAll("a")], i = links.indexOf(document.activeElement);
  let to = null;
  if(e.key==="Escape") { e.preventDefault(); navClose(); return; }
  if(e.key==="ArrowDown") to = links[(i + 1) % links.length];
  else if(e.key==="ArrowUp") to = links[(i - 1 + links.length) % links.length];
  else if(e.key==="Home") to = links[0];
  else if(e.key==="End") to = links[links.length - 1];
  if(e.key==="Tab"){ navClose(false); return; }
  if(to){ e.preventDefault(); to.focus(); }
  if(e.key.startsWith("Arrow")) e.preventDefault();   // the arrows are the list's while it's open, not the canvas's
}

/* ---------- gestures: one pager. The finger drives the camera 1:1; the axis locks after 10px; it commits past
   35% of the screen or above 0.5 px/ms, otherwise it springs back; past the canvas it rubber-bands at 0.3x.
   Starts within 24px of either side are left to the browser (Safari's back swipe). ---------- */
function dragTarget(axis, d){ return neighbour(pg.cur, axis==="x" ? (d < 0 ? "right" : "left") : (d < 0 ? "down" : "up")); }
function dragTo(axis, d){
  const {W, H} = size(), [cx, cy] = LAYOUT[pg.cur];
  let off = axis==="x" ? -d / W : -d / H;
  if(!dragTarget(axis, d)) off *= RUBBER;
  applyCamera(axis==="x" ? cx + off : cx, axis==="y" ? cy + off : cy);
}
function dragEnd(axis, d, v){
  const {W, H} = size(), span = axis==="x" ? W : H, to = dragTarget(axis, d);
  const commit = to && (Math.abs(d) > span * COMMIT_SHARE || (Math.abs(v) > COMMIT_SPEED && Math.sign(v)===Math.sign(d)));
  // the camera is mid-drag: let settle() start from there
  const [cx, cy] = LAYOUT[pg.cur];
  let off = axis==="x" ? -d / W : -d / H;
  if(!to) off *= RUBBER;
  pg.x = axis==="x" ? cx + off : cx; pg.y = axis==="y" ? cy + off : cy;
  if(commit) go(to);
  else settle(cx, cy);
}
function velocity(samples){
  const last = samples[samples.length - 1], first = samples.find(s=>last.t - s.t <= 100) || samples[0];
  return last.t > first.t ? (last.d - first.d) / (last.t - first.t) : 0;
}
function onboardingOpen(){ const o = $("onboarding"); return o && !o.hidden; }
pagerEl.addEventListener("pointerdown", e=>{
  if(e.button > 0 || pg.anim || onboardingOpen()) return;
  if(e.clientX < EDGE || e.clientX > innerWidth - EDGE) return;
  const scr = screenEl(pg.cur), scrollable = pg.cur!=="home", kh = scr.querySelector(".k-head");
  // the header zone: the app's header, then the Kitchen's whole pinned header (its view switch included) or the
  // screen's title row (HEADER_ZONE px)
  const inHeader = scrollable && (kh ? e.clientY < kh.getBoundingClientRect().bottom : e.clientY < $("chrome").getBoundingClientRect().bottom + HEADER_ZONE);
  const inField = e.target.closest("input, textarea, select");
  pg.drag = {id:e.pointerId, x0:e.clientX, y0:e.clientY, axis:null, d:0, scrollable, inHeader, inField, samples:[]};
});
pagerEl.addEventListener("pointermove", e=>{
  const g = pg.drag;
  if(!g || e.pointerId!==g.id) return;
  const dx = e.clientX - g.x0, dy = e.clientY - g.y0;
  if(!g.axis){
    if(Math.hypot(dx, dy) < AXIS_LOCK) return;
    g.axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
    // on a scrolling screen, a vertical drag outside the header zone is the page's own scroll
    if(g.axis==="y" && g.scrollable && !g.inHeader){ pg.drag = null; return; }
    // inside the meal block when it scrolls: the block's
    if(g.axis==="y" && e.target.closest && e.target.closest(".now-meal.scrolls")){ pg.drag = null; return; }
    if(g.inField && g.axis==="x"){ pg.drag = null; return; }   // selecting text in a field
    g.views = g.axis==="x" && pg.cur==="kitchen";   // sideways on the Kitchen switches its views, not screens
    try{ pagerEl.setPointerCapture(g.id); }catch(_){}
  }
  g.d = g.axis==="x" ? dx : dy;
  g.samples.push({t:e.timeStamp || performance.now(), d:g.d});
  if(g.samples.length > 12) g.samples.shift();
  if(g.views) kitchenDrag(g.d); else dragTo(g.axis, g.d);
  if(e.cancelable) e.preventDefault();
});
function pointerUp(e){
  const g = pg.drag;
  if(!g || e.pointerId!==g.id) return;
  pg.drag = null;
  if(!g.axis) return;
  pg.justDragged = true; setTimeout(()=>{ pg.justDragged = false; }, 0);
  if(g.views){ kitchenDragEnd(e.type==="pointercancel" ? 0 : g.d, e.type==="pointercancel" || !g.samples.length ? 0 : velocity(g.samples)); return; }
  if(e.type==="pointercancel"){ dragEnd(g.axis, 0, 0); return; }
  dragEnd(g.axis, g.d, g.samples.length ? velocity(g.samples) : 0);
}
pagerEl.addEventListener("pointerup", pointerUp);
pagerEl.addEventListener("pointercancel", pointerUp);
/* a finished drag isn't also a tap */
pagerEl.addEventListener("click", e=>{ if(pg.justDragged){ e.stopPropagation(); e.preventDefault(); pg.justDragged = false; } }, true);
/* Scrolling screens: pulling past the top (or bottom) edge by 48px starts going to the screen above (or below).
   Touch events, because a native vertical scroll cancels pointer events. */
function watchPull(body){
  let p = null;
  body.addEventListener("touchstart", e=>{
    if(e.touches.length!==1 || pg.anim) return;
    const t = e.touches[0];
    if(t.clientX < EDGE || t.clientX > innerWidth - EDGE) return;
    p = {x0:t.clientX, y0:t.clientY, top:body.scrollTop <= 0, bottom:body.scrollTop + body.clientHeight >= body.scrollHeight - 1, active:false, d:0, samples:[]};
  }, {passive:true});
  body.addEventListener("touchmove", e=>{
    if(!p) return;
    const t = e.touches[0], dx = t.clientX - p.x0, dy = t.clientY - p.y0;
    if(!p.active){
      if(Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > AXIS_LOCK){ p = null; return; }
      const atEdge = (dy > 0 && p.top) || (dy < 0 && p.bottom);
      if(!atEdge){ if(Math.abs(dy) > AXIS_LOCK) p = null; return; }
      if(e.cancelable) e.preventDefault();   // hold the page still through the resistance
      if(Math.abs(dy) < PULL_AT) return;
      p.active = true;
    }
    if(e.cancelable) e.preventDefault();
    p.d = dy - Math.sign(dy) * PULL_AT;
    p.samples.push({t:e.timeStamp || performance.now(), d:p.d});
    if(p.samples.length > 12) p.samples.shift();
    dragTo("y", p.d);
  }, {passive:false});
  const end = ()=>{ if(!p) return; const q = p; p = null; if(q.active) dragEnd("y", q.d, q.samples.length ? velocity(q.samples) : 0); };
  body.addEventListener("touchend", end); body.addEventListener("touchcancel", end);
}
/* keys: arrows move through the canvas (not while typing); Home or Esc comes home */
document.addEventListener("keydown", e=>{
  if(SNAPSHOT || onboardingOpen() || e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
  const t = e.target, typing = t && (t.matches("input, textarea, select") || t.isContentEditable);
  if(typing) return;
  const side = {ArrowLeft:"left", ArrowRight:"right", ArrowUp:"up", ArrowDown:"down"}[e.key];
  if(side && pg.cur==="kitchen" && (side==="left" || side==="right")){ e.preventDefault(); const v = kitchenNext(side==="right" ? -1 : 1); if(v) switchView(v); return; }
  if(side){ const n = neighbour(pg.cur, side); e.preventDefault(); if(n) go(n, {quiet:true}); return; }
  if((e.key==="Escape" || e.key==="Home") && pg.cur!=="home"){ e.preventDefault(); go("home", {quiet:true}); }
});
addEventListener("resize", ()=>{ if(SNAPSHOT) return; paintScreenGlows(); if(!pg.drag && !pg.anim) applyCamera(pg.x, pg.y); fitHome(); });

/* ---------- a screen's frame: pinned header (title, tools; the app's header is above it), native scroll, an optional pinned pill ---------- */
function frame(name, title, opts){
  const o = opts || {}, e = screenEl(name);
  e.innerHTML = "";
  const head = el("header", "scr-head"), hc = el("div", "scr-col");
  const tools = el("div", "scr-tools");
  (o.tools || []).forEach(t=>tools.appendChild(t));
  hc.appendChild(tools);
  const h = el("h1", o.titleClass || "scr-title", title);
  h.tabIndex = -1; h.id = "t-" + name;
  hc.appendChild(h);
  if(o.sub) hc.appendChild(el("p", "scr-sub", o.sub));
  head.appendChild(hc);
  const body = el("div", "scr-body"), col = el("div", "scr-col");
  body.appendChild(col);
  e.append(head, body);
  e.setAttribute("aria-labelledby", h.id);
  // the bottom edge belongs to the pinned pill (if any) and the map: content never scrolls under them
  if(o.pin){ const pin = el("div", "scr-pin"), pc = el("div", "scr-col"); pc.appendChild(o.pin); pin.appendChild(pc); e.appendChild(pin); }
  else e.appendChild(el("div", "scr-foot"));
  watchPull(body);
  return col;
}
function section(parent, key, title){
  const s = el("section", "sec");
  if(key){ s.dataset.sec = key; s.tabIndex = -1; }
  if(title){ const h = el("h2", "sec-h", title); s.appendChild(h); }
  parent.appendChild(s);
  return s;
}
const RING = `<i aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M6 12.5l4 4 8-9"/></svg></i>`;
function ring(on, label, fn, f){
  const b = document.createElement("button");
  b.type = "button"; b.className = "ring-btn"; if(f) b.dataset.f = f;
  b.setAttribute("aria-pressed", String(!!on)); b.setAttribute("aria-label", label);
  b.innerHTML = RING;
  b.addEventListener("click", fn);
  return b;
}

/* ====================================================================
   HOME: offer. Light, contextual, never scrolls. The corner header, the
   headline and moment line, the meal now (or next), the pill, one footer
   line, and the map in the corner. Everything else lives one swipe away.
   ==================================================================== */
let homeKey = null, momentKey = null, picked = null, firstDraw = true, layoutSig = "";
const undoUntil = {};    // meal key → ms when its "Offered. Undo" window ends
const homeUI = {allFoods:false, howOpen:false, key:null};
function refsOn(date){ return mealsOn(date).map(x=>Object.assign(x, {key:isoOf(date) + "|" + x.m.id})); }
/* the meal that's shown by default: the now meal, otherwise the next */
function defaultOpen(today, tm){
  const n = today.find(x=>x.status==="now");
  if(n) return n;
  const nx = nextMeal();
  if(!nx) return null;
  return (nx.when==="today" ? today : tm).find(x=>x.k===nx.k) || null;
}
/* a choice stands until the next meal boundary (an anchor, or the end of a now window) */
function nextBoundary(today){
  const t = now(), edges = today.flatMap(x=>[x.start, new Date(x.start.getTime() + NOW_WINDOW_MIN*60000)]).filter(d=>d > t).sort((a, b)=>a - b);
  return edges[0] || tomorrowOf(t);
}
function homeChanged(){ changed(); }
function homeRef(){
  const t = now(), today = milkOnly() ? [] : refsOn(t), tm = milkOnly() ? [] : refsOn(tomorrowOf(t));
  if(picked && t >= picked.until) picked = null;
  const all = today.concat(tm);
  if(picked && !all.some(x=>x.key===picked.key)) picked = null;
  return {ref:picked ? all.find(x=>x.key===picked.key) : defaultOpen(today, tm), today, tm, all};
}
function renderHome(){
  if(!$("home") || SNAPSHOT) return;
  const P = state.profile, st = stageNow(), t = now();
  if(P.lastStage===null || P.lastStage===undefined){ P.lastStage = st.id; save(); }
  lastISO = todayISO();
  renderChrome(P, t);
  const calmState = milkOnly(), empty = !calmState && !hasPlan();
  $("home").classList.toggle("is-milk", calmState);
  $("home").classList.toggle("is-empty", empty);
  const {ref, today} = homeRef();
  // while an offered meal stays on Home (until the next boundary), the headline stays with it
  if(!(picked && ref && picked.key===ref.key && homeKey!==null)) renderHeadline();
  renderMomentLine();
  renderNowMeal(ref, today);
  if(calmState || empty) setGlow(null);
  document.documentElement.classList.toggle("glow-dim", t.getHours()*60 + t.getMinutes() >= QUIET_FROM_MIN);
  updateChrome();
  if(firstDraw){ firstDraw = false; try{ performance.mark("chicho:home"); }catch(e){} }   // the first meaningful paint (tools/devices.mjs)
}
/* the header, on every screen: the age over the name (which opens the screens), the date over the time */
function renderChrome(P, t){
  setText($("whoAge"), P.birthDate ? ageLabel(ageNow()) : "");
  renderWhoName(P);
  $("profileBtn").setAttribute("aria-label", [P.name, P.birthDate ? ageLabel(ageNow()) : ""].filter(Boolean).join(", ") + (P.name ? ". " : "") + say("nav.title"));
  setText($("clockDate"), fmtCornerDate(t));
  setText($("clock"), fmtTime(t));
  $("clock").setAttribute("datetime", t.toISOString());
}
/* the corner's name: the drawn one when there is ink (read aloud by its spelling), else the typed one */
let whoSig = null;
function renderWhoName(P){
  const svg = inkSVG(P.ink), sig = (P.name || "") + "|" + svg.length + "|" + (P.ink ? P.ink.strokes.length : 0), e = $("whoName");
  if(sig===whoSig) return;
  whoSig = sig;
  e.classList.toggle("has-ink", !!svg);
  if(svg) e.innerHTML = svg + `<span class="sr-only">${esc(P.name || say("screens.profile"))}</span>`;
  else e.textContent = P.name || say("screens.profile");
}
function renderHeadline(){
  const h = headlineNow(), e = $("headline");
  const changedNow = homeKey!==null && homeKey!==h.key;
  if(changedNow && !calm()){
    e.animate([{opacity:1}, {opacity:0}], {duration:140, fill:"forwards"}).onfinish = function(){ setText(e, h.headline); this.cancel(); e.animate([{opacity:0, transform:"translateY(6px)"}, {opacity:1, transform:"none"}], {duration:280, easing:"cubic-bezier(.2,.8,.2,1)"}); };
  }else setText(e, h.headline);
  if(changedNow && h.announce) announce(h.announce);
  homeKey = h.key;
  currentTitle = h.title;
}
function renderMomentLine(){
  const m = momentLine(), e = $("moment");
  const sig = m.key + "|" + m.text + "|" + m.actions.map(a=>a[0]).join("|");
  if(sig===momentKey) return;
  momentKey = sig;
  e.innerHTML = "";
  e.classList.toggle("calm-tone", m.tone==="calm");
  if(m.text) e.append(m.text);
  m.actions.slice(0, 1).forEach(([label, fn])=>{ if(m.text) e.append(" "); const b = textBtn(label, fn, "inline"); b.dataset.f = "moment:go"; e.appendChild(b); });
  // a second action (Later) is a quieter word after the first
  m.actions.slice(1, 2).forEach(([label, fn])=>{ e.append(" "); const b = textBtn(label, fn, "inline quiet"); b.dataset.f = "moment:later"; e.appendChild(b); });
}
/* the meal now (or next): the headline is its title; its foods as plain lines, one line each; the how; one
   "While you're at it" line. A small title shows only when the meal isn't the headline's (an offered meal
   that stays until the next boundary while the headline moves on) */
const FOOD_LINES_MAX = 4;
function renderNowMeal(ref, today){
  const box = $("nowMeal"), zone = $("offerZone"), foot = $("footLine");
  const sig = !ref ? "none" : [ref.key, ref.status, ref.time, ref.m.items.map(i=>i.id).join(","), mealOffered(ref.m, ref.date), mealOutcome(ref.m, ref.date),
               undoUntil[ref.key] > Date.now(), answering, homeUI.allFoods, homeUI.howOpen, prepDone().length, state.cookAhead.done.length, offersVersion].join("|");
  if(sig===layoutSig) return;
  const focus = focusMemo();
  layoutSig = sig;
  box.innerHTML = ""; zone.innerHTML = "";
  if(!ref){ foot.hidden = true; setGlow(null); return; }
  if(homeUI.key!==ref.key){ homeUI.key = ref.key; homeUI.allFoods = false; homeUI.howOpen = false; }
  const m = ref.m, tomorrow = isoOf(ref.date)!==todayISO();
  const head = picked && picked.key===ref.key ? ref : headlineNow().next;
  if(!head || head.m!==m || isoOf(head.start)!==isoOf(ref.start)){
    const h = el("h2", "meal-title", say(tomorrow ? "home.mealTitleTomorrow" : "home.mealTitle", {meal:m.label, time:fmtTime(ref.start)}));
    h.tabIndex = -1; h.dataset.f = "meal:title";
    box.appendChild(h);
  }
  box.setAttribute("aria-label", say(tomorrow ? "home.mealTitleTomorrow" : "home.mealTitle", {meal:m.label, time:fmtTime(ref.start)}));
  const ul = el("ul", "meal-foods");
  const shown = homeUI.allFoods || m.items.length <= FOOD_LINES_MAX ? m.items : m.items.slice(0, FOOD_LINES_MAX - 1);
  shown.forEach(i=>{ const li = el("li", "", isPrepped(i, isoOf(ref.date), m.id) ? say("kitchen.prepped", {food:baseName(i)}) : foodLine(i)); li.dataset.item = i.id; ul.appendChild(li); });
  if(shown.length < m.items.length){
    const li = el("li");
    const more = textBtn(say("home.andMore", {n:m.items.length - shown.length}), ()=>{ homeUI.allFoods = true; layoutSig = ""; renderHome(); focusLater("meal:more"); }, "inline more-btn");
    more.dataset.f = "meal:more";
    li.appendChild(more); ul.appendChild(li);
  }
  box.appendChild(ul);
  oneLine(ul, m);
  const how = mealHow(m);
  if(how.length){
    const p = el("p", "meal-how"), span = el("span", homeUI.howOpen ? "" : "clamp", how.join(" "));
    p.appendChild(span);
    box.appendChild(p);
    if(!homeUI.howOpen) requestAnimationFrame(()=>{
      if(span.scrollHeight > span.clientHeight + 1 && !p.querySelector(".btn-text")){
        const b = textBtn(say("home.more"), ()=>{ homeUI.howOpen = true; layoutSig = ""; renderHome(); }, "inline");
        b.dataset.f = "meal:howmore";
        p.append(" "); p.appendChild(b);
        fitHome();
      }
    });
  }
  // a first allergen in this meal (only this meal's): calm, with what to watch for
  const firsts = firstAllergensIn(ref);
  if(firsts.length){
    const p = el("p", "meal-first", say("moment.allergen", {allergen:firsts[0].label, name:state.profile.name || ""}));
    const b = textBtn(say("moment.allergenAction"), ()=>go("profile", {section:"offplate"}), "inline"); b.dataset.f = "meal:watch";
    p.append(" "); p.appendChild(b);
    box.appendChild(p);
  }
  const also = !mealOffered(m, ref.date) ? alsoFor(ref, 1)[0] : null;
  if(also){
    const p = el("p", "meal-also"); p.innerHTML = `<b>${esc(say("home.also"))}:</b> ${esc(also.text)}`;
    // cooking ahead is the Kitchen's Prep too: done here is done there (and the later meals say "prepped")
    if(also.kind==="cook"){ const b = textBtn(say("also.done"), ()=>{ markCooked(also.session); save(); haptic(); changed(); }, "inline"); b.dataset.f = "also:done"; p.append(" "); p.appendChild(b); }
    box.appendChild(p);
  }
  renderOfferZone(ref, zone);
  // the footer line: the meal after this one
  const after = homeAfter(ref, today);
  delete foot.dataset.undo;
  if(undoUntil[ref.key] > Date.now() && mealOffered(m, ref.date) && answering!==ref.key){
    // just offered: "Offered. Undo" for 5 s, where the footer is (nothing moves)
    foot.textContent = say("meal.offeredUndo") + " ";
    const u = textBtn(say("meal.undo"), ()=>undoOffer(ref), "inline"); u.dataset.f = "undo";
    foot.appendChild(u); foot.dataset.undo = "1"; foot.hidden = false;
  }else{
    foot.textContent = after ? say(isoOf(after.date)===todayISO() ? "home.next" : "home.nextTomorrow", {meal:after.m.label, time:fmtTime(after.start)}) : "";
    foot.hidden = !after;
  }
  setGlow(m.items[0] ? m.items[0].cats[0] : null);
  focusRestore(focus);
  fitHome();
}
/* each part of the dish is one line: when "Name · qty · texture" doesn't fit, the texture goes, then the amount */
function oneLine(ul, m){
  [...ul.querySelectorAll("li[data-item]")].forEach(li=>{
    const i = m.items.find(x=>x.id===li.dataset.item);
    if(!i || li.scrollWidth <= li.clientWidth + 1 || li.textContent===say("kitchen.prepped", {food:baseName(i)})) return;
    li.textContent = [baseName(i), i.qty].filter(Boolean).join(" · ");
    if(li.scrollWidth > li.clientWidth + 1) li.textContent = baseName(i);
    li.title = foodLine(i);
  });
}
function homeAfter(ref, today){
  const tm = refsOn(tomorrowOf(now()));
  const list = today.concat(tm).filter(x=>x.start > ref.start && x.key!==ref.key);
  return list[0] || null;
}
/* "Mark as offered" becomes how it went, in its place: Loved it · Ate some · Not today (optional and equal), with
   "Offered. Undo" in the footer for 5 s. An answer is kept, shows as chosen for a moment, then the meal fades and
   Home moves on to the next one. Unanswered, the three stay with the meal until its window ends. */
const ANSWER_HOLD_MS = 800, ANSWER_FADE_MS = 300;
let answering = null;   // the meal key whose answer is showing before Home moves on
function renderOfferZone(ref, zone){
  const m = ref.m, on = mealOffered(m, ref.date);
  if(on && (!mealOutcome(m, ref.date) || answering===ref.key)){ zone.appendChild(outcomeRow(ref)); return; }
  const bar = el("div", "offer-bar");
  const pill = document.createElement("button");
  pill.type = "button"; pill.className = "offer-pill"; pill.dataset.f = "offer";
  pill.setAttribute("aria-pressed", String(on));
  pill.textContent = on ? say("meal.offered") : say("meal.offer");
  pill.addEventListener("click", ()=>toggleOffered(ref));
  bar.appendChild(pill);
  zone.appendChild(bar);
}
function toggleOffered(ref){
  const on = !mealOffered(ref.m, ref.date);
  const byKeys = !!document.activeElement && document.activeElement.matches(":focus-visible");   // a tap shouldn't leave a ring
  // offered, the meal stays on Home (its three answers, Undo in the footer) until the next boundary
  if(on) picked = {key:ref.key, until:nextBoundary(refsOn(now()))};
  offerMeal(ref.m, ref.date, on); save(); haptic();
  if(on){
    pulseGlow(); undoUntil[ref.key] = Date.now() + 5000;
    setTimeout(()=>{ layoutSig = ""; renderHome(); }, 5050);
    announce(say("home.announce.offered", {meal:ref.m.label}));
  }else{ delete undoUntil[ref.key]; picked = null; announce(say("home.announce.unoffered", {meal:ref.m.label})); }
  changed();
  if(on && byKeys) focusLater(`out:${ref.key}:loved`);
}
function undoOffer(ref){
  delete undoUntil[ref.key];
  offerMeal(ref.m, ref.date, false); save();
  announce(say("home.announce.unoffered", {meal:ref.m.label}));
  picked = null; changed(); focusLater("offer");
}
/* an answer: kept at once, shown as chosen, then the meal fades and Home moves on */
function answerOffered(ref, v){
  if(answering) return;
  answering = ref.key;
  delete undoUntil[ref.key];
  setOutcome(ref.m, ref.date, v); save(); haptic();
  announce(say("home.announce.outcome", {meal:ref.m.label, outcome:say("meal.outcome." + v)}));
  changed();
  const moveOn = ()=>{
    answering = null;
    if(picked && picked.key===ref.key) picked = null;
    changed();
    if(!calm()) [$("nowMeal"), $("moment"), $("offerZone")].forEach(e=>e.animate([{opacity:0}, {opacity:1}], {duration:240, easing:"ease-out"}));
  };
  if(calm()){ setTimeout(moveOn, ANSWER_HOLD_MS); return; }
  setTimeout(()=>{
    const parts = [$("nowMeal"), $("moment"), $("offerZone")];
    const fades = parts.map(e=>e.animate([{opacity:1}, {opacity:0}], {duration:ANSWER_FADE_MS, easing:"ease-in", fill:"forwards"}));
    fades[0].onfinish = ()=>{ fades.forEach(a=>a.cancel()); moveOn(); };
  }, ANSWER_HOLD_MS);
}
/* the three answers: they rise once, a beat apart, where the pill was */
const outcomeRisen = new Set();
function outcomeRow(ref){
  const m = ref.m, g = el("div", "outcomes");
  g.dataset.key = ref.key; g.setAttribute("role", "group"); g.setAttribute("aria-label", say("meal.outcomeLabel"));
  const cur = mealOutcome(m, ref.date);
  OUTCOMES.forEach(v=>{
    const ob = document.createElement("button");
    ob.type = "button"; ob.className = "outcome"; ob.dataset.f = `out:${ref.key}:${v}`;
    ob.setAttribute("aria-pressed", String(cur===v));
    ob.textContent = say("meal.outcome." + v);
    ob.addEventListener("click", ()=>answerOffered(ref, v));
    g.appendChild(ob);
  });
  if(!outcomeRisen.has(ref.key)){ outcomeRisen.add(ref.key); if(!calm()) requestAnimationFrame(()=>[...g.children].forEach((b, k)=>b.animate([{opacity:0, transform:"translateY(10px)"}, {opacity:1, transform:"none"}], {duration:320, delay:k * 60, easing:"cubic-bezier(.2,.8,.2,1)", fill:"backwards"}))); }
  return g;
}
/* it must never scroll the page: when the meal doesn't fit, the footer line goes first; anything still
   over scrolls inside the meal block (never cropped) */
function fitHome(){
  const box = $("nowMeal"), foot = $("footLine");
  if(!box || !box.firstChild || pg.cur!=="home" && !mounted.has("home")) return;
  box.classList.remove("scrolls");
  if(foot.textContent) foot.hidden = false;
  if(box.scrollHeight > box.clientHeight + 1 && foot.textContent && !foot.dataset.undo) foot.hidden = true;
  if(box.scrollHeight > box.clientHeight + 1) box.classList.add("scrolls");
  // the glow sits behind the headline
  const hl = $("headline"), r = hl.getBoundingClientRect(), s = screenEl("home").getBoundingClientRect();
  if(r.height){ const y = Math.round(r.top - s.top + r.height / 2) + "px"; if($("glowPulse").style.getPropertyValue("--glow-y")!==y){ $("glowPulse").style.setProperty("--glow-y", y); paintScreenGlows(); } }
}
/* ---------- the glow: Home's follows the meal's food group; each other screen has its own ---------- */
let glowKey = null;
function setGlow(cat){
  const group = glowGroup(cat);
  if(group===glowKey) return;
  const layers = [...document.querySelectorAll('.glow-s[data-screen="home"] .glow-l')];
  if(!layers.length) return;
  const on = layers.find(l=>l.classList.contains("is-on")) || layers[0], off = layers.find(l=>l!==on);
  if(glowKey===null) on.style.backgroundImage = glowGradient(GLOW[group].hex);
  else { off.style.backgroundImage = glowGradient(GLOW[group].hex); off.classList.add("is-on"); on.classList.remove("is-on"); }
  glowKey = group;
  document.documentElement.dataset.glow = group;
}
/* each screen's glow sits where the parallax plane is when that screen is in view, so it's centred there:
   Home's behind the headline, the others' behind their pinned header (ink), never behind muted text */
const SCREEN_GLOW_Y = 24;
function paintScreenGlows(){
  const {W, H} = size(), gy = parseFloat($("glowPulse").style.getPropertyValue("--glow-y")) || 160;
  Object.keys(LAYOUT).forEach(k=>{
    const l = document.querySelector(`.glow-s[data-screen="${k}"]`);
    if(!l) return;
    if(SCREEN_GLOW[k] && !l.style.backgroundImage) l.style.backgroundImage = glowGradient(GLOW[SCREEN_GLOW[k]].hex);
    const dy = k==="home" ? 0 : SCREEN_GLOW_Y - gy;
    l.style.translate = `${(LAYOUT[k][0] * PARALLAX * W).toFixed(1)}px ${(LAYOUT[k][1] * PARALLAX * H + dy).toFixed(1)}px`;
  });
}
/* one soft pulse when a meal is offered: that's the whole reward */
function pulseGlow(){
  const p = $("glowPulse");
  if(p && !calm() && document.documentElement.dataset.theme==="light") p.animate([{transform:"scale(1)"}, {transform:"scale(1.05)"}, {transform:"scale(1)"}], {duration:700, easing:"ease-in-out"});
}

/* ====================================================================
   SHUFFLE: the details of one meal (the one on Home, or the one the
   moment line points at). Change the whole meal or one food at a time,
   every change at once with a 5-second Undo, never a dialog; each food
   says when it's running low or isn't at home.
   ==================================================================== */
const shuffleUI = {target:null, changing:null, undo:null, note:null};
/* the rules every shuffle keeps: allergies and "not a fan" out, the locked rules and stage textures, no first
   allergen, at most one new food in the meal, the priorities (and what's at home, when that's one of them) */
function shufflePool(){
  const months = planMonths(), P = state.profile, intro = introducedAllergens(P);
  return eligibleFoods(months, P).filter(f=>!dislikeMatch(f.name, P) && newAllergens(f.name, intro).length===0);
}
function freshMeal(m, date, dayMeals){
  const months = planMonths(), st = stageFor(months), P = state.profile;
  const ms = MEAL_SLOTS.find(x=>x.id===m.slot) || MEAL_SLOTS.find(x=>x.slot===(SLOT_OF[m.label] || "lunch"));
  if(!ms) return null;
  const cats = st.perMeal ? ms.cats.slice(0, st.perMeal) : ms.cats;
  const foods = shufflePool(), known = knownFoods(), now_ = m.items.map(i=>i.name).sort().join("|");
  const ctx = planContext(months, P); ctx.newLimit = null;
  const others = new Set(dayMeals.filter(x=>x!==m).flatMap(x=>x.items.map(i=>i.name)));
  for(let k = 0; k < 16; k++){
    const day = {taken:new Set(others), colours:new Set(), newCount:0};
    // once the meal has its one new food (Untouched, not offered yet), the rest come from foods they've met
    const isNew = f=>isNewForPlan(f, P, known);
    const picks = [];
    cats.forEach(c=>{ const pool = picks.some(isNew) ? foods.filter(f=>!isNew(f)) : foods; const f = makeDealer(pool, ctx)(c, ms.slot, day); if(f) picks.push(f); });
    if(picks.length < cats.length) continue;
    if(picks.map(f=>f.name).sort().join("|")===now_) continue;
    return picks.map(f=>dish(f, st));
  }
  return null;
}
function dayMealsOf(date){ return mealsOn(date).map(x=>x.m); }
function noteToBuy(fn){
  const before = new Set(toBuyList().map(n=>n.foodId));
  fn();
  const added = toBuyList().map(n=>n.foodId).filter(id=>!before.has(id));
  state.newToBuy = [...new Set(state.newToBuy.concat(added))];
  return added;
}
/* the meal on show: the one asked for (the moment line's), else the one on Home */
function shuffleRef(){
  const t = shuffleUI.target;
  if(t){ const x = refsOn(localDate(t.iso)).find(r=>r.m.id===t.mealId); if(x) return x; }
  return homeRef().ref;
}
function shuffleOne(x){
  const old = x.m.items;
  const items = freshMeal(x.m, x.date, dayMealsOf(x.date));
  if(!items){ shuffleUI.note = say("shuffle.none"); announce(say("shuffle.none")); refresh("shuffle"); return; }
  const added = noteToBuy(()=>{ x.m.items = items; });
  save(); haptic();
  setUndo(say("shuffle.didMeal", {meal:x.m.label}), ()=>{ x.m.items = old; state.newToBuy = state.newToBuy.filter(id=>!added.includes(id)); });
  announce(say("shuffle.didMeal", {meal:x.m.label}));
  changed();
}
function setUndo(text, restore){
  clearTimeout(shuffleUI.undo && shuffleUI.undo.timer);
  shuffleUI.note = null;
  shuffleUI.undo = {text, restore, timer:setTimeout(()=>{ shuffleUI.undo = null; refresh("shuffle"); }, 5000)};
}
/* safe alternatives for one food (same group and slot), drawn ones first, in a stable order: no first allergen,
   nothing they're not a fan of, and a new food only if the meal has no other */
function alternatives(m, k, n){
  const item = m.items[k], months = planMonths(), slot = (MEAL_SLOTS.find(x=>x.id===m.slot) || {}).slot || SLOT_OF[m.label] || "lunch";
  const taken = new Set(m.items.map(i=>i.name)), known = knownFoods();
  const otherNew = m.items.some((i, j)=>j!==k && isNewForPlan(i, state.profile, known));
  const pool = shufflePool().filter(f=>f.cats[0]===item.cats[0] && f.slots.includes(slot) && !taken.has(f.name) && isAllowed(f, months, state.profile)
                                      && !(otherNew && isNewForPlan(f, state.profile, known)));
  return shuffledFor(pool.filter(f=>hasArt(foodOf(f.name))), item.id).concat(shuffledFor(pool.filter(f=>!hasArt(foodOf(f.name))), item.id)).slice(0, n || 3);
}
/* the same order for the same key, so options don't jump between redraws */
function shuffledFor(arr, key){
  const a = arr.slice();
  let h = 2166136261; for(let k=0; k<key.length; k++){ h ^= key.charCodeAt(k); h = Math.imul(h, 16777619) >>> 0; }
  for(let i=a.length-1; i>0; i--){ h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0; const j = h % (i+1); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
/* a food's stock, said only when it matters: running low, or not at home */
function stockAlert(item){
  const st = stockState(foodIdOf(item));
  return st==="low" ? say("shuffle.low") : st==="plenty" ? "" : say("shuffle.notHome");
}
function renderShuffle(){
  const x = shuffleRef();
  const pill = document.createElement("button");
  pill.type = "button"; pill.className = "btn-ink"; pill.dataset.f = "shuffle:meal"; pill.textContent = say("shuffle.meal");
  const title = x ? say(isoOf(x.date)===todayISO() ? "home.mealTitle" : "home.mealTitleTomorrow", {meal:x.m.label, time:fmtTime(x.start)}) : say("screens.shuffle");
  const col = frame("shuffle", title, {pin:pill});
  if(!x){ pill.disabled = true; col.appendChild(el("p", "quiet-line", say("shuffle.nothing"))); return; }
  const m = x.m, offered = mealOffered(m, x.date);
  pill.disabled = offered;
  pill.addEventListener("click", ()=>shuffleOne(x));
  col.dataset.meal = m.id;
  const live = el("p", "undo-line"); live.setAttribute("aria-live", "polite");
  if(shuffleUI.undo){
    live.append(shuffleUI.undo.text + " ");
    const u = textBtn(say("meal.undo"), ()=>{ const r = shuffleUI.undo; clearTimeout(r.timer); shuffleUI.undo = null; r.restore(); save(); announce(say("shuffle.undone")); changed(); }, "inline");
    u.dataset.f = "shuffle:undo";
    live.appendChild(u);
  }else if(shuffleUI.note) live.textContent = shuffleUI.note;
  else if(offered) live.textContent = say("shuffle.offered");
  col.appendChild(live);
  // the foods: each on its line, its stock said when it matters, and Change (one alternative at a time)
  const ul = el("ul", "sh-foods");
  let missing = false;
  m.items.forEach((item, k)=>{
    const li = el("li", "sh-food");
    const t = el("span", "sh-food-t");
    t.appendChild(el("span", "", isPrepped(item, isoOf(x.date), m.id) ? say("kitchen.prepped", {food:baseName(item)}) : foodLine(item)));
    const alert = stockAlert(item);
    if(alert){ if(alert===say("shuffle.notHome")) missing = true; t.appendChild(el("span", "sh-alert", alert)); }
    li.appendChild(t);
    if(!offered){
      const c = shuffleUI.changing;
      if(c && c.itemId===item.id){
        const opts = alternatives(m, k, 8), line = el("p", "alt-line");
        line.setAttribute("aria-live", "polite");
        if(!opts.length) line.textContent = say("shuffle.none");
        else{
          const f = opts[c.i % opts.length];
          line.append(el("span", "", say("shuffle.instead", {food:baseName(f)})));
          if(opts.length > 1){ const an = textBtn(say("meal.another"), ()=>{ c.i++; refresh("shuffle"); focusLater("alt:another:" + item.id); }, "small"); an.dataset.f = "alt:another:" + item.id; line.appendChild(an); }
          const keep = textBtn(say("meal.keep"), ()=>{
            const st = stageFor(planMonths()), fresh = dish(f, st), at = m.items.indexOf(item);
            const added = noteToBuy(()=>{ m.items[at] = fresh; });
            shuffleUI.changing = null;
            setUndo(say("meal.changed", {food:lower1(baseName(f))}), ()=>{ const j = m.items.indexOf(fresh); if(j >= 0) m.items[j] = item; state.newToBuy = state.newToBuy.filter(id=>!added.includes(id)); });
            save(); haptic(); announce(say("meal.changed", {food:lower1(baseName(f))})); changed(); focusLater("change:" + fresh.id);
          }, "small");
          keep.dataset.f = "alt:keep:" + item.id;
          line.appendChild(keep);
        }
        li.appendChild(line);
      }else{
        const ch = textBtn(say("meal.change"), ()=>{ shuffleUI.changing = {itemId:item.id, i:0}; refresh("shuffle"); focusLater("alt:keep:" + item.id); }, "small");
        ch.dataset.f = "change:" + item.id; ch.setAttribute("aria-label", say("meal.changeTo", {food:baseName(item)}));
        li.appendChild(ch);
      }
    }
    ul.appendChild(li);
  });
  col.appendChild(ul);
  if(missing){
    const p = el("p", "quiet-line", say("shuffle.missing") + " ");
    const b = textBtn(say("screens.kitchen"), ()=>go("kitchen"), "inline"); b.dataset.f = "shuffle:kitchen";
    p.appendChild(b); p.append("."); col.appendChild(p);
  }
  // how, in full, and what to do while the pan's out
  const how = mealHow(m);
  if(how.length){ const sec = section(col, "how", say("shuffle.how")); sec.appendChild(el("p", "sec-p", how.join(" "))); }
  const also = offered ? [] : alsoFor(x, 2);
  if(also.length){ const sec = section(col, "also", say("home.also")); also.forEach(a=>sec.appendChild(el("p", "sec-p", a.text))); }
  const foot = el("p", "sh-foot");
  const send = textBtn(say("shuffle.sendTomorrow"), ()=>sendDay(tomorrowOf(now()), state.profile.people[0]), "small");
  send.dataset.f = "shuffle:send";
  foot.appendChild(send);
  col.appendChild(foot);
}

/* ====================================================================
   NEW WEEK: start the next one. The onboarding's sentences, inside the
   pager. Nothing is archived or lost: the offers stay in the log and
   the new plan simply starts on its date.
   ==================================================================== */
const nwUI = {start:null, more:false, draft:null};
function nwDefaultStart(){
  // the day after the current week ends; if that's already past, today
  const end = addDays(weekStart(), 7);
  return isoOf(end > now() ? end : now());
}
function renderWeek(){
  const P = state.profile, st = stageFor(planMonths());
  if(!nwUI.start || nwUI.start < todayISO()) nwUI.start = nwDefaultStart();
  const pill = document.createElement("button");
  pill.type = "button"; pill.className = "btn-ink"; pill.dataset.f = nwUI.draft ? "nw:love" : "nw:set";
  pill.textContent = nwUI.draft ? say("onb.done.apply") : say("newWeek.set");
  pill.addEventListener("click", ()=>nwUI.draft ? applyNewWeek() : setTable());
  const col = frame("week", say("screens.week"), {pin:pill});
  col.classList.add("nw");
  if(nwUI.draft){
    const h = el("p", "sent", say("onb.done.title", {name:P.name || ""}));
    col.appendChild(h);
    col.appendChild(el("p", "quiet-line", say("newWeek.from", {date:fmtWeekday(localDate(nwUI.start)) + " " + fmtDayMonth(localDate(nwUI.start))})));
    col.appendChild(weekPreview(nwUI.draft, localDate(nwUI.start)));
    const acts = el("p", "nw-acts");
    const sh = textBtn(say("onb.done.shuffle"), ()=>{ setTable(); focusLater("nw:shuffle"); }, "small"); sh.dataset.f = "nw:shuffle";
    const back = textBtn(say("newWeek.back"), ()=>{ nwUI.draft = null; refresh("week"); focusLater("nw:set"); }, "small"); back.dataset.f = "nw:back";
    acts.append(sh, back);
    col.appendChild(acts);
    return;
  }
  // "Next week starts ____."
  const date = el("span", "blank date"); date.dataset.state = "ok";
  const di = document.createElement("input");
  di.type = "date"; di.className = "blank-input"; di.id = "nwDate"; di.value = nwUI.start; di.min = todayISO(); di.dataset.f = "nw:date";
  di.addEventListener("change", ()=>{ if(di.value && di.value >= todayISO()){ nwUI.start = di.value; } else di.value = nwUI.start; });
  date.appendChild(di);
  col.appendChild(nwSentence(say("newWeek.starts"), {blank:{el:date, input:di}}));
  // "We'll cook on ____ days."
  const cook = blank({value:String(P.cookDays || 7), min:1, maxLength:1, inputmode:"numeric",
    onInput:v=>{ const n = +v; const ok = /^[1-7]$/.test(v); cook.set(ok ? "ok" : "hint"); cookHint.textContent = ok || !v ? "" : say("newWeek.cookHint"); if(ok){ P.cookDays = n; save(); } }});
  cook.set("ok"); cook.input.dataset.f = "nw:cook";
  col.appendChild(nwSentence(say("newWeek.cook"), {blank:cook}));
  const cookHint = hint(); cookHint.classList.add("nw-hint"); col.appendChild(cookHint);
  // "This week, we're most into ____."
  col.appendChild(el("p", "sent", say("newWeek.into")));
  const pills = el("div", "pills");
  PRIORITIES.forEach(pr=>{
    const b = pillBtn(pr.label);
    b.dataset.f = "nw:pr:" + pr.id;
    const on = P.priorities.includes(pr.id);
    b.setAttribute("aria-pressed", String(on)); b.disabled = !on && P.priorities.length >= 3;
    b.addEventListener("click", ()=>{ P.priorities = on ? P.priorities.filter(x=>x!==pr.id) : P.priorities.concat(pr.id).slice(0, 3); save(); haptic(); refresh("week"); });
    pills.appendChild(b);
  });
  col.appendChild(pills);
  // "Try ____ new foods."
  const nf = blank({value:String(newFoodsFor(P, st)), min:1, maxLength:1, inputmode:"numeric",
    onInput:v=>{ const ok = /^[0-5]$/.test(v); nf.set(ok ? "ok" : "hint"); if(ok){ P.newFoods = +v; save(); } nfHint.textContent = !ok && v ? say("newWeek.newHint") : allergenRuleLine(ok ? +v : newFoodsFor(P, st)); }});
  nf.set("ok"); nf.input.dataset.f = "nw:new";
  col.appendChild(nwSentence(say("newWeek.newFoods"), {blank:nf}));
  const nfHint = hint(); nfHint.textContent = allergenRuleLine(newFoodsFor(P, st)); col.appendChild(nfHint);
  // More: read-only summaries, with links into Profile (and the Kitchen)
  const more = el("div", "nw-more");
  const mb = document.createElement("button");
  mb.type = "button"; mb.className = "group-btn"; mb.dataset.f = "nw:more";
  mb.setAttribute("aria-expanded", String(nwUI.more)); mb.setAttribute("aria-controls", "nwMore");
  mb.innerHTML = `<span>${esc(say("newWeek.more"))}</span><i class="chev" aria-hidden="true"></i>`;
  mb.addEventListener("click", ()=>{ nwUI.more = !nwUI.more; refresh("week"); });
  more.appendChild(mb);
  const box = el("div"); box.id = "nwMore"; box.hidden = !nwUI.more;
  if(nwUI.more){
    const line = (text, label, fn, f)=>{ const p = el("p", "sec-p", text + " "); const b = textBtn(label, fn, "inline"); b.dataset.f = f; p.appendChild(b); box.appendChild(p); };
    const off = offPlateWords();
    line(off.length ? say("newWeek.offPlate", {list:listJoin(off)}) : say("newWeek.offPlateNone"), say("newWeek.seeProfile"), ()=>go("profile", {section:"offplate"}), "nw:offplate");
    const home = state.pantry.filter(p=>p.state!=="out").map(p=>lower1(p.name));
    line(home.length ? say("newWeek.atHome", {list:listJoin(home.slice(0, 8))}) : say("newWeek.atHomeNone"), say("newWeek.seeKitchen"), ()=>go("kitchen"), "nw:athome");
    const again = warmingUp().map(w=>lower1(foodInfo(w.foodId).label));
    line(again.length ? say("newWeek.again", {list:listJoin(again.slice(0, 6))}) : say("newWeek.againNone"), say("newWeek.seeProfile"), ()=>go("profile", {section:"warming"}), "nw:again");
  }
  more.appendChild(box);
  col.appendChild(more);
}
/* the allergen rule, said once beside "Try {n} new foods" */
function nwSentence(text, slots){
  const h = sentence(text, slots), p = el("p", "sent");
  while(h.firstChild) p.appendChild(h.firstChild);
  return p;
}
function allergenRuleLine(n){
  const intro = introducedAllergens(state.profile);
  const waiting = ALLERGENS.filter(a=>!intro.has(a.id) && state.profile.allergens[a.id]!=="avoid");
  return n > 0 && waiting.length ? say("newWeek.allergenRule", {n:ALLERGEN_SPACING_DAYS}) : "";
}
function setTable(){
  const start = localDate(nwUI.start);
  nwUI.draft = generateWeek(planMonths(), state.profile, {start});
  haptic(); refresh("week"); focusLater(nwUI.draft ? "nw:love" : "nw:set");
}
function applyNewWeek(){
  if(!nwUI.draft) return;
  startWeek(nwUI.draft, nwUI.start);
  if(nwUI.start <= todayISO()) state.profile.lastStage = stageNow().id;
  nwUI.draft = null; nwUI.start = null;
  save(); haptic(); pulseGlow(); announce(say("newWeek.done")); picked = null;
  changed(); go("home");
}

/* ====================================================================
   PROFILE: know {name}. How the week is going, what they love, what's
   still warming up, what stays off the plate, their firsts, settings.
   Plain text lists; no percentages, scores or counts as pressure.
   ==================================================================== */
const pfUI = {linkAsk:false, status:"", open:{}};
/* foods whose offers were mostly "Loved it" */
function lovedFoods(){
  const by = {};
  liveOffers().forEach(e=>{ if(!e.outcome) return; const r = by[e.foodId] = by[e.foodId] || {loved:0, all:0}; r.all++; if(e.outcome==="loved") r.loved++; });
  return Object.keys(by).filter(k=>by[k].loved * 2 > by[k].all);
}
/* offered at least twice, answered "Not today" or "Ate some", and not (yet) loved */
function warmingUp(){
  const loved = new Set(lovedFoods()), by = {};
  liveOffers().forEach(e=>{ const r = by[e.foodId] = by[e.foodId] || {n:0, cool:0}; r.n++; if(e.outcome==="not_today" || e.outcome==="some") r.cool++; });
  return Object.keys(by).filter(k=>by[k].n >= 2 && by[k].cool > 0 && !loved.has(k)).map(k=>({foodId:k, n:by[k].n}));
}
/* at most four, then "and 3 more" */
function shortList(a){ return a.length <= 4 ? listJoin(a) : a.slice(0, 4).join(", ") + " " + say("home.andMore", {n:a.length - 4}); }
function offPlateWords(){
  const P = state.profile;
  return [...ALLERGENS.filter(a=>P.allergens[a.id]==="avoid").map(a=>lower1(a.label.split(" /")[0])), ...dietOut(P).map(g=>lower1(g.label)), ...P.avoid.map(a=>lower1(a.name))];
}
/* which fold a Profile section sits in (Home and New week link straight to "offplate" or "warming") */
const PF_FOLD = {going:"going", week:"going", loved:"going", warming:"going", firsts:"going", offplate:"offplate"};
/* a fold: its heading with Show/Hide, a line or two saying what's inside, and (open) the body. Closed on arrival */
function pfFold(col, key, title, lines, fill){
  const open = !!pfUI.open[key], sec = section(col, key), id = "pf-" + key;
  sec.classList.add("pf-fold");
  const head = el("div", "pf-fold-head");
  head.appendChild(el("h2", "sec-h", title));
  const t = textBtn(say(open ? "kitchen.hide" : "kitchen.show"), ()=>{ pfUI.open[key] = !open; refresh("profile"); focusLater("fold:" + key); }, "small");
  t.dataset.f = "fold:" + key; t.setAttribute("aria-expanded", String(open)); t.setAttribute("aria-controls", id);
  t.setAttribute("aria-label", say(open ? "profile.hideFor" : "profile.showFor", {section:title}));
  head.appendChild(t); sec.appendChild(head);
  const body = el("div", "pf-fold-body"); body.id = id;
  if(open) fill(body);
  else lines.filter(Boolean).forEach(l=>body.appendChild(el("p", "sec-p muted pf-sum", l)));
  sec.appendChild(body);
}
/* a titled part inside a fold, reachable by its key */
function pfSub(body, key, title){
  const s = el("div", "pf-sub"); s.dataset.sec = key; s.tabIndex = -1;
  s.appendChild(el("h3", "sec-h pf-h", title));
  body.appendChild(s);
  return s;
}
/* first tastes grouped by month, newest first: [{name:"October", foods:["oatmeal", "egg"]}] (the year when it isn't this one) */
function firstsByMonth(){
  const by = new Map(), y = now().getFullYear();
  liveOffers().filter(e=>e.firstOfFood).sort((a, b)=>a.date < b.date ? 1 : a.date > b.date ? -1 : 0).forEach(e=>{
    const k = e.date.slice(0, 7);
    if(!by.has(k)) by.set(k, []);
    const f = lower1(foodInfo(e.foodId).label);
    if(!by.get(k).includes(f)) by.get(k).push(f);
  });
  return [...by].map(([k, foods])=>{ const yy = +k.slice(0, 4); return {name:MONTH_NAMES[+k.slice(5, 7) - 1] + (yy!==y ? " " + yy : ""), foods}; });
}
function renderProfile(){
  const P = state.profile;
  const col = frame("profile", say("screens.profile"), {sub:P.birthDate ? stageNow().name : ""});   // the name and age are in the header
  const iso0 = state.weekStarted, iso6 = isoOf(addDays(weekStart(), 6));
  // How it's going and Off the plate: two folds, closed on arrival, each with a line or two saying what's inside
  const loved = lovedFoods(), lovedWords = loved.map(k=>lower1(foodInfo(k).label));
  const months = firstsByMonth(), latest = months[0];
  const recs = ALLERGENS.map(a=>({a, rec:allergenRecord(a.id), label:a.label.split(" /")[0]}));
  const intro = recs.filter(x=>x.rec.state==="introduced"), notYet = recs.filter(x=>x.rec.state==="notyet");
  const allergies = [...ALLERGENS.filter(a=>P.allergens[a.id]==="avoid").map(a=>a.label.split(" /")[0]), ...dietOut(P).map(g=>g.label), ...P.avoid.filter(a=>a.kind==="allergy").map(a=>a.name)];
  const allergiesLine = allergies.length ? say("profile.allergies", {list:listJoin(allergies.map(lower1))}) : say("profile.allergiesNone");
  pfFold(col, "going", say("profile.going"), [
    lovedWords.length ? say("profile.goingLoved", {foods:listJoin(lovedWords.slice(0, 2))}) : say("profile.goingLovedNone"),
    latest ? say("profile.firstsIn", {foods:listJoin(latest.foods.slice(0, 3)), month:latest.name}) : ""
  ], body=>{
    // this week: each group's planned foods, the offered ones in ink, the ones still to come muted
    if(hasPlan()){
      const wk = pfSub(body, "week", say("profile.thisWeek")), planned = {};
      weekDays().forEach(({date})=>mealsOn(date).forEach(x=>x.m.items.forEach(i=>{ const c = i.cats[0]; (planned[c] = planned[c] || new Set()).add(lower1(baseName(i))); })));
      GROUPS.forEach(c=>{
        const got = offeredFoods(c, iso0, iso6).map(lower1), later = [...(planned[c] || [])].filter(f=>!got.includes(f));
        if(!got.length && !later.length) return;
        const r = el("div", "pf-row"), g = say("home.groups." + c);
        r.appendChild(el("span", "pf-row-l", g));
        const foods = el("p", "pf-foods");
        foods.setAttribute("aria-label", g + ": " + [got.length ? say("profile.offered", {foods:listJoin(got)}) : "", later.length ? say("profile.toCome", {foods:listJoin(later)}) : ""].filter(Boolean).join("; "));
        const shown = [...got.map(f=>[f, ""]), ...later.slice(0, Math.max(0, 5 - got.length)).map(f=>[f, " later"])];
        shown.forEach(([f, cls], k)=>{ if(k) foods.append("\u00a0· "); foods.appendChild(el("span", "pf-food" + cls, f)); });   // a dot never starts a line
        const more = got.length + later.length - shown.length;
        if(more > 0) foods.appendChild(el("span", "pf-food later", " +" + more));
        r.appendChild(foods); wk.appendChild(r);
      });
    }
    // Loved it
    const lov = pfSub(body, "loved", say("profile.loved"));
    lov.appendChild(el("p", loved.length ? "sec-p" : "quiet-line", loved.length ? upper1(listJoin(lovedWords)) + "." : say("profile.lovedNone")));
    // Still warming up: each row's tip pairs it with a different loved food
    const warm = pfSub(body, "warming", say("profile.warming")), wl = warmingUp();
    if(!wl.length) warm.appendChild(el("p", "quiet-line", say("profile.warmingNone")));
    wl.forEach((w, k)=>{
      const r = el("div", "row"), t = el("p", "row-t"); t.style.margin = "0";
      t.textContent = say("profile.offeredTimes", {food:foodInfo(w.foodId).label, n:w.n});
      t.appendChild(el("span", "row-sub", anotherWay(w.foodId, k)));
      r.appendChild(t); warm.appendChild(r);
    });
    // Firsts, by month, newest first
    const fs = pfSub(body, "firsts", say("profile.firsts"));
    if(!months.length) fs.appendChild(el("p", "quiet-line", say("profile.firstsNone")));
    months.forEach(m=>{
      const r = el("div", "pf-row");
      r.append(el("span", "pf-row-l", m.name), el("p", "pf-foods", upper1(listJoin(m.foods)) + "."));
      fs.appendChild(r);
    });
  });
  pfFold(col, "offplate", say("profile.offPlate"), [
    allergiesLine,
    intro.length ? say("profile.introducedList", {list:upper1(listJoin(intro.map(x=>lower1(x.label))))}) : ""
  ], body=>{
    const notFan = P.avoid.filter(a=>a.kind==="dislike").map(a=>a.name);
    body.appendChild(el("p", "sec-p", allergiesLine));
    if(notFan.length) body.appendChild(el("p", "sec-p", say("profile.notFan", {list:listJoin(notFan.map(lower1))})));
    body.appendChild(el("p", "sec-p muted", lockedLine(ageNow())));
    // the allergens, by where they stand: introduced (with "No reaction noted"), then not yet (with "Tried, all fine");
    // the kept-out ones are named in Allergies above
    const rec = (x, sub, btn)=>{
      const r = el("div", "row"), t = el("p", "row-t"); t.style.margin = "0";
      t.textContent = x.label;
      if(sub) t.appendChild(el("span", "row-sub", sub));
      r.appendChild(t); if(btn) r.appendChild(btn);
      return r;
    };
    const triedBtn = (x, tried)=>{
      const b = textBtn(say(tried ? "allergenNote.markTried" : "allergenNote.markNotYet"), ()=>{
        setBigPlace(P, x.a.id, tried ? "tried" : P.foodSort ? "untouched" : null);
        save(); haptic(); refresh("profile"); focusLater("tried:" + x.a.id);
      }, "small");
      b.dataset.f = "tried:" + x.a.id; b.setAttribute("aria-label", say(tried ? "allergenNote.markTriedFor" : "allergenNote.markNotYetFor", {allergen:x.label}));
      return b;
    };
    if(intro.length){
      body.appendChild(el("h3", "sec-h pf-h", say("profile.introducedHead")));
      intro.forEach(x=>{
        const {on, noReactionOn} = x.rec;
        const sub = noReactionOn ? say("allergenNote.noReaction", {date:fmtDayMonth(localDate(noReactionOn))}) : on ? fmtDayMonth(localDate(on)) : say("allergenNote.introducedBefore");
        let btn = null;
        if(!on) btn = triedBtn(x, false);
        else if(!noReactionOn){
          btn = textBtn(say("allergenNote.markNoReaction"), ()=>{ state.allergyNotes[x.a.id] = {noReactionOn:todayISO()}; save(); haptic(); refresh("profile"); focusLater("noreact:" + x.a.id); }, "small");
          btn.dataset.f = "noreact:" + x.a.id; btn.setAttribute("aria-label", say("allergenNote.markFor", {allergen:x.label}));
        }
        body.appendChild(rec(x, sub, btn));
      });
    }
    if(notYet.length){
      body.appendChild(el("h3", "sec-h pf-h", say("profile.notYetHead")));
      notYet.forEach(x=>body.appendChild(rec(x, "", triedBtn(x, true))));
    }
    body.appendChild(el("p", "quiet-line", say("allergenNote.note")));
    const editOff = textBtn(say("profile.edit"), ()=>openOnboarding("keepout", {single:true}), "small"); editOff.dataset.f = "edit:offplate";
    body.appendChild(editOff);
  });
  // Settings
  const set = section(col, "settings", say("profile.settings"));
  const row = (label, sub, fn, f, disabled)=>{
    const b = document.createElement("button");
    b.type = "button"; b.className = "row-btn"; b.dataset.f = f; b.disabled = !!disabled;
    b.innerHTML = `<span class="row-t"><span>${esc(label)}</span>${sub ? `<span class="row-sub">${esc(sub)}</span>` : ""}</span>`;
    b.addEventListener("click", fn);
    set.appendChild(b);
  };
  // the name: redraw it or fix its spelling (both on the onboarding's name step)
  const nm = el("div", "s-person");
  nm.appendChild(el("p", "", say("profile.name") + (P.name ? " · " + P.name : "")));
  const na = el("span", "sh-acts");
  const rd = textBtn(say("profile.redraw"), ()=>openOnboarding("draw", {single:true}), "small"); rd.dataset.f = "set:redraw";
  const sp = textBtn(say("profile.editSpelling"), ()=>openOnboarding(P.ink ? "spell" : "draw", {single:true, sub:"typed"}), "small"); sp.dataset.f = "set:name";
  na.append(rd, sp); nm.appendChild(na);
  set.appendChild(nm);
  row(say("profile.birthday"), P.birthDate ? fmtDayMonth(localDate(P.birthDate)) + " " + localDate(P.birthDate).getFullYear() : "", ()=>openOnboarding("birthday", {single:true}), "set:birthday");
  row(say("profile.mealTimes"), "", ()=>openOnboarding("mealtimes", {single:true}), "set:mealtimes", planMonths() < 6);
  row(say("profile.priorities"), P.priorities.length ? listJoin(P.priorities.map(id=>lower1((PRIORITIES.find(p=>p.id===id) || {}).label || id))) : "", ()=>openOnboarding("priorities", {single:true}), "set:priorities");
  row(say("profile.basics"), "", ()=>openOnboarding("athome", {single:true}), "set:basics");
  // Appearance: Auto follows the system; Light and Dark stay put (stored on this device)
  const seg = el("div", "s-seg");
  seg.setAttribute("role", "group"); seg.setAttribute("aria-labelledby", "segAppearance");
  seg.innerHTML = `<span class="s-seg-l" id="segAppearance">${esc(say("profile.appearance"))}</span><span class="s-seg-opts"></span>`;
  ["auto","light","dark"].forEach(v=>{
    const b = document.createElement("button");
    b.type = "button"; b.dataset.f = "appearance:" + v; b.textContent = say("profile.appearanceOpts." + v);
    b.setAttribute("aria-pressed", String((P.appearance || "auto")===v));
    b.addEventListener("click", ()=>{ P.appearance = v; save(); applyTheme(v); updateChrome(); haptic(); refresh("profile"); });
    seg.lastChild.appendChild(b);
  });
  set.appendChild(seg);
  row(say("profile.replay"), "", ()=>openOnboarding("draw", {replay:true}), "set:replay");
  renderCaregivers(col);
}
/* caregivers: notes to self, the people who look after {name}, and the week as a link; numbers stay here */
function renderCaregivers(col){
  const P = state.profile, name = P.name || "", t = now();
  const sec = section(col, "people", say("profile.caregivers"));
  const status = el("p", "quiet-line s-status", pfUI.status); status.setAttribute("aria-live", "polite");
  const self = el("p", "s-sentence");
  const sb = blank({min:10, maxLength:20, inputmode:"tel", autocomplete:"tel", value:P.self.phone || "", onInput:v=>{ P.self = {phone:normPhone(v)}; save(); }});
  sb.input.dataset.f = "pf:self";
  const sp = say("people.self").split("{blank}");
  const sl = document.createElement("label"); sl.htmlFor = sb.input.id; sl.textContent = sp[0].trim();
  self.append(sl, " ", sb.el, sp[1] || "");
  sec.appendChild(self);
  sec.appendChild(el("p", "quiet-line", say("people.selfHint")));
  P.people.forEach(p=>{
    const r = el("div", "s-person");
    r.appendChild(el("p", "", p.name + (p.phone ? " · " + p.phone : "")));
    const acts = el("span", "sh-acts");
    const st = textBtn(say("people.sendTomorrow"), ()=>sendDay(tomorrowOf(t), p, status), "small"); st.dataset.f = "pf:send:" + p.id;
    st.setAttribute("aria-label", say("send.tomorrowTo", {person:p.name}));
    const rm = textBtn(say("people.removeShort"), ()=>{ P.people = P.people.filter(q=>q!==p); save(); refresh("profile"); focusLater("pf:addname"); }, "small"); rm.dataset.f = "pf:rm:" + p.id;
    rm.setAttribute("aria-label", say("people.remove", {person:p.name}));
    acts.append(st, rm); r.appendChild(acts);
    sec.appendChild(r);
  });
  const nb = blank({min:6, maxLength:30, autocomplete:"off"}), pb = blank({min:10, maxLength:20, inputmode:"tel", autocomplete:"off"});
  nb.input.dataset.f = "pf:addname"; pb.input.dataset.f = "pf:addphone";
  const ap = say("people.add", {name}).split("{blank}");
  const p1 = el("p", "s-sentence"); const l1 = document.createElement("label"); l1.htmlFor = nb.input.id; l1.textContent = ap[0].trim();
  p1.append(l1, " ", nb.el, ap[1] || "");
  const pp = say("people.phone").split("{blank}");
  const p2 = el("p", "s-sentence"); const l2 = document.createElement("label"); l2.htmlFor = pb.input.id; l2.textContent = pp[0].trim();
  p2.append(l2, " ", pb.el);
  const commit = ()=>{ const n = nb.input.value.trim(); if(!n) return; P.people.push({id:uid(), name:upper1(n), phone:normPhone(pb.input.value), role:""}); markAsked("people", true); save(); refresh("profile"); focusLater("pf:addname"); };
  nb.input.addEventListener("keydown", e=>{ if(e.key==="Enter"){ e.preventDefault(); pb.input.focus(); } });
  pb.input.addEventListener("keydown", e=>{ if(e.key==="Enter"){ e.preventDefault(); commit(); } });
  const saveBtn = textBtn(say("people.save"), commit, "small"); saveBtn.dataset.f = "pf:save";
  const saveRow = el("div", "sh-acts"); saveRow.appendChild(saveBtn);   // its own line: never touching the link below
  sec.append(p1, p2, el("p", "quiet-line", say("people.phoneHint") + " " + say("people.stays")), saveRow);
  // the week as a link: it carries allergies and the menu, so it says so first
  if(pfUI.linkAsk){
    sec.appendChild(el("p", "s-warn", say("send.linkWarn", {name})));
    const ok = textBtn(say("send.linkOk"), ()=>{ state.asked = Object.assign({}, state.asked, {linkWarned:todayISO()}); save(); pfUI.linkAsk = false; sendWeekLink(status); refresh("profile"); }, "small");
    ok.dataset.f = "pf:linkok";
    sec.appendChild(ok);
  }else{
    const lk = textBtn(say("send.weekLink"), ()=>{ if(!(state.asked || {}).linkWarned){ pfUI.linkAsk = true; refresh("profile"); focusLater("pf:linkok"); } else sendWeekLink(status); }, "small");
    lk.dataset.f = "pf:link";
    sec.appendChild(lk);
  }
  sec.appendChild(status);
}
const SCREENS = {shuffle:renderShuffle, kitchen:renderKitchen, week:renderWeek, profile:renderProfile};

/* ====================================================================
   SHARING: text first. "Opens Messages" and nothing more is promised.
   ==================================================================== */
/* iOS and macOS take sms:{n}&body=, Android sms:{n}?body= (docs/decisions.md) */
function platform(ua, touch){
  const u = ua || navigator.userAgent;
  if(/Android/i.test(u)) return "android";
  if(/iPhone|iPad|iPod/i.test(u) || (/Macintosh/i.test(u))) return "apple";
  return "other";
}
function smsHref(number, body, plat){
  const n = normPhone(number), b = encodeURIComponent(body);
  return `sms:${n}${(plat || platform())==="apple" ? "&" : "?"}body=${b}`;
}
async function copyText(text){
  try{ await navigator.clipboard.writeText(text); return true; }
  catch(e){
    const ta = document.createElement("textarea");
    ta.value = text; ta.setAttribute("readonly", ""); ta.style.cssText = "position:fixed;opacity:0;top:0;left:0";
    document.body.appendChild(ta); ta.select();
    let ok = false; try{ ok = document.execCommand("copy"); }catch(_){}
    ta.remove(); return ok;
  }
}
function markShared(){ state.asked = Object.assign({}, state.asked, {shared:state.asked.shared || todayISO()}); save(); }
/* a number → Messages (falling back to the share sheet, then copying); no number → share sheet, then copy */
async function deliver({text, phone}, status){
  markShared();
  if(phone){
    let left = false;
    const away = ()=>{ if(document.hidden) left = true; };
    document.addEventListener("visibilitychange", away);
    location.href = smsHref(phone, text);
    await new Promise(r=>setTimeout(r, 1400));
    document.removeEventListener("visibilitychange", away);
    if(left || !document.hasFocus()) return "sms";
  }
  if(navigator.share){
    try{ await navigator.share({text}); return "shared"; }
    catch(e){ if(e && e.name==="AbortError") return "cancelled"; }
  }
  await copyText(text);
  if(status) status.textContent = say("send.copied");
  pfUI.status = "";
  announce(say("home.announce.copied"));
  return "copied";
}
function sendGroceries(){ deliver({text:groceriesText(), phone:state.profile.self.phone}); }
function sendDay(date, person, status){ deliver({text:dayText(date), phone:person && person.phone}, status); }
async function sendWeekLink(status){
  const {url, short} = await snapshotURL();
  await deliver({text:weekText(url)}, status);
  if(short && status) status.textContent = say("send.linkShort");
}

/* ---------- message templates (content.js has every word) ---------- */
function allergyList(){
  const P = state.profile;
  return [...ALLERGENS.filter(a=>P.allergens[a.id]==="avoid").map(a=>lower1(a.label.split(" /")[0])), ...dietOut(P).map(g=>lower1(g.label)), ...P.avoid.filter(a=>a.kind==="allergy").map(a=>lower1(a.name))];
}
function lockedList(){ return LOCKED_RULES.filter(r=>!r.until || ageNow() < r.until).map(r=>lower1(r.label)); }
function groceriesText(){
  const P = state.profile, t = now(), C = "share.groceries.";
  const lines = [say(C + "head", {name:P.name || "", date:fmtDayMonth(t)}), say(C + "updated", {time:fmtTime(t)})];
  // only what's still on the list, in shopping units; "by {weekday}" only for what's needed within the three days
  toBuyList().forEach(n=>lines.push(say(C + "item", {item:n.name, unit:n.unit.text}) + (n.date && daysFromToday(n.date) < KITCHEN.HORIZON_DAYS ? say(C + "by", {weekday:fmtWeekday(n.date)}) : "")));
  return lines.join("\n") + "\n";
}
function dayText(date, link){
  const P = state.profile, t = now(), C = "share.day.";
  const al = allergyList();
  const lines = [say(C + "head", {name:P.name || "", weekday:fmtWeekday(date), date:fmtDayMonth(date)}), say(C + "updated", {time:fmtTime(t)}),
                 say(C + "allergies", {list:al.length ? listJoin(al) : say(C + "none"), locked:listJoin(lockedList())}), ""];
  const refs = mealsOn(date);
  refs.forEach(x=>lines.push(say(C + "meal", {time:fmtTime(x.start), meal:x.m.label,
    foods:x.m.items.map(i=>say(C + (i.qty ? "food" : "foodPlain"), {food:lower1(baseName(i)), amount:i.qty || "", texture:textureOf(i)}).trim()).join(", ")})));
  if(link) lines.push(say(C + "full", {link}));
  return lines.join("\n");
}
function weekText(link){
  const P = state.profile, t = now(), C = "share.week.";
  const lines = [say(C + "head", {name:P.name || ""}), say(C + "updated", {date:fmtDayMonth(t), time:fmtTime(t)})];
  weekDays().filter(x=>isoOf(x.date) >= todayISO()).forEach(x=>{
    const refs = mealsOn(x.date);
    if(!refs.length) return;
    lines.push(say(C + "day", {weekday:fmtWeekday(x.date), meals:refs.map(r=>say(C + "meal", {meal:r.m.label, foods:r.m.items.map(i=>lower1(baseName(i))).join(", ")})).join(" · ")}));
  });
  if(link) lines.push(say(C + "full", {link}));
  return lines.join("\n");
}

/* ====================================================================
   THE CARETAKER LINK: a read-only snapshot in the URL fragment (never sent
   to the server). Versioned; gzip + base64url, with a plain fallback.
   Holds age in months (not the birth date), allergies, dislikes, locked
   items and the meals. Never offers, stock, phone numbers or other names.
   ==================================================================== */
const LINK_CAP = 1800;
const b64url = bytes=>btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64url = s=>{ const t = s.replace(/-/g, "+").replace(/_/g, "/"); const bin = atob(t + "===".slice((t.length + 3) % 4)); return Uint8Array.from(bin, c=>c.charCodeAt(0)); };
function snapshotPayload(days){
  const P = state.profile;
  return {v:1, n:P.name || "", m:ageNow(), g:now().toISOString(),
    a:allergyList(), d:P.avoid.filter(x=>x.kind==="dislike").map(x=>x.name), k:lockedList(),
    days:days.map(date=>({w:isoOf(date), ml:mealsOn(date).map(x=>({t:x.time, l:x.m.label,
      f:x.m.items.map(i=>{ const f = foodOf(i.name); return [f ? f.id : "~" + baseName(i), i.qty || "", textureOf(i)]; })}))})).filter(d=>d.ml.length)};
}
async function encodePayload(obj){
  const json = JSON.stringify(obj);
  if(typeof CompressionStream!=="undefined"){
    try{
      const stream = new Blob([json]).stream().pipeThrough(new CompressionStream("gzip"));
      return "z" + b64url(new Uint8Array(await new Response(stream).arrayBuffer()));
    }catch(e){}
  }
  return "j" + b64url(new TextEncoder().encode(json));
}
async function decodePayload(s){
  try{
    const kind = s[0], bytes = unb64url(s.slice(1));
    let json;
    if(kind==="z") json = await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"))).text();
    else if(kind==="j") json = new TextDecoder().decode(bytes);
    else return null;
    const o = JSON.parse(json);
    return o && o.v===1 && Array.isArray(o.days) && typeof o.n==="string" ? o : null;
  }catch(e){ return null; }
}
function linkBase(){ return location.origin + location.pathname; }
/* the week if it fits in ~1.8k characters, else today and tomorrow (and the sender is told) */
async function snapshotURL(){
  const t = now(), week = weekDays().map(x=>x.date).filter(d=>isoOf(d) >= todayISO());
  let url = linkBase() + "#/s/" + await encodePayload(snapshotPayload(week));
  if(url.length <= LINK_CAP) return {url, short:false};
  url = linkBase() + "#/s/" + await encodePayload(snapshotPayload([t, tomorrowOf(t)]));
  return {url, short:true};
}
/* the read-only view: allergies first, then the days; no ticks, no editing, nothing saved */
const SNAPSHOT = /^#\/s\//.test(location.hash);
async function renderSnapshot(){
  const root = $("app"), o = await decodePayload(location.hash.slice(4));
  document.body.classList.add("is-snapshot");
  root.innerHTML = "";
  const main = el("main", "snap home-snap");
  if(!o){ main.innerHTML = `<p class="snap-broken">${esc(say("snap.broken"))}</p>`; root.appendChild(main); document.title = "Chicho"; return; }
  document.title = say("snap.title", {name:o.n});
  const months = o.m===1 ? "1 month" : o.m + " months";
  main.insertAdjacentHTML("beforeend", `<p class="snap-who">${esc(say("snap.who", {name:o.n, months}))}</p>`);
  main.insertAdjacentHTML("beforeend", `<h1 class="snap-avoid">${esc(o.a.length ? say("snap.avoid", {list:listJoin(o.a)}) : say("snap.avoidNone"))} ${esc(o.k.length ? say("snap.notYet", {list:listJoin(o.k)}) : "")}</h1>`);
  o.days.forEach(d=>{
    const date = localDate(d.w);
    const sec = el("section", "snap-day");
    sec.insertAdjacentHTML("beforeend", `<h2>${esc(fmtWeekday(date) + " " + fmtDayMonth(date))}</h2>`);
    d.ml.forEach(m=>{
      const at = atTime(date, m.t);
      sec.insertAdjacentHTML("beforeend", `<div class="snap-meal"><p class="snap-meal-h">${esc(fmtTime(at) + " · " + m.l)}</p>` +
        m.f.map(([id, qty, tex])=>{ const f = id[0]==="~" ? null : FOOD_BY_ID[id]; const label = f ? f.label : id.slice(1);
          return `<p class="snap-food">${foodArt(f ? f.id : null, {size:24})}<span><b>${esc(label)}</b> ${esc([qty, tex].filter(Boolean).join(" · "))}</span></p>`; }).join("") + `</div>`);
    });
    main.appendChild(sec);
  });
  main.insertAdjacentHTML("beforeend", `<p class="snap-updated">${esc(say("snap.updated", {when:fmtDayMonth(new Date(o.g)) + ", " + fmtTime(new Date(o.g))}))}</p>`);
  root.appendChild(main);
}

/* ====================================================================
   THE BROWSER: the tab title, a favicon of the next meal, the theme colour
   ==================================================================== */
let currentTitle = "Chicho", faviconFood = null;
/* the browser's own chrome takes the theme's top colour: the paper, or the top of the night sky */
const THEME_COLOR = {light:"#DCDDDD", dark:"#3D4662"};   // mirrors --bg and --night-top (the metas need literal colours)
function themeColor(){ return getComputedStyle(document.documentElement).getPropertyValue(document.documentElement.dataset.theme==="dark" ? "--night-top" : "--bg").trim(); }
function updateChrome(){
  document.title = currentTitle;
  // Auto: each meta keeps its own scheme's colour. A chosen theme pins both to it, whatever the system says.
  const pinned = (state.profile.appearance || "auto")!=="auto" || /[?&]theme=/.test(location.search);
  document.querySelectorAll('meta[name="theme-color"]').forEach(m=>{
    const c = pinned ? themeColor() : (/dark/.test(m.media) ? THEME_COLOR.dark : THEME_COLOR.light);
    if(c && m.content!==c) m.content = c;
  });
  const nx = milkOnly() ? null : nextMeal(), food = nx && nx.m.items[0] ? foodOf(nx.m.items[0].name) : null;
  const id = food && hasArt(food) ? food.id : null;
  if(id!==faviconFood){ faviconFood = id; drawFavicon(food); }
}
/* the next meal's drawing in white on a dark rounded square; falls back to the
   static icon if the drawing is missing or doesn't read at 16 and 32 px */
function drawFavicon(food){
  const link = $("favicon");
  if(!link) return;
  if(!food || !hasArt(food)){ link.href = "icon-192.png"; return; }
  const img = new Image();
  img.onload = ()=>{
    try{
      const S = 64, c = document.createElement("canvas"); c.width = c.height = S;
      const x = c.getContext("2d");
      x.fillStyle = "#0A0A0A"; x.beginPath(); x.roundRect ? x.roundRect(0, 0, S, S, 14) : x.rect(0, 0, S, S); x.fill();
      const w = document.createElement("canvas"); w.width = w.height = 48;
      const wx = w.getContext("2d");
      wx.drawImage(img, 0, 0, 48, 48); wx.globalCompositeOperation = "source-in"; wx.fillStyle = "#FFFFFF"; wx.fillRect(0, 0, 48, 48);
      // the drawing's line is fine at 64px but faint at 16: draw it a pixel each way to thicken it
      [[0,0],[1,0],[-1,0],[0,1],[0,-1]].forEach(([dx, dy])=>x.drawImage(w, 8 + dx, 8 + dy));
      if(!faviconLegible(c)){ link.href = "icon-192.png"; return; }
      link.href = c.toDataURL("image/png");
    }catch(e){ link.href = "icon-192.png"; }
  };
  img.onerror = ()=>{ link.href = "icon-192.png"; };
  img.src = food.files.w64;
}
/* legible = at 16 and 32 px, the white line covers a sensible share of the tile */
function faviconLegible(src){
  return [16, 32].every(s=>{
    const c = document.createElement("canvas"); c.width = c.height = s;
    const x = c.getContext("2d"); x.drawImage(src, 0, 0, s, s);
    const d = x.getImageData(0, 0, s, s).data; let light = 0;
    for(let i=0; i<d.length; i+=4) if(d[i] > 140) light++;
    const share = light / (s*s);
    return share > .04 && share < .6;
  });
}

/* ---------- the clock: every minute on the minute, paused while hidden ---------- */
let clockTimer = 0, lastISO = null;
function tick(){
  if(SNAPSHOT) return;
  if(todayISO()!==lastISO){ picked = null; changed(); return; }   // midnight: a new day, its own plan
  renderHome();
}
function scheduleTick(){
  clearTimeout(clockTimer);
  if(document.hidden || SNAPSHOT) return;
  clockTimer = setTimeout(()=>{ tick(); scheduleTick(); }, 60000 - (Date.now() % 60000) + 40);
}

/* iOS Safari applies :active only when the document listens for touches; this empty listener is the switch */
document.addEventListener("touchstart", ()=>{}, {passive:true});
/* ---------- init ---------- */
(function init(){
  if(SNAPSHOT){
    // the viewer's own Chicho data is never touched
    save = function(){};
    try{ const set = Storage.prototype.setItem; Storage.prototype.setItem = function(k, v){ if(this===localStorage) return; return set.call(this, k, v); }; }catch(e){}
    renderSnapshot();
    return;
  }
  document.body.classList.add("is-app");
  $("profileBtn").addEventListener("click", e=>navIsOpen() ? navClose() : navOpen(e.detail===0));   // detail 0: Enter or Space
  $("profileBtn").addEventListener("keydown", e=>{ if(navIsOpen() && (e.key==="ArrowDown" || e.key==="ArrowUp" || e.key==="Escape")){ e.preventDefault(); if(e.key==="Escape") navClose(); else (e.key==="ArrowDown" ? $("navList").firstChild : $("navList").lastChild).focus(); } });
  $("navScrim").addEventListener("click", ()=>navClose());
  $("navList").addEventListener("keydown", navKeys);
  // the screens start under the header, whatever its height (a drawn name, the larger text sizes)
  new ResizeObserver(()=>document.documentElement.style.setProperty("--chrome-h", $("chrome").offsetHeight + "px")).observe($("chrome"));
  placeScreens();
  paintScreenGlows();
  document.addEventListener("themechange", ()=>{ updateChrome(); applyCamera(pg.x, pg.y); });
  // a deep link (or a reload) opens on its screen, with Home one Back away
  const start = screenFromHash();
  pg.cur = screensNow().includes(start) ? start : "home";
  if(pg.cur!=="home"){ history.replaceState(null, "", "#home"); history.pushState({chicho:1}, "", "#" + pg.cur); }
  else if(location.hash && location.hash!=="#home") history.replaceState(null, "", "#home");
  pg.x = LAYOUT[pg.cur][0]; pg.y = LAYOUT[pg.cur][1];
  renderHome();
  mountAround();
  unmountFar();
  applyCamera(pg.x, pg.y);
  scheduleTick();
  ["visibilitychange", "focus", "pageshow"].forEach(ev=>addEventListener(ev, ()=>{ if(!document.hidden) tick(); scheduleTick(); }));
  if(!state.profile.onboarded) openOnboarding();
  // offline: register the service worker once the page has settled (never on file://, never during tests)
  if("serviceWorker" in navigator && location.protocol.startsWith("http") && !/[?&]test\b/.test(location.search)){
    (window.requestIdleCallback || (f=>setTimeout(f, 1500)))(()=>navigator.serviceWorker.register("sw.js").then(()=>navigator.serviceWorker.ready).then(warmArt).catch(()=>{}));
  }
})();
/* after the first paint, quietly fetch this week's drawings at the sizes the screens use */
function warmArt(){
  const ids = new Set(HERO_FOODS);
  (state.plan ? state.plan.days : []).forEach(d=>d.meals.forEach(m=>m.items.forEach(i=>{ const f = foodOf(i.name); if(f) ids.add(f.id); })));
  const urls = [...ids].map(id=>FOOD_BY_ID[id]).filter(hasArt).flatMap(f=>[f.files.w64, f.files.w192]);
  let k = 0;
  const next = ()=>{ if(k >= urls.length) return; const batch = urls.slice(k, k += 6); Promise.all(batch.map(u=>fetch(u).catch(()=>{}))).then(()=>(window.requestIdleCallback || setTimeout)(next)); };
  next();
}
