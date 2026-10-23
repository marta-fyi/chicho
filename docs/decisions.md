# Decisions

Where the brief's rules met each other, the principles won. Every number marked **verify** is a planning aid, not advice, and needs checking against the named kind of source before anyone relies on it.

## Principles over earlier rules

| Earlier rule | What the principle changed | Principle |
|---|---|---|
| Meal, day, shop, variety and profile **peeks** opening on hover/focus/tap (first brief §6–7) | Removed. A meal expands in place; everything else is a **sheet**. No hover anywhere; `tools/check.mjs` fails the build on `:hover`, `@media (hover…)` or hover listeners. | 4, 5 |
| Quick tick on the drawing, "eaten" state, leaf burst on a cleared meal, "Plates cleared. Good day." | One **offered** ring per meal, always visible; outcomes (Loved it · Ate some · Not today) are optional and equal; the day ends "That's today done." No celebration of a clear plate. | 2, 3 |
| "Not logged" under a past meal; a 90-minute grace window | No missed state: an earlier meal just loses emphasis and stays tickable. The "now" window is one constant, `NOW_WINDOW_MIN = 60`. | 3 |
| Onboarding asks priorities, kitchen and meal times | First run asks **name, birthday, allergens** only. The rest comes as late questions on the moment line (one a day, never on day one, never during a "now") and is always in the Profile sheet. | 9 |
| Big 140–160px meal drawings on home; 72px in the reveal | Drawings are 24–32px bullets everywhere but the welcome screen. | 10 |
| Emoji fallback for foods with no drawing | A 1.5px hairline circle. Alt text is empty (a visible label always sits beside it). | 10 |
| Secondary text at 70% | 85%, never lower; hairlines 20%. Section labels ("Up next", "While you're at it") are full ink: at 85% the night sky measured 4.2:1. | Look |
| Variety on the landing page | Moved below the fold, with the week. | 1 |

## Phone first (Paper & Glow addendum)

Chicho is designed, built and tested for 360–430px. Everything below supersedes the earlier desktop and wide-screen rules.

