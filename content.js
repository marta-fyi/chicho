/* ---------- every word CHICHO says, in one place ----------
   Edit freely. Rules of the voice: short, sensory, second person, warm.
   Headlines ≤ 7 words, support lines ≤ 12. No percentages, counters or guilt.
   Never in a headline: little one, lovely, gentle questions, get started,
   plan, track, manage, optimize. (tests/content.html checks all of this.)

   A list = variants: one is picked per day (the same all day, so nothing
   flickers). {name}, {n}, {food}… are filled in by say().
   {one, other} = singular and plural, chosen by {n}. */
const CONTENT = {
  /* ---------- home: a lock screen. One question: what does {name} eat next? ---------- */
  home:{
    who:"{name} · {months}",
    /* the next meal, from the clock: the first rule that applies */
    headline:{
      milk:"Milk is all {name} needs right now.",
      empty:"The table's empty.",
      now:"{meal} time.",
      soon:{one:"{meal} in {n} minute.", other:"{meal} in {n} minutes."},
      at:"{meal} around {time}.",
      done:"That's today done.",
      tomorrow:"{meal} tomorrow around {time}."
    },
    /* the tab itself answers "what's next" */
    title:{
      plain:"Chicho",
      now:"{meal} time · Chicho",
      soon:"{meal} in {n} min · Chicho",
      at:"{meal} around {time} · Chicho",
      tomorrow:"{meal} tomorrow around {time} · Chicho"
    },
    /* said once by the polite live region when the state changes, never every minute */
    announce:{now:"{meal} time", offered:"{meal} offered", unoffered:"{meal} not offered", copied:"List copied", done:"That's today done"},
    around:"around {time}",
    rowWhen:"{meal} · around {time}",
    tomorrowWhen:"{meal} tomorrow · around {time}",
    prepped:"{food} · prepped",
    upNext:"Up next",
    tomorrow:"Tomorrow",
    earlier:"Earlier today",
    also:"While you're at it",
    more:"More: this week and shopping",
    week:"This week",
    shop:{one:"{n} thing for the next 3 days", other:"{n} things for the next 3 days", none:"Nothing to pick up for the next 3 days."},
    variety:{label:"Variety", some:"A rainbow in progress", all:"A full rainbow.", legend:"Filled: offered this week."},
    groups:{protein:"Protein", vegetable:"Veg", fruit:"Fruit", grain:"Grains", fat:"Fats"},
    send:"Send",
    profile:"Profile"
  },

  /* ---------- a meal, opened in place ---------- */
  meal:{
    meta:"{n} min · {texture}",
    newToday:"New today: {food}",
    amount:"{amount} · {texture}",
    change:"Change",
    changeTo:"Change {food}",
    changed:"Changed to {food}.",
    noChange:"Nothing else safe to swap in here.",
    why:"Why: {why}",
    offer:"Mark as offered",
    offered:"Offered",
    undo:"Undo",
    outcome:{loved:"Loved it", some:"Ate some", nottoday:"Not today"},
    outcomeLabel:"How it went",
    addOther:"Add something else",
    alsoOffered:"Also offered: {blank}",
    added:"{food} added.",
    send:"Send",
    ringOn:"{meal}: offered",
    ringOff:"Mark {meal} as offered",
    foodMore:"{food}: more",
    open:"{meal}, around {time}: {foods}"
  },

  /* ---------- the moment line: one line at a time, never two ---------- */
  moment:{
    milk:{one:"Solids start in {n} month.", other:"Solids start in {n} months."},
    stage:"{name} is {months}. Textures are changing.",
    stageUpdate:"Update the week",
    later:"Later",
    allergen:"{allergen}, for the first time. A small taste, then keep an eye on how {name} feels.",
    allergenAction:"What to watch for",
    noPlan:"Set the week for {name}.",
    noPlanAction:"Set the week",
    weekDone:"Week done. Ready for the next?",
    weekNext:"Set next week",
    shop:{one:"{n} thing for the next 3 days.", other:"{n} things for the next 3 days."},
    shopAction:"Send the list",
    tomorrow:"Tomorrow: {food1} and {food2}.",
    tomorrowOne:"Tomorrow: {food1}.",
    sendTo:"Send to {person}",
    sendTomorrow:"Send tomorrow",
    quiet:"{meal} tomorrow: {food1} and {food2}.",
    quietOne:"{meal} tomorrow: {food1}.",
    ask:{
      mealTimes:"What time does lunch usually happen?",
      priorities:"Anything to lean on this week, like iron or quick meals?",
      kitchen:"Anything already in the kitchen we should use up?",
      people:"Anyone else looking after {name}?"
    },
    set:"Set"
  },

  /* ---------- "While you're at it": cooking ahead, using only foods already in the week ---------- */
  also:{
    defrost:"Move the {food} to the fridge tonight. It's in {meal} {when}.",
    soak:"Soak the {food} tonight. It's in {meal} {when}.",
    double:"{verb} double. It's in {meal} {when} (another {amount}).",
    verb:{steam:"Steam", roast:"Roast", boil:"Cook"},
    oven:"The oven's on. Roast the {food} for {meal} {when} too.",
    steamer:"The steamer's on. Add the {food} for {meal} {when}.",
    freeze:"Make double {food} and freeze half in small portions.",
    salt:"Cooking for the family? Set aside {name}'s portion before adding salt.",
    doIt:"I'll do it",
    done:"Done",
    when:{today:"later today", tomorrow:"tomorrow", later:"on {weekday}"}
  },
  /* storage, for batch-and-freeze (check against a food-safety source: docs/decisions.md) */
  storage:"Fridge 2 days · freezer 1 month · reheat once, piping hot, then let it cool",

  /* ---------- the cooking layer: a one-line how per method ---------- */
  cook:{
    how:{
      steam:"Steam the {food} for {min} minutes, until it squashes between finger and thumb.",
      roast:"Roast the {food} at 200°C for {min} minutes, until soft right through.",
      boil:"Simmer the {food} for {min} minutes, until very soft.",
      toast:"Toast the bread lightly and cut it into fingers.",
      raw:"Wash the {food}, then serve it as {texture}.",
      none:"Stir in the {food} just before serving."
    },
    serve:"Serve it all as {texture}.",
    tips:[
      "Soft enough to squash between finger and thumb is soft enough for {name}.",
      "Put a little {food} on your plate too. They copy what you eat.",
      "Serve the {food} next to something {name} already knows.",
      "Cut the {food} into finger-length strips {name} can hold.",
      "A warm plate tastes friendlier than a cold one. Not hot, just warm.",
      "Let {name} touch the {food} first. Touching counts."
    ]
  },

  /* ---------- sheets: the only overlays ---------- */
  sheet:{close:"Close", back:"Back"},
  day:{title:"{weekday} {date}", nothing:"Nothing planned for this day.", change:"Change"},
  shopSheet:{
    title:"Shop", runsOut:"runs out {weekday}", forDay:"for {weekday}", today:"today", tomorrow:"tomorrow", inStock:"In stock",
    bought:"Bought {food}", notBought:"{food}: not bought", send:"Send the list", alsoGet:"Also pick up {blank}", none:"Nothing to pick up."
  },
  allergenNote:{
    title:"Watching a first taste",
    note:"Not medical advice. Check allergen introduction with your pediatrician, and contact them or emergency services if you see signs of a reaction.",
    notYet:"Not yet", introduced:"Introduced on {date}", noReaction:"Introduced, no reaction noted on {date}", markNoReaction:"No reaction noted"
  },
  profileSheet:{
    title:"Profile", birthday:"Birthday and profile", offPlate:"Off the plate", priorities:"Priorities",
    mealTimes:"Meal times", people:"People", replay:"Replay welcome"
  },
  people:{
    title:"People",
    self:"Notes to self go to {blank}.",
    selfHint:"Optional. It stays on this device.",
    add:"Also looking after {name}: {blank}.",
    phone:"Their number: {blank}",
    phoneHint:"Include the country code.",
    stays:"Numbers stay on this device.",
    save:"Save",
    remove:"Remove {person}",
    placeholderRole:""
  },

  /* ---------- sharing: text first, nothing sent without you ---------- */
  send:{
    title:"Send",
    groceries:"Groceries to myself",
    tomorrowTo:"Tomorrow to {person}",
    todayTo:"Today to {person}",
    tomorrowAny:"Tomorrow, to someone",
    weekLink:"This week, as a link",
    copy:"Copy as text",
    more:"More…",
    explain:"Opens Messages with everything filled in. You press send.",
    copied:"Copied",
    linkWarn:"This link includes {name}'s allergies and menu. Anyone who has it can read them, and it can't be taken back.",
    linkOk:"Make the link",
    linkShort:"The week didn't fit in one link, so it covers today and tomorrow.",
    selfAsk:"Notes to self go to {blank}.",
    selfSkip:"Skip"
  },
  share:{
    groceries:{head:"{name}'s groceries · {date}", updated:"Updated {time}", item:"☐ {item}", by:" · by {weekday}"},
    day:{head:"{name} · {weekday} {date}", updated:"Updated {time}", allergies:"Allergies: {list}. Not yet: {locked}.", none:"none",
         meal:"{time} {meal}: {foods}", food:"{food} {amount} ({texture})", foodPlain:"{food} {amount}", newToday:"New today: {food}.", full:"Full day: {link}"},
    week:{head:"{name}'s week", updated:"Updated {date} {time}", day:"{weekday}: {meals}", meal:"{meal} {foods}", full:"Full week: {link}"}
  },

  /* ---------- the caretaker's read-only view ---------- */
  snap:{
    avoid:"Please avoid: {list}.",
    avoidNone:"No allergies noted.",
    notYet:"Not yet: {list}.",
    who:"{name} · {months}",
    updated:"Updated {when}. This is a snapshot; ask for the latest if plans change.",
    broken:"This link looks incomplete. Ask for it to be sent again.",
    title:"{name}'s meals · Chicho"
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
    batch:     {label:"Cook once, freeze",  lean:"dishes that freeze well, cooked once and served twice"},
    finger:    {label:"Finger-food fun",    lean:"finger foods they can hold"},
    athome:    {label:"Use what's home",    lean:"what's already in your kitchen"},
    affordable:{label:"Easy on the budget", lean:"budget-friendly staples"},
    gentle:    {label:"Gentle new tastes",  lean:"familiar favourites, one new taste a day"}
  },
  priorityLine:{none:"We'll keep the week balanced and varied.", some:"We'll lean on {list}."},

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
