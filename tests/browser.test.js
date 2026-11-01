import { chromium, expect } from "@playwright/test";
import { readFile, writeFile, mkdir, mkdtemp, cp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import assert from "node:assert/strict";
import { previewServer } from "../scripts/preview.js";
import { EXTRACTION_FILES } from "../extension/reader-files.js";

const root = resolve(import.meta.dirname, "..");
const results = resolve(root, "test-results");
await mkdir(results, { recursive: true });
const server = previewServer();
await new Promise((yes, no) => {
  server.once("error", no);
  server.listen(0, "127.0.0.1", yes);
});
const origin = `http://127.0.0.1:${server.address().port}`;
const extractionScript = (
  await Promise.all(
    EXTRACTION_FILES.map((file) =>
      readFile(resolve(root, "extension", file), "utf8"),
    ),
  )
).join("\n");
const cleanups = [];
let checks = 0;
function passed(name) {
  checks++;
  console.log(`✓ ${name}`);
}

async function launch(extensionPath) {
  const profile = await mkdtemp(join(tmpdir(), "shopagent-browser-"));
  cleanups.push(() => rm(profile, { recursive: true, force: true }));
  const context = await chromium.launchPersistentContext(profile, {
    channel: "chromium",
    headless: true,
    ...(process.env.SHOPAGENT_CHROMIUM
      ? { executablePath: process.env.SHOPAGENT_CHROMIUM }
      : {}),
    viewport: { width: 400, height: 1000 },
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
    ],
  });
  cleanups.push(() => context.close());
  let worker = context.serviceWorkers()[0];
  if (!worker) worker = await context.waitForEvent("serviceworker");
  const id = new URL(worker.url()).host;
  return { context, worker, id };
}

