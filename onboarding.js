// The onboarding: one sentence per screen (index.html holds the data, the generator and the stages).
/* ---------- onboarding ----------
   One sentence per screen, completed by you: the field sits inside the
   sentence as its missing word. Every answer is saved as it's given, so
   closing the tab and coming back resumes at the same step, and Back keeps
   what was entered. Nothing about the plan changes until "Love it". */
const ONB_STEPS = ["welcome","name","birthday","keepout","priorities","athome","mealtimes","reveal"];
const STAPLES = [
  ["Oats","Oatmeal"],["Rice","Rice, soft-cooked"],["Pasta","Whole wheat pasta"],["Bread","Whole wheat toast"],
  ["Eggs","Egg, well cooked"],["Yogurt","Greek yogurt"],["Cheese","Cheese, grated"],["Lentils","Lentils"],
  ["Chickpeas","Chickpeas"],["Frozen peas","Peas"],["Frozen spinach","Spinach, cooked"],["Potatoes","Potato"],
  ["Sweet potatoes","Sweet potato"],["Carrots","Carrots, soft-cooked"],["Bananas","Banana"],["Apples","Apple, cooked"],
  ["Avocado","Avocado"],["Olive oil","Olive oil"]
];
/* each allergen pill shows the drawing of a food that carries it, when there is one */
const ALLERGEN_ART = {egg:"egg", milk:"milk", peanut:"peanut-butter", wheat:"toast", soy:"tofu", fish:"white-fish", sesame:"hummus"};
let onb = {step:0, sub:null, dir:1, draft:null, revealed:false, kind:"allergy", adding:false};
const S = key=>ONB_STEPS.indexOf(key);

/* months to plan for: a baby under 6 months only gets a menu if the
   family chose to explore anyway, and then it's a first-tastes week */
function planMonths(){
  const m = ageNow();
  return m < 6 && state.profile.exploreEarly ? 6 : m;
}
/* Ask late: a first run (or a replay) asks only what safety needs (name,
   birthday, allergens); the rest is asked later, in context, one at a time,
   and always reachable from the profile sheet. Meal times need meals. */
const LATE_STEPS = ["priorities","athome","mealtimes"];
function stepApplies(key){
  if(key==="mealtimes" && planMonths() < 6) return false;
  return !LATE_STEPS.includes(key) || !!onb.single;
}
function stepAfter(n){ let k = n + 1; while(k < ONB_STEPS.length-1 && !stepApplies(ONB_STEPS[k])) k++; return k; }
function stepBefore(n){ let k = n - 1; while(k > 0 && !stepApplies(ONB_STEPS[k])) k--; return Math.max(0, k); }
function nextStep(){ goStep(stepAfter(onb.step)); }

/* step is an index or a name ("reveal") */
function openOnboarding(step, opts){
  const P = state.profile;
  if(typeof step==="string") step = S(step);
  const o = opts || {};
  onb.step = Math.max(0, Math.min(ONB_STEPS.length-1, step===undefined ? (P.onboardingStep||0) : step));
  // from the profile menu: one step (single) or a few (through), then back home
  onb.from = o.single || o.through ? onb.step : null;
  onb.through = o.through ? S(o.through) : o.single ? onb.step : null;
  onb.single = onb.through!==null;
  onb.replay = !!o.replay;
  onb.sub = null; onb.draft = null; onb.revealed = false; onb.adding = false;
  document.body.classList.add("onb-open");
  document.getElementById("app").inert = true; document.body.classList.add("is-onb");
  const el = document.getElementById("onboarding");
  el.hidden = false;
  document.getElementById("onbClose").hidden = !P.onboarded;   // a re-run can be left; a first run can't
  renderOnb();
  focusStep();
}
function closeOnboarding(){
  document.getElementById("onboarding").hidden = true;
  document.body.classList.remove("onb-open");
  document.getElementById("app").inert = false; document.body.classList.remove("is-onb");
  clearInterval(welTimer); clearTimeout(onb.revealTimer);
  homeChanged();
}
function finishOnboarding(){
  if(!state.profile.firstDay) state.profile.firstDay = todayISO();   // late questions never come on day one
  state.profile.onboarded = true;
  state.profile.onboardingStep = 0;
  delete state.profile.returning;
  save();
  closeOnboarding();
}
/* the first blank waits with its caret; otherwise the sentence itself takes focus */
function focusStep(){
  const card = document.getElementById("onbCard");
  const f = card.querySelector(".blank-input:not([type=time])");
  const title = card.querySelector("#onbTitle");
  document.getElementById("onboarding").classList.toggle("has-field", !!card.querySelector(".blank-input"));
  if(f && !card.querySelector(".pad")){ f.focus({preventScroll:true}); keepInView(); }
  else if(title){ title.tabIndex = -1; title.focus({preventScroll:true}); }
}
/* the field being typed in and the Next button stay above the keyboard; one smooth scroll, never a jump */
function keepInView(){
  const el = document.getElementById("onboarding");
  if(el.hidden) return;
  const a = document.activeElement, cta = el.querySelector(".onb-cta");
  if(!a || !el.contains(a)) return;
  const box = el.getBoundingClientRect(), r = a.getBoundingClientRect(), c = cta ? cta.getBoundingClientRect() : r;
  const bottom = box.bottom - 16;
  let dy = 0;
  if(Math.max(r.bottom, c.bottom) > bottom) dy = Math.max(r.bottom, c.bottom) - bottom;
  if(r.top - dy < box.top + 8) dy = r.top - box.top - 8;
  if(Math.abs(dy) > 1) el.scrollBy({top:dy, behavior:calm() ? "auto" : "smooth"});
}
kbListeners.push(()=>requestAnimationFrame(keepInView));
/* iOS only opens the keyboard for a focus inside a tap. The next step's field doesn't exist yet when Next is
   tapped, so a hidden field takes the focus during the tap, and the real one takes it over after the swap. */
