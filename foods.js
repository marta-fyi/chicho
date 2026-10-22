/* ---------- the food manifest: one entry per food, the only place art is defined ----------
   Every screen looks a food up here by id (or by a name, through its aliases).
   files: the processed drawings in img/food/ (ink on transparent, 960px master,
          exported at 64/192/384 WebP + a 384 PNG fallback), or null when the
          drawing doesn't exist yet: those render their emoji and get listed in
          the console so you know what to draw next.
   tint:  a soft pastel for the food (the drawings are black line art, so this
          is picked by hand, not sampled).
   group: protein · veg · fruit · grains · fats · dairy · other. This sorts the art;
          the generator's own food groups stay in FOOD_POOL.cats.
   scale: optical-size nudge; 1 = as drawn (the whole set shares one scale, so
          stroke weight stays even).
   hold:  a reason the drawing isn't used yet; it renders the emoji meanwhile. */
const FOODS = [
  // protein
  {id:"egg",            label:"Egg",             group:"protein", tint:"#FFF1C9", emoji:"🥚", files:null, aliases:["egg, well cooked","eggs"]},
  {id:"chicken",        label:"Chicken",         group:"protein", tint:"#FBE3CF", emoji:"🍗", files:null, aliases:[]},
  {id:"turkey",         label:"Turkey",          group:"protein", tint:"#F6DDD0", emoji:"🦃", files:true, aliases:[]},
  {id:"beef",           label:"Beef",            group:"protein", tint:"#F4D2CC", emoji:"🥩", files:null, aliases:[]},
  {id:"meatballs",      label:"Meatballs",       group:"protein", tint:"#EFD3C6", emoji:"🧆", files:null, aliases:["beef meatballs, soft","beef meatballs"]},
  {id:"salmon",         label:"Salmon",          group:"protein", tint:"#FFD9C7", emoji:"🐟", files:true, aliases:[]},
  {id:"white-fish",     label:"White fish",      group:"protein", tint:"#D9E8F2", emoji:"🐟", files:true, aliases:["fish","cod","hake"]},
  {id:"lentils",        label:"Lentils",         group:"protein", tint:"#F1DDC4", emoji:"🫘", files:null, aliases:["lentil"]},
  {id:"chickpeas",      label:"Chickpeas",       group:"protein", tint:"#F5E6C8", emoji:"🫘", files:null, aliases:["chickpea"]},
  {id:"tofu",           label:"Tofu",            group:"protein", tint:"#F6F1E4", emoji:"🍢", files:true, aliases:["tofu, soft"]},
  {id:"hummus",         label:"Hummus",          group:"protein", tint:"#F3E4C6", emoji:"🫘", files:true, aliases:[]},
  // dairy
  {id:"greek-yogurt",   label:"Greek yogurt",    group:"dairy",   tint:"#EEF1F6", emoji:"🥛", files:true, aliases:["yogurt","yoghurt"]},
  {id:"cottage-cheese", label:"Cottage cheese",  group:"dairy",   tint:"#F3F0E6", emoji:"🥛", files:true, aliases:[]},
  {id:"ricotta",        label:"Ricotta",         group:"dairy",   tint:"#F5F2EA", emoji:"🥛", files:null, aliases:[]},
  {id:"cheese",         label:"Cheese",          group:"dairy",   tint:"#FFEBB8", emoji:"🧀", files:null, aliases:["cheese, grated","grated cheese"]},
  {id:"milk",           label:"Milk",            group:"dairy",   tint:"#EEF1F6", emoji:"🍼", files:null, aliases:["breast milk","formula"]},
  // veg
  {id:"carrot",         label:"Carrots",         group:"veg",     tint:"#FFD8B8", emoji:"🥕", files:true, aliases:["carrots, soft-cooked","carrots"]},
  {id:"sweet-potato",   label:"Sweet potato",    group:"veg",     tint:"#FFD5BE", emoji:"🍠", files:true, aliases:[]},
  {id:"pumpkin",        label:"Pumpkin",         group:"veg",     tint:"#FFDDB0", emoji:"🎃", files:true, aliases:[]},
  {id:"butternut-squash",label:"Butternut squash",group:"veg",    tint:"#FFE2B5", emoji:"🎃", files:null, aliases:["squash"]},
  {id:"zucchini",       label:"Zucchini",        group:"veg",     tint:"#D8EBC8", emoji:"🥒", files:true, aliases:["courgette"]},
  {id:"green-beans",    label:"Green beans",     group:"veg",     tint:"#D3EBC5", emoji:"🫛", files:true, aliases:["green beans, soft"]},
  {id:"peas",           label:"Peas",            group:"veg",     tint:"#D6EDBF", emoji:"🫛", files:true, aliases:[]},
  {id:"cauliflower",    label:"Cauliflower",     group:"veg",     tint:"#F3EFE2", emoji:"🥦", files:true, aliases:["cauliflower, soft"]},
  {id:"potato",         label:"Potato",          group:"veg",     tint:"#F1E2C4", emoji:"🥔", files:true, aliases:["potatoes"]},
  {id:"spinach",        label:"Spinach",         group:"veg",     tint:"#CFE6C4", emoji:"🥬", files:true, aliases:["spinach, cooked"]},
  {id:"beetroot",       label:"Beetroot",        group:"veg",     tint:"#EBCFDD", emoji:"🟣", files:null, aliases:["beetroot, cooked","beet"]},
  {id:"cucumber",       label:"Cucumber",        group:"veg",     tint:"#D9EFD2", emoji:"🥒", files:null, aliases:["cucumber sticks"]},
  {id:"tomato",         label:"Tomato",          group:"veg",     tint:"#FFD3CB", emoji:"🍅", files:null, aliases:["tomato, peeled","tomatoes"]},
  // fruit
  {id:"banana",         label:"Banana",          group:"fruit",   tint:"#FFF0B8", emoji:"🍌", files:true, aliases:[]},
  {id:"pear",           label:"Pear",            group:"fruit",   tint:"#E6F0C4", emoji:"🍐", files:true, aliases:["pear, ripe"]},
  {id:"apple",          label:"Apple",           group:"fruit",   tint:"#FBD6D0", emoji:"🍎", files:null, aliases:["apple, cooked","apple purée"]},
  {id:"peach",          label:"Peach",           group:"fruit",   tint:"#FFDCC8", emoji:"🍑", files:true, aliases:["peach, ripe"]},
  {id:"plum",           label:"Plum",            group:"fruit",   tint:"#E5D4EC", emoji:"🟣", files:true, aliases:["plum, ripe"]},
  {id:"mango",          label:"Mango",           group:"fruit",   tint:"#FFE3A8", emoji:"🥭", files:true, aliases:[]},
  {id:"melon",          label:"Melon",           group:"fruit",   tint:"#E0F0C8", emoji:"🍈", files:true, aliases:[]},
  {id:"kiwi",           label:"Kiwi",            group:"fruit",   tint:"#DCEBBE", emoji:"🥝", files:null, aliases:[]},
  {id:"blueberries",    label:"Blueberries",     group:"fruit",   tint:"#D7DDF3", emoji:"🫐", files:true, aliases:["blueberries, halved"]},
  {id:"strawberries",   label:"Strawberries",    group:"fruit",   tint:"#FCD3D6", emoji:"🍓", files:true, aliases:["strawberries, sliced"]},
  {id:"raspberries",    label:"Raspberries",     group:"fruit",   tint:"#F9D0DA", emoji:"🍓", files:true, aliases:[],
   hold:"drawn as a bunch of grapes, which reads as whole grapes (a locked food)"},
  {id:"grapes",         label:"Grapes",          group:"fruit",   tint:"#E2D6EE", emoji:"🍇", files:null, aliases:["grapes, quartered"]},
  // grains
  {id:"oatmeal",        label:"Oatmeal",         group:"grains",  tint:"#F2E6CF", emoji:"🥣", files:true, aliases:["oats","porridge"]},
  {id:"baby-rice",      label:"Baby rice",       group:"grains",  tint:"#F4EEE2", emoji:"🥣", files:null, aliases:["baby rice cereal"]},
  {id:"toast",          label:"Toast",           group:"grains",  tint:"#F3DFC0", emoji:"🍞", files:true, aliases:["whole wheat toast","bread"]},
  {id:"pasta",          label:"Pasta",           group:"grains",  tint:"#F6E7C2", emoji:"🍝", files:true, aliases:["whole wheat pasta"]},
  {id:"rice",           label:"Rice",            group:"grains",  tint:"#F4F0E6", emoji:"🍚", files:true, aliases:["rice, soft-cooked"]},
  {id:"quinoa",         label:"Quinoa",          group:"grains",  tint:"#F1E7D2", emoji:"🍚", files:true, aliases:[]},
  {id:"couscous",       label:"Couscous",        group:"grains",  tint:"#F5E9C9", emoji:"🍚", files:true, aliases:[]},
  // fats
  {id:"avocado",        label:"Avocado",         group:"fats",    tint:"#DCEBC4", emoji:"🥑", files:true, aliases:[]},
  {id:"olive-oil",      label:"Olive oil",       group:"fats",    tint:"#ECEDC0", emoji:"🫒", files:null, aliases:["oil"]},
  {id:"chia",           label:"Chia seeds",      group:"fats",    tint:"#E9E4DC", emoji:"🌱", files:null, aliases:["chia seeds"]},
  {id:"peanut-butter",  label:"Peanut butter",   group:"fats",    tint:"#F1DAB8", emoji:"🥜", files:true, aliases:["smooth peanut butter"]},
  // other
  {id:"plate",          label:"A plate",         group:"other",   tint:"#F2F0EC", emoji:"🍽️", files:null, aliases:[]}
];

