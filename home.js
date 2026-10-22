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
/* "Thursday, October 22 · 7:33 PM": the reader's own locale and clock, no seconds */
function fmtHeaderDate(d){ return fmt({weekday:"long", day:"numeric", month:"long"})(d) + " · " + fmtTime(d); }
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
  setText($("profileBtn"), (P.name || "·").trim().charAt(0).toUpperCase());
  $("profileBtn").setAttribute("aria-label", say("home.profile") + (P.name ? ": " + P.name : ""));
  setText($("clock"), fmtHeaderDate(t));
  $("clock").setAttribute("datetime", t.toISOString());
  setText($("who"), P.birthDate ? say("home.who", {name:P.name || "", months:ageNow()}) : (P.name || ""));
  const calmState = milkOnly(), empty = !calmState && !hasPlan();
  $("home").classList.toggle("is-milk", calmState);
  $("home").classList.toggle("is-empty", empty);
  renderHeadline();
  renderMomentLine();
  renderMeals();
  renderWeek();
  renderShopLine();
  updateChrome();
  if(firstDraw){ firstDraw = false; entrance(); }
}
function renderHeadline(){
  const h = headlineNow(), el = $("headline");
  const changed = homeKey!==null && homeKey!==h.key;
  if(changed && !calm()){
    el.animate([{opacity:1}, {opacity:0}], {duration:140, fill:"forwards"}).onfinish = function(){ setText(el, h.headline); this.cancel(); el.animate([{opacity:0, transform:"translateY(6px)"}, {opacity:1, transform:"none"}], {duration:280, easing:"cubic-bezier(.2,.8,.2,1)"}); };
  }else setText(el, h.headline);
  if(changed && h.announce) announce(h.announce);
  homeKey = h.key;
  currentTitle = h.title;
}
function renderMomentLine(){
  const m = momentLine(), el = $("moment");
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
  const def = defaultOpen(today, tm);
  const all = today.concat(tm);
  if(picked && !all.some(x=>x.key===picked.key)) picked = null;
  const openKey = picked ? picked.key : def ? def.key : null;
  let earlier, upNext, nextLabel;
  if(def && today.includes(def)){
    earlier = today.filter(x=>x.start < def.start);
    upNext = today.filter(x=>x.start > def.start);
    nextLabel = say("home.upNext");
    if(!upNext.length){ upNext = tm; nextLabel = say("home.tomorrow"); }
  }else{
    earlier = today;
    upNext = tm.filter(x=>!def || x.key!==def.key);
    nextLabel = say("home.tomorrow");
  }
  const sig = [openKey, def && def.key, ...all.map(x=>x.key + x.status + x.time + x.m.items.map(i=>i.id + (i.offered ? 1 : 0)).join(",") + (x.m.outcome || "") + (x.m.prepped || []).join(",") + (undoUntil[x.key] > Date.now() ? "u" : ""))].join("|")
            + "|" + [...openFood].join(",") + "|" + Object.keys(changeUndo).join(",");
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
/* the offered ring: on every meal, always visible, a 44px target */
function ringBtn(x, f){
  const on = mealOffered(x.m);
  const b = document.createElement("button");
  b.type = "button"; b.className = "ring-btn"; b.dataset.f = f;
  b.setAttribute("aria-pressed", String(on));
  b.setAttribute("aria-label", on ? say("meal.ringOn", {meal:x.m.label}) : say("meal.ringOff", {meal:x.m.label}));
  b.innerHTML = `<i aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M6 12.5l4 4 8-9"/></svg></i>`;
  b.addEventListener("click", e=>{ e.stopPropagation(); toggleOffered(x); });
  return b;
}
function toggleOffered(x, fromPill){
  const on = !mealOffered(x.m);
  // offered from its own pill, the meal stays open (Undo, then how it went) until the next boundary
  if(on && fromPill) picked = {key:x.key, until:nextBoundary(refsOn(now()))};
  offerMeal(x.m, on); save(); haptic();
  if(on){ undoUntil[x.key] = Date.now() + 5000; setTimeout(()=>{ homeChanged(); }, 5050); announce(say("home.announce.offered", {meal:x.m.label})); }
  else { delete undoUntil[x.key]; announce(say("home.announce.unoffered", {meal:x.m.label})); }
  homeChanged();
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
  b.innerHTML = `${foodArt(x.m.items[0].name, {size:24})}<span class="mrow-t">${esc(whenLabel(x))}${prepped ? `<span class="mrow-sub">${esc(say("home.prepped", {food:baseName({name:prepped})}))}</span>` : ""}</span>`;
  b.addEventListener("click", ()=>{ picked = {key:x.key, until:nextBoundary(refsOn(now()))}; homeChanged(); focusLater("title:" + x.key); });
  row.appendChild(b);
  row.appendChild(ringBtn(x, "ring:" + x.key));
  if(undoUntil[x.key] > Date.now()) row.appendChild(undoLine(x));
  return row;
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
  title.textContent = isoOf(x.date)===todayISO() ? m.label : say("home.tomorrowWhen", {meal:m.label, time:fmtTime(x.start)}).split(" · ")[0];
  if(!isDefault){
    title.type = "button"; title.setAttribute("aria-expanded", "true"); title.setAttribute("aria-controls", a.id);
    title.addEventListener("click", ()=>{ picked = null; homeChanged(); });
  }else title.tabIndex = -1;
  head.appendChild(title);
  if(!isDefault || x.status==="earlier") head.appendChild(ringBtn(x, "ring:" + x.key));
  a.appendChild(head);
  const fresh = newFoodIn(m);
  const meta = document.createElement("p");
  meta.className = "mx-meta";
  meta.textContent = say("home.around", {time:fmtTime(x.start)}) + " · " + say("meal.meta", {n:mealMinutes(m), texture:st.textureShort || textureOf(m.items[0])})
                   + (fresh ? " · " + say("meal.newToday", {food:lower1(baseName(fresh))}) : "");
  a.appendChild(meta);
  const ul = document.createElement("ul");
  ul.className = "mx-foods";
  m.items.forEach((item, k)=>{
    const li = document.createElement("li");
    const id = "fr-" + item.id, isOpen = openFood.has(item.id);
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
      const cu = changeUndo[item.id];
      if(cu && cu.until > Date.now()){
        const p = document.createElement("p");
        p.className = "undo-line";
        p.append(say("meal.changed", {food:lower1(baseName(item))}) + " ");
        p.appendChild(textBtn(say("meal.undo"), ()=>{ const j = m.items.indexOf(item); if(j >= 0){ if(item.offered) setOffered(item, false); m.items[j] = cu.old; openFood.delete(item.id); openFood.add(cu.old.id); } delete changeUndo[item.id]; save(); homeChanged(); }, "inline"));
        more.appendChild(p);
      }else{
        const c = textBtn(say("meal.change"), ()=>{ more.querySelector(".fr-alts").hidden = false; const first = more.querySelector(".fr-alts button"); if(first) first.focus(); }, "small");
        c.setAttribute("aria-label", say("meal.changeTo", {food:baseName(item)}));
        more.appendChild(c);
        const alts = document.createElement("div");
        alts.className = "fr-alts"; alts.hidden = true;
        const opts = alternatives(m, k);
        if(!opts.length) alts.textContent = say("meal.noChange");
        opts.forEach(f=>{
          const ob = document.createElement("button");
          ob.type = "button"; ob.className = "alt";
          ob.innerHTML = `${foodArt(f.name, {size:24})}<span>${esc(f.name.split(",")[0])}</span>`;
          ob.addEventListener("click", ()=>{
            const at = m.items.indexOf(item), old = item;
            if(old.offered) setOffered(old, false);
            const fresh_ = dish(f, st);
            if(old.offered) setOffered(fresh_, true);
            m.items[at] = fresh_;
            openFood.delete(old.id); openFood.add(fresh_.id);
            changeUndo[fresh_.id] = {until:Date.now() + 5000, old};
            setTimeout(()=>{ delete changeUndo[fresh_.id]; homeChanged(); }, 5050);
            save(); haptic(); homeChanged(); focusLater("fr:" + fresh_.id);
            announce(say("meal.changed", {food:lower1(f.name.split(",")[0])}));
          });
          alts.appendChild(ob);
        });
        more.appendChild(alts);
      }
    }
    li.appendChild(more);
    ul.appendChild(li);
  });
  a.appendChild(ul);
  const how = mealHow(m);
  if(how.length) a.insertAdjacentHTML("beforeend", `<p class="mx-how">${how.map(esc).join(" ")}</p>`);
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
    const u = textBtn(say("meal.undo"), ()=>{ delete undoUntil[x.key]; offerMeal(m, false); save(); announce(say("home.announce.unoffered", {meal:m.label})); homeChanged(); focusLater("offer:" + x.key); }, "inline");
    u.dataset.f = "undo:" + x.key;
    acts.appendChild(u);
  }
  a.appendChild(acts);
  if(on && !undo){
    const g = document.createElement("div");
    g.className = "outcomes"; g.setAttribute("role", "group"); g.setAttribute("aria-label", say("meal.outcomeLabel"));
    ["loved","some","nottoday"].forEach(v=>{
      const ob = document.createElement("button");
      ob.type = "button"; ob.className = "outcome"; ob.dataset.f = `out:${x.key}:${v}`;
      ob.setAttribute("aria-pressed", String(m.outcome===v));
      ob.textContent = say("meal.outcome." + v);
      ob.addEventListener("click", ()=>{ setOutcome(m, v); save(); haptic(); homeChanged(); });
      g.appendChild(ob);
    });
    a.appendChild(g);
  }
  const links = document.createElement("p");
  links.className = "mx-links";
  if(addingTo===x.key){
    const b = blank({min:8, maxLength:30, onEnter:()=>{
      const v = b.input.value.trim(); addingTo = null;
      if(v){
        const pool = FOOD_POOL.find(f=>foodOf(f.name) && foodOf(f.name)===foodOf(v));
        const item = it(pool ? pool.name : upper1(v), "", pool ? pool.cats.slice() : ["other"]);
        if(lockedRule(item.name, ageNow()) || allergyMatch(item.name, state.profile)){ announce(keepOutReason(item.name)); homeChanged(); return; }
        m.items.push(item);
        if(mealOffered({items:m.items.filter(i=>i!==item)}) || m.items.length===1) setOffered(item, true);
        save(); announce(say("meal.added", {food:upper1(v)}));
      }
      homeChanged(); focusLater("add:" + x.key);
    }});
    b.input.dataset.f = "adding:" + x.key;
    b.input.addEventListener("keydown", e=>{ if(e.key==="Escape"){ e.preventDefault(); e.stopPropagation(); addingTo = null; homeChanged(); focusLater("add:" + x.key); } });
    const parts = say("meal.alsoOffered").split("{blank}");
    const l = document.createElement("label"); l.htmlFor = b.input.id; l.textContent = parts[0].trim();
    links.append(l, " ", b.el);
    requestAnimationFrame(()=>b.input.focus());
  }else{
    const add = textBtn(say("meal.addOther"), ()=>{ addingTo = x.key; homeChanged(); }, "small");
    add.dataset.f = "add:" + x.key;
    links.appendChild(add);
    links.append(" ");
    const sd = textBtn(say("meal.send"), ()=>openSheet("send", {date:x.date}), "small");
    sd.dataset.f = "send:" + x.key;
    links.appendChild(sd);
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
let addingTo = null;
/* three safe alternatives from the same food group for this meal */
function alternatives(m, k){
  const item = m.items[k], months = planMonths(), slot = (MEAL_SLOTS.find(x=>x.id===m.slot) || {}).slot || SLOT_OF[m.label] || "lunch";
  const taken = new Set(m.items.map(i=>i.name));
  const known = introducedAllergens(state.profile);
  const pool = FOOD_POOL.filter(f=>f.cats[0]===item.cats[0] && f.slots.includes(slot) && !taken.has(f.name) && isAllowed(f, months, state.profile)
                                  && newAllergens(f.name, known).length===0);   // a swap never brings a first allergen
  return shuffledFor(pool.filter(f=>hasArt(foodOf(f.name)) && !dislikeMatch(f.name, state.profile)), item.id).concat(shuffledFor(pool.filter(f=>!hasArt(foodOf(f.name))), item.id))
    .filter((f, i, a)=>a.indexOf(f)===i).slice(0, 3);
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
    row.innerHTML = `${foodArt(s.food, {size:24})}<p class="also-text">${esc(s.text)}${s.note ? `<span class="also-note">${esc(s.note)}</span>` : ""}</p>`;
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
  if(!dots.children.length) GROUPS.forEach(cat=>dots.insertAdjacentHTML("beforeend", `<span class="vdot" data-cat="${cat}"><i aria-hidden="true"></i><span>${esc(say("home.groups." + cat))}</span></span>`));
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
  [$("clock"), $("who"), $("headline"), $("moment"), $("openMeal")].forEach((el, k)=>el && el.animate([{opacity:0, transform:"translateY(10px)"}, {opacity:1, transform:"none"}],
    {duration:420, delay:k*70, easing:"cubic-bezier(.2,.8,.2,1)", fill:"backwards"}));
}
/* below-the-fold sections fade up as they come into view */
function watchFold(){
  if(!("IntersectionObserver" in window)){ document.querySelectorAll(".below").forEach(s=>s.classList.add("in")); return; }
  const io = new IntersectionObserver(es=>es.forEach(e=>{ if(e.isIntersecting){ e.target.classList.add("in"); io.unobserve(e.target); } }), {threshold:.15});
  document.querySelectorAll(".below").forEach(s=>io.observe(s));
}
function showMore(){ const w = $("weekSec"); w.classList.add("in"); w.scrollIntoView({behavior:calm() ? "auto" : "smooth", block:"start"}); }

/* a new week: the reveal, then "Love it" applies it */
function setNextWeek(){ closeSheet(true); openOnboarding("reveal", {single:true}); }

/* ====================================================================
   SHEETS: the one overlay. A bottom sheet with a scrim on narrow screens,
   a centred dialog on wide ones. Opens on tap (or Enter/Space), has a
   visible ✕, closes on Esc, a tap outside or a swipe down, traps focus
   (showModal) and gives focus back to what opened it.
   ==================================================================== */
const sheetEl = $("sheet"), sheetBody = $("sheetBody");
let sheetStack = [], sheetOpener = null;
const wideSheet = ()=>matchMedia("(min-width:768px)").matches;
function openSheet(kind, arg){
  if(sheetEl.open){ sheetStack.push({kind, arg}); renderSheetView(); return; }
  sheetOpener = document.activeElement;
  sheetStack = [{kind, arg}];
  renderSheetView();
  sheetEl.showModal();
  $("sheetTitle").focus({preventScroll:true});
  sheetEl.style.transform = "";
  sheetEl.animate(calm() ? [{opacity:0}, {opacity:1}] : [{opacity:0, transform:wideSheet() ? "translateY(12px)" : "translateY(40px)"}, {opacity:1, transform:"none"}],
                  {duration:220, easing:"cubic-bezier(.2,.8,.2,1)"});
}
function closeSheet(instant){
  if(!sheetEl.open) return;
  const done = ()=>{ sheetEl.close(); sheetStack = []; sheetEl.style.transform = ""; if(sheetOpener && document.contains(sheetOpener)) sheetOpener.focus({preventScroll:true}); };
  if(instant===true || calm()){ done(); return; }
  const a = sheetEl.animate([{opacity:1, transform:sheetEl.style.transform || "none"}, {opacity:0, transform:wideSheet() ? "translateY(8px)" : "translateY(30%)"}], {duration:150, easing:"cubic-bezier(.4,0,1,1)", fill:"forwards"});
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
$("sheetClose").addEventListener("click", ()=>closeSheet());
$("sheetBack").addEventListener("click", backSheet);
(()=>{ // swipe down on the grab bar or the header to let the sheet go (touch)
  let y0 = null, dy = 0;
  [$("sheetGrab"), $("sheetHead")].forEach(h=>{
    h.addEventListener("pointerdown", e=>{ if(wideSheet() || e.target.closest("button")) return; y0 = e.clientY; dy = 0; h.setPointerCapture(e.pointerId); });
    h.addEventListener("pointermove", e=>{ if(y0===null) return; dy = Math.max(0, e.clientY - y0); sheetEl.style.transform = `translateY(${dy}px)`; });
    h.addEventListener("pointerup", ()=>{ if(y0===null) return; y0 = null; if(dy > 90) closeSheet(); else sheetEl.style.transform = ""; });
  });
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
  b.innerHTML = `<i aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M6 12.5l4 4 8-9"/></svg></i>`;
  b.addEventListener("click", fn);
  return b;
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
    const need = shopList("week"), order = dayDisplayOrder().map(i=>state.plan.days[i].name);
    if(!need.length && !state.extras.some(x=>!x.checked)) body.insertAdjacentHTML("beforeend", `<p class="s-empty">${esc(say("shopSheet.none"))}</p>`);
    need.forEach(n=>{
      const {short} = shortfall(n.key), st = state.stock[n.key];
      const first = n.days.slice().sort((a, b)=>order.indexOf(a) - order.indexOf(b))[0];
      const word = name=>{ const k = order.indexOf(name); return k===0 ? say("shopSheet.today") : k===1 ? say("shopSheet.tomorrow") : fmtWeekday(dateOfPlanDay(name)); };
      const when = st && st.g > 0 && short ? say("shopSheet.runsOut", {weekday:word(short)}) : say("shopSheet.forDay", {weekday:word(first)});
      const row = document.createElement("div");
      row.className = "s-item";
      row.innerHTML = `${foodArt(n.name, {size:28})}<p class="s-item-t"><span class="s-item-n">${esc(baseName(n))}</span><span class="s-item-sub">${esc(when)}</span></p>`;
      row.appendChild(sheetRing(false, say("shopSheet.bought", {food:baseName(n)}), ()=>{
        const amt = toBuy(n), g = amt===null ? null : buyPacks(n.name, amt).g;
        addToStock(n.key, n.name, g); sessionBought[n.key] = g; haptic(); announce(say("shopSheet.bought", {food:baseName(n)})); homeChanged();
      }, "buy:" + n.key));
      body.appendChild(row);
    });
    state.extras.filter(x=>!x.checked).forEach(x=>{
      const row = document.createElement("div");
      row.className = "s-item";
      row.innerHTML = `${foodArt(null, {size:28})}<p class="s-item-t"><span class="s-item-n">${esc(x.name)}</span><span class="s-item-sub">${esc(x.qty || "")}</span></p>`;
      row.appendChild(sheetRing(false, say("shopSheet.bought", {food:x.name}), ()=>{ x.checked = true; save(); haptic(); homeChanged(); }, "extra:" + x.id));
      body.appendChild(row);
    });
    // also pick up: something that isn't on the plan
    const p = document.createElement("p");
    p.className = "s-add";
    const b = blank({min:8, maxLength:40, onEnter:()=>{ const v = b.input.value.trim(); if(!v) return; state.extras.push({id:uid(), name:upper1(v), qty:"", checked:false}); save(); homeChanged(); focusLater("also-get"); }});
    b.input.dataset.f = "also-get";
    const parts = say("shopSheet.alsoGet").split("{blank}");
    const l = document.createElement("label"); l.htmlFor = b.input.id; l.textContent = parts[0].trim();
    p.append(l, " ", b.el);
    body.appendChild(p);
    // in stock: this week's foods that are at home, and anything ticked off
    const stocked = Object.values(needOn(windowDays("week"))).filter(n=>toBuy(n)===0);
    const ticked = state.extras.filter(x=>x.checked);
    if(stocked.length || ticked.length){
      body.insertAdjacentHTML("beforeend", `<h3 class="s-sec">${esc(say("shopSheet.inStock"))}</h3>`);
      stocked.forEach(n=>{
        const row = document.createElement("div");
        row.className = "s-item";
        row.innerHTML = `${foodArt(n.name, {size:28})}<p class="s-item-t"><span class="s-item-n">${esc(baseName(n))}</span></p>`;
        row.appendChild(sheetRing(true, say("shopSheet.notBought", {food:baseName(n)}), ()=>{
          const g = sessionBought[n.key], st = state.stock[n.key];
          if(g && st && st.g!==null) st.g = Math.max(0, st.g - g); else delete state.stock[n.key];
          delete sessionBought[n.key]; save(); haptic(); homeChanged();
        }, "unbuy:" + n.key));
        body.appendChild(row);
      });
      ticked.forEach(x=>{
        const row = document.createElement("div");
        row.className = "s-item";
        row.innerHTML = `${foodArt(null, {size:28})}<p class="s-item-t"><span class="s-item-n">${esc(x.name)}</span></p>`;
        row.appendChild(sheetRing(true, say("shopSheet.notBought", {food:x.name}), ()=>{ x.checked = false; save(); homeChanged(); }, "unextra:" + x.id));
        body.appendChild(row);
      });
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
const THEME = {dawn:"#E5D0BE", day:"#DBD3C6", golden:"#E3CFB1", evening:"#3D4662"};   // the top of the sky, per phase
function updateChrome(){
  document.title = currentTitle;
  const meta = document.querySelector('meta[name="theme-color"]');
  const c = THEME[document.documentElement.dataset.tod] || THEME.day;
  if(meta && meta.content!==c) meta.content = c;
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
  if(todayISO()!==lastISO){ picked = null; homeChanged(); return; }   // midnight: a new day, its own plan
  renderHome();
}
function scheduleTick(){
  clearTimeout(clockTimer);
  if(document.hidden || SNAPSHOT) return;
  clockTimer = setTimeout(()=>{ tick(); scheduleTick(); }, 60000 - (Date.now() % 60000) + 40);
}

/* ---------- init ---------- */
(function init(){
  if(SNAPSHOT){
    // the viewer's own Chicho data is never touched
    save = function(){};
    try{ const set = Storage.prototype.setItem; Storage.prototype.setItem = function(k, v){ if(this===localStorage) return; return set.call(this, k, v); }; }catch(e){}
    document.querySelector(".top") && document.querySelector(".top").remove();
    renderSnapshot();
    return;
  }
  setText($("sendLabel"), say("home.send"));
  setText($("alsoLabel"), say("home.also"));
  setText($("earlierLabel"), say("home.earlier"));
  setText($("weekLabel"), say("home.week"));
  setText($("shopLabel"), say("shopSheet.title"));
  setText($("varLabel"), say("home.variety.label"));
  $("moreBtn").setAttribute("aria-label", say("home.more"));
  $("sendBtn").addEventListener("click", ()=>openSheet("send", {}));
  $("profileBtn").addEventListener("click", ()=>openSheet("profile"));
  $("shopLine").addEventListener("click", ()=>openSheet("shop"));
  $("moreBtn").addEventListener("click", showMore);
  document.addEventListener("keydown", e=>{ if(e.key==="ArrowDown" && (document.activeElement===document.body || document.activeElement===$("headline")) && !sheetEl.open && $("onboarding").hidden){ e.preventDefault(); showMore(); } });
  currentDay = dayDisplayOrder()[0];
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
