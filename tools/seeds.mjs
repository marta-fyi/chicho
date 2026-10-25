// The curated seeds: `node tools/seeds.mjs`. For each phone size, SEED_CANDIDATES seeds are scored on the first pile
// (scoreSeed in sortcore.js: packing success, the smallest inscribed circle, the evenest shapes, a balanced pile) and the
// best SEED_KEEP go into curatedSeeds.json; the app picks one of those at random for each family. The field sizes are
// the ones the screen really lays out, measured by tools/devices.mjs into docs/sortfields.json (the layout budget's
// minimum piles until a device run has measured them). The top three per size are photographed by devices.mjs.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const ctx = vm.createContext({console});
for (const f of ["sortconfig.js", "foods.js", "sortcore.js"]) vm.runInContext(readFileSync(join(root, f), "utf8"), ctx, {filename: f});
const C = vm.runInContext("SORT_CONFIG", ctx);

// the first pile's labels, as the screen shows them (the manifest's)
const items = vm.runInContext("SORT_CONFIG.bigFoods.map(id => ({id, label: FOOD_BY_ID[id].label}))", ctx);

const measured = join(root, "docs/sortfields.json");
const fields = existsSync(measured) ? JSON.parse(readFileSync(measured, "utf8"))
  : {"375x667": {w: 375 - 2 * C.EDGE_INSET, h: 170}, "390x844": {w: 390 - 2 * C.EDGE_INSET, h: 220}, "430x932": {w: 430 - 2 * C.EDGE_INSET, h: 260}};

const out = {note: "written by tools/seeds.mjs; the app picks one at random for its viewport (the nearest size)", sizes: {}};
for (const [size, field] of Object.entries(fields)) {
  const scored = [];
  for (let k = 1; k <= C.SEED_CANDIDATES; k++) {
    const seed = (Math.imul(k, 2654435761) >>> 0) % 1000000;
    scored.push(vm.runInContext(`scoreSeed(${JSON.stringify(items)}, ${JSON.stringify(field)}, ${seed})`, ctx));
  }
  scored.sort((a, b) => b.score - a.score);
  const keep = scored.slice(0, C.SEED_KEEP);
  const passing = scored.filter(s => s.pass).length;
  out.sizes[size] = {field, seeds: keep.map(s => s.seed), scores: keep.map(s => ({seed: s.seed, score: +s.score.toFixed(3), inscribed: +s.inscribed.toFixed(1), quality: +s.quality.toFixed(3), balance: +s.balance.toFixed(3), overlap: +s.overlap.toFixed(2), pass: s.pass}))};
  console.log(`${size}  field ${field.w}×${field.h}  ${passing}/${scored.length} pass  kept ${keep.map(s => s.seed).join(", ")}  (best ${keep[0].score.toFixed(3)}, worst kept ${keep[keep.length - 1].score.toFixed(3)})`);
  if (keep.some(s => !s.pass)) console.log(`  ${size}: ${keep.filter(s => !s.pass).length} kept seed(s) don't pass: the field is too small for the first pile (see docs/decisions.md)`);
}
writeFileSync(join(root, "curatedSeeds.json"), JSON.stringify(out, null, 1) + "\n");
console.log("curatedSeeds.json written");
