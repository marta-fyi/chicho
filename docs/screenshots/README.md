# Screenshots

Made by `tools/devices.mjs` (Playwright; see the header of that file for how to run it). Each run
deletes and rewrites every `.jpg` here. Names are `{device}-{engine}-{theme}-{what}.jpg`.

Devices, at the brief's sizes (the whole screen, as an installed app has it): `se` 375×667,
`14` 390×844, `14max` 430×932, `14land` 844×390. Engines: `webkit`, `chromium`. Themes: `light`, `dark`.

- **WebKit, iPhone 14, both themes — the full set:** `home`, `meal-expanded`, `week`, every sheet
  (`sheet-day`, `sheet-shop`, `sheet-shop-large` for the large detent, `sheet-send`, `sheet-profile`,
  `sheet-people`), every onboarding step (`onb-welcome`, `onb-name`, `onb-birthday`, `onb-keepout`,
  `onb-priorities`, `onb-athome`, `onb-mealtimes`, `onb-reveal`, `onb-done`), and in light each glow
  colour (`glow-grain`, `glow-vegetable`, `glow-fruit`, `glow-protein`, `glow-fat`), and the patterns:
  `change` (one alternative at a time), `tomorrow`, `cook` (with a timer running), `sheet-shop-instore`,
  `sheet-shop-staples`.
- **Every other device, engine and theme:** `home`, `week`, `sheet-shop`, `onb-birthday`.

The state is the tests' usual one: Thursday 22 October 2026, 12:10, an 18-month-old called Lula.
Animations are frozen for the shot. The allergen note sheet only exists on a day with a first
allergen, so it isn't in the set. There never were any 1440×900 snapshots in this repo to delete.
