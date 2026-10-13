/**
 * Playwright verification for today.js quiet autosave + split-hour layout.
 * Run: /workspace/.venv/bin/node tests/today_autosave_verify.mjs
 */
import { chromium } from "playwright";

const BASE = "http://127.0.0.1:5099";
const results = [];

function record(name, pass, detail = "") {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}: ${name}${detail ? " — " + detail : ""}`);
}

async function openToday(page) {
  await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForFunction(() => typeof navigateToTab === "function", { timeout: 15000 });
  await page.evaluate(() => {
    const today = localYmd();
    localStorage.setItem("ritualDate", today);
  });
  await page.evaluate(() => navigateToTab("Today"));
  await page.waitForSelector("#tdy-canvas-wrap .tdy-hour-cell", { timeout: 15000 });
  await page.waitForSelector(".tdy-cat-chip[data-cat]", { timeout: 15000 });
  await page.waitForTimeout(400);
}

async function paintHour(page, hour, catKey) {
  await page.evaluate(({ hour, catKey }) => {
    armCategory(catKey);
    applyPaintRangeToCells(hour, hour, catKey);
  }, { hour, catKey });
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  let dialogSeen = false;
  page.on("dialog", async d => {
    dialogSeen = true;
    await d.dismiss();
  });

  try {
    await openToday(page);

    const today = await page.evaluate(() => CURRENT_DATE);
    const cats = await page.evaluate(() => CONFIG.categories.map(c => c.key));
    const catA = cats[0];
    const catB = cats[1] || cats[0];

    // Clear today's hours via API for a clean slate
    await page.evaluate(async ({ date }) => {
      await fetch(`/api/day/${date}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ metrics: { notes: "" }, hours: {}, quiet: true }),
      });
    }, { date: today });
    await page.evaluate(() => render());

    // Paint 2 hours
    await paintHour(page, 9, catA);
    await paintHour(page, 10, catA);
    await page.waitForTimeout(2800);

    const beforeSwitch = await page.evaluate(async ({ date }) => {
      const res = await fetch(`/api/day/${date}`);
      return res.json();
    }, { date: today });
    const paintedBefore = Object.values(beforeSwitch.hours || {}).filter(h => h && h.category).length;
    record("quiet autosave persisted painted hours", paintedBefore >= 2, `painted=${paintedBefore}`);

    dialogSeen = false;
    await page.click('.pln-mode-chip[data-tab="Tasks"]');
    await page.waitForTimeout(800);
    record("no confirm dialog on tab switch", !dialogSeen);

    await page.click('.pln-mode-chip[data-tab="Today"]');
    await page.waitForSelector("#tdy-canvas-wrap .tdy-hour-cell", { timeout: 15000 });
    await page.waitForTimeout(500);

    const afterReturn = await page.evaluate(async ({ date }) => {
      const res = await fetch(`/api/day/${date}`);
      return res.json();
    }, { date: today });
    const h9 = afterReturn.hours?.[9] || afterReturn.hours?.["9"];
    const h10 = afterReturn.hours?.[10] || afterReturn.hours?.["10"];
    record("server still has hour 9 after tab return", !!h9?.category, h9?.category || "");
    record("server still has hour 10 after tab return", !!h10?.category, h10?.category || "");

    const paintedCells = await page.locator(".tdy-hour-cell.tdy-hour-painted").count();
    record("UI shows painted hours after return", paintedCells >= 2, String(paintedCells));

    // quiet:true does not create receipts
    const receiptsBefore = await page.evaluate(async () => {
      const res = await fetch("/api/receipts?limit=500");
      const data = await res.json();
      return Array.isArray(data) ? data.length : (data.receipts || []).length;
    });
    await page.evaluate(async ({ date, catA }) => {
      await fetch(`/api/day/${date}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quiet: true,
          metrics: { notes: "autosave test" },
          hours: { 11: { category: catA, note: "" } },
        }),
      });
    }, { date: today, catA });
    const receiptsAfterQuiet = await page.evaluate(async () => {
      const res = await fetch("/api/receipts?limit=500");
      const data = await res.json();
      return Array.isArray(data) ? data.length : (data.receipts || []).length;
    });
    record("quiet save does not add receipts", receiptsAfterQuiet === receiptsBefore, `${receiptsBefore} -> ${receiptsAfterQuiet}`);

    const receiptsBeforeFull = receiptsAfterQuiet;
    await page.click("#save-day");
    await page.waitForFunction(
      () => document.getElementById("save-day") && !document.getElementById("save-day").disabled,
      { timeout: 15000 },
    );
    const receiptsAfterFull = await page.evaluate(async () => {
      const res = await fetch("/api/receipts?limit=500");
      const data = await res.json();
      return Array.isArray(data) ? data.length : (data.receipts || []).length;
    });
    record("full save adds receipt", receiptsAfterFull > receiptsBeforeFull, `${receiptsBeforeFull} -> ${receiptsAfterFull}`);

    // Split hour shows top/bottom gradient (180deg)
    await paintHour(page, 12, catA);
    await page.waitForTimeout(300);
    const cell = page.locator('.tdy-hour-cell[data-hour="12"]');
    await page.evaluate((hour) => {
      const anchor = document.querySelector(`.tdy-hour-cell[data-hour="${hour}"]`);
      showSplitPopover(hour, anchor);
    }, 12);
    await page.waitForSelector("#tdy-split-popover", { timeout: 5000 });
    await page.selectOption("#tdy-split-a", catA);
    await page.selectOption("#tdy-split-b", catB);
    const previewLayout = await page.locator("#tdy-split-preview").evaluate(el => getComputedStyle(el).flexDirection);
    record("split popover preview uses top/bottom halves", previewLayout === "column", previewLayout);
    await page.click("#tdy-split-save");
    await page.waitForTimeout(300);
    const cellStyle = await cell.evaluate(el => el.getAttribute("style") || "");
    record("split hour cell uses vertical gradient", /to bottom|180deg/i.test(cellStyle), cellStyle.slice(0, 80));
  } catch (e) {
    record("playwright run", false, e.message);
  } finally {
    await browser.close();
  }

  const failed = results.filter(r => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length ? 1 : 0);
}

main();
