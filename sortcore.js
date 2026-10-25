/* ---------- Sort the food: the parts with no DOM ----------
   What a sort means for the plan (getFoodRules), and matching a typed food to the manifest. The screen is sortfood.js;
   every number is in sortconfig.js. */

const SORT_PLACES = ["keepOut", "notFan", "tried", "untouched"];

/* profile.foodSort, always whole: {v:1, placement:{[foodId]: place}, custom:[{id, label, place, matchedFoodIds}],
   firstPileComplete, completedAt, shapeSeed} */
function freshFoodSort(){ return {v:1, placement:{}, custom:[], firstPileComplete:false, completedAt:null, shapeSeed:null}; }
function sortOf(profile){
  const s = profile && profile.foodSort;
  if(s && typeof s==="object" && s.placement && Array.isArray(s.custom)) return s;
  // a profile from before the sort: what its allergens, keep-outs and diets said (index.html), until the sort is opened
  return profile && typeof legacyFoodSort==="function" ? legacyFoodSort(profile) : freshFoodSort();
}

/* What the plan does with every food, from the sort alone. One pure selector; the generator reads this and nothing
   else from the screen.
   neverIds:   kept out, every food containing a kept-out allergen, and what a custom "Keep out" matched
   avoidIds:   Not a fan (a food, a custom match, or every food containing a not-a-fan allergen): only when a slot
               has nothing else
   freeIds:    Tried already, and any food whose allergens were all tried
   introduceIds: Untouched, and every everyday food not sorted at all: one new food per meal
   introduceAllergenIds: the big ones still untouched: one first time per ALLERGEN_SPACING_DAYS, from 6 months
   A food sits in one set only: never, then avoid, then the food's own place, then what its allergens say. */
function getFoodRules(profile, catalog){
  const fs = sortOf(profile), big = new Set(SORT_CONFIG.bigFoods), place = fs.placement;
  const kept = new Set(), notFan = new Set(), tried = new Set();
  SORT_CONFIG.bigFoods.forEach(a=>{ const p = place[a]; if(p==="keepOut") kept.add(a); else if(p==="notFan") notFan.add(a); else if(p==="tried") tried.add(a); });
  const customNever = new Set(), customAvoid = new Set();
  fs.custom.forEach(c=>(c.matchedFoodIds || []).forEach(id=>{
    const out = c.place==="keepOut";
    (out ? customNever : customAvoid).add(id);
    if(big.has(id)) (out ? kept : notFan).add(id);   // "peanuts" typed in is the peanut, with everything carrying it
  }));
  const neverIds = [], avoidIds = [], freeIds = [], introduceIds = [];
  catalog.forEach(f=>{
    if(f.group==="other") return;
    const has = f.contains || [], p = place[f.id];
    if(p==="keepOut" || customNever.has(f.id) || has.some(a=>kept.has(a))) neverIds.push(f.id);
    else if(p==="notFan" || customAvoid.has(f.id) || has.some(a=>notFan.has(a))) avoidIds.push(f.id);
    else if(p==="tried") freeIds.push(f.id);
    else if(p==="untouched" || big.has(f.id)) introduceIds.push(f.id);
    else if(has.length && has.every(a=>tried.has(a))) freeIds.push(f.id);
    else introduceIds.push(f.id);
  });
  const introduceAllergenIds = SORT_CONFIG.bigFoods.filter(a=>!kept.has(a) && !notFan.has(a) && !tried.has(a));
  return {neverIds, avoidIds, freeIds, introduceIds, introduceAllergenIds};
}

