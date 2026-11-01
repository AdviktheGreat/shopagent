import test from "node:test";
import assert from "node:assert/strict";
import {
  freshState,
  hydrateState,
  canonicalUrl,
  safeUrl,
  rankProducts,
  refineQuery,
  mergeProducts,
  money,
} from "../extension/core.js";
import { DEMO_PRODUCTS } from "../extension/demo.js";

test("defaults do not share mutable memory and hydration keeps newly added defaults", () => {
  const a = freshState();
  a.saved.push({ id: "x" });
  assert.equal(freshState().saved.length, 0);
  assert.equal(
    hydrateState({ profile: { size: "M" } }).profile.currency,
    "USD",
  );
});
test("product URLs reject script/data protocols and remove tracking without losing variants", () => {
  assert.equal(safeUrl("javascript:alert(1)"), "");
  assert.equal(safeUrl(undefined, "https://example.com"), "");
  assert.equal(safeUrl("data:text/html,hello"), "");
  assert.equal(
    canonicalUrl("https://shop.test/p/dress?variant=42&utm_source=ad#reviews"),
    "https://shop.test/p/dress?variant=42",
  );
});
test("chat filters accumulate across requests and reset explicitly", () => {
  const one = refineQuery("More fitted and under $150");
  const two = refineQuery("Something appropriate for work", one.filters);
  assert.deepEqual(two.filters, {
    maxPrice: 150,
    fit: "fitted",
    occasion: "work",
  });
  assert.deepEqual(refineQuery("Clear filters", two.filters).filters, {});
  assert.deepEqual(refineQuery("show me everything", two.filters).filters, {});
});
test("currency changes are explicit and no exchange rate is invented", () => {
  const result = refineQuery("under €150", { fit: "fitted" }, "USD");
  assert.deepEqual(result.filters, { fit: "fitted" });
  assert.match(result.reply, /Change it to EUR/);
});
test("hard budget excludes unknown prices and other currencies", () => {
  const state = freshState();
  state.filters.maxPrice = 100;
  const candidates = [
    { id: "usd", title: "Dress", price: 90, currency: "USD" },
    { id: "eur", title: "Dress", price: 80, currency: "EUR" },
    { id: "unknown", title: "Dress", price: null, currency: "USD" },
    { id: "high", title: "Dress", price: 101, currency: "USD" },
  ];
  assert.deepEqual(
    rankProducts(candidates, state).map((p) => p.id),
    ["usd"],
  );
});
test("explicit style and saved pieces influence ranking; dismissed pieces stay hidden", () => {
  const state = freshState();
  state.profile.styles = ["Romantic"];
  state.profile.budget = 1000;
  const candidates = DEMO_PRODUCTS.filter((p) =>
    ["demo-1", "demo-4"].includes(p.id),
  );
  assert.equal(rankProducts(candidates, state)[0].id, "demo-4");
  state.dismissed = ["demo-4"];
  assert.equal(rankProducts(candidates, state).length, 1);
});
test("fabric filter is a transparent material cue, not a quality score", () => {
  const state = freshState();
  state.filters.fabric = true;
  const results = rankProducts(DEMO_PRODUCTS, state);
  assert.ok(results.length > 0);
  assert.ok(!results.some((p) => p.id === "demo-8"));
  assert.match(refineQuery("better quality fabric").reply, /not a guarantee/);
});
test("a relaxed trouser does not become fitted just because its waist is tailored", () => {
  const state = freshState();
  state.filters.fit = "fitted";
  assert.ok(!rankProducts(DEMO_PRODUCTS, state).some((p) => p.id === "demo-3"));
  assert.ok(rankProducts(DEMO_PRODUCTS, state).some((p) => p.id === "demo-1"));
});
test("product memory updates duplicate URLs and respects its bound", () => {
  assert.deepEqual(
    mergeProducts(
      [{ id: "a", price: 10 }],
      [
        { id: "a", price: 12 },
        { id: "b", price: 20 },
      ],
      1,
    ),
    [{ id: "b", price: 20 }],
  );
});
test("unavailable price is distinct from free", () => {
  assert.equal(money(null), "Price unavailable");
  assert.equal(money(0), "$0.00");
});
test("unsupported requests do not pretend to be AI or place orders", () => {
  assert.match(refineQuery("buy this").reply, /never places orders/);
  assert.match(
    refineQuery("make me look like a celebrity").reply,
    /local prototype/,
  );
});
