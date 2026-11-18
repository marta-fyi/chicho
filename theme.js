/* ---------- the glow: one colour per food group, and the gradient made from it ----------
   The light theme's poster is paper grey with one soft glow behind the headline: a
   slightly deeper nucleus of the same colour that blends into the colour of the open meal's main food group, then
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
/* the nucleus: no grey, just the glow's own colour a touch deeper. Deepened in OKLab (lightness down by GLOW_SHADE.dl,
   chroma × GLOW_SHADE.chroma, hue kept), because scaling RGB evenly turns warm colours brown, and brown reads as grey */
const GLOW_SHADE = {dl:.05, chroma:1.12};
const GLOW_PROFILE = {
  core:.05,      // the nucleus holds its deeper shade out to 5% of the radius…
  blend:.32,     // …and has become the full colour by 32%
  fadeFrom:.40,  // the colour holds, then starts to fade here…
  fadeTo:1,      // …and is gone by the edge
  ease:1.1       // the fade's curve (1 = smoothstep)
};
const hexRGB = h=>[1, 3, 5].map(i=>parseInt(h.slice(i, i + 2), 16));
const smooth = (a, b, t)=>{ const x = Math.min(1, Math.max(0, (t - a) / (b - a))); return x * x * (3 - 2 * x); };
/* the Kitchen's glow scrolls with its content behind the title: its nucleus holds to 9% of the radius, and the
   whole layer shows at 70% */
const KITCHEN_GLOW = {core:.09, opacity:.7};
/* the glow's colour, a touch deeper: the nucleus (sRGB → OKLab → sRGB, clamped to the gamut) */
function glowCore(hex, shade = GLOW_SHADE){
  const lin = v=>{ v /= 255; return v <= .04045 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); };
  const enc = v=>Math.round(255 * Math.min(1, Math.max(0, v <= .0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - .055)));
  const [r, g, b] = hexRGB(hex).map(lin);
  const l = Math.cbrt(.4122214708 * r + .5363325363 * g + .0514459929 * b), m = Math.cbrt(.2119034982 * r + .6806995451 * g + .1073969566 * b), s = Math.cbrt(.0883024619 * r + .2817188376 * g + .6299787005 * b);
  const L = .2104542553 * l + .7936177850 * m - .0040720468 * s - shade.dl, A = (1.9779984951 * l - 2.4285922050 * m + .4505937099 * s) * shade.chroma, B = (.0259040371 * l + .7827717662 * m - .8086757660 * s) * shade.chroma;
  const l2 = (L + .3963377774 * A + .2158037573 * B) ** 3, m2 = (L - .1055613458 * A - .0638541728 * B) ** 3, s2 = (L - .0894841775 * A - 1.2914855480 * B) ** 3;
  return [4.0767416621 * l2 - 3.3077115913 * m2 + .2309699292 * s2, -1.2684380046 * l2 + 2.6097574011 * m2 - .3413193965 * s2, -.0041960771 * l2 - .7034186147 * m2 + 1.7076147010 * s2].map(enc);
}
/* the glow at t (0 = centre, 1 = edge): [r, g, b, alpha]. prof overrides the nucleus's reach ({core}) */
function glowAt(t, hex, prof){
  hex = hex || GLOW[GLOW_DEFAULT].hex;
  const P = Object.assign({}, GLOW_PROFILE, prof && prof.core ? {core:prof.core} : {}), c = glowCore(hex), g = hexRGB(hex);
  const k = 1 - smooth(P.core, P.blend, t);                       // share of the deeper shade
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
