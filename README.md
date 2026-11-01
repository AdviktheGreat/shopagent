# Shopagent

Your taste. Every store. A Chrome extension prototype for a personal shopping companion that follows you across clothing websites.

## Try it in Chrome — no coding or setup required

1. Open **Google Chrome** and enter `chrome://extensions` in the address bar.
2. Turn on **Developer mode** using the switch in the top right.
3. Click **Load unpacked**.
4. Select the **`extension` folder inside this repository**. On this computer, that is `/Users/advikanand/GitHub Repos/shopagent/extension`. Select `extension`, not the repository's parent folder or an individual file. In the macOS file picker, press **Command+Shift+G** to paste the path.
5. Click Chrome's puzzle-piece Extensions button and pin **Shopagent**.
6. Click the Shopagent icon. The shopping panel opens alongside the current page.

No `npm install`, build command, API key, account, or running server is needed to use the extension. Use a current desktop Chrome version (minimum Chrome 116). Firefox and Safari are not supported by this prototype.

### A quick first session

- The panel starts with a **clearly labeled fictional demo collection** so you can try it immediately. Its illustrations, brands, prices, fabrics, and sizes are examples, not live inventory.
- Open **Your taste**, choose a few styles, and save your usual size, budget, and currency.
- Heart two or three pieces. Open **Saved**, select them, then click **Compare pieces**.
- Try `More fitted`, `Under $150`, `For work`, or `Better quality fabric` in the conversation. Filters accumulate across stores. Click a filter chip to remove it or use **Clear filters**.
- Open a real clothing store's product or collection page and click **Read this page**. Chrome asks you to grant access to that store. The panel then shows products it can extract from that page.
- Move to another store. Your saved pieces, taste profile, and conversation stay with you. Grant access to each new store you want to read.

The general reader works best on product pages with Schema.org Product JSON-LD or product Open Graph metadata. It also reads common visible collection-card patterns. Coverage varies by store, page layout, locale, and whether products have finished loading. This is not a full retailer catalog or a guaranteed integration with any particular brand.

If nothing appears, try a product detail page, scroll to load the collection, then click **Refresh picks**. If needed, reload the extension and the store page. Chrome internal pages, the Chrome Web Store, and some protected pages cannot be read.

## What works in this prototype

| Feature            | Current behavior                                                                                                                            |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Shopping companion | Persistent native Chrome side panel                                                                                                         |
| Store picks        | Extracts up to 60 products from the current page; ranks by stated style, saved-item style cues, budget, and listed size                     |
| Taste profile      | Editable style, usual size, budget, and shopping currency                                                                                   |
| Cross-store memory | Saved items, preferences, bounded conversation, and shopping filters persist locally                                                        |
| Conversation       | Deterministic local intent parser for budget, fitted silhouettes, workwear cues, and fabric cues                                            |
| Product evidence   | Captured price, fabric, description, listed sizes, stock, and review information when present in page markup                                |
| Comparison         | Side-by-side attributes for two or three saved pieces                                                                                       |
| Inspiration        | Local image moodboard; thumbnails are resized before storing                                                                                |
| Privacy controls   | Optional per-site permissions, pause automatic reading/memory, revoke site access, export data, clear browsing history, and confirmed reset |

**The stylist is a local rules-based prototype, not a connected language model.** Unsupported requests say so. There is no arbitrary AI conversation, visual understanding, automatic social import, full-store search, exact size prediction, purchase detection, or automated checkout yet. Uploaded inspiration images do not change the ranking. Opening a live piece takes you to the retailer; Shopagent never places an order.

## How the extension works

Chrome extensions are packaged HTML, CSS, and JavaScript described by `manifest.json`. This prototype uses **Manifest V3**, Chrome's current extension format.

