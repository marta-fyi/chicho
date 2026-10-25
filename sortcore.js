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
