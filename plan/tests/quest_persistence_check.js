// Accepting a quest must survive logging in again.
//
// The bug: gameAvailableQuestKeys re-rolled the day's rotation whenever any cached key became
// INELIGIBLE, and eligibility depends on live app state (do you have overdue tasks, someone to
// talk to), so it flips between sessions. gameEnsureQuestState then filtered `selected` against
// the freshly rolled keys and dropped every accepted quest that was not among them, so the
// accept prompt came back every time.
//
// This loads the real functions out of static/js/misc.js rather than reimplementing them.
const fs = require("fs");
const path = require("path");

const MISC = path.join(__dirname, "..", "static", "js", "misc.js");
const src = fs.readFileSync(MISC, "utf8");

function grab(name) {
  const i = src.indexOf("function " + name + "(");
  if (i < 0) throw new Error("function not found in misc.js: " + name);
  let depth = 0, started = false;
  for (let j = i; j < src.length; j++) {
    if (src[j] === "{") { depth++; started = true; }
    else if (src[j] === "}") { depth--; if (started && depth === 0) return src.slice(i, j + 1); }
  }
  throw new Error("unbalanced braces reading " + name);
}

const store = {};
globalThis.localStorage = {
  getItem: k => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
};
globalThis.GAME_QUEST_ROTATION_KEY = "gameQuestRotationV2";
globalThis.GAME_QUEST_POOL = {
  paint6: { target: 6 }, pulse2: { target: 2 }, tasks3: { target: 3 },
  overdue1: { target: 1 }, capture3: { target: 3 }, match1: { target: 1 }, talk1: { target: 1 },
};
let eligible = new Set(Object.keys(globalThis.GAME_QUEST_POOL));
globalThis.gameQuestEligible = k => eligible.has(k);
globalThis.gameQuestSelectionLimit = () => 3;
globalThis.localYmd = () => "2026-09-15";
globalThis.gameReadJson = (k, d) => {
  try { const v = JSON.parse(localStorage.getItem(k)); return v === null ? d : v; } catch (_) { return d; }
};
globalThis.gameWriteJson = (k, v) => localStorage.setItem(k, JSON.stringify(v));

// A re-roll must yield a DIFFERENT five, otherwise the test could pass by luck.
let rolls = 0;
globalThis.gameSelectDailyQuests = (date, n) => {
  rolls++;
  const first = ["pulse2", "match1", "overdue1", "tasks3", "capture3"];
  const second = ["paint6", "talk1", "match1", "pulse2", "tasks3"];
  return (rolls === 1 ? first : second).slice(0, n);
};

eval(grab("gameAvailableQuestKeys"));
eval(grab("gameSaveQuestState"));
eval(grab("gameEnsureQuestState"));

const failures = [];

// Session one: rotation is created and two quests are accepted.
gameEnsureQuestState();
const first = JSON.parse(localStorage.getItem("gameQuests"));
first.selected = ["overdue1", "capture3"];
gameSaveQuestState(first);

// Capture the rotation the day settled on. Which five it picked does not matter; that it is
// STABLE across sessions does. (The first roll is consumed generating the initial selection,
// so hardcoding an expected list here would only test the harness.)
const rotationBefore = localStorage.getItem("gameQuestRotationV2");

// Between sessions one of them stops being eligible.
eligible.delete("capture3");

// Session two: logging back in.
const after = gameEnsureQuestState();
for (const key of ["overdue1", "capture3"]) {
  if (!after.selected.includes(key)) {
    failures.push(`accepted quest "${key}" was lost on the second login`);
  }
}

// The rotation itself must be stable for the day, not re-rolled on an eligibility change.
const rotationAfter = localStorage.getItem("gameQuestRotationV2");
if (rotationAfter !== rotationBefore) {
  failures.push("today's rotation was re-rolled: " + rotationBefore + " -> " + rotationAfter);
}

if (failures.length) {
  for (const f of failures) console.error("FAIL: " + f);
  process.exit(1);
}
console.log("ok: quest acceptance and rotation survive a second login");
