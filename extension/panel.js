import {
  STYLES,
  freshState,
  hydrateState,
  rankProducts,
  refineQuery,
  filterLabels,
  money,
  safeUrl,
} from "./core.js";
import { DEMO_PRODUCTS, garmentArt } from "./demo.js";

const $ = (selector) => document.querySelector(selector);
const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const icons = {
  settings:
    '<path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z"/><path d="m9 3 1-1h4l1 3 3 1 3 1v4l-2 2-1 3 1 3-3 2-3-1-3 1-2-2H5l-2-3 1-3-1-3 2-2 1-3Z"/>',
  bag: '<path d="M5 7h14l1 14H4L5 7Z"/><path d="M8 8V6a4 4 0 0 1 8 0v2"/>',
  heart:
    '<path d="M20.8 4.6a5.4 5.4 0 0 0-7.6 0L12 5.8l-1.2-1.2a5.4 5.4 0 0 0-7.6 7.6L12 21l8.8-8.8a5.4 5.4 0 0 0 0-7.6Z"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-11v1"/>',
  arrow: '<path d="M7 17 17 7M7 7h10v10"/>',
  globe:
    '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c5 6 5 12 0 18-5-6-5-12 0-18Z"/>',
};
const icon = (name) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.info}</svg>`;
const isExtension = Boolean(globalThis.chrome?.runtime?.id);
let state = freshState();
let tab = "discover";
let demo = true;
let page = null;
let activeTab = null;
let expanded = false;
let busy = false;
let scanVersion = 0;
let notice = "";
let selection = new Set();
let toastTimeout;
let draftStyles;

// The same UI can be previewed in an ordinary tab. Chrome APIs are used in the extension.
async function request(action) {
  if (isExtension) {
    const response = await chrome.runtime.sendMessage(action);
    if (!response?.ok)
      throw new Error(
        response?.error || "Shopagent could not complete that action.",
      );
    return response.data;
  }
  if (action.type === "READ") {
    try {
      return hydrateState(
        JSON.parse(localStorage.getItem("shopagent-preview") || "null"),
      );
    } catch {
      return freshState();
    }
  }
  switch (action.type) {
    case "PROFILE":
      state.profile = { ...state.profile, ...action.profile };
      state.onboarded = true;
      break;
    case "SAVE":
      state.saved = state.saved.some((p) => p.id === action.product.id)
        ? state.saved.filter((p) => p.id !== action.product.id)
        : [...state.saved, action.product].slice(-100);
      break;
    case "DISMISS":
      state.dismissed = [...new Set([...state.dismissed, action.id])];
      break;
    case "RESTORE":
      state.dismissed = [];
      break;
    case "CHAT":
      state.filters = action.filters;
      state.messages = [...state.messages, ...action.messages].slice(-60);
      break;
    case "FILTERS":
      state.filters = action.filters;
      break;
    case "INSPIRATION":
      state.inspiration = [...state.inspiration, action.image].slice(-8);
      break;
    case "REMOVE_INSPIRATION":
      state.inspiration = state.inspiration.filter((p) => p.id !== action.id);
      break;
    case "FORGET_HISTORY":
      state.history = [];
      break;
    case "RESET":
      state = freshState();
      break;
    default:
      throw new Error(
        "Page reading is available when loaded as a Chrome extension.",
      );
  }
  localStorage.setItem("shopagent-preview", JSON.stringify(state));
  return state;
}
async function mutate(action) {
  state = await request(action);
  selection = new Set(
    [...selection].filter((id) => state.saved.some((p) => p.id === id)),
  );
  return state;
}
function toast(message) {
  $("#toast").textContent = message;
  $("#toast").hidden = false;
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    $("#toast").hidden = true;
  }, 3600);
}
function product(id) {
  return [
    ...(page?.products || []),
    ...DEMO_PRODUCTS,
    ...state.saved,
    ...state.history,
  ].find((p) => p.id === id);
}
function image(p) {
  return p.demo ? garmentArt(p) : safeUrl(p.image) || garmentArt({});
}
function priceLabel(p) {
  if (!p.currency && p.price != null)
    return `${p.priceFrom ? "From " : ""}${p.price} · currency unlisted`;
  return `${p.priceFrom ? "From " : ""}${money(p.price, p.currency || "USD")}`;
}
function sourceLabel(p) {
  return p.demo
    ? "Fictional demo item"
    : `Read from ${p.source || "page"} data`;
}
function card(p, savedView = false) {
  const saved = state.saved.some((item) => item.id === p.id);
  return `<article class="product-card" data-product="${esc(p.id)}">
    <div class="product-image"><button class="image-button" data-detail="${esc(p.id)}" aria-label="View details for ${esc(p.title)}"><img src="${esc(image(p))}" alt="${esc(p.title)}" loading="lazy" referrerpolicy="no-referrer"></button>
    <button class="save-button ${saved ? "is-saved" : ""}" data-save="${esc(p.id)}" aria-label="${saved ? "Unsave" : "Save"} ${esc(p.title)}" aria-pressed="${saved}">${icon("heart")}</button>${p.demo ? '<span class="demo-tag">DEMO PIECE</span>' : ""}</div>
    <p class="product-brand">${esc(p.store)}</p><button class="product-title" data-detail="${esc(p.id)}">${esc(p.title)}</button>
    <p class="product-price">${esc(priceLabel(p))}</p>
    ${p.reasons ? `<p class="product-reason">${esc(p.reasons[0])}</p>` : ""}
    <div class="card-actions">${savedView ? `<label class="check-label"><input type="checkbox" data-compare-select="${esc(p.id)}" ${selection.has(p.id) ? "checked" : ""}> Compare</label>` : `<button class="dismiss-button" data-dismiss="${esc(p.id)}">Not for me</button>`}<button class="text-button" data-detail="${esc(p.id)}">Details ↗</button></div>
  </article>`;
}
function setTab(next, focus = false) {
  tab = next;
  draftStyles = null;
  for (const button of document.querySelectorAll("[data-tab]")) {
    const selected = button.dataset.tab === tab;
    button.classList.toggle("active", selected);
    button.setAttribute("aria-selected", String(selected));
    button.tabIndex = selected ? 0 : -1;
    if (selected && focus) button.focus();
  }
  $("#main").setAttribute("aria-labelledby", `tab-${next}`);
  renderMain();
  $("#main").scrollTop = 0;
}
function renderContext() {
  $("#store-icon").innerHTML = icon(demo ? "bag" : "globe");
  $("#store-label").textContent = demo
    ? "A LITTLE INSPIRATION"
    : busy
      ? "READING THIS PAGE"
      : page
        ? "SHOPPING WITH YOU AT"
        : "READY WHEN YOU ARE";
  $("#store-name").textContent = demo
    ? "The demo edit"
    : page?.store ||
      (activeTab?.url
        ? new URL(activeTab.url).hostname
        : "Open a clothing store");
  $("#scan-button").disabled = busy;
  $("#scan-button").textContent = busy
    ? "Reading…"
    : page && !demo
      ? "Refresh picks"
      : "Read this page";
  $("#saved-count").textContent = state.saved.length;
}
function renderMain() {
  renderContext();
  const target = $("#main");
  if (tab === "profile") {
    renderProfile();
    return;
  }
  if (tab === "saved") {
    target.innerHTML = `<div class="intro"><span class="eyebrow">GOOD FINDS, ALL TOGETHER</span><h1>Your <em>shortlist.</em></h1><p class="subtle">The pieces you’re thinking about, across every store.</p></div>
    ${
      state.saved.length
        ? `<div class="section-heading"><h2>${state.saved.length} saved ${state.saved.length === 1 ? "piece" : "pieces"}</h2><small>Select up to 3 to compare</small></div><div class="product-grid">${state.saved
            .slice()
            .reverse()
            .map((p) => card(p, true))
            .join(
              "",
            )}</div><div class="compare-bar"><span>${selection.size} selected</span><button class="primary" data-action="compare" ${selection.size < 2 ? "disabled" : ""}>Compare pieces ↗</button></div>`
        : '<div class="empty-state"><div class="empty-icon">♡</div><h2>Found something you love?</h2><p>Tap a heart to keep it here. Your shortlist stays with you as you move between stores.</p><button class="primary" data-action="discover">Find your first piece ↗</button></div>'
    }`;
    attachImageFallbacks();
    return;
  }
  const candidates = demo ? DEMO_PRODUCTS : page?.products || [];
  const picks = rankProducts(candidates, state);
  const labels = filterLabels(state.filters, state.profile.currency);
  target.innerHTML = `<div class="intro"><span class="eyebrow">YOUR TASTE. EVERY STORE.</span><h1>A little less scrolling.<br>A little more <em>you.</em></h1><p class="subtle">A considered edit, shaped around your style.<br>Save what you love. We’ll find the common thread.</p></div>
    ${demo ? `<div class="demo-banner">${icon("info")}<span>You’re exploring fictional demo pieces. Open a store and choose <strong>Read this page</strong> for real products.</span></div>` : ""}
    ${notice ? `<div class="permission-note ${notice.startsWith("Could") ? "error-note" : ""}" role="status">${esc(notice)}</div>` : ""}
    ${!state.onboarded ? '<button class="taste-invite" data-action="profile"><span><strong>Let’s make this feel like you</strong><small>Set your style, usual size, and budget.</small></span><span class="arrow">↗</span></button>' : ""}
    ${labels.length ? `<div class="filters" aria-label="Active shopping filters">${labels.map(([key, label]) => `<button class="filter-chip" data-remove-filter="${key}" aria-label="Remove ${esc(label)} filter">${esc(label)}<span>×</span></button>`).join("")}</div>` : ""}
    <div class="section-heading"><h2>${demo ? "The just-for-you edit" : "Your picks from this page"}</h2><small>${picks.length} ${picks.length === 1 ? "piece" : "pieces"}${!demo ? " found" : ""}</small></div>
    ${busy ? '<div class="loading"><span class="dot"></span>Looking for the good pieces…</div>' : picks.length ? `<div class="product-grid">${picks.map((p) => card(p)).join("")}</div>` : `<div class="empty-state"><div class="empty-icon">✧</div><h2>${candidates.length ? "Let’s open things up." : "Your next find is out there."}</h2><p>${candidates.length ? "No pieces match these filters, or they’ve been dismissed. Clear your filters or bring back passed pieces." : "Open a product or collection page, then read it. Some stores don’t expose enough product data yet."}</p><button class="primary" data-action="${candidates.length ? "clear" : "scan"}">${candidates.length ? "Clear filters" : "Read this page"}</button>${state.dismissed.length ? '<p class="hint"><button class="text-button" data-action="restore">Bring back passed pieces</button></p>' : ""}</div>`}
    <div class="toolbar"><button class="text-button" data-action="${demo ? "scan" : "demo"}">${demo ? "Try it on a real store ↗" : "Explore the demo edit"}</button>${labels.length ? '<button class="text-button" data-action="clear">Clear filters</button>' : ""}${state.dismissed.length ? '<button class="text-button" data-action="restore">Restore passed pieces</button>' : ""}</div>
    <p class="collection-note">${demo ? "Illustrated sample collection · fictional brands and prices" : "Picks cover products found on this page, not the full store.<br>Confirm price, size, and stock with the retailer."}</p>`;
  attachImageFallbacks();
}
function attachImageFallbacks() {
  for (const img of document.querySelectorAll("img:not([data-fallback])")) {
    img.dataset.fallback = "ready";
    img.addEventListener(
      "error",
      () => {
        img.src = garmentArt({});
        img.alt = `${img.alt} (image unavailable)`;
      },
      { once: true },
    );
  }
}
function renderMessages() {
  const messages = expanded
    ? state.messages
    : [state.messages.at(-1)].filter(Boolean);
  $("#messages").innerHTML = messages
    .map(
      (m) =>
        `<div class="message ${m.role === "user" ? "user" : ""}">${expanded ? `<span class="message-label">${m.role === "user" ? "You" : "Shopagent"}</span>` : ""}${esc(m.text)}</div>`,
    )
    .join("");
  $("#messages").classList.toggle("expanded", expanded);
  $("#messages").scrollTop = $("#messages").scrollHeight;
  $("#conversation-button").textContent = expanded ? "Collapse" : "History";
  $("#conversation-button").setAttribute("aria-expanded", String(expanded));
  document.querySelector('[data-prompt="Under $150"]').textContent =
    `Under ${money(150, state.profile.currency)} ↗`;
  document.querySelector('[data-prompt="Under $150"]').dataset.query =
    "Under 150";
}
function renderProfile() {
  draftStyles ||= [...state.profile.styles];
  $("#main").innerHTML =
    `<div class="intro"><span class="eyebrow">A STYLE THAT’S YOUR OWN</span><h1>Get to know <em>you.</em></h1><p class="subtle">A few starting points. Your taste can always change.</p></div>
    <form id="profile-form"><section class="profile-section"><h2>What feels like you?</h2><p class="subtle">Pick a few, or leave room to explore.</p><div class="style-options">${STYLES.map((s) => `<button type="button" class="style-chip" data-style="${s}" aria-pressed="${draftStyles.includes(s)}">${s}</button>`).join("")}</div></section>
    <section class="profile-section"><h2>The practical things</h2><div class="form-grid"><label class="field">Usual clothing size<input name="size" maxlength="30" placeholder="e.g. M or US 6" value="${esc(state.profile.size)}"></label><label class="field">Usual budget per piece<input name="budget" type="number" required min="1" max="100000" step="1" value="${esc(state.profile.budget)}"></label><label class="field currency">Shopping currency<select name="currency">${["USD", "EUR", "GBP", "CAD", "AUD", "INR"].map((c) => `<option ${state.profile.currency === c ? "selected" : ""}>${c}</option>`).join("")}</select></label></div><p class="hint">Your budget nudges the ranking. Chat “under 150” to set a strict limit. Sizes help highlight listed options; they don’t predict fit.</p></section>
    <section class="profile-section"><h2>Memory, on your terms</h2><label class="toggle-row"><span>Remember products from pages I read</span><input type="checkbox" name="learning" ${state.profile.learning ? "checked" : ""}></label><p class="subtle">While the panel is open, follow stores you’ve authorized. Saves inform your picks. Turning this off stops automatic reading and new browsing memory; manual reading and saving still work.</p></section>
    <button class="primary full-width profile-save" type="submit">Save my preferences ↗</button></form>
    <section class="profile-section"><h2>A little inspiration</h2><p class="subtle">Keep outfit screenshots from your favorite corners of the internet. Your moodboard stays on this device.</p><div class="moodboard">${state.inspiration.map((item) => `<div class="mood-image"><img src="${esc(item.data)}" alt="${esc(item.name)}"><button data-remove-inspiration="${esc(item.id)}" aria-label="Remove ${esc(item.name)}">×</button></div>`).join("")}</div><label class="secondary upload-label">+ Add an image<input class="sr-only" id="inspiration-input" type="file" accept="image/png,image/jpeg,image/webp"></label><p class="hint">Up to 8 PNG, JPG, or WebP images, 5 MB each. Moodboard only in this prototype; images don’t influence recommendations yet.</p></section>
    <p class="collection-note"><button class="text-button" data-action="settings">Privacy, site access & your data ↗</button></p>`;
}
function openModal(title, content) {
  $("#modal-title").textContent = title;
  $("#modal-content").innerHTML = content;
  if (!$("#modal").open) $("#modal").showModal();
  attachImageFallbacks();
}
function details(id) {
  const p = product(id);
  if (!p) return;
  const ranked = rankProducts([p], { ...state, filters: {}, dismissed: [] })[0];
  const saved = state.saved.some((item) => item.id === p.id);
  const sizes = p.sizes?.length
    ? p.sizes.join(" · ")
    : "Not captured from this page";
  openModal(
    "A closer look",
    `<img class="detail-image" src="${esc(image(p))}" alt="${esc(p.title)}" referrerpolicy="no-referrer"><p class="product-brand detail-brand">${esc(p.store)} · ${esc(sourceLabel(p))}</p><h3 class="detail-title">${esc(p.title)}</h3><p class="detail-price">${esc(priceLabel(p))}</p><p class="subtle">${esc(p.description || "No product description was captured.")}</p>
    <dl><div class="evidence"><dt>Why this piece</dt><dd>${esc(ranked.reasons.join(". "))}.</dd></div><div class="evidence"><dt>Fabric</dt><dd>${esc(p.material || "Not captured from this page")}</dd></div><div class="evidence"><dt>Listed sizes</dt><dd>${esc(sizes)}</dd></div><div class="evidence"><dt>Stock</dt><dd>${esc(p.demo ? "Demo only" : p.availability ? p.availability.split("/").pop() : "Not captured · check the store")}</dd></div><div class="evidence"><dt>Reviews</dt><dd>${esc(p.rating ? `${p.rating.value} rating · ${p.rating.count || "Unknown number of"} ratings/reviews` : "No rating captured")}</dd></div></dl>
    ${p.reviews?.length ? `<h3 class="subtle">Excerpts captured from product markup</h3>${p.reviews.map((review) => `<p class="review">${esc(review)}</p>`).join("")}` : ""}
    <p class="evidence-note">${p.demo ? "This is a fictional sample product with an illustration. The brand, price, fabric, and sizes are examples." : "These details are a snapshot of the page, not a fit or quality guarantee. Listed sizes may include unavailable variants. Check the retailer’s size chart, reviews, current price, and stock before buying."}</p>
    <div class="modal-actions"><button class="primary" data-save="${esc(p.id)}" data-detail-save="true">${saved ? "Remove from saved" : "♡ Save this piece"}</button>${!p.demo && safeUrl(p.url) ? `<a class="secondary" href="${esc(safeUrl(p.url))}" target="_blank" rel="noopener noreferrer">Open at store ↗</a>` : ""}</div>`,
  );
}
function compare() {
  const pieces = state.saved.filter((p) => selection.has(p.id)).slice(0, 3);
  if (pieces.length < 2) return;
  const row = (title, fn) =>
    `<tr><th scope="row">${title}</th>${pieces.map((p) => `<td>${esc(fn(p))}</td>`).join("")}</tr>`;
  openModal(
    "Decisions, made easier.",
    `<p class="subtle">Compare what we know. Missing details stay missing.</p><div class="comparison-scroll"><table class="comparison"><thead><tr><th scope="col">The piece</th>${pieces.map((p) => `<th scope="col"><img src="${esc(image(p))}" alt="${esc(p.title)}" referrerpolicy="no-referrer"><span class="compare-title">${esc(p.title)}</span></th>`).join("")}</tr></thead><tbody>${row("Store", (p) => p.store)}${row("Price", priceLabel)}${row("Fabric", (p) => p.material || "Not captured")}${row("Sizes", (p) => p.sizes?.join(", ") || "Not captured")}${row("Style cues", (p) => rankProducts([p], { ...state, filters: {}, dismissed: [] })[0].tags.join(", ") || "No cues found")}${row("Evidence", sourceLabel)}</tbody></table></div><p class="evidence-note">${pieces.some((p) => p.demo) ? "Includes fictional demo items. " : ""}Prices can use different currencies. Fabric and style cues don’t establish quality, and a listed size doesn’t establish fit. Checkout takes place at each store.</p>`,
  );
}
async function settings() {
  const permissions = isExtension
    ? await chrome.permissions.getAll()
    : { origins: [] };
  openModal(
    "Your shopping, your space.",
    `<section class="settings-block"><h3>Local by design</h3><p>Your preferences, shortlist, conversation, browsing memory, and moodboard are stored in this Chrome profile. There’s no account, model API, or developer server. Product images load from their original image hosts, which receive normal image requests. Uploaded moodboard images stay local.</p><p class="hint">The local stylist supports a small set of filters. It doesn’t understand inspiration images, import social accounts, recommend exact sizes, or check out.</p></section>
    <section class="settings-block"><h3>Site access</h3><p>You choose which stores Shopagent can read. The panel reads product data on request, and follows authorized stores while open when memory is on. Tab metadata identifies the active store; other browsing is not saved.</p><div>${permissions.origins?.length ? permissions.origins.map((origin) => `<div class="permission"><span>${esc(origin)}</span><button class="text-button" data-revoke="${esc(origin)}">Revoke</button></div>`).join("") : '<p class="hint">No persistent site access granted.</p>'}</div></section>
    <section class="settings-block"><h3>Your data</h3><p>${state.saved.length} saved pieces · ${state.history.length} remembered products · ${state.inspiration.length} inspiration images.</p><div class="settings-actions"><button class="secondary" data-action="export">Export my data</button><button class="secondary" data-action="forget">Forget browsing memory</button><button class="secondary danger" data-action="reset-confirm">Reset everything</button></div><p class="hint">Reset deletes all local Shopagent data. Site access is managed separately above. Uninstalling also removes extension storage.</p></section>`,
  );
}
async function currentTab() {
  if (!isExtension) return null;
  const [result] = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });
  return result || null;
}
function originPattern(url) {
  try {
    const parsed = new URL(url);
    return /^https?:$/.test(parsed.protocol) ? `${parsed.origin}/*` : "";
  } catch {
    return "";
  }
}
async function scanPage(manual = true) {
  if (!isExtension) {
    toast(
      "Load the extension in Chrome to read real store pages. The demo works here.",
    );
    return;
  }
  const target = activeTab || (await currentTab());
  const origin = originPattern(target?.url);
  if (!origin) {
    toast(
      "Open a clothing store in a regular web tab, then click the Shopagent toolbar icon.",
    );
    return;
  }
  const version = ++scanVersion;
  try {
    if (manual) {
      const allowed = await chrome.permissions.request({ origins: [origin] });
      if (!allowed) {
        toast(
          "Site access wasn’t granted. You can keep exploring the demo or try another store.",
        );
        return;
      }
    } else if (!(await chrome.permissions.contains({ origins: [origin] })))
      return;
    if (version !== scanVersion) return;
    busy = true;
    demo = false;
    notice = "";
    page = null;
    if (manual) setTab("discover");
    else if (tab === "discover") renderMain();
    else renderContext();
    const result = await request({ type: "SCAN", tabId: target.id });
    if (version !== scanVersion) return;
    page = result;
    state = await request({ type: "READ" });
    notice = page.products.length
      ? ""
      : "No products found yet. Try a product detail page, scroll to load the collection, or refresh picks. Coverage varies by store.";
  } catch (error) {
    if (version !== scanVersion) return;
    page = null;
    notice = `Could not read this page. ${error.message}`;
  } finally {
    if (version === scanVersion) {
      busy = false;
      if (tab === "discover") renderMain();
      else renderContext();
    }
  }
}
async function followTab() {
  activeTab = await currentTab();
  scanVersion++;
  busy = false;
  if (
    state.profile.learning &&
    originPattern(activeTab?.url) &&
    (await chrome.permissions.contains({
      origins: [originPattern(activeTab.url)],
    }))
  ) {
    demo = false;
    page = null;
    if (tab === "discover") renderMain();
    else renderContext();
    await scanPage(false);
  } else if (!demo) {
    page = null;
    notice = state.profile.learning
      ? "Choose Read this page to allow access to this store. Your shortlist and conversation are still here."
      : "Automatic reading is paused. Read this page whenever you want new picks.";
    if (tab === "discover") renderMain();
    else renderContext();
  } else renderContext();
}
async function sendQuery(query) {
  const text = query.trim().slice(0, 500);
  if (!text) return;
  const result = refineQuery(text, state.filters, state.profile.currency);
  await mutate({
    type: "CHAT",
    filters: result.filters,
    messages: [
      { role: "user", text },
      { role: "assistant", text: result.reply },
    ],
  });
  $("#chat-input").value = "";
  setTab("discover");
  renderMessages();
}

async function runAction(action) {
  switch (action) {
    case "discover":
      setTab("discover");
      break;
    case "profile":
      setTab("profile");
      break;
    case "scan":
      await scanPage();
      break;
    case "demo":
      scanVersion++;
      busy = false;
      demo = true;
      notice = "";
      setTab("discover");
      break;
    case "clear":
      await mutate({ type: "FILTERS", filters: {} });
      renderMain();
      break;
    case "restore":
      await mutate({ type: "RESTORE" });
      renderMain();
      toast("Passed pieces are back in the mix.");
      break;
    case "compare":
      compare();
      break;
    case "settings":
      await settings();
      break;
    case "export": {
      const blob = new Blob([JSON.stringify(state, null, 2)], {
        type: "application/json",
      });
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = `shopagent-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(href), 1000);
      break;
    }
    case "forget":
      await mutate({ type: "FORGET_HISTORY" });
      await settings();
      toast("Browsing memory cleared. Saved pieces are still here.");
      break;
    case "reset-confirm":
      openModal(
        "Start fresh?",
        '<p class="subtle">This permanently deletes your local preferences, saved pieces, conversation, inspiration, and browsing memory. Site permissions stay as they are.</p><div class="modal-actions"><button class="primary" data-action="reset">Yes, delete my local data</button><button class="secondary" data-action="cancel">Keep my data</button></div>',
      );
      break;
    case "reset":
      scanVersion++;
      busy = false;
      await mutate({ type: "RESET" });
      demo = true;
      page = null;
      notice = "";
      selection.clear();
      $("#modal").close();
      setTab("discover");
      renderMessages();
      toast("A fresh start. Your local data has been deleted.");
      break;
    case "cancel":
      $("#modal").close();
      break;
  }
}

document.addEventListener("click", async (event) => {
  const button = event.target.closest("button, a.brand");
  if (!button) return;
  try {
    if (button.matches("a.brand")) {
      event.preventDefault();
      setTab("discover");
    }
    if (button.dataset.tab) setTab(button.dataset.tab);
    if (button.dataset.action) await runAction(button.dataset.action);
    if (button.dataset.detail) details(button.dataset.detail);
    if (button.dataset.save) {
      const p = product(button.dataset.save);
      if (!p) return;
      const wasSaved = state.saved.some((item) => item.id === p.id);
      await mutate({ type: "SAVE", product: p });
      renderMain();
      if (button.dataset.detailSave) details(p.id);
      toast(
        wasSaved
          ? "Removed from your shortlist."
          : "Saved. A good find, wherever you go.",
      );
    }
    if (button.dataset.dismiss) {
      await mutate({ type: "DISMISS", id: button.dataset.dismiss });
      renderMain();
      toast("Passed for now. You can restore passed pieces below.");
    }
    if (button.dataset.removeFilter) {
      const filters = { ...state.filters };
      delete filters[button.dataset.removeFilter];
      await mutate({ type: "FILTERS", filters });
      renderMain();
    }
    if (button.dataset.prompt)
      await sendQuery(button.dataset.query || button.dataset.prompt);
    if (button.dataset.style) {
      const style = button.dataset.style;
      draftStyles = draftStyles.includes(style)
        ? draftStyles.filter((s) => s !== style)
        : [...draftStyles, style];
      button.setAttribute("aria-pressed", String(draftStyles.includes(style)));
    }
    if (button.dataset.removeInspiration) {
      await mutate({
        type: "REMOVE_INSPIRATION",
        id: button.dataset.removeInspiration,
      });
      renderMain();
      toast("Inspiration removed.");
    }
    if (button.dataset.revoke) {
      await chrome.permissions.remove({ origins: [button.dataset.revoke] });
      page = null;
      scanVersion++;
      busy = false;
      renderMain();
      await settings();
      toast("Site access revoked. Saved items stay in your shortlist.");
    }
  } catch (error) {
    toast(error.message);
  }
});
$("#scan-button").addEventListener("click", () => scanPage());
$("#settings-button").innerHTML = icon("settings");
$("#settings-button").addEventListener("click", () =>
  settings().catch((error) => toast(error.message)),
);
$("#close-modal").addEventListener("click", () => $("#modal").close());
$("#modal").addEventListener("click", (event) => {
  if (event.target === $("#modal")) {
    const r = $("#modal").getBoundingClientRect();
    if (
      event.clientX < r.left ||
      event.clientX > r.right ||
      event.clientY < r.top ||
      event.clientY > r.bottom
    )
      $("#modal").close();
  }
});
$("#conversation-button").addEventListener("click", () => {
  expanded = !expanded;
  renderMessages();
});
$(".tabs").addEventListener("keydown", (event) => {
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
  event.preventDefault();
  const names = ["discover", "saved", "profile"];
  const index = names.indexOf(tab);
  setTab(
    event.key === "Home"
      ? names[0]
      : event.key === "End"
        ? names[2]
        : names[(index + (event.key === "ArrowRight" ? 1 : 2)) % 3],
    true,
  );
});
$("#chat-form").addEventListener("submit", (event) => {
  event.preventDefault();
  sendQuery($("#chat-input").value).catch((error) => toast(error.message));
});
document.addEventListener("submit", async (event) => {
  if (event.target.id !== "profile-form") return;
  event.preventDefault();
  const form = new FormData(event.target);
  const budget = Number(form.get("budget"));
  if (!Number.isFinite(budget) || budget < 1 || budget > 100000) {
    toast("Choose a budget between 1 and 100,000.");
    return;
  }
  const currency = String(form.get("currency"));
  const changedCurrency = currency !== state.profile.currency;
  try {
    await mutate({
      type: "PROFILE",
      profile: {
        styles: draftStyles || [],
        size: String(form.get("size")).trim(),
        budget,
        currency,
        learning: form.get("learning") === "on",
      },
    });
    if (changedCurrency) {
      const filters = { ...state.filters };
      delete filters.maxPrice;
      await mutate({ type: "FILTERS", filters });
    }
    setTab("discover");
    renderMessages();
    toast("Your preferences are saved. Let’s find your kind of pieces.");
  } catch (error) {
    toast(error.message);
  }
});
document.addEventListener("change", async (event) => {
  if (event.target.dataset.compareSelect) {
    const id = event.target.dataset.compareSelect;
    if (event.target.checked && selection.size >= 3) {
      event.target.checked = false;
      toast("Choose up to three pieces to compare.");
      return;
    }
    if (event.target.checked) selection.add(id);
    else selection.delete(id);
    const scroll = $("#main").scrollTop;
    renderMain();
    $("#main").scrollTop = scroll;
  }
  if (event.target.id === "inspiration-input") {
    const file = event.target.files[0];
    if (!file) return;
    try {
      if (
        !["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
        file.size > 5 * 1024 * 1024
      )
        throw new Error("Choose a PNG, JPG, or WebP image smaller than 5 MB.");
      const bitmap = await createImageBitmap(file);
      const scale = Math.min(1, 420 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      canvas
        .getContext("2d")
        .drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close();
      await mutate({
        type: "INSPIRATION",
        image: {
          id: crypto.randomUUID(),
          name: file.name.slice(0, 100),
          data: canvas.toDataURL("image/jpeg", 0.8),
        },
      });
      renderMain();
      toast("Added to your local moodboard.");
    } catch (error) {
      toast(error.message);
    }
  }
});

async function init() {
  state = await request({ type: "READ" });
  renderMain();
  renderMessages();
  if (isExtension) {
    activeTab = await currentTab();
    chrome.tabs.onActivated.addListener(() =>
      followTab().catch((error) => toast(error.message)),
    );
    chrome.tabs.onUpdated.addListener((id, info) => {
      if (id === activeTab?.id && (info.status === "complete" || info.url))
        followTab().catch((error) => toast(error.message));
    });
    chrome.storage.onChanged.addListener(async (changes) => {
      if (!changes.shopagent) return;
      state = hydrateState(changes.shopagent.newValue);
      $("#saved-count").textContent = state.saved.length;
    });
    await followTab();
  }
}
init().catch((error) => {
  $("#main").innerHTML =
    `<div class="empty-state"><h2>Let’s try that again.</h2><p>${esc(error.message)}</p><p>Reload the extension from Chrome’s extensions page, then reopen the panel.</p></div>`;
});
