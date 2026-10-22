/* ---------- every word CHICHO says, in one place ----------
   Edit freely. Rules of the voice: short, sensory, second person, warm.
   Headlines ≤ 7 words, support lines ≤ 12. No percentages, counters or guilt.
   Never in a headline: little one, lovely, gentle questions, get started,
   plan, track, manage, optimize. (tests/content.html checks all of this.)

   A list = variants: one is picked per day (the same all day, so nothing
   flickers). {name}, {n}, {food}… are filled in by say().
   {one, other} = singular and plural, chosen by {n}. */
const CONTENT = {
  home:{
    greet:{
      morning:"Good morning, {name}",
      afternoon:"Good afternoon, {name}",
      evening:"Good evening, {name}"
    },
    age:" · {months}",
    headline:{
      newFood:"Today, {name} meets {food}.",
      pair:"A day of {food1} and {food2}.",
      cleared:"Plates cleared. Good day.",
      evening:"Tomorrow: {food}.",
      empty:"The table's empty. Shall we set it?",
      milk:"Milk is all {name} needs right now."
    },
    emptyAction:"Set the week",
    milkLine:{one:"Solids start in {n} month.", other:"Solids start in {n} months."},
    support:[
      "A curious taste is a good start.",
      "Messy is how they learn.",
      "Refusing a new food is normal. Offer it again another day.",
      "Soft, warm and a little bit of everything.",
      "Let them touch it. Touching counts."
    ],
    sections:{today:"Today", week:"This week", shop:"Shop", variety:"Variety"},
    open:"Open →",
    shop:{one:"{n} thing to pick up", other:"{n} things to pick up", none:"All stocked up."},
    variety:{some:"A rainbow in progress", all:"A full rainbow."},
    varietyLegend:"Filled: tried this week. Open: still to come.",
    groups:{protein:"Protein", vegetable:"Veg", fruit:"Fruit", grain:"Grains", fat:"Fats"},
    stageChange:"{name} is {months}. Textures are changing. Update the week?",
    stageUpdate:"Update",
    stageLater:"Later",
    weekDone:"Week done. Ready for the next?",
    weekNext:"Set next week",
    profile:{
      label:"Profile",
      profile:"Profile and birthday",
      allergens:"Allergens and priorities",
      nextWeek:"Set next week",
      replay:"Replay welcome"
    }
  },

  peek:{
    meal:{allEaten:"All eaten", swap:"Swap", skip:"Skip", ateSome:"Ate some", refused:"Refused",
          swapped:"Swapped for {food}.", undo:"Undo", logOther:"Log something else"},
    day:{open:"Open day →", nothing:"Nothing planned for this day."},
    shop:{runsOut:"runs out {day}", inStock:"In stock", open:"Open list →"},
    variety:{tried:"Tried this week", next:"Try next", added:"{food} added to {meal}.", undo:"Undo"}
  },

  onb:{
    close:"Close",
    back:"Back",
    welcome:{
      title:"Every meal is a first.",
      line:"Tell us about them. We'll take care of the week.",
      cta:"Begin"
    },
    name:{title:"Who are we cooking for?", placeholder:"Their name", cta:"Next"},
    birthday:{
      title:"When did they arrive?",
      line:"We'll grow the menu with them.",
      cta:"Next",
      day:"Day", month:"Month", year:"Year",
      milk:{one:"Milk is all {name} needs right now. We'll have the table ready in {n} month.",
            other:"Milk is all {name} needs right now. We'll have the table ready in {n} months."},
      remind:"Remind me",
      explore:"Look around anyway"
    },
    keepOut:{
      title:"What stays off the plate?",
      line:"Tap to keep it out. We'll never suggest it.",
      out:"Keep out",
      loved:"Tried and loved",
      add:"Add something else",
      allergy:"Allergy",
      dislike:"Dislike",
      remove:"Remove",
      locked:"Always off the plate at this age: {list}.",
      note:"Not medical advice. Your pediatrician has the final word on allergens."
    },
    priorities:{title:"What would make this week great?", line:"Pick up to three.", cta:"Next"},
    atHome:{title:"What's already in your kitchen?", line:"Skip if you like. We'll plan around it.", cta:"Next", skip:"Skip"},
    reveal:{title:"Setting the table…"},
    done:{title:"{name}'s week.", line:"Seven days, made just for {name}.", apply:"Love it", shuffle:"Shuffle"}
  },

  /* Every word about a stage. name = the big tagline under the birthday fields;
     meals + textureShort make the small line beneath it ("3 meals · lumpy mash & finger foods");
     locked = the "always off the plate" line (the rules themselves live in LOCKED_RULES). */
  stages:{
    milk:{
      name:"Milk only", meals:"Milk only, for now"
    },
    first:{
      name:"First tastes",
      meals:"1–2 small meals + milk", textureShort:"purées and soft finger foods",
      portionHint:"a few spoonfuls of each; follow their appetite",
      note:"Milk is still their main food; solids are for tasting.",
      avoid:["Honey","Cow's milk as a drink","Whole nuts","Added salt or sugar"],
      locked:"honey, whole nuts, whole grapes, added salt and sugar"
    },
    textures:{
      name:"Fingers first",
      meals:"3 meals", textureShort:"lumpy mash & finger foods",
      portionHint:"2–4 tablespoons of each food",
      note:"Milk alongside meals, as they eat more.",
      avoid:["Honey","Cow's milk as a drink","Whole nuts","Added salt or sugar"],
      locked:"honey, whole nuts, whole grapes, added salt and sugar"
    },
    family:{
      name:"A seat at the family table",
      meals:"3 meals + 2 snacks", textureShort:"soft pieces",
      portionHint:"about a quarter of an adult portion",
      note:"Whole cow's milk can be their main drink now.",
      avoid:["Whole nuts","Whole grapes","Added salt or sugar"],
      locked:"whole nuts, whole grapes, added salt and sugar"
    },
    nearfamily:{
      name:"Big opinions, small plates",
      meals:"3 meals + 2 snacks", textureShort:"bite-size family food",
      portionHint:"a third to half an adult portion; let them serve themselves",
      note:"Picky-eating friendly: a few familiar staples repeat through the week, so every plate has something they know.",
      avoid:["Whole nuts","Whole grapes","Hard sweets"],
      locked:"whole nuts, whole grapes, added salt and sugar"
    }
  },

  priorities:{
    iron:"More iron", color:"Colorful plates", quick:"Quick to cook", freeze:"Cook once, freeze",
    finger:"Finger-food fun", home:"Use what's home", budget:"Easy on the budget", gentle:"Gentle new tastes"
  },

  /* ---- legacy: still read by today's screens; each goes when its screen is rebuilt (steps 5-7) ---- */
  greet:{
    morning:["Good morning"],
    afternoon:["Good afternoon"],
    evening:["Good evening"]
  },
  dayDone:["Plates cleared. Good day."],
  weekDone:["Week done. Ready for the next?"],
  firstLaunch:["Here's today. Tap a meal to see what's in it."],
  rainbow:{none:"A rainbow in progress", some:"A rainbow in progress", all:"A full rainbow."},
  shopDone:["All stocked up."],
  shopCelebrate:["All stocked up."],
  empty:"The table's empty. Shall we set it?",
  emptyDay:"Nothing planned for this day.",
  pastWeeks:"Past weeks will gather here.",
  tips:[
    "A curious taste is a good start.",
    "Messy is how they learn.",
    "Refusing a new food is normal. Offer it again another day.",
    "Soft, warm and a little bit of everything.",
    "Let them touch it. Touching counts."
  ]
};

/* one of a list, the same all day for the same key */
function pick(list, key){
  if(!Array.isArray(list)) return list;
  const seed = todayISO() + "|" + (key || "");
  let h = 2166136261;
  for(let k=0; k<seed.length; k++){ h ^= seed.charCodeAt(k); h = Math.imul(h, 16777619) >>> 0; }
  return list[h % list.length];
}

/* say("home.headline.newFood", {name:"Lula", food:"mango"}) → "Today, Lula meets mango."
   Lists pick a daily variant; {one, other} pick by vars.n; {months} reads "1 month" / "8 months". */
function say(path, vars, key){
  const v = Object.assign({}, vars);
  if(typeof v.months==="number") v.months = v.months===1 ? "1 month" : v.months + " months";
  let s = path.split(".").reduce((o,k)=>o==null ? o : o[k], CONTENT);
  if(s==null){ console.warn("CHICHO: no copy for", path); return ""; }
  if(Array.isArray(s)) s = pick(s, key || path);
  if(typeof s==="object") s = v.n===0 && s.none!==undefined ? s.none : v.n===1 ? s.one : s.other;
  return String(s).replace(/\{(\w+)\}/g, (m,k)=>v[k]!==undefined && v[k]!==null ? v[k] : m);
}
