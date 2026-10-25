/* ---------- Sort the food: every number in one place ----------
   The screen (sortfood.js), its pure parts (sortcore.js) and the generator read these. The dev tuning panel (?tune=1)
   changes the engine's values live; "copy values" gives back a block to paste here. */
const SORT_CONFIG = {
  // gestures (px, ms)
  DRAG_THRESHOLD: 10,        // a press that moves further is a drag, never a tap
  TAP_MAX_MS: 500,           // a tap is released within this
  TAP_MOVING_SPEED: 20,      // px/s: a shape moving faster ignores taps (it can still be grabbed)
  SNAP_RADIUS: 48,           // a place within this of the finger takes the drop
  // the shapes
  COVERAGE: 0.6,             // of the field's area
  MIN_D: 84, MAX_D: 132,     // a shape's shorter side
  COLLISION_RADIUS: 0.82,    // of a shape's radius: neighbours may overlap a little where they touch
  RADIUS_RANGE: [0.38, 0.62],
  RADIUS_RATIO_MIN: 0.7,     // shortest / longest of the eight radii; a set under this is drawn again
  ASPECT_RANGE: [0.85, 1.2],
  REST_ROTATION: 10,         // degrees, either way
  LABEL_FIT: 0.76,           // of the shape's width
  LABEL_PX: [11, 14],
  MIN_INSCRIBED: 80,         // px: the largest circle inside every shape
  EDGE_INSET: 24,            // px from the left and right screen edges
  // packing
  PACK_ITERATIONS: 80,
  PACK_OVERLAP_MAX: 6,       // px of collision-circle overlap still accepted
  PACK_SHRINK: 0.04, PACK_RETRIES: 10,
  // seeds (tools/seeds.mjs)
  SEED_CANDIDATES: 200, SEED_KEEP: 12,
  // motion (ms)
  UNDO_MS: 5000,
  PLACE_SWELL: 1.03,
  FLOW_MS: 350,
  DROP_MS: 240,
  DROP_STAGGER_MS: 40,
  ENTRANCE_MS: 200,
  WIGGLE_AFTER_MS: 1200, WIGGLE_MS: 500, WIGGLE_DEG: 6,
  SECOND_PILE_MS: 1200,
  SUMMARY_MS: 4000,
  PULSE_MS: 900,
  FALL_MS: 500,
  RESULT_MS: 2000,           // the custom sheet's answer stays this long before it closes
  // the piles
  MAX_PILE: 12,
  MAX_CUSTOM: 12,
  bigFoods: ["egg", "milk", "peanut", "treenuts", "wheat", "soy", "fish", "shellfish", "sesame"],
  groups: [["veg", ["veg"]], ["fruit", ["fruit"]], ["grains", ["grains"]], ["protein", ["protein"]], ["dairyfats", ["dairy", "fats"]]],
  // introduction (placeholders: docs/decisions.md, "Needs a pediatric source")
  ALLERGEN_SPACING_DAYS: 3,
  ALLERGENS_FROM_MONTHS: 6,
  NEW_FOODS_PER_MEAL: 1,
  // the engine
  DT: 1 / 120,
  LINEAR_HALF_LIFE_MS: 120,
  ANGULAR_HALF_LIFE_MS: 150,
  RESTITUTION: 0.3,
  FRICTION: 0.5,             // at a contact: what turns an off-centre push into spin
  MAX_SPEED: 2000,           // px/s
  MAX_SPIN: 6,               // rad/s
  REST_SPEED: 40, REST_SPIN: 0.4, REST_DAMP: 0.85,   // under these, a step takes off 15% more: shapes stop, they don't creep
  SLEEP_SPEED: 2, SLEEP_SPIN: 0.05, SLEEP_MS: 500
};
