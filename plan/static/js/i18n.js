// Waypoint i18n — English + French for high-traffic UI strings.
(function (global) {
  const STORAGE_KEY = "waypoint_lang";
  const SUPPORTED = ["en", "fr"];

  const dict = {
    en: {
      "lang.en": "English",
      "lang.fr": "Français",
      "settings.language": "Language",
      "settings.mathTip": "Agent & Companion understand math: LaTeX (\\frac{a}{b}, \\sqrt{x}, x^2), unicode (× ÷ √ ² ½), and inline fractions like 3/4. Write formulas naturally — no special mode needed.",

      "hud.home": "Home",
      "hud.back": "Back",
      "hud.forward": "Forward",
      "hud.chooseWorld": "Choose your world",
      "hud.now": "Now",
      "hud.focusPrimary": "Focus primary action",
      "hud.statusExpand": "Status — click to expand",
      "hud.tokens": "Token usage",
      "hud.tokensLabel": "— tokens",
      "hud.budget": "Daily budget — open Settings",
      "hud.coins": "Practice coins",
      "hud.trophies": "Arcade trophies",
      "hud.streak": "Practice streak",
      "hud.calm": "Calm mode active",
      "hud.calmShort": "Calm",
      "hud.agent": "Agent",
      "hud.agentStatus": "Agent status",
      "hud.agentChecking": "Agent status: checking...",
      "hud.settings": "Settings",
      "hud.commandCenter": "Command center",
      "hud.automationStudio": "Automation Studio",
      "hud.pomodoro": "Pomodoro timer",
      "hud.jumpAgent": "Jump to Agent",

      "greeting.morning": "Good morning",
      "greeting.afternoon": "Good afternoon",
      "greeting.evening": "Good evening",
      "launcher.subtitle": "Choose a world — search or tap a tile to launch.",
      "launcher.searchPlaceholder": "Search apps…",
      "launcher.searchAria": "Search apps",
      "launcher.myApps": "My apps",
      "launcher.apps": "Apps",

      "nav.tabs": "Tabs",

      "tab.Agent": "Agent",
      "tab.Hub": "Hub",
      "tab.Today": "Today",
      "tab.Tasks": "Tasks",
      "tab.Goals": "Goals",
      "tab.Calendar": "Calendar",
      "tab.Events": "Events",
      "tab.Trends": "Trends",
      "tab.Ideas": "Ideas",
      "tab.Skills": "Skills",
      "tab.Problems": "Problems",
      "tab.Thinking": "Thinking",
      "tab.Funny": "Funny",
      "tab.Essays": "Essays",
      "tab.Repository": "Repository",
      "tab.Projects": "Projects",
      "tab.Competitions": "Competitions",
      "tab.Code": "Code",
      "tab.Practice": "Practice",
      "tab.Parallel": "Parallel",
      "tab.Customers": "Customers",
      "tab.Contacts": "Contacts",
      "tab.Team": "Team",
      "tab.About": "About",
      "tab.Settings": "Settings",
      "tab.Prompts": "Prompts",
      "tab.Obsidian": "Notes",
      "tab.Home": "Home",

      "app.agent": "Agent",
      "app.hub": "Hub",
      "app.planner": "Planner",
      "app.capture": "Capture",
      "app.studio": "Studio",
      "app.blueprint": "Blueprint",
      "app.arcade": "Arcade",
      "app.parallel": "Parallel",
      "app.people": "People",
      "app.system": "System",

      "group.Plan": "Plan",
      "group.Capture": "Capture",
      "group.Work": "Work",
      "group.Play": "Play",
      "group.People": "People",
      "group.System": "System",

      "intent.home": "Choose your world",
      "intent.agent": "Command the system in language, not clicks",
      "intent.hub": "Your command deck — save links for later, pin your apps and sites, glance at today",
      "intent.today": "Make today legible hour by hour",
      "intent.tasks": "Turn pressure into one ordered next action",
      "intent.settings": "Govern models, money, data, and integrations",

      "btn.save": "Save",
      "btn.cancel": "Cancel",
      "btn.delete": "Delete",
      "btn.edit": "Edit",
      "btn.add": "Add",
      "btn.close": "Close",
      "btn.search": "Search",
      "btn.send": "Send",
      "btn.connect": "Connect",
      "btn.backup": "Backup now",
      "btn.stop": "Stop",
      "btn.loading": "Loading...",
      "btn.saved": "Saved",
      "btn.appearance": "Appearance",
      "btn.density": "Density",
      "btn.motion": "Motion",
      "btn.contrast": "Contrast",
      "btn.comfortable": "Comfortable",
      "btn.compact": "Compact",
      "btn.full": "Full",
      "btn.reduced": "Reduced",
      "btn.standard": "Standard",
      "btn.highContrast": "High contrast",
      "btn.themeDark": "Switch to dark",
      "btn.themeLight": "Switch to light",

      "common.enabled": "enabled",
      "common.disabled": "disabled",
      "common.off": "off",
      "common.on": "on",
      "common.yes": "Yes",
      "common.no": "No",
    },
    fr: {
      "lang.en": "English",
      "lang.fr": "Français",
      "settings.language": "Langue",
      "settings.mathTip": "Agent et Companion comprennent les maths : LaTeX (\\frac{a}{b}, \\sqrt{x}, x^2), unicode (× ÷ √ ² ½) et fractions comme 3/4. Écrivez les formules naturellement — aucun mode spécial requis.",

      "hud.home": "Accueil",
      "hud.back": "Retour",
      "hud.forward": "Avancer",
      "hud.chooseWorld": "Choisissez votre monde",
      "hud.now": "Maintenant",
      "hud.focusPrimary": "Action principale",
      "hud.statusExpand": "Statut — cliquer pour développer",
      "hud.tokens": "Utilisation des jetons",
      "hud.tokensLabel": "— jetons",
      "hud.budget": "Budget journalier — ouvrir Paramètres",
      "hud.coins": "Pièces d'entraînement",
      "hud.trophies": "Trophées arcade",
      "hud.streak": "Série d'entraînement",
      "hud.calm": "Mode calme actif",
      "hud.calmShort": "Calme",
      "hud.agent": "Agent",
      "hud.agentStatus": "Statut de l'agent",
      "hud.agentChecking": "Statut agent : vérification...",
      "hud.settings": "Paramètres",
      "hud.commandCenter": "Palette de commandes",
      "hud.automationStudio": "Studio d'automatisation",
      "hud.pomodoro": "Minuteur Pomodoro",
      "hud.jumpAgent": "Aller à l'Agent",

      "greeting.morning": "Bonjour",
      "greeting.afternoon": "Bon après-midi",
      "greeting.evening": "Bonsoir",
      "launcher.subtitle": "Choisissez un monde — cherchez ou touchez une tuile pour lancer.",
      "launcher.searchPlaceholder": "Rechercher des apps…",
      "launcher.searchAria": "Rechercher des apps",
      "launcher.myApps": "Mes apps",
      "launcher.apps": "Applis",

      "nav.tabs": "Onglets",

      "tab.Agent": "Agent",
      "tab.Hub": "Hub",
      "tab.Today": "Aujourd'hui",
      "tab.Tasks": "Tâches",
      "tab.Goals": "Objectifs",
      "tab.Calendar": "Calendrier",
      "tab.Events": "Événements",
      "tab.Trends": "Tendances",
      "tab.Ideas": "Idées",
      "tab.Skills": "Compétences",
      "tab.Problems": "Problèmes",
      "tab.Thinking": "Réflexions",
      "tab.Funny": "Humour",
      "tab.Essays": "Essais",
      "tab.Repository": "Fichiers",
      "tab.Projects": "Projets",
      "tab.Competitions": "Compétitions",
      "tab.Code": "Code",
      "tab.Practice": "Entraînement",
      "tab.Parallel": "Parallèle",
      "tab.Customers": "Clients",
      "tab.Contacts": "Contacts",
      "tab.Team": "Équipe",
      "tab.About": "À propos",
      "tab.Settings": "Paramètres",
      "tab.Prompts": "Invites",
      "tab.Obsidian": "Notes",
      "tab.Home": "Accueil",

      "app.agent": "Agent",
      "app.hub": "Hub",
      "app.planner": "Planificateur",
      "app.capture": "Capture",
      "app.studio": "Studio",
      "app.blueprint": "Blueprint",
      "app.arcade": "Arcade",
      "app.parallel": "Parallèle",
      "app.people": "Contacts",
      "app.system": "Système",

      "group.Plan": "Plan",
      "group.Capture": "Capture",
      "group.Work": "Travail",
      "group.Play": "Jeu",
      "group.People": "Contacts",
      "group.System": "Système",

      "intent.home": "Choisissez votre monde",
      "intent.agent": "Commandez le système en langage, pas en clics",
      "intent.hub": "Votre poste de commande — liens, apps épinglées, aperçu du jour",
      "intent.today": "Rendre la journée lisible heure par heure",
      "intent.tasks": "Transformer la pression en une prochaine action ordonnée",
      "intent.settings": "Gérer modèles, budget, données et intégrations",

      "btn.save": "Enregistrer",
      "btn.cancel": "Annuler",
      "btn.delete": "Supprimer",
      "btn.edit": "Modifier",
      "btn.add": "Ajouter",
      "btn.close": "Fermer",
      "btn.search": "Rechercher",
      "btn.send": "Envoyer",
      "btn.connect": "Connecter",
      "btn.backup": "Sauvegarder",
      "btn.stop": "Arrêter",
      "btn.loading": "Chargement...",
      "btn.saved": "Enregistré",
      "btn.appearance": "Apparence",
      "btn.density": "Densité",
      "btn.motion": "Mouvement",
      "btn.contrast": "Contraste",
      "btn.comfortable": "Confortable",
      "btn.compact": "Compact",
      "btn.full": "Complet",
      "btn.reduced": "Réduit",
      "btn.standard": "Standard",
      "btn.highContrast": "Contraste élevé",
      "btn.themeDark": "Passer au sombre",
      "btn.themeLight": "Passer au clair",

      "common.enabled": "activé",
      "common.disabled": "désactivé",
      "common.off": "désactivé",
      "common.on": "activé",
      "common.yes": "Oui",
      "common.no": "Non",
    },
  };

  let currentLang = "en";

  function normalizeLang(code) {
    const c = String(code || "en").toLowerCase().slice(0, 2);
    return SUPPORTED.includes(c) ? c : "en";
  }

  function readStoredLang() {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch (_) {
      return null;
    }
  }

  function getLang() {
    return currentLang;
  }

  function t(key, vars) {
    const pack = dict[currentLang] || dict.en;
    let text = pack[key];
    if (text == null) text = dict.en[key];
    if (text == null) return key;
    if (vars && typeof vars === "object") {
      Object.keys(vars).forEach(k => {
        text = text.replace(new RegExp(`\\{${k}\\}`, "g"), String(vars[k]));
      });
    }
    return text;
  }

  function applyI18n(root) {
    const scope = root && root.querySelectorAll ? root : document;
    scope.querySelectorAll("[data-i18n]").forEach(el => {
      const key = el.getAttribute("data-i18n");
      if (key) el.textContent = t(key);
    });
    scope.querySelectorAll("[data-i18n-placeholder]").forEach(el => {
      const key = el.getAttribute("data-i18n-placeholder");
      if (key) el.placeholder = t(key);
    });
    scope.querySelectorAll("[data-i18n-title]").forEach(el => {
      const key = el.getAttribute("data-i18n-title");
      if (key) el.title = t(key);
    });
    scope.querySelectorAll("[data-i18n-aria]").forEach(el => {
      const key = el.getAttribute("data-i18n-aria");
      if (key) el.setAttribute("aria-label", t(key));
    });
    scope.querySelectorAll("[data-i18n-label]").forEach(el => {
      const key = el.getAttribute("data-i18n-label");
      if (key) el.textContent = t(key);
    });
    const nowKicker = document.querySelector(".hud-now-focus-kicker");
    if (nowKicker) nowKicker.textContent = t("hud.now");
    const agentChip = document.getElementById("hud-agent-chip");
    if (agentChip && !agentChip.dataset.i18nSkip) agentChip.textContent = t("hud.agent");
    const calmPill = document.getElementById("hud-calm-pill");
    if (calmPill) calmPill.textContent = t("hud.calmShort");
    const tokensLabel = document.getElementById("hud-tokens-label");
    if (tokensLabel && tokensLabel.textContent.trim().startsWith("—")) {
      tokensLabel.textContent = t("hud.tokensLabel");
    }
    const globalStatus = document.getElementById("global-agent-status");
    if (globalStatus && /checking/i.test(globalStatus.textContent)) {
      globalStatus.textContent = t("hud.agentChecking");
    }
    return scope;
  }

  function syncLangToServer(lang) {
    try {
      if (typeof global.api !== "function") return;
      global.api("/api/about", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ waypoint_lang: lang }),
      }).catch(() => {});
    } catch (_) {}
  }

  function setLang(code) {
    currentLang = normalizeLang(code);
    try {
      localStorage.setItem(STORAGE_KEY, currentLang);
    } catch (_) {}
    document.documentElement.lang = currentLang;
    syncLangToServer(currentLang);
    applyI18n();
    try {
      global.dispatchEvent(new CustomEvent("waypoint:langchange", { detail: { lang: currentLang } }));
    } catch (_) {}
    if (typeof global.updateHudContext === "function") global.updateHudContext();
    if (typeof global.renderNav === "function") global.renderNav();
    if (typeof global.render === "function" && typeof global.ACTIVE_TAB !== "undefined" && global.ACTIVE_TAB === "Home") {
      global.render();
    }
  }

  function initI18n() {
    currentLang = normalizeLang(readStoredLang() || document.documentElement.lang || "en");
    document.documentElement.lang = currentLang;
    syncLangToServer(currentLang);
    applyI18n();
  }

  global.t = t;
  global.getLang = getLang;
  global.setLang = setLang;
  global.applyI18n = applyI18n;
  global.initI18n = initI18n;
  global.WAYPOINT_MATH_HINT = () => t("settings.mathTip");

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initI18n);
  } else {
    initI18n();
  }
})(typeof window !== "undefined" ? window : globalThis);
