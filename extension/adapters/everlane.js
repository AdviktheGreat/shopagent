(() => {
  globalThis.ShopagentAdapters ||= {};
  globalThis.ShopagentAdapters.everlane = (context) => {
    if (!/^(www\.)?everlane\.com$/.test(location.hostname)) return null;
    const { nodes, clean, url, meta, parsePrice, add } = context;
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
      add({
        id: identity(group.url || group["@id"]),
        title: group.name || meta("og:title"),
        url: identity(group.url || group["@id"]),
        image:
          group.image ||
          children.find((child) => child.image)?.image ||
          meta("og:image:secure_url") ||
          meta("og:image"),
        price: amount,
        currency:
          currencies.length === 1 ? currencies[0] : meta("og:price:currency"),
        priceFrom:
          prices.some((price) => price !== amount) ||
          offers.some((offer) => offer.lowPrice != null),
        brand: clean(group.brand?.name || group.brand, 80),
        description: group.description || "",
        material: group.material || "",
        sizes: [],
        source: "Everlane product markup",
      });
      return { handled: true, adapter: "everlane", pageType: "product" };
    }
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
