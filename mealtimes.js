// Meal times on a day axis: one component, two hosts (the onboarding's step, and Profile's edit of it).
/* ---------- the day axis ----------
   The day runs down a hairline from 6:00 to 21:00. Each meal is a marker on it, in the day's order. Drag a marker:
   it snaps to 15 minutes, pushes its neighbours along to keep an hour between meals, and gives like a rubber band
   past either end of the day. Or tap it and type a time. Markers never pass each other. The glow is the sun: it
   follows the marker in hand, in the colour of its hour. Text only: no icons, no cards, no hover. */
const MT = {from:6 * 60, to:21 * 60, snap:15, gap:60, rubber:.3, maxRubber:40, hit:44, pad:14, minHourPx:22, undoMs:5000};
const mtSnap = (min, step)=>Math.round(min / (step || MT.snap)) * (step || MT.snap);
const mtMin = hm=>{ const v = hhmm(hm); return v ? v[0] * 60 + v[1] : null; };
const mtHM = min=>fmtHHMM([Math.floor(min / 60), min % 60]);
/* where marker i (of n) may go so that every marker still fits inside the day, an hour apart */
function mtRange(n, i){ return [MT.from + i * MT.gap, MT.to - (n - 1 - i) * MT.gap]; }
/* any times into a valid day: snapped, in order, an hour apart, inside the axis. Pure. */
function mtNormalize(times){
  const n = times.length, out = [];
  times.forEach((t, j)=>{ const [lo, hi] = mtRange(n, j); out[j] = Math.min(hi, Math.max(lo, mtSnap(t), j ? out[j - 1] + MT.gap : lo)); });
  return out;
}
/* times (minutes, in the day's order, already valid) with marker i moved to `to`: i is held inside its range, and
   its neighbours are pushed just far enough to keep the hour between meals. A new array; the input is untouched,
   so a drag resolves from where it started and a neighbour comes back when the marker does. */
function mtResolve(times, i, to){
  const n = times.length, out = times.slice(), [lo, hi] = mtRange(n, i);
  out[i] = Math.min(hi, Math.max(lo, to));
  for(let j = i + 1; j < n; j++) out[j] = Math.max(out[j], out[j - 1] + MT.gap);
  for(let j = i - 1; j >= 0; j--) out[j] = Math.min(out[j], out[j + 1] - MT.gap);
  return out;
}
/* past the end of its range a marker follows at 30% of the finger, easing toward 40px and never past it */
function mtRubber(over){
  const a = Math.abs(over);
  return Math.sign(over) * MT.maxRubber * (1 - 1 / (a * MT.rubber / MT.maxRubber + 1));
}
/* a typed time → minutes, or null. "7:30", "7.30", "730", "19h30", "1930", "7pm", "7:30 p.m.", "12a". Without AM/PM,
   an hour from 1 to 12 could be morning or evening: the one nearer where the meal is now ("7" for dinner is 19:00).
   A leading zero ("07:00") or an hour past 12 is taken as written. Whether it's inside the day is the caller's. */
