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
    /* the next meal, from the clock: the first rule that applies */
    headline:{
      milk:"Milk is all {name} needs right now.",
      empty:"The table's empty. Shall we set it?",
      now:"{meal} time.",
      soon:{one:"{meal} in {n} minute.", other:"{meal} in {n} minutes."},
      at:"{meal} at {time}.",
      cleared:"Plates cleared. Good day.",
      tomorrow:"{meal} tomorrow at {time}."
    },
    tomorrowLine:"{meal} tomorrow at {time}: {food}.",
    newFood:"{food} is new today. One curious taste is a win.",
    /* the tab itself answers "what's next" */
    title:{
      plain:"Chicho",
      now:"Chicho · {meal} time",
      soon:"Chicho · {meal} in {n} min",
      at:"Chicho · {meal} at {time}",
      tomorrow:"Chicho · {meal} tomorrow at {time}"
    },
    /* said once by the polite live region when the state changes, never every minute */
    announce:{now:"{meal} time", cleared:"All meals eaten"},
    mealWhen:"{meal} · {time}",
    next:"Next",
    nowLabel:"Now",
    notLogged:"Not logged",
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
      mealTimes:"Meal times",
      replay:"Replay welcome"
    }
  },

  peek:{
    meal:{allEaten:"All eaten", changeTime:"Change time", todayOnly:"Just for today", swap:"Swap", skip:"Skip", ateSome:"Ate some", refused:"Refused",
          swapped:"Swapped for {food}.", undo:"Undo", logOther:"Log something else"},
    day:{open:"Open day →", nothing:"Nothing planned for this day."},
    shop:{runsOut:"runs out {day}", inStock:"In stock", open:"Open list →"},
    variety:{tried:"Tried this week", next:"Try next", added:"{food} added to {meal}.", undo:"Undo"}
  },

  /* Onboarding: every step is a sentence you complete. {blank} marks where its field sits;
     the words before the first blank are that field's label for screen readers. */
  onb:{
    close:"Close",
    back:"Back",
    next:"Next",
    save:"Save",
    skip:"Skip",
    welcome:{
      title:"Every meal is a first.",
      line:"Tell us about them. We'll take care of the week.",
      cta:"Begin"
    },
    name:{sentence:"Their name is {blank}.", cta:"Next"},
    birthday:{
      sentence:"{name} arrived on {day} / {month} / {year}.",
      line:"We'll grow the menu with them.",
      cta:"Next",
      day:"Day", month:"Month", year:"Year",
      hint:{
        future:"That day hasn't come yet.",
        days:"{month} has {n} days.",
        year:"A year like {year}.",
        month:"A month, like {month}.",
        old:"We cook for the first three years, so we'll plan for a three-year-old."
      },
      milk:{one:"Milk is all {name} needs right now. We'll have the table ready in {n} month.",
            other:"Milk is all {name} needs right now. We'll have the table ready in {n} months."},
      remind:"Remind me",
      explore:"Look around anyway"
    },
    keepOut:{
      title:"Keep these off the plate.",
      line:"Tap to keep it out. We'll never suggest it.",
      out:"Keep out",
      loved:"Tried and loved",
      neutral:"No preference",
      add:"Add something else",
      alsoNot:"Also not {blank}",
      allergy:"Allergy",
      dislike:"Dislike",
      remove:"Remove {food}",
      locked:"Always off the plate at this age: {list}.",
      why:"Why?",
      note:"Not medical advice. Your pediatrician has the final word on allergens."
    },
    priorities:{title:"This week, we care most about…", line:"Pick up to three.", cta:"Next"},
    atHome:{title:"Already in the kitchen…", line:"Skip if you like. We'll plan around it.", cta:"Next", skip:"Skip"},
    mealTimes:{title:"{name} usually eats at…", line:"We'll tell you what's next.", cta:"Next", usual:"Use the usual", at:"{meal} at"},
    reveal:{title:"Setting the table…", skip:"Skip"},
    done:{title:"{name}'s week.", line:"Seven days, made just for {name}.", apply:"Love it", shuffle:"Shuffle", keep:"Keep my current week"},
    restful:{title:"All set for now.", line:"We'll have the first week ready around six months.", cta:"Done"}
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

  /* the eight things a week can lean on (ids match PRIORITIES); lean = how it reads in "We'll lean on …" */
  priorities:{
    iron:      {label:"More iron",          lean:"iron-rich meals"},
    colours:   {label:"Colorful plates",    lean:"a rainbow of veg"},
    quick:     {label:"Quick to cook",      lean:"20-minute recipes"},
    batch:     {label:"Cook once, freeze",  lean:"dishes that freeze well, cooked once and eaten twice"},
    finger:    {label:"Finger-food fun",    lean:"finger foods they can hold"},
    athome:    {label:"Use what's home",    lean:"what's already in your kitchen"},
    affordable:{label:"Easy on the budget", lean:"budget-friendly staples"},
    gentle:    {label:"Gentle new tastes",  lean:"familiar favourites, one new taste a day"}
  },
  priorityLine:{none:"We'll keep the week balanced and varied.", some:"We'll lean on {list}."},

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
