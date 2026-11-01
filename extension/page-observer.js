(() => {
  // A live panel port owns the session; nothing observes after the last port closes.
  if (globalThis.ShopagentPageObserver) return;
  const ports = new Set();
  let observer, timer, urlTimer;
  let lastUrl = location.href;
  const relevant =
    'script[type="application/ld+json"],script#__NEXT_DATA__[type="application/json"],meta[property^="og:"],meta[property^="product:"],product-info,variant-selects,.blm-product-search__result,.product-card,.product-item,.product-tile,[data-testid="product-card"],[data-testid="product-form"],[itemprop="price"],main h1,main .price';
  const element = (node) =>
    node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
  const concernsProducts = (node) => {
    const target = element(node);
    return Boolean(target?.matches(relevant) || target?.closest(relevant));
  };
  const notify = (reason) => {
    if (timer || !ports.size) return;
    timer = setTimeout(() => {
      timer = null;
      for (const port of ports) {
        try {
          port.postMessage({
            type: "PAGE_CHANGED",
            url: location.href,
            reason,
          });
        } catch {
          ports.delete(port);
        }
      }
      if (!ports.size) stop();
    }, 350);
  };
  const checkUrl = () => {
    if (location.href === lastUrl) return;
    lastUrl = location.href;
    notify("navigation");
  };
  const onChange = (event) => {
    if (concernsProducts(event.target)) notify("option");
  };
  const start = () => {
    lastUrl = location.href;
    observer = new MutationObserver((records) => {
      if (
        records.some(
          (record) =>
            concernsProducts(record.target) ||
            [...record.addedNodes].some((node) => {
              const target = element(node);
              return (
                concernsProducts(node) ||
                Boolean(target?.querySelector?.(relevant))
              );
            }),
        )
      )
        notify("product");
      checkUrl();
    });
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: [
        "src",
        "srcset",
        "data-src",
        "content",
        "value",
        "checked",
        "disabled",
        "aria-checked",
        "aria-disabled",
        "aria-selected",
        "data-available",
        "data-orderable-state",
        "href",
        "hidden",
        "class",
        "style",
      ],
    });
    document.addEventListener("change", onChange, true);
    document.addEventListener("input", onChange, true);
    window.addEventListener("popstate", checkUrl);
    window.addEventListener("hashchange", checkUrl);
    // Check only the URL for pushState/replaceState changes; no page-world hooks.
    urlTimer = setInterval(checkUrl, 1000);
  };
  const stop = () => {
    observer?.disconnect();
    observer = null;
    clearTimeout(timer);
    timer = null;
    clearInterval(urlTimer);
    urlTimer = null;
    document.removeEventListener("change", onChange, true);
    document.removeEventListener("input", onChange, true);
    window.removeEventListener("popstate", checkUrl);
    window.removeEventListener("hashchange", checkUrl);
  };
  chrome.runtime.onConnect.addListener((port) => {
    if (
      port.name !== "shopagent-observe-v1" ||
      port.sender?.id !== chrome.runtime.id ||
      port.sender?.url?.split(/[?#]/)[0] !== chrome.runtime.getURL("panel.html")
    )
      return;
    ports.add(port);
    if (ports.size === 1) start();
    port.onDisconnect.addListener(() => {
      ports.delete(port);
      if (!ports.size) stop();
    });
    port.postMessage({ type: "OBSERVER_READY", url: location.href });
  });
  globalThis.ShopagentPageObserver = {
    get connected() {
      return ports.size;
    },
  };
})();