function parseTyped(text, near){
  let s = String(text || "").trim().toLowerCase().replace(/\s+/g, "");
  let ap = null;
  const mer = /([ap])\.?(m\.?)?$/.exec(s);
  if(mer){ ap = mer[1]; s = s.slice(0, mer.index); }
  const m = /^(\d{1,2})(?:[:.,h](\d{2}))?$/.exec(s) || /^(\d{1,2})(\d{2})$/.exec(s);
  if(!m) return null;
  let h = +m[1];
  const mi = m[2] ? +m[2] : 0;
  if(mi > 59) return null;
  if(ap){ if(h < 1 || h > 12) return null; return (h % 12 + (ap==="p" ? 12 : 0)) * 60 + mi; }
  if(h > 23) return null;
  if(h===0 || h > 12 || (m[1].length===2 && m[1][0]==="0")) return h * 60 + mi;
  const at = near===undefined || near===null ? 12 * 60 : near;
  const c = [h % 12 * 60 + mi, (h % 12 + 12) * 60 + mi];
  return Math.abs(c[0] - at) <= Math.abs(c[1] - at) ? c[0] : c[1];
}
/* the reader's clock: "12:30 PM" or "12:30"; "6 AM" for an hour label */
const mtClock = min=>fmtTime(new Date(2026, 0, 1, Math.floor(min / 60), min % 60));
const mtHour = min=>(FMT.mth = FMT.mth || new Intl.DateTimeFormat(undefined, {hour:"numeric"})).format(new Date(2026, 0, 1, Math.floor(min / 60)));
/* does the reader's clock have AM and PM? (the typed field's keyboard follows it) */
function mtTwelve(){ const c = new Intl.DateTimeFormat(undefined, {hour:"numeric"}).resolvedOptions(); return c.hour12===true || c.hourCycle==="h12" || c.hourCycle==="h11"; }
/* "4 h 30", "1 h" */
function mtGapText(min){ const h = Math.floor(min / 60), m = min % 60; return m ? say("mealTimes.gapHM", {h, m}) : say("mealTimes.gapH", {h}); }

/* ---------- the meals of a day: which slots, at what times (index.html has the stage's) ---------- */
/* the defaults for this age: the stage's slots, at the stage's times */
function mtDefaults(months){
  const slots = slotsFor(months), base = stageTimes(months);
  return {slots, times:mtNormalize(slots.map(id=>mtMin(base[id])))};
}
/* what the family has now: their slots and times (their own where set, else the stage's), made valid */
function mtCurrent(months, P){
  const slots = mealSlotsFor(months, P), base = stageTimes(months);
  return {slots, times:mtNormalize(slots.map(id=>mtMin((P.mealTimes || {})[id]) ?? mtMin(base[id])))};
}
/* the free snack a family could add here, or null: the stage's allowed snacks that aren't in the day yet */
function mtFreeSnack(months, slots){ return (stageFor(months).snacks || []).find(id=>!slots.includes(id)) || null; }
/* where a snack lands when added: its usual time if that keeps an hour from both neighbours, else halfway */
function mtSnackTime(months, slots, times, id){
  const order = MEAL_SLOTS.map(ms=>ms.id), at = order.indexOf(id);
  let k = slots.findIndex(s=>order.indexOf(s) > at); if(k < 0) k = slots.length;
  const prev = k ? times[k - 1] : MT.from - MT.gap, next = k < slots.length ? times[k] : MT.to + MT.gap;
  if(next - prev < 2 * MT.gap) return null;   // no room for an hour on both sides
  const usual = mtMin(stageTimes(months)[id]);
  return {k, min:usual!==null && usual - prev >= MT.gap && next - usual >= MT.gap ? usual : mtSnap((prev + next) / 2)};
}
/* is this day the stage's usual? (any time or snack of their own makes it theirs) */
function mtIsDefault(months, slots, times){
  const d = mtDefaults(months);
  return slotSig(slots)===slotSig(d.slots) && times.every((t, k)=>t===d.times[k]);
}
/* keep a day: times that differ from the stage's are theirs (P.mealTimes), the rest keep following the stage; the
   snack choice is kept against this age's slots (P.mealSlots), so a stage boundary that changes them asks again */
function mtKeep(months, P, slots, times){
  const base = stageTimes(months), mt = {};
  slots.forEach((id, k)=>{ const t = mtHM(times[k]); if(t!==base[id]) mt[id] = t; });
  P.mealTimes = mt;
  P.mealSlots = {base:slotSig(slotsFor(months)), snacks:slots.filter(id=>SNACK_IDS.includes(id))};
}

/* ---------- the screen: the sentence, the strip, the axis, and its quiet links ----------
   o: {P, months, card, foot, entrance (play the arrival), onNext} */
