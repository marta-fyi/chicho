/* The sort's tuning panel, for development only: index.html?tune=1 on localhost loads it (sortTuneLoad in sortfood.js).
   It is not in the service worker's shell and the app never loads it anywhere else. Sliders change the engine's
   constants live (SORT_CONFIG); "Copy values" puts a block on the clipboard to paste into sortconfig.js. */
const SORT_TUNE = [
  ["LINEAR_HALF_LIFE_MS", 30, 400, 5], ["ANGULAR_HALF_LIFE_MS", 30, 400, 5], ["RESTITUTION", 0, 1, .05], ["FRICTION", 0, 1.5, .05],
  ["MAX_SPEED", 200, 4000, 50], ["MAX_SPIN", 0, 20, .5], ["REST_SPEED", 0, 120, 2], ["REST_SPIN", 0, 2, .05], ["REST_DAMP", .5, 1, .01],
  ["SNAP_RADIUS", 0, 120, 2], ["DRAG_THRESHOLD", 2, 30, 1]
];
function sortTune(ui){
  if(document.getElementById("sfTune")) return;
  const C = SORT_CONFIG, p = document.createElement("div");
  p.id = "sfTune"; p.className = "sf-tune";
  p.innerHTML = `<p class="sf-tune-h">${esc(say("sort.tune.title"))}</p>`;
  SORT_TUNE.forEach(([k, min, max, step])=>{
    const row = document.createElement("label"); row.className = "sf-tune-r";
    const name = document.createElement("span"); name.textContent = k;
    const val = document.createElement("span"); val.className = "sf-tune-v"; val.textContent = C[k];
    const r = document.createElement("input"); r.type = "range"; r.min = min; r.max = max; r.step = step; r.value = C[k];
    r.addEventListener("input", ()=>{ C[k] = +r.value; val.textContent = r.value; ui.wake(); });
    row.append(name, r, val); p.appendChild(row);
  });
  const copy = document.createElement("button");
  copy.type = "button"; copy.className = "btn-text small"; copy.textContent = say("sort.tune.copy");
  copy.addEventListener("click", ()=>{
    const text = SORT_TUNE.map(([k])=>`  ${k}: ${C[k]},`).join("\n");
    (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(()=>{ copy.textContent = say("sort.tune.copied"); }, ()=>{ console.log(text); });
  });
  p.appendChild(copy);
  document.body.appendChild(p);
}
