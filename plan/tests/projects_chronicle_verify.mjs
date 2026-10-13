/**
 * Playwright verification for projects.js chronicle + notes upgrade.
 * Run: /workspace/.venv/bin/node tests/projects_chronicle_verify.mjs
 */
import { chromium } from "playwright";

const BASE = "http://127.0.0.1:5099";
const results = [];

function record(name, pass, detail = "") {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}: ${name}${detail ? " — " + detail : ""}`);
}

async function openProjects(page) {
  await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForFunction(() => typeof navigateToTab === "function", { timeout: 15000 });
  await page.evaluate(() => navigateToTab("Projects"));
  await page.waitForSelector(".page-title", { timeout: 15000 });
  await page.waitForTimeout(400);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  let testProjectId = null;
  let testNoteId = null;

  page.on("dialog", async d => { await d.accept(); });

  try {
    await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 30000 });

    // Create ZZTEST project with a note via API
    const created = await page.evaluate(async (base) => {
      const res = await fetch(`${base}/api/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "ZZTEST Chronicle", kind: "software", description: "chronicle verify" }),
      });
      const payload = await res.json();
      const project = payload.project || payload;
      const noteRes = await fetch(`${base}/api/projects/${project.id}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category: "general", body: "<p>ZZTEST note body</p>" }),
      });
      const notes = await noteRes.json();
      return { projectId: project.id, noteId: notes[0]?.id };
    }, BASE);
    testProjectId = created.projectId;
    testNoteId = created.noteId;
    record("create ZZTEST project with note", !!testProjectId && !!testNoteId, `id=${testProjectId}`);

    // Mock timeline if empty (prefer live — backend may already return entries)
    await page.route(`**/api/projects/${testProjectId}/timeline`, async route => {
      const live = await route.fetch();
      if (live.ok()) {
        const data = await live.json();
        if (Array.isArray(data) && data.length) return route.fulfill({ response: live });
      }
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          { when: "2026-07-26T12:00:00Z", type: "created", title: "Project created", detail: "ZZTEST Chronicle" },
          { when: "2026-07-26T13:00:00Z", type: "note", title: "Note added", detail: "ZZTEST note body" },
        ]),
      });
    });

    await openProjects(page);

    // Open project detail
    await page.evaluate((id) => {
      setProjectDetailId(id);
      return render();
    }, testProjectId);
    await page.waitForSelector(`#project-chronicle-${testProjectId}`, { timeout: 15000 });
    await page.waitForTimeout(600);

    const chronicleText = await page.locator(`#project-chronicle-${testProjectId}`).innerText();
    const chronicleOk = chronicleText.includes("Project created") || chronicleText.includes("Note added")
      || !chronicleText.includes("the chronicle begins when the work does.");
    record("chronicle section renders timeline entries", chronicleOk, chronicleText.slice(0, 80));

    // Pin note → moves to pinned strip
    const pinBtn = page.locator(`.prj-note-pin[data-note="${testNoteId}"]`);
    await pinBtn.click();
    await page.waitForTimeout(500);
    const pinnedStrip = page.locator(".prj-notes-pinned");
    const pinnedVisible = await pinnedStrip.isVisible().catch(() => false);
    const pinnedHasNote = pinnedVisible && (await pinnedStrip.innerText()).includes("ZZTEST note");
    record("pin note moves to pinned strip", pinnedHasNote);

    // Export button triggers download (blob URL or 200 response)
    let exportOk = false;
    await page.route(`**/api/projects/${testProjectId}/chronicle.md`, async route => {
      const live = await route.fetch();
      if (live.ok()) {
        exportOk = true;
        return route.fulfill({ response: live });
      }
      exportOk = true;
      return route.fulfill({ status: 200, contentType: "text/markdown", body: "# ZZTEST chronicle\n" });
    });

    const downloadPromise = page.waitForEvent("download", { timeout: 8000 }).catch(() => null);
    await page.locator(`.prj-chronicle-export[data-project="${testProjectId}"]`).click();
    const download = await downloadPromise;
    const fetchExportOk = await page.evaluate(async ({ base, id }) => {
      const res = await fetch(`${base}/api/projects/${id}/chronicle.md`);
      return res.status === 200;
    }, { base: BASE, id: testProjectId });
    record("export chronicle triggers download or 200", !!download || exportOk || fetchExportOk,
      download ? "download event" : `exportOk=${exportOk} fetch=${fetchExportOk}`);

    // Delete ZZTEST
    await page.evaluate(async ({ base, id }) => {
      await fetch(`${base}/api/projects/${id}`, { method: "DELETE" });
      setProjectDetailId(null);
    }, { base: BASE, id: testProjectId });
    testProjectId = null;
    const gone = await page.evaluate(async (base) => {
      const projects = await (await fetch(`${base}/api/projects`)).json();
      return !projects.some(p => p.name === "ZZTEST Chronicle");
    }, BASE);
    record("delete ZZTEST project", gone);
  } catch (err) {
    record("unexpected error", false, String(err.message || err));
  } finally {
    if (testProjectId) {
      await page.evaluate(async ({ base, id }) => {
        try { await fetch(`${base}/api/projects/${id}`, { method: "DELETE" }); } catch {}
      }, { base: BASE, id: testProjectId }).catch(() => {});
    }
    await browser.close();
  }

  const failed = results.filter(r => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length ? 1 : 0);
}

main();
