/**
 * Playwright verification for multi-file attachment inputs.
 * Run: /workspace/.venv/bin/node tests/multi_attach_verify.mjs
 */
import { chromium } from "playwright";
import fs from "fs";
import os from "os";
import path from "path";

const BASE = "http://127.0.0.1:5099";
const results = [];
const createdAttachmentIds = [];

function record(name, pass, detail = "") {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}: ${name}${detail ? " — " + detail : ""}`);
}

function writeTempFiles() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wp-multi-attach-"));
  const a = path.join(dir, "attach-a.txt");
  const b = path.join(dir, "attach-b.txt");
  fs.writeFileSync(a, "tiny test file A\n");
  fs.writeFileSync(b, "tiny test file B\n");
  return { dir, files: [a, b] };
}

async function openAgent(page) {
  await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForFunction(() => typeof navigateToTab === "function", { timeout: 15000 });
  await page.evaluate(() => navigateToTab("Agent"));
  await page.waitForSelector("#agent-file-input", { state: "attached", timeout: 15000 });
}

async function openTaskAttachments(page) {
  await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForFunction(() => typeof navigateToTab === "function", { timeout: 15000 });
  await page.evaluate(() => navigateToTab("Tasks"));
  await page.waitForSelector(".task-edit-toggle", { timeout: 15000 });
  await page.click(".task-edit-toggle");
  await page.waitForSelector('[id^="task-attachment-input-"]', { state: "attached", timeout: 15000 });
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const { dir, files } = writeTempFiles();

  page.on("dialog", async d => { await d.dismiss(); });

  try {
    await openAgent(page);

    const agentMultiple = await page.$eval("#agent-file-input", el => el.hasAttribute("multiple"));
    record("agent file input has multiple", agentMultiple);

    let agentPostCount = 0;
    await page.route("**/api/attachments", async route => {
      if (route.request().method() === "POST") agentPostCount += 1;
      await route.continue();
    });

    await page.setInputFiles("#agent-file-input", files);
    await page.waitForTimeout(200);
    const chipCount = await page.locator("#agent-file-chips .agc-file-chip").count();
    record("agent shows 2 file chips after picker", chipCount === 2, `chips=${chipCount}`);

    await page.fill("#agent-input", "ZZTEST multi attach verify");
    await page.click("#agent-send");
    await page.waitForTimeout(2500);
    record("agent send triggered 2 attachment POSTs", agentPostCount === 2, `posts=${agentPostCount}`);

    const uploadedIds = await page.evaluate(async () => {
      const res = await fetch("/api/attachments?entity_type=agent_message&entity_id=0");
      const list = await res.json();
      return (Array.isArray(list) ? list : [])
        .filter(f => /attach-[ab]\.txt$/i.test(f.filename))
        .map(f => f.id);
    });
    createdAttachmentIds.push(...uploadedIds);
    record("agent uploaded attachments visible via API", uploadedIds.length >= 2, `ids=${uploadedIds.join(",")}`);

    await openTaskAttachments(page);
    const taskMultiple = await page.$eval('[id^="task-attachment-input-"]', el => el.hasAttribute("multiple"));
    record("task attachment input has multiple", taskMultiple);

    await browser.close();

    for (const id of createdAttachmentIds) {
      try {
        const res = await fetch(`${BASE}/api/attachments/${id}`, { method: "DELETE" });
        if (!res.ok) console.warn(`cleanup DELETE ${id} -> ${res.status}`);
      } catch (e) {
        console.warn(`cleanup failed for ${id}: ${e.message}`);
      }
    }
    fs.rmSync(dir, { recursive: true, force: true });

    const failed = results.filter(r => !r.pass);
    console.log(`\n${results.length - failed.length}/${results.length} passed`);
    process.exit(failed.length ? 1 : 0);
  } catch (e) {
    console.error(e);
    await browser.close();
    fs.rmSync(dir, { recursive: true, force: true });
    process.exit(1);
  }
}

main();
