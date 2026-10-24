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
    rowWhen:"{meal} · around {time}",
    mealTitle:"{meal} · around {time}",
    mealTitleTomorrow:"{meal} tomorrow · around {time}",
    andMore:{one:"and {n} more", other:"and {n} more"},
    more:"More",
    also:"While you're at it",
    next:"Next: {meal} around {time}.",
    nextTomorrow:"Tomorrow: {meal} around {time}.",
    groups:{protein:"Protein", vegetable:"Veg", fruit:"Fruit", grain:"Grains", fat:"Fats and dairy"}
  },

  /* ---------- the five screens (their names are also the map's links) ---------- */
  screens:{home:"Home", shuffle:"Shuffle", kitchen:"Kitchen", week:"New week", profile:"Profile"},
  days:{today:"today", tomorrow:"tomorrow", Today:"Today", Tomorrow:"Tomorrow",
        poss:{today:"today's", tomorrow:"tomorrow's"}, possDay:"{weekday}'s"},

  /* ---------- a meal ---------- */
  meal:{
    change:"Change",
    another:"Another", keep:"Keep",
    changeTo:"Change {food}",
    changed:"Changed to {food}.",
    offer:"Mark as offered",
    offered:"Offered",
    undo:"Undo",
    outcome:{loved:"Loved it", some:"Ate some", not_today:"Not today"},
    outcomeLabel:"How it went",
    addHow:"Add how it went"
  },

  /* ---------- the moment line: one line at a time, never two ---------- */
  moment:{
    milk:{one:"Solids start in {n} month.", other:"Solids start in {n} months."},
    stage:"{name} is {months}.",
    stageUpdate:"Update the week?",
    later:"Later",
    install:"Add Chicho to your Home Screen to open it like an app. Tap Share, then Add to Home Screen.",
    allergen:"{allergen}, for the first time. A small taste, then keep an eye on how {name} feels.",
    allergenAction:"What to watch for",
    noPlan:"Set the week for {name}.",
    noPlanAction:"Set the week",
    weekDone:"Week done.",
    weekNext:"Ready for the next?",
    shop:{one:"{n} thing to pick up.", other:"{n} things to pick up."},
    shopNew:{one:"{n} new thing to pick up.", other:"{n} new things to pick up."},
    missing:"Out of {food}.",
    missingAction:"Shuffle {meal}?",
    /* one-time hints, each the first time a screen is useful; never a tour */
    hint:{shuffle:"Swipe left to shuffle {meal}.", kitchen:"Swipe up for the kitchen.", profile:"Swipe down to see how {name} is doing."},
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

  /* ---------- "While you're at it": lead times and the family's salt (cooking ahead is the Kitchen's: kitchen.*) ---------- */
  also:{
    defrost:"Move the {food} to the fridge tonight. It's in {meal} {when}.",
    soak:"Soak the {food} tonight. It's in {meal} {when}.",
    salt:"Cooking for the family? Set aside {name}'s portion before adding salt.",
    doIt:"I'll do it",
    done:"Done",
    when:{today:"later today", tomorrow:"tomorrow", later:"on {weekday}"}
  },

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

  /* ---------- Shuffle: change the menu ---------- */
  shuffle:{
    meal:"Shuffle this meal", none:"No other option fits right now.", didMeal:"{meal} shuffled.", undone:"Back as it was.",
    instead:"Instead: {food}", nothing:"Nothing planned yet.", sendTomorrow:"Send tomorrow",
    offered:"Offered. It stays as it is.", how:"How", low:"Running low", notHome:"Not at home",
    missing:"What's missing is on the list in the"
  },
  /* ---------- Kitchen: stock, shopping, prep ---------- */
  kitchen:{
    views:{buy:"Buy", home:"At home", prep:"Prep"}, storeOff:"In the store: Off", storeOn:"In the store: On",
    low:"Low", other:"Everything else", send:"Send the list",
    nothingToBuy:"Nothing to pick up for the next 3 days.",
    state:{plenty:"Plenty", low:"Low", out:"Out"},
    add:"Add something", addSentence:"Add to the kitchen: {blank}.", addToList:"Add to list", onList:"On the list", remove:"Remove",
    groupLow:"{n} · {m} low",
    /* Prep */
    cookAhead:"Cook ahead", inFreezer:"In the freezer", showMore:"Show more", nothingToCook:"Nothing to cook ahead.",
    freezerEmpty:"Nothing in the freezer yet.",
    session:"{method} with {meal}", method:{steam:"Steam", roast:"Roast", boil:"Boil", bake:"Bake", simmer:"Simmer"},
    meal:{tonight:"tonight's {meal}", today:"today's {meal}", tomorrow:"tomorrow's {meal}", day:"{weekday}'s {meal}"},
    extra:"{food} +{g} g", sessionDetail:"{items}. Covers {meals}.", prepped:"{food} · prepped",
    usedOne:"Used one", usedLast:"Used the last {food} · Undo", addFrozen:"Add a frozen portion", frozenSentence:"Frozen: {blank}.",
    portionsLabel:"Portions", portionsMeta:{one:"{n} portion · made {date}", other:"{n} portions · made {date}"}, useSoon:"use soon",
    freezeSome:"Freeze some {food}", freezeWhy:"It's in {meal} on {weekday}, beyond the fridge window.", frozeUndo:"{food} · in the freezer · Undo",
    /* shopping units (the labels themselves are the food manifest's: foods.js) */
    unit:"{n} {label}", weight:"{g} g", rowMeta:"{unit} · {when}",
    when:{tonight:"tonight", today:"today", tomorrow:"tomorrow"},
    got:"Got it", show:"Show", hide:"Hide", haveIt:"Have it", notThisWeek:"Not this week", gotUndo:"{food} · got it · Undo",
    haveItHint:"Already have some of these? Tap a row, then Have it.",
    /* storage, built from the numbers in KITCHEN (kitchen.js; check against a food-safety source: docs/decisions.md) */
    storage:"Fridge {fridge} · freezer {freezer} · reheat once, piping hot, then let it cool.",
    span:{days:{one:"{n} day", other:"{n} days"}, months:{one:"{n} month", other:"{n} months"}}
  },
  /* ---------- New week: start the next one ---------- */
  newWeek:{
    starts:"Next week starts {blank}.", cook:"We'll cook on {blank} days.", into:"This week, we're most into…", newFoods:"Try {blank} new foods.",
    cookHint:"A number from 1 to 7.", newHint:"A number from 0 to 5.",
    allergenRule:"New allergens still come one at a time, {n} days apart.",
    more:"More", offPlate:"Off the plate: {list}.", offPlateNone:"Nothing off the plate beyond the usual.",
    atHome:"At home: {list}.", atHomeNone:"Nothing marked at home yet.",
    again:"To offer again, in a new form: {list}.", againNone:"Nothing to offer again yet.",
    seeProfile:"Profile", seeKitchen:"Kitchen",
    set:"Set the table", from:"From {date}.", back:"Back to the sentences", done:"New week set."
  },
  /* ---------- Profile: know {name} ---------- */
  profile:{
    going:"How it's going", groupLine:"{group}: {foods}.", waiting:"Still waiting: {foods}.", nothingYet:"nothing yet",
    loved:"Loved it", lovedNone:"Nothing yet. Foods show up here once they're mostly loved.",
    warming:"Still warming up", warmingNone:"Nothing yet.", offeredTimes:{one:"{food} · offered {n} time", other:"{food} · offered {n} times"},
    way:{steam:"Try it roasted this time, in wedges.", roast:"Try it steamed and mashed this time.", boil:"Try it in a new shape: soft strips instead of mash.",
         raw:"Try it in a different shape, or next to something familiar.", pair:"Try it next to {food}, a food they love."},
    offPlate:"Off the plate", allergies:"Allergies: {list}.", allergiesNone:"No allergies noted.", notFan:"Not a fan: {list}.",
    allergenRecord:"Allergens", edit:"Edit",
    firsts:"Firsts", first:"First {food} · {date}", firstsNone:"Firsts show up here as they happen.",
    addPhoto:"Add photo", removePhoto:"Remove photo", photoOf:"A photo of {food}", photoTooBig:"That photo is too big to keep on this device.",
    settings:"Settings", name:"Name", editSpelling:"Edit spelling", birthday:"Birthday", mealTimes:"Meal times", priorities:"Priorities",
    basics:"Kitchen basics", redraw:"Redraw", caregivers:"Caregivers", appearance:"Appearance", appearanceOpts:{auto:"Auto", light:"Light", dark:"Dark"}, replay:"Replay the first steps"
  },
  allergenNote:{
    note:"Not medical advice. Check allergen introduction with your pediatrician, and contact them or emergency services if you see signs of a reaction.",
    notYet:"Not yet", introduced:"Introduced on {date}", introducedBefore:"Introduced", noReaction:"Introduced, no reaction noted on {date}",
    markNoReaction:"No reaction noted", markFor:"No reaction noted for {allergen}", keepOut:"Keep out"
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
    removeShort:"Remove",
    sendTomorrow:"Send tomorrow"
  },

  /* ---------- sharing: text first, nothing sent without you ---------- */
  send:{
    tomorrowTo:"Tomorrow to {person}",
    weekLink:"This week, as a link",
    copied:"Copied",
    linkWarn:"This link includes {name}'s allergies and menu. Anyone who has it can read them, and it can't be taken back.",
    linkOk:"Make the link",
    linkShort:"The week didn't fit in one link, so it covers today and tomorrow."
  },
  /* the week preview (onboarding and New week): one row a day */
  weekRow:{meal:"{meal}: {foods}"},
  share:{
    groceries:{head:"{name}'s groceries · {date}", updated:"Updated {time}", item:"☐ {item} · {unit}", by:" · by {weekday}"},
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
    welcomeBack:"Welcome back.",
    progress:{names:["Name","Birthday","Allergens","Week"], step:"Step {n} of 4: {name}"},
    draw:{sentence:"Pull up a chair for {blank}.", title:"Sign here", hint:"Big letters. Wobbly is perfect.",
          erase:"Erase", done:"Done", undo:"Undo", typeInstead:"Type instead", pad:"Drawing pad for their name", drawn:"their name, as drawn"},
    spell:{sentence:"Spelled for the grown-ups: {blank}.", line:"So we can say hello properly."},
    birthday:{
      sentence:"{name} showed up on…",
      day:"Day", month:"Month", year:"Year",
      dayLabel:"day", monthLabel:"month", yearLabel:"year",
      swipe:"Swipe each column.",
      dayClamped:"Day set to {n}",
      future:"That day hasn't happened yet.",
      old:"This table is set for ages 0 to 3. Check the date?",
      stageAt:"At {months}, {tagline}.",
      bornEarly:"Born early?",
      early:"Born {blank} weeks early.", weeksLabel:"Weeks early",
      using:"We're using {months}, counting from the due date.",
      milk:{one:"Milk is all {name} needs for now. We'll save a seat for {n} more month.",
            other:"Milk is all {name} needs for now. We'll save a seat for {n} more months."},
      nothingYet:"Nothing to cook yet."
    },
    keepOut:{
      sentence:"Hold the {blank}.",
      line:"Tap to keep it out. We'll never suggest it.",
      labels:{egg:"Egg", milk:"Milk", peanut:"Peanut", treenuts:"Tree nuts", wheat:"Wheat", soy:"Soy", fish:"Fish", shellfish:"Shellfish", sesame:"Sesame", meat:"Meat", gluten:"Gluten"},
      notYet:"Not yet",
      out:"Keep out",
      fine:"Tried, all fine",
      aria:"{food}: {state}. Tap to change.",
      said:"{food}: {state}",
      removed:"{food} removed",
      add:"Something else",
      alsoNot:"Also keep out {blank}.",
      allergy:"Allergy",
      dislike:"Not a fan",
      addIt:"Add",
      lockedPre:"Always off the plate:",
      locked:"Always off the plate at this age: {list}.",
      lockedOpen:"What's always off the plate",
      lockedTitle:"Always off the plate",
      spacing:"Anything left alone, we'll introduce one at a time, with space between.",
      note:"Not medical advice. Your pediatrician has the final word on allergens.",
      cta:"Show the week"
    },
    priorities:{title:"This week, we care most about…", line:"Pick up to three.", cta:"Next"},
    atHome:{title:"Already in the kitchen…", line:"Skip if you like. We'll plan around it.", cta:"Next", skip:"Skip"},
    reveal:{tagline:"{tagline}.", without:"Without {list}.", more:"and {n} more", none:"Nothing off the list.", days:"Seven days."},
    done:{title:"{name}'s week.", titleAfter:"'s week.", line:"Seven days. {tagline}.", today:"Starts today", tomorrow:"Starts tomorrow",
          days:"Days of the week", dayToday:"Today", dayTomorrow:"Tomorrow", first:"First: {allergen}", new:"New: {food}", around:"around {time}",
          again:"Again", apply:"Love it", ready:"New week ready", shuffle:"Shuffle"},
    closing:{title:{one:"{name}'s table opens in {n} month.", other:"{name}'s table opens in {n} months."}, line:"Nothing to cook yet.", cta:"Look around"}
  },

  /* Every word about a stage. name = the big tagline under the birthday fields;
     meals + textureShort make the small line beneath it ("3 meals · lumpy mash and finger foods");
     locked = the "always off the plate" line (the rules themselves live in LOCKED_RULES). */
  /* ---------- meal times on a day axis (onboarding and Profile share it: mealtimes.js) ---------- */
  mealTimes:{
    sentence:"{name} usually eats around…",
    they:"They",
    hint:"Drag each meal to where it usually lands.",
    selected:"{meal} around {time}",
    type:"Type a time",
    typed:"{meal} around",
    typeLabel:"{meal}, the time",
    bad:"Try 12:30 or 7pm.",
    out:"Between {from} and {to}.",
    moved:"Moved to {time}, to keep an hour between meals.",
    remove:"Remove",
    addSnack:"Add a snack",
    usual:"Use the usual",
    usualDone:"Back to the usual.",
    undo:"Undo",
    gapH:"{h} h",
    gapHM:"{h} h {m}"
  },

  stages:{
    milk:{
      name:"Milk only", meals:"Milk only, for now"
    },
    first:{
      name:"First tastes",
      meals:"1–2 small meals + milk", textureShort:"purées and soft finger foods", caption:"purées",
      portionHint:"a few spoonfuls of each; follow their appetite",
      note:"Milk is still their main food; solids are for tasting.",
      avoid:["Honey","Cow's milk as a drink","Whole nuts","Added salt or sugar"],
      locked:"honey, whole nuts, whole grapes, added salt and sugar"
    },
    textures:{
      name:"Fingers first",
      meals:"3 meals", textureShort:"lumpy mash and finger foods", caption:"lumpy mash",
      portionHint:"2–4 tablespoons of each food",
      note:"Milk alongside meals, as they eat more.",
      avoid:["Honey","Cow's milk as a drink","Whole nuts","Added salt or sugar"],
      locked:"honey, whole nuts, whole grapes, added salt and sugar"
    },
    family:{
      name:"A seat at the family table",
      meals:"3 meals + 2 snacks", textureShort:"soft pieces", caption:"soft pieces",
      portionHint:"about a quarter of an adult portion",
      note:"Whole cow's milk can be their main drink now.",
      avoid:["Whole nuts","Whole grapes","Added salt or sugar"],
      locked:"whole nuts, whole grapes, added salt and sugar"
    },
    nearfamily:{
      name:"Big opinions, small plates",
      meals:"3 meals + 2 snacks", textureShort:"bite-size family food", caption:"family food",
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