/* the welcome screen's crossfade, in order; foods without a drawing are skipped */
const HERO_FOODS = ["banana","carrot","mango","white-fish","egg","avocado","oatmeal"];

const FOOD_BY_ID = {};
const FOOD_BY_ALIAS = {};
FOODS.forEach(f=>{
  f.scale = f.scale || 1;
  f.files = f.files ? {
    w64:`img/food/${f.id}-64.webp`, w192:`img/food/${f.id}-192.webp`, w384:`img/food/${f.id}-384.webp`, png:`img/food/${f.id}-384.png`
  } : null;
  FOOD_BY_ID[f.id] = f;
  [f.id, f.label, ...f.aliases].forEach(a=>{ FOOD_BY_ALIAS[String(a).toLowerCase()] = f; });
});

/* a food by id, or by any of its names ("Carrots, soft-cooked", "carrots", "carrot") */
function foodOf(idOrName){
  if(!idOrName) return null;
  const k = String(idOrName).trim().toLowerCase();
  return FOOD_BY_ID[k] || FOOD_BY_ALIAS[k] || FOOD_BY_ALIAS[k.split(",")[0].trim()] || null;
}
function hasArt(f){ return !!(f && f.files && !f.hold); }

/* ids that rendered their emoji this session, reported once in a single warning */
const MISSING_ART = new Set();
let missingTimer = 0;
function noteMissing(id){
  if(MISSING_ART.has(id)) return;
  MISSING_ART.add(id);
  clearTimeout(missingTimer);
  missingTimer = setTimeout(()=>console.warn(`CHICHO: no illustration yet for ${MISSING_ART.size} food(s), showing emoji: ${[...MISSING_ART].join(", ")}`), 400);
}

