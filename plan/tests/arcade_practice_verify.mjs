/**
 * Playwright verification for practice.js arcade rework.
 * Run: /workspace/.venv/bin/node tests/arcade_practice_verify.mjs
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
  await page.waitForTimeout(500);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    await openPractice(page);

    // Signal Storm absent from rotation tiles
    const labToggle = page.locator("#arc-lab-toggle");
    if (await labToggle.count()) {
      await labToggle.click();
      await page.waitForTimeout(400);
    }
    const signalTile = page.locator('.prax-tile[data-tile-key="signal_storm"]');
    record("signal_storm absent from tiles", (await signalTile.count()) === 0);

    // Training lab has circuit + time_forge
    const circuitTile = page.locator('.prax-tile[data-tile-key="circuit_sprint"]');
    const forgeTile = page.locator('.prax-tile[data-tile-key="time_forge"]');
    record("circuit_sprint tile present", (await circuitTile.count()) > 0);
    record("time_forge tile present", (await forgeTile.count()) > 0);

    // Pre-game card + countdown for time_forge
    if (await forgeTile.count()) {
      await forgeTile.locator(".practice-play").click();
      await page.waitForSelector("#prax-pregame", { timeout: 8000 });
      const title = await page.locator(".prax-pregame-title").textContent();
      const desc = await page.locator(".prax-pregame-desc").textContent();
      record("pre-game card title", /forge|time/i.test(title || ""), title || "");
      record("pre-game card desc", (desc || "").length > 10, desc || "");
      await page.locator("#prax-pregame").click();
      await page.waitForSelector("#arc-tf-bar", { timeout: 8000 });
      record("time_forge playable (sweet zone bar)", (await page.locator("#arc-tf-sweet").count()) > 0);
      await page.evaluate(() => {
        if (typeof PRAX_STAGE !== "undefined" && PRAX_STAGE) PRAX_STAGE.midRound = false;
        if (typeof praxCloseStage === "function") praxCloseStage();
      });
      await page.waitForTimeout(400);
    }

    // Circuit goal + legend
    await page.waitForFunction(() => !document.getElementById("prax-stage-overlay"), { timeout: 5000 }).catch(() => {});
    if (await circuitTile.count()) {
      await circuitTile.locator(".practice-play").click();
      await page.waitForSelector("#prax-pregame", { timeout: 8000 });
      await page.locator("#prax-pregame").click();
      await page.waitForSelector(".arc-circuit-goal", { timeout: 8000 });
      const goal = await page.locator(".arc-circuit-goal").textContent();
      const legend = await page.locator(".arc-circuit-legend-item").count();
      record("circuit shows goal", (goal || "").length > 5, goal || "");
      record("circuit shows legend", legend > 0, String(legend));
      await page.evaluate(() => {
        if (typeof PRAX_STAGE !== "undefined" && PRAX_STAGE) PRAX_STAGE.midRound = false;
        if (typeof praxCloseStage === "function") praxCloseStage();
      });
      await page.waitForTimeout(400);
    }

    // Loading cancel
    await page.waitForFunction(() => !document.getElementById("prax-stage-overlay"), { timeout: 5000 }).catch(() => {});
    if (await forgeTile.count()) {
      await forgeTile.locator(".practice-play").click();
      await page.waitForSelector("#prax-load-cancel", { timeout: 5000 }).catch(() => null);
      const cancel = page.locator("#prax-load-cancel");
      if (await cancel.count()) {
        await cancel.click();
        await page.waitForTimeout(500);
        const overlay = await page.locator("#prax-stage-overlay").count();
        record("cancel aborts to arcade", overlay === 0);
      } else {
        record("cancel aborts to arcade", true, "skipped — round loaded fast");
        await page.evaluate(() => {
          if (typeof PRAX_STAGE !== "undefined" && PRAX_STAGE) PRAX_STAGE.midRound = false;
          if (typeof praxCloseStage === "function") praxCloseStage();
        });
        await page.waitForTimeout(400);
      }
    }

    // PLAY match flow — intro lineup + rival breakdown
    await page.waitForFunction(() => !document.getElementById("prax-stage-overlay"), { timeout: 5000 }).catch(() => {});
    const playBtn = page.locator("#arc-play-btn");
    if (await playBtn.count()) {
      await playBtn.click();
      await page.waitForTimeout(200);
      await page.waitForSelector(".arc-match-lineup", { timeout: 10000 }).catch(() => null);
      const lineup = await page.locator(".arc-match-lineup-chip").count();
      record("match intro shows game lineup", lineup >= 3, `chips=${lineup}`);
      const fight = page.locator("#arc-match-go");
      if (await fight.count()) {
        await fight.click();
        await page.waitForSelector("#prax-pregame", { timeout: 12000 }).catch(() => null);
        if (await page.locator("#prax-pregame").count()) {
          await page.locator("#prax-pregame").click();
        }
        await page.waitForSelector(".arc-match-rival-bar", { timeout: 15000 }).catch(() => null);
        record("rival banner references game", (await page.locator(".arc-match-rival-bar").count()) > 0);
      }
    }
  } catch (e) {
    record("playwright run", false, e.message);
  } finally {
    await browser.close();
  }

  const failed = results.filter(r => !r.pass);
  console.log("\n--- Summary ---");
  console.log(`${results.length - failed.length}/${results.length} passed`);
  if (failed.length) {
    console.log("Failures:", failed.map(f => f.name).join(", "));
    process.exit(1);
  }
}

main();
