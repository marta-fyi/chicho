/* ====================================================================
   CHICHO HOME: a lock screen that lives in the browser.
   Open it, read one line, close it. It answers one question (what does
   {name} eat next?); everything else waits for a tap or a scroll.
   Everything is a tap; nothing depends on hover. The only overlay is the
   sheet; a meal never opens one, it expands in place.
   ==================================================================== */
const $ = id=>document.getElementById(id);
const GROUPS = ["protein","vegetable","fruit","grain","fat"];
/* only touch the DOM when the words actually change (the clock ticks every minute) */
function setText(el, text){ if(el && el.textContent!==text) el.textContent = text; }
function hasPlan(){ return !!state.plan && state.plan.days.some(d=>d.meals.some(m=>m.items.length)); }
function milkOnly(){ return ageNow() < 6 && !state.profile.exploreEarly; }
function weekStart(){ const d = localDate(state.weekStarted); return isNaN(d) ? now() : d; }
/* the plan's seven days, from the day it started (not Monday): {pos, date, dayIdx} */
function weekDays(){
  const s = weekStart();
  return Array.from({length:7}, (_, pos)=>{ const date = new Date(s.getFullYear(), s.getMonth(), s.getDate() + pos); return {pos, date, dayIdx:planDayIndex(date)}; });
}
function weekDone(){ const s = weekStart(); return now() >= new Date(s.getFullYear(), s.getMonth(), s.getDate() + 7); }
const fmt = (o=>d=>new Intl.DateTimeFormat(undefined, o).format(d));
const fmtWeekday = fmt({weekday:"long"}), fmtShortDay = fmt({weekday:"short"}), fmtDayMonth = fmt({day:"numeric", month:"long"});
/* the top-right corner: "Thursday 22 Oct" over the time (the reader's own clock, no seconds) */
function fmtCornerDate(d){
  const parts = new Intl.DateTimeFormat(undefined, {weekday:"long", day:"numeric", month:"short"}).formatToParts(d);
  const part = t=>(parts.find(p=>p.type===t) || {}).value || "";
  return `${part("weekday")} ${part("day")} ${part("month").replace(/\.$/, "")}`;
}
/* the date a plan day (by its weekday name) falls on, from today */
function dateOfPlanDay(name){ return dateForDay(state.plan.days.findIndex(d=>d.name===name)); }

/* ---------- offered: "I put this in front of {name}" ---------- */
function foodRec(name){ const k = foodKey(baseName({name})); return state.foods[k] || (state.foods[k] = {}); }
/* offering a meal offers each food; a food carrying an allergen is introduced the
   first time it's offered (and un-introduced if that same offer is undone today) */
