/* ---------- the glow: one colour per food group, and the gradient made from it ----------
   The light theme's poster is paper grey with one soft glow behind the headline: a
   grey nucleus that blends into the colour of the open meal's main food group, then
   fades to nothing by its edge. Grains (the reference poster's yellow) is the default:
   no plan, under 6 months, or anything unexpected.

   The colours: the brief's five, tuned against the reference for a similar lightness
   and saturation to the yellow (OKLCH L ≈ 0.85, as much chroma as sRGB allows), and
   Protein turned toward peach so it can't be mistaken for Fruit. Brief values:
   Veg #AACF53, Fruit #F596AA, Protein #F5B1AA, Fats and dairy #A0D8EF.

   The stops are generated here as rgba() from the hex (no color-mix dependency), so
   the tests can compute exactly what colour sits behind any point of the glow. The group's
   name (the poster's caption) is copy, so it lives in content.js (home.groups). */
const GLOW = {
  grain:     {hex:"#FFE56B"},
  vegetable: {hex:"#BBDD72"},
  fruit:     {hex:"#FEB7C5"},
  protein:   {hex:"#FEBC9F"},
  fat:       {hex:"#83DCFE"}
};
const GLOW_DEFAULT = "grain";
const GLOW_CORE = "#83838A";   // the grey nucleus: ink on it measures 5.0:1
const GLOW_PROFILE = {
  core:.05,      // the nucleus holds its grey out to 5% of the radius…
  blend:.32,     // …and has become the full colour by 32%
  fadeFrom:.40,  // the colour holds, then starts to fade here…
  fadeTo:1,      // …and is gone by the edge
  ease:1.1       // the fade's curve (1 = smoothstep)
};
const hexRGB = h=>[1, 3, 5].map(i=>parseInt(h.slice(i, i + 2), 16));
const smooth = (a, b, t)=>{ const x = Math.min(1, Math.max(0, (t - a) / (b - a))); return x * x * (3 - 2 * x); };
/* the Kitchen's glow scrolls with its content behind the title: its nucleus holds to 9% of the radius and is
   lighter, so the ink on it stays well clear of 4.5:1, and the whole layer shows at 70% */
const KITCHEN_GLOW = {core:.09, coreHex:"#A6A6AC", opacity:.7};
/* the glow at t (0 = centre, 1 = edge): [r, g, b, alpha]. prof overrides the nucleus ({core, coreHex}) */
function glowAt(t, hex, prof){
  const P = Object.assign({}, GLOW_PROFILE, prof && prof.core ? {core:prof.core} : {}), c = hexRGB((prof && prof.coreHex) || GLOW_CORE), g = hexRGB(hex || GLOW[GLOW_DEFAULT].hex);
  const k = 1 - smooth(P.core, P.blend, t);                       // share of the grey
  const a = Math.pow(1 - smooth(P.fadeFrom, P.fadeTo, t), P.ease);  // opacity
  return [0, 1, 2].map(i=>Math.round(c[i] * k + g[i] * (1 - k))).concat(+a.toFixed(3));
}
/* the CSS: a circle that fills the square element (closest-side = the radius), 25 stops */
function glowGradient(hex, prof){
  const stops = [];
  for(let i = 0; i <= 24; i++){ const t = i / 24, [r, g, b, a] = glowAt(t, hex, prof); stops.push(`rgba(${r},${g},${b},${a}) ${(t * 100).toFixed(1)}%`); }
  return `radial-gradient(circle closest-side, ${stops.join(", ")})`;
}
/* the open meal's food group → its glow (anything unknown is the default) */
function glowGroup(cat){ return GLOW[cat] ? cat : GLOW_DEFAULT; }
/* the sun (meal times, light theme only): the glow takes the colour of the hour of the meal in hand, blended
   between these stops, all near the food groups' lightness so the ink keeps its contrast. Untouched, it's 10:00. */
const SUN = [[6 * 60, "#FEBC9F"], [10 * 60, "#FFE56B"], [14 * 60, "#FFD86B"], [17 * 60, "#FEBC8A"], [19 * 60, "#FEB7C5"], [21 * 60, "#D2C3FE"]];
const SUN_IDLE = 10 * 60;
function sunColor(min){
  const k = SUN.findIndex(s=>s[0] >= min);
  if(k < 0) return SUN[SUN.length - 1][1];
  if(k===0) return SUN[0][1];
  const [m0, h0] = SUN[k - 1], [m1, h1] = SUN[k], t = (min - m0) / (m1 - m0), a = hexRGB(h0), b = hexRGB(h1);
  return "#" + a.map((v, i)=>Math.round(v + (b[i] - v) * t).toString(16).padStart(2, "0")).join("").toUpperCase();
}
