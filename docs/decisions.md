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
- **The sticky pill.** "Mark as offered" is one 48px bar, sticky at the bottom of the open meal. "Offered · Undo" splits the same bar into two buttons (no overlap, no change in size), so nothing shifts.

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