function holdKeyboard(n){
  if(ONB_STEPS[n]!=="birthday") return;   // the name step starts on the pad, not the keyboard
  let p = document.getElementById("kbProxy");
  if(!p){ p = document.createElement("input"); p.id = "kbProxy"; p.className = "kb-proxy"; p.setAttribute("aria-hidden", "true"); p.tabIndex = -1; document.body.appendChild(p); }
  p.inputMode = ONB_STEPS[n]==="birthday" ? "numeric" : "text";
  p.focus({preventScroll:true});
}
/* the finished sentence slides up and fades; the next one rises in */
function goStep(n, sub){
  if(onb.single && (n < onb.from || n > onb.through)){ save(); closeOnboarding(); return; }
  const card = document.getElementById("onbCard");
  onb.dir = n > onb.step || (n===onb.step && sub) ? 1 : -1;
  const swap = ()=>{
    onb.step = n; onb.sub = sub || null; onb.adding = false;
    if(!onb.single) state.profile.onboardingStep = n;
    save();
    renderOnb();
    if(!calm()) card.animate([{transform:`translateY(${onb.dir*28}px)`, opacity:0}, {transform:"none", opacity:1}],
                             {duration:320, easing:"cubic-bezier(.32,1.25,.5,1)"});
    else card.animate([{opacity:0},{opacity:1}], {duration:180});
    focusStep();
  };
  holdKeyboard(n);
  if(calm()){ swap(); return; }
  const out = card.animate([{transform:"none", opacity:1}, {transform:`translateY(${-onb.dir*24}px)`, opacity:0}],
                           {duration:170, easing:"cubic-bezier(.22,.61,.36,1)", fill:"forwards"});
  out.onfinish = ()=>{ out.cancel(); swap(); };
}

function renderOnb(){
  const P = state.profile, key = ONB_STEPS[onb.step];
  const dots = document.getElementById("onbDots");
  const shown = ONB_STEPS.filter((k, i)=>i > 0 && stepApplies(k));   // the welcome has no dot
  dots.innerHTML = shown.map(k=>`<i class="${k===key ? "on" : ""}"></i>`).join("");
  document.getElementById("onbProgress").textContent = onb.step ? `Step ${shown.indexOf(key)+1} of ${shown.length}` : "";
  const back = document.getElementById("onbBack");
  back.hidden = onb.step===0 && !onb.sub && !onb.single;
  back.setAttribute("aria-label", say("onb.back"));
  back.onclick = ()=> onb.sub ? goStep(onb.step) : onb.single && onb.step===onb.from ? closeOnboarding() : goStep(stepBefore(onb.step));
  const close = document.getElementById("onbClose");
  close.textContent = say("onb.close"); close.onclick = closeOnboarding;
  const card = document.getElementById("onbCard");
  card.innerHTML = "";
  card.className = "onb-card bare";
  clearInterval(welTimer); clearTimeout(onb.revealTimer);
  document.getElementById("onboarding").classList.toggle("is-welcome", key==="welcome");
  ({welcome:onbWelcome, name:onbName, birthday:onbBirthday, keepout:onbKeepout, priorities:onbPriorities,
    athome:onbAtHome, mealtimes:onbMealTimes, reveal:onbReveal})[key](card, P);
}

/* ---------- the pieces every step is made of ---------- */
const esc = t=>String(t).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
/* A blank inside a sentence: an input that grows with what you type (a hidden
   mirror sets its width), on a thick underline that pulses softly until the
   first keystroke. state: "" (empty) · "ok" (a valid value: the line darkens) · "hint" */
function blank(o){
  const wrap = document.createElement("span");
  wrap.className = "blank" + (o.value ? "" : " idle");
  wrap.style.setProperty("--min", (o.min || 3) + "ch");
  const mirror = document.createElement("span");
  mirror.className = "blank-mirror"; mirror.setAttribute("aria-hidden", "true");
  const inp = document.createElement("input");
  inp.className = "blank-input"; inp.type = "text"; inp.id = o.id || "b" + uid();
  inp.autocomplete = o.autocomplete || "off"; inp.spellcheck = false;
  inp.setAttribute("autocapitalize", o.autocapitalize || (o.inputmode ? "off" : "sentences"));
  inp.setAttribute("autocorrect", "off");
  inp.enterKeyHint = o.enterkeyhint || "done";
  if(o.inputmode) inp.inputMode = o.inputmode;
  if(o.maxLength) inp.maxLength = o.maxLength;
  if(o.label) inp.setAttribute("aria-label", o.label);
  if(o.list) inp.setAttribute("list", o.list);
  inp.value = o.value || "";
  const sync = ()=>{ mirror.textContent = inp.value || " ".repeat(o.min || 3); };
  sync();
  inp.addEventListener("input", ()=>{ wrap.classList.remove("idle"); sync(); o.onInput && o.onInput(inp.value); });
  inp.addEventListener("keydown", e=>{ if(e.key==="Enter"){ e.preventDefault(); o.onEnter && o.onEnter(); } });
  wrap.append(mirror, inp);
  return {el:wrap, input:inp, sync, set(state){ wrap.dataset.state = state || ""; }};
}
/* a sentence from content with {blank}-style slots filled by elements; the words
   before the first slot become a <label> for it */