function mealTimesScreen(o){
  const P = o.P, months = o.months, card = o.card;
  const cur = mtCurrent(months, P);
  let slots = cur.slots, times = cur.times;
  let sel = slots.includes(P.mealTimesSel) ? P.mealTimesSel : null;
  let touched = !!sel, drag = null, typing = null, undo = null, undoT = 0, H = 0, frozen = false;
  card.classList.add("fill", "mt-step");
  // "{name} usually eats around…", the name as its ink (and its spelling for screen readers) or as text
  const h = document.createElement("h1");
  h.className = "sent mt-sent"; h.id = "onbTitle"; h.tabIndex = -1;
  const [pre, post] = say("mealTimes.sentence").split("{name}");
  h.append(pre);
  if(P.ink && P.ink.strokes && P.ink.strokes.length){
    const s = document.createElement("span");
    s.className = "bd-ink"; s.innerHTML = inkSVG(P.ink, "bd-ink-svg") + `<span class="sr-only">${esc(P.name || "")}</span>`;
    h.appendChild(s);
  }else h.append(P.name || say("mealTimes.they"));
  h.append(post);
  const strip = document.createElement("div");
  strip.className = "mt-strip";
  const axis = document.createElement("div");
  axis.className = "mt-axis";
  axis.innerHTML = `<i class="mt-line" aria-hidden="true"></i><div class="mt-ticks" aria-hidden="true"></div><div class="mt-gaps" aria-hidden="true"></div><div class="mt-marks"></div>`;
  const line_ = axis.querySelector(".mt-line"), ticks = axis.querySelector(".mt-ticks"), gaps = axis.querySelector(".mt-gaps"), marks = axis.querySelector(".mt-marks");
  card.append(h, strip, axis);

  // the hours: a tick every hour, a label every three
  for(let t = MT.from; t <= MT.to; t += 60){
    const k = document.createElement("i");
    k.className = "mt-tick" + ((t - MT.from) % 180===0 ? " major" : "");
    k.dataset.min = t;
    if((t - MT.from) % 180===0) k.innerHTML = `<span class="mt-hour">${esc(mtHour(t))}</span>`;
    ticks.appendChild(k);
  }
  const span = ()=>Math.max(1, H - 2 * MT.pad);
  const pxPerMin = ()=>span() / (MT.to - MT.from);
  const yOf = min=>MT.pad + (min - MT.from) * pxPerMin();
  const label = id=>(MEAL_SLOTS.find(ms=>ms.id===id) || {}).label || id;

  // the markers and the gaps between them, rebuilt when the slots change
  let markEls = [], gapEls = [];
  const build = ()=>{
    marks.innerHTML = ""; gaps.innerHTML = "";
    markEls = slots.map(id=>{
      const m = document.createElement("div");
      m.className = "mt-m"; m.dataset.slot = id;
      m.innerHTML = `<i class="mt-mt" aria-hidden="true"></i><span class="mt-mn">${esc(label(id))}</span><span class="mt-mc"></span>`;
      marks.appendChild(m);
      return m;
    });
    gapEls = slots.slice(1).map(()=>{ const g = document.createElement("span"); g.className = "mt-gap"; gaps.appendChild(g); return g; });
  };
  const paint = ()=>{
    ticks.childNodes.forEach(k=>{ k.style.transform = `translateY(${yOf(+k.dataset.min).toFixed(1)}px)`; });
    markEls.forEach((m, k)=>{
      let y = yOf(times[k]);
      if(drag && drag.k===k) y += drag.rubber;
      m.style.transform = `translateY(${y.toFixed(1)}px)`;
      m.querySelector(".mt-mc").textContent = mtClock(times[k]);
      m.classList.toggle("on", slots[k]===sel);
      m.classList.toggle("held", !!drag && drag.k===k && drag.moved);
    });
    gapEls.forEach((g, k)=>{
      g.textContent = mtGapText(times[k + 1] - times[k]);
      g.style.transform = `translateY(${((yOf(times[k]) + yOf(times[k + 1])) / 2).toFixed(1)}px)`;
    });
    sun();
  };
  // the sun: the glow follows the marker in hand (or the selected one), in the colour of its hour. Untouched, it
  // waits by lunch in the colour of 10:00. Only the onboarding has the glow plane; the dark theme keeps its sky.
  let sunMin = null;
  const sun = ()=>{
    if(!H || !axis.isConnected) return;
    let k = sel ? slots.indexOf(sel) : -1;
    if(k < 0) k = Math.max(0, slots.indexOf("lunch"));
    const y = axis.getBoundingClientRect().top + yOf(times[k]) + (drag && drag.k===k ? drag.rubber : 0);
    const min = touched ? times[k] : SUN_IDLE;
    onbSun(min===sunMin ? null : sunColor(min), y, !!drag);
    sunMin = min;
  };
  const layout = ()=>{
    if(frozen) return;   // while a time is typed the keyboard is up: nothing moves underneath
    const hh = axis.clientHeight;
    if(!hh || hh===H) return;
    H = hh; paint();
  };
  new ResizeObserver(()=>requestAnimationFrame(layout)).observe(axis);

  // keep: every committed change is saved (a drop, a typed time, a snack added or removed, a reset)
  const keep = ()=>{ mtKeep(months, P, slots, times); P.mealTimesSel = sel; save(); };
  const select = id=>{ sel = id; touched = true; P.mealTimesSel = sel; save(); paintStrip(); paint(); };

  // the strip, under the sentence: the hint; the selected meal with its actions; the typed time; or the undo line
  const paintStrip = ()=>{
    strip.innerHTML = "";
    strip.dataset.mode = typing ? "typing" : undo ? "undo" : sel ? "selected" : "hint";
    if(undo){
      strip.append(Object.assign(document.createElement("span"), {className:"mt-say", textContent:say("mealTimes.usualDone")}), " ",
                   textButton(say("mealTimes.undo"), ()=>{ const u = undo; clearUndo(); slots = u.slots; times = u.times; sel = u.sel; build(); keep(); paintStrip(); paint(); haptic(); }, "small inline mt-undo"));
      return;
    }
    if(typing){ strip.appendChild(typing.el); if(typing.msg.textContent) strip.appendChild(typing.msg); return; }
    if(!sel){ strip.appendChild(Object.assign(document.createElement("p"), {className:"mt-hint", textContent:say("mealTimes.hint")})); return; }
    const k = slots.indexOf(sel);
    strip.append(Object.assign(document.createElement("span"), {className:"mt-say", textContent:say("mealTimes.selected", {meal:label(sel), time:mtClock(times[k])})}), " ");
    strip.appendChild(textButton(say("mealTimes.type"), ()=>startTyping(sel), "small inline mt-type"));
    if(SNACK_IDS.includes(sel)) strip.appendChild(textButton(say("mealTimes.remove"), ()=>removeSnack(sel), "small inline mt-remove"));
  };
  const clearUndo = ()=>{ clearTimeout(undoT); undo = null; };

  // typing a time: the field sits in the strip, above the axis, so the keyboard never covers it; the keyboard only
  // opens from "Type a time" (inside the tap, as iOS needs), and the axis holds still while it's up
  const startTyping = id=>{
    clearUndo();
    const k = slots.indexOf(id);
    const msg = Object.assign(document.createElement("p"), {className:"mt-msg"});
    msg.setAttribute("aria-live", "polite");
    const b = blank({value:"", min:5, maxLength:9, label:say("mealTimes.typeLabel", {meal:label(id)}), enterkeyhint:"done",
                     inputmode:mtTwelve() ? "text" : "decimal", onEnter:()=>done(true)});
    b.input.placeholder = "";
    const p = document.createElement("p");
    p.className = "mt-typed";
    p.append(say("mealTimes.typed", {meal:label(id)}) + " ", b.el);
    typing = {id, el:p, msg, input:b.input};
    frozen = true;
    const done = commit=>{
      if(!typing || typing.closing) return;
      const v = b.input.value.trim();
      if(commit && v){
        const t = parseTyped(v, times[k]);
        const bad = t===null ? say("mealTimes.bad") : t < MT.from || t > MT.to ? say("mealTimes.out", {from:mtClock(MT.from), to:mtClock(MT.to)}) : "";
        if(bad){ msg.textContent = bad; if(!msg.isConnected) strip.appendChild(msg); b.input.focus({preventScroll:true}); return; }
        const want = mtSnap(t);
        times = mtResolve(times, k, want);
        touched = true;
        keep();
        typing.closing = true;
        typing = null; frozen = false;
        paintStrip(); requestAnimationFrame(layout); paint();
        if(times[k]!==want) strip.appendChild(Object.assign(document.createElement("p"), {className:"mt-msg", textContent:say("mealTimes.moved", {time:mtClock(times[k])})}));
        haptic();
        return;
      }
      typing.closing = true;
      typing = null; frozen = false;
      paintStrip(); requestAnimationFrame(layout);
    };
    b.input.addEventListener("blur", ()=>setTimeout(()=>{ if(typing && typing.input===b.input && document.activeElement!==b.input) done(true); }, 0));
    b.input.addEventListener("keydown", e=>{ if(e.key==="Escape"){ e.preventDefault(); done(false); } });
    paintStrip();
    b.input.focus({preventScroll:true});
  };

  // snacks: added where there's room (its usual time, else halfway), removed from the strip when selected
  const removeSnack = id=>{
    const k = slots.indexOf(id);
    if(k < 0) return;
    clearUndo();
    slots = slots.filter(s=>s!==id); times = times.filter((_, j)=>j!==k);
    sel = null;
    build(); keep(); paintStrip(); paint(); paintLinks(); haptic();
  };
  const addSnack = ()=>{
    const id = mtFreeSnack(months, slots);
    const at = id && mtSnackTime(months, slots, times, id);
    if(!at) return;
    clearUndo();
    slots = slots.slice(0, at.k).concat(id, slots.slice(at.k));
    times = times.slice(0, at.k).concat(at.min, times.slice(at.k));
    sel = id; touched = true;
    build(); keep(); paintStrip(); paint(); paintLinks(); haptic();
    if(!calm()) markEls[at.k].animate([{opacity:0, transform:`translateY(${(yOf(at.min) - 24).toFixed(1)}px)`}, {opacity:1, transform:`translateY(${yOf(at.min).toFixed(1)}px)`}], {duration:320, easing:"cubic-bezier(.32,1.25,.5,1)"});
  };
  // "Use the usual": back to the stage's, with five seconds to undo it (and nothing at all when it already is)
  const useUsual = ()=>{
    if(mtIsDefault(months, slots, times)) return;
    clearUndo();
    undo = {slots, times, sel};
    const d = mtDefaults(months);
    const same = slotSig(d.slots)===slotSig(slots);
    slots = d.slots; times = d.times; sel = null;
    if(!same) build();
    keep();
    paintStrip(); paint(); paintLinks(); haptic();
    undoT = setTimeout(()=>{ undo = null; paintStrip(); }, MT.undoMs);
  };

  // the drag: the nearest marker to the finger (within 44px), 1:1, snapped live, pushing, rubber past the ends
  const nearest = y=>{
    let best = -1, d = MT.hit;
    times.forEach((t, k)=>{ const dd = Math.abs(yOf(t) - y); if(dd < d){ d = dd; best = k; } });
    return best;
  };
  axis.addEventListener("pointerdown", e=>{
    if(typing){ typing.input.blur(); return; }
    if(drag) return;
    const r = axis.getBoundingClientRect(), y = e.clientY - r.top, k = nearest(y);
    if(k < 0) return;
    e.preventDefault();
    try{ axis.setPointerCapture(e.pointerId); }catch(_){}
    clearUndo();
    drag = {id:e.pointerId, k, y0:y, start:times.slice(), t0:times[k], moved:false, rubber:0};
    sel = slots[k]; touched = true; paintStrip(); paint();
  });
  axis.addEventListener("pointermove", e=>{
    if(!drag || e.pointerId!==drag.id) return;
    const y = e.clientY - axis.getBoundingClientRect().top, dy = y - drag.y0;
    if(!drag.moved && Math.abs(dy) < 4) return;
    drag.moved = true;
    const raw = drag.t0 + dy / pxPerMin(), [lo, hi] = mtRange(slots.length, drag.k);
    const over = raw < lo ? (raw - lo) * pxPerMin() : raw > hi ? (raw - hi) * pxPerMin() : 0;
    drag.rubber = mtRubber(over);
    times = mtResolve(drag.start, drag.k, mtSnap(Math.min(hi, Math.max(lo, raw))));
    paint();
    strip.querySelector(".mt-say") && (strip.querySelector(".mt-say").textContent = say("mealTimes.selected", {meal:label(sel), time:mtClock(times[drag.k])}));
  });
  const drop = e=>{
    if(!drag || e.pointerId!==drag.id) return;
    const d = drag, m = markEls[d.k];
    drag = null;
    if(d.moved){
      // a rubber band springs back to its end of the day
      if(d.rubber && !calm()) m.animate([{transform:`translateY(${(yOf(times[d.k]) + d.rubber).toFixed(1)}px)`}, {transform:`translateY(${yOf(times[d.k]).toFixed(1)}px)`}], {duration:320, easing:"cubic-bezier(.32,1.25,.5,1)"});
      keep(); haptic();
    }else{ P.mealTimesSel = sel; save(); }
    paintStrip(); paint();
  };
  axis.addEventListener("pointerup", drop);
  axis.addEventListener("pointercancel", drop);

  // the foot: Next (or Save), then one row: "Add a snack" (while there's room) and "Use the usual"
  const next = onbCta(card, say("onb.next"), ()=>{
    if(typing) typing.input.blur();
    clearUndo();
    mtKeep(months, P, slots, times);
    P.mealTimesSource = mtIsDefault(months, slots, times) ? "default" : "custom";
    delete P.mealTimesSel;
    save();
    o.onNext();
  });
  next.classList.add("mt-next");
  const links = document.createElement("div");
  links.className = "mt-links";
  o.foot.appendChild(links);
  const paintLinks = ()=>{
    links.innerHTML = "";
    const free = mtFreeSnack(months, slots);
    if(free && mtSnackTime(months, slots, times, free)) links.appendChild(textButton(say("mealTimes.addSnack"), addSnack, "small inline mt-add"));
    links.appendChild(textButton(say("mealTimes.usual"), useUsual, "small inline mt-usual"));
  };

  build(); paintStrip(); paintLinks();
  H = axis.clientHeight; paint();
  if(o.entrance && !calm()) entrance();

  /* the arrival, after the allergen circles have gone: the hairline draws top to bottom (600 ms), the hours fade in
     (200 ms), the markers fall in from above 70 ms apart on the settle spring, then the gaps. About a second. */
  function entrance(){
    const ease = "cubic-bezier(.22,.61,.36,1)", spring = "cubic-bezier(.32,1.25,.5,1)";
    const A = (el, frames, delay, duration, easing)=>el.animate(frames, {delay, duration, easing:easing || ease, fill:"backwards"});
    A(h, [{opacity:0}, {opacity:1}], 0, 250);
    A(strip, [{opacity:0}, {opacity:1}], 100, 250);
    A(line_, [{transform:"scaleY(0)"}, {transform:"scaleY(1)"}], 0, 600);
    A(ticks, [{opacity:0}, {opacity:1}], 420, 200);
    markEls.forEach((m, k)=>{
      const y = yOf(times[k]);
      A(m, [{opacity:0, transform:`translateY(${(-40 - k * 6).toFixed(1)}px)`}, {opacity:1, offset:.3}, {opacity:1, transform:`translateY(${y.toFixed(1)}px)`}], 440 + k * 70, 420, spring);
    });
    A(gaps, [{opacity:0}, {opacity:1}], 440 + slots.length * 70 + 200, 200);
    A(o.foot, [{opacity:0}, {opacity:1}], 600, 300);
  }
  return {axis, strip, get slots(){ return slots; }, get times(){ return times; }, get sel(){ return sel; }};
}