try {
  const { context, worker, id } = await launch(resolve(root, "extension"));
  const manifest = await worker.evaluate(() => chrome.runtime.getManifest());
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.host_permissions, undefined);
  assert.equal(
    (await worker.evaluate(() => chrome.permissions.getAll())).origins.length,
    0,
  );
  await expect
    .poll(() =>
      worker.evaluate(
        async () =>
          (await chrome.sidePanel.getPanelBehavior()).openPanelOnActionClick,
      ),
    )
    .toBe(true);
  passed(
    "Production Manifest V3 extension loads with no persistent store access",
  );

  const panel = await context.newPage();
  const errors = [];
  panel.on("pageerror", (error) => {
    errors.push(error.message);
    console.error("Panel error:", error.message);
  });
  panel.on("console", (message) => {
    if (message.type() === "error")
      console.error("Panel console:", message.text());
  });
  await panel.goto(`chrome-extension://${id}/panel.html`);
  await expect(panel.locator(".product-card")).toHaveCount(8);
  await expect(panel.locator(".demo-banner")).toContainText("fictional");
  await expect
    .poll(() =>
      panel
        .locator(".product-image img")
        .first()
        .evaluate((img) => img.complete && img.naturalWidth > 0),
    )
    .toBe(true);
  assert.ok(
    await panel
      .locator(".product-image img")
      .first()
      .evaluate((img) => img.clientHeight > 100),
  );
  await panel.screenshot({ path: resolve(results, "shopagent-preview.png") });
  passed(
    "Real extension panel renders the demo collection under extension CSP",
  );

  await panel.getByRole("tab", { name: "Your taste" }).click();
  await panel.getByRole("button", { name: "Minimal", exact: true }).click();
  await panel.locator('[name="size"]').fill("M");
  await panel.locator('[name="budget"]').fill("130");
  await panel.getByRole("button", { name: "Save my preferences" }).click();
  await expect(panel.locator(".taste-invite")).toHaveCount(0);
  assert.deepEqual(
    (
      await worker.evaluate(
        async () => (await chrome.storage.local.get("shopagent")).shopagent,
      )
    ).profile.styles,
    ["Minimal"],
  );
  passed("Taste onboarding persists to real chrome.storage");
  await expect
    .poll(() =>
      panel
        .locator(".product-image img")
        .first()
        .evaluate((img) => img.complete && img.naturalWidth > 0),
    )
    .toBe(true);
  await expect(panel.locator("#toast")).toBeHidden({ timeout: 5000 });
  await panel.screenshot({
    path: resolve(results, "shopagent-personalized.png"),
  });

  await panel.locator('[data-prompt="Under $150"]').click();
  await expect(panel.locator('[data-remove-filter="maxPrice"]')).toContainText(
    "$150",
  );
  await expect(panel.locator(".product-card")).toHaveCount(6);
  await panel.locator('[data-prompt="More fitted"]').click();
  await expect(panel.locator(".product-card")).toHaveCount(4);
  await panel.reload();
  await expect(panel.locator('[data-remove-filter="fit"]')).toBeVisible();
  await expect(panel.locator(".product-card")).toHaveCount(4);
  passed("Chat filters accumulate and survive panel reload");

  await panel.locator('[data-save="demo-1"]').click();
  await panel.locator('[data-save="demo-2"]').click();
  await panel.getByRole("tab", { name: /^Saved/ }).click();
  await expect(panel.locator(".product-card")).toHaveCount(2);
  await panel.locator('[data-compare-select="demo-1"]').check();
  await panel.locator('[data-compare-select="demo-2"]').check();
  await panel.getByRole("button", { name: "Compare pieces" }).click();
  await expect(panel.locator(".comparison")).toContainText("55% linen");
  await expect(panel.locator(".comparison")).toContainText("95% cotton");
  await panel.locator("#close-modal").click();
  await panel.reload();
  await panel.getByRole("tab", { name: /^Saved/ }).click();
  await expect(panel.locator(".product-card")).toHaveCount(2);
  passed("Saved items persist and compare actual captured attributes");

  await panel.getByRole("tab", { name: "Your taste" }).click();
  await panel
    .locator("#inspiration-input")
    .setInputFiles(resolve(results, "shopagent-preview.png"));
  await expect(panel.locator(".mood-image")).toHaveCount(1);
  await expect(
    panel
      .locator(".hint")
      .filter({ hasText: "images don’t influence recommendations yet" }),
  ).toBeVisible();
  passed("Inspiration upload creates a local, resized moodboard image");

  await panel.getByRole("tab", { name: "For you" }).click();
  await panel.locator('[data-detail="demo-1"]').first().click();
  await expect(panel.locator("#modal-content")).toContainText(
    "fictional sample",
  );
  await expect(panel.locator("#modal-content a")).toHaveCount(0);
  await panel.locator("#close-modal").click();
  await panel.setViewportSize({ width: 320, height: 720 });
  assert.equal(
    await panel.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  await panel.screenshot({ path: resolve(results, "shopagent-compact.png") });
  passed("Demo details cannot purchase; panel fits a narrow 320px viewport");

  const fixture = await context.newPage();
  await fixture.goto(`${origin}/fixtures/product.html`);
  const detail = await fixture.evaluate(extractionScript);
  assert.equal(detail.products.length, 1);
  assert.equal(detail.products[0].price, 129);
  assert.equal(detail.products[0].material, "55% linen, 45% cotton");
  assert.deepEqual(detail.products[0].sizes, ["S", "M", "L"]);
  assert.equal(detail.products[0].reviews.length, 1);
  assert.ok(!JSON.stringify(detail).includes("do-not-collect"));
  assert.equal(detail.products[0].url, `${origin}/products/linen-blazer`);
  passed(
    "Structured data extraction handles malformed markup and ignores private form fields",
  );
  await fixture.goto(`${origin}/fixtures/collection.html`);
  const collection = await fixture.evaluate(extractionScript);
  assert.equal(collection.products.length, 3);
  assert.equal(collection.products[0].currency, "USD");
  assert.equal(collection.products[2].currency, "");
  passed(
    "Visible collection cards extract without guessing the currency of an ambiguous $",
  );
  await fixture.setContent(
    '<script type="application/ld+json">{"@type":"ProductGroup","name":"Linen trousers","url":"/products/linen-trouser","material":"100% linen","hasVariant":{"@type":"Product","name":"Linen trousers M","size":"M"},"offers":{"@type":"AggregateOffer","lowPrice":"79,95","highPrice":"99,95","priceCurrency":"EUR"}}</script>',
  );
  const european = await fixture.evaluate(extractionScript);
  assert.equal(european.products[0].price, 79.95);
  assert.equal(european.products[0].priceFrom, true);
  assert.equal(european.products[0].image, "");
  assert.deepEqual(european.products[0].sizes, ["M"]);
  passed(
    "European prices, aggregate price labels, single-object variants, and missing images are handled",
  );
  await fixture.goto(`${origin}/fixtures/empty.html`);
  assert.equal((await fixture.evaluate(extractionScript)).products.length, 0);
  passed("Unrelated pages produce an honest empty result");

  const fixtureTab = await worker.evaluate(async (origin) => {
    const tab = await chrome.tabs.create({
      url: `${origin}/fixtures/product.html`,
    });
    return tab.id;
  }, origin);
  const denied = await panel.evaluate(
    (tabId) => chrome.runtime.sendMessage({ type: "SCAN", tabId }),
    fixtureTab,
  );
  assert.equal(denied.ok, false);
  passed(
    "Chrome itself blocks live page extraction before site permission is granted",
  );
  assert.deepEqual(errors, []);
  await context.close();

  // Integration fixture: pre-grant only our loopback fixture origin in a temporary copy.
  // Production manifest above is tested unchanged; no broad permissions are added to the deliverable.
  const temporary = await mkdtemp(join(tmpdir(), "shopagent-extension-"));
  cleanups.push(() => rm(temporary, { recursive: true, force: true }));
  await cp(resolve(root, "extension"), temporary, { recursive: true });
  const fixtureManifest = {
    ...manifest,
    host_permissions: ["http://127.0.0.1/*"],
  };
  delete fixtureManifest.key;
  await writeFile(
    resolve(temporary, "manifest.json"),
    JSON.stringify(fixtureManifest),
  );
  const integration = await launch(temporary);
  const livePanel = await integration.context.newPage();
  const liveErrors = [];
  livePanel.on("pageerror", (error) => liveErrors.push(error.message));
  await livePanel.goto(`chrome-extension://${integration.id}/panel.html`);
  await expect(livePanel.locator(".product-card")).toHaveCount(8);
  const liveTab = await integration.worker.evaluate(
    async (origin) =>
      (await chrome.tabs.create({ url: `${origin}/fixtures/product.html` })).id,
    origin,
  );
  await expect(livePanel.locator("#store-name")).toHaveText("Field Notes");
  await expect(livePanel.locator(".product-card")).toHaveCount(1);
  await expect(livePanel.locator(".demo-banner")).toHaveCount(0);
  await expect(livePanel.locator(".product-title")).toContainText(
    "<script>alert('x')</script>",
  );
  assert.equal(await livePanel.locator("script:not([src])").count(), 0);
  await livePanel.locator(".save-button").click();
  await expect(livePanel.locator("#saved-count")).toHaveText("1");
  const history = await integration.worker.evaluate(
    async () => (await chrome.storage.local.get("shopagent")).shopagent.history,
  );
  assert.ok(history.length >= 1);
  passed(
    "Native content-script injection, automatic tab following, safe rendering, and live saves work end to end",
  );

  await integration.worker.evaluate(
    async (tabId) => chrome.tabs.update(tabId, { url: "https://example.org/" }),
    liveTab,
  );
  await expect(livePanel.locator(".product-card")).toHaveCount(0);
  await expect(livePanel.locator(".permission-note")).toContainText(
    "allow access",
  );
  await livePanel.getByRole("tab", { name: /^Saved/ }).click();
  await expect(livePanel.locator(".product-card")).toHaveCount(1);
  passed(
    "Moving to an unauthorized store clears stale picks and keeps the cross-store shortlist",
  );

  await livePanel.getByRole("tab", { name: "Your taste" }).click();
  await livePanel.locator('[name="learning"]').uncheck();
  await livePanel.getByRole("button", { name: "Save my preferences" }).click();
  const prior = await integration.worker.evaluate(
    async () =>
      (await chrome.storage.local.get("shopagent")).shopagent.history.length,
  );
  await integration.worker.evaluate(
    async ({ id, origin }) =>
      chrome.tabs.update(id, { url: `${origin}/fixtures/collection.html` }),
    { id: liveTab, origin },
  );
  const direct = await livePanel.evaluate(
    (tabId) => chrome.runtime.sendMessage({ type: "SCAN", tabId }),
    liveTab,
  );
  assert.equal(direct.ok, true);
  assert.equal(
    await integration.worker.evaluate(
      async () =>
        (await chrome.storage.local.get("shopagent")).shopagent.history.length,
    ),
    prior,
  );
  passed(
    "Turning off browsing memory prevents new history during manual scans",
  );

  await livePanel.locator("#settings-button").click();
  await livePanel.getByRole("button", { name: "Reset everything" }).click();
  await livePanel
    .getByRole("button", { name: "Yes, delete my local data" })
    .click();
  await expect(livePanel.locator("#saved-count")).toHaveText("0");
  await expect(livePanel.locator(".product-card")).toHaveCount(8);
  const reset = await integration.worker.evaluate(
    async () => (await chrome.storage.local.get("shopagent")).shopagent,
  );
  assert.equal(reset.history.length, 0);
  assert.equal(reset.messages.length, 1);
  assert.deepEqual(liveErrors, []);
  passed("Confirmed reset clears local data and returns to the demo");
  console.log(
    `\n${checks} browser integration checks passed. Screenshots in test-results/.`,
  );
} finally {
  for (const cleanup of cleanups.reverse()) {
    try {
      await cleanup();
    } catch {}
  }
  await new Promise((resolve) => server.close(resolve));
}