function sentence(text, slots, cls){
  const h = document.createElement("h1");
  h.className = cls || "sent"; h.id = "onbTitle"; h.tabIndex = -1;
  const parts = text.split(/\{(\w+)\}/);
  let labelled = false;
  parts.forEach((part, k)=>{
    if(k % 2===0){
      if(!part) return;
      const next = slots[parts[k+1]];
      if(!labelled && next && next.input){
        const l = document.createElement("label");
        l.htmlFor = next.input.id; l.textContent = part.replace(/\s+$/, "");
        h.append(l, part.endsWith(" ") ? " " : "");
        labelled = true;
      }else h.append(part);
    }else{
      const slot = slots[part];
      h.append(slot ? slot.el : `{${part}}`);
    }
  });
  return h;
}
function line(text, cls){ const p = document.createElement("p"); p.className = cls || "onb-line"; p.innerHTML = keepSentences(esc(text)); return p; }
function hint(){ const p = document.createElement("p"); p.className = "onb-hint"; p.setAttribute("aria-live", "polite"); return p; }
/* the primary button (fades in once the step has a valid value) and quiet text buttons */
function onbCta(card, label, onNext, opts){
  const o = opts || {};
  const wrap = document.createElement("div");
  wrap.className = "onb-cta";
  const b = document.createElement("button");
  b.type = "button"; b.className = "btn-ink";
  b.textContent = onb.single && onb.step===onb.through && label===say("onb.next") ? say("onb.save") : label;
  b.addEventListener("click", ()=>{ if(b.classList.contains("wait")) return; haptic(); onNext(); });
  wrap.appendChild(b);
  (o.extra || []).forEach(x=>{
    const e = document.createElement("button");
    e.type = "button"; e.className = "btn-text"; e.textContent = x.label;
    e.addEventListener("click", x.on);
    wrap.appendChild(e);
  });
  card.appendChild(wrap);
  const ready = v=>{ b.classList.toggle("wait", !v); b.tabIndex = v ? 0 : -1; b.setAttribute("aria-hidden", String(!v)); };
  ready(o.ready===undefined ? true : o.ready);
  b.ready = ready;
  return b;
}
/* an outline pill; filled (black, white text) when on */
function pillBtn(text, artId, opts){
  const o = opts || {};
  const b = document.createElement("button");
  b.type = "button"; b.className = "pill-o" + (o.cls ? " " + o.cls : "");
  b.innerHTML = (artId!==undefined ? foodArt(artId, {size:24, alt:""}) : "") + `<span>${esc(text)}</span><i class="pill-mark" aria-hidden="true"></i>`;
  return b;
}

/* a line breaks between its sentences, not inside one, when each fits */
function keepSentences(text){ return text.split(/(?<=[.!?…])\s+/).map(t=>`<span class="keep">${t}</span>`).join(" "); }

/* 1. welcome: one drawing at a time, crossfading through the hero foods */
let welTimer = 0;
function onbWelcome(card){
  const heroes = HERO_FOODS.filter(id=>hasArt(foodOf(id)));
  const art = id=>foodArt(id, {size:140, alt:""});
  card.classList.add("wel-in", "narrow");
  card.innerHTML = `<div class="wel-art" aria-hidden="true" style="--d:0ms"><div class="wel-bob">
      <span class="wel-layer is-on">${art(heroes[0])}</span><span class="wel-layer"></span></div></div>
    <h1 class="onb-h wel-h" id="onbTitle" tabindex="-1" style="--d:120ms">${say("onb.welcome.title")}</h1>
    <p class="wel-p" style="--d:200ms">${keepSentences(say("onb.welcome.line"))}</p>`;
  const b = document.createElement("button");
  b.type = "button"; b.className = "btn-ink"; b.style.setProperty("--d", "280ms");
  b.textContent = say("onb.welcome.cta");
  b.addEventListener("click", ()=>{ haptic(); goStep(1); });
  card.appendChild(b);
  welcomeCycle(card, heroes);
}
/* every ~3 s the next food rises in with a small turn while the last one lifts away;
   only the next drawing is fetched ahead, and nothing runs while the tab is hidden */
function welcomeCycle(card, heroes){
  clearInterval(welTimer);
  if(heroes.length < 2) return;
  const warm = id=>{ const f = foodOf(id); const im = new Image(); im.decoding = "async"; im.src = devicePixelRatio > 1.5 ? f.files.w384 : f.files.w192; };
  let k = 0;
  warm(heroes[1]);
  welTimer = setInterval(()=>{
    if(!card.isConnected || !card.classList.contains("wel-in")){ clearInterval(welTimer); return; }
    if(document.hidden) return;
    const cur = card.querySelector(".wel-layer.is-on"), next = card.querySelector(".wel-layer:not(.is-on)");
    if(!cur || !next) return;
    k = (k + 1) % heroes.length;
    next.innerHTML = foodArt(heroes[k], {size:140, alt:""});
    const img = next.querySelector("img");
    (img && img.decode ? img.decode().catch(()=>{}) : Promise.resolve()).then(()=>{
      cur.classList.remove("is-on"); next.classList.add("is-on");
      if(calm()){
        next.animate([{opacity:0}, {opacity:1}], {duration:400});
        cur.animate([{opacity:1}, {opacity:0}], {duration:400});
      }else{
        next.animate([{opacity:0, transform:"translateY(10px) rotate(-8deg) scale(.92)"}, {opacity:1, transform:"none"}],
                     {duration:400, easing:"cubic-bezier(.32,1.25,.5,1)"});
        cur.animate([{opacity:1, transform:"none"}, {opacity:0, transform:"translateY(-12px) rotate(5deg) scale(.96)"}],
                    {duration:280, easing:"cubic-bezier(.22,.61,.36,1)"});
      }
      warm(heroes[(k + 1) % heroes.length]);
    });
  }, 3000);
}

