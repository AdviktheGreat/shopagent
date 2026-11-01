(() => {
  // Reads product markup and explicitly scoped product-option controls only.
  // Never reads cookies, account, address, or payment fields.
  const clean = (value, limit = 1200) =>
    String(value ?? "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, limit);
  const stripHtml = (value) => {
    const doc = new DOMParser().parseFromString(
      String(value ?? "").slice(0, 15000),
      "text/html",
    );
    return clean(doc.body.textContent);
  };
  const url = (value) => {
    if (typeof value !== "string" || !value.trim()) return "";
    try {
      const result = new URL(value, location.href);
      if (!["http:", "https:"].includes(result.protocol)) return "";
      result.hash = "";
      for (const key of [...result.searchParams.keys()])
        if (/^(utm_|gclid$|fbclid$|ref$)/i.test(key))
          result.searchParams.delete(key);
      return result.href;
    } catch {
      return "";
    }
  };
  const meta = (name) =>
    document.querySelector(`meta[property="${name}"], meta[name="${name}"]`)
      ?.content || "";
  const parsePrice = (value) => {
    if (typeof value === "number")
      return Number.isFinite(value) && value >= 0 ? value : null;
    let text = String(value ?? "")
      .trim()
      .replace(/[^\d,.]/g, "");
    if (!text) return null;
    if (/\,\d{2}$/.test(text) && !/\.\d{2}$/.test(text))
      text = text.replace(/\./g, "").replace(",", ".");
    else text = text.replace(/,/g, "");
    const result = Number(text);
    return Number.isFinite(result) && result >= 0 ? result : null;
  };
  const scalar = (value) =>
    typeof value === "object" && value !== null
      ? value.name || value.value || ""
      : value;
  const imageUrl = (value) => {
    const item = Array.isArray(value) ? value[0] : value;
    return url(
      typeof item === "object" && item !== null
        ? item.url || item.contentUrl
        : item,
    );
  };
  const store = clean(
    meta("og:site_name") || location.hostname.replace(/^www\./, ""),
    100,
  );
  const nodes = [];
  const walk = (node, depth = 0) => {
    if (depth > 12 || nodes.length >= 1200 || !node || typeof node !== "object")
      return;
    if (Array.isArray(node)) {
      node.slice(0, 200).forEach((x) => walk(x, depth + 1));
      return;
    }
    nodes.push(node);
    for (const [key, value] of Object.entries(node))
      if (key !== "description" && typeof value === "object")
        walk(value, depth + 1);
  };
  for (const script of [
    ...document.querySelectorAll('script[type="application/ld+json"]'),
  ].slice(0, 25)) {
    if (script.textContent.length > 1500000) continue;
    try {
      walk(JSON.parse(script.textContent));
    } catch {
      /* Malformed retailer markup is common. */
    }
  }
  const products = new Map();
  const add = (product) => {
    const title = clean(product.title, 180);
    const href = url(product.url);
    if (!title || !href || products.size >= 60) return;
    const normalized = {
      ...product,
      id: url(product.id) || href,
      url: href,
      title,
      store: clean(product.store || store, 100),
      image: imageUrl(product.image),
      description: stripHtml(product.description),
      price: parsePrice(product.price),
      currency: /^[A-Z]{3}$/.test(product.currency || "")
        ? product.currency
        : "",
      material: clean(product.material, 300),
      colors: []
        .concat(product.colors || [])
        .map((color) => clean(color, 80))
        .filter(Boolean)
        .slice(0, 40),
      selectedOptions: {
        color: clean(product.selectedOptions?.color, 80),
        size: clean(product.selectedOptions?.size, 40),
      },
      selectedVariantId: clean(product.selectedVariantId, 240),
      variants: []
        .concat(product.variants || [])
        .slice(0, 120)
        .map((v) => ({
          id: clean(v.id, 240),
          sku: clean(v.sku, 120),
          color: clean(v.color, 80),
          size: clean(v.size, 40),
          url: url(v.url),
          image: imageUrl(v.image),
          price: parsePrice(v.price),
          currency: /^[A-Z]{3}$/.test(v.currency || "") ? v.currency : "",
          available:
            v.available === true ? true : v.available === false ? false : null,
          availability: clean(v.availability, 40),
          evidence: clean(v.evidence, 100),
        })),
      sizes: [
        ...new Set(
          (product.sizes || [])
            .map((s) => clean(scalar(s), 40))
            .filter(Boolean),
        ),
      ].slice(0, 30),
      tags: [],
      capturedAt: Date.now(),
    };
    const existing = products.get(href);
    if (
      !existing ||
      (normalized.source === "structured" && existing.source !== "structured")
    )
      products.set(href, normalized);
  };
  const pageResult = (details = {}) => ({
    store,
    url: url(location.href),
    title: clean(document.title, 180),
    products: [...products.values()],
    scannedAt: Date.now(),
    ...details,
  });
  for (const adapter of Object.values(globalThis.ShopagentAdapters || {})) {
    const result = adapter({
      nodes,
      clean,
      stripHtml,
      url,
      meta,
      parsePrice,
      imageUrl,
      scalar,
      add,
    });
    if (result?.handled) return pageResult(result);
  }
  for (const node of nodes) {
    const types = []
      .concat(node["@type"] || [])
      .map((x) => String(x).split("/").pop());
    if (!types.includes("Product") && !types.includes("ProductGroup")) continue;
    const offers = []
      .concat(node.offers || [])
      .flatMap((offer) => (offer.offers ? [].concat(offer.offers) : offer));
    const offer =
      offers.find((o) => o.price != null || o.lowPrice != null) ||
      offers[0] ||
      {};
    const nodeUrl =
      node.url ||
      offer.url ||
      (nodes.filter((n) =>
        [].concat(n["@type"] || []).some((t) => /Product$/.test(t)),
      ).length === 1
        ? location.href
        : "");
    const variants = [].concat(node.hasVariant || []);
    const sizes = [].concat(
      node.size || [],
      ...variants.map((v) => v.size || []),
    );
    const reviews = []
      .concat(node.review || [])
      .slice(0, 5)
      .map((r) => clean(r.reviewBody, 400))
      .filter(Boolean);
    add({
      title: node.name,
      url: nodeUrl,
      image: node.image,
      description: node.description,
      price: offer.price ?? offer.lowPrice ?? offer.priceSpecification?.price,
      currency:
        offer.priceCurrency ||
        offer.priceSpecification?.priceCurrency ||
        meta("product:price:currency"),
      material: []
        .concat(node.material || [])
        .map(scalar)
        .join(", "),
      sizes,
      brand: clean(scalar(node.brand), 80),
      availability: clean(offer.availability, 120),
      rating: node.aggregateRating
        ? {
            value: clean(node.aggregateRating.ratingValue, 10),
            count: clean(
              node.aggregateRating.reviewCount ||
                node.aggregateRating.ratingCount,
              12,
            ),
          }
        : null,
      reviews,
      source: "structured",
      priceFrom: offer.price == null && offer.lowPrice != null,
    });
  }
  const priceMeta =
    meta("product:price:amount") ||
    meta("og:price:amount") ||
    document.querySelector('[itemprop="price"]')?.getAttribute("content");
  if (!products.size && (/product/i.test(meta("og:type")) || priceMeta)) {
    add({
      title: document.querySelector("h1")?.textContent || meta("og:title"),
      url:
        document.querySelector('link[rel="canonical"]')?.href || location.href,
      image: meta("og:image"),
      description: meta("og:description") || meta("description"),
      price: priceMeta,
      currency: meta("product:price:currency") || meta("og:price:currency"),
      material: "",
      sizes: [],
      source: "metadata",
    });
  }
  // Collection pages often omit Product JSON-LD. Read conservative, visible product cards as a fallback.
  const anchors = [...document.querySelectorAll("a[href]")].slice(0, 1800);
  for (const anchor of anchors) {
    const href = anchor.getAttribute("href") || "";
    if (
      !/\/products?\/|\/p\/|\/pd\/|\/dp\/|\/prd\/|\/productpage\.|\/[\w-]+-p\d|_[0-9]{6,}(?:\.html)?(?:[?#]|$)|[?&]pid=|\/shop\/.*\/p\/|\/r\/DisplayProduct\.jsp/i.test(
        href,
      ) ||
      !anchor.getClientRects().length
    )
      continue;
    const card =
      anchor.closest(
        '[data-product-id], [data-product], .product-card, .product-item, .product-tile, [class*="productCard"], [class*="product-card"], [class*="ProductCard"], article, li',
      ) || anchor;
    const img = card.querySelector("img");
    if (!img) continue;
    const titleElement = card.querySelector(
      '[itemprop="name"], [data-product-title], [class*="product-title"], [class*="product-name"], h2, h3, h4',
    );
    const priceElement = card.querySelector(
      '[itemprop="price"], [data-price], [class*="price"], [class*="Price"]',
    );
    const cardText = clean(card.textContent, 1500);
    const priceMatch = cardText.match(
      /(?:USD|EUR|GBP|CAD|AUD|[$€£])\s*[\d.,]+|[\d.,]+\s*(?:USD|EUR|GBP|€|£)/,
    );
    const priceText =
      priceElement?.getAttribute("content") ||
      priceElement?.getAttribute("data-price") ||
      clean(priceElement?.textContent) ||
      priceMatch?.[0] ||
      "";
    const currency =
      card
        .querySelector('[itemprop="priceCurrency"]')
        ?.getAttribute("content") ||
      meta("product:price:currency") ||
      priceText.match(/\b(USD|EUR|GBP|CAD|AUD)\b/)?.[1] ||
      (priceText.includes("€") ? "EUR" : priceText.includes("£") ? "GBP" : "");
    add({
      title:
        titleElement?.textContent ||
        anchor.getAttribute("aria-label") ||
        img.alt,
      url: href,
      image: img.currentSrc || img.getAttribute("data-src") || img.src,
      description: "",
      price: priceText.match(/[\d][\d.,]*/)?.[0] || null,
      currency,
      material: "",
      sizes: [],
      source: "visible card",
    });
  }
  return {
    store,
    url: url(location.href),
    title: clean(document.title, 180),
    products: [...products.values()],
    scannedAt: Date.now(),
  };
})();