- **One column.** 20px from each edge (or the safe area, whichever is larger), at most 430px wide; above that the same column is centred on the same background. No desktop layout, dialog, popover or test remains.
- **Section order.** The open meal is followed directly by **Up next**, then "While you're at it", then "Earlier today", so Up next can peek at the bottom edge as the scroll hint. The "more" chevron is gone.
- **The week strip vs the 8px rule.** Seven 44px targets in a 350px column leave 7px between them, so the strip is the one place targets sit closer than 8px (the brief asked for both; the 350px fit wins). Below a 350px column the gaps shrink further but the targets stay 44px.
- **One overlay.** Every detail is a bottom sheet: scrim, handle, a 44px ✕, Esc, a focus trap (the modal `<dialog>` plus Tab wrapping), `overscroll-behavior: contain`. It opens at the **medium** detent (62% of the visible height, or shorter when the content is), drags up to **large** (everything below the status bar) and down to medium, then away; a pull down on content scrolled to the top does the same. The centred dialog and the birthday's month peek (an anchored popover) are gone.
- **The keyboard.** One `visualViewport` listener keeps `--kb` (the keyboard's height) and `--vvh`; the sheet sits on top of the keyboard and switches to large while it's up, and the focused field scrolls into view. Tests stand in a fake viewport (`window.__vv`).
- **Onboarding with the keyboard.** A step with a field starts at a fixed height (`6svh`, which the keyboard doesn't change) instead of being centred, so the sentence never moves when the keyboard opens or closes; the scroller ends at the keyboard and one smooth scroll keeps the field and Next above it. Steps without a field stay centred.
- **Auto-focus on iOS.** iOS opens the keyboard only for a focus inside a tap, and the next step's field doesn't exist yet when Next is tapped. A hidden 16px field takes the focus during the tap and hands it to the real field after the swap. Needs checking on a real iPhone.
- **Birthday.** Day, month and year are numeric fields (`inputmode=numeric`, `bday-*` autocomplete) that advance when full: two digits, or one digit that can't start a longer number (a day of 4–9, a month of 2–9). The month still accepts a typed name ("dec") for hardware keyboards.
- **Two themes, one layout.** Light ("Paper & Glow") and dark (the night sky) differ only in the tokens (`--bg`, `--ink`, `--ink-muted`, `--hairline`, `--sheet`, `--scrim`, `--glow`, `--glow-core`, plus `--ink-deco` for decorative text and `--handle`) and the background. Auto follows `prefers-color-scheme`; Profile → Appearance (Auto · Light · Dark) is stored in `state.profile.appearance` and applied before the first paint. `tools/check.mjs` fails any colour written outside the token block.
- **The night sky, still.** The dark theme is Marta's image under the evening tint, as before, but it no longer drifts: the glow's breath is to be the only continuous animation. The dawn, day and golden tints are gone (the light theme replaced the daytime sky), and so is the blurred scroll edge (a live filter).
- **The sheet in the dark theme** is a deep navy surface (`#1C2342`) with white ink, not white: one set of tokens serves every component.
- **The glow's colours, tuned.** Against the reference's yellow (OKLCH L 0.92, C 0.14) the brief's four other colours were darker and greyer, so they were brought to L ≈ 0.85 with as much chroma as sRGB allows: Veg `#BBDD72` (brief `#AACF53`), Fruit `#FEB7C5` (`#F596AA`), Protein `#FEBC9F` (`#F5B1AA`, also turned toward peach: at the same lightness it was indistinguishable from Fruit), Fats and dairy `#83DCFE` (`#A0D8EF`). Grains stays `#FFE56B`. Secondary text over any of them, at full strength, measures 5.5:1 or better.
- **The glow's shape.** The grey nucleus (`#83838A`, ink on it 5.0:1) holds to 5% of the radius, has become the full colour by 32%, holds, then fades from 40% to nothing at the edge (stops generated in `theme.js`, so tests can compute the colour behind any point). The grain over the glow is a masked layer on top of the colour rather than a second background on the same element, so it fades out with the glow instead of drawing a square.
- **One continuous animation.** The breath is the only infinite animation; the welcome's bob and the reveal's bob are gone, and the blank's underline pulses four times, then rests. `tools/check.mjs` fails a transition, `@keyframes` or `element.animate()` that moves anything but transform and opacity, and any other infinite animation. The ring's check now "draws" by a wipe sliding off it (transform) instead of a stroke animation.
- **Type.** JetBrains Mono for everything, self-hosted as two woff2 subsets (400 and 500, ~14 KB each; Latin, Latin-1, digits and the punctuation the copy uses), preloaded, `font-display: swap`, falling back to `ui-monospace, "SF Mono", Menlo, monospace`. It's the NL build (no ligatures), subset from the copy installed on this Mac by `tools/make-fonts.sh`; the OFL text and URL stay inside each file. Every 600/700/800 weight became 500. `--font-display` sets only the headline and the onboarding sentences, so swapping it for a grotesk leaves the body mono. Labels and button text are uppercase with +0.06em in CSS; standalone text actions count as buttons, but a text action inside a sentence (the moment line's "Send the list") stays sentence case so the sentence still reads as one.
- **The corner header.** Top-left is one button (44px+) that opens Profile: "{n} months" over the name, uppercase and underlined. Top-right: "{Weekday} {D} {Mon}" over the time, tabular numerals. The time is the reader's own clock (24-hour where the phone is), as everywhere else in the app, rather than a forced HH:MM. The profile circle, the Send button and the centred header lines are gone; Send lives on the moment line, in the open meal and in Shop.
- **Captions.** Bottom-left of the poster: the stage name over "{meals} · {caption}", where `caption` is a new short texture per stage in `content.js` ("lumpy mash"), at 55% and `aria-hidden`. Bottom-right: the glow's food group in words, `--ink-muted`, read aloud. The group names live in `content.js` (`home.groups`), not in the glow module.
- **Mask bullets.** A drawing is still a `<picture>` (it keeps the alt, the explicit size, WebP with PNG fallback and lazy loading), and once its image loads, `artReady()` turns the bullet into `mask-image` of that same file filled with `--ink` (`--on-ink` on an ink pill), so nothing loads twice and below-the-fold bullets stay lazy. Without mask support the image shows with `filter: brightness(0)` (`brightness(0) invert(1)` in dark).
- **Status bar and theme colour.** Two `theme-color` metas with `media` queries (light `#DCDDDD`, dark `#3D4662`, the top of the night sky); when a theme is chosen in Profile, both are pinned to it. Installed, the app is standalone with `apple-mobile-web-app-status-bar-style: default`, which keeps dark status-bar text, readable on the paper. **Trade-off:** iOS reads that meta once at launch and can't switch it per theme, so in the dark theme the standalone status bar stays a light strip with dark text above the night sky. The alternative, `black-translucent`, draws white text over the page: right for the night sky, unreadable on the paper (white on `#DCDDDD` is 1.4:1). Light is the default and the more common case, so `default` wins; check both on a real iPhone.
- **Keep screen on.** A toggle in the open meal (the default one), shown only where `navigator.wakeLock` exists; off by default. It lets go when the tab is hidden or the page is left, and turns itself off after `WAKE_MAX_MS` (60 minutes); it re-acquires only if it was left on and the page is visible again within the hour.
- **The install line.** Shown in the moment slot on the second day Chicho is opened (the first day after `firstDay`), once: it stays that day unless "Later", and never comes back. Never when running standalone, never while a meal is "now", and only on an iPhone or iPad, because the words describe iOS's Share sheet; Android shows its own install prompt.
- **Touch.** `touch-action: manipulation` and no tap highlight everywhere; every button and link scales to .97 over 100ms while pressed (transform only), with the empty `touchstart` listener iOS needs for `:active`. Text actions inside a sentence are inline-blocks so they can scale, and two in a row sit 8px apart beyond their 44px pads. The ring scales its 28px circle, not its 44px pad. Haptics stay an optional `navigator.vibrate` that nothing depends on.
- **"8px between neighbouring targets"** is read as side by side: list rows (food rows, meal rows, sheet rows) stack edge to edge as one list, as iOS lists do. The tests check overlaps everywhere and the 8px gap between side-by-side targets.
- **Fold budget, worst case.** Over 40 random weeks at 390×844 the "Up next" label ends by 806px (it must show, not just its top edge). That took "Keep screen on" moving into the open meal's title row and the meal's meta line going to 15px so it stays on one line. The group caption has one fixed width (15ch), so a longer name ("Fats and dairy") never reflows the poster.
- **The pill's zone.** The pill sticks inside a zone that begins after the first two foods, so even in landscape (390px tall) it can never sit on the meal's title or its first two rows; it covers only the meal's own later content as that scrolls under it.
- **The fold-in observer.** Below-the-fold sections fade up on a passive scroll check, not an IntersectionObserver: with the glow breathing, an observer made the browser recompute intersections every frame (110 ms of main thread a second at 4× CPU, against ~1 ms now).
- **The sticky pill.** "Mark as offered" is one 48px bar, sticky at the bottom of the open meal. "Offered · Undo" splits the same bar into two buttons (no overlap, no change in size), so nothing shifts.

## Patterns (one thumb, messy hands, quiet)

- **Change, one at a time.** "Change" on a food shows one safe alternative (the same gate as the generator, drawn foods first, a stable order per food); "Another" crossfades to the next, "Keep" takes it, with the usual 5-second Undo.
- **Swipe a row.** Right marks the meal offered (its undo line follows), left opens it in place on Change for its main food. The ring and the tap stay the visible path. A swipe that starts within 24px of either edge is left to Safari's back swipe; a drag that moves 10px vertically first is the page's scroll (`touch-action: pan-y`); under 72px it springs back.
- **How it went, in the same motion.** Ticking a meal (pill, ring or swipe) brings "Loved it · Ate some · Not today" up inline under it, for the open meal and for rows alike. It fades away on its own after 10 s if ignored, and 1.6 s after an answer; nothing waits for it. (Before, the row waited for the 5-second undo and then stayed.) The reward stays what it was: the ring's check draws in (~180 ms) and the glow pulses once.
- **Scrub through the day.** Swiping the headline area sideways steps through that day's meals (left: later, right: earlier, stopping at the ends). The headline ("{Meal} around {time}."), the open meal and the glow crossfade to it; the moment line becomes a quiet "Back to now". The next meal boundary returns to now on its own.
- **Tomorrow mode.** The top-right date is now a button: a tap (or a swipe left) re-skins the page to tomorrow's plan: the corner shows tomorrow's date, the headline is tomorrow's first meal, the rest of tomorrow is listed under it, nothing from today is, and the moment line reads "Tomorrow · Back to today". Scrubbing works inside it. "Keep screen on" hides there (cooking happens today).
- **Press and hold for something big.** "Start a new week" (in This week) fills a ring over one second while held (pointer, or Space/Enter held); letting go early springs it back and nothing happens. It then sets the new week straight away, with "New week set. Undo" for 5 seconds that restores the old plan exactly. The "Love it" reveal stays for the first week and the "Set the week" moment line.
- **Cook mode.** "Start cooking" (today's open meal) turns the home into one step at a time: each cooked food's one-line how, longest-cooking first, then "That's it. Serve it all as …". The step is the headline (large type on the glow, which dims to 55%), "Step n of N" and its timer sit on the moment line, Next is an 88px button fixed in the thumb zone, and a sideways swipe on the step moves too. It's a mode of the page, not an overlay (the sheet stays the only overlay). The screen stays awake while cooking (Wake Lock, released after unless it was already on); Escape or "Stop cooking" leaves.
- **Timers, honestly.** A step with minutes offers a one-tap timer: an end time in `state.timers` (it survives a reload; one 6 hours gone is forgotten), a thin ring whose arc is set once a second (never animated), the time left in the tab title ("Sweet potato · 3:12"), and "Time's up: …" when Chicho is looked at again. The page says plainly that it can't ring when the phone is locked or in another app; reliable alerts would need web push through the installed app and a small backend (out of scope, like reminders).
- **Portions.** In cook mode, 1 · 2 · 4 rescales every amount ("35 g" × 2 = "70 g"; words stay as they are), which pairs with the "cook double and freeze half" line.
- **The glow's width.** The glow's wrapper is sized from the page's measured width (`--vw`), not `100vw`, which includes a classic scrollbar and overflowed by its width wherever scrollbars aren't overlays.

## Verification (Paper & Glow)

- **Every commit:** `node tools/check.mjs`: lint (no hover, no colour outside the tokens, motion only on transform and opacity, one infinite animation), voice, and 20 test pages in headless Chrome, including layout (the fold budget at 390×844 and 375×667, no horizontal scroll from 320px, landscape), sheets, keyboard (a stand-in `visualViewport`), theme, glow, contrast, bullets, kitchen and touch.
- **Devices:** `PLAYWRIGHT=… node tools/devices.mjs --perf`: WebKit and Chromium as iPhone SE, 14, 14 Pro Max and 14 landscape, light and dark (78 checks: overflow, header inside the screen, 44px targets, the sticky pill, the fold budget), plus 97 screenshots in `docs/screenshots/` (JPEG, so the published folder stays ~4 MB). Playwright can't emulate safe-area insets; those are on the iPhone list.
- **Contrast** (`tests/contrast.html`): for all five glow colours, `--ink` on the nucleus is 5.0:1 or better, `--ink` and `--ink-muted` on the brightest zone and the plain grey 5.5:1 or better, rings 3:1 or better; then every functional text on the light home at 390×844 and 375×667, sampled at five points against the colour really behind it (both ends of the breath, and dimmed) passes 4.5:1. The grain's specks (up to 13% alpha) aren't modelled.

## Performance (measured, `docs/perf.json`)

Chromium as an iPhone 14, 4× CPU slowdown (a mid-range phone), Slow 4G (150 ms, 1.6 Mb/s), a returning family on the light home:

- **First contentful paint: ~0.93 s** (budget 1.5 s); layout shift 0; ~515 KB transferred, uncached.
- **The breath:** composited (Chromium reports no compositing failure); main thread **~1 ms a second** with it on, 3 ms with it off; 120 fps, worst frame 9 ms.
- **The grain:** a static 34 KB tile; no paint or main-thread cost after the first paint (it never repaints: the breath scales and fades a composited layer above it).

## Check on a real iPhone

Install to Home Screen (icon, name, opens standalone, offline after install); the status bar in both themes in standalone (`default`: dark text; the dark theme's light strip is the logged trade-off); safe areas (notch and home indicator, portrait and landscape: the corners, the sticky pill, sheet bottoms); the keyboard (onboarding fields and Next above it with no jump, the hidden field keeping the keyboard up between steps, sheet inputs above it, no zoom on focus); sheets (swipe down, drag to large, pull down from the top of the content); the share sheet (`navigator.share`) and SMS links (body prefill, the fallback when Messages doesn't open); copy; Keep screen on (stays awake, lets go when locked or switched away, comes back); the grain (fine, not blotchy, at 3×) and scroll performance with the glow breathing; `:active` press states; Appearance switching and theme colour; the favicon.

## How I read the ambiguous parts

- **"Day finished" vs "after the last meal".** "That's today done." shows when every meal today was offered (or skipped). If the day ends with meals not offered, the headline is "{Meal} tomorrow around {time}." instead, so it never implies something was missed.
- **Dusk.** The sky has four phases (dawn, day, golden, evening). Only *evening* (19:30–05:00, the navy tint) is night/dusk: ink turns white there. Golden hour keeps black ink (measured 7.6:1 or better).
- **"Stage changed this month."** The stage line shows while the child is in the first month of a new stage and the week hasn't been updated; "Later" hides it until tomorrow.
- **Shopping day.** There is no shopping day unless one is set (`profile.shopDay`, a weekday number); the shop line otherwise shows when something runs out within 24 hours, before 19:00.
- **A meal offered from its own pill stays open** (Offered · Undo, then the outcome row) until the next meal boundary, so the Undo and the outcomes are where the tap was.
- **6 months starts with lunch only; breakfast joins at 7 months.** (verify, see below)
- **Allergen safety vs preference.** Each food's record keeps `safety` (notyet / introduced, with the date / no reaction noted on a date / keepout) and `preference` (the last outcome) separately; an outcome never changes safety.
- **"No banned strings in source."** The check covers `index.html`, `home.js`, `foods.js`, `content.js` and `sw.js`. The schema-8 migration must read the old field names to convert old saves; those two lines carry a `legacy:` marker and are the only exception. Tests are not scanned (they assert the words are absent).
- **Methods.** The cooking layer adds `toast` and `none` (stirred in) to steam / roast / boil / raw, so every food has an honest one-line how. Only steam / roast / boil foods count as cook-ahead.
- **Legumes are canned** unless a pantry item is marked dried (`stock[key].dried`), so "soak" only appears then.
- **Delivery granularity.** The v2 delivery list asked for nine commits. The pieces share one module (`home.js`) and one test build, so they landed together (each step's tests in the same commit) rather than as nine commits that each pass on their own.

## Sharing and the link

- **SMS links.** iOS and macOS take `sms:{number}&body={text}`; Android and everything else `sms:{number}?body={text}` (`platform()` reads the user agent; iPadOS reports itself as a Mac, which takes the Apple form). If the page is still visible ~1.4 s after opening the link, it falls back to the share sheet, then to copying the text with a short "Copied". Nothing claims more than "opens Messages".
- **Numbers** are normalised to digits and a leading `+`, stored only in localStorage, and never put into a link or a payload (tested).
- **The caretaker link** is `{origin}{path}#/s/{payload}`: the payload is in the fragment, which browsers never send to a server. `v: 1`; gzip (CompressionStream) + base64url, or a plain base64url fallback (`z…` / `j…`). It holds the name, age in months (not the birth date), allergies, dislikes, locked items and the meals. Capped at 1,800 characters; a week that doesn't fit becomes today and tomorrow, and the Send sheet says so. A link can't be revoked; the first time, the sender is told who can read it.
- **The read-only view** replaces the app (no ticks, no editing, no onboarding), disables `save()` and blocks `localStorage.setItem` for the page, and adds `<meta name="robots" content="noindex">`. A damaged link says "This link looks incomplete. Ask for it to be sent again."

## Needs a pediatric source (verify)

- Stage boundaries: milk only 0–5 months; first tastes 6–8; fingers first 9–11; family table 12–23; 24–36.
- Starting with **one meal at 6 months** and adding breakfast at 7.
- Default meal anchors per stage (08:00 / 10:30 / 12:30 / 16:00 / 19:00; dinner 18:30 at 9–11 months).
- **Allergen introduction**: the nine common allergens, introduced **one at a time, at least `ALLERGEN_SPACING_DAYS = 3` days apart**, the first taste "small", and the calm note's wording ("Not medical advice. Check allergen introduction with your pediatrician, and contact them or emergency services if you see signs of a reaction.").
- **One new ordinary food per meal** ("New today" shows one, and "Gentle new tastes" deals one a day).
- Locked foods and their ages: honey and cow's milk as a drink under 12 months; whole nuts, whole grapes, hard raw chunks, added salt and sugar, unpasteurised foods throughout.
- The **family-salt advice** ("Set aside {name}'s portion before adding salt"), shown at lunch/dinner from 12 months, at most three times.
- Portion sizes per stage, textures per food, the 60-minute "now" window as a rhythm (not a rule).

## Needs a food-safety source (verify)

- Storage note: **fridge 2 days · freezer 1 month · reheat once, piping hot, then let it cool** (`content.js` → `storage`).
- Lead times: **8 hours** to defrost a frozen portion in the fridge, **8 hours** to soak dried legumes (`LEAD` in `home.js`).
- Which foods freeze well (`FOOD_META` in `index.html`).
- Cooking times and the 200 °C roast in the one-line hows (`COOK` in `foods.js`, `cook.how` in `content.js`).

## Out of scope (would need a small backend later)

No accounts, backend, push or scheduled notifications, live sync between devices, or analytics. Live sync between a parent's and a caretaker's Chicho, and reminders at meal times, would both need a small backend; the snapshot link and text messages are the honest substitutes for now.
