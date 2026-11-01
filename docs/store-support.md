# Part 1: reliable product reading

Each subpart is implemented, verified, committed, and pushed separately.

| Step | Deliverable                                                              | Status   |
| ---- | ------------------------------------------------------------------------ | -------- |
| 1.1  | First store, representative pages, reduced fixtures, acceptance criteria | Complete |
| 1.2  | Reliable titles, images, prices, currencies, and product links           | Next     |
| 1.3  | Colors, sizes, variants, and explicit availability                       | Planned  |
| 1.4  | Refresh after dynamic content and same-page navigation                   | Planned  |
| 1.5  | Second store using the same product contract and regression checks       | Planned  |

## First store: Everlane

Public desktop pages inspected in an isolated Chromium profile on November 1, 2026:

- Product: <https://www.everlane.com/products/womens-relaxed-linen-shirt-light-blue>
- Collection: <https://www.everlane.com/collections/womens-tops>

The product page publishes a Schema.org `ProductGroup` with child size variants and individual offers. The collection uses `.blm-product-search__result` cards: images and titles are separate links, while prices are siblings in the same card. The visible localization selector identifies the currency. These observations are the basis for the reduced fixtures under `tests/fixtures/stores/everlane/`.

Baseline reader observations from these live pages: the product scan returned 12 records, including size variants and a related item; its first group record had no price, currency, or image. The collection returned 52 records, but its first record lacked a price and currency. Exact counts and inventory are time-sensitive, not permanent assertions.

## Acceptance criteria

### 1.2: product identity and basic facts

- A product group appears as one piece, with a stable product identity; its size variants do not flood the carousel.
- Title, primary image, numeric price, explicit currency, and absolute store link come from product evidence.
- Collection image and title links resolve to one card; unrelated navigation and hidden cards are excluded.
- Current sale price is distinguished from a struck-through old price. A range is labeled `From`.
- Malformed markup or absent facts produce missing values, not fabricated data.
- Existing generic-store extraction, permission checks, local saves, and comparisons continue to work.

### 1.3: variant evidence

- Capture color/size combinations and available, unavailable, or unknown status without assuming all listed sizes are buyable.
- Preserve exact variant URLs when the retailer provides them, without treating each size as a separate product.
- Show selected options and stock evidence in product details. Recommendations do not reward a size known to be unavailable.
- Do not read account, address, payment, or arbitrary form fields. Only explicitly identified product option controls may be read.

### 1.4: dynamic pages

- Refresh after collection cards load, product options change, or a storefront changes URL using the History API.
- Debounce repeated mutations and prevent self-triggered scan loops, duplicate listeners, stale responses, and stale browsing-memory writes.
- Observe only the authorized active tab while the panel is open and memory/automatic reading is enabled. Stop on pause, revocation, navigation, and panel closure.
- Keep a manual refresh path and show honest loading, empty, error, and stale-data states.

### 1.5: second store

- Add Quince using its public product-group markup and product-card selectors, with the same normalized fields and optional-per-store permission flow.
- Validate public product and collection pages live; add reduced offline fixtures and edge cases. Preserve Everlane and generic-reader coverage.

Candidate pages inspected: <https://www.quince.com/women/linen-shirt?color=white> and <https://www.quince.com/shop/women/shirts-%26-blouses>. The baseline reader returned 60 size/color records on the product page and no products on the collection page. Quince support is not yet implemented.

## Fixture provenance and limits

Fixtures retain small, manually reduced examples of public product metadata, card structure, and option controls. They exclude retailer scripts, tracking payloads, account data, full descriptions, and customer reviews. The collection fixture also includes clearly marked synthetic sale and hidden-card cases. Fixtures are for deterministic regression testing; they are not a catalog or a claim of current price/stock. Live validation is recorded separately as implementation progresses.
