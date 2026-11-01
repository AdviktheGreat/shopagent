(() => {
  globalThis.ShopagentAdapters ||= {};
  globalThis.ShopagentAdapters.everlane = (context) => {
    if (!/^(www\.)?everlane\.com$/.test(location.hostname)) return null;
    const { nodes, clean, url, meta, parsePrice, add, scalar } = context;
    const { normalizeAvailability, summarize } =
      globalThis.ShopagentVariantEvidence;
    const identity = (value) => {
      const safe = url(value);
      if (!safe) return "";
      const result = new URL(safe);
      result.searchParams.delete("variant");
      return result.href;
    };
    const typeIs = (node, type) =>
      []
        .concat(node["@type"] || [])
        .some((t) => String(t).split("/").pop() === type);
    const groups = nodes.filter((node) => typeIs(node, "ProductGroup"));
    const group = groups.find(
      (node) => identity(node.url || node["@id"]) === identity(location.href),
    );
    if (group) {
      const children = []
        .concat(group.hasVariant || [])
        .filter((child) => child && typeof child === "object");
      const offers = []
        .concat(
          group.offers || [],
          ...children.map((child) => child.offers || []),
        )
        .filter((offer) => offer && typeof offer === "object");
      const priced = offers
        .map((offer) => ({
          ...offer,
          amount: parsePrice(offer.price ?? offer.lowPrice),
        }))
        .filter((offer) => offer.amount != null);
      const currencies = [
        ...new Set(priced.map((offer) => offer.priceCurrency).filter(Boolean)),
      ];
      const comparable =
        currencies.length === 1
          ? priced.filter((offer) => offer.priceCurrency === currencies[0])
          : [];
      const prices = comparable.map((offer) => offer.amount);
      const amount = prices.length
        ? Math.min(...prices)
        : parsePrice(meta("og:price:amount"));
      // Deliberately scoped to product size controls, never generic input fields.
      const productRoot = document.querySelector("main product-info");
      const controls = [
        ...(productRoot?.querySelectorAll(
          'variant-selects input[data-option-name="Size"]',
        ) || []),
      ];
      const color = clean(
        scalar(group.color) || String(group.name || "").split(" | ")[1],
        80,
      );
      const variants = children.slice(0, 120).map((child) => {
        const offer =
          []
            .concat(child.offers || [])
            .find((o) => o && typeof o === "object") || {};
        const namedSize = String(child.name || "")
          .split(" - ")
          .at(-1);
        const size = clean(
          scalar(child.size) ||
            (controls.some((c) => c.value === namedSize) ? namedSize : ""),
          40,
        );
        const control = controls.find((c) => c.value === size);
        const label = [...(control?.labels || [])].find((label) =>
          productRoot.contains(label),
        );
        let stock = normalizeAvailability(offer.availability);
        if (label?.dataset.available === "false")
          stock = { availability: "out_of_stock", available: false };
        else if (
          label?.dataset.available === "true" &&
          stock.available !== true
        )
          stock = { availability: "in_stock", available: true };
        return {
          id: clean(
            child.sku || url(offer.url || child.url || child["@id"]),
            240,
          ),
          sku: clean(child.sku, 120),
          size,
          color: clean(scalar(child.color) || color, 80),
          url: url(offer.url || child.url || child["@id"]),
          image: child.image,
          price: parsePrice(offer.price),
          currency: offer.priceCurrency || "",
          ...stock,
          evidence: label?.hasAttribute("data-available")
            ? "product option and offer markup"
            : "offer markup",
        };
      });
      const queryVariant = new URL(location.href).searchParams.get("variant");
      const checkedSize = controls.find((c) => c.checked)?.value || "";
      const selected =
        variants.find(
          (v) =>
            queryVariant &&
            v.url &&
            new URL(v.url).searchParams.get("variant") === queryVariant,
        ) || variants.find((v) => checkedSize && v.size === checkedSize);
      const evidence = summarize(variants, color);
      add({
        id: identity(group.url || group["@id"]),
        title: group.name || meta("og:title"),
        url: selected?.url || identity(group.url || group["@id"]),
        image:
          group.image ||
          children.find((child) => child.image)?.image ||
          meta("og:image:secure_url") ||
          meta("og:image"),
        price: selected ? selected.price : amount,
        currency: selected
          ? selected.currency
          : currencies.length === 1
            ? currencies[0]
            : meta("og:price:currency"),
        priceFrom:
          !selected &&
          (prices.some((price) => price !== amount) ||
            offers.some((offer) => offer.lowPrice != null)),
        brand: clean(group.brand?.name || group.brand, 80),
        description: group.description || "",
        material: group.material || "",
        ...evidence,
        selectedVariantId: selected?.id || "",
        selectedOptions: { color, size: selected?.size || "" },
        source: "Everlane product markup",
      });
      return { handled: true, adapter: "everlane", pageType: "product" };
    }
    if (groups.length && location.pathname.startsWith("/products/"))
      return { handled: true, adapter: "everlane", pageType: "loading" };
    const cards = [
      ...document.querySelectorAll("main .blm-product-search__result"),
    ].slice(0, 120);
    if (!cards.length && !location.pathname.startsWith("/collections/"))
      return null;
    const currencyText =
      document.querySelector(".localization-form__select")?.textContent || "";
    const currency =
      meta("og:price:currency") ||
      currencyText.match(
        /\b(USD|EUR|GBP|CAD|AUD|INR|JPY|CHF|NZD|SEK|DKK|NOK)\b/,
      )?.[1] ||
      "";
    for (const card of cards) {
      if (
        !card.getClientRects().length ||
        card.closest('[aria-hidden="true"]') ||
        getComputedStyle(card).visibility === "hidden"
      )
        continue;
      const title = card.querySelector(".js-product-title");
      const anchor = title || card.querySelector('a[href*="/products/"]');
      const image = card.querySelector(".js-product-image, img");
      const priceText = clean(
        card.querySelector(".js-product-price")?.textContent,
        120,
      );
      const firstAmount = priceText.match(/[\d][\d.,]*/)?.[0];
      if (!anchor || !image) continue;
      add({
        title: clean(title?.textContent || image.alt, 180),
        url: anchor.getAttribute("href"),
        image:
          image.currentSrc ||
          image.getAttribute("src") ||
          image.getAttribute("data-src"),
        price: parsePrice(firstAmount),
        currency,
        priceFrom: /\bfrom\b|\d\s*[-–]\s*[$€£]?\s*\d/i.test(priceText),
        source: "Everlane collection card",
        sizes: [],
      });
    }
    return { handled: true, adapter: "everlane", pageType: "collection" };
  };
})();