/* a drawing that fails to load (offline before it was cached, a typo) becomes its emoji */
function artFailed(img){
  const pic = img.closest("picture"), f = foodOf(pic && pic.dataset.food);
  if(!pic || !f) return;
  const span = document.createElement("span");
  span.className = pic.className + " food-emoji";
  span.style.cssText = pic.style.cssText;
  span.setAttribute("aria-hidden", "true");
  span.textContent = f.emoji;
  pic.replaceWith(span);
  noteMissing(f.id);
}

const escAttr = s=>String(s).replace(/&/g,"&amp;").replace(/"/g,"&quot;").replace(/</g,"&lt;");

/* The art for a food, as an HTML string.
   size:  the CSS size it's shown at (px); picks the file (≤32 → 64, ≤96 → 192, else 192/384 for 1x/2x)
   alt:   the label (meaningful) or "" (decorating a visible label: also aria-hidden)
   lazy:  true below the fold
   cls:   extra classes on the wrapper
   Never a broken image: an unknown food or a missing drawing renders its emoji, or a plate. */
function foodArt(idOrName, opts){
  const o = opts || {}, size = o.size || 64;
  const f = foodOf(idOrName);
  const label = f ? f.label : String(idOrName || "");
  const alt = o.alt===undefined ? label : o.alt;
  const hide = alt==="" ? ` aria-hidden="true"` : "";
  const cls = "food-art" + (o.cls ? " "+o.cls : "");
  const style = `--art:${size}px;--tint:${f ? f.tint : "#F2F0EC"};--scale:${f ? f.scale : 1}`;
  if(!hasArt(f)){
    noteMissing(f ? f.id : "?"+label);
    const emoji = f ? f.emoji : "🍽️";
    return `<span class="${cls} food-emoji" style="${style}"${alt==="" ? hide : ` role="img" aria-label="${escAttr(alt)}"`}>${emoji}</span>`;
  }
  const F = f.files;
  const srcset = size<=32 ? `${F.w64} 1x, ${F.w192} 2x` : size<=96 ? `${F.w192} 1x, ${F.w384} 2x` : `${F.w192} 1x, ${F.w384} 2x`;
  return `<picture class="${cls}" style="${style}" data-food="${f.id}"${hide}><source type="image/webp" srcset="${srcset}">` +
    `<img src="${F.png}" width="${size}" height="${size}" alt="${escAttr(alt)}" decoding="async"${o.lazy ? ` loading="lazy"` : ""}` +
    ` onerror="artFailed(this)"></picture>`;
}
