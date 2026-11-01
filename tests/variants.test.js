import test from "node:test";
import assert from "node:assert/strict";
import "../extension/variant-evidence.js";
import {
  sizeAvailability,
  rankProducts,
  freshState,
  stockLabel,
} from "../extension/core.js";
const { normalizeAvailability, summarize } =
  globalThis.ShopagentVariantEvidence;
test("stock evidence preserves unknown status and distinguishes preorder from immediate stock", () => {
  assert.deepEqual(normalizeAvailability("https://schema.org/OutOfStock"), {
    availability: "out_of_stock",
    available: false,
  });
  assert.deepEqual(normalizeAvailability(undefined), {
    availability: "unknown",
    available: null,
  });
  assert.equal(
    normalizeAvailability("https://schema.org/PreOrder").availability,
    "preorder",
  );
  assert.equal(stockLabel("preorder"), "Preorder");
});
test("size availability is scoped to the selected color", () => {
  const p = {
    selectedOptions: { color: "Blue" },
    variants: [
      { size: "M", color: "Blue", available: false },
      { size: "M", color: "Red", available: true },
    ],
  };
  assert.equal(sizeAvailability(p, "M"), "unavailable");
  assert.equal(sizeAvailability(p, "S"), "unknown");
  assert.deepEqual(summarize(p.variants, "Blue").availableSizes, []);
});
test("an unavailable usual size never receives a size-match boost", () => {
  const state = freshState();
  state.profile.size = "M";
  const p = {
    id: "a",
    title: "Shirt",
    sizes: ["M"],
    variants: [{ size: "M", available: false }],
  };
  const unavailable = rankProducts([p], state)[0];
  const available = rankProducts(
    [{ ...p, variants: [{ size: "M", available: true }] }],
    state,
  )[0];
  assert.equal(available.score - unavailable.score, 1);
  assert.ok(unavailable.reasons.some((r) => r.includes("marked unavailable")));
  assert.ok(!unavailable.reasons.some((r) => r.includes("listed ·")));
});
