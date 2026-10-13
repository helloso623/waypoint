// Live phone vs computer detection. CSS + widgets adapt from html[data-device] /
// .device-* classes so both modes stay intentional (dense desktop, touch phone).
(function initWaypointDevice() {
  const queries = {
    narrow: window.matchMedia("(max-width: 720px)"),
    phone: window.matchMedia("(max-width: 600px)"),
    pointerCoarse: window.matchMedia("(pointer: coarse)"),
    hoverNone: window.matchMedia("(hover: none)"),
  };
  const root = document.documentElement;
  let resizeTimer = null;
  let densityDefaulted = false;
  let lastSignature = "";

  const device = {
    narrow: false,
    phone: false,
    tablet: false,
    coarse: false,
    touch: false,
    desktop: false,
    mode: "desktop",
    refresh,
  };

  function applyComfortableDensityDefault() {
    // Only auto-bump density on real phone/coarse UIs — leave computer defaults alone.
    if (densityDefaulted || !(device.phone || device.coarse)) return;
    densityDefaulted = true;
    try {
      if (localStorage.getItem("settings_density") === null) {
        localStorage.setItem("settings_density", "comfortable");
        root.classList.add("settings-density-comfortable");
        root.classList.remove("settings-density-compact");
      }
    } catch (_) {
      // Storage can be unavailable in private/locked-down browser contexts.
    }
  }

  function refresh() {
    device.narrow = queries.narrow.matches;
    device.phone = queries.phone.matches;
    device.coarse = queries.pointerCoarse.matches || queries.hoverNone.matches;
    device.touch = device.coarse || "ontouchstart" in window;
    // Computer = roomy enough + fine pointer/hover. Touch laptops with hover stay desktop.
    device.desktop = !device.phone && !device.coarse;
    device.tablet = !device.phone && !device.desktop;
    device.mode = device.phone ? "phone" : (device.desktop ? "desktop" : "tablet");

    root.setAttribute("data-device", device.mode);
    root.dataset.pointer = device.coarse ? "coarse" : "fine";
    root.classList.toggle("device-narrow", device.narrow);
    root.classList.toggle("device-phone", device.phone);
    root.classList.toggle("device-tablet", device.tablet);
    root.classList.toggle("device-coarse", device.coarse);
    root.classList.toggle("device-touch", device.touch);
    root.classList.toggle("device-desktop", device.desktop);
    applyComfortableDensityDefault();

    const signature = [
      device.mode,
      device.narrow ? "n" : "",
      device.coarse ? "c" : "",
      device.touch ? "t" : "",
    ].join(":");
    if (signature !== lastSignature) {
      lastSignature = signature;
      try {
        window.dispatchEvent(new CustomEvent("waypoint:devicechange", { detail: { ...device } }));
      } catch (_) { /* older browsers */ }
    }
    return device;
  }

  function scheduleRefresh() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(refresh, 100);
  }

  Object.values(queries).forEach(query => {
    if (typeof query.addEventListener === "function") query.addEventListener("change", refresh);
    else if (typeof query.addListener === "function") query.addListener(refresh);
  });
  window.addEventListener("resize", scheduleRefresh, { passive: true });
  window.addEventListener("orientationchange", scheduleRefresh, { passive: true });

  window.WaypointDevice = device;
  refresh();
})();
