// The onboarding: one sentence per screen (index.html holds the data, the generator and the stages).
/* ---------- onboarding (v3) ----------
   Draw → Spell → Birthday → Allergens → Reveal → Done → Home. One sentence per screen, completed by you.
   Every answer is saved as it's given (and the step on every advance), so a reload resumes where it was,
   with "Welcome back." once. Nothing about the plan changes until "Love it". A replay or an edit from
   Profile works on the live profile, and Close puts back what was there when it opened. */
const ONB_STEPS = ["draw","spell","birthday","keepout","reveal","priorities","athome","mealtimes"];
/* legacy: the step order before v3, for a save that stopped mid-flow (onboardingStep was an index) */
const ONB_STEPS_V2 = ["welcome","name","birthday","keepout","priorities","athome","mealtimes","reveal"];
/* the four progress segments: Draw and Spell are both Name; Reveal and Done are both Week */
const ONB_SEGMENT = {draw:0, spell:0, birthday:1, keepout:2, reveal:3, done:3};
/* the glow behind each step (light theme): Reveal cycles through all five */
const ONB_GLOW = {draw:"grain", spell:"grain", birthday:"fruit", keepout:"protein", done:"fat"};
const STAPLES = [
  ["Oats","Oatmeal"],["Rice","Rice, soft-cooked"],["Pasta","Whole wheat pasta"],["Bread","Whole wheat toast"],
  ["Eggs","Egg, well cooked"],["Yogurt","Greek yogurt"],["Cheese","Cheese, grated"],["Lentils","Lentils"],
  ["Chickpeas","Chickpeas"],["Frozen peas","Peas"],["Frozen spinach","Spinach, cooked"],["Potatoes","Potato"],
  ["Sweet potatoes","Sweet potato"],["Carrots","Carrots, soft-cooked"],["Bananas","Banana"],["Apples","Apple, cooked"],
  ["Avocado","Avocado"],["Olive oil","Olive oil"]
];
let onb = {step:"draw", sub:null, dir:1, draft:null, revealed:false, kind:"allergy", adding:false, snapshot:null, welcomeBack:false};
const S = key=>ONB_STEPS.indexOf(key);

/* months to plan for: a baby under 6 months only gets a menu if the
   family chose to explore anyway (legacy: v2's "Look around anyway"), and then it's a first-tastes week */
function planMonths(){
  const m = ageNow();
  return m < 6 && state.profile.exploreEarly ? 6 : m;
}
/* Ask late: a first run (or a replay) asks only what safety needs (name, birthday, allergens); the rest is
   asked later, in context, one at a time, from Profile. Spell only follows a drawn name. Meal times need meals. */
const LATE_STEPS = ["priorities","athome","mealtimes"];
function stepApplies(key){
  if(key==="mealtimes" && planMonths() < 6) return false;
  if(key==="spell" && !(state.profile.ink && state.profile.ink.strokes && state.profile.ink.strokes.length)) return false;
  return !LATE_STEPS.includes(key) || !!onb.single;
}
function stepAfter(key){ let k = S(key) + 1; while(k < ONB_STEPS.length && !stepApplies(ONB_STEPS[k])) k++; return ONB_STEPS[k] || "end"; }
/* Back: Spell → Draw, Birthday → Spell (or Draw, typed), Allergens → Birthday; Draw and Reveal have none */
function stepBefore(key){ let k = S(key) - 1; while(k > 0 && !stepApplies(ONB_STEPS[k])) k--; return ONB_STEPS[Math.max(0, k)]; }
function hasBack(){
  if(onb.single) return false;
  return !["draw","reveal"].includes(onb.step) || (onb.step==="reveal" && (onb.revealed || noWeekYet()));
}
function goBack(){
  const to = stepBefore(onb.step);
  goStep(to, to==="draw" && state.profile.name && !state.profile.ink ? "typed" : null);
}
function nextStep(){ goStep(stepAfter(onb.step)); }
/* under 6 months there's no week yet: Allergens ends on the closing screen instead of Reveal and Done */
function noWeekYet(){ return ageNow() < 6 && !state.profile.exploreEarly; }

/* step is a name ("birthday"); no step = where the family left off */
function openOnboarding(step, opts){
  const P = state.profile;
  const o = opts || {};
  let saved = P.onboardingStep;
  if(typeof saved==="number") saved = ({welcome:"draw", name:"draw"})[ONB_STEPS_V2[saved]] || ONB_STEPS_V2[saved];   // legacy: v2 index
  if(step===undefined){
    step = S(saved) >= 0 && !LATE_STEPS.includes(saved) ? saved : "draw";
    onb.welcomeBack = !P.onboarded && (step!=="draw" || !!P.name || !!P.ink);
  }else onb.welcomeBack = false;
  if(S(step) < 0) step = "draw";
  onb.step = step;
  // from Profile: one step (single) or a few (through), then back
  onb.from = o.single || o.through ? step : null;
  onb.through = o.through || (o.single ? step : null);
  onb.single = onb.through!==null;
  onb.replay = !!o.replay;
  onb.snapshot = P.onboarded ? JSON.parse(JSON.stringify(P)) : null;   // Close puts this back
  onb.sub = step==="draw" && P.name && !P.ink && (!onb.single || o.sub==="typed") ? "typed" : null;
  onb.draft = null; onb.revealed = step==="reveal"; onb.revealPlayed = step==="reveal"; onb.adding = false; onb.bd = null; onb.early = false;
  document.body.classList.add("onb-open");
  document.getElementById("app").inert = true; document.body.classList.add("is-onb");
  const el = document.getElementById("onboarding");
  el.hidden = false;
  renderOnb();
  focusStep();
}
function closeOnboarding(){
  document.getElementById("onboarding").hidden = true;
  document.body.classList.remove("onb-open");
  document.getElementById("app").inert = false; document.body.classList.remove("is-onb");
  clearTimeout(onb.revealTimer); clearTimeout(onb.sheetTimer);
  if(pile){ pile.stop(); pile = null; }
  onb.snapshot = null;
  homeChanged();
}
/* Close (a replay or an edit from Profile): nothing unfinished is kept */
function discardOnboarding(){
  if(onb.snapshot){
    const P = state.profile;
    Object.keys(P).forEach(k=>delete P[k]);
    Object.assign(P, onb.snapshot);
    save();
  }
  closeOnboarding();
}
function finishOnboarding(){
  if(!state.profile.firstDay) state.profile.firstDay = todayISO();   // late questions never come on day one
  state.profile.onboarded = true;
  state.profile.onboardingStep = null;
  delete state.profile.returning;
  save();
  closeOnboarding();
}
/* the first blank waits with its caret; otherwise the sentence itself takes focus */
function focusStep(){
  const card = document.getElementById("onbCard");
  const f = card.querySelector(".blank-input:not([type=time])");
  const title = card.querySelector("#onbTitle");
  document.getElementById("onboarding").classList.toggle("has-field", !!f);
  if(f){ f.focus({preventScroll:true}); keepInView(); }
  else if(title){ title.tabIndex = -1; title.focus({preventScroll:true}); }
}
/* the field being typed in and the pinned pill stay above the keyboard; one smooth scroll, never a jump */
function keepInView(){
  const el = document.getElementById("onboarding"), card = document.getElementById("onbCard");
  if(el.hidden) return;
  const a = document.activeElement;
  if(!a || !card.contains(a)) return;
  const box = card.getBoundingClientRect(), r = a.getBoundingClientRect();
  const bottom = box.bottom - 16;
  let dy = 0;
  if(r.bottom > bottom) dy = r.bottom - bottom;
  if(r.top - dy < box.top + 8) dy = r.top - box.top - 8;
  if(Math.abs(dy) > 1) card.scrollBy({top:dy, behavior:calm() ? "auto" : "smooth"});
}
kbListeners.push(()=>requestAnimationFrame(keepInView));
/* iOS only opens the keyboard for a focus inside a tap. The next step's field doesn't exist yet when Next is
   tapped, so a hidden field takes the focus during the tap, and the real one takes it over after the swap. */
function holdKeyboard(key, sub){
  if(!(key==="spell" || (key==="draw" && sub==="typed"))) return;
  let p = document.getElementById("kbProxy");
  if(!p){ p = document.createElement("input"); p.id = "kbProxy"; p.className = "kb-proxy"; p.setAttribute("aria-hidden", "true"); p.tabIndex = -1; document.body.appendChild(p); }
  p.inputMode = "text";
  p.focus({preventScroll:true});
}
/* the finished sentence slides up and fades; the next one rises in */
function goStep(key, sub, opts){
  if(onb.single && (key==="end" || S(key) < S(onb.from) || S(key) > S(onb.through))){ save(); onb.snapshot = null; closeOnboarding(); return; }
  const card = document.getElementById("onbCard");
  onb.dir = S(key) > S(onb.step) || (key===onb.step && sub) ? 1 : -1;
  const swap = ()=>{
    onb.step = key; onb.sub = sub || null; onb.adding = false;
    if(!onb.single) state.profile.onboardingStep = key;
    save();
    renderOnb();
    if(!calm()) card.animate([{transform:`translateY(${onb.dir*28}px)`, opacity:0}, {transform:"none", opacity:1}],
                             {duration:320, easing:"cubic-bezier(.32,1.25,.5,1)"});
    else card.animate([{opacity:0},{opacity:1}], {duration:180});
    focusStep();
  };
  holdKeyboard(key, sub);
  if(calm() || (opts && opts.instant)){ swap(); return; }
  const out = card.animate([{transform:"none", opacity:1}, {transform:`translateY(${-onb.dir*24}px)`, opacity:0}],
                           {duration:170, easing:"cubic-bezier(.22,.61,.36,1)", fill:"forwards"});
  out.onfinish = ()=>{ out.cancel(); swap(); };
}

