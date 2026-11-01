import { chromium } from "@playwright/test";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { EXTRACTION_FILES } from "../extension/reader-files.js";
const root = resolve(import.meta.dirname, "..");
const fixtures = resolve(import.meta.dirname, "fixtures/stores");
const { cases } = JSON.parse(
  await readFile(resolve(fixtures, "cases.json"), "utf8"),
);
const source = (
  await Promise.all(
    EXTRACTION_FILES.map((file) =>
      readFile(resolve(root, "extension", file), "utf8"),
    ),
  )
).join("\n");
const browser = await chromium.launch({
  channel: "chromium",
  headless: true,
  ...(process.env.SHOPAGENT_CHROMIUM
    ? { executablePath: process.env.SHOPAGENT_CHROMIUM }
    : {}),
});
try {
  for (const entry of cases) {
    const page = await browser.newPage();
    const html = await readFile(resolve(fixtures, entry.fixture), "utf8");
    await page.route("**/*", (route) =>
      route.request().isNavigationRequest()
        ? route.fulfill({ contentType: "text/html", body: html })
        : route.abort(),
    );
    await page.goto(entry.url, { waitUntil: "domcontentloaded" });
    const result = await page.evaluate(source);
    assert.equal(
      result.products.length,
      entry.expected.count,
      `${entry.id}: product count`,
    );
    const first = result.products[0];
    for (const field of ["title", "price", "currency"])
      assert.equal(
        first[field],
        entry.expected[field],
        `${entry.id}: ${field}`,
      );
    assert.ok(first.image.startsWith("https://"), `${entry.id}: primary image`);
    assert.ok(
      first.url.startsWith("https://www.everlane.com/products/"),
      `${entry.id}: absolute product URL`,
    );
    assert.equal(
      new Set(result.products.map((p) => p.id)).size,
      result.products.length,
      "Duplicate product identity",
    );
    assert.ok(
      !JSON.stringify(result).includes("private-sentinel"),
      "Private field escaped into product output",
    );
    if (entry.id === "everlane-collection") {
      assert.equal(
        result.products[1].price,
        79,
        "Current sale price, not compare-at price",
      );
      assert.equal(result.products[1].currency, "USD");
      await page.evaluate(() =>
        document.querySelector(".localization-form__select").remove(),
      );
      const unknownCurrency = await page.evaluate(source);
      assert.equal(
        unknownCurrency.products[0].currency,
        "",
        "A bare $ never establishes USD",
      );
      await page.evaluate(() => {
        document.querySelector(".js-product-price").textContent = "From $98.00";
      });
      assert.equal((await page.evaluate(source)).products[0].priceFrom, true);
    }
    if (entry.id === "everlane-product") {
      assert.deepEqual(first.sizes, ["00", "0"]);
      assert.deepEqual(first.availableSizes, ["00"]);
      assert.deepEqual(first.colors, ["Light Blue"]);
      assert.equal(first.variants[1].available, false);
      assert.equal(first.selectedOptions.size, "00");
      assert.ok(first.url.includes("variant=42242838429782"));
      await page.goto(`${entry.url}?variant=42242838462550`, {
        waitUntil: "domcontentloaded",
      });
      const selected = (await page.evaluate(source)).products[0];
      assert.equal(
        selected.id,
        first.id,
        "Product identity is stable across size variants",
      );
      assert.equal(selected.selectedOptions.size, "0");
      assert.equal(
        selected.variants.find((v) => v.id === selected.selectedVariantId)
          .available,
        false,
      );
      assert.ok(selected.url.includes("variant=42242838462550"));
      await page.evaluate(() => {
        document
          .querySelectorAll("label[data-available]")
          .forEach((label) => label.removeAttribute("data-available"));
        const script = document.querySelector(
          'script[type="application/ld+json"]',
        );
        const group = JSON.parse(script.textContent);
        group.hasVariant.forEach((v) => delete v.offers.availability);
        script.textContent = JSON.stringify(group);
      });
      assert.ok(
        (await page.evaluate(source)).products[0].variants.every(
          (v) => v.available === null,
        ),
        "Missing stock evidence stays unknown",
      );
      await page.evaluate(() => {
        document.querySelector(
          'script[type="application/ld+json"]',
        ).textContent = "{bad json";
      });
      const fallback = await page.evaluate(source);
      assert.equal(
        fallback.products[0].price,
        88,
        "Malformed JSON-LD falls back to product metadata",
      );
      await page.evaluate(() => {
        document
          .querySelectorAll(
            'meta[property="og:price:amount"],meta[property="og:price:currency"]',
          )
          .forEach((e) => e.remove());
      });
      const missing = await page.evaluate(source);
      assert.equal(missing.products[0].price, null);
      assert.equal(missing.products[0].currency, "");
    }
    console.log(
      `✓ ${entry.id}: grouped identity, title, image, price, currency, links, and private-field exclusion`,
    );
    await page.close();
  }
} finally {
  await browser.close();
}
