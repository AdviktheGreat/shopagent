(() => {
  globalThis.ShopagentAdapters ||= {};
  globalThis.ShopagentAdapters.quince = (context) => {
    if (!/^(www\.)?quince\.com$/.test(location.hostname)) return null;
    const { nodes, clean, url, meta, scalar, parsePrice, add } = context;
    const { normalizeAvailability, summarize } =
      globalThis.ShopagentVariantEvidence;
    const typeIs = (node, type) =>
      []
        .concat(node["@type"] || [])
        .some((t) => String(t).split("/").pop() === type);
    const identity = (value) => {
      const safe = url(value);
      if (!safe) return "";
      const result = new URL(safe);
      result.searchParams.delete("size");
      result.searchParams.delete("color");
      return result.href;
    };
    const groups = nodes.filter((node) => typeIs(node, "ProductGroup"));
    const group = groups.find(
      (node) => identity(node.url || node["@id"]) === identity(location.href),
    );
    if (group) {
      const children = []
        .concat(group.hasVariant || [])
        .filter((v) => v && typeof v === "object")
        .slice(0, 120);
      const variants = children.map((child) => {
        const offer =
          []
            .concat(child.offers || [])
            .find((o) => o && typeof o === "object") || {};
        return {
          id: clean(child.sku || child["@id"] || child.url, 240),
          sku: clean(child.sku, 120),
          size: clean(scalar(child.size), 40),
          color: clean(scalar(child.color), 80),
          url: url(offer.url || child.url || child["@id"]),
          image: child.image,
          price: parsePrice(offer.price),
          currency: offer.priceCurrency || "",
          ...normalizeAvailability(offer.availability),
          evidence: "Quince offer markup",
        };
      });
      const current = nodes.find(
        (node) =>
          typeIs(node, "Product") &&
          node.isVariantOf &&
          identity(node.isVariantOf["@id"]) === identity(location.href),
      );
      const query = new URL(location.href).searchParams;
      const queryColor = query.get("color");
      const matchingColor = variants.find(
        (v) =>
          v.url &&
          new URL(v.url).searchParams.get("color")?.toLowerCase() ===
            queryColor?.toLowerCase(),
      );
      if (queryColor && !matchingColor)
        return {
          handled: true,
          adapter: "quince",
          store: "Quince",
          pageType: "loading",
        };
      const color =
        matchingColor?.color ||
        clean(scalar(current?.color), 80) ||
        variants[0]?.color ||
        "";
      const form = document.querySelector('[data-testid="product-form"]');
      const sizeButtons = [
        ...(form?.querySelectorAll(
          'button[data-testid^="option-container_"]',
        ) || []),
      ];
      const checked = sizeButtons.find(
        (button) => button.getAttribute("aria-checked") === "true",
      );
      const chosenSize =
        query.get("size") ||
        checked
          ?.getAttribute("data-testid")
          .slice("option-container_".length) ||
        "";
      for (const variant of variants.filter((v) => v.color === color)) {
        const control = sizeButtons.find(
          (button) =>
            button
              .getAttribute("data-testid")
              .slice("option-container_".length)
              .toLowerCase() === variant.size.toLowerCase(),
        );
        if (
          control?.disabled ||
          control?.getAttribute("aria-disabled") === "true"
        ) {
          variant.available = false;
          variant.availability = "out_of_stock";
          variant.evidence = "Quince offer and disabled product option";
        }
      }
      const selected = variants.find(
        (v) =>
          v.color === color &&
          chosenSize &&
          v.size.toLowerCase() === chosenSize.toLowerCase(),
      );
      const candidates = variants.filter((v) => v.color === color);
      const currencies = [
        ...new Set(candidates.map((v) => v.currency).filter(Boolean)),
      ];
      const priced =
        currencies.length <= 1
          ? candidates.filter(
              (v) =>
                v.price != null &&
                (!currencies.length || v.currency === currencies[0]),
            )
          : [];
      const min = priced.length
        ? Math.min(...priced.map((v) => v.price))
        : null;
      const baseUrl = url(
        current?.offers?.url || current?.url || current?.["@id"],
      );
      const colorUrl = candidates[0]?.url ? new URL(candidates[0].url) : null;
      colorUrl?.searchParams.delete("size");
      add({
        id: identity(group.url || group["@id"]),
        store: "Quince",
        title:
          current?.color === color && current.name
            ? current.name
            : `${group.name}${color ? " in " + color : ""}`,
        url:
          selected?.url || colorUrl?.href || baseUrl || identity(group["@id"]),
        image:
          selected?.image ||
          candidates.find((v) => v.image)?.image ||
          current?.image ||
          meta("og:image"),
        price: selected ? selected.price : min,
        currency: selected
          ? selected.currency
          : currencies.length === 1
            ? currencies[0]
            : "",
        priceFrom: !selected && priced.some((v) => v.price !== min),
        currencySource: "Quince offer markup",
        description: current?.description || group.description || "",
        material: current?.material || group.material || "",
        ...summarize(variants, color),
        selectedVariantId: selected?.id || "",
        selectedOptions: { color, size: selected?.size || "" },
        source: "Quince product markup",
      });
      return {
        handled: true,
        adapter: "quince",
        store: "Quince",
        pageType: "product",
      };
    }
    if (groups.length)
      return {
        handled: true,
        adapter: "quince",
        store: "Quince",
        pageType: "loading",
      };
    const cards = [
      ...document.querySelectorAll('main [data-testid="product-card"]'),
    ].slice(0, 120);
    if (!cards.length && !location.pathname.startsWith("/shop/")) return null;
    let locale = "";
    const configuration = document.querySelector(
      'script#__NEXT_DATA__[type="application/json"]',
    );
    if (configuration && configuration.textContent.length < 2000000) {
      try {
        const data = JSON.parse(configuration.textContent);
        locale = data.locale || data.props?.pageProps?.locale || "";
      } catch {}
    }
    // Verified US market only. A bare dollar sign or an arbitrary locale is not a currency.
    const configuredCurrency =
      typeof locale === "string" && locale.toLowerCase() === "en-us"
        ? "USD"
        : "";
    for (const card of cards) {
      if (
        !card.getClientRects().length ||
        card.closest('[aria-hidden="true"]') ||
        getComputedStyle(card).visibility === "hidden"
      )
        continue;
      const anchor =
        card.querySelector('[data-testid="product-card-title"] a') ||
        card.querySelector("h2 a");
      const image =
        card.querySelector('[data-slot="product-tile-image-primary"] img') ||
        card.querySelector("img");
      const priceNode = card.querySelector(
        '[data-testid="product-card-price"]',
      );
      if (!anchor || !image) continue;
      const prices = priceNode?.cloneNode(true);
      prices
        ?.querySelectorAll('s,del,[aria-hidden="true"]')
        .forEach((e) => e.remove());
      const dataPrice = prices?.querySelector("data[data-currency]");
      const text = clean(prices?.textContent, 160);
      const explicit =
        dataPrice?.dataset.currency ||
        text.match(/\b(USD|EUR|GBP|CAD|AUD)\b/)?.[1] ||
        (text.includes("€") ? "EUR" : text.includes("£") ? "GBP" : "");
      add({
        store: "Quince",
        title: clean(anchor.textContent, 180),
        url: anchor.getAttribute("href"),
        image: image.currentSrc || image.src || image.getAttribute("data-src"),
        price: parsePrice(
          dataPrice?.getAttribute("value") || text.match(/[\d][\d.,]*/)?.[0],
        ),
        currency: explicit || configuredCurrency,
        currencySource: explicit
          ? "Quince price markup"
          : configuredCurrency
            ? "Verified Quince en-us market mapping"
            : "Unknown",
        priceFrom: /\bfrom\b/i.test(text),
        sizes: [],
        source: "Quince collection card",
      });
    }
    return {
      handled: true,
      adapter: "quince",
      store: "Quince",
      pageType: "collection",
    };
  };
})();