/* ---------- matching what's typed ("Strawberries", "crème fraîche", "yoghurt") to the manifest ---------- */
function sortNorm(s){
  return String(s || "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/['’]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}
/* simple plurals, word by word: berries → berry, peaches → peach, tomatoes → tomato, grapes → grape (not hummus, couscous) */
function sortSingular(s){
  return s.split(" ").map(w=>{
    if(w.length > 4 && /ies$/.test(w)) return w.slice(0, -3) + "y";
    if(w.length > 4 && /(ches|shes|sses|xes|oes)$/.test(w)) return w.slice(0, -2);
    if(w.length > 3 && /s$/.test(w) && !/(ss|us|is)$/.test(w)) return w.slice(0, -1);
    return w;
  }).join(" ");
}
const sortKey = s=>sortSingular(sortNorm(s));
let SORT_INDEX = null;
function sortIndex(catalog){
  if(SORT_INDEX && SORT_INDEX.catalog===catalog) return SORT_INDEX.map;
  const map = new Map();
  const put = (name, id)=>{ const k = sortKey(name); if(!k) return; if(!map.has(k)) map.set(k, new Set()); map.get(k).add(id); };
  catalog.forEach(f=>{
    if(f.group==="other") return;
    [f.label, f.id.replace(/-/g, " "), ...(f.aliases || [])].forEach(n=>{ put(n, f.id); put(String(n).split(",")[0], f.id); });
  });
  SORT_INDEX = {catalog, map};
  return map;
}
/* the manifest ids a typed name stands for ([] when it's nothing we plan with): the foods it names, and the foods whose
   names hold it as a whole word ("beef" is beef and the beef meatballs, "cheese" is cheese and cottage cheese), so a
   kept-out word never lets a food through under a longer name */
function matchFood(text, catalog){
  const key = sortKey(text), map = sortIndex(catalog), out = new Set(map.get(key) || []);
  if(key.length >= 3) map.forEach((ids, k)=>{ if(k!==key && (" " + k + " ").includes(" " + key + " ")) ids.forEach(id=>out.add(id)); });
  return [...out];
}
/* everything a match keeps out with it: the foods themselves and, for a big one, every food containing it */
function matchReach(ids, catalog){
  const out = new Set(ids);
  catalog.forEach(f=>{ if((f.contains || []).some(a=>ids.includes(a))) out.add(f.id); });
  return [...out];
}

/* the second pile: the everyday foods on the board at this age (minMonths at most the child's months), without the big
   ones; none before solids */
function sortEverydayFoods(months){
  if(months < 6) return [];
  const big = new Set(SORT_CONFIG.bigFoods);
  return FOODS.filter(f=>f.group!=="other" && !big.has(f.id) && f.minMonths <= months);
}

/* ---------- the shapes: seeded blobs, sized to the field and packed into it ----------
   A shape is a <button> whose CSS border-radius takes eight random percentages (each corner's horizontal and vertical
   radius) from RADIUS_RANGE: irregular, always rounded. d is its shorter side; aspect stretches the other. */
function sortRng(seed){
  let a = seed >>> 0;
  return ()=>{ a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
/* a stable number for a string (a food's id), so each food keeps its own shape whatever else is in the pile */
function sortHash(str, seed){
  let h = 2166136261 ^ (seed >>> 0);
  for(let k = 0; k < str.length; k++){ h ^= str.charCodeAt(k); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}
const radiusRatio = r=>Math.min(...r) / Math.max(...r);
function makeShape(rnd){
  const C = SORT_CONFIG, [lo, hi] = C.RADIUS_RANGE;
  let radii;
  // drawn again while the radii are too uneven, or all exactly 50% (a plain ellipse)
  do radii = Array.from({length:8}, ()=>Math.round((lo + rnd() * (hi - lo)) * 1000) / 10);
  while(radiusRatio(radii) < C.RADIUS_RATIO_MIN || radii.every(r=>r===50));
  const [a0, a1] = C.ASPECT_RANGE, aspect = a0 + rnd() * (a1 - a0);
  const rot = (rnd() * 2 - 1) * C.REST_ROTATION;
  return {radii, aspect, rot};
}
/* "TL% TR% BR% BL% / TL% TR% BR% BL%": the horizontal radii, then the vertical */
const shapeRadiusCSS = s=>s.radii.slice(0, 4).map(r=>r + "%").join(" ") + " / " + s.radii.slice(4).map(r=>r + "%").join(" ");
/* width and height for a shorter side d: aspect over 1 is wider than tall, under 1 taller */
function shapeBox(s, d){ return {w:d * Math.max(1, s.aspect), h:d * Math.max(1, 1 / s.aspect)}; }
/* The largest circle around the centre that stays inside the shape (px, a diameter): the outline is the CSS one,
   radii scaled down as CSS does when a side's two radii add up to more than it, sampled at 2° steps. */
function shapeInscribed(s, w, h){
  const R = s.radii.map((r, k)=>r / 100 * (k < 4 ? w : h));
  const [tlx, trx, brx, blx, tly, try_, bry, bly] = R;
  const f = Math.min(1, w / (tlx + trx), w / (blx + brx), h / (tly + bly), h / (try_ + bry));
  const c = [[tlx, tly, 0, 0, 1, 1], [trx, try_, w, 0, -1, 1], [brx, bry, w, h, -1, -1], [blx, bly, 0, h, 1, -1]].map(([rx, ry, x, y, sx, sy])=>({rx:rx * f, ry:ry * f, x, y, sx, sy}));
  let best = Infinity;
  for(let deg = 0; deg < 360; deg += 2){
    const t = deg * Math.PI / 180, dx = Math.cos(t), dy = Math.sin(t);
    // walk out from the centre to the outline: the box edge, or a corner's ellipse when the ray falls in its corner
    let lo = 0, hi = Math.hypot(w, h);
    for(let it = 0; it < 30; it++){
      const m = (lo + hi) / 2, x = w / 2 + dx * m, y = h / 2 + dy * m;
      let inside = x >= 0 && x <= w && y >= 0 && y <= h;
      if(inside) for(const k of c){
        const cx = k.x + k.sx * k.rx, cy = k.y + k.sy * k.ry;
        if((x - cx) * k.sx < 0 && (y - cy) * k.sy < 0 && ((x - cx) / k.rx) ** 2 + ((y - cy) / k.ry) ** 2 > 1){ inside = false; break; }
      }
      if(inside) lo = m; else hi = m;
    }
    best = Math.min(best, lo);
  }
  return best * 2;
}
/* the label in at most two balanced lines: the split that keeps the longer line shortest */
function labelLines(label){
  const words = String(label).toUpperCase().split(/\s+/).filter(Boolean);
  if(words.length < 2) return [words.join(" ")];
  let best = null;
  for(let k = 1; k < words.length; k++){
    const a = words.slice(0, k).join(" "), b = words.slice(k).join(" "), m = Math.max(a.length, b.length);
    if(!best || m < best.m) best = {m, lines:[a, b]};
  }
  return best.lines;
}
const MONO_ADVANCE = 0.6;   // JetBrains Mono: every glyph is 0.6em wide
/* the label's size: as big as fits LABEL_FIT of the width, between 11 and 14px */
function labelSize(label, w){
  const C = SORT_CONFIG, n = Math.max(...labelLines(label).map(l=>l.length));
  return Math.max(C.LABEL_PX[0], Math.min(C.LABEL_PX[1], Math.floor(w * C.LABEL_FIT / (n * MONO_ADVANCE) * 10) / 10));
}
/* the narrowest width that still fits the label at 11px */
function labelNeed(label){ const n = Math.max(...labelLines(label).map(l=>l.length)); return n * MONO_ADVANCE * SORT_CONFIG.LABEL_PX[0] / SORT_CONFIG.LABEL_FIT; }

/* Sizes for the pile: together they cover COVERAGE of the field, each weighted by its label's length
   (0.8 + 0.04 per character), the shorter side between MIN_D and MAX_D and never too narrow for its label. scale < 1
   is the packer shrinking them (never below MIN_D). */
function sizeShapes(items, field, scale){
  const C = SORT_CONFIG, area = field.w * field.h * C.COVERAGE;
  const unit = items.reduce((s, it)=>{ const wt = 0.8 + 0.04 * it.label.length, b = shapeBox(it.shape, 1); return s + Math.PI / 4 * b.w * b.h * wt; }, 0);
  const k = Math.sqrt(area / Math.max(unit, 1e-6));
  return items.map(it=>{
    const wt = 0.8 + 0.04 * it.label.length;
    let d = Math.min(C.MAX_D, k * Math.sqrt(wt)) * (scale || 1);
    const need = labelNeed(it.label) / Math.max(1, it.shape.aspect);   // the width is d × aspect when it's wider
    d = Math.max(C.MIN_D, need, d);
    return Math.min(Math.max(C.MAX_D, need), d);
  });
}
/* half the box a shape needs at its angle (the outline sits inside its rotated box) */
function rotHalf(w, h, deg){ const t = deg * Math.PI / 180, c = Math.abs(Math.cos(t)), s = Math.abs(Math.sin(t)); return {x:(w * c + h * s) / 2, y:(w * s + h * c) / 2}; }
/* The packing: a jittered grid, then PACK_ITERATIONS rounds pushing overlapping collision circles apart, every shape
   inside the field. Overlap over PACK_OVERLAP_MAX left: shrink 4% and go again (PACK_RETRIES times, never below MIN_D).
   items: [{id, label, shape}]; field: {w, h}. Returns {ok, overlap, tries, bodies:[{id, x, y, w, h, d, r, rot}]} */
function packShapes(items, field, rnd, start, radius){
  const C = SORT_CONFIG, cr = radius || C.COLLISION_RADIUS;
  let result = null;
  for(let t = 0, scale = 1; t <= C.PACK_RETRIES; t++, scale *= 1 - C.PACK_SHRINK){
    const ds = sizeShapes(items, field, scale);
    const B = items.map((it, k)=>{ const b = shapeBox(it.shape, ds[k]); return {id:it.id, w:b.w, h:b.h, d:ds[k], r:cr * (b.w + b.h) / 4, rot:it.shape.rot, half:rotHalf(b.w, b.h, it.shape.rot)}; });
    // the grid: as many columns as keep the cells near square, each shape jittered within its cell
    const n = B.length, cols = Math.max(1, Math.round(Math.sqrt(n * field.w / Math.max(field.h, 1)))), rows = Math.ceil(n / Math.max(cols, 1));
    const cw = field.w / cols, ch = field.h / rows, jr = rnd();
    B.forEach((b, k)=>{
      const was = start && start[b.id];
      if(was){ b.x = was.x; b.y = was.y; return; }
      const row = Math.floor(k / cols), inRow = Math.min(cols, n - row * cols), col = k % cols, off = (cols - inRow) * cw / 2;
      b.x = off + (col + .5) * cw + (rnd() - .5) * cw * .3 + (row % 2 ? 1 : -1) * cw * .08 * jr;
      b.y = (row + .5) * ch + (rnd() - .5) * ch * .3;
    });
    const clamp = b=>{ b.x = Math.min(field.w - b.half.x, Math.max(b.half.x, b.x)); b.y = Math.min(field.h - b.half.y, Math.max(b.half.y, b.y)); };
    B.forEach(clamp);
    let overlap = 0;
    for(let it = 0; it < C.PACK_ITERATIONS; it++){
      overlap = 0;
      for(let i = 0; i < n; i++) for(let j = i + 1; j < n; j++){
        const a = B[i], b = B[j]; let dx = b.x - a.x, dy = b.y - a.y, dd = Math.hypot(dx, dy);
        const o = a.r + b.r - dd;
        if(o <= 0) continue;
        if(dd < 1e-6){ dx = rnd() - .5; dy = rnd() - .5; dd = Math.hypot(dx, dy); }
        const push = o / 2 * 1.02;
        a.x -= dx / dd * push; a.y -= dy / dd * push; b.x += dx / dd * push; b.y += dy / dd * push;
      }
      B.forEach(clamp);
      for(let i = 0; i < n; i++) for(let j = i + 1; j < n; j++) overlap = Math.max(overlap, B[i].r + B[j].r - Math.hypot(B[j].x - B[i].x, B[j].y - B[i].y));
      if(overlap <= 0.5) break;
    }
    result = {ok:overlap <= C.PACK_OVERLAP_MAX, overlap:Math.max(0, overlap), tries:t + 1, scale, radius:cr, bodies:B.map(b=>({id:b.id, x:b.x, y:b.y, w:b.w, h:b.h, d:b.d, r:b.r, rot:b.rot}))};
    if(result.ok || B.every(b=>b.d <= C.MIN_D + .01)) break;
  }
  return result;
}
/* the pile for a seed: one shape per item (seeded by the seed and the item's id), packed into the field */
function pileFor(items, field, seed, start){
  const placed = items.map(it=>Object.assign({}, it, {shape:makeShape(sortRng(sortHash(it.id, seed)))}));
  // roomy first (PACK_ROOMY: neighbours never cover a label), the brief's 0.82 when the field is too small for that
  const roomy = packShapes(placed, field, sortRng(seed ^ 0x9E3779B9), start, SORT_CONFIG.PACK_ROOMY);
  const pack = roomy.ok && roomy.scale===1 ? roomy : packShapes(placed, field, sortRng(seed ^ 0x9E3779B9), start);
  return {items:placed, pack};
}
/* A seed's score for a field (seeds.mjs keeps the best SEED_KEEP): it must pack; then the smallest inscribed circle,
   the evenest shapes and a balanced pile (its area's centre near the field's, and both halves about as full) win. */
function scoreSeed(items, field, seed){
  const {items:placed, pack} = pileFor(items, field, seed);
  const ins = Math.min(...pack.bodies.map((b, k)=>shapeInscribed(placed[k].shape, b.w, b.h)));
  const quality = Math.min(...placed.map(p=>radiusRatio(p.shape.radii)));
  const A = pack.bodies.map(b=>b.w * b.h), tot = A.reduce((s, a)=>s + a, 0);
  const cx = pack.bodies.reduce((s, b, k)=>s + b.x * A[k], 0) / tot, cy = pack.bodies.reduce((s, b, k)=>s + b.y * A[k], 0) / tot;
  const off = Math.hypot((cx - field.w / 2) / field.w, (cy - field.h / 2) / field.h);
  const left = pack.bodies.reduce((s, b, k)=>s + (b.x < field.w / 2 ? A[k] : 0), 0) / tot;
  const balance = Math.max(0, 1 - off * 4 - Math.abs(left - .5) * 2);
  const pass = pack.ok && ins >= SORT_CONFIG.MIN_INSCRIBED;
  const score = (pass ? 1 : 0) + .3 * Math.min(1, Math.max(0, (ins - SORT_CONFIG.MIN_INSCRIBED) / 20)) + .3 * quality + .4 * balance - pack.overlap / 100;
  return {seed, score, pass, inscribed:ins, quality, balance, overlap:pack.overlap, tries:pack.tries};
}

/* ---------- the engine: rigid shapes on a table, no gravity, nothing moving until touched ----------
   Each body has a position and a rotation; it collides as a circle of COLLISION_RADIUS of its radius (so outlines may
   overlap a little where they touch), with mass in proportion to its area. A held body follows the finger and pushes
   whatever it meets: the contact passes on velocity along the normal and, through friction at the contact point,
   spin. Velocity halves every LINEAR_HALF_LIFE_MS (spin every ANGULAR_HALF_LIFE_MS), slow bodies stop rather than creep,
   and a body stays where it stops. Fixed steps of DT; the world sleeps once everything has been still SLEEP_MS. */
function sortWorld(W, H){ return {W, H, bodies:[], still:0, asleep:true, t:0}; }
function sortBody(o){
  const C = SORT_CONFIG, r = C.COLLISION_RADIUS * (o.w + o.h) / 4, m = o.w * o.h;
  return {id:o.id, x:o.x, y:o.y, a:0, vx:0, vy:0, w:0, bw:o.w, bh:o.h, rot0:o.rot || 0, r, m, I:m * r * r / 2, held:false, flow:null};
}
const bodyDeg = b=>b.rot0 + b.a * 180 / Math.PI;
function sortStep(world){
  const C = SORT_CONFIG, dt = C.DT, B = world.bodies;
  const kl = Math.pow(0.5, dt * 1000 / C.LINEAR_HALF_LIFE_MS), ka = Math.pow(0.5, dt * 1000 / C.ANGULAR_HALF_LIFE_MS);
  world.t += dt * 1000;
  B.forEach(b=>{
    if(b.flow){   // gliding to a new packing position: not simulated
      const k = Math.min(1, (world.t - b.flow.t0) / b.flow.ms), e = 1 - Math.pow(1 - k, 3);
      b.x = b.flow.x0 + (b.flow.x1 - b.flow.x0) * e; b.y = b.flow.y0 + (b.flow.y1 - b.flow.y0) * e;
      b.vx = b.vy = b.w = 0;
      if(k >= 1) b.flow = null;
      return;
    }
    if(b.held){   // the finger moves it: its velocity is what it moved
      b.vx = (b.tx - b.x) / dt; b.vy = (b.ty - b.y) / dt; b.x = b.tx; b.y = b.ty; b.w = 0;
      return;
    }
    b.vx *= kl; b.vy *= kl; b.w *= ka;
    const sp = Math.hypot(b.vx, b.vy);
    if(sp < C.REST_SPEED){ b.vx *= C.REST_DAMP; b.vy *= C.REST_DAMP; }
    if(Math.abs(b.w) < C.REST_SPIN) b.w *= C.REST_DAMP;
    if(sp > C.MAX_SPEED){ b.vx *= C.MAX_SPEED / sp; b.vy *= C.MAX_SPEED / sp; }
    b.w = Math.max(-C.MAX_SPIN, Math.min(C.MAX_SPIN, b.w));
    b.x += b.vx * dt; b.y += b.vy * dt; b.a += b.w * dt;
  });
  const free = b=>!b.held && !b.flow;
  for(let pass = 0; pass < 2; pass++){
    for(let i = 0; i < B.length; i++) for(let j = i + 1; j < B.length; j++){
      const a = B[i], b = B[j];
      let dx = b.x - a.x, dy = b.y - a.y;
      const min = a.r + b.r, d2 = dx * dx + dy * dy;
      if(d2 >= min * min) continue;
      const ia = free(a) ? 1 / a.m : 0, ib = free(b) ? 1 / b.m : 0;
      if(!ia && !ib) continue;
      let d = Math.sqrt(d2);
      if(d < 1e-6){ dx = 1; dy = 0; d = 1; }
      const nx = dx / d, ny = dy / d, over = min - d;
      // apart, in proportion to the inverse masses (a held body doesn't give)
      const push = over * .8 / (ia + ib);
      a.x -= nx * push * ia; a.y -= ny * push * ia; b.x += nx * push * ib; b.y += ny * push * ib;
      if(pass) continue;
      // the contact: points on each circle facing the other
      const iia = free(a) ? 1 / a.I : 0, iib = free(b) ? 1 / b.I : 0;
      const vax = a.vx - a.w * ny * a.r, vay = a.vy + a.w * nx * a.r;     // ω × (r n), at a's contact point
      const vbx = b.vx + b.w * ny * b.r, vby = b.vy - b.w * nx * b.r;     // ω × (−r n), at b's
      const rvx = vbx - vax, rvy = vby - vay, vn = rvx * nx + rvy * ny;
      if(vn >= 0) continue;
      const jn = -(1 + C.RESTITUTION) * vn / (ia + ib);
      a.vx -= jn * nx * ia; a.vy -= jn * ny * ia; b.vx += jn * nx * ib; b.vy += jn * ny * ib;
      // friction along the tangent turns an off-centre push into spin
      const tx = -ny, ty = nx, vt = rvx * tx + rvy * ty;
      const kt = ia + ib + a.r * a.r * iia + b.r * b.r * iib;
      let jt = -vt / kt;
      jt = Math.max(-C.FRICTION * jn, Math.min(C.FRICTION * jn, jt));
      a.vx -= jt * tx * ia; a.vy -= jt * ty * ia; b.vx += jt * tx * ib; b.vy += jt * ty * ib;
      a.w -= a.r * jt * iia; b.w -= b.r * jt * iib;
    }
    // the table's edges: every free body stays inside, bouncing off with RESTITUTION
    B.forEach(b=>{
      if(!free(b)) return;
      const h = rotHalf(b.bw, b.bh, bodyDeg(b));
      if(b.x < h.x){ b.x = h.x; if(b.vx < 0) b.vx = -b.vx * C.RESTITUTION; }
      if(b.x > world.W - h.x){ b.x = world.W - h.x; if(b.vx > 0) b.vx = -b.vx * C.RESTITUTION; }
      if(b.y < h.y){ b.y = h.y; if(b.vy < 0) b.vy = -b.vy * C.RESTITUTION; }
      if(b.y > world.H - h.y){ b.y = world.H - h.y; if(b.vy > 0) b.vy = -b.vy * C.RESTITUTION; }
    });
  }
  const busy = B.some(b=>b.held || b.flow || Math.hypot(b.vx, b.vy) > C.SLEEP_SPEED || Math.abs(b.w) > C.SLEEP_SPIN);
  world.still = busy ? 0 : world.still + dt * 1000;
  if(!busy) B.forEach(b=>{ if(Math.hypot(b.vx, b.vy) < C.SLEEP_SPEED) b.vx = b.vy = 0; if(Math.abs(b.w) < C.SLEEP_SPIN) b.w = 0; });
  world.asleep = world.still >= C.SLEEP_MS;
  return world.asleep;
}
/* everything slower than the sleep thresholds (what "settled" means; sleep itself comes SLEEP_MS later) */
const sortSettled = world=>world.bodies.every(b=>!b.held && !b.flow && Math.hypot(b.vx, b.vy) <= SORT_CONFIG.SLEEP_SPEED && Math.abs(b.w) <= SORT_CONFIG.SLEEP_SPIN);