function offerMeal(m, on){
  const iso = todayISO();
  m.items.forEach(i=>{
    setOffered(i, on);
    if(!allergensOf(i.name).length) return;
    const r = foodRec(i.name);
    if(on && r.safety!=="introduced" && r.safety!=="keepout"){ r.safety = "introduced"; r.safetyOn = iso; r.firstOfferOn = iso; }
    if(!on && r.firstOfferOn===iso && !anyOfferedToday(i.name, m)){ r.safety = "notyet"; delete r.safetyOn; delete r.firstOfferOn; delete r.noReactionOn; }
  });
  if(on) m.offeredAt = now().toISOString(); else { delete m.offeredAt; delete m.outcome; }
}
function anyOfferedToday(name, except){
  const d = state.plan.days[planDayIndex(now())];
  return !!d && d.meals.some(m=>m!==except && m.items.some(i=>i.offered && i.name===name));
}
/* how it went: optional and equal; it's the food's preference, never its safety */
function setOutcome(m, v){
  m.outcome = m.outcome===v ? null : v;
  if(!m.outcome) delete m.outcome;
  if(m.outcome) m.items.forEach(i=>{ foodRec(i.name).preference = m.outcome; });
}
/* the foods of a group offered this week (variety counts every food offered at least once) */
function offeredFoods(cat){
  const out = new Set();
  state.plan.days.forEach(d=>d.meals.forEach(m=>m.items.forEach(i=>{ if(i.offered && i.cats[0]===cat) out.add(baseName(i)); })));
  return [...out];
}
/* allergens met before today: tried in onboarding, introduced on an earlier day, or offered earlier */
function allergensKnownBefore(iso){
  const P = state.profile, known = new Set(Object.entries(P.allergens || {}).filter(([,v])=>v==="ok").map(([k])=>k));
  Object.entries(state.foods || {}).forEach(([k, r])=>{ if(r && r.safety==="introduced" && r.safetyOn && r.safetyOn < iso) allergensOf(upper1(k)).forEach(a=>known.add(a)); });
  return known;
}
/* the common allergens meeting {name} for the first time today: [{id, label, foods}] */
function firstAllergensToday(){
  const iso = todayISO(), d = state.plan && state.plan.days[planDayIndex(now())];
  if(!d) return [];
  const known = allergensKnownBefore(iso), out = {};
  d.meals.forEach(m=>m.items.forEach(i=>allergensOf(i.name).forEach(a=>{
    if(known.has(a)) return;
    const al = ALLERGENS.find(x=>x.id===a);
    (out[a] = out[a] || {id:a, label:al ? al.label.split(" /")[0] : a, foods:[]}).foods.push(i);
  })));
  return Object.values(out);
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
function mealMinutes(m){ return Math.max(5, Math.max(0, ...m.items.map(i=>cookOf(i.name).min)) + 5); }
/* an ordinary new food (not a first allergen: those get the calm moment line) */
function newFoodIn(m){
  const firsts = new Set(firstAllergensToday().flatMap(a=>a.foods.map(f=>f.name)));
  return m.items.find(i=>isNewFood(i) && !firsts.has(i.name)) || null;
}

/* ---------- the moment line: one line, picked by the first rule that applies ---------- */
const QUIET_FROM_MIN = 21*60 + 30;   // after 21:30 only tomorrow's first meal, no actions
const LATE_QUESTIONS = ["mealTimes","priorities","kitchen","people"];
function momentLine(){
  const P = state.profile, t = now(), iso = todayISO(), name = P.name || "", st = stageNow(), months = ageNow();
  const later = state.moment && state.moment.date===iso ? state.moment.later || [] : [];
  const open = key=>!later.includes(key);
  const L = (key, text, actions, tone)=>({key, text, actions:actions || [], tone:tone || "plain"});
  const putAway = key=>()=>{ state.moment = {date:iso, later:later.concat(key)}; save(); homeChanged(); };
  if(months < 6 && !P.exploreEarly) return L("milk", say("moment.milk", {n:Math.max(1, 6 - months)}));
  const nx = nextMeal(), today = mealsOn(t);
  const tmFirst = mealsOn(tomorrowOf(t))[0];
  const minutes = t.getHours()*60 + t.getMinutes();
  if(minutes >= QUIET_FROM_MIN){
    if(!tmFirst) return L("quiet", "");
    const f = tmFirst.m.items.map(i=>lower1(baseName(i)));
    return L("quiet", f.length > 1 ? say("moment.quiet", {meal:tmFirst.m.label, food1:f[0], food2:f[1]}) : say("moment.quietOne", {meal:tmFirst.m.label, food1:f[0] || ""}));
  }
  if(st.solids && P.lastStage!==st.id && months===st.from && open("stage"))
    return L("stage", say("moment.stage", {name, months}), [[say("moment.stageUpdate"), setNextWeek], [say("moment.later"), putAway("stage")]]);
  const firsts = firstAllergensToday();
  if(firsts.length) return L("allergen:" + firsts[0].id, say("moment.allergen", {allergen:firsts[0].label, name}),
                              [[say("moment.allergenAction"), ()=>openSheet("allergen")]], "calm");
  const todayDay = state.plan && state.plan.days[planDayIndex(t)];
  if(!todayDay || !todayDay.meals.some(m=>m.items.length)) return L("noplan", say("moment.noPlan", {name}), [[say("moment.noPlanAction"), setNextWeek]]);
  if(weekDone()) return L("weekdone", say("moment.weekDone"), [[say("moment.weekNext"), setNextWeek]]);
  const list = shopList("next3"), n = list.length + state.extras.filter(x=>!x.checked).length;
  const names = dayDisplayOrder().slice(0, 2).map(i=>state.plan.days[i].name);
  const soon = list.some(x=>{ const s = shortfall(x.key).short; return s && names.includes(s); });
  const shopDay = P.shopDay!==undefined && P.shopDay!==null && t.getDay()===P.shopDay;
  if(n && (soon || shopDay) && t.getHours() < 19 && open("shop"))
    return L("shop", say("moment.shop", {n}), [[say("moment.shopAction"), ()=>sendGroceries()], [say("moment.later"), putAway("shop")]]);
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
  // a daily food tip from today's foods (the same all day)
  const food = todayDay.meals.flatMap(m=>m.items)[0];
  return L("tip", say("cook.tips", {name, food:food ? lower1(baseName(food)) : "food"}, "tip"));
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
  const weekOld = isoOf(new Date(localDate(P.firstDay).getFullYear(), localDate(P.firstDay).getMonth(), localDate(P.firstDay).getDate() + 7)) <= iso;
  const want = {mealTimes:!P.mealTimesConfirmed && stageNow().solids, priorities:weekOld && !(P.priorities || []).length,
                kitchen:shopList("next3").length > 0 && !Object.keys(state.stock || {}).length, people:!!A.shared && !P.people.length};
  const q = LATE_QUESTIONS.find(k=>want[k] && !A[k]);
  if(!q) return null;
  state.asked = Object.assign({}, A, {day:iso, today:q});
  save();
  return q;
}
function markAsked(q, answered){ state.asked = Object.assign({}, state.asked, answered ? {[q]:todayISO()} : {}); save(); }
function answerLate(q){
  markAsked(q, true);
  if(q==="mealTimes") openOnboarding("mealtimes", {single:true});
  else if(q==="priorities") openOnboarding("priorities", {single:true});
  else if(q==="kitchen") openOnboarding("athome", {single:true});
  else openSheet("people");
}

/* ---------- "While you're at it": cook ahead, using only foods already in the plan ----------
   Pure: reads only its arguments (and the stage table), so it can never suggest
   anything the generator didn't already pass through the safety rules. */
const LEAD = {defrost:8, soak:8};   // hours a lead-time step needs before the meal
const SALT_MAX_SHOWINGS = 3;
const COOK_AHEAD_METHODS = ["steam","roast","boil"];
const LEGUMES = ["lentils","chickpeas"];
function planMealsBetween(plan, profile, from, to){
  const out = [];
  for(let d = new Date(from.getFullYear(), from.getMonth(), from.getDate()); d <= to; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)){
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
  const S = seen || {}, done = new Set(S.done || []), out = [];
  // two lines about the same food would repeat each other (the salt line is about the meal, not a food)
  const add = s=>{ if(out.length < 2 && !done.has(s.id) && (s.kind==="salt" || !out.some(o=>o.food===s.food && o.kind!=="salt"))) out.push(s); };
  const ref = meal, m = ref.m, months = ageMonths(profile.birthDate, nowD) || 0;
  const name = profile.name || "";
  const ahead = (h)=>planMealsBetween(plan, profile, ref.start, new Date(ref.start.getTime() + h*3600000)).filter(x=>!(x.dayIdx===ref.dayIdx && x.k===ref.k) && !x.m.items.every(i=>i.offered));
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
  // 2. a shared ingredient: cook it double now, it comes back within 48 hours
  const next48 = ahead(48);
  m.items.forEach(i=>{
    const c = cookOf(i.name);
    if(!COOK_AHEAD_METHODS.includes(c.method)) return;
    const again = next48.find(x=>x.m.items.some(j=>j.name===i.name));
    if(!again) return;
    const j = again.m.items.find(z=>z.name===i.name);
    add({id:`double:${i.name}:${isoOf(again.date)}:${again.k}`, kind:"double", food:i.name, target:{dayIdx:again.dayIdx, k:again.k},
         text:say("also.double", {verb:say("also.verb." + c.method), meal:label(again), when:whenWord(again.start, nowD), amount:j.qty || ""}).replace(" (another )", "")});
  });
  // 3. the same appliance: the oven or steamer is on, and another meal within 24 hours needs it
  const next24 = ahead(24);
  ["roast","steam"].forEach(method=>{
    if(!m.items.some(i=>cookOf(i.name).method===method)) return;
    next24.forEach(x=>x.m.items.forEach(j=>{
      if(cookOf(j.name).method!==method || m.items.some(i=>i.name===j.name)) return;
      add({id:`${method}:${j.name}:${isoOf(x.date)}:${x.k}`, kind:method==="roast" ? "oven" : "steamer", food:j.name, target:{dayIdx:x.dayIdx, k:x.k},
           text:say(method==="roast" ? "also.oven" : "also.steamer", {food:lower1(baseName(j)), meal:label(x), when:whenWord(x.start, nowD)})});
    }));
  });
  // 4. batch and freeze: a freezable food used two or more times this week
  m.items.forEach(i=>{
    if(!metaOf(i.name).freezes) return;
    const uses = plan.days.reduce((n, d)=>n + d.meals.reduce((k, x)=>k + x.items.filter(j=>j.name===i.name).length, 0), 0);
    if(uses >= 2) add({id:`freeze:${i.name}:${isoOf(nowD)}`, kind:"freeze", food:i.name, target:null, note:say("storage"),
                       text:say("also.freeze", {food:lower1(baseName(i))})});
  });
  // 5. family meals: from 12 months, at lunch and dinner, a few times
  if(months >= 12 && ["lunch","dinner"].includes(m.slot) && (S.salt || 0) < SALT_MAX_SHOWINGS)
    add({id:`salt:${isoOf(nowD)}`, kind:"salt", food:m.items[0] ? m.items[0].name : "", target:null, text:say("also.salt", {name})});
  return out;
}

/* ---------- the home ---------- */
let homeKey = null, momentKey = null, picked = null, firstDraw = true, layoutSig = "";
const undoUntil = {};    // meal key → ms when its "Offered · Undo" window ends
const outcomeUntil = {}; // meal key → ms when its outcome row fades away (nothing waits for an answer)
let OUTCOME_MS = 10000;  // how long "Loved it · Ate some · Not today" stays if ignored
const OUTCOME_AFTER_MS = 1600;   // …and after an answer, long enough to see it taken
const outcomeRisen = new Set();
const changeUndo = {};   // food id → {until, old, m, at}
const openFood = new Set();
function refsOn(date){ return mealsOn(date).map(x=>Object.assign(x, {date, key:isoOf(date) + "|" + x.k})); }
/* the meal that's open by default: the now meal, otherwise the next */
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
function homeChanged(){ layoutSig = ""; renderHome(); refreshSheetView(); }
function renderHome(){
  if(!$("home") || SNAPSHOT) return;
  const P = state.profile, st = stageNow(), t = now();
  if(P.lastStage===null || P.lastStage===undefined){ P.lastStage = st.id; save(); }
  lastISO = todayISO();
  if(picked && t >= picked.until) picked = null;
  setText($("whoAge"), P.birthDate ? ageLabel(ageNow()) : "");
  setText($("whoName"), P.name || say("home.profile"));
  $("profileBtn").setAttribute("aria-label", say("home.profile") + (P.name ? ": " + P.name + (P.birthDate ? ", " + ageLabel(ageNow()) : "") : ""));
  setText($("clockDate"), fmtCornerDate(view.day ? tomorrowOf(t) : t));
  $("whenBtn").setAttribute("aria-pressed", String(view.day===1));
  $("whenBtn").setAttribute("aria-label", say(view.day ? "home.view.backToday" : "home.view.showTomorrow"));
  setText($("clock"), fmtTime(t));
  $("clock").setAttribute("datetime", t.toISOString());
  renderCaptions(st);
  $("home").classList.toggle("is-cooking", cook.active);
  $("cook").hidden = !cook.active;
  if(cook.active){ document.documentElement.classList.add("glow-dim"); renderCook(); updateChrome(); return; }
  const calmState = milkOnly(), empty = !calmState && !hasPlan();
  $("home").classList.toggle("is-milk", calmState);
  $("home").classList.toggle("is-empty", empty);
  renderHeadline();
  renderMomentLine();
  try{ renderMeals(); }catch(e){ setGlow(null); throw e; }
  if(calmState || empty) setGlow(null);   // no plan, or under 6 months: the default glow
  document.documentElement.classList.toggle("glow-dim", t.getHours()*60 + t.getMinutes() >= QUIET_FROM_MIN);
  cookTick();
  renderWeek();
  renderShopLine();
  updateChrome();
  if(firstDraw){ firstDraw = false; entrance(); try{ performance.mark("chicho:home"); }catch(e){} }   // the first meaningful paint (tools/devices.mjs)
}
/* ---------- looking ahead: scrub through the day, or the whole of tomorrow ----------
   view.day 1 re-skins the page to tomorrow's plan (tap or swipe the date); view.idx is a meal of that day
   scrubbed to by swiping the headline sideways. Headline, open meal and glow follow; "Back to now" / "Back to
   today" return, and so does the next meal boundary on its own. */
const view = {day:0, idx:null, until:0};
function viewActive(){ return view.day===1 || view.idx!==null; }
function viewList(){ const t = now(); return milkOnly() ? [] : refsOn(view.day ? tomorrowOf(t) : t); }
function viewRef(){
  if(!viewActive()) return null;
  const list = viewList();
  if(!list.length) return null;
  return list[Math.max(0, Math.min(list.length - 1, view.idx===null ? 0 : view.idx))];
}
function setView(day, idx){
  view.day = day; view.idx = idx;
  view.until = viewActive() ? nextBoundary(refsOn(now())).getTime() : 0;
  picked = null; changing = null;
  haptic(); homeChanged();
  if(!calm()) $("openMeal").animate([{opacity:0}, {opacity:1}], {duration:260, easing:"ease-out"});
}
function backToNow(){ setView(0, null); focusLater("top:me"); }
/* one sideways swipe on an element (not from the screen's edges, not a vertical drag) */
function onSwipe(el, fn){
  let x0 = null, y0 = 0;
  el.addEventListener("pointerdown", e=>{ if(e.pointerType==="mouse" || e.clientX < SWIPE_EDGE || e.clientX > innerWidth - SWIPE_EDGE) return; x0 = e.clientX; y0 = e.clientY; });
  const up = e=>{ if(x0===null) return; const dx = e.clientX - x0, dy = e.clientY - y0; x0 = null; if(Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5){ el.dataset.swiped = "1"; fn(dx < 0 ? "left" : "right"); } };
  el.addEventListener("pointerup", up); el.addEventListener("pointercancel", ()=>{ x0 = null; });
  el.addEventListener("click", e=>{ if(el.dataset.swiped){ delete el.dataset.swiped; e.stopImmediatePropagation(); e.preventDefault(); } }, true);
}
function scrub(dir){
  const list = viewList(), t = now();
  if(!list.length) return;
  let at = view.idx;
  if(at===null){ const def = view.day ? list[0] : defaultOpen(list, refsOn(tomorrowOf(t))); at = list.indexOf(def); if(at < 0) at = list.length; }
  const to = at + (dir==="left" ? 1 : -1);
  if(to < 0 || to >= list.length) return;
  setView(view.day, to);
}
function renderHeadline(){
  const v = viewRef();
  const h = v ? {key:`view:${view.day}:${v.key}`, headline:say(view.day ? "home.headline.tomorrow" : "home.headline.at", {meal:v.m.label, time:fmtTime(v.start)}), title:currentTitle || "Chicho"} : headlineNow();
  const el = $("headline");
  const changed = homeKey!==null && homeKey!==h.key;
  if(changed && !calm()){
    el.animate([{opacity:1}, {opacity:0}], {duration:140, fill:"forwards"}).onfinish = function(){ setText(el, h.headline); this.cancel(); el.animate([{opacity:0, transform:"translateY(6px)"}, {opacity:1, transform:"none"}], {duration:280, easing:"cubic-bezier(.2,.8,.2,1)"}); };
  }else setText(el, h.headline);
  if(changed && h.announce) announce(h.announce);
  homeKey = h.key;
  currentTitle = h.title;
}
function renderMomentLine(){
  const m = viewActive() ? (view.day ? {key:"view:tomorrow", text:say("home.view.tomorrow") + " ·", actions:[[say("home.view.backToday"), backToNow]], tone:"plain"}
                                     : {key:"view:scrub", text:"", actions:[[say("home.view.backNow"), backToNow]], tone:"plain"}) : momentLine();
  const el = $("moment");
  const sig = m.key + "|" + m.text;
  if(sig===momentKey) return;
  momentKey = sig;
  el.innerHTML = "";
  el.classList.toggle("calm-tone", m.tone==="calm");
  el.append(m.text);
  m.actions.slice(0, 1).forEach(([label, fn])=>{ el.append(" "); el.appendChild(textBtn(label, fn, "inline")); });
  // a second action (Later) is a quieter word after the first
  m.actions.slice(1, 2).forEach(([label, fn])=>{ el.append(" "); el.appendChild(textBtn(label, fn, "inline quiet")); });
}
function textBtn(label, fn, cls){
  const b = document.createElement("button");
  b.type = "button"; b.className = "btn-text" + (cls ? " " + cls : ""); b.textContent = label;
  b.addEventListener("click", fn);
  return b;
}

/* ---------- meals: one object, opened in place; one open at a time ---------- */
function renderMeals(){
  const t = now(), today = milkOnly() ? [] : refsOn(t), tm = milkOnly() ? [] : refsOn(tomorrowOf(t));
  const vr = viewRef();
  const def = vr || defaultOpen(today, tm);
  const all = today.concat(tm);
  if(picked && !all.some(x=>x.key===picked.key)) picked = null;
  const openKey = picked ? picked.key : def ? def.key : null;
  let earlier, upNext, nextLabel;
  if(vr && view.day){
    earlier = []; upNext = tm.filter(x=>x.key!==def.key); nextLabel = say("home.tomorrow");
  }else if(def && today.includes(def)){
    earlier = today.filter(x=>x.start < def.start);
    upNext = today.filter(x=>x.start > def.start);
    nextLabel = say("home.upNext");
    if(!upNext.length){ upNext = tm; nextLabel = say("home.tomorrow"); }
  }else{
    earlier = today;
    upNext = tm.filter(x=>!def || x.key!==def.key);
    nextLabel = say("home.tomorrow");
  }
  const sig = [openKey, def && def.key, ...all.map(x=>x.key + x.status + x.time + x.m.items.map(i=>i.id + (i.offered ? 1 : 0)).join(",") + (x.m.outcome || "") + (x.m.prepped || []).join(",") + (undoUntil[x.key] > Date.now() ? "u" : "") + (outcomeUntil[x.key] > Date.now() ? "o" : ""))].join("|")
            + "|" + [...openFood].join(",") + "|" + Object.keys(changeUndo).join(",") + "|" + Object.keys(addUndo).join(",") + "|" + wake.on + "|" + (changing ? changing.id + ":" + changing.i : "") + "|v" + view.day + ":" + view.idx;
  if(sig===layoutSig) return;
  const focus = focusMemo();
  layoutSig = sig;
  const slot = $("openMeal");
  slot.innerHTML = "";
  if(def) slot.appendChild(mealView(def, def.key===openKey, true));
  fillList($("earlierList"), earlier, openKey);
  fillList($("nextList"), upNext, openKey);
  $("earlierSec").hidden = !earlier.length;
  $("nextSec").hidden = !upNext.length;
  setText($("nextLabel"), nextLabel);
  renderAlso(def);
  focusRestore(focus);
  const open = all.find(x=>x.key===openKey) || def;
  setGlow(open && open.m.items[0] ? open.m.items[0].cats[0] : null);
}
/* the poster's bottom corners: the stage (name over its line), and the glow's food group in words */
function renderCaptions(st){
  setText($("capStage"), st.name);
  setText($("capLine"), st.solids ? `${st.meals} · ${st.caption || st.textureShort}` : st.meals);
}
/* ---------- the glow follows the open meal ---------- */
let glowKey = null;
function setGlow(cat){
  const group = glowGroup(cat);
  if(group===glowKey) return;
  const layers = [...document.querySelectorAll(".glow-l")];
  if(!layers.length) return;
  const on = layers.find(l=>l.classList.contains("is-on")) || layers[0], off = layers.find(l=>l!==on);
  if(glowKey===null) on.style.backgroundImage = glowGradient(GLOW[group].hex);
  else { off.style.backgroundImage = glowGradient(GLOW[group].hex); off.classList.add("is-on"); on.classList.remove("is-on"); }
  glowKey = group;
  document.documentElement.dataset.glow = group;
  setText($("capGlow"), say("home.groups." + group));
}
/* one soft pulse when a meal is offered: that's the whole reward */
function pulseGlow(){
  const p = $("glowPulse");
  if(p && !calm() && document.documentElement.dataset.theme==="light") p.animate([{transform:"scale(1)"}, {transform:"scale(1.05)"}, {transform:"scale(1)"}], {duration:700, easing:"ease-in-out"});
}
function fillList(list, refs, openKey){ list.innerHTML = ""; refs.forEach(x=>list.appendChild(mealView(x, x.key===openKey, false))); }
/* keep focus on the same control across a redraw (by its data-f key) */
function focusMemo(){ const a = document.activeElement; return a && a.dataset && a.dataset.f ? a.dataset.f : null; }
function focusRestore(k){ if(!k) return; const el = document.querySelector(`[data-f="${CSS.escape(k)}"]`); if(el) el.focus({preventScroll:true}); }
function mealView(x, expanded, isDefault){ return expanded ? mealOpen(x, isDefault) : mealRow(x); }
function whenLabel(x){
  const tomorrow = isoOf(x.date)!==todayISO();
  return say(tomorrow ? "home.tomorrowWhen" : "home.rowWhen", {meal:x.m.label, time:fmtTime(x.start)});
}
/* the offered ring: on every meal, always visible, a 44px target; the check sits under a wipe that slides off */
const RING = `<i aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M6 12.5l4 4 8-9"/><rect class="wipe" x="4" y="5" width="16" height="14"/></svg></i>`;
function ringBtn(x, f){
  const on = mealOffered(x.m);
  const b = document.createElement("button");
  b.type = "button"; b.className = "ring-btn"; b.dataset.f = f;
  b.setAttribute("aria-pressed", String(on));
  b.setAttribute("aria-label", on ? say("meal.ringOn", {meal:x.m.label}) : say("meal.ringOff", {meal:x.m.label}));
  b.innerHTML = RING;
  b.addEventListener("click", e=>{ e.stopPropagation(); toggleOffered(x); });
  return b;
}
function toggleOffered(x, fromPill){
  const on = !mealOffered(x.m);
  // offered from its own pill, the meal stays open (Undo, then how it went) until the next boundary
  if(on && fromPill) picked = {key:x.key, until:nextBoundary(refsOn(now()))};
  offerMeal(x.m, on); save(); haptic();
  if(on){ pulseGlow(); undoUntil[x.key] = Date.now() + 5000; showOutcome(x.key, OUTCOME_MS); setTimeout(()=>{ homeChanged(); }, 5050); announce(say("home.announce.offered", {meal:x.m.label})); }
  else { delete undoUntil[x.key]; delete outcomeUntil[x.key]; outcomeRisen.delete(x.key); announce(say("home.announce.unoffered", {meal:x.m.label})); }
  homeChanged();
}
/* ---------- how it went, in the same motion ----------
   Ticking a meal (pill, ring or swipe) brings the outcome row up inline; it fades away on its own if ignored,
   and soon after an answer. Optional and equal, and nothing waits for it. */
function showOutcome(key, ms){
  outcomeUntil[key] = Date.now() + ms;
  clearTimeout(showOutcome[key]);
  showOutcome[key] = setTimeout(()=>{
    const el = document.querySelector(`.outcomes[data-key="${CSS.escape(key)}"]`);
    const done = ()=>{ delete outcomeUntil[key]; outcomeRisen.delete(key); homeChanged(); };
    if(el && !calm()) el.animate([{opacity:1}, {opacity:0, transform:"translateY(-4px)"}], {duration:400, easing:"ease-in", fill:"forwards"}).onfinish = done;
    else done();
  }, ms);
}
function outcomeRow(x){
  const m = x.m, g = document.createElement("div");
  g.className = "outcomes"; g.dataset.key = x.key; g.setAttribute("role", "group"); g.setAttribute("aria-label", say("meal.outcomeLabel"));
  ["loved","some","nottoday"].forEach(v=>{
    const ob = document.createElement("button");
    ob.type = "button"; ob.className = "outcome"; ob.dataset.f = `out:${x.key}:${v}`;
    ob.setAttribute("aria-pressed", String(m.outcome===v));
    ob.textContent = say("meal.outcome." + v);
    ob.addEventListener("click", ()=>{ setOutcome(m, v); save(); haptic(); showOutcome(x.key, OUTCOME_AFTER_MS); homeChanged(); });
    g.appendChild(ob);
  });
  // it rises once, when it first appears
  if(!outcomeRisen.has(x.key)){ outcomeRisen.add(x.key); if(!calm()) requestAnimationFrame(()=>g.animate([{opacity:0, transform:"translateY(8px)"}, {opacity:1, transform:"none"}], {duration:260, easing:"cubic-bezier(.2,.8,.2,1)"})); }
  return g;
}
/* a compact row: bullet, "{Meal} · around {time}", its ring; a tap opens it in place */
function mealRow(x){
  const row = document.createElement("div");
  row.className = "mrow" + (x.status==="earlier" ? " is-earlier" : "") + (mealOffered(x.m) ? " is-offered" : "");
  row.dataset.key = x.key;
  const b = document.createElement("button");
  b.type = "button"; b.className = "mrow-btn"; b.dataset.f = "row:" + x.key;
  b.setAttribute("aria-expanded", "false"); b.setAttribute("aria-controls", "mx-" + cssId(x.key));
  const prepped = (x.m.prepped || [])[0];
  b.innerHTML = `${foodArt(x.m.items[0].name, {size:24, lazy:true})}<span class="mrow-t">${esc(whenLabel(x))}${prepped ? `<span class="mrow-sub">${esc(say("home.prepped", {food:baseName({name:prepped})}))}</span>` : ""}</span>`;
  b.addEventListener("click", ()=>{ picked = {key:x.key, until:nextBoundary(refsOn(now()))}; homeChanged(); focusLater("title:" + x.key); });
  row.appendChild(b);
  row.appendChild(ringBtn(x, "ring:" + x.key));
  if(undoUntil[x.key] > Date.now()) row.appendChild(undoLine(x));
  if(mealOffered(x.m) && outcomeUntil[x.key] > Date.now()) row.appendChild(outcomeRow(x));
  swipeRow(row, b, x);
  return row;
}
/* Swipe a row: right marks it offered (the undo line follows), left opens it on Change for its main food.
   A shortcut, never the only way: the ring and the row's tap stay. A swipe that starts within 24px of either
   screen edge is left to the browser (Safari's back swipe); vertical drags stay the page's scroll. */
const SWIPE_EDGE = 24, SWIPE_AT = 72;
function swipeRow(row, b, x){
  let x0 = null, y0 = 0, dx = 0, sideways = false, id = null;
  const hint = document.createElement("span");
  hint.className = "swipe-hint"; hint.setAttribute("aria-hidden", "true");
  row.prepend(hint);
  const end = ()=>{
    if(x0===null) return;
    x0 = null;
    b.style.transform = ""; hint.style.opacity = "";
    if(!sideways) return;
    if(dx > SWIPE_AT && !mealOffered(x.m)) toggleOffered(x);
    else if(dx < -SWIPE_AT && x.m.items[0]){ picked = {key:x.key, until:nextBoundary(refsOn(now()))}; openFood.add(x.m.items[0].id); changing = {id:x.m.items[0].id, i:0}; haptic(); homeChanged(); focusLater("keep:" + x.m.items[0].id); }
    else if(!calm()) b.animate([{transform:`translateX(${dx}px)`}, {transform:"none"}], {duration:180, easing:"ease-out"});
  };
  b.addEventListener("pointerdown", e=>{
    if(e.pointerType==="mouse" || e.clientX < SWIPE_EDGE || e.clientX > innerWidth - SWIPE_EDGE) return;
    x0 = e.clientX; y0 = e.clientY; dx = 0; sideways = false; id = e.pointerId;
  });
  b.addEventListener("pointermove", e=>{
    if(x0===null || e.pointerId!==id) return;
    dx = e.clientX - x0;
    if(!sideways){ if(Math.abs(e.clientY - y0) > 10){ x0 = null; return; } if(Math.abs(dx) < 10) return; sideways = true; b.setPointerCapture(id); }
    const d = Math.max(-120, Math.min(120, dx));
    b.style.transform = `translateX(${d}px)`;
    hint.textContent = d > 0 ? say("meal.offered") : say("meal.change");
    hint.dataset.side = d > 0 ? "left" : "right";
    hint.style.opacity = String(Math.min(1, Math.abs(d) / SWIPE_AT));
  });
  b.addEventListener("pointerup", end); b.addEventListener("pointercancel", end);
  // a finished swipe isn't also a tap
  b.addEventListener("click", e=>{ if(sideways){ e.stopImmediatePropagation(); e.preventDefault(); sideways = false; } }, true);
}
function cssId(k){ return k.replace(/[^a-z0-9]/gi, "-"); }
function focusLater(f){ requestAnimationFrame(()=>{ const el = document.querySelector(`[data-f="${CSS.escape(f)}"]`); if(el) el.focus({preventScroll:true}); }); }
function undoLine(x){
  const p = document.createElement("p");
  p.className = "undo-line";
  p.append(say("meal.offered") + " · ");
  const u = textBtn(say("meal.undo"), ()=>{ delete undoUntil[x.key]; offerMeal(x.m, false); save(); announce(say("home.announce.unoffered", {meal:x.m.label})); homeChanged(); }, "inline");
  u.dataset.f = "undo:" + x.key;
  p.appendChild(u);
  return p;
}
/* the open meal: title, meta, a row per food (expanding to its tip, Change and why), how, Offered */
function mealOpen(x, isDefault){
  const m = x.m, st = stageFor(planMonths());
  const a = document.createElement("article");
  a.className = "mx"; a.id = "mx-" + cssId(x.key); a.dataset.key = x.key;
  const head = document.createElement("div");
  head.className = "mx-head";
  const title = document.createElement(isDefault ? "h2" : "button");
  title.className = "mx-title";
  title.dataset.f = "title:" + x.key;
  title.textContent = isoOf(x.date)===todayISO() || view.day ? m.label : say("home.tomorrowWhen", {meal:m.label, time:fmtTime(x.start)}).split(" · ")[0];
  if(!isDefault){
    title.type = "button"; title.setAttribute("aria-expanded", "true"); title.setAttribute("aria-controls", a.id);
    title.addEventListener("click", ()=>{ picked = null; homeChanged(); });
  }else title.tabIndex = -1;
  head.appendChild(title);
  if(!isDefault || x.status==="earlier") head.appendChild(ringBtn(x, "ring:" + x.key));
  else if(wakeSupported() && !view.day) head.appendChild(wakeToggle());   // the open meal's head has room: cooking happens here
  a.appendChild(head);
  const fresh = newFoodIn(m);
  const meta = document.createElement("p");
  meta.className = "mx-meta";
  meta.textContent = say("home.around", {time:fmtTime(x.start)}) + " · " + say("meal.meta", {n:mealMinutes(m), texture:st.textureShort || textureOf(m.items[0])})
                   + (fresh ? " · " + say("meal.newToday", {food:lower1(baseName(fresh))}) : "");
  a.appendChild(meta);
  const ul = document.createElement("ul"), rest = document.createElement("ul");
  ul.className = rest.className = "mx-foods";
  m.items.forEach((item, k)=>{
    const li = document.createElement("li");
    const id = "fr-" + item.id, isOpen = openFood.has(item.id) || addUndo[item.id] && addUndo[item.id].until > Date.now();
    const b = document.createElement("button");
    b.type = "button"; b.className = "fr"; b.dataset.f = "fr:" + item.id;
    b.setAttribute("aria-expanded", String(isOpen)); b.setAttribute("aria-controls", id);
    b.innerHTML = `${foodArt(item.name, {size:28})}<span class="fr-text"><span class="fr-name">${esc(baseName(item))}</span><span class="fr-sub">${esc(say("meal.amount", {amount:item.qty || "", texture:textureOf(item)}).replace(/^ · /, ""))}</span></span><i class="chev" aria-hidden="true"></i>`;
    b.addEventListener("click", ()=>{ isOpen ? openFood.delete(item.id) : openFood.add(item.id); homeChanged(); });
    li.appendChild(b);
    const more = document.createElement("div");
    more.className = "fr-more"; more.id = id; more.hidden = !isOpen;
    if(isOpen){
      const tip = prepTip(item);
      if(tip) more.insertAdjacentHTML("beforeend", `<p class="fr-tip">${esc(tip)}</p>`);
      const why = whyFor(item);
      if(why) more.insertAdjacentHTML("beforeend", `<p class="fr-why">${esc(say("meal.why", {why:lower1(why)}))}</p>`);
      const au = addUndo[item.id];
      if(au && au.until > Date.now()){
        const p = document.createElement("p");
        p.className = "undo-line";
        p.append(say("meal.added", {food:baseName(item)}) + " ");
        p.appendChild(textBtn(say("meal.undo"), ()=>{ const j = m.items.indexOf(item); if(j >= 0){ setOffered(item, false); m.items.splice(j, 1); } delete addUndo[item.id]; save(); homeChanged(); focusLater("add:" + x.key); }, "inline"));
        more.appendChild(p);
      }
      const cu = changeUndo[item.id];
      if(cu && cu.until > Date.now()){
        const p = document.createElement("p");
        p.className = "undo-line";
        p.append(say("meal.changed", {food:lower1(baseName(item))}) + " ");
        p.appendChild(textBtn(say("meal.undo"), ()=>{ const j = m.items.indexOf(item); if(j >= 0){ if(item.offered) setOffered(item, false); m.items[j] = cu.old; openFood.delete(item.id); openFood.add(cu.old.id); } delete changeUndo[item.id]; save(); homeChanged(); }, "inline"));
        more.appendChild(p);
      }else if(changing && changing.id===item.id){
        // one alternative at a time: Another cycles it (a crossfade), Keep takes it
        const opts = alternatives(m, k, 8);
        const box = document.createElement("div");
        box.className = "fr-alts";
        if(!opts.length){ box.textContent = say("meal.noChange"); more.appendChild(box); }
        else{
          const f = opts[changing.i % opts.length];
          const card = document.createElement("p");
          card.className = "alt-card"; card.setAttribute("aria-live", "polite");
          card.innerHTML = `${foodArt(f.name, {size:28})}<span>${esc(f.name.split(",")[0])}</span>`;
          box.appendChild(card);
          const acts = document.createElement("div");
          acts.className = "alt-acts";
          if(opts.length > 1){
            const another = textBtn(say("meal.another"), ()=>{ changing.i++; changing.fade = true; homeChanged(); focusLater("another:" + item.id); }, "small");
            another.dataset.f = "another:" + item.id;
            acts.appendChild(another);
          }
          const keep = textBtn(say("meal.keep"), ()=>{
            const at = m.items.indexOf(item), old = item;
            if(old.offered) setOffered(old, false);
            const fresh_ = dish(f, st);
            if(old.offered) setOffered(fresh_, true);
            m.items[at] = fresh_;
            openFood.delete(old.id); openFood.add(fresh_.id); changing = null;
            changeUndo[fresh_.id] = {until:Date.now() + 5000, old};
            setTimeout(()=>{ delete changeUndo[fresh_.id]; homeChanged(); }, 5050);
            save(); haptic(); homeChanged(); focusLater("fr:" + fresh_.id);
            announce(say("meal.changed", {food:lower1(f.name.split(",")[0])}));
          }, "small");
          keep.dataset.f = "keep:" + item.id;
          acts.appendChild(keep);
          box.appendChild(acts);
          more.appendChild(box);
          if(changing.fade && !calm()){ changing.fade = false; card.animate([{opacity:0, transform:"translateY(4px)"}, {opacity:1, transform:"none"}], {duration:220, easing:"ease-out"}); }
        }
      }else{
        const c = textBtn(say("meal.change"), ()=>{ changing = {id:item.id, i:0}; homeChanged(); focusLater("keep:" + item.id); }, "small");
        c.dataset.f = "change:" + item.id;
        c.setAttribute("aria-label", say("meal.changeTo", {food:baseName(item)}));
        more.appendChild(c);
      }
    }
    li.appendChild(more);
    (k < 2 ? ul : rest).appendChild(li);
  });
  a.appendChild(ul);
  // the pill sticks inside a zone that starts after the first two foods, so stuck at the bottom edge it can
  // never cover the meal's title or its first two rows, at any screen height
  const zone = document.createElement("div");
  zone.className = "mx-zone";
  if(rest.children.length) zone.appendChild(rest);
  a.appendChild(zone);
  const how = mealHow(m);
  if(how.length) zone.insertAdjacentHTML("beforeend", `<p class="mx-how">${how.map(esc).join(" ")}</p>`);
  // Mark as offered → "Offered · Undo" for 5 s → "Offered" + how it went
  const acts = document.createElement("div");
  acts.className = "mx-acts";
  const on = mealOffered(m), undo = undoUntil[x.key] > Date.now();
  const pill = document.createElement("button");
  pill.type = "button"; pill.className = "offer-pill"; pill.dataset.f = "offer:" + x.key;
  pill.setAttribute("aria-pressed", String(on));
  pill.innerHTML = on ? `<i aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M6 12.5l4 4 8-9"/></svg></i>${esc(say("meal.offered"))}` : esc(say("meal.offer"));
  pill.addEventListener("click", ()=>toggleOffered(x, true));
  acts.appendChild(pill);
  if(on && undo){
    const u = textBtn(say("meal.undo"), ()=>{ delete undoUntil[x.key]; offerMeal(m, false); save(); announce(say("home.announce.unoffered", {meal:m.label})); homeChanged(); focusLater("offer:" + x.key); }, "undo");
    u.dataset.f = "undo:" + x.key;
    acts.appendChild(u);
  }
  zone.appendChild(acts);
  if(on && outcomeUntil[x.key] > Date.now()) a.appendChild(outcomeRow(x));
  const links = document.createElement("p");
  links.className = "mx-links";
  if(addingTo===x.key){
    // one field; suggestions follow what's typed ("ban" → Banana), each with its bullet; one tap adds it, offered
    const add = v=>{
      addingTo = null;
      if(v){
        const pool = FOOD_POOL.find(f=>foodOf(f.name) && foodOf(f.name)===foodOf(v)) || FOOD_POOL.find(f=>f.name===v);
        const item = it(pool ? pool.name : upper1(v), pool ? portionFor(pool, st) : "", pool ? pool.cats.slice() : ["other"], pool ? textureFor(pool, st) : undefined);
        if(lockedRule(item.name, ageNow()) || allergyMatch(item.name, state.profile)){ announce(keepOutReason(item.name)); homeChanged(); return; }
        m.items.push(item);
        setOffered(item, true);   // what's added was offered: that's why it's being added
        addUndo[item.id] = {until:Date.now() + 5000, key:x.key};
        setTimeout(()=>{ delete addUndo[item.id]; homeChanged(); }, 5050);
        save(); haptic(); announce(say("meal.added", {food:baseName(item)}));
      }
      homeChanged(); focusLater("add:" + x.key);
    };
    const list = document.createElement("div");
    list.className = "suggest-list"; list.setAttribute("aria-live", "polite");
    const fill = q=>{
      list.innerHTML = "";
      suggestFoods(q, m).forEach(f=>{
        const sb = document.createElement("button");
        sb.type = "button"; sb.className = "alt"; sb.dataset.f = "sug:" + f.name;
        sb.innerHTML = `${foodArt(f.name, {size:24})}<span>${esc(f.name.split(",")[0])}</span>`;
        sb.addEventListener("click", ()=>add(f.name));
        list.appendChild(sb);
      });
    };
    const b = blank({min:8, maxLength:30, onInput:fill, onEnter:()=>{ const first = list.querySelector("button"); add(first && b.input.value.trim().length >= 2 ? first.dataset.f.slice(4) : b.input.value.trim()); }});
    b.input.dataset.f = "adding:" + x.key;
    b.input.addEventListener("keydown", e=>{ if(e.key==="Escape"){ e.preventDefault(); e.stopPropagation(); addingTo = null; homeChanged(); focusLater("add:" + x.key); } });
    const parts = say("meal.alsoOffered").split("{blank}");
    const l = document.createElement("label"); l.htmlFor = b.input.id; l.textContent = parts[0].trim();
    links.append(l, " ", b.el, list);
    requestAnimationFrame(()=>b.input.focus());
  }else{
    const add = textBtn(say("meal.addOther"), ()=>{ addingTo = x.key; homeChanged(); }, "small");
    add.dataset.f = "add:" + x.key;
    links.appendChild(add);
    links.append(" ");
    const sd = textBtn(say("meal.send"), ()=>openSheet("send", {date:x.date}), "small");
    sd.dataset.f = "send:" + x.key;
    links.appendChild(sd);
    if(isoOf(x.date)===todayISO() && !view.day){ const ck = textBtn(say("cookMode.start"), ()=>startCooking(x), "small"); ck.dataset.f = "cook:" + x.key; links.appendChild(ck); }

  }
  a.appendChild(links);
  // arrow keys move through the open meal's controls
  a.addEventListener("keydown", e=>{
    if(e.key!=="ArrowDown" && e.key!=="ArrowUp") return;
    if(e.target.tagName==="INPUT") return;
    const els = [...a.querySelectorAll("button:not([disabled]), input")].filter(z=>z.offsetParent);
    const i = els.indexOf(document.activeElement);
    if(i < 0) return;
    e.preventDefault();
    const j = Math.max(0, Math.min(els.length - 1, i + (e.key==="ArrowDown" ? 1 : -1)));
    els[j].focus();
  });
  return a;
}
let addingTo = null, changing = null;
const addUndo = {};   // food id → {until, key}: "Banana added. Undo" for 5 seconds
/* foods that match what's typed, safe for {name} (the generator's gate, allergies out), not already in the meal:
   names and aliases that start with it first, drawn ones first, at most four */
function suggestFoods(q, m){
  const t = String(q || "").trim().toLowerCase();
  if(t.length < 2) return [];
  const months = planMonths(), have = new Set(m.items.map(i=>i.name));
  const words = f=>{ const e = foodOf(f.name); return [f.name, ...(e ? [e.label, ...(e.aliases || [])] : [])].map(w=>w.toLowerCase()); };
  const score = f=>{ const w = words(f); return w.some(x=>x.startsWith(t)) ? 0 : w.some(x=>x.split(/[ ,]+/).some(p=>p.startsWith(t))) ? 1 : 9; };
  return FOOD_POOL.filter(f=>!have.has(f.name) && isAllowed(f, months, state.profile) && !allergyMatch(f.name, state.profile) && score(f) < 9)
    .sort((a, b)=>score(a) - score(b) || (hasArt(foodOf(b.name)) ? 1 : 0) - (hasArt(foodOf(a.name)) ? 1 : 0) || a.name.localeCompare(b.name))
    .slice(0, 4);
}   // changing: {id (the food being changed), i (which alternative shows)}
/* ---------- Keep screen on: the Screen Wake Lock, while cooking ----------
   Off by default; only where the browser has it. It lets go when the page is hidden or left, and after
   60 minutes (then the toggle turns off); it comes back only if it was left on and the page is visible again. */
const WAKE_MAX_MS = 60 * 60000;
const wake = {on:false, lock:null, until:0, timer:0};
function wakeSupported(){ return "wakeLock" in navigator && !!navigator.wakeLock; }
async function wakeAcquire(){
  if(!wake.on || document.hidden || wake.lock) return;
  try{ wake.lock = await navigator.wakeLock.request("screen"); wake.lock.addEventListener("release", ()=>{ wake.lock = null; }); }
  catch(e){ wake.on = false; homeChanged(); }
}
function wakeRelease(){ const l = wake.lock; wake.lock = null; if(l) try{ l.release(); }catch(e){} }
function wakeSet(on){
  wake.on = on; clearTimeout(wake.timer);
  if(on){ wake.until = Date.now() + WAKE_MAX_MS; wake.timer = setTimeout(()=>wakeSet(false), WAKE_MAX_MS); wakeAcquire(); announce(say("meal.wakeOn")); }
  else { wakeRelease(); announce(say("meal.wakeOff")); }
  homeChanged();
}
document.addEventListener("visibilitychange", ()=>{
  if(document.hidden) wakeRelease();
  else if(wake.on && Date.now() < wake.until) wakeAcquire();
  else if(wake.on) wakeSet(false);
});
addEventListener("pagehide", wakeRelease);
function wakeToggle(){
  const b = document.createElement("button");
  b.type = "button"; b.className = "btn-text small wake"; b.dataset.f = "wake";
  b.setAttribute("aria-pressed", String(wake.on));
  b.innerHTML = `<i aria-hidden="true"></i>${esc(say("meal.wake"))}`;
  b.addEventListener("click", ()=>wakeSet(!wake.on));
  return b;
}
/* safe alternatives from the same food group for this meal (drawn ones first), in a stable order */
function alternatives(m, k, n){
  const item = m.items[k], months = planMonths(), slot = (MEAL_SLOTS.find(x=>x.id===m.slot) || {}).slot || SLOT_OF[m.label] || "lunch";
  const taken = new Set(m.items.map(i=>i.name));
  const known = introducedAllergens(state.profile);
  const pool = FOOD_POOL.filter(f=>f.cats[0]===item.cats[0] && f.slots.includes(slot) && !taken.has(f.name) && isAllowed(f, months, state.profile)
                                  && newAllergens(f.name, known).length===0);   // a swap never brings a first allergen
  return shuffledFor(pool.filter(f=>hasArt(foodOf(f.name)) && !dislikeMatch(f.name, state.profile)), item.id).concat(shuffledFor(pool.filter(f=>!hasArt(foodOf(f.name))), item.id))
    .filter((f, i, a)=>a.indexOf(f)===i).slice(0, n || 3);
}
/* the same order for the same key, so options don't jump between redraws */
function shuffledFor(arr, key){
  const a = arr.slice();
  let h = 2166136261; for(let k=0; k<key.length; k++){ h ^= key.charCodeAt(k); h = Math.imul(h, 16777619) >>> 0; }
  for(let i=a.length-1; i>0; i--){ h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0; const j = h % (i+1); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
/* "While you're at it": at most two lines, for the open meal */
function renderAlso(def){
  const sec = $("alsoSec"), list = $("alsoList");
  list.innerHTML = "";
  if(!def || milkOnly()){ sec.hidden = true; return; }
  const iso = todayISO();
  const prepped = state.prepped && state.prepped.date===iso ? state.prepped.done || [] : [];
  const seen = {done:prepped, salt:(state.shown && state.shown.salt) || 0};
  const items = suggestAlso(def, state.plan, now(), state.profile, state.stock, seen);
  sec.hidden = !items.length;
  items.forEach(s=>{
    if(s.kind==="salt" && state.shown.saltDay!==iso){ state.shown = Object.assign({}, state.shown, {salt:(state.shown.salt || 0) + 1, saltDay:iso}); save(); }
    const row = document.createElement("div");
    row.className = "also-row";
    row.innerHTML = `${foodArt(s.food, {size:24, lazy:true})}<p class="also-text">${esc(s.text)}${s.note ? `<span class="also-note">${esc(s.note)}</span>` : ""}</p>`;
    const b = document.createElement("button");
    b.type = "button"; b.className = "also-btn"; b.dataset.f = "also:" + s.id;
    b.setAttribute("aria-pressed", "false");
    b.innerHTML = `<i aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M6 12.5l4 4 8-9"/></svg></i><span>${esc(say("also.doIt"))}</span>`;
    b.addEventListener("click", ()=>{
      state.prepped = {date:iso, done:prepped.concat(s.id)};
      if(s.target){ const tm = state.plan.days[s.target.dayIdx].meals[s.target.k]; tm.prepped = (tm.prepped || []).filter(f=>f!==s.food).concat(s.food); }
      save(); haptic(); announce(say("also.done")); homeChanged();
    });
    row.appendChild(b);
    list.appendChild(row);
  });
}

/* ---------- below the fold: this week, and the shop line ---------- */
const ringDone = {};
function renderWeek(){
  const strip = $("weekStrip"), iso = todayISO(), days = weekDays();
  if(strip.children.length!==7){
    strip.innerHTML = "";
    days.forEach((_, k)=>{
      const b = document.createElement("button");
      b.type = "button"; b.className = "wd"; b.dataset.f = "wd:" + k;
      b.innerHTML = `<span class="wd-l"></span><span class="wd-n"></span><span class="ring"><svg viewBox="0 0 40 40" aria-hidden="true"><circle class="r-bg" cx="20" cy="20" r="16" pathLength="100"/><circle class="r-fg" cx="20" cy="20" r="16" pathLength="100"/></svg></span><i class="wd-dot" aria-hidden="true"></i>`;
      b.addEventListener("click", ()=>openSheet("day", {pos:k}));
      strip.appendChild(b);
    });
  }
  days.forEach((x, k)=>{
    const b = strip.children[k], day = state.plan.days[x.dayIdx];
    const meals = day ? day.meals.filter(m=>m.items.length) : [];
    const offered = meals.filter(mealOffered).length, p = meals.length ? offered/meals.length : 0;
    const isToday = isoOf(x.date)===iso;
    b.classList.toggle("today", isToday);
    setText(b.querySelector(".wd-l"), fmtShortDay(x.date));
    setText(b.querySelector(".wd-n"), String(x.date.getDate()));
    b.querySelector(".r-fg").style.setProperty("--p", p.toFixed(3));
    const full = meals.length > 0 && offered===meals.length;
    if(full && ringDone[k]===false && !calm()) b.querySelector(".ring").animate([{transform:"scale(1)"}, {transform:"scale(1.12)"}, {transform:"scale(1)"}], {duration:520, easing:"cubic-bezier(.32,1.25,.5,1)"});
    ringDone[k] = full;
    b.setAttribute("aria-label", `${fmtWeekday(x.date)} ${fmtDayMonth(x.date)}${isToday ? " (today)" : ""}: ${offered} of ${meals.length}`);
  });
  // variety lives here, with the week: five dots, filled once a group has been offered
  const dots = $("vdots");
  if(!dots.children.length) GROUPS.forEach(cat=>dots.insertAdjacentHTML("beforeend", `<span class="vdot" data-cat="${cat}" style="--dot:${GLOW[cat].hex}"><i aria-hidden="true"></i><span>${esc(say("home.groups." + cat))}</span></span>`));
  let on = 0;
  [...dots.children].forEach(d=>{ const t = offeredFoods(d.dataset.cat).length > 0; if(t) on++; d.classList.toggle("on", t); d.setAttribute("aria-label", say("home.groups." + d.dataset.cat) + (t ? ": offered" : ": not yet")); d.setAttribute("role", "img"); });
  setText($("varText"), (on===GROUPS.length ? say("home.variety.all") : say("home.variety.some")));
}
/* what to pick up for a window (soonest-needed first) */
function shopList(win){
  const order = dayDisplayOrder().map(i=>state.plan.days[i].name);
  const first = n=>Math.min(...n.days.map(d=>order.indexOf(d)));
  return Object.values(needOn(windowDays(win || "next3")))
    .filter(n=>{ const a = toBuy(n); return a===null || a>0; })
    .sort((a, b)=>first(a) - first(b));
}
function renderShopLine(){
  const need = shopList("next3"), n = need.length + state.extras.filter(x=>!x.checked).length;
  setText($("shopText"), say("home.shop", {n}));
  const stack = need.slice(0, Math.min(4, n));
  const sig = stack.map(x=>x.key).join();
  if($("shopStack").dataset.sig!==sig){
    $("shopStack").dataset.sig = sig;
    $("shopStack").innerHTML = stack.map((x, k)=>`<span class="st" style="--z:${4-k}">${foodArt(x.name, {size:28, lazy:true})}</span>`).join("");
  }
}
function entrance(){
  if(calm()) return;
  [$("profileBtn"), $("clock").parentNode, $("headline"), $("moment"), $("openMeal")].forEach((el, k)=>el && el.animate([{opacity:0, transform:"translateY(10px)"}, {opacity:1, transform:"none"}],
    {duration:420, delay:k*70, easing:"cubic-bezier(.2,.8,.2,1)", fill:"backwards"}));
}
/* below-the-fold sections fade up as they come into view. A passive scroll check, not an IntersectionObserver:
   while the glow breathes, an observer makes the browser recompute intersections every frame (measured: ~110ms
   of main thread a second at 4× CPU, against ~1ms this way). It stops listening once both have arrived. */
function watchFold(){
  const pending = new Set(document.querySelectorAll(".below"));
  const check = ()=>{
    pending.forEach(s=>{ if(s.getBoundingClientRect().top < innerHeight * .92){ s.classList.add("in"); pending.delete(s); } });
    if(!pending.size){ removeEventListener("scroll", onScroll); removeEventListener("resize", onScroll); }
  };
  let queued = false;
  const onScroll = ()=>{ if(queued) return; queued = true; requestAnimationFrame(()=>{ queued = false; check(); }); };
  addEventListener("scroll", onScroll, {passive:true}); addEventListener("resize", onScroll, {passive:true});
  check();
}

/* ====================================================================
   COOK MODE: one step at a time, large type, a big Next in the thumb zone.
   The screen stays awake (Wake Lock, where there is one) and the glow dims.
   Timers are honest: a page can't ring when it's backgrounded or the phone
   is locked, so a timer is an end time (kept in state.timers, so it
   survives a reload), shown as a thin ring, in the tab title, and as
   "Time's up" when Chicho is looked at again. Reliable alerts would need
   web push through the installed app and a small backend.
   ==================================================================== */
const cook = {active:false, key:null, step:0, portions:1, wakeWas:false};
let cookTimer = 0;
/* the steps: each cooked food, longest first (with its minutes, for a timer), then any raw ones, then serve */
function cookSteps(m){
  const texture = stageFor(planMonths()).textureShort || "soft pieces";
  const foods = m.items.slice().sort((a, b)=>cookOf(b.name).min - cookOf(a.name).min);
  return foods.map(i=>({text:foodHow(i), min:cookOf(i.name).min, food:baseName(i), id:i.id}))
    .concat({text:say("cookMode.finished", {texture}), min:0, food:"", id:"serve"});
}
/* "35 g" × 2 → "70 g"; anything that isn't a number stays as it is */
function scaleQty(q, n){ return String(q || "").replace(/^(\d+(?:[.,]\d+)?)/, v=>String(Math.round(parseFloat(v.replace(",", ".")) * n))); }
function cookRef(){ return refsOn(now()).concat(refsOn(tomorrowOf(now()))).find(x=>x.key===cook.key) || null; }
function startCooking(x){
  Object.assign(cook, {active:true, key:x.key, step:0, portions:1, wakeWas:wake.on});
  if(wakeSupported() && !wake.on) wakeSet(true);
  homeChanged(); $("headline").focus({preventScroll:true}); scrollTo(0, 0);
}
function stopCooking(){
  if(!cook.active) return;
  cook.active = false;
  if(wake.on && !cook.wakeWas) wakeSet(false);
  homeChanged(); focusLater("cook:" + cook.key);
}
function cookGo(d){
  const x = cookRef(); if(!x) return stopCooking();
  const steps = cookSteps(x.m), to = cook.step + d;
  if(to >= steps.length){ stopCooking(); return; }
  cook.step = Math.max(0, to); haptic(); renderCook();
  if(!calm()) $("headline").animate([{opacity:0, transform:`translateX(${d > 0 ? 16 : -16}px)`}, {opacity:1, transform:"none"}], {duration:240, easing:"cubic-bezier(.2,.8,.2,1)"});
}
/* timers: {id, food, min, end} */
function timers(){ return state.timers || (state.timers = []); }
function startTimer(step){
  timers().push({id:uid(), food:step.food, min:step.min, end:Date.now() + step.min * 60000, step:step.id});
  save(); haptic(); renderCook(); cookTick();
}
function fmtLeft(ms){ const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; }
/* once a second while a timer runs and the page is visible: the ring, the time left, the tab title */
function cookTick(){
  clearTimeout(cookTimer);
  const running = timers().filter(t=>t.end > Date.now());
  if(cook.active) renderCookLine();
  const first = running.sort((a, b)=>a.end - b.end)[0];
  document.title = first ? say("cookMode.timerLeft", {food:first.food, time:fmtLeft(first.end - Date.now())}) : currentTitle;
  if(first && !document.hidden) cookTimer = setTimeout(cookTick, 1000 - (Date.now() % 1000) + 20);
}
document.addEventListener("visibilitychange", ()=>{ if(!document.hidden) cookTick(); });
function timerEl(t){
  const left = t.end - Date.now(), p = Math.max(0, Math.min(1, left / (t.min * 60000)));
  const span = document.createElement("span");
  span.className = "timer";
  span.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><circle class="t-bg" cx="12" cy="12" r="10" pathLength="100"/><circle class="t-fg" cx="12" cy="12" r="10" pathLength="100" style="stroke-dashoffset:${(100 - p * 100).toFixed(1)}"/></svg>`;
  span.append(left > 0 ? fmtLeft(left) : say("cookMode.timerUp", {food:t.food}));
  return span;
}
/* the moment line in cook mode: "Step 2 of 4", then this step's timer (or the button to start one) */
function renderCookLine(){
  const x = cookRef(); if(!x) return;
  const steps = cookSteps(x.m), st = steps[Math.min(cook.step, steps.length - 1)], el = $("moment");
  el.innerHTML = ""; momentKey = null;
  el.append(say("cookMode.step", {n:cook.step + 1, total:steps.length}));
  if(!st.min) return;
  const t = timers().filter(z=>z.step===st.id).sort((a, b)=>b.end - a.end)[0];
  el.append(" · ");
  if(t) el.appendChild(timerEl(t));
  else{ const b = textBtn(say("cookMode.timer", {min:st.min}), ()=>startTimer(st), "inline"); b.dataset.f = "timer:" + st.id; el.appendChild(b); }
}
function renderCook(){
  const x = cookRef(), box = $("cook");
  if(!x){ stopCooking(); return; }
  const steps = cookSteps(x.m), st = steps[Math.min(cook.step, steps.length - 1)], last = cook.step >= steps.length - 1;
  setText($("headline"), st.text);
  homeKey = "cook:" + cook.step;
  renderCookLine();
  const f = focusMemo();
  box.innerHTML = "";
  const por = document.createElement("div");
  por.className = "cook-portions"; por.setAttribute("role", "group"); por.setAttribute("aria-labelledby", "cookPortions");
  por.innerHTML = `<span class="mini" id="cookPortions">${esc(say("cookMode.portionsLabel"))}</span>`;
  [1, 2, 4].forEach(n=>{
    const b = document.createElement("button");
    b.type = "button"; b.textContent = String(n); b.dataset.f = "portions:" + n;
    b.setAttribute("aria-pressed", String(cook.portions===n)); b.setAttribute("aria-label", say("cookMode.portions", {n}));
    b.addEventListener("click", ()=>{ cook.portions = n; haptic(); renderCook(); });
    por.appendChild(b);
  });
  box.appendChild(por);
  box.insertAdjacentHTML("beforeend", `<h2 class="mini" style="margin-top:20px">${esc(say("cookMode.need"))}</h2>`);
  const ul = document.createElement("ul");
  ul.className = "cook-need";
  x.m.items.forEach(i=>ul.insertAdjacentHTML("beforeend", `<li>${foodArt(i.name, {size:24})}<span><b>${esc(baseName(i))}</b> · ${esc(scaleQty(i.qty, cook.portions))}</span></li>`));
  box.appendChild(ul);
  if(steps.some(z=>z.min)) box.insertAdjacentHTML("beforeend", `<p class="cook-limit">${esc(say("cookMode.limit"))}</p>`);
  const acts = document.createElement("p");
  acts.className = "cook-acts";
  if(cook.step > 0){ const bk = textBtn(say("cookMode.back"), ()=>cookGo(-1), "small"); bk.dataset.f = "cook:back"; acts.appendChild(bk); }
  const stop = textBtn(say("cookMode.stop"), stopCooking, "small"); stop.dataset.f = "cook:stop";
  acts.appendChild(stop);
  box.appendChild(acts);
  const next = document.createElement("button");
  next.type = "button"; next.className = "cook-next"; next.id = "cookNext"; next.dataset.f = "cook:next";
  next.textContent = last ? say("cookMode.done") : say("cookMode.next");
  next.addEventListener("click", ()=>cookGo(1));
  box.appendChild(next);
  focusRestore(f);
}
/* ---------- Start a new week: press and hold ----------
   A big action gets a deliberate gesture instead of a dialog: hold for a second while the ring fills (pointer,
   or Space/Enter held), let go early and nothing happens. Then "New week set. Undo" for 5 seconds. */
const HOLD_MS = 1000;
let holdAnim = null, weekUndo = null;
function holdStart(){
  if(holdAnim) return;
  const disc = document.querySelector("#newWeekBtn .hold-ring b");
  holdAnim = disc.animate([{transform:"scale(0)"}, {transform:"scale(1)"}], {duration:HOLD_MS, easing:"linear", fill:"forwards"});
  holdAnim.onfinish = ()=>{ holdAnim.cancel(); holdAnim = null; startNewWeek(); };
}
function holdCancel(){
  if(!holdAnim) return;
  const a = holdAnim; holdAnim = null; a.onfinish = null;
  if(calm()){ a.cancel(); return; }
  a.pause(); const p = a.effect.getComputedTiming().progress || 0; a.cancel();
  document.querySelector("#newWeekBtn .hold-ring b").animate([{transform:`scale(${p})`}, {transform:"scale(0)"}], {duration:160, easing:"ease-out"});
}
function startNewWeek(){
  const P = state.profile, old = {plan:state.plan, weekStarted:state.weekStarted, lastStage:P.lastStage, history:state.history.slice()};
  if(hasPlan()) state.history.push({weekOf:state.weekStarted});
  state.plan = generateWeek(planMonths(), P);
  state.weekStarted = todayISO(); P.lastStage = stageNow().id; currentDay = dayDisplayOrder()[0];
  picked = null; save(); haptic(); pulseGlow();
  clearTimeout(weekUndo && weekUndo.timer);
  weekUndo = {old, timer:setTimeout(()=>{ weekUndo = null; renderWeekUndo(); }, 5000)};
  announce(say("week.newSet")); homeChanged(); renderWeekUndo();
}
function renderWeekUndo(){
  const p = $("newWeekUndo");
  p.hidden = !weekUndo; p.innerHTML = "";
  if(!weekUndo) return;
  p.append(say("week.newSet") + " ");
  const u = textBtn(say("meal.undo"), ()=>{
    const o = weekUndo.old; clearTimeout(weekUndo.timer); weekUndo = null;
    Object.assign(state, {plan:o.plan, weekStarted:o.weekStarted, history:o.history}); state.profile.lastStage = o.lastStage;
    save(); announce(say("week.restored")); homeChanged(); renderWeekUndo(); focusLater("newweek");
  }, "inline");
  u.dataset.f = "undo:newweek";
  p.appendChild(u);
}
/* a new week: the reveal, then "Love it" applies it */
function setNextWeek(){ closeSheet(true); openOnboarding("reveal", {single:true}); }

/* ====================================================================
   SHEETS: the one overlay. A bottom sheet with a scrim, a drag handle and
   two detents (medium, large). Opens on tap (or Enter/Space), has a visible
   44px ✕, closes on Esc, a tap on the scrim or a swipe down, traps focus
   and gives focus back to what opened it. It rides on top of the keyboard.
   ==================================================================== */
const sheetEl = $("sheet"), sheetBody = $("sheetBody");
let sheetStack = [], sheetOpener = null, detent = "medium";
/* the safe-area top, read once from a probe (env() isn't readable from JS) */
const safeTop = (()=>{ let v = null; return ()=>{ if(v===null){ const p = document.createElement("div"); p.style.cssText = "position:fixed;top:0;height:env(safe-area-inset-top);visibility:hidden"; document.body.appendChild(p); v = p.offsetHeight; p.remove(); } return v; }; })();
/* medium: 62% of what's visible; large: everything below the status bar. With the keyboard up, large. */
function sheetMax(d, kb){
  const h = viewportNow().height;
  return Math.round(d==="large" || kb > 80 ? h - safeTop() - 10 : h * .62);
}
function applyDetent(kb){ sheetEl.style.setProperty("--sheet-max", sheetMax(detent, kb===undefined ? parseInt(getComputedStyle(document.documentElement).getPropertyValue("--kb")) || 0 : kb) + "px"); sheetEl.dataset.detent = detent; }
function setDetent(d){
  if(d===detent) return;
  const before = sheetEl.getBoundingClientRect().top;
  detent = d; applyDetent();
  const after = sheetEl.getBoundingClientRect().top;
  if(!calm() && before!==after) sheetEl.animate([{transform:`translateY(${before - after}px)`}, {transform:"none"}], {duration:240, easing:"cubic-bezier(.2,.8,.2,1)"});
}
kbListeners.push(kb=>{
  if(!sheetEl.open) return;
  applyDetent(kb);
  // the field being typed in stays in view above the keyboard
  const a = document.activeElement;
  if(kb > 80 && a && sheetEl.contains(a) && a.matches("input, textarea")) requestAnimationFrame(()=>a.scrollIntoView({block:"nearest", behavior:calm() ? "auto" : "smooth"}));
});
function openSheet(kind, arg){
  if(sheetEl.open){ sheetStack.push({kind, arg}); renderSheetView(); return; }
  sheetOpener = document.activeElement;
  sheetStack = [{kind, arg}];
  detent = "medium"; applyDetent();
  renderSheetView();
  sheetEl.showModal();
  $("sheetTitle").focus({preventScroll:true});
  sheetEl.style.transform = "";
  sheetEl.animate(calm() ? [{opacity:0}, {opacity:1}] : [{opacity:0, transform:"translateY(40px)"}, {opacity:1, transform:"none"}],
                  {duration:220, easing:"cubic-bezier(.2,.8,.2,1)"});
}
function closeSheet(instant){
  if(!sheetEl.open) return;
  if(shopMode.store) setStoreMode(false);   // leaving the shop leaves the store: the screen may sleep again
  const done = ()=>{ sheetEl.close(); sheetStack = []; sheetEl.style.transform = ""; if(sheetOpener && document.contains(sheetOpener)) sheetOpener.focus({preventScroll:true}); };
  if(instant===true || calm()){ done(); return; }
  const a = sheetEl.animate([{opacity:1, transform:sheetEl.style.transform || "none"}, {opacity:0, transform:"translateY(30%)"}], {duration:150, easing:"cubic-bezier(.4,0,1,1)", fill:"forwards"});
  a.onfinish = ()=>{ done(); a.cancel(); };
}
function backSheet(){ if(sheetStack.length < 2) return closeSheet(); sheetStack.pop(); renderSheetView(); }
function refreshSheetView(){ if(sheetEl.open) renderSheetView(true); }
function renderSheetView(keep){
  const top = sheetStack[sheetStack.length - 1];
  if(!top) return;
  $("sheetBack").hidden = sheetStack.length < 2;
  const f = keep ? focusMemo() : null, scroll = sheetBody.scrollTop;
  sheetBody.innerHTML = "";
  SHEETS[top.kind](sheetBody, top.arg || {});
  if(keep){ sheetBody.scrollTop = scroll; focusRestore(f); }
}
function sheetTitle(t){ setText($("sheetTitle"), t); }
sheetEl.addEventListener("cancel", e=>{ e.preventDefault(); closeSheet(); });
sheetEl.addEventListener("click", e=>{
  if(e.target!==sheetEl) return;
  const r = sheetEl.getBoundingClientRect();
  if(e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) closeSheet();
});
/* focus stays inside: Tab from the last control comes back to the first, and the other way */
sheetEl.addEventListener("keydown", e=>{
  if(e.key!=="Tab") return;
  const els = [...sheetEl.querySelectorAll("button:not([disabled]):not([hidden]), input:not([disabled]), a[href], [tabindex]:not([tabindex='-1'])")].filter(z=>z.offsetParent || z===document.activeElement);
  if(!els.length) return;
  const first = els[0], last = els[els.length - 1];
  if(e.shiftKey && (document.activeElement===first || !sheetEl.contains(document.activeElement) || document.activeElement===$("sheetTitle"))){ e.preventDefault(); last.focus(); }
  else if(!e.shiftKey && document.activeElement===last){ e.preventDefault(); first.focus(); }
});
$("sheetClose").addEventListener("click", ()=>closeSheet());
$("sheetBack").addEventListener("click", backSheet);
/* drag: up on the handle or header goes large; down goes back to medium, then away.
   From the content, a pull down when it's scrolled to the top does the same. */
function dragEnd(dy){
  sheetEl.style.transform = "";
  if(dy < -50) setDetent("large");
  else if(dy > 90 && detent==="large" && sheetBody.scrollHeight > sheetMax("medium") - 80) setDetent("medium");
  else if(dy > 90) closeSheet();
  else if(dy > 0 && !calm()) sheetEl.animate([{transform:`translateY(${dy}px)`}, {transform:"none"}], {duration:180, easing:"cubic-bezier(.2,.8,.2,1)"});
}
const dragTo = dy=>{ sheetEl.style.transform = `translateY(${dy > 0 ? dy : dy * .25}px)`; };
(()=>{
  let y0 = null, dy = 0;
  [$("sheetGrab"), $("sheetHead")].forEach(h=>{
    h.addEventListener("pointerdown", e=>{ if(e.target.closest("button")) return; y0 = e.clientY; dy = 0; h.setPointerCapture(e.pointerId); });
    h.addEventListener("pointermove", e=>{ if(y0===null) return; dy = e.clientY - y0; dragTo(dy); });
    const up = ()=>{ if(y0===null) return; y0 = null; dragEnd(dy); };
    h.addEventListener("pointerup", up); h.addEventListener("pointercancel", up);
  });
  let t0 = null, tdy = 0;
  sheetBody.addEventListener("touchstart", e=>{ t0 = sheetBody.scrollTop <= 0 ? e.touches[0].clientY : null; tdy = 0; }, {passive:true});
  sheetBody.addEventListener("touchmove", e=>{
    if(t0===null) return;
    tdy = e.touches[0].clientY - t0;
    if(tdy > 0 && sheetBody.scrollTop <= 0){ e.preventDefault(); dragTo(tdy); } else if(tdy < 0) t0 = null;
  }, {passive:false});
  sheetBody.addEventListener("touchend", ()=>{ if(t0===null) return; t0 = null; if(tdy > 0) dragEnd(tdy); });
})();
function sheetRow(label, sub, fn, f){
  const b = document.createElement("button");
  b.type = "button"; b.className = "s-row"; if(f) b.dataset.f = f;
  b.innerHTML = `<span class="s-row-t">${esc(label)}</span>${sub ? `<span class="s-row-sub">${esc(sub)}</span>` : ""}`;
  b.addEventListener("click", fn);
  return b;
}
function sheetRing(on, label, fn, f){
  const b = document.createElement("button");
  b.type = "button"; b.className = "ring-btn"; if(f) b.dataset.f = f;
  b.setAttribute("aria-pressed", String(!!on)); b.setAttribute("aria-label", label);
  b.innerHTML = RING;
  b.addEventListener("click", fn);
  return b;
}
/* ---------- the staples shortcut ----------
   At the first shopping list, one sentence: "Already in the kitchen…" with the staples on this list as pills.
   A tap puts it in stock at its usual pack size, so it comes off the list. It's asked on that first day only,
   and "That's all" puts it away at once. */
function staplesAsk(body, need){
  const A = state.asked || {}, iso = todayISO();
  if(A.staplesDone || (A.staplesShop && A.staplesShop!==iso)) return;
  const onList = new Set(need.map(n=>n.key));
  const opts = STAPLES.filter(([, food])=>onList.has(foodKey(food)) || state.profile.staples.includes(food) && staplesPicked.has(food));
  if(!opts.length) return;
  if(!A.staplesShop){ state.asked = Object.assign({}, A, {staplesShop:iso}); save(); }
  const box = document.createElement("div");
  box.className = "s-staples";
  box.innerHTML = `<p class="s-sentence">${esc(say("shopSheet.staples"))}</p><p class="s-hint">${esc(say("shopSheet.staplesHint"))}</p>`;
  const pills = document.createElement("div");
  pills.className = "pills";
  opts.forEach(([label, food])=>{
    const b = pillBtn(label, food);
    b.dataset.f = "staple:" + food;
    b.setAttribute("aria-pressed", String(staplesPicked.has(food)));
    b.addEventListener("click", ()=>{
      const k = foodKey(food);
      if(staplesPicked.has(food)){ staplesPicked.delete(food); delete state.stock[k]; state.profile.staples = state.profile.staples.filter(x=>x!==food); }
      else{ staplesPicked.add(food); const pack = packFor(food); state.stock[k] = {name:food, g:pack ? pack.g : null, plenty:false}; if(!state.profile.staples.includes(food)) state.profile.staples.push(food); }
      save(); haptic(); announce(say(staplesPicked.has(food) ? "shopSheet.stapleHave" : "shopSheet.stapleNeed", {food:label})); homeChanged();
    });
    pills.appendChild(b);
  });
  box.appendChild(pills);
  const done = textBtn(say("shopSheet.staplesDone"), ()=>{ state.asked = Object.assign({}, state.asked, {staplesDone:iso}); save(); refreshSheetView(); focusLater("instore"); }, "small");
  done.dataset.f = "staples:done";
  box.appendChild(done);
  body.appendChild(box);
}
const staplesPicked = new Set();
/* shopping in the store: grouped by food group, the screen awake while the sheet is open */
const shopMode = {store:false, stockOpen:false, wakeOurs:false};
function setStoreMode(on){
  shopMode.store = on;
  if(on){ setDetent("large"); if(wakeSupported() && !wake.on){ shopMode.wakeOurs = true; wakeSet(true); } }
  else if(shopMode.wakeOurs){ shopMode.wakeOurs = false; if(wake.on) wakeSet(false); }
  haptic(); refreshSheetView();
}
let sessionBought = {};   // key → grams added this session, so an untick can take exactly that back
const SHEETS = {
  /* a day of the week: its meals, offered or planned; future days can change their main food */
  day(body, {pos}){
    const x = weekDays()[pos], d = state.plan.days[x.dayIdx], iso = todayISO(), future = isoOf(x.date) > iso;
    sheetTitle(say("day.title", {weekday:fmtWeekday(x.date), date:fmtDayMonth(x.date)}));
    const meals = d ? d.meals.map((m, k)=>({m, k})).filter(y=>y.m.items.length) : [];
    if(!meals.length){ body.insertAdjacentHTML("beforeend", `<p class="s-empty">${esc(say("day.nothing"))}</p>`); return; }
    meals.forEach(({m, k})=>{
      const row = document.createElement("div");
      row.className = "s-meal";
      const at = atTime(x.date, mealTime(m.slot, x.date));
      row.innerHTML = `${foodArt(m.items[0].name, {size:28})}<div class="s-meal-t"><p class="s-meal-h">${esc(say("home.rowWhen", {meal:m.label, time:fmtTime(at)}))}</p><p class="s-meal-f">${esc(foodsLine(m))}</p></div>`;
      if(future && !mealOffered(m)){
        const c = textBtn(say("day.change"), ()=>{ const old = m.items[0]; if(swapItem(m, 0)){ const fresh = m.items[0]; homeChanged(); announce(say("meal.changed", {food:lower1(baseName(fresh))}));
          const u = document.createElement("p"); u.className = "undo-line"; u.append(say("meal.changed", {food:lower1(baseName(fresh))}) + " ");
          u.appendChild(textBtn(say("meal.undo"), ()=>{ const j = m.items.indexOf(fresh); if(j >= 0) m.items[j] = old; save(); homeChanged(); }, "inline"));
          const slotEl = sheetBody.querySelectorAll(".s-meal")[meals.findIndex(y=>y.m===m)]; if(slotEl) slotEl.after(u); setTimeout(()=>u.remove(), 5000); } }, "small");
        c.dataset.f = `dchange:${pos}:${k}`;
        row.appendChild(c);
      }
      row.appendChild(sheetRing(mealOffered(m), mealOffered(m) ? say("meal.ringOn", {meal:m.label}) : say("meal.ringOff", {meal:m.label}),
        ()=>{ offerMeal(m, !mealOffered(m)); save(); haptic(); homeChanged(); }, `dring:${pos}:${k}`));
      body.appendChild(row);
    });
  },
  /* shop: what to pick up, soonest first; a ring means bought, and it settles into In stock */
  shop(body){
    sheetTitle(say("shopSheet.title"));
    const need = shopList("week"), order = dayDisplayOrder().map(i=>state.plan.days[i].name), store = shopMode.store;
    // In the store: sorted by food group, the screen kept awake, the sheet at its large detent
    const tg = document.createElement("button");
    tg.type = "button"; tg.className = "btn-text small wake store-toggle"; tg.dataset.f = "instore";
    tg.setAttribute("aria-pressed", String(store));
    tg.innerHTML = `<i aria-hidden="true"></i>${esc(say("shopSheet.inStore"))}`;
    tg.addEventListener("click", ()=>setStoreMode(!shopMode.store));
    body.appendChild(tg);
    staplesAsk(body, need);
    if(!need.length && !state.extras.some(x=>!x.checked)) body.insertAdjacentHTML("beforeend", `<p class="s-empty">${esc(say("shopSheet.none"))}</p>`);
    const word = name=>{ const k = order.indexOf(name); return k===0 ? say("shopSheet.today") : k===1 ? say("shopSheet.tomorrow") : fmtWeekday(dateOfPlanDay(name)); };
    const needRow = n=>{
      const {short} = shortfall(n.key), st = state.stock[n.key];
      const first = n.days.slice().sort((a, b)=>order.indexOf(a) - order.indexOf(b))[0];
      const when = st && st.g > 0 && short ? say("shopSheet.runsOut", {weekday:word(short)}) : say("shopSheet.forDay", {weekday:word(first)});
      const row = document.createElement("div");
      row.className = "s-item";
      row.innerHTML = `${foodArt(n.name, {size:28})}<p class="s-item-t"><span class="s-item-n">${esc(baseName(n))}</span><span class="s-item-sub">${esc(when)}</span></p>`;
      row.appendChild(sheetRing(false, say("shopSheet.bought", {food:baseName(n)}), ()=>{
        const amt = toBuy(n), g = amt===null ? null : buyPacks(n.name, amt).g;
        addToStock(n.key, n.name, g); sessionBought[n.key] = g; haptic(); announce(say("shopSheet.bought", {food:baseName(n)})); homeChanged();
      }, "buy:" + n.key));
      return row;
    };
    const extraRow = x=>{
      const row = document.createElement("div");
      row.className = "s-item";
      row.innerHTML = `${foodArt(null, {size:28})}<p class="s-item-t"><span class="s-item-n">${esc(x.name)}</span><span class="s-item-sub">${esc(x.qty || "")}</span></p>`;
      row.appendChild(sheetRing(false, say("shopSheet.bought", {food:x.name}), ()=>{ x.checked = true; save(); haptic(); homeChanged(); }, "extra:" + x.id));
      return row;
    };
    const extras = state.extras.filter(x=>!x.checked);
    if(store){
      // by food group, in the same order as Variety; anything else last
      GROUPS.concat("other").forEach(cat=>{
        const rows = need.filter(n=>(GROUPS.includes(n.cat) ? n.cat : "other")===cat);
        if(cat==="other" && extras.length) rows.push(...extras.map(x=>({extra:x})));
        if(!rows.length) return;
        body.insertAdjacentHTML("beforeend", `<h3 class="s-sec">${esc(cat==="other" ? say("shopSheet.other") : say("home.groups." + cat))}</h3>`);
        rows.forEach(r=>body.appendChild(r.extra ? extraRow(r.extra) : needRow(r)));
      });
    }else{
      need.forEach(n=>body.appendChild(needRow(n)));
      extras.forEach(x=>body.appendChild(extraRow(x)));
    }
    // also pick up: something that isn't on the plan
    const p = document.createElement("p");
    p.className = "s-add";
    const b = blank({min:8, maxLength:40, onEnter:()=>{ const v = b.input.value.trim(); if(!v) return; state.extras.push({id:uid(), name:upper1(v), qty:"", checked:false}); save(); homeChanged(); focusLater("also-get"); }});
    b.input.dataset.f = "also-get";
    const parts = say("shopSheet.alsoGet").split("{blank}");
    const l = document.createElement("label"); l.htmlFor = b.input.id; l.textContent = parts[0].trim();
    p.append(l, " ", b.el);
    body.appendChild(p);
    // in stock: this week's foods that are at home, and anything ticked off; folded away until asked for
    const stocked = Object.values(needOn(windowDays("week"))).filter(n=>toBuy(n)===0);
    const ticked = state.extras.filter(x=>x.checked);
    if(stocked.length || ticked.length){
      const fold = document.createElement("button");
      fold.type = "button"; fold.className = "s-fold"; fold.dataset.f = "instock";
      fold.setAttribute("aria-expanded", String(shopMode.stockOpen)); fold.setAttribute("aria-controls", "inStockList");
      fold.innerHTML = `<span class="s-sec">${esc(say("shopSheet.inStock"))} · ${stocked.length + ticked.length}</span><i class="chev" aria-hidden="true"></i>`;
      fold.addEventListener("click", ()=>{ shopMode.stockOpen = !shopMode.stockOpen; refreshSheetView(); });
      body.appendChild(fold);
      const box = document.createElement("div");
      box.id = "inStockList"; box.hidden = !shopMode.stockOpen;
      stocked.forEach(n=>{
        const row = document.createElement("div");
        row.className = "s-item";
        row.innerHTML = `${foodArt(n.name, {size:28})}<p class="s-item-t"><span class="s-item-n">${esc(baseName(n))}</span></p>`;
        row.appendChild(sheetRing(true, say("shopSheet.notBought", {food:baseName(n)}), ()=>{
          const g = sessionBought[n.key], st = state.stock[n.key];
          if(g && st && st.g!==null) st.g = Math.max(0, st.g - g); else delete state.stock[n.key];
          delete sessionBought[n.key]; save(); haptic(); homeChanged();
        }, "unbuy:" + n.key));
        box.appendChild(row);
      });
      ticked.forEach(x=>{
        const row = document.createElement("div");
        row.className = "s-item";
        row.innerHTML = `${foodArt(null, {size:28})}<p class="s-item-t"><span class="s-item-n">${esc(x.name)}</span></p>`;
        row.appendChild(sheetRing(true, say("shopSheet.notBought", {food:x.name}), ()=>{ x.checked = false; save(); homeChanged(); }, "unextra:" + x.id));
        box.appendChild(row);
      });
      body.appendChild(box);
    }
    const foot = document.createElement("button");
    foot.type = "button"; foot.className = "btn-ink s-foot"; foot.textContent = say("shopSheet.send");
    foot.addEventListener("click", ()=>sendGroceries());
    body.appendChild(foot);
  },
  /* send: text first, opened in Messages or the share sheet, never sent for you */
  send(body, arg){
    sheetTitle(say("send.title"));
    const P = state.profile, t = now(), name = P.name || "";
    const status = document.createElement("p");
    status.className = "s-status"; status.setAttribute("aria-live", "polite");
    if(sendAsk==="self"){
      const p = document.createElement("p");
      p.className = "s-sentence";
      const b = blank({min:10, maxLength:20, inputmode:"tel", autocomplete:"tel", onEnter:()=>{ P.self = {phone:normPhone(b.input.value)}; save(); sendAsk = null; refreshSheetView(); sendGroceries(); }});
      const parts = say("send.selfAsk").split("{blank}");
      const l = document.createElement("label"); l.htmlFor = b.input.id; l.textContent = parts[0].trim();
      p.append(l, " ", b.el, parts[1] || "");
      body.appendChild(p);
      body.insertAdjacentHTML("beforeend", `<p class="s-hint">${esc(say("people.phoneHint"))} ${esc(say("people.selfHint"))}</p>`);
      body.appendChild(textBtn(say("send.selfSkip"), ()=>{ state.asked = Object.assign({}, state.asked, {selfNumber:todayISO()}); save(); sendAsk = null; refreshSheetView(); sendGroceries(true); }, "small"));
      requestAnimationFrame(()=>b.input.focus());
      return;
    }
    if(sendAsk==="link"){
      body.insertAdjacentHTML("beforeend", `<p class="s-warn">${esc(say("send.linkWarn", {name}))}</p>`);
      const go = document.createElement("button");
      go.type = "button"; go.className = "btn-ink"; go.textContent = say("send.linkOk");
      go.addEventListener("click", ()=>{ state.asked = Object.assign({}, state.asked, {linkWarned:todayISO()}); save(); sendAsk = null; sendWeekLink(status); });
      body.appendChild(go);
      body.appendChild(status);
      return;
    }
    const list = document.createElement("div");
    list.className = "s-rows";
    list.appendChild(sheetRow(say("send.groceries"), "", ()=>sendGroceries(), "s:groceries"));
    P.people.forEach(p=>{
      list.appendChild(sheetRow(say("send.tomorrowTo", {person:p.name}), "", ()=>sendDay(tomorrowOf(t), p, status), "s:tm:" + p.id));
      if(t.getHours() < 14) list.appendChild(sheetRow(say("send.todayTo", {person:p.name}), "", ()=>sendDay(t, p, status), "s:td:" + p.id));
    });
    if(!P.people.length) list.appendChild(sheetRow(say("send.tomorrowAny"), "", ()=>sendDay(tomorrowOf(t), null, status), "s:tm"));
    list.appendChild(sheetRow(say("send.weekLink"), "", ()=>{ if(!(state.asked || {}).linkWarned){ sendAsk = "link"; refreshSheetView(); } else sendWeekLink(status); }, "s:link"));
    list.appendChild(sheetRow(say("send.copy"), "", async ()=>{ await copyText(weekText()); status.textContent = say("send.copied"); announce(say("home.announce.copied")); markShared(); }, "s:copy"));
    list.appendChild(sheetRow(say("send.more"), "", ()=>deliver({text:dayText(arg.date || t)}, status), "s:more"));
    body.appendChild(list);
    body.insertAdjacentHTML("beforeend", `<p class="s-hint">${esc(say("send.explain"))}</p>`);
    body.appendChild(status);
  },
  /* the profile: everything asked late lives here too */
  profile(body){
    const P = state.profile;
    sheetTitle(P.name || say("profileSheet.title"));
    if(P.birthDate) body.insertAdjacentHTML("beforeend", `<p class="s-hint">${esc(ageLabel(ageNow()) + " · " + stageNow().name)}</p>`);
    const list = document.createElement("div");
    list.className = "s-rows";
    [["birthday", ()=>{ closeSheet(true); openOnboarding("name", {through:"birthday"}); }],
     ["offPlate", ()=>{ closeSheet(true); openOnboarding("keepout", {single:true}); }],
     ["priorities", ()=>{ closeSheet(true); openOnboarding("priorities", {single:true}); }],
     ["mealTimes", ()=>{ closeSheet(true); openOnboarding("mealtimes", {single:true}); }],
     ["people", ()=>openSheet("people")],
     ["replay", ()=>{ closeSheet(true); openOnboarding("welcome", {replay:true}); }]].forEach(([k, fn])=>{
      const r = sheetRow(say("profileSheet." + k), "", fn, "p:" + k);
      if(k==="mealTimes" && planMonths() < 6) r.disabled = true;
      list.appendChild(r);
    });
    body.appendChild(list);
    // Appearance: Auto follows the system; Light and Dark stay put (stored on this device)
    const seg = document.createElement("div");
    seg.className = "s-seg"; seg.setAttribute("role", "group"); seg.setAttribute("aria-labelledby", "segAppearance");
    seg.innerHTML = `<span class="s-seg-l" id="segAppearance">${esc(say("profileSheet.appearance"))}</span><span class="s-seg-opts"></span>`;
    ["auto","light","dark"].forEach(v=>{
      const b = document.createElement("button");
      b.type = "button"; b.dataset.f = "appearance:" + v; b.textContent = say("profileSheet.appearanceOpts." + v);
      b.setAttribute("aria-pressed", String((P.appearance || "auto")===v));
      b.addEventListener("click", ()=>{ P.appearance = v; save(); applyTheme(v); updateChrome(); haptic(); refreshSheetView(); });
      seg.lastChild.appendChild(b);
    });
    body.appendChild(seg);
  },
  /* people: notes to self, and who else looks after {name}; numbers stay on this device */
  people(body){
    const P = state.profile, name = P.name || "";
    sheetTitle(say("people.title"));
    const self = document.createElement("p");
    self.className = "s-sentence";
    const sb = blank({min:10, maxLength:20, inputmode:"tel", autocomplete:"tel", value:P.self.phone || "", onEnter:()=>{}, onInput:v=>{ P.self = {phone:normPhone(v)}; save(); }});
    const sp = say("people.self").split("{blank}");
    const sl = document.createElement("label"); sl.htmlFor = sb.input.id; sl.textContent = sp[0].trim();
    self.append(sl, " ", sb.el, sp[1] || "");
    body.appendChild(self);
    body.insertAdjacentHTML("beforeend", `<p class="s-hint">${esc(say("people.selfHint"))}</p>`);
    P.people.forEach(p=>{
      const row = document.createElement("div");
      row.className = "s-person";
      row.innerHTML = `<p><b>${esc(p.name)}</b>${p.phone ? ` · ${esc(p.phone)}` : ""}</p>`;
      row.appendChild(textBtn(say("people.remove", {person:p.name}).split(" ")[0], ()=>{ P.people = P.people.filter(q=>q!==p); save(); refreshSheetView(); }, "small"));
      row.lastChild.setAttribute("aria-label", say("people.remove", {person:p.name}));
      body.appendChild(row);
    });
    const add = document.createElement("div");
    add.className = "s-add-person";
    const nb = blank({min:6, maxLength:30, autocomplete:"off"});
    const pb = blank({min:10, maxLength:20, inputmode:"tel", autocomplete:"off"});
    const ap = say("people.add", {name}).split("{blank}");
    const p1 = document.createElement("p"); p1.className = "s-sentence";
    const l1 = document.createElement("label"); l1.htmlFor = nb.input.id; l1.textContent = ap[0].trim();
    p1.append(l1, " ", nb.el, ap[1] || "");
    const pp = say("people.phone").split("{blank}");
    const p2 = document.createElement("p"); p2.className = "s-sentence small";
    const l2 = document.createElement("label"); l2.htmlFor = pb.input.id; l2.textContent = pp[0].trim();
    p2.append(l2, " ", pb.el);
    const saveBtn = document.createElement("button");
    saveBtn.type = "button"; saveBtn.className = "btn-ink"; saveBtn.textContent = say("people.save");
    const commit = ()=>{ const n = nb.input.value.trim(); if(!n) return; P.people.push({id:uid(), name:upper1(n), phone:normPhone(pb.input.value), role:""}); markAsked("people", true); save(); refreshSheetView(); };
    saveBtn.addEventListener("click", commit);
    nb.input.addEventListener("keydown", e=>{ if(e.key==="Enter"){ e.preventDefault(); pb.input.focus(); } });
    pb.input.addEventListener("keydown", e=>{ if(e.key==="Enter"){ e.preventDefault(); commit(); } });
    add.append(p1, p2);
    add.insertAdjacentHTML("beforeend", `<p class="s-hint">${esc(say("people.phoneHint"))} ${esc(say("people.stays"))}</p>`);
    add.appendChild(saveBtn);
    body.appendChild(add);
  },
  /* the allergen note: plain and calm, never playful */
  allergen(body){
    sheetTitle(say("allergenNote.title"));
    firstAllergensToday().forEach(a=>{
      const sec = document.createElement("div");
      sec.className = "s-allergen";
      sec.insertAdjacentHTML("beforeend", `<h3 class="s-sec">${esc(a.label)}</h3>`);
      a.foods.forEach(i=>{
        const r = foodRec(i.name);
        const status = r.safety==="introduced" ? (r.noReactionOn ? say("allergenNote.noReaction", {date:fmtDayMonth(localDate(r.noReactionOn))}) : say("allergenNote.introduced", {date:fmtDayMonth(localDate(r.safetyOn))})) : say("allergenNote.notYet");
        const row = document.createElement("div");
        row.className = "s-item";
        row.innerHTML = `${foodArt(i.name, {size:28})}<p class="s-item-t"><span class="s-item-n">${esc(baseName(i))}</span><span class="s-item-sub">${esc(status)}</span></p>`;
        if(r.safety==="introduced" && !r.noReactionOn) row.appendChild(textBtn(say("allergenNote.markNoReaction"), ()=>{ r.noReactionOn = todayISO(); save(); refreshSheetView(); }, "small"));
        sec.appendChild(row);
      });
      body.appendChild(sec);
    });
    body.insertAdjacentHTML("beforeend", `<p class="s-note">${esc(say("allergenNote.note"))}</p>`);
  }
};
let sendAsk = null;

/* ====================================================================
   SHARING: text first. "Opens Messages" and nothing more is promised.
   ==================================================================== */
/* iOS and macOS take sms:{n}&body=, Android sms:{n}?body= (docs/decisions.md) */
function platform(ua, touch){
  const u = ua || navigator.userAgent, t = touch===undefined ? navigator.maxTouchPoints : touch;
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
async function deliver({text, url, phone}, status){
  markShared();
  const full = text;   // the link, when there is one, is already inside the text
  if(phone){
    let left = false;
    const away = ()=>{ if(document.hidden) left = true; };
    document.addEventListener("visibilitychange", away);
    location.href = smsHref(phone, full);
    await new Promise(r=>setTimeout(r, 1400));
    document.removeEventListener("visibilitychange", away);
    if(left || !document.hasFocus()) return "sms";
  }
  if(navigator.share){
    try{ await navigator.share({text:full}); return "shared"; }
    catch(e){ if(e && e.name==="AbortError") return "cancelled"; }
  }
  await copyText(full);
  if(status) status.textContent = say("send.copied");
  announce(say("home.announce.copied"));
  return "copied";
}
function sendGroceries(skipAsk){
  const P = state.profile;
  if(!P.self.phone && !skipAsk && !(state.asked || {}).selfNumber){ sendAsk = "self"; sheetEl.open ? (sheetStack = [{kind:"send", arg:{}}], renderSheetView()) : openSheet("send"); return; }
  deliver({text:groceriesText(), phone:P.self.phone}, sheetEl.open ? sheetBody.querySelector(".s-status") : null);
}
function sendDay(date, person, status){ deliver({text:dayText(date), phone:person && person.phone}, status); }
async function sendWeekLink(status){
  const {url, short} = await snapshotURL();
  if(sheetEl.open && short && status) status.textContent = say("send.linkShort");
  await deliver({text:weekText(url), url}, status);
  if(short && status) status.textContent = say("send.linkShort");
}

/* ---------- message templates (content.js has every word) ---------- */
function allergyList(){
  const P = state.profile;
  return [...ALLERGENS.filter(a=>P.allergens[a.id]==="avoid").map(a=>lower1(a.label.split(" /")[0])), ...P.avoid.filter(a=>a.kind==="allergy").map(a=>lower1(a.name))];
}
function lockedList(){ return LOCKED_RULES.filter(r=>!r.until || ageNow() < r.until).map(r=>lower1(r.label)); }
function groceriesText(){
  const P = state.profile, t = now(), C = "share.groceries.";
  const order = dayDisplayOrder().map(i=>state.plan.days[i].name);
  const lines = [say(C + "head", {name:P.name || "", date:fmtDayMonth(t)}), say(C + "updated", {time:fmtTime(t)})];
  shopList("week").forEach(n=>{
    const {short} = shortfall(n.key), first = n.days.slice().sort((a, b)=>order.indexOf(a) - order.indexOf(b))[0];
    const by = short || first, within = order.indexOf(by) >= 0 && order.indexOf(by) < 3;
    lines.push(say(C + "item", {item:baseName(n)}) + (within ? say(C + "by", {weekday:fmtWeekday(dateOfPlanDay(by))}) : ""));
  });
  state.extras.filter(x=>!x.checked).forEach(x=>lines.push(say(C + "item", {item:x.name})));
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
  const fresh = refs.map(x=>newFoodIn(x.m)).find(Boolean);
  if(fresh) lines.push(say(C + "newToday", {food:lower1(baseName(fresh))}));
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
   items and the meals. Never phone numbers, never other people's names.
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
  const root = $("home"), o = await decodePayload(location.hash.slice(4));
  document.body.classList.add("is-snapshot");
  root.innerHTML = "";
  const main = document.createElement("main");
  main.className = "snap";
  if(!o){ main.innerHTML = `<p class="snap-broken">${esc(say("snap.broken"))}</p>`; root.appendChild(main); document.title = "Chicho"; return; }
  document.title = say("snap.title", {name:o.n});
  const months = o.m===1 ? "1 month" : o.m + " months";
  main.insertAdjacentHTML("beforeend", `<p class="snap-who">${esc(say("snap.who", {name:o.n, months}))}</p>`);
  main.insertAdjacentHTML("beforeend", `<h1 class="snap-avoid">${esc(o.a.length ? say("snap.avoid", {list:listJoin(o.a)}) : say("snap.avoidNone"))} ${esc(o.k.length ? say("snap.notYet", {list:listJoin(o.k)}) : "")}</h1>`);
  o.days.forEach(d=>{
    const date = localDate(d.w);
    const sec = document.createElement("section");
    sec.className = "snap-day";
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
  if(viewActive() && Date.now() >= view.until){ view.day = 0; view.idx = null; layoutSig = ""; }   // the next boundary brings it back to now
  if(todayISO()!==lastISO){ picked = null; homeChanged(); return; }   // midnight: a new day, its own plan
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
    document.querySelector(".corners") && document.querySelector(".corners").remove();
    renderSnapshot();
    return;
  }
  setText($("alsoLabel"), say("home.also"));
  setText($("earlierLabel"), say("home.earlier"));
  setText($("weekLabel"), say("home.week"));
  setText($("shopLabel"), say("shopSheet.title"));
  setText($("varLabel"), say("home.variety.label"));
  $("profileBtn").addEventListener("click", ()=>openSheet("profile"));
  $("whenBtn").addEventListener("click", ()=>setView(view.day ? 0 : 1, null));
  document.addEventListener("keydown", e=>{ if(e.key==="Escape" && cook.active && !sheetEl.open){ e.preventDefault(); stopCooking(); } });
  const nw = $("newWeekBtn");
  setText($("newWeekLabel"), say("week.hold"));
  nw.setAttribute("aria-label", say("week.holdLabel"));
  nw.addEventListener("pointerdown", e=>{ if(e.button===0) holdStart(); });
  ["pointerup", "pointerleave", "pointercancel"].forEach(ev=>nw.addEventListener(ev, holdCancel));
  nw.addEventListener("contextmenu", e=>e.preventDefault());   // a long press is ours, not the browser's menu
  nw.addEventListener("keydown", e=>{ if((e.key===" " || e.key==="Enter") && !e.repeat){ e.preventDefault(); holdStart(); } else if(e.key===" " || e.key==="Enter") e.preventDefault(); });
  nw.addEventListener("keyup", e=>{ if(e.key===" " || e.key==="Enter") holdCancel(); });
  onSwipe($("whenBtn"), dir=>setView(dir==="left" ? 1 : 0, null));
  onSwipe(document.querySelector(".hl"), dir=>cook.active ? cookGo(dir==="left" ? 1 : -1) : scrub(dir));
  $("shopLine").addEventListener("click", ()=>openSheet("shop"));
  currentDay = dayDisplayOrder()[0];
  document.addEventListener("themechange", ()=>{ updateChrome(); });
  renderHome();
  watchFold();
  scheduleTick();
  ["visibilitychange", "focus", "pageshow"].forEach(ev=>addEventListener(ev, ()=>{ if(!document.hidden) tick(); scheduleTick(); }));
  if(!state.profile.onboarded) openOnboarding();
  // offline: register the service worker once the page has settled (never on file://, never during tests)
  if("serviceWorker" in navigator && location.protocol.startsWith("http") && !/[?&]test\b/.test(location.search)){
    (window.requestIdleCallback || (f=>setTimeout(f, 1500)))(()=>navigator.serviceWorker.register("sw.js").then(()=>navigator.serviceWorker.ready).then(warmArt).catch(()=>{}));
  }
})();
/* after the first paint, quietly fetch this week's drawings at the sizes this screen uses */
function warmArt(){
  const ids = new Set(HERO_FOODS);
  state.plan.days.forEach(d=>d.meals.forEach(m=>m.items.forEach(i=>{ const f = foodOf(i.name); if(f) ids.add(f.id); })));
  const urls = [...ids].map(id=>FOOD_BY_ID[id]).filter(hasArt).flatMap(f=>[f.files.w64, f.files.w192]);
  let k = 0;
  const next = ()=>{ if(k >= urls.length) return; const batch = urls.slice(k, k += 6); Promise.all(batch.map(u=>fetch(u).catch(()=>{}))).then(()=>(window.requestIdleCallback || setTimeout)(next)); };
  next();
}
