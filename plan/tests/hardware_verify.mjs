/**
 * Hardware practice verification — Loop 2
 * Run: node tests/hardware_verify.mjs
 */
import { chromium } from "playwright";

const BASE = "http://127.0.0.1:5099";
const results = [];

function record(name, pass, detail = "") {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}: ${name}${detail ? " — " + detail : ""}`);
}

async function openPractice(page) {
  await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForFunction(() => typeof navigateToTab === "function", { timeout: 15000 });
  await page.evaluate(() => navigateToTab("Practice"));
  await page.waitForSelector("#arc-play-btn, .arc-hub", { timeout: 15000 });
  await page.waitForTimeout(400);
}

async function openHardwareLab(page) {
  const labToggle = page.locator("#arc-lab-toggle");
  if (await labToggle.count()) {
    await labToggle.click();
    await page.waitForTimeout(300);
  }
  const hwTile = page.locator('.prax-tile[data-tile-key="hardware"]');
  record("hardware tile in lab", (await hwTile.count()) > 0);
  if (!(await hwTile.count())) return false;
  await hwTile.locator(".practice-play").click();
  await page.waitForSelector(".hw-mode-picker, #prax-pregame", { timeout: 10000 });
  const picker = page.locator(".hw-mode-picker");
  if (await picker.count()) {
    record("hardware mode picker", true);
    await page.locator('.hw-mode-chip[data-mode-key="ohm_sprint"]').click({ force: true });
  }
  await page.waitForSelector("#prax-pregame", { timeout: 10000 });
  await page.locator("#prax-pregame").click();
  await page.waitForSelector(".prax-hw-track, .prax-game-prompt, .stub", { timeout: 12000 });
  return true;
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    await openPractice(page);
    if (!(await openHardwareLab(page))) return;

    // Track continuum visible
    const track = await page.locator(".prax-hw-track").count();
    record("hardware track continuum", track > 0);

    // Question UI has interactive element
    const hasMcq = (await page.locator(".hw-opt").count()) > 0;
    const hasNumeric = (await page.locator("#hw-answer").count()) > 0;
    const hasOrder = (await page.locator(".hw-step").count()) > 0;
    record("question UI rendered", hasMcq || hasNumeric || hasOrder,
      `mcq=${hasMcq} num=${hasNumeric} order=${hasOrder}`);

    // MCQ must not have empty options container
    if (hasMcq) {
      const optCount = await page.locator(".hw-opt").count();
      record("mcq has options", optCount >= 2, `count=${optCount}`);
    }

    // Truth table if present
    const truth = await page.locator(".prax-hw-truth").count();
    if (truth) record("truth table renders", truth > 0);

    // Fraction answer parsing
    const fracParse = await page.evaluate(() => ({
      half: hwParseNumericAnswer("5/8"),
      dec: hwParseNumericAnswer("0.625"),
    }));
    record("fraction parse 5/8", Math.abs(fracParse.half - 0.625) < 0.001, JSON.stringify(fracParse));

    // Simulate winning round via JS (auto-answer all questions)
    const winResult = await page.evaluate(async () => {
      localStorage.setItem("hardwareTrackLevel", "0");
      localStorage.setItem("hardwareStageClears", "0");
      if (typeof PRAX_STAGE !== "undefined" && PRAX_STAGE) {
        PRAX_STAGE.midRound = false;
        if (typeof praxCloseStage === "function") praxCloseStage();
      }
      const area = document.getElementById("practice-play-area");
      if (!area || typeof renderHardwareGame !== "function") return { error: "no renderHardwareGame" };
      praxOpenStage("hardware", 3);
      const stage = PRAX_STAGE.body;
      const round = {
        stage: "Ohm", stage_index: 0,
        teaching_point: "Ohm's law: V = I·R.",
        time_per_question: 30,
        questions: [
          { type: "numeric", prompt: "2+2?", answer: 4, unit: "", tolerance: 0.5 },
          { type: "numeric", prompt: "3+3?", answer: 6, unit: "", tolerance: 0.5 },
        ],
      };
      // Patch finish to capture teaching point + stage clear
      let captured = {};
      const origSubmit = submitPracticeResult;
      window.__hwCaptured = captured;
      window.submitPracticeResult = async (key, diff, score, max, details, ar, msg, stats) => {
        captured = { key, score, max, msg, stats };
        window.__hwCaptured = captured;
        PRAX_STAGE.body.innerHTML = `<div id="hw-test-done">${msg}|${stats?.teachingPoint || ""}|${stats?.stageClear || ""}</div>`;
      };
      renderHardwareGame(stage, 3, round);
      // Auto-answer loop
      for (let i = 0; i < 20; i++) {
        await new Promise(r => setTimeout(r, 80));
        const q = round.questions[0];
        if (!document.querySelector(".prax-game-prompt")) break;
        const mcq = document.querySelector(".hw-opt");
        if (mcq) { mcq.click(); continue; }
        const inp = document.getElementById("hw-answer");
        if (inp) {
          const idx = round.questions.findIndex((_, qi) => qi >= 0);
          const cur = round.questions[Math.min(i, round.questions.length - 1)];
          if (cur?.type === "numeric") inp.value = cur.answer;
          document.getElementById("hw-submit")?.click();
          continue;
        }
        const steps = document.querySelectorAll(".hw-step");
        if (steps.length) {
          steps.forEach(s => s.click());
          document.getElementById("hw-order-submit")?.click();
          continue;
        }
        break;
      }
      await new Promise(r => setTimeout(r, 3000));
      window.submitPracticeResult = origSubmit;
      const done = document.getElementById("hw-test-done");
      return {
        doneText: done?.textContent || "",
        captured: window.__hwCaptured,
        teachingInRound: round.teaching_point || "",
      };
    });
    record("simulated round completes", !!(winResult.doneText), winResult.doneText?.slice(0, 80) || winResult.error || "");
    record("teaching_point passed to result", !!(winResult.captured?.stats?.teachingPoint),
      winResult.captured?.stats?.teachingPoint?.slice(0, 60) || "missing");
    record("stage clear passed to result stats", /cleared/i.test(winResult.captured?.stats?.stageClear || ""),
      winResult.captured?.stats?.stageClear || "");

    // API round normalization
    const apiNorm = await page.evaluate(async () => {
      const sample = {
        format: "ordering",
        question: "Order chain",
        items: ["Motor", "Sensor", "ADC"],
        answer: ["Sensor", "ADC", "Motor"],
        stage: 7,
        stage_label: "Robot signal chain",
        teaching_point: "Order the path",
      };
      const norm = hwNormalizeApiRound(sample, 5);
      const q = norm?.questions?.[0];
      return {
        ok: !!(norm && q?.type === "order_steps" && (q.steps || []).length >= 3),
        qType: q?.type,
        qCount: norm?.questions?.length,
        teaching: norm?.teaching_point,
      };
    });
    record("API ordering normalizes", apiNorm.ok, JSON.stringify(apiNorm));

    // Empty MCQ guard
    const emptyMcq = await page.evaluate(() => {
      const q = hwNormalizeApiQuestion({ format: "multiple_choice", question: "?", options: [], answer: "x" });
      return { q };
    });
    record("empty API options rejected", emptyMcq.q === null, JSON.stringify(emptyMcq));

    // Timer null safety
    const timerSafe = await page.evaluate(() => {
      try {
        praxOpenStage("hardware", 1);
        PRAX_STAGE.comboEl = null;
        praxUpdateCombo(true);
        praxClearRoundTimer();
        praxStartRoundTimer(0, () => {});
        praxCloseStage();
        return true;
      } catch (e) {
        return false;
      }
    });
    record("timer/combo null-safe", timerSafe);

    await page.evaluate(() => {
      if (typeof PRAX_STAGE !== "undefined" && PRAX_STAGE) {
        PRAX_STAGE.midRound = false;
        if (typeof praxCloseStage === "function") praxCloseStage();
      }
    });
  } catch (e) {
    record("playwright run", false, e.message);
  } finally {
    await browser.close();
  }

  const failed = results.filter(r => !r.pass);
  console.log("\n--- Summary ---");
  console.log(`${results.length - failed.length}/${results.length} passed`);
  if (failed.length) {
    console.log("Failures:", failed.map(f => `${f.name}: ${f.detail}`).join("\n"));
    process.exit(1);
  }
}

main();
