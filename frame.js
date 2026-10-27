/* Desktop, in a phone: phone.html's shell, where index.html's gate sends a desktop browser (or ?frame). The real app runs in
   an iframe at an iPhone 16 Pro's 402×874 viewport, so everything that measures the screen measures the phone's. The
   status bar and the home indicator sit over it without taking taps, and take the app's theme; the page around it
   does too. The whole phone scales down to fit the window's height and its column's width. */
(function(){
  // the phone with its edge; ROOM_Y is the page's top and bottom padding plus the line under the phone; the
  // description column takes at least ABOUT_W beside it on a wide window
  const PHONE_W = 402 + 2 * (12 + 3), PHONE_H = 874 + 2 * (12 + 3), ROOM_Y = 96 + 44, PAD_X = 96, ABOUT_W = 320, WIDE = matchMedia("(min-width: 960px)");
  const params = new URLSearchParams(location.search);
  params.delete("frame"); params.delete("app"); params.delete("inframe");
  const rest = params.toString();
  const src = "index.html?app&inframe" + (rest ? "&" + rest : "") + location.hash;

  const SIGNAL = '<svg width="18" height="12" viewBox="0 0 18 12" aria-hidden="true"><rect x="0" y="8" width="3" height="4" rx="1"/><rect x="5" y="5.5" width="3" height="6.5" rx="1"/><rect x="10" y="3" width="3" height="9" rx="1"/><rect x="15" y="0" width="3" height="12" rx="1"/></svg>';
  const WIFI = '<svg width="16" height="12" viewBox="0 0 16 12" aria-hidden="true"><path d="M8 2.3c2.3 0 4.4.9 6 2.4l1.2-1.3A10.4 10.4 0 0 0 8 .5 10.4 10.4 0 0 0 .8 3.4L2 4.7a8.6 8.6 0 0 1 6-2.4Zm0 3.6c1.3 0 2.5.5 3.4 1.4l1.2-1.3A6.6 6.6 0 0 0 8 4.1a6.6 6.6 0 0 0-4.6 1.9l1.2 1.3c.9-.9 2.1-1.4 3.4-1.4Zm0 3.5c-.5 0-1 .2-1.3.5L8 11.5l1.3-1.6c-.3-.3-.8-.5-1.3-.5Z"/></svg>';
  const BATTERY = '<svg width="27" height="13" viewBox="0 0 27 13" aria-hidden="true"><rect x=".5" y=".5" width="23" height="12" rx="3.8" fill="none" stroke="currentColor" opacity=".4"/><rect x="2" y="2" width="20" height="9" rx="2.5"/><path d="M25 4.5v4c.8-.3 1.3-1.1 1.3-2s-.5-1.7-1.3-2Z" opacity=".4"/></svg>';

  const stage = document.getElementById("frStage");
  stage.innerHTML = `
    <div class="fr-box">
      <div class="fr-phone">
        <i class="fr-btn l action"></i><i class="fr-btn l volup"></i><i class="fr-btn l voldown"></i>
        <i class="fr-btn r side"></i><i class="fr-btn r camera"></i>
        <div class="fr-bezel">
          <div class="fr-screen">
            <iframe title="Chicho, live" allow="clipboard-write"></iframe>
            <div class="fr-status" aria-hidden="true"><span class="fr-time"></span><span></span><span class="fr-icons">${SIGNAL}${WIFI}${BATTERY}</span></div>
            <div class="fr-island" aria-hidden="true"></div>
            <div class="fr-home" aria-hidden="true"></div>
          </div>
        </div>
      </div>
    </div>
    <p class="fr-line">Try it here, or open marta.fyi/chicho on your phone.</p>`;
  const box = document.querySelector(".fr-box"), phone = document.querySelector(".fr-phone"), frame = document.querySelector("iframe");

  // the whole phone, scaled to the window's height and the room its column has (never above its real size)
  const fit = ()=>{
    const gap = Math.min(96, Math.max(48, innerWidth * .06)), roomX = innerWidth - PAD_X - (WIDE.matches ? ABOUT_W + gap : 0);
    const k = Math.min(1, (innerHeight - ROOM_Y) / PHONE_H, roomX / PHONE_W);
    phone.style.transform = `scale(${k})`;
    box.style.width = PHONE_W * k + "px"; box.style.height = PHONE_H * k + "px";
  };
  addEventListener("resize", fit);
  fit();

  // the status bar's clock: the hour and minutes, as the phone shows them (no AM/PM)
  const clock = document.querySelector(".fr-time"), fmt = new Intl.DateTimeFormat(undefined, {hour:"numeric", minute:"2-digit"});
  const tick = ()=>{
    clock.textContent = fmt.formatToParts(new Date()).filter(p=>p.type==="hour" || p.type==="minute" || (p.type==="literal" && p.value.trim()===":")).map(p=>p.value).join("");
    setTimeout(tick, 60000 - Date.now() % 60000);
  };
  tick();

  // the app's theme (Auto, Light or Dark) colours the status bar, the home indicator and the page
  let watching = null;
  frame.addEventListener("load", ()=>{
    if(watching) watching.disconnect();
    try{
      const root = frame.contentDocument.documentElement;
      const sync = ()=>{ document.body.dataset.theme = root.dataset.theme==="dark" ? "dark" : "light"; };
      sync();
      watching = new MutationObserver(sync);
      watching.observe(root, {attributes:true, attributeFilter:["data-theme"]});
    }catch(e){}
    frame.focus();   // the arrow keys and typing go straight to the app
  });
  frame.src = src;
})();