/* the onboarding's own glow (light theme): two layers crossfade over 1.2 s, as Home's do */
/* the glow behind each step's sentence (two layers crossfading over 1.2 s, as Home's do) */
function onbGlow(cat){
  const group = glowGroup(cat);
  const root = document.getElementById("onbGlow");
  if(root.dataset.group===group) return;
  const layers = [...root.querySelectorAll(".glow-l")];
  const on = layers.find(l=>l.classList.contains("is-on")) || layers[0], off = layers.find(l=>l!==on);
  if(!root.dataset.group) on.style.backgroundImage = glowGradient(GLOW[group].hex);
  else { off.style.backgroundImage = glowGradient(GLOW[group].hex); off.classList.add("is-on"); on.classList.remove("is-on"); }
  root.dataset.group = group;
  document.getElementById("onboarding").dataset.glow = group;
}

function renderOnb(){
  const P = state.profile, key = onb.step;
  const el = document.getElementById("onboarding");
  el.querySelectorAll(".onb-sheet, .onb-scrim").forEach(x=>x.remove());
  [document.getElementById("onbTop"), document.getElementById("onbCard"), document.getElementById("onbFoot")].forEach(x=>x.inert = false);
  el.classList.remove("has-sheet", "has-week");
  el.querySelector(".onb-backdrop .glow-plane").style.opacity = "";
  // progress: four hairline segments (none for an edit from Profile)
  const seg = ONB_SEGMENT[key];
  const segs = document.getElementById("onbDots");
  segs.hidden = onb.single || seg===undefined;
  segs.innerHTML = [0, 1, 2, 3].map(k=>`<i class="${k < seg ? "done" : k===seg ? "on" : ""}"></i>`).join("");
  document.getElementById("onbProgress").textContent = segs.hidden ? "" : say("onb.progress.step", {n:seg + 1, name:say("onb.progress.names." + seg)});
  const back = document.getElementById("onbBack");
  back.textContent = say("onb.back");
  back.hidden = !hasBack();
  back.onclick = goBack;
  const close = document.getElementById("onbClose");
  close.hidden = !P.onboarded;   // a replay or an edit can be left; a first run can't
  close.textContent = say("onb.close"); close.onclick = discardOnboarding;
  const card = document.getElementById("onbCard"), foot = document.getElementById("onbFoot");
  card.innerHTML = ""; foot.innerHTML = ""; foot.className = "onb-foot"; foot.inert = false;
  el.querySelectorAll(".wk-skip").forEach(x=>x.remove());
  card.className = "onb-card bare";
  el.classList.remove("has-field");
  card.scrollTop = 0;
  clearTimeout(onb.revealTimer); clearTimeout(onb.sheetTimer);
  if(pile){ pile.stop(); pile = null; }
  onbGlow(ONB_GLOW[key] || "grain");
  el.dataset.step = key;
  const glowNow = ()=>onbGlow(key==="reveal" && onb.revealed ? ONB_GLOW.done : ONB_GLOW[key] || "grain");
  ({draw:onbDraw, spell:onbSpell, birthday:onbBirthday, keepout:onbKeepout, priorities:onbPriorities,
    athome:onbAtHome, mealtimes:onbMealTimes, reveal:onbReveal})[key](card, P);
  if(key==="reveal") glowNow();
  // a reload mid-flow: "Welcome back." once, above the sentence, gone after 3 s
  if(onb.welcomeBack){
    onb.welcomeBack = false;
    const wb = line(say("onb.welcomeBack"), "onb-wb");
    wb.setAttribute("role", "status");
    card.insertBefore(wb, card.firstChild);
    const gone = ()=>wb.remove();
    if(calm()) setTimeout(gone, 3000);
    else wb.animate([{opacity:1}, {opacity:1, offset:.85}, {opacity:0}], {duration:3000, fill:"forwards"}).onfinish = gone;
  }
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
  const wrap = document.getElementById("onbFoot");
  wrap.innerHTML = "";
  const b = document.createElement("button");
  b.type = "button"; b.className = "btn-ink onb-cta";
  b.textContent = onb.single && onb.step===onb.through && label===say("onb.next") ? say("onb.save") : label;
  b.addEventListener("click", ()=>{ if(b.getAttribute("aria-disabled")==="true") return; haptic(); onNext(); });
  wrap.appendChild(b);
  (o.extra || []).forEach(x=>{
    const e = document.createElement("button");
    e.type = "button"; e.className = "btn-text"; e.textContent = x.label;
    e.addEventListener("click", x.on);
    wrap.appendChild(e);
  });
  // until the step has a value, the pill stays where it is, dimmed and aria-disabled
  const ready = v=>{ b.classList.toggle("wait", !v); b.setAttribute("aria-disabled", String(!v)); };
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

/* ---------- the sheet: one component, rising from the bottom of the onboarding ----------
   modal: a scrim, Esc and a tap on the scrim close it, and everything behind is inert (so focus stays inside).
   Not modal: it simply sits there (the drawing pad on Draw). */
function onbSheet(o){
  const host = document.getElementById("onboarding");
  const s = document.createElement("div");
  s.className = "onb-sheet" + (o.cls ? " " + o.cls : "");
  const id = "sh" + uid();
  s.setAttribute("role", o.modal ? "dialog" : "group");
  if(o.modal) s.setAttribute("aria-modal", "true");
  s.innerHTML = `<div class="sh-in">${o.title ? `<h2 class="sh-title" id="${id}">${esc(o.title)}</h2>` : ""}</div>`;
  if(o.title) s.setAttribute("aria-labelledby", id);
  const body = s.firstChild;
  let scrim = null;
  const behind = [document.getElementById("onbTop"), document.getElementById("onbCard"), document.getElementById("onbFoot")];
  const close = ()=>{
    if(!s.isConnected) return;
    document.removeEventListener("keydown", esc_);
    behind.forEach(x=>x.inert = false);
    const done = ()=>{ s.remove(); if(scrim) scrim.remove(); o.onClose && o.onClose(); };
    if(calm()) done();
    else{ s.animate([{transform:"none"}, {transform:"translateY(105%)"}], {duration:220, easing:"cubic-bezier(.22,.61,.36,1)", fill:"forwards"}).onfinish = done;
          if(scrim) scrim.animate([{opacity:1}, {opacity:0}], {duration:220, fill:"forwards"}); }
  };
  const esc_ = e=>{ if(e.key==="Escape"){ e.preventDefault(); close(); } };
  if(o.modal){
    scrim = document.createElement("div");
    scrim.className = "onb-scrim";
    scrim.addEventListener("click", close);
    host.appendChild(scrim);
    behind.forEach(x=>x.inert = true);
    document.addEventListener("keydown", esc_);
  }
  host.appendChild(s);
  if(o.modal){
    // a visible way out, after the content (Esc and a tap outside close it too)
    const foot = document.createElement("div");
    foot.className = "sh-foot";
    foot.appendChild(textButton(say("onb.close"), close, "small sh-close"));
    s.appendChild(foot);
  }
  const rise = ()=>{
    s.hidden = false;
    if(!calm()) s.animate([{transform:"translateY(105%)"}, {transform:"none"}], {duration:420, easing:"cubic-bezier(.25,1.1,.4,1)"});
    else s.animate([{opacity:0}, {opacity:1}], {duration:150});
    if(scrim) scrim.animate([{opacity:0}, {opacity:1}], {duration:220});
    host.style.setProperty("--sheet-h", s.offsetHeight + "px");
    o.onOpen && o.onOpen();
  };
  if(o.delay){ s.hidden = true; onb.sheetTimer = setTimeout(rise, o.delay); }
  else requestAnimationFrame(rise);
  return {el:s, body, close};
}

/* 1. Draw: "Pull up a chair for ____." The blank is the ink, live; the pad rises 400 ms later on a sheet.
   The ink never leaves the device. "Type instead" asks for the name in the blank and skips Spell. */
function onbDraw(card, P){
  if(onb.sub==="typed") return onbDrawTyped(card, P);
  const [before, after] = say("onb.draw.sentence").split("{blank}");
  const h = document.createElement("h1");
  h.className = "sent sent-xl draw-in"; h.id = "onbTitle"; h.tabIndex = -1;
  const mirror = document.createElement("span");
  mirror.className = "ink-blank";
  const live = document.createElement("span");
  live.className = "ink-live"; live.setAttribute("aria-hidden", "true");
  const said = document.createElement("span");
  said.className = "sr-only";
  mirror.append(live, said);
  const lead = document.createElement("span");
  lead.className = "draw-lead"; lead.textContent = before.trimEnd();   // "Pull up a chair for" stays on one line
  h.append(lead, " ", mirror, after);
  card.appendChild(h);
  document.getElementById("onboarding").classList.add("has-sheet");
  const sheet = onbSheet({cls:"pad-sheet", title:say("onb.draw.title"), delay:calm() ? 0 : 400});
  const hintP = line(say("onb.draw.hint"), "sh-hint");
  const pad = inkPad(P, {onChange:strokes=>{
    live.innerHTML = inkSVG({strokes}, "ink-mirror");
    mirror.classList.toggle("has-ink", strokes.length > 0);
    said.textContent = strokes.length ? say("onb.draw.drawn") : "";
    done.setAttribute("aria-disabled", String(!pad.has()));
    erase.disabled = undo.disabled = !pad.has();
  }});
  const row = document.createElement("div");
  row.className = "pad-row";
  const erase = textButton(say("onb.draw.erase"), ()=>{ pad.erase(); haptic(); });
  const done = document.createElement("button");
  done.type = "button"; done.className = "btn-ink"; done.textContent = say("onb.draw.done");
  done.addEventListener("click", ()=>{ if(done.getAttribute("aria-disabled")==="true") return; haptic(); nextStep(); });
  const undo = textButton(say("onb.draw.undo"), ()=>{ pad.undo(); haptic(); });
  row.append(erase, done, undo);
  const typed = textButton(say("onb.draw.typeInstead"), ()=>goStep("draw", "typed"), "small type-instead");
  sheet.body.append(hintP, pad, row, typed);
  pad.paint();
}
function textButton(label, on, cls){
  const b = document.createElement("button");
  b.type = "button"; b.className = "btn-text" + (cls ? " " + cls : ""); b.textContent = label;
  b.addEventListener("click", on);
  return b;
}
/* Draw, typed: the same sentence with the name in its blank */
function onbDrawTyped(card, P){
  let next;
  const b = blank({value:P.name || "", min:4, maxLength:30, autocomplete:"given-name", autocapitalize:"words", enterkeyhint:"next",
    onInput:v=>{ P.name = v.trim(); save(); b.set(P.name ? "ok" : ""); next.ready(!!P.name); },
    onEnter:()=>go()});
  b.set(P.name ? "ok" : "");
  const go = ()=>{ if(!P.name) return; P.ink = null; save(); nextStep(); };   // typed, so no ink (and no Spell)
  const s = sentence(say("onb.draw.sentence"), {blank:b});
  s.classList.add("sent-xl");
  card.appendChild(s);
  next = onbCta(card, say("onb.next"), go, {ready:!!P.name});
}
/* 2. Spell: the ink above "Spelled for the grown-ups: ____." Handwriting recognition fills it in where the
   browser has it (never on iOS today); it's always editable. */
function onbSpell(card, P){
  let next;
  const ink = document.createElement("div");
  ink.className = "spell-ink"; ink.setAttribute("aria-hidden", "true");
  ink.innerHTML = inkSVG(P.ink, "spell-svg");
  const b = blank({value:P.name || "", min:4, maxLength:30, autocomplete:"given-name", autocapitalize:"words", enterkeyhint:"next",
    onInput:v=>{ P.name = v.trim(); save(); b.set(P.name ? "ok" : ""); next.ready(!!P.name); },
    onEnter:()=>{ if(P.name) nextStep(); }});
  b.set(P.name ? "ok" : "");
  card.append(ink, sentence(say("onb.spell.sentence"), {blank:b}), line(say("onb.spell.line")));
  next = onbCta(card, say("onb.next"), ()=>{ if(P.name) nextStep(); }, {ready:!!P.name});
  if(!P.name) recognizeInk(P.ink).then(t=>{
    if(!t || b.input.value || onb.step!=="spell") return;
    b.input.value = t; b.sync(); P.name = t; save(); b.set("ok"); next.ready(true);
  });
}
/* the Handwriting Recognition API (Chromium on some platforms); "" anywhere else */
async function recognizeInk(ink){
  try{
    if(!ink || !navigator.createHandwritingRecognizer || !window.HandwritingStroke) return "";
    const r = await navigator.createHandwritingRecognizer({languages:[(navigator.language || "en").split("-")[0]]});
    const d = r.startDrawing({recognitionType:"text"});
    ink.strokes.forEach(s=>{ const st = new HandwritingStroke(); for(let i = 0; i < s.length; i += 2) st.addPoint({x:s[i], y:s[i + 1], t:i * 8}); d.addStroke(st); });
    const p = await d.getPrediction();
    r.finish();
    return String(p && p[0] ? p[0].text : "").trim().slice(0, 30);
  }catch(e){ return ""; }
}
/* the pad: a finger (or pen, or mouse) writes; strokes are kept as points, drawn smooth, saved on every lift.
   pad.undo() takes the last stroke back, pad.erase() clears it; onChange hears every change (and every move) */
function inkPad(P, o){
  const opts = o || {};
  const wrap = document.createElement("div");
  wrap.className = "pad-wrap";
  const c = document.createElement("canvas");
  c.className = "pad"; c.setAttribute("role", "img"); c.setAttribute("aria-label", say("onb.draw.pad"));
  wrap.append(c);
  let strokes = P.ink && Array.isArray(P.ink.strokes) ? P.ink.strokes.map(s=>s.slice()) : [], cur = null, W = 0, H = 0, from = P.ink ? P.ink.w : 0;
  const size = ()=>{
    const r = c.getBoundingClientRect(), d = Math.min(3, devicePixelRatio || 1);
    if(!r.width) return false;
    if(from && W===0 && r.width!==from){ const k = r.width / from; strokes = strokes.map(s=>s.map(v=>v * k)); }
    W = r.width; H = r.height; c.width = Math.round(W * d); c.height = Math.round(H * d);
    c.getContext("2d").setTransform(d, 0, 0, d, 0, 0);
    return true;
  };
  const all = ()=>strokes.concat(cur ? [cur] : []);
  const draw = ()=>{
    if(W){
      const x = c.getContext("2d");
      x.clearRect(0, 0, W, H);
      x.strokeStyle = x.fillStyle = getComputedStyle(wrap).color; x.lineWidth = INK_WIDTH; x.lineCap = x.lineJoin = "round";
      all().forEach(s=>{ x.beginPath(); inkPath(s, (cmd, ...a)=>x[cmd](...a)); x.stroke(); });
    }
    opts.onChange && opts.onChange(all());
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
  wrap.has = ()=>strokes.length > 0;
  wrap.undo = ()=>{ strokes.pop(); draw(); keep(); };
  wrap.erase = ()=>{ strokes = []; draw(); keep(); };
  wrap.paint = ()=>{ draw(); requestAnimationFrame(()=>{ if(size()) draw(); }); };
  new ResizeObserver(()=>{ if(W && c.getBoundingClientRect().width && c.getBoundingClientRect().width!==W){ const k = c.getBoundingClientRect().width / W; strokes = strokes.map(s=>s.map(v=>v * k)); size(); draw(); } }).observe(c);
  return wrap;
}
/* one stroke as smooth curves through the midpoints of its points; a single point is a dot */
const INK_WIDTH = 8;   // a fat marker (Marta)
function inkPath(s, op){
  if(s.length < 4){ op("moveTo", s[0], s[1]); op("lineTo", s[0] + .01, s[1]); return; }
  op("moveTo", s[0], s[1]);
  for(let i = 2; i < s.length - 2; i += 2) op("quadraticCurveTo", s[i], s[i + 1], (s[i] + s[i + 2]) / 2, (s[i + 1] + s[i + 3]) / 2);
  op("lineTo", s[s.length - 2], s[s.length - 1]);
}
/* the name as drawn, an SVG cropped to the ink, in currentColor (both themes); "" when there's no ink */
function inkSVG(ink, cls, o){
  if(!ink || !Array.isArray(ink.strokes) || !ink.strokes.length) return "";
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  ink.strokes.forEach(s=>{ for(let i = 0; i < s.length; i += 2){ x0 = Math.min(x0, s[i]); x1 = Math.max(x1, s[i]); y0 = Math.min(y0, s[i + 1]); y1 = Math.max(y1, s[i + 1]); } });
  const pad = INK_WIDTH, f = v=>(Math.round(v * 10) / 10);
  const ds = ink.strokes.map(s=>{ let out = ""; inkPath(s, (cmd, ...a)=>{ out += ({moveTo:"M", lineTo:"L", quadraticCurveTo:"Q"})[cmd] + a.map(f).join(" ") + " "; }); return out.trim(); });
  // one path, or (split) one per stroke, in the order they were written, so the ink can replay
  const paths = (o && o.split ? ds : [ds.join(" ")]).map(d=>`<path d="${d}" fill="none" stroke="currentColor" stroke-width="${INK_WIDTH}" stroke-linecap="round" stroke-linejoin="round"/>`).join("");
  return `<svg class="${cls || "name-ink"}" data-ink viewBox="${f(x0 - pad)} ${f(y0 - pad)} ${f(x1 - x0 + 2 * pad)} ${f(y1 - y0 + 2 * pad)}" aria-hidden="true" focusable="false">${paths}</svg>`;
}

/* 3. Birthday: "{name} showed up on…" over three full-height columns (day, month, year, in the locale's order).
   Each column scrolls and snaps natively; the value in the band is the one chosen. Nothing counts until every
   column has been touched, so a date that only looks valid can't be accepted unchanged. */
const MONTH_NAMES = (()=>{ const f = new Intl.DateTimeFormat(undefined, {month:"long"}); return Array.from({length:12}, (_, k)=>f.format(new Date(2024, k, 1))); })();
const MONTH_SHORT = (()=>{ const f = new Intl.DateTimeFormat(undefined, {month:"short"}); return Array.from({length:12}, (_, k)=>f.format(new Date(2024, k, 1))); })();
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
/* the order a locale writes a date in: ["month","day","year"] for en-US, ["day","month","year"] for en-GB… */
function bdOrder(locale){
  return new Intl.DateTimeFormat(locale, {day:"numeric", month:"short", year:"numeric"}).formatToParts(new Date(2026, 9, 22))
    .map(p=>p.type).filter(t=>t==="day" || t==="month" || t==="year");
}
const daysIn = (y, m)=>new Date(y, m + 1, 0).getDate();
/* age in months, corrected for a baby born early (weeks before the due date) until 24 months (verify) */
function correctedMonths(iso, weeks){
  const m = ageMonths(iso);
  if(m===null || !weeks || m >= 24) return m;
  const b = localDate(iso);
  return ageMonths(isoOf(new Date(b.getFullYear(), b.getMonth(), b.getDate() + weeks * 7)));
}
const BD_ROW = 72;
const BD_FADE = [[1, 1], [.45, .86], [.22, .74], [.1, .64]];   // [opacity, scale] at 0, 1, 2, 3+ rows from the band
/* one column: role=spinbutton over a native snapping scroller. o: {key, label, items:[{v, text, full}], value, touched, onPick(v)} */
function bdWheel(o){
  const col = document.createElement("div");
  col.className = "bd-col" + (o.touched ? "" : " untouched");
  col.tabIndex = 0;
  col.setAttribute("role", "spinbutton");
  col.setAttribute("aria-label", o.label);
  const vals = o.items.map(it=>it.v);
  col.setAttribute("aria-valuemin", String(Math.min(...vals))); col.setAttribute("aria-valuemax", String(Math.max(...vals)));
  col.dataset.key = o.key;
  const els = o.items.map((it, k)=>{
    const e = document.createElement("div");
    e.className = "bd-it"; e.dataset.k = k; e.setAttribute("aria-hidden", "true");
    e.innerHTML = `<span class="bd-v">${esc(it.text)}</span>`;
    e.addEventListener("click", ()=>{ touch(); to(k, true); });
    col.appendChild(e);
    return e;
  });
  let idx = Math.max(0, vals.indexOf(o.value)), raf = 0, endT = 0, H = 0;
  const w = {el:col, touched:!!o.touched};
  const aria = ()=>{ const it = o.items[idx]; col.setAttribute("aria-valuenow", String(it.v)); col.setAttribute("aria-valuetext", it.full || it.text); };
  const paint = ()=>{
    raf = 0;
    const st = col.scrollTop;
    els.forEach((e, k)=>{
      const dd = Math.min(3, Math.abs(k * BD_ROW - st) / BD_ROW), i = Math.floor(dd), f = dd - i, a = BD_FADE[i], b = BD_FADE[Math.min(3, i + 1)];
      e.style.opacity = (a[0] + (b[0] - a[0]) * f).toFixed(3);
      e.style.transform = `scale(${(a[1] + (b[1] - a[1]) * f).toFixed(3)})`;
    });
  };
  const end = ()=>{
    const k = Math.max(0, Math.min(els.length - 1, Math.round(col.scrollTop / BD_ROW)));
    if(k===idx) return;
    idx = k; aria();
    if(!calm()) els[k].firstChild.animate([{transform:"scale(1)"}, {transform:"scale(1.04)"}, {transform:"scale(1)"}], {duration:120, easing:"ease-out"});
    o.onPick(o.items[k].v, w);
  };
  const touch = ()=>{ if(w.touched) return; w.touched = true; col.classList.remove("untouched"); o.onTouch && o.onTouch(w); };
  const to = (k, smooth)=>{
    k = Math.max(0, Math.min(els.length - 1, k));
    col.scrollTo({top:k * BD_ROW, behavior:smooth && !calm() ? "smooth" : "auto"});
    if(!smooth || calm()){ paint(); end(); }
  };
  col.addEventListener("scroll", ()=>{
    if(!raf) raf = requestAnimationFrame(paint);
    if(!("onscrollend" in window)){ clearTimeout(endT); endT = setTimeout(end, 90); }
  }, {passive:true});
  col.addEventListener("scrollend", end);
  ["pointerdown", "touchstart", "wheel"].forEach(t=>col.addEventListener(t, touch, {passive:true}));
  col.addEventListener("keydown", e=>{
    const v = o.items[idx].v, lo = Math.min(...vals), hi = Math.max(...vals);
    const step = {ArrowUp:1, ArrowDown:-1, PageUp:5, PageDown:-5}[e.key];
    let n = null;
    if(step!==undefined) n = Math.max(lo, Math.min(hi, v + step));
    else if(e.key==="Home") n = lo;
    else if(e.key==="End") n = hi;
    if(n===null) return;
    e.preventDefault(); touch();
    to(vals.indexOf(n), false);
  });
  const layout = ()=>{
    const h = col.clientHeight;
    if(!h || h===H) return;
    H = h;
    const pad = Math.max(0, (h - BD_ROW) / 2);
    col.style.paddingTop = col.style.paddingBottom = pad + "px";
    col.scrollTop = idx * BD_ROW; paint();
  };
  new ResizeObserver(()=>requestAnimationFrame(layout)).observe(col);
  aria();
  w.set = (v, smooth)=>{ const k = vals.indexOf(v); if(k >= 0 && k!==idx){ idx = k; aria(); col.scrollTo({top:k * BD_ROW, behavior:smooth && !calm() ? "smooth" : "auto"}); if(!smooth || calm()) paint(); } };
  w.value = ()=>o.items[idx].v;
  w.layout = layout;
  return w;
}
function onbBirthday(card, P){
  const name = P.name || "They", today = now(), Y = today.getFullYear();
  card.classList.add("fill", "bd-step");
  const had = P.birthDate ? localDate(P.birthDate) : null;
  // where the columns start: the saved date (already chosen), or day 15, this month, last year, all dim
  const bd = onb.bd || (onb.bd = had ? {day:had.getDate(), month:had.getMonth(), year:had.getFullYear(), touched:{day:true, month:true, year:true}}
                                    : {day:15, month:today.getMonth(), year:Y - 1, touched:{}});
  // the sentence: the name as ink (read aloud by its spelling) or as text
  const h = document.createElement("h1");
  h.className = "sent bd-sent"; h.id = "onbTitle"; h.tabIndex = -1;
  const [pre, post] = say("onb.birthday.sentence").split("{name}");
  h.append(pre);
  if(P.ink && P.ink.strokes && P.ink.strokes.length){
    const s = document.createElement("span");
    s.className = "bd-ink"; s.innerHTML = inkSVG(P.ink, "bd-ink-svg") + `<span class="sr-only">${esc(name)}</span>`;
    h.appendChild(s);
  }else h.append(name);
  h.append(post);
  card.appendChild(h);
  const live = document.createElement("p");
  live.className = "sr-only"; live.setAttribute("aria-live", "polite");
  const box = document.createElement("div");
  box.className = "bd";
  const msg = document.createElement("p");
  msg.className = "onb-hint bd-msg"; msg.setAttribute("aria-live", "polite");
  const stage = document.createElement("div");
  stage.className = "bd-stage"; stage.setAttribute("aria-live", "polite");
  let next;
  const allTouched = ()=>bd.touched.day && bd.touched.month && bd.touched.year;
  const clampDay = ()=>{
    const max = daysIn(bd.year, bd.month);
    if(bd.day > max){
      bd.day = max;
      wheels.day && wheels.day.set(max, true);
      live.textContent = say("onb.birthday.dayClamped", {n:max});
    }
  };
  let shownStage = "";
  const check = ()=>{
    let text = "", date = null;
    if(!allTouched()) text = say("onb.birthday.swipe");
    else{
      date = new Date(bd.year, bd.month, bd.day);
      if(date > today){ text = say("onb.birthday.future"); date = null; }
      else if(ageMonths(isoOf(date)) > AGE_MAX){ text = say("onb.birthday.old"); date = null; }
    }
    msg.textContent = text;
    if(date){ P.birthDate = isoOf(date); save(); }
    paintStage(date);
    next.ready(!!date);
  };
  // "Born early?" sits small at the top, under the sentence; the stage block says the age and the stage
  const top = document.createElement("div");
  top.className = "bd-top";
  let topSig = null;
  function paintTop(m){
    const sig = (onb.early || P.bornEarlyWeeks ? "open" : "link") + ":" + (P.bornEarlyWeeks || 0) + ":" + m;
    if(sig===topSig) return;
    topSig = sig;
    const had = top.querySelector(".blank-input")===document.activeElement;
    top.innerHTML = "";
    if(onb.early || P.bornEarlyWeeks){
      const b = blank({value:P.bornEarlyWeeks ? String(P.bornEarlyWeeks) : "", min:2, maxLength:2, inputmode:"numeric", enterkeyhint:"done", label:say("onb.birthday.weeksLabel"),
        onInput:v=>{ const n = +v; P.bornEarlyWeeks = /^\d{1,2}$/.test(v) && n >= 1 && n <= 20 ? n : 0; b.set(P.bornEarlyWeeks ? "ok" : ""); save(); onb.early = true; shownStage = ""; check(); }});
      b.set(P.bornEarlyWeeks ? "ok" : "");
      const s = sentence(say("onb.birthday.early"), {blank:b}, "bd-early");
      s.removeAttribute("id"); s.removeAttribute("tabindex");
      const p = document.createElement("p"); p.className = "bd-early"; while(s.firstChild) p.appendChild(s.firstChild);
      top.appendChild(p);
      if(P.bornEarlyWeeks && m!==null) top.appendChild(line(say("onb.birthday.using", {months:m}), "bd-using"));
      if(had){ const g = top.querySelector(".blank-input"); g.focus(); const n = g.value.length; g.setSelectionRange(n, n); }
    }else top.appendChild(textButton(say("onb.birthday.bornEarly"), ()=>{ onb.early = true; topSig = null; check(); const f = top.querySelector(".blank-input"); if(f) f.focus(); }, "small bd-early-link"));
  }
  function paintStage(date){
    const m = date ? correctedMonths(isoOf(date), P.bornEarlyWeeks) : null;
    paintTop(m);
    const st = m===null ? null : stageFor(m);
    const sig = m===null ? "" : (st.solids ? st.id : "milk") + ":" + m;
    if(sig===shownStage) return;
    shownStage = sig;
    stage.innerHTML = "";
    if(m===null) return;
    if(!st.solids){
      const left = Math.max(1, 6 - m);
      stage.append(line(say("onb.birthday.milk", {name, n:left}), "bd-tag milk"), line(say("onb.birthday.nothingYet"), "bd-line"));
    }else stage.append(line(say("onb.birthday.stageAt", {months:m, tagline:lower1(st.name)}), "bd-tag"), line(stageLine(st), "bd-line"));
    if(!calm()) stage.animate([{opacity:0}, {opacity:1}], {duration:250, easing:"ease-out"});
  }
  const wheels = {};
  const order = bdOrder();
  const pick = key=>(v, w)=>{
    bd[key] = v;
    if(key!=="day") clampDay(); else if(bd.day > daysIn(bd.year, bd.month)) clampDay();
    check();
  };
  const onTouch = key=>()=>{ bd.touched[key] = true; check(); };
  const columns = ()=>{
    const cols = document.createElement("div");
    cols.className = "bd-cols";
    cols.innerHTML = `<div class="bd-band" aria-hidden="true"></div>`;
    const labels = document.createElement("div");
    labels.className = "bd-labels"; labels.setAttribute("aria-hidden", "true");
    const ITEMS = {
      day:Array.from({length:31}, (_, k)=>({v:k + 1, text:String(k + 1)})),
      month:MONTH_SHORT.map((t, k)=>({v:k + 1, text:t, full:MONTH_NAMES[k]})),
      year:[Y, Y - 1, Y - 2, Y - 3].map(y=>({v:y, text:String(y)}))
    };
    order.forEach(key=>{
      const value = key==="month" ? bd.month + 1 : bd[key];
      const w = bdWheel({key, label:say("onb.birthday." + key), items:ITEMS[key], value, touched:!!bd.touched[key],
        onPick:key==="month" ? (v, x)=>pick("month")(v - 1, x) : pick(key), onTouch:onTouch(key)});
      wheels[key] = w;
      cols.appendChild(w.el);
      labels.appendChild(Object.assign(document.createElement("span"), {textContent:say("onb.birthday." + key + "Label")}));
    });
    box.append(cols, labels);
  };
  columns();
  card.append(top, box, msg, stage, live);
  next = onbCta(card, say("onb.next"), ()=>{ if(next.getAttribute("aria-disabled")==="true") return; P.exploreEarly = false; save(); nextStep(); },
                {ready:false, extra:[]});
  check();
}

/* 4. Allergens: "Hold the ____." The blank is the pile: ten circles that fall in, settle and can be tapped.
   Each cycles Not yet → Keep out → Tried, all fine → Not yet (in words and type, never colour alone). A family's
   own item ("Something else") starts at Keep out, then Tried, all fine, then goes. The DOM order is a fixed list,
   so focus and screen readers never follow the physics. Reduced motion: the same buttons, wrapped, still. */
const PILE_D = 92;   // a circle's diameter (88 below 700px of height, never less)
const PILE = {g:2400, e:.25, damp:.6, slop:.5, maxPush:6, passes:6, dt:1 / 120, sleepV:2, sleepMs:500, bounceV:80, friction:.8, restV:25, restK:.85, nudge:40};
function mulberry32(a){ return ()=>{ a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
/* the physics, DOM-free: circles under gravity between two walls and a floor. Positions are integrated, then pushed
   apart (6 passes, bottom first, so the pile's weight reaches the floor); velocity is what moved. Only a real impact
   bounces; a slow creep in a resting pile dies away (static friction), so the pile goes to sleep. */
function pileStep(w){
  const P = PILE, dt = P.dt, B = w.bodies.filter(b=>b.live);
  B.forEach(b=>{
    b.px = b.x; b.py = b.y;
    b.vy += P.g * dt;
    const k = Math.max(0, 1 - P.damp * dt); b.vx *= k; b.vy *= k;
    b.pvx = b.vx; b.pvy = b.vy;
    b.x += b.vx * dt; b.y += b.vy * dt;
    b.hitF = b.hitW = b.touch = false;
  });
  B.sort((a, b)=>b.y - a.y);
  for(let pass = 0; pass < P.passes; pass++){
    for(let i = 0; i < B.length; i++){
      const a = B[i];
      for(let j = i + 1; j < B.length; j++){
        const b = B[j], dx = b.x - a.x, dy = b.y - a.y, min = a.r + b.r, d2 = dx * dx + dy * dy;
        if(d2 >= min * min || d2===0) continue;
        const d = Math.sqrt(d2), o = min - d - P.slop;
        if(o <= 0) continue;
        const nx = dx / d, ny = dy / d, o2 = Math.min(o, P.maxPush);
        a.touch = b.touch = true;
        const wa = a.hitF ? .15 : .5, wb = b.hitF ? .15 : .5, s = wa + wb;
        a.x -= nx * o2 * wa / s; a.y -= ny * o2 * wa / s;
        b.x += nx * o2 * wb / s; b.y += ny * o2 * wb / s;
      }
      if(a.x - a.r < 0){ a.x = a.r; a.hitW = true; }
      if(a.x + a.r > w.W){ a.x = w.W - a.r; a.hitW = true; }
      if(w.floor && !a.free && a.y + a.r > w.H){ a.y = w.H - a.r; a.hitF = true; }
    }
  }
  B.forEach(b=>{
    b.vx = (b.x - b.px) / dt; b.vy = (b.y - b.py) / dt;
    if(b.hitF){ b.vx *= P.friction; if(b.pvy > P.bounceV) b.vy = -b.pvy * P.e; }
    if(b.hitW && Math.abs(b.pvx) > P.bounceV) b.vx = -b.pvx * P.e;
    if((b.hitF || b.touch) && Math.hypot(b.vx, b.vy) < P.restV){ b.vx *= P.restK; b.vy *= P.restK; }
  });
  const fast = B.some(b=>Math.hypot(b.vx, b.vy) > P.sleepV) || w.bodies.some(b=>!b.live);
  w.still = fast ? 0 : w.still + dt * 1000;
  w.asleep = w.still >= P.sleepMs;
  if(w.asleep) B.forEach(b=>{ b.vx = b.vy = 0; });
  return w.asleep;
}
/* a body joins at (x, y), or just above anything already there, so nothing is born overlapping */
function pileSpawn(w, b){
  let y = b.y;
  w.bodies.forEach(o=>{ if(o!==b && o.live && Math.abs(o.x - b.x) < o.r + b.r && y > o.y - o.r - b.r - 2) y = o.y - o.r - b.r - 2; });
  b.y = y; b.vx = 0; b.vy = 0; b.live = true;
}
/* the pile in the page: a fixed 1/120 s step with an accumulator, translate3d per button, and no rAF at all while
   it sleeps or the tab is hidden. pile.frames counts rAF callbacks (the tests check it stops). */
let pile = null;
function makePile(zone, els, seed){
  const w = {W:0, H:0, floor:true, bodies:[], still:0, asleep:false};
  const rnd = mulberry32(seed);
  const p = {world:w, frames:0, running:false, raf:0, acc:0, last:0, t:0, onExit:null};
  const size = ()=>{ const r = zone.getBoundingClientRect(); w.W = r.width; w.H = r.height; return r; };
  const r0 = size();
  const spawnY = -r0.top - 100 - PILE_D / 2;   // 100px above the top of the screen
  const add = (el, at)=>{
    const d = el.offsetWidth || PILE_D;   // 92px, or 88 on a short screen
    const b = {el, r:d / 2, x:d / 2 + rnd() * Math.max(0, w.W - d), y:spawnY, vx:0, vy:0, live:false, at};
    w.bodies.push(b);
    el.style.transform = `translate3d(${(b.x - b.r).toFixed(1)}px, ${(b.y - b.r).toFixed(1)}px, 0)`;
    return b;
  };
  els.forEach((el, k)=>add(el, k * 110));
  const render = ()=>w.bodies.forEach(b=>{ b.el.style.transform = `translate3d(${(b.x - b.r).toFixed(1)}px, ${(b.y - b.r).toFixed(1)}px, 0)`; });
  const step = ()=>{
    w.bodies.forEach(b=>{ if(!b.live && p.t >= b.at) pileSpawn(w, b); });
    p.t += PILE.dt * 1000;
    return pileStep(w);
  };
  const frame = now_=>{
    p.raf = 0; p.frames++;
    if(document.hidden){ p.running = false; return; }
    const dt = Math.min(.1, (now_ - (p.last || now_)) / 1000); p.last = now_;
    p.acc += dt;
    let asleep = false;
    while(p.acc >= PILE.dt){ p.acc -= PILE.dt; asleep = step(); if(asleep) break; }
    render();
    if(p.exitAt && p.t >= p.exitAt){ p.running = false; const f = p.onExit; p.onExit = null; f && f(); return; }
    if(asleep && !p.exitAt){ p.running = false; return; }
    p.raf = requestAnimationFrame(frame);
  };
  p.wake = ()=>{ w.still = 0; w.asleep = false; if(p.running || !zone.isConnected) return; p.running = true; p.last = 0; p.acc = 0; p.raf = requestAnimationFrame(frame); };
  p.stop = ()=>{ if(p.raf) cancelAnimationFrame(p.raf); p.raf = 0; p.running = false; };
  /* the tests: run n steps (or until asleep) synchronously */
  p.step = n=>{ for(let k = 0; k < n; k++) if(step()) break; render(); return w.asleep; };
  p.settle = ()=>{ for(let k = 0; k < 120 * 30 && !w.asleep; k++) step(); render(); return w.asleep; };
  p.add = el=>{ const b = add(el, p.t); b.y = spawnY; p.wake(); return b; };
  p.remove = el=>{ w.bodies = w.bodies.filter(b=>b.el!==el); p.wake(); };
  /* a tap: everything within reach is pushed gently outward */
  p.nudge = el=>{
    const a = w.bodies.find(b=>b.el===el);
    if(!a) return;
    w.bodies.forEach(b=>{ if(b===a || !b.live) return; const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1;
      if(d < a.r + b.r + 40){ b.vx += dx / d * PILE.nudge; b.vy += dy / d * PILE.nudge; b.px = b.x - b.vx * PILE.dt; b.py = b.y - b.vy * PILE.dt; } });
    p.wake();
  };
  /* "Show the week": the floor opens, bottom first, a little apart, and everything falls out */
  p.open = done=>{
    const order = w.bodies.filter(b=>b.live).sort((a, b)=>b.y - a.y);
    order.forEach((b, k)=>{ setTimeout(()=>{ b.free = true; b.vy = Math.max(b.vy, 200); p.wake(); }, k * 25); });
    p.exitAt = p.t + 500; p.onExit = done;
    p.wake();
  };
  new ResizeObserver(()=>{ const W0 = w.W; size(); if(w.W!==W0) w.bodies.forEach(b=>{ b.x = Math.min(b.x, w.W - b.r); }); p.wake(); }).observe(zone);
  document.addEventListener("visibilitychange", ()=>{ if(!document.hidden && zone.isConnected && !w.asleep) p.wake(); });
  addEventListener("orientationchange", ()=>p.wake());
  return p;
}
/* the locked line: the stage's list, each item a text button whose reason opens under the line, one at a time */
const LOCKED_WORDS = {"honey":["honey"], "whole nuts":["nuts"], "whole grapes":["grapes"], "added salt and sugar":["salt","sugar"], "cow's milk as a drink":["cowsmilk"]};
function lockedItems(months){
  return stageFor(Math.max(6, months)).locked.split(", ").map(label=>({label, why:(LOCKED_WORDS[label] || []).map(id=>(LOCKED_RULES.find(r=>r.id===id) || {}).why).filter(Boolean).join(" ")}));
}
function onbKeepout(card, P){
  const months = ageNow();
  card.classList.add("fill", "al-step");
  if(!Array.isArray(P.fine)) P.fine = [];
  const live = document.createElement("p");
  live.className = "sr-only"; live.setAttribute("aria-live", "polite");
  // "Hold the ____." (the blank is the pile below it)
  const [pre, post] = say("onb.keepOut.sentence").split("{blank}");
  const h = document.createElement("h1");
  h.className = "sent al-sent"; h.id = "onbTitle"; h.tabIndex = -1;
  h.innerHTML = `${esc(pre)}<span class="al-blank" aria-hidden="true"></span>${esc(post)}`;
  card.append(h, line(say("onb.keepOut.line"), "onb-line al-line"));
  const items = lockedItems(months), short = innerHeight < 700;
  const notes = [months >= 6 && months <= 11 ? say("onb.keepOut.spacing") : null, say("onb.keepOut.note")].filter(Boolean);
  if(short){
    const b = textButton(say("onb.keepOut.lockedOpen"), ()=>{
      const sh = onbSheet({modal:true, title:say("onb.keepOut.lockedTitle"), cls:"locked-sheet", onClose:()=>b.focus()});
      const ul = document.createElement("ul"); ul.className = "lk-list";
      items.forEach(it=>{ const li = document.createElement("li"); li.innerHTML = `<b>${esc(upper1(it.label))}.</b> ${esc(it.why)}`; ul.appendChild(li); });
      sh.body.append(ul, ...notes.map(t=>line(t, "al-note")));
      requestAnimationFrame(()=>{ const t = sh.el.querySelector(".sh-title"); if(t){ t.tabIndex = -1; t.focus(); } });
    }, "small al-locked-open");
    card.appendChild(b);
  }else{
    const p = document.createElement("p");
    p.className = "al-locked";
    const why = document.createElement("p");
    why.className = "al-why"; why.setAttribute("aria-live", "polite");
    p.append(say("onb.keepOut.lockedPre") + " ");
    items.forEach((it, k)=>{
      const b = document.createElement("button");
      b.type = "button"; b.className = "lk inline"; b.textContent = it.label; b.setAttribute("aria-expanded", "false");
      b.addEventListener("click", ()=>{
        const open = b.getAttribute("aria-expanded")!=="true";
        p.querySelectorAll(".lk").forEach(x=>x.setAttribute("aria-expanded", "false"));
        b.setAttribute("aria-expanded", String(open));
        why.textContent = open ? it.why : "";
      });
      const nb = document.createElement("span");   // an item keeps its comma: no line starts with one
      nb.className = "lk-w"; nb.append(b, k < items.length - 1 ? "," : ".");
      p.append(nb, k < items.length - 1 ? " " : "");
    });
    card.append(p, why);
  }
  // the pile
  const zone = document.createElement("div");
  zone.className = "pile" + (calm() ? " still" : "");
  const word = st=>st==="avoid" ? say("onb.keepOut.out") : st==="ok" ? say("onb.keepOut.fine") : "";
  const label = st=>st==="avoid" ? say("onb.keepOut.out") : st==="ok" ? say("onb.keepOut.fine") : say("onb.keepOut.notYet");
  const circle = (text, full, cls)=>{
    const b = document.createElement("button");
    b.type = "button"; b.className = "ab" + (cls ? " " + cls : "");
    b.innerHTML = `<span class="ab-in"><span class="ab-l">${esc(text)}</span><span class="ab-s"></span></span>`;
    b.dataset.name = full;
    return b;
  };
  const pulse = b=>{ if(!calm()){ b.firstChild.animate([{transform:"scale(1)"}, {transform:"scale(1.08)"}, {transform:"scale(1)"}], {duration:220, easing:"cubic-bezier(.32,1.25,.5,1)"}); if(pile) pile.nudge(b); } };
  const paintA = (b, st)=>{
    b.dataset.state = st==="avoid" ? "out" : st==="ok" ? "ok" : "";
    b.querySelector(".ab-s").textContent = word(st);
    b.setAttribute("aria-label", say("onb.keepOut.aria", {food:b.dataset.name, state:label(st)}));
  };
  const els = [];
  ALLERGENS.forEach(a=>{
    const name = say("onb.keepOut.labels." + a.id) || a.label;
    const b = circle(name, name);
    b.dataset.id = a.id;
    paintA(b, P.allergens[a.id]);
    b.addEventListener("click", ()=>{
      const st = P.allergens[a.id];
      const next = !st ? "avoid" : st==="avoid" ? "ok" : null;
      if(next) P.allergens[a.id] = next; else delete P.allergens[a.id];
      save(); paintA(b, next); haptic(); pulse(b);
      live.textContent = say("onb.keepOut.said", {food:name, state:label(next)});
    });
    zone.appendChild(b); els.push(b);
  });
  // Meat and Gluten: kept out by choice (or for a condition), so just Not yet ↔ Keep out
  if(!P.diet || typeof P.diet!=="object") P.diet = {};
  DIETS.forEach(g=>{
    const name = say("onb.keepOut.labels." + g.id) || g.label;
    const b = circle(name, name, "diet");
    b.dataset.id = g.id;
    paintA(b, P.diet[g.id]);
    b.addEventListener("click", ()=>{
      const next = P.diet[g.id]==="avoid" ? null : "avoid";
      if(next) P.diet[g.id] = next; else delete P.diet[g.id];
      save(); paintA(b, next); haptic(); pulse(b);
      live.textContent = say("onb.keepOut.said", {food:name, state:label(next)});
    });
    zone.appendChild(b); els.push(b);
  });
  // the family's own: Keep out (P.avoid) → Tried, all fine (P.fine) → gone
  const ownCircle = (item, st)=>{
    const short_ = item.name.length > 14 ? item.name.slice(0, 13).trimEnd() + "…" : item.name;
    const b = circle(short_, item.name, "own");
    paintA(b, st);
    b.addEventListener("click", ()=>{
      const was = b.dataset.state;
      if(was==="out"){
        P.avoid = P.avoid.filter(x=>x.name.toLowerCase()!==item.name.toLowerCase());
        P.fine = P.fine.filter(x=>x.name.toLowerCase()!==item.name.toLowerCase()).concat({name:item.name});
        paintA(b, "ok"); pulse(b);
        live.textContent = say("onb.keepOut.said", {food:item.name, state:label("ok")});
      }else{
        P.fine = P.fine.filter(x=>x.name.toLowerCase()!==item.name.toLowerCase());
        live.textContent = say("onb.keepOut.removed", {food:item.name});
        const gone = ()=>{ if(pile) pile.remove(b); b.remove(); addBtn.focus(); };
        if(calm()) gone(); else b.firstChild.animate([{transform:"scale(1)", opacity:1}, {transform:"scale(0)", opacity:0}], {duration:200, fill:"forwards"}).onfinish = gone;
      }
      save(); haptic();
    });
    zone.insertBefore(b, addBtn);
    return b;
  };
  const addBtn = circle(say("onb.keepOut.add"), say("onb.keepOut.add"), "add");
  addBtn.setAttribute("aria-label", say("onb.keepOut.add"));
  addBtn.setAttribute("aria-haspopup", "dialog");
  zone.appendChild(addBtn); els.push(addBtn);
  P.avoid.forEach(x=>els.splice(els.length - 1, 0, ownCircle(x, "avoid")));
  P.fine.forEach(x=>els.splice(els.length - 1, 0, ownCircle(x, "ok")));
  addBtn.addEventListener("click", ()=>{ pulse(addBtn); somethingElse(); });
  function somethingElse(){
    const sh = onbSheet({modal:true, cls:"else-sheet", onClose:()=>{ if(!added) addBtn.focus(); }});
    let kind = "allergy", added = null;
    const p = document.createElement("p");
    p.className = "sh-sent";
    const inp = document.createElement("input");
    inp.type = "text"; inp.className = "sh-input"; inp.maxLength = 30; inp.id = "else" + uid(); inp.autocomplete = "off"; inp.enterKeyHint = "done";
    inp.setAttribute("autocapitalize", "sentences");
    const [a, b] = say("onb.keepOut.alsoNot").split("{blank}");
    const lab = document.createElement("label"); lab.htmlFor = inp.id; lab.textContent = a.trim();
    p.append(lab, " ", inp, b);
    const kinds = document.createElement("div");
    kinds.className = "kind-toggle"; kinds.setAttribute("role", "group"); kinds.setAttribute("aria-label", `${say("onb.keepOut.allergy")} / ${say("onb.keepOut.dislike")}`);
    ["allergy","dislike"].forEach(k=>{
      const kb = document.createElement("button");
      kb.type = "button"; kb.textContent = say("onb.keepOut." + k); kb.setAttribute("aria-pressed", String(kind===k));
      kb.addEventListener("click", ()=>{ kind = k; kinds.querySelectorAll("button").forEach(z=>z.setAttribute("aria-pressed", String(z===kb))); inp.focus(); });
      kinds.appendChild(kb);
    });
    const add = document.createElement("button");
    add.type = "button"; add.className = "btn-ink"; add.textContent = say("onb.keepOut.addIt");
    const commit = ()=>{
      const v = inp.value.trim();
      if(!v){ inp.focus(); return; }
      const have = P.avoid.find(f=>f.name.toLowerCase()===v.toLowerCase());
      if(have) have.kind = kind;
      else{
        P.fine = P.fine.filter(x=>x.name.toLowerCase()!==v.toLowerCase());
        zone.querySelectorAll(".ab.own").forEach(x=>{ if(x.dataset.name.toLowerCase()===v.toLowerCase()){ if(pile) pile.remove(x); x.remove(); } });
        P.avoid.push({name:v, kind});
        added = ownCircle({name:v}, "avoid");
        if(pile) pile.add(added); 
      }
      save();
      live.textContent = say("onb.keepOut.said", {food:v, state:label("avoid")});
      sh.close();
      if(added) requestAnimationFrame(()=>added.focus({preventScroll:true}));
    };
    add.addEventListener("click", commit);
    inp.addEventListener("keydown", e=>{ if(e.key==="Enter"){ e.preventDefault(); commit(); } });
    sh.body.append(p, kinds, add);
    requestAnimationFrame(()=>inp.focus());
  }
  card.append(zone, live);
  if(!short) notes.forEach(t=>card.appendChild(line(t, "al-note")));
  if(pile) pile.stop();
  pile = null;
  if(!calm()){
    // seeded, so the tests can count on where things land: ?seed=, or a fresh one each time
    const q = new URLSearchParams(location.search).get("seed");
    requestAnimationFrame(()=>{ if(!zone.isConnected) return; pile = makePile(zone, els, q ? +q : (Date.now() & 0xffff)); pile.wake(); });
  }
  const go = ()=>{
    save();
    onb.draft = null;   // the week is built again from these answers
    const to = stepAfter("keepout");
    if(onb.single){ nextStep(); return; }
    if(calm() || !pile || noWeekYet()){ card.animate([{opacity:1}, {opacity:0}], {duration:150, fill:"forwards"}).onfinish = ()=>goStep(to, null, {instant:true}); return; }
    pile.open(()=>goStep(to, null, {instant:true}));
  };
  onbCta(card, onb.single ? say("onb.save") : noWeekYet() ? say("onb.next") : say("onb.keepOut.cta"), go);
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

/* 5–6. Reveal, then Done: one layout, built once. The reveal (about 3 s, the first pass only) draws it: three
   statements one at a time, the hairlines growing, the days filling in row by row, the glow cycling through the
   five food groups. Then the statements go and the header comes in over the same grid, with no layout shift.
   Done is the week, organised: a sticky day bar, one section per day, "Again" and "Love it". Nothing is
   applied until "Love it". */
const DAY_NUM = new Intl.DateTimeFormat(undefined, {day:"numeric"});
const DAY_SHORT = new Intl.DateTimeFormat(undefined, {weekday:"short"});
/* the week starts today if any of today's meals is still to come (or happening now), else tomorrow */
function weekStartsToday(){
  const t = now(), months = planMonths();
  return slotsFor(months).some(slot=>t - atTime(t, mealTime(slot, t)) < NOW_WINDOW_MIN * 60000);
}
/* the draft's days from a start date: [{date, day}] (the plan's days are named by weekday) */
function draftDays(week, start){
  return Array.from({length:7}, (_, k)=>{
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + k);
    return {date, day:week.days.find(d=>d.name===DAY_ORDER[date.getDay()]) || week.days[k % week.days.length]};
  });
}
/* per day: "First: {allergen}" on the day an allergen first comes, else "New: {food}" for the first food new to them */
function dayFirsts(days){
  const foods = knownFoods(), al = introducedAllergens(state.profile);
  return days.map(({day})=>{
    let first = null, fresh = null;
    day.meals.forEach(m=>m.items.forEach(i=>{
      allergensOf(i.name).forEach(a=>{ if(!al.has(a)){ al.add(a); if(!first) first = (ALLERGENS.find(x=>x.id===a) || {}).label; } });
      const id = foodIdOf(i);
      if(!foods.has(id)){ foods.add(id); if(!fresh) fresh = baseName(i); }
    }));
    return first ? say("onb.done.first", {allergen:lower1(first.split(" /")[0])}) : fresh ? say("onb.done.new", {food:lower1(fresh)}) : "";
  });
}
/* "8:00" (a 12-hour clock drops AM/PM here: the meal's name already says which part of the day), "08:00" in 24 h */
function clockTime(d){
  return (FMT.tp = FMT.tp || new Intl.DateTimeFormat(undefined, {hour:"numeric", minute:"2-digit"})).formatToParts(d)
    .filter(p=>p.type!=="dayPeriod").map(p=>p.value).join("").trim();
}
const weekSig = w=>w.days.map(d=>d.meals.map(m=>m.items.map(i=>i.name).join("+")).join("|")).join("/");
/* the statements: the stage's tagline; what's kept out (up to three, then "and {n} more"); "Seven days." */
function revealLines(P){
  const st = stageFor(planMonths());
  const out = [...ALLERGENS.filter(a=>P.allergens[a.id]==="avoid").map(a=>lower1(say("onb.keepOut.labels." + a.id) || a.label)),
               ...dietOut(P).map(g=>lower1(say("onb.keepOut.labels." + g.id) || g.label)), ...P.avoid.map(a=>lower1(a.name))];
  const without = !out.length ? say("onb.reveal.none")
    : out.length <= 3 ? say("onb.reveal.without", {list:listJoin(out)})
    : say("onb.reveal.without", {list:out.slice(0, 3).join(", ") + " " + say("onb.reveal.more", {n:out.length - 3})});
  return [say("onb.reveal.tagline", {tagline:st.name}), without, say("onb.reveal.days")];
}
function onbReveal(card, P){
  const name = P.name || "";
  if(noWeekYet()) return onbClosing(card, P);
  if(!onb.draft) onb.draft = generateWeek(planMonths(), P);   // first, and synchronously: nothing waits for the animation
  const today = weekStartsToday(), t = now();
  const start = today ? new Date(t.getFullYear(), t.getMonth(), t.getDate()) : tomorrowOf(new Date(t.getFullYear(), t.getMonth(), t.getDate()));
  onb.startISO = isoOf(start);
  const days = draftDays(onb.draft, start), firsts = dayFirsts(days);
  card.classList.add("wk-step");
  document.getElementById("onboarding").classList.add("has-week");
  // the header zone: the statements sit here during the reveal, the header after it
  const head = document.createElement("div");
  head.className = "wk-head";
  const h = document.createElement("h1");
  h.className = "wk-title"; h.id = "onbTitle"; h.tabIndex = -1;
  const ink = P.ink && P.ink.strokes && P.ink.strokes.length;
  h.innerHTML = (ink ? `<span class="wk-ink">${inkSVG(P.ink, "wk-ink-svg", {split:true})}<span class="sr-only">${esc(name)}</span></span>` : esc(name)) + esc(say("onb.done.titleAfter"));
  const support = line(say("onb.done.line", {tagline:stageFor(planMonths()).name}), "wk-support");
  const cap = line(say(today ? "onb.done.today" : "onb.done.tomorrow"), "wk-cap");
  head.append(h, support, cap);
  // the day bar: seven 44px buttons, the day in view underlined
  const jump = document.createElement("nav");
  jump.className = "wk-jump"; jump.setAttribute("aria-label", say("onb.done.days"));
  const list = document.createElement("ol");
  list.className = "wk-days";
  const sections = [];
  days.forEach(({date, day}, k)=>{
    const b = document.createElement("button");
    b.type = "button"; b.className = "wk-j";
    b.innerHTML = `<span>${esc(DAY_SHORT.format(date))}</span><span>${esc(DAY_NUM.format(date))}</span>`;
    b.setAttribute("aria-label", DAY_FULL(date) + " " + DAY_NUM.format(date));
    b.addEventListener("click", ()=>{ const s = sections[k]; card.scrollTo({top:s.offsetTop - jump.offsetHeight - head.offsetTop + 1, behavior:calm() ? "auto" : "smooth"}); });
    jump.appendChild(b);
    const li = document.createElement("li");
    li.className = "wk-day"; li.dataset.k = k;
    const rel = k===0 && today ? say("onb.done.dayToday") : (k===0 && !today) || (k===1 && today) ? say("onb.done.dayTomorrow") : "";
    li.innerHTML = `<i class="wk-rule" aria-hidden="true"></i><i class="wk-vrule" aria-hidden="true"></i>
      <h2 class="wk-dh"><span class="wk-dn">${esc(DAY_SHORT.format(date) + " " + DAY_NUM.format(date))}</span>${rel ? `<span class="wk-rel">${esc(rel)}</span>` : ""}${firsts[k] ? `<span class="wk-first">${esc(firsts[k])}</span>` : ""}</h2>`;
    day.meals.filter(m=>m.items.length).forEach(m=>{
      const r = document.createElement("div");
      r.className = "wk-meal";
      const time = clockTime(atTime(date, mealTime(m.slot, date)));
      r.innerHTML = `<p class="wk-ml"><span class="wk-mn">${esc(m.label)}</span><span class="wk-mt">${esc(say("onb.done.around", {time}))}</span></p>
        <p class="wk-foods">${esc(upper1(m.items.map(i=>lower1(baseName(i))).join(", ")))}</p>`;
      li.appendChild(r);
    });
    list.appendChild(li);
    sections.push(li);
  });
  card.append(head, jump, list);
  // which day is in view: the first section still below the bar
  const io = new IntersectionObserver(()=>{
    const top = card.getBoundingClientRect().top + jump.offsetHeight + 2;
    let k = sections.findIndex(s=>s.getBoundingClientRect().bottom > top + 24);
    if(k < 0) k = sections.length - 1;
    [...jump.children].forEach((b, i)=>b.classList.toggle("on", i===k));
  }, {root:card, threshold:[0, .25, .5, .75, 1]});
  sections.forEach(s=>io.observe(s));
  // the glow is the header's: it fades as the week scrolls, and only then do the sticky bars take the paper
  const plane = document.querySelector(".onb-backdrop .glow-plane");
  let sraf = 0;
  const onScroll = ()=>{ sraf = 0; const y = card.scrollTop; plane.style.opacity = String(Math.max(0, 1 - y / 80)); card.classList.toggle("stuck", y >= 80); };
  card.addEventListener("scroll", ()=>{ if(!sraf) sraf = requestAnimationFrame(onScroll); }, {passive:true});
  plane.style.opacity = "";
  jump.firstChild.classList.add("on");
  // Again · Love it
  const foot = document.getElementById("onbFoot");
  foot.classList.add("wk-foot");
  const again = textButton(say("onb.done.again"), ()=>{
    let w = generateWeek(planMonths(), P);
    for(let k = 0; k < 6 && weekSig(w)===weekSig(onb.draft); k++) w = generateWeek(planMonths(), P);   // never the same week twice in a row
    onb.draft = w;
    const keepFocus = document.activeElement===again;
    onb.revealed = true; renderOnb();
    const c = document.getElementById("onbCard");
    if(!calm()) c.querySelector(".wk-days").animate([{opacity:0}, {opacity:1}], {duration:250, easing:"ease-out"});
    const live = document.getElementById("onbProgress");   // inside the dialog, so it's heard under aria-modal
    live.textContent = ""; setTimeout(()=>{ live.textContent = say("onb.done.ready"); }, 30);
    if(keepFocus) document.querySelector("#onbFoot .wk-again").focus();
  }, "pill-o wk-again");
  const love = document.createElement("button");
  love.type = "button"; love.className = "btn-ink wk-love"; love.textContent = say("onb.done.apply");
  love.addEventListener("click", ()=>{
    haptic();
    startWeek(onb.draft, onb.startISO);   // nothing is lost: the offers stay in the log
    P.lastStage = stageNow().id;
    onb.draft = null;
    const el = document.getElementById("onboarding");
    if(calm()) finishOnboarding();
    else el.animate([{opacity:1}, {opacity:0}], {duration:300, easing:"ease-out"}).onfinish = finishOnboarding;
  });
  const row = document.createElement("div");
  row.className = "wk-acts";
  row.append(again, love);
  foot.appendChild(row);
  if(onb.revealed || onb.revealPlayed){
    // a second pass (Back, then Show the week again): straight to Done, a 250 ms crossfade
    onb.revealed = true; onb.revealPlayed = true;
    if(!calm()) card.animate([{opacity:0}, {opacity:1}], {duration:250});
    return;
  }
  playReveal(card, P, {head, h, support, cap, jump, list, sections, foot});
}
/* the timeline: transform and opacity only, every piece in its final place from the start */
function playReveal(card, P, x){
  const lines = revealLines(P);
  const say_ = document.createElement("div");
  say_.className = "wk-say"; say_.setAttribute("role", "status");
  say_.innerHTML = lines.map(t=>`<p class="wk-st">${esc(t)}</p>`).join("");
  x.head.appendChild(say_);
  const skip = textButton(say("onb.skip"), ()=>finish(true), "small wk-skip");
  document.getElementById("onboarding").appendChild(skip);
  x.foot.inert = true;
  const anims = [], at = (el, frames, delay, dur, easing)=>{ const a = el.animate(frames, {delay, duration:dur, easing:easing || "cubic-bezier(.22,.61,.36,1)", fill:"backwards"}); anims.push(a); return a; };
  const fade = [{opacity:0}, {opacity:1}];
  const rise = [{opacity:0, transform:"translateY(8px)"}, {opacity:1, transform:"none"}];
  const rows = x.list.querySelectorAll(".wk-dh, .wk-meal");
  const late = [x.h, x.support, x.cap, x.jump, x.foot];
  let glowT = 0, done = false;
  const finish = skipped=>{
    if(done) return;
    done = true;
    anims.forEach(a=>{ try{ a.finish(); }catch(e){} });
    clearInterval(glowT); clearTimeout(onb.revealTimer);
    say_.remove(); skip.remove();
    x.foot.inert = false;
    onb.revealed = true; onb.revealPlayed = true;
    onbGlow(ONB_GLOW.done);
    document.getElementById("onbBack").hidden = !hasBack();
    if(skipped || calm()) x.h.querySelectorAll(".wk-ink-svg path").forEach(p=>p.getAnimations().forEach(a=>a.finish()));
    if(onb.step==="reveal") x.h.focus({preventScroll:true});
  };
  if(calm()){
    // no timeline: the three statements as a still list for 1.5 s (or until Skip), then Done in 150 ms
    say_.classList.add("still");
    late.forEach(el=>at(el, fade, 1500, 150, "linear"));
    x.list.querySelectorAll(".wk-rule, .wk-vrule, .wk-dh, .wk-meal").forEach(el=>at(el, fade, 1500, 150, "linear"));
    at(say_, [{opacity:1}, {opacity:0}], 1500, 150, "linear").onfinish = ()=>finish(false);
    return;
  }
  // the statements: one at a time, each crossfading out as the next arrives
  const st = say_.children;
  [200, 1000, 1800].forEach((t, k)=>{
    const out = k < 2 ? [1000, 1800][k] : 2800;
    at(st[k], [{opacity:0, transform:"translateY(8px)"}, {opacity:1, transform:"none", offset:300 / (out - t + 300)}, {opacity:1, transform:"none", offset:(out - t) / (out - t + 300)}, {opacity:0, transform:"translateY(-6px)"}], t, out - t + 300);
  });
  // the hairlines: the day dividers, then the meal column's rule
  x.list.querySelectorAll(".wk-rule").forEach((el, k)=>at(el, [{transform:"scaleX(0)"}, {transform:"scaleX(1)"}], 300 + k * 70, 500));
  x.list.querySelectorAll(".wk-vrule").forEach((el, k)=>at(el, [{transform:"scaleY(0)"}, {transform:"scaleY(1)"}], 750 + k * 70, 500));
  // the days fill in, row by row
  const step = rows.length > 1 ? Math.min(90, 1200 / (rows.length - 1)) : 0;
  rows.forEach((el, k)=>at(el, rise, 1200 + k * step, 400));
  // then the header over the same grid, and the name's ink again, stroke by stroke
  late.forEach((el, k)=>at(el, fade, 2900 + k * 40, 400));
  const paths = x.h.querySelectorAll(".wk-ink-svg path");
  paths.forEach((p, k)=>at(p, fade, 3000 + k * 900 / paths.length, Math.max(120, 900 / paths.length), "linear"));
  // the glow through all five groups
  const groups = ["grain", "vegetable", "fruit", "protein", "fat"];
  let g = 0;
  onbGlow(groups[g]);
  glowT = setInterval(()=>{ g++; if(g < groups.length) onbGlow(groups[g]); else clearInterval(glowT); }, 600);
  onb.revealTimer = setTimeout(()=>finish(false), 3400);
}
/* under 6 months there's no week yet: one closing screen, then Home (only Home and Profile exist) */
function onbClosing(card, P){
  const name = P.name || "";
  const left = Math.max(1, 6 - ageNow());
  const h = document.createElement("h1");
  h.className = "sent"; h.id = "onbTitle"; h.tabIndex = -1; h.textContent = say("onb.closing.title", {name, n:left});
  card.append(h, line(say("onb.closing.line")));
  onbCta(card, say("onb.closing.cta"), finishOnboarding);
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