/* 2. name: "Write their name." on a drawing pad (the ink is how the name shows in Chicho), then "Spelled ____."
   for the words that say it. The ink never leaves the device. */
function onbName(card, P){
  let next;
  const h = document.createElement("h1");
  h.className = "sent"; h.id = "onbTitle"; h.tabIndex = -1; h.textContent = say("onb.name.draw");
  card.append(h, line(say("onb.name.drawLine")), inkPad(P));
  const b = blank({value:P.name || "", min:4, maxLength:30, autocomplete:"given-name", autocapitalize:"words", enterkeyhint:"next",
    onInput:v=>{ P.name = v.trim(); save(); b.set(P.name ? "ok" : ""); next.ready(!!P.name); },
    onEnter:()=>{ if(P.name) nextStep(); }});
  b.set(P.name ? "ok" : "");
  const sp = sentence(say("onb.name.spell"), {blank:b}), p = document.createElement("p");
  p.className = "sent spell";
  while(sp.firstChild) p.appendChild(sp.firstChild);
  card.appendChild(p);
  next = onbCta(card, say("onb.name.cta"), ()=>{ if(P.name) nextStep(); }, {ready:!!P.name});
}
/* the pad: a finger (or pen, or mouse) writes; strokes are kept as points, drawn smooth, saved on every lift */
function inkPad(P){
  const wrap = document.createElement("div");
  wrap.className = "pad-wrap";
  const c = document.createElement("canvas");
  c.className = "pad"; c.setAttribute("role", "img"); c.setAttribute("aria-label", say("onb.name.pad"));
  const clear = document.createElement("button");
  clear.type = "button"; clear.className = "btn-text small pad-clear"; clear.textContent = say("onb.name.clear");
  wrap.append(c, clear);
  let strokes = P.ink && Array.isArray(P.ink.strokes) ? P.ink.strokes.map(s=>s.slice()) : [], cur = null, W = 0, H = 0, from = P.ink ? P.ink.w : 0;
  const size = ()=>{
    const r = c.getBoundingClientRect(), d = Math.min(3, devicePixelRatio || 1);
    if(!r.width) return false;
    if(from && W===0 && r.width!==from){ const k = r.width / from; strokes = strokes.map(s=>s.map(v=>v * k)); }
    W = r.width; H = r.height; c.width = Math.round(W * d); c.height = Math.round(H * d);
    c.getContext("2d").setTransform(d, 0, 0, d, 0, 0);
    return true;
  };
  const draw = ()=>{
    const x = c.getContext("2d");
    x.clearRect(0, 0, W, H);
    x.strokeStyle = x.fillStyle = getComputedStyle(wrap).color; x.lineWidth = INK_WIDTH; x.lineCap = x.lineJoin = "round";
    strokes.concat(cur ? [cur] : []).forEach(s=>{ x.beginPath(); inkPath(s, (cmd, ...a)=>x[cmd](...a)); x.stroke(); });
    clear.hidden = !strokes.length;
  };
  const keep = ()=>{ P.ink = strokes.length ? {w:Math.round(W), h:Math.round(H), strokes:strokes.map(s=>s.map(v=>Math.round(v * 10) / 10))} : null; save(); };
  const pt = e=>{ const r = c.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  c.addEventListener("pointerdown", e=>{ if(!W && !size()) return; e.preventDefault(); try{ c.setPointerCapture(e.pointerId); }catch(_){} cur = pt(e); draw(); });
  c.addEventListener("pointermove", e=>{
    if(!cur) return;
    const [x, y] = pt(e), n = cur.length;
    if(Math.hypot(x - cur[n - 2], y - cur[n - 1]) < 1.5) return;
    cur.push(x, y); draw();
  });
  const up = ()=>{ if(!cur) return; strokes.push(cur); cur = null; draw(); keep(); haptic(); };
  c.addEventListener("pointerup", up); c.addEventListener("pointercancel", up);
  clear.addEventListener("click", ()=>{ strokes = []; draw(); keep(); c.focus && c.focus(); });
  requestAnimationFrame(()=>{ if(size()) draw(); });
  return wrap;
}
/* one stroke as smooth curves through the midpoints of its points; a single point is a dot */
const INK_WIDTH = 4;
function inkPath(s, op){
  if(s.length < 4){ op("moveTo", s[0], s[1]); op("lineTo", s[0] + .01, s[1]); return; }
  op("moveTo", s[0], s[1]);
  for(let i = 2; i < s.length - 2; i += 2) op("quadraticCurveTo", s[i], s[i + 1], (s[i] + s[i + 2]) / 2, (s[i + 1] + s[i + 3]) / 2);
  op("lineTo", s[s.length - 2], s[s.length - 1]);
}
/* the name as drawn, an SVG cropped to the ink, in currentColor (both themes); "" when there's no ink */
function inkSVG(ink, cls){
  if(!ink || !Array.isArray(ink.strokes) || !ink.strokes.length) return "";
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  ink.strokes.forEach(s=>{ for(let i = 0; i < s.length; i += 2){ x0 = Math.min(x0, s[i]); x1 = Math.max(x1, s[i]); y0 = Math.min(y0, s[i + 1]); y1 = Math.max(y1, s[i + 1]); } });
  const pad = INK_WIDTH, f = v=>(Math.round(v * 10) / 10);
  const d = ink.strokes.map(s=>{ let out = ""; inkPath(s, (cmd, ...a)=>{ out += ({moveTo:"M", lineTo:"L", quadraticCurveTo:"Q"})[cmd] + a.map(f).join(" ") + " "; }); return out; }).join("");
  return `<svg class="${cls || "name-ink"}" viewBox="${f(x0 - pad)} ${f(y0 - pad)} ${f(x1 - x0 + 2 * pad)} ${f(y1 - y0 + 2 * pad)}" aria-hidden="true" focusable="false"><path d="${d.trim()}" fill="none" stroke="currentColor" stroke-width="${INK_WIDTH}" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

/* 3. birthday: "{name} arrived on __ / ____ / ____." The stage follows along below. */
const MONTH_NAMES = (()=>{ const f = new Intl.DateTimeFormat(undefined, {month:"long"}); return Array.from({length:12}, (_, k)=>f.format(new Date(2024, k, 1))); })();
const MONTHS_EN = ["january","february","march","april","may","june","july","august","september","october","november","december"];
/* "10", "oct", "October", "octubre" → 9; null when unclear */
function parseMonth(v){
  const t = String(v || "").trim().toLowerCase().replace(/\.$/, "");
  if(!t) return null;
  if(/^\d{1,2}$/.test(t)){ const n = +t; return n>=1 && n<=12 ? n-1 : null; }
  const hits = new Set();
  [MONTH_NAMES.map(m=>m.toLowerCase()), MONTHS_EN].forEach(list=>list.forEach((m, k)=>{ if(m===t || (t.length>=3 && m.startsWith(t))) hits.add(k); }));
  return hits.size===1 ? [...hits][0] : null;
}
function onbBirthday(card, P){
  const name = P.name || "They";
  if(onb.sub==="milk"){
    const m = ageNow(), left = Math.max(1, 6 - m);
    const [first, ...rest] = say("onb.birthday.milk", {name, n:left}).split(/(?<=\.)\s+/);
    const h = document.createElement("h1");
    h.className = "sent"; h.id = "onbTitle"; h.tabIndex = -1; h.textContent = first;
    card.append(h, line(rest.join(" ")));
    onbCta(card, say("onb.birthday.remind"), ()=>{
      const b = localDate(P.birthDate);
      const at = new Date(b.getFullYear(), b.getMonth()+6, b.getDate());
      P.remindAt = isoOf(at);
      P.exploreEarly = false; save(); nextStep();
    }, {extra:[{label:say("onb.birthday.explore"), on:()=>{ P.exploreEarly = true; save(); nextStep(); }}]});
    return;
  }
  const today = now();
  const had = P.birthDate ? localDate(P.birthDate) : null;
  let next;
  const check = ()=>{
    const d = +day.input.value, mo = parseMonth(month.input.value), y = +year.input.value;
    day.set(d>=1 && d<=31 ? "ok" : ""); month.set(mo!==null ? "ok" : ""); year.set(/^\d{4}$/.test(year.input.value) ? "ok" : "");
    let msg = "", date = null;
    if(day.input.value && month.input.value && year.input.value){
      if(mo===null) msg = say("onb.birthday.hint.month", {month:MONTH_NAMES[today.getMonth()]});
      else if(!/^\d{4}$/.test(year.input.value) || y < today.getFullYear()-10) msg = say("onb.birthday.hint.year", {year:today.getFullYear()-1});
      else{
        const max = new Date(y, mo+1, 0).getDate();
        if(d < 1 || d > max){ msg = say("onb.birthday.hint.days", {month:MONTH_NAMES[mo], n:max}); day.set("hint"); }
        else{
          date = new Date(y, mo, d);
          if(date > today){ msg = say("onb.birthday.hint.future"); date = null; }
          else if(ageMonths(isoOf(date)) > AGE_MAX) msg = say("onb.birthday.hint.old");
        }
      }
    }
    help.textContent = msg;
    if(date){ P.birthDate = isoOf(date); save(); }
    paintStage(date ? ageMonths(isoOf(date)) : null);
    next.ready(!!date);
    return !!date;
  };
  const go = ()=>{ if(!check()) return; ageNow() < 6 ? goStep(onb.step, "milk") : (P.exploreEarly = false, save(), nextStep()); };
  // full = two digits, or one that can't start a longer number (day 4–9, month 2–9); the month also takes a name
  const day = blank({value:had ? String(had.getDate()) : "", min:2, maxLength:2, inputmode:"numeric", autocomplete:"bday-day", enterkeyhint:"next", label:say("onb.birthday.day"),
    onInput:v=>{ check(); if(/^\d{2}$/.test(v) || /^[4-9]$/.test(v)) month.input.focus(); }, onEnter:()=>month.input.focus()});
  const month = blank({value:had ? String(had.getMonth() + 1) : "", min:2, maxLength:9, inputmode:"numeric", autocomplete:"bday-month", enterkeyhint:"next", label:say("onb.birthday.month"),
    onInput:v=>{ check(); if(/^\d{2}$/.test(v) || /^[2-9]$/.test(v)) year.input.focus(); }, onEnter:()=>year.input.focus()});
  const year = blank({value:had ? String(had.getFullYear()) : "", min:4, maxLength:4, inputmode:"numeric", autocomplete:"bday-year", enterkeyhint:"done", label:say("onb.birthday.year"),
    onInput:()=>check(), onEnter:go});
  const s = sentence(say("onb.birthday.sentence", {name}), {day, month, year});
  // the day field is labelled by the words before it ("Lula arrived on"), the others by their own names
  card.append(s, line(say("onb.birthday.line")));
  const help = hint();
  const stage = document.createElement("div");
  stage.className = "stage-say"; stage.setAttribute("aria-live", "polite");
  stage.innerHTML = `<p class="stage-name"></p><p class="stage-line"></p>`;
  card.append(help, stage);
  let shownStage = null;
  function paintStage(m){
    const st = m===null ? null : stageFor(m);
    const id = st ? st.id : null;
    if(id===shownStage) return;
    shownStage = id;
    stage.querySelector(".stage-name").textContent = st ? st.name : "";
    stage.querySelector(".stage-line").textContent = st ? stageLine(st) : "";
    if(st && !calm()) stage.animate([{opacity:0, transform:"translateY(10px)"}, {opacity:1, transform:"none"}], {duration:320, easing:"cubic-bezier(.32,1.25,.5,1)"});
  }
  next = onbCta(card, say("onb.birthday.cta"), go, {ready:false});
  check();
}

/* 4. keep out: "Keep these off the plate." Pills cycle neutral → keep out → tried and loved */
function onbKeepout(card, P){
  const live = document.createElement("p");
  live.className = "sr-only"; live.setAttribute("aria-live", "polite");
  const h = document.createElement("h1");
  h.className = "sent"; h.id = "onbTitle"; h.tabIndex = -1; h.textContent = say("onb.keepOut.title");
  card.append(h, line(say("onb.keepOut.line")));
  const pills = document.createElement("div");
  pills.className = "pills";
  const word = st=>st==="avoid" ? say("onb.keepOut.out") : st==="ok" ? say("onb.keepOut.loved") : say("onb.keepOut.neutral");
  ALLERGENS.forEach(a=>{
    const b = pillBtn(a.label, ALLERGEN_ART[a.id] || null);
    const paint = ()=>{
      const st = P.allergens[a.id] || "";
      b.dataset.state = st==="avoid" ? "out" : st==="ok" ? "loved" : "";
      b.setAttribute("aria-label", `${a.label}: ${word(st)}`);
    };
    b.addEventListener("click", ()=>{
      const st = P.allergens[a.id];
      const next = !st ? "avoid" : st==="avoid" ? "ok" : null;
      if(next) P.allergens[a.id] = next; else delete P.allergens[a.id];
      save(); paint(); haptic();
      live.textContent = `${a.label}: ${word(next)}`;
    });
    paint();
    pills.appendChild(b);
  });
  // their own: "Also not ____" with Allergy / Dislike, then a removable pill
  const own = ()=>{
    pills.querySelectorAll(".pill-own, .pill-edit, .pill-add").forEach(x=>x.remove());
    P.avoid.forEach(x=>{
      const c = document.createElement("span");
      c.className = "pill-o pill-own"; c.dataset.state = "out";
      c.innerHTML = `${foodArt(x.name, {size:24, alt:""})}<span>${esc(x.name)} · ${x.kind==="allergy" ? say("onb.keepOut.allergy") : say("onb.keepOut.dislike")}</span>`;
      const rm = document.createElement("button");
      rm.type = "button"; rm.className = "pill-x"; rm.setAttribute("aria-label", say("onb.keepOut.remove", {food:x.name}));
      rm.addEventListener("click", ()=>{ P.avoid = P.avoid.filter(y=>y!==x); save(); own(); live.textContent = `${x.name} removed`; pills.querySelector(".pill-add").focus(); });
      c.appendChild(rm);
      pills.appendChild(c);
    });
    if(onb.adding){
      const e = document.createElement("span");
      e.className = "pill-o pill-edit";
      const b = blank({min:5, maxLength:30, onEnter:()=>commit()});
      const t = say("onb.keepOut.alsoNot").split("{blank}");
      const l = document.createElement("label"); l.htmlFor = b.input.id; l.textContent = t[0].trim();
      const kind = document.createElement("span");
      kind.className = "kind-toggle"; kind.setAttribute("role", "group"); kind.setAttribute("aria-label", `${say("onb.keepOut.allergy")} / ${say("onb.keepOut.dislike")}`);
      ["allergy","dislike"].forEach(k=>{
        const kb = document.createElement("button");
        kb.type = "button"; kb.textContent = say("onb.keepOut." + k); kb.setAttribute("aria-pressed", String(onb.kind===k));
        kb.addEventListener("click", ()=>{ onb.kind = k; kind.querySelectorAll("button").forEach(z=>z.setAttribute("aria-pressed", String(z===kb))); b.input.focus(); });
        kind.appendChild(kb);
      });
      e.append(l, " ", b.el, kind);
      const commit = ()=>{
        const v = b.input.value.trim();
        onb.adding = false;
        if(v){
          const have = P.avoid.find(f=>f.name.toLowerCase()===v.toLowerCase());
          if(have) have.kind = onb.kind; else P.avoid.push({name:v, kind:onb.kind});
          save(); live.textContent = `${v}: ${say("onb.keepOut." + onb.kind)}`;
        }
        own(); pills.querySelector(".pill-add").focus();
      };
      b.input.addEventListener("keydown", ev=>{ if(ev.key==="Escape"){ ev.preventDefault(); b.input.value = ""; commit(); } });
      e.addEventListener("focusout", ev=>{ if(!e.contains(ev.relatedTarget)) setTimeout(()=>{ if(e.isConnected && !e.contains(document.activeElement)) commit(); }, 0); });
      pills.appendChild(e);
      requestAnimationFrame(()=>b.input.focus());
    }
    const add = pillBtn(say("onb.keepOut.add"), undefined, {cls:"pill-add"});
    add.hidden = onb.adding;
    add.addEventListener("click", ()=>{ onb.adding = true; own(); });
    pills.appendChild(add);
  };
  own();
  card.append(pills, live);
  // what's always off the plate at this age; "Why?" opens one line per rule
  const locked = document.createElement("div");
  locked.className = "locked-say";
  const rules = LOCKED_RULES.filter(r=>!r.until || ageNow() < r.until);
  locked.innerHTML = `<p><svg class="lock-i" viewBox="0 0 16 16" aria-hidden="true"><rect x="3" y="7" width="10" height="7" rx="2"/><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" fill="none"/></svg>${esc(lockedLine(ageNow()))}
    <button type="button" class="btn-text small" aria-expanded="false">${say("onb.keepOut.why")}</button></p>
    <ul class="why-list" hidden>${rules.map(r=>`<li><b>${esc(r.label)}.</b> ${esc(r.why)}</li>`).join("")}</ul>`;
  const why = locked.querySelector("button"), wl = locked.querySelector(".why-list");
  why.addEventListener("click", ()=>{ wl.hidden = !wl.hidden; why.setAttribute("aria-expanded", String(!wl.hidden)); });
  card.append(locked, line(say("onb.keepOut.note"), "onb-note"));
  onbCta(card, say("onb.next"), nextStep);
}

/* 5. priorities: "This week, we care most about…" up to three, and how they steer the week */
function onbPriorities(card, P){
  const h = document.createElement("h1");
  h.className = "sent"; h.id = "onbTitle"; h.tabIndex = -1; h.textContent = say("onb.priorities.title");
  card.append(h, line(say("onb.priorities.line")));
  const pills = document.createElement("div");
  pills.className = "pills";
  const lean = line("", "onb-lean"); lean.setAttribute("aria-live", "polite");
  const paint = ()=>{
    pills.querySelectorAll(".pill-o").forEach(b=>{
      const on = P.priorities.includes(b.dataset.id);
      b.setAttribute("aria-pressed", String(on));
      b.disabled = !on && P.priorities.length>=3;
    });
    lean.textContent = priorityLine(P.priorities);
  };
  PRIORITIES.forEach(pr=>{
    const b = pillBtn(pr.label);
    b.dataset.id = pr.id;
    b.addEventListener("click", ()=>{
      P.priorities = P.priorities.includes(pr.id) ? P.priorities.filter(x=>x!==pr.id) : P.priorities.concat(pr.id).slice(0,3);
      save(); paint(); haptic();
    });
    pills.appendChild(b);
  });
  card.append(pills, lean);
  paint();
  onbCta(card, say("onb.priorities.cta"), nextStep);
}

/* 6. at home: "Already in the kitchen…" picks land in stock at their usual pack size */
function onbAtHome(card, P){
  const h = document.createElement("h1");
  h.className = "sent"; h.id = "onbTitle"; h.tabIndex = -1; h.textContent = say("onb.atHome.title");
  card.append(h, line(say("onb.atHome.line")));
  const pills = document.createElement("div");
  pills.className = "pills";
  STAPLES.filter(([,food])=>!allergyMatch(food, P)).forEach(([label, food])=>{
    const b = pillBtn(label, food);
    const on = ()=>P.staples.includes(food);
    b.setAttribute("aria-pressed", String(on()));
    b.addEventListener("click", ()=>{
      P.staples = on() ? P.staples.filter(x=>x!==food) : P.staples.concat(food);
      b.setAttribute("aria-pressed", String(on())); save(); haptic();
    });
    pills.appendChild(b);
  });
  card.appendChild(pills);
  // what's picked is at home: Plenty in the Kitchen (unless it's already marked)
  const stock = ()=>{
    P.staples.forEach(food=>{ const k = foodKey(baseName({name:food})); if(!stockState(k) || stockState(k)==="out") setStock(k, baseName({name:food}), "plenty"); });
    save();
  };
  onbCta(card, say("onb.atHome.cta"), ()=>{ stock(); nextStep(); }, {extra:[{label:say("onb.atHome.skip"), on:nextStep}]});
}

/* 7. meal times: "{name} usually eats at…" one time per meal the stage serves, prefilled */
function onbMealTimes(card, P){
  const months = planMonths(), defaults = stageTimes(months);
  const h = document.createElement("h1");
  h.className = "sent"; h.id = "onbTitle"; h.tabIndex = -1; h.textContent = say("onb.mealTimes.title", {name:P.name || "They"});
  card.append(h);
  const rows = document.createElement("div");
  rows.className = "mt-rows";
  slotsFor(months).forEach(slot=>{
    const ms = MEAL_SLOTS.find(x=>x.id===slot);
    const r = document.createElement("p");
    r.className = "mt-row";
    const id = "mt-" + slot;
    r.innerHTML = `<label for="${id}">${esc(say("onb.mealTimes.at", {meal:ms.label}))}</label> <span class="blank time" data-state="ok"><input class="blank-input" type="time" id="${id}" step="300" value="${(P.mealTimes||{})[slot] || defaults[slot]}"></span>`;
    r.querySelector("input").addEventListener("change", e=>{
      const v = hhmm(e.target.value);
      if(!v) return;
      const t = fmtHHMM(v);
      P.mealTimes = Object.assign({}, P.mealTimes);
      if(t===defaults[slot]) delete P.mealTimes[slot]; else P.mealTimes[slot] = t;   // the stage's defaults keep following the stage
      save();
    });
    rows.appendChild(r);
  });
  card.append(rows, line(say("onb.mealTimes.line")));
  onbCta(card, say("onb.mealTimes.cta"), ()=>{ P.mealTimesConfirmed = true; save(); nextStep(); },
         {extra:[{label:say("onb.mealTimes.usual"), on:()=>{ P.mealTimes = {}; P.mealTimesConfirmed = true; save(); nextStep(); }}]});
}

/* 8. the reveal: the table being set (≤ 2.5 s, skippable), then the week; applied only on "Love it" */
function onbReveal(card, P){
  const name = P.name || "";
  if(ageNow() < 6 && !P.exploreEarly){
    const h = document.createElement("h1");
    h.className = "sent"; h.id = "onbTitle"; h.tabIndex = -1; h.textContent = say("onb.restful.title");
    card.append(h, line(say("onb.restful.line")));
    onbCta(card, say("onb.restful.cta"), finishOnboarding);
    return;
  }
  if(!onb.draft) onb.draft = generateWeek(planMonths(), P);
  const draw = weekFoods(onb.draft);
  if(!onb.revealed){
    const h = document.createElement("h1");
    h.className = "sent"; h.id = "onbTitle"; h.tabIndex = -1; h.textContent = say("onb.reveal.title");
    const row = document.createElement("div");
    row.className = "rv-row"; row.setAttribute("aria-hidden", "true");
    row.innerHTML = draw.slice(0, 6).map((id, k)=>`<span class="rv-item" style="--k:${k};--r:${[-6,4,-3,6,-5,3][k]}deg">${foodArt(id, {size:32})}</span>`).join("");
    card.append(row, h);
    const done = ()=>{ if(onb.revealed) return; onb.revealed = true; clearTimeout(onb.revealTimer); if(ONB_STEPS[onb.step]==="reveal"){ renderOnb(); focusStep(); } };
    const skip = document.createElement("button");
    skip.type = "button"; skip.className = "btn-text"; skip.textContent = say("onb.reveal.skip");
    skip.addEventListener("click", done);
    card.append(skip);
    card.addEventListener("click", e=>{ if(e.target===card || row.contains(e.target)) done(); });
    onb.revealTimer = setTimeout(done, calm() ? 700 : 2300);
    return;
  }
  const h = document.createElement("h1");
  h.className = "sent"; h.id = "onbTitle"; h.tabIndex = -1; h.textContent = say("onb.done.title", {name});
  card.append(h, line(say("onb.done.line", {name})));
  card.appendChild(weekPreview(onb.draft));
  const extra = [{label:say("onb.done.shuffle"), on:()=>{ onb.draft = generateWeek(planMonths(), P); renderOnb(); focusStep(); }}];
  if(P.returning || (P.onboarded && hasPlan())) extra.push({label:say("onb.done.keep"), on:finishOnboarding});
  onbCta(card, say("onb.done.apply"), ()=>{
    startWeek(onb.draft, todayISO());   // nothing is lost: the offers stay in the log
    P.lastStage = stageNow().id;
    onb.draft = null;
    finishOnboarding();
  }, {extra});
}
/* the drawn foods of a week, most-used first, one each */
function weekFoods(week){
  const count = {};
  week.days.forEach(d=>d.meals.forEach(m=>m.items.forEach(i=>{ const f = foodOf(i.name); if(hasArt(f)) count[f.id] = (count[f.id] || 0) + 1; })));
  return Object.keys(count).sort((a, b)=>count[b] - count[a]);
}
/* a new week from a date: it starts then, and any week planned from that date on gives way to it */
function startWeek(week, iso){
  state.plans = state.plans.filter(p=>p.startsOn < iso).concat({startsOn:iso, days:week.days});
  save();
}
/* seven rows from a start date: "Thu · lunch: lentils and pumpkin · dinner: …" (text only; New week uses it too) */
function weekPreview(week, start){
  const wrap = document.createElement("ol");
  wrap.className = "wk-rows";
  const t = start || now(), first = Math.max(0, week.days.findIndex(d=>d.name===DAY_ORDER[t.getDay()]));
  const short = new Intl.DateTimeFormat(undefined, {weekday:"short"});
  week.days.forEach((_, pos)=>{
    const day = week.days[(first + pos) % week.days.length];
    const date = new Date(t.getFullYear(), t.getMonth(), t.getDate() + pos);
    const meals = day.meals.filter(m=>m.items.length);
    const li = document.createElement("li");
    li.className = "wk-row";
    li.innerHTML = `<span class="wk-name">${esc(short.format(date))}</span><span class="wk-meals">${esc(meals.map(m=>say("weekRow.meal", {meal:m.label.toLowerCase(), foods:listJoin(m.items.map(i=>lower1(baseName(i))))})).join(" · "))}</span>`;
    li.setAttribute("aria-label", `${DAY_FULL(date)}: ${meals.map(m=>m.label + ", " + listJoin(m.items.map(i=>lower1(baseName(i))))).join("; ")}`);
    wrap.appendChild(li);
  });
  return wrap;
}
