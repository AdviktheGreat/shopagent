import {
  freshState,
  hydrateState,
  mergeProducts,
  canonicalUrl,
  productSignature,
} from "./core.js";
import { EXTRACTION_FILES } from "./reader-files.js";

let queue = Promise.resolve();
function serial(task) {
  const result = queue.then(task);
  queue = result.catch(() => {});
  return result;
}
async function readState() {
  return hydrateState((await chrome.storage.local.get("shopagent")).shopagent);
}
async function updateState(action) {
  return serial(async () => {
    let state = await readState();
    switch (action.type) {
      case "PROFILE":
        state.profile = { ...state.profile, ...action.profile };
        state.onboarded = true;
        break;
      case "SAVE":
        if (!action.product?.id || !action.product?.title)
          throw new Error("This product could not be saved.");
        if (state.saved.some((p) => p.id === action.product.id))
          state.saved = state.saved.filter((p) => p.id !== action.product.id);
        else {
          state.saved = mergeProducts(
            state.saved,
            [{ ...action.product, savedAt: Date.now() }],
            100,
          );
          state.dismissed = state.dismissed.filter(
            (id) => id !== action.product.id,
          );
        }
        break;
      case "DISMISS":
        state.dismissed = [...new Set([...state.dismissed, action.id])].slice(
          -300,
        );
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
        state.historyEpoch++;
        break;
      case "RESET": {
        const epoch = state.historyEpoch + 1;
        state = freshState();
        state.historyEpoch = epoch;
        break;
      }
      default:
        throw new Error("Unknown update.");
    }
    await chrome.storage.local.set({ shopagent: state });
    return state;
  });
}

function stalePage() {
  const error = new Error(
    "The page changed while reading. Refresh picks to read the new page.",
  );
  error.code = "STALE_PAGE";
  return error;
}
async function scan(tabId, expectedUrl) {
  const initial = await readState();
  const tab = await chrome.tabs.get(tabId);
  if (expectedUrl && canonicalUrl(tab.url) !== canonicalUrl(expectedUrl))
    throw stalePage();
  if (!/^https?:\/\//.test(tab.url || ""))
    throw new Error(
      "Open a clothing store in a regular web tab, then try again. Chrome internal pages and the Web Store cannot be read.",
    );
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    files: EXTRACTION_FILES,
  });
  const page = results[0]?.result;
  if (!page)
    throw new Error(
      "This page could not be read. Refresh the store page and try again.",
    );
  await serial(async () => {
    const currentTab = await chrome.tabs.get(tabId);
    if (
      canonicalUrl(currentTab.url) !== canonicalUrl(tab.url) ||
      page.url !== canonicalUrl(currentTab.url)
    )
      throw stalePage();
    const state = await readState();
    if (state.profile.learning && state.historyEpoch === initial.historyEpoch) {
      if (
        !(await chrome.permissions.contains({
          origins: [`${new URL(currentTab.url).origin}/*`],
        }))
      )
        return;
      const prior = new Map(
        state.history.map((product) => [product.id, product]),
      );
      const changed = page.products.filter(
        (product) =>
          !product.demo &&
          (!prior.has(product.id) ||
            productSignature(prior.get(product.id)) !==
              productSignature({ ...prior.get(product.id), ...product })),
      );
      if (!changed.length) return;
      state.history = mergeProducts(
        state.history,
        changed.map((p) => ({ ...p, seenAt: Date.now() })),
        150,
      );
      await chrome.storage.local.set({ shopagent: state });
    }
  });
  return page;
}

async function observe(tabId) {
  const state = await readState();
  const tab = await chrome.tabs.get(tabId);
  if (
    !state.profile.learning ||
    !tab.active ||
    !/^https?:\/\//.test(tab.url || "")
  )
    return { watching: false };
  if (
    !(await chrome.permissions.contains({
      origins: [`${new URL(tab.url).origin}/*`],
    }))
  )
    throw new Error("Site access is required for automatic refresh.");
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["page-observer.js"],
  });
  return { watching: true, url: tab.url };
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch(console.error);
  chrome.storage.local
    .setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" })
    .catch(console.error);
});
chrome.runtime.onStartup.addListener(() => {
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch(console.error);
});
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (
    sender.id !== chrome.runtime.id ||
    sender.url?.split(/[?#]/)[0] !== chrome.runtime.getURL("panel.html")
  )
    return;
  const task =
    message.type === "READ"
      ? readState()
      : message.type === "SCAN"
        ? scan(message.tabId, message.expectedUrl)
        : message.type === "OBSERVE"
          ? observe(message.tabId)
          : updateState(message);
  task
    .then((data) => respond({ ok: true, data }))
    .catch((error) =>
      respond({ ok: false, error: error.message, code: error.code }),
    );
  return true;
});