- **`extension/panel.html`, `panel.css`, `panel.js`**: the side panel interface. It stays open while you browse, manages user actions, and asks the background worker to scan or update memory.
- **`extension/background.js`**: Chrome's event-driven service worker. It handles storage changes through a serialized queue and injects the page reader after permission is granted. Durable state lives in `chrome.storage.local`, so the service worker can shut down without losing it.
- **`extension/extractor.js`**: a one-shot content script in Chrome's isolated world. Reads product markup and common visible product cards. It does not collect input fields, cookies, login information, or full page bodies.
- **`extension/core.js`**: pure ranking, filter parsing, URL validation, and data helpers. This is the natural boundary for adding a real recommendation service later.
- **`extension/demo.js`**: fictional sample products and self-contained garment illustrations.

There are no remote scripts, runtime dependencies, API calls, or developer backend. Product images can load from the retailer's image hosts; those hosts receive ordinary image requests without a referrer. Moodboard images stay local.

### Permissions and data

- `sidePanel`: displays the companion.
- `storage`: stores local preferences, saves, conversation, and moodboard.
- `activeTab` / `scripting`: supports user-invoked page access and injection of the product reader.
- `tabs`: identifies the currently active store and tab changes while the panel is open. It does not save general tab history.
- Optional HTTP/HTTPS host permissions: requested for each store when you choose **Read this page**. No persistent access to any store is granted at installation.

Automatic reading occurs only while the panel is open, on stores already authorized, when **Remember products from pages I read** is enabled. Turning that setting off stops automatic reading and new browsing history. You can still manually read pages and save pieces. Remembered browsing products are currently available as local history; only explicit saves and profile preferences affect taste ranking.

Data is bounded to 100 saves, 150 remembered products, 60 conversation messages, 300 dismissed IDs, and 8 moodboard thumbnails. It stays in this Chrome profile, without cloud sync. Reset clears stored shopping data; revoke site permissions separately in settings or Chrome. Uninstalling removes extension storage. Browsing history and saved items are not automatically deleted when you revoke a site.

### Product facts have limits

The reader never invents a missing price, currency, fabric, review, or size. A strict budget excludes prices in a different or unknown currency; there is no currency conversion. A bare `$` in a collection card is ambiguous and is not assumed to mean USD. Aggregate offers show **From** prices; confirm the specific variant's price with the retailer.

Size lists may include unavailable variants. Matching your usual size only highlights a listed option; it does not predict fit. Fabric filters look for named materials and do not establish quality. “For work” and “More fitted” use text cues, which can be incomplete. Product evidence is a snapshot, so always confirm the current price, size, and stock with the retailer.

## Development and verification

Node 20+ is only needed for development. The runtime extension has no build step.

```sh
npm ci
npm test
npm run check
npx playwright install chromium
npm run test:browser
```

`npm test` verifies filter memory, currency handling, ranking, URL safety, and data bounds. `npm run check` checks Manifest V3 entrypoints, syntax, and basic CSP requirements.

Browser checks launch Chromium in an isolated temporary profile, load the actual extension, and exercise profile persistence, filtering, saved comparisons, inspiration upload, compact layout, extraction, and permission denial. A second temporary copy pre-grants access **only to the loopback fixture origin** to test native content-script injection, tab following, safe rendering, and local data reset. The production manifest remains unchanged. Screenshots are written to `test-results/`. No personal browser profile is used.

If your Chromium executable is elsewhere, set `SHOPAGENT_CHROMIUM` to its path when running browser tests.

To preview the demo interface without installing an extension:

```sh
npm run preview
```

Then visit `http://127.0.0.1:4173`. Preview mode has its own local data and cannot read other pages. It is for interface development; the actual extension is loaded using Chrome's **Load unpacked** button.

After changing extension files, return to `chrome://extensions`, click Shopagent's reload icon, close and reopen the side panel, and refresh the store page if necessary.

## Next capabilities

1. Store-specific adapters and robust variant/size availability.
2. A backend-mediated model connection for broader chat, with keys kept off the extension.
3. Image similarity and explicit learning from inspiration.
4. Retailer catalog ingestion and cross-store discovery beyond visited pages.
5. Evidence-backed review/fit analysis and feedback from kept/returned purchases.
6. Approval-based cart and checkout assistance on supported retailers.

The repository uses the Apache 2.0 license; see `LICENSE`.
