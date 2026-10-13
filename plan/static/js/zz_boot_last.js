(function () {
  var MAP = { Home: "home", Agent: "agent", Hub: "agent", Today: "plan", Tasks: "plan", Goals: "plan", Calendar: "plan", Events: "plan", Paint: "plan", Trends: "plan", Ideas: "capture", Skills: "capture", Problems: "capture", Thinking: "capture", Funny: "capture", Essays: "capture", Repository: "capture", Projects: "build", Competitions: "build", Code: "build", Obsidian: "build", Classes: "build", Practice: "play", Parallel: "play", Customers: "people", Contacts: "people", Team: "people", About: "system", Settings: "system", Prompts: "system" };
  function sync() {
    try {
      if (typeof ACTIVE_TAB !== "undefined" && ACTIVE_TAB === "Home") {
        document.body.dataset.workspace = "home";
        return;
      }
      var nav = document.getElementById("nav");
      if (!nav) return;
      var btn = nav.querySelector("button.active");
      var tab = btn && btn.dataset.tab;
      document.body.dataset.workspace = (tab && MAP[tab]) || "agent";
    } catch (e) {}
  }
  var nav = document.getElementById("nav");
  if (nav) {
    sync();
    new MutationObserver(sync).observe(nav, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
  }
  document.getElementById("hud-home").onclick = function () { if (typeof goToTab === "function") goToTab("Home"); };
  document.getElementById("hud-settings-btn").onclick = function () { if (typeof goToTab === "function") goToTab("Settings"); };
})();
