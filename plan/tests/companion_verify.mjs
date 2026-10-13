/**
 * Playwright verification for companion.js floating AI companion.
 * Run: /workspace/.venv/bin/node tests/companion_verify.mjs
 */
import { chromium } from "playwright";

const BASE = "http://127.0.0.1:5099";
const results = [];

function record(name, pass, detail = "") {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}: ${name}${detail ? " — " + detail : ""}`);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  await page.addInitScript(() => {
    ["companionChatHistory", "companionMemories", "companionOpen"].forEach(k => localStorage.removeItem(k));
  });

  try {
    let chatBody = null;
    let pollCount = 0;
    await page.route("**/api/companion/history", async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ messages: [], updated_at: null }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true }),
      });
    });
    await page.route("**/api/companion/chat", async (route) => {
      chatBody = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          reply: "Hello from companion test",
          actions: [{ tool: "list_tasks", input: { status: "open" } }],
          steps: ["Listed open tasks"],
        }),
      });
    });
    await page.route("**/api/agent/running", async (route) => {
      pollCount += 1;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ in_flight: false, running_agents: [] }),
      });
    });
    await page.route("**/api/agent/activity/running", async (route) => {
      pollCount += 1;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      });
    });

    await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForSelector("#companion-launcher", { timeout: 15000 });

    const onHome = await page.locator("#companion-launcher").isVisible();
    record("companion launcher visible on Home", onHome);

    await page.waitForFunction(() => typeof goToTab === "function", { timeout: 10000 });
    await page.evaluate(() => goToTab("Tasks"));
    await page.waitForTimeout(600);

    const onTasks = await page.locator("#companion-launcher").isVisible();
    record("companion launcher visible on Tasks", onTasks);

    await page.click("#companion-launcher");
    await page.waitForSelector("#companion-panel:not([hidden])", { timeout: 5000 });

    const voiceSupported = await page.evaluate(() => !!(window.SpeechRecognition || window.webkitSpeechRecognition));
    const micVisible = await page.locator("#companion-mic").isVisible().catch(() => false);
    if (voiceSupported) {
      record("mic button present when SpeechRecognition exists", micVisible);
    } else {
      const micHidden = await page.evaluate(() => {
        const el = document.getElementById("companion-mic");
        return !el || el.hidden || el.classList.contains("companion-mic-hidden");
      });
      record("mic hidden gracefully when voice unsupported", micHidden);
    }

    await page.fill("#companion-input", "What tasks are open?");
    await page.click("#companion-send");
    await page.waitForSelector(".companion-msg-assistant .companion-bubble", { timeout: 10000 });

    const replyText = await page.locator(".companion-msg-assistant .companion-bubble").last().innerText();
    record("assistant reply renders", replyText.includes("Hello from companion test"), replyText.slice(0, 60));

    const whatIDid = await page.locator(".companion-what-i-did").count();
    record("what I did section renders", whatIDid > 0);

    const hasPageContext = !!(chatBody?.message && (
      chatBody.message.includes("[User is on") || chatBody.message.includes("[User context:")
    ));
    record("POST body includes page context prefix", hasPageContext, chatBody?.message?.slice(0, 80) || "");

    await page.waitForTimeout(2500);
    record("running strip polls while panel open", pollCount >= 1, `polls=${pollCount}`);
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
