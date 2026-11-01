export const STYLES = [
  "Minimal",
  "Classic",
  "Relaxed",
  "Romantic",
  "Statement",
  "Sporty",
];
export const INITIAL_MESSAGE =
  "Hi, I’m your shopping sidekick. Tell me what you’re looking for, or try a filter below. Your shortlist and preferences come with you across stores.";

export function freshState() {
  return {
    version: 1,
    historyEpoch: 0,
    profile: {
      styles: [],
      size: "",
      budget: 150,
      currency: "USD",
      learning: true,
    },
    saved: [],
    dismissed: [],
    history: [],
    inspiration: [],
    filters: {},
    messages: [{ role: "assistant", text: INITIAL_MESSAGE }],
    onboarded: false,
  };
}

export function hydrateState(raw) {
  const initial = freshState();
  return {
    ...initial,
    ...raw,
    profile: { ...initial.profile, ...raw?.profile },
  };
}

export function safeUrl(value, base) {
  if (typeof value !== "string" || !value.trim()) return "";
  try {
    const url = new URL(value, base);
    return ["https:", "http:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

export function canonicalUrl(value) {
  const safe = safeUrl(value);
  if (!safe) return "";
  const url = new URL(safe);
  url.hash = "";
  for (const key of [...url.searchParams.keys()]) {
    if (/^(utm_|gclid$|fbclid$|ref$)/i.test(key)) url.searchParams.delete(key);
  }
  return url.href;
}

export function money(value, currency = "USD") {
  if (value === null || value === undefined || !Number.isFinite(Number(value)))
    return "Price unavailable";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${value} ${currency}`;
  }
}

const STYLE_WORDS = {
  Minimal: /minimal|clean|simple|straight|neutral|tailored|ribbed/i,
  Classic: /classic|tailored|blazer|trouser|shirt|midi|loafer|wool/i,
  Relaxed: /relaxed|oversized|linen|loose|wide.leg|cotton/i,
  Romantic: /romantic|floral|lace|ruffle|satin|slip|silk/i,
  Statement: /statement|bold|metallic|sequin|bright|sculpt/i,
  Sporty: /sport|active|stretch|legging|sneaker|hoodie/i,
};

export function inferTags(product) {
  const text = `${product.title} ${product.description || ""} ${product.material || ""}`;
  return [
    ...new Set([
      ...(product.tags || []),
      ...Object.entries(STYLE_WORDS)
        .filter(([, rx]) => rx.test(text))
        .map(([tag]) => tag),
    ]),
  ];
}

export function productText(p) {
  return `${p.title} ${p.description || ""} ${p.material || ""} ${(p.tags || []).join(" ")}`.toLowerCase();
}

export function rankProducts(products, state) {
  const { profile, filters } = state;
  const likedTags = state.saved.flatMap((p) => inferTags(p));
  return products
    .filter((p) => {
      if (state.dismissed.includes(p.id)) return false;
      if (
        filters.maxPrice != null &&
        (p.price == null ||
          p.currency !== profile.currency ||
          p.price > filters.maxPrice)
      )
        return false;
      const text = productText(p);
      if (filters.fit === "fitted") {
        const explicitFit = /\bfitted\b|\bslim\b|bodycon|ribbed/.test(text);
        const tailoredFit =
          /tailored/.test(text) &&
          !/relaxed|oversized|wide.leg|loose/.test(text);
        if (!explicitFit && !tailoredFit) return false;
      }
      if (
        filters.occasion === "work" &&
        !/work|office|tailored|blazer|trouser|shirt|midi|loafer/.test(text)
      )
        return false;
      if (
        filters.fabric &&
        !/cotton|linen|wool|silk|cashmere|lyocell/.test(text)
      )
        return false;
      return true;
    })
    .map((p) => {
      const tags = inferTags(p);
      const matched = profile.styles.filter((s) => tags.includes(s));
      const savedMatches = tags.filter((tag) => likedTags.includes(tag));
      const withinBudget =
        p.price != null &&
        p.currency === profile.currency &&
        p.price <= profile.budget;
      const sizeStatus = sizeAvailability(p, profile.size);
      const sizeKnown =
        sizeStatus !== "unavailable" &&
        profile.size &&
        (p.sizes || []).some(
          (s) => s.toLowerCase() === profile.size.toLowerCase(),
        );
      const score =
        matched.length * 4 +
        Math.min(savedMatches.length, 3) +
        (withinBudget ? 2 : 0) +
        (sizeKnown ? 1 : 0);
      const reasons = [];
      if (matched.length)
        reasons.push(`Matches your ${matched[0].toLowerCase()} style`);
      else if (savedMatches.length)
        reasons.push("Similar style to your saved pieces");
      if (withinBudget) reasons.push("Within your usual budget");
      if (sizeKnown)
        reasons.push(
          sizeStatus === "available"
            ? `${profile.size} marked available · verify at store`
            : `${profile.size} listed · check availability`,
        );
      if (sizeStatus === "unavailable")
        reasons.push(`${profile.size} marked unavailable for this color`);
      if (!reasons.length)
        reasons.push(
          p.demo
            ? "A little inspiration to get you started"
            : "Found on this page · save to refine your taste",
        );
      return { ...p, tags, score, reasons };
    })
    .sort((a, b) => b.score - a.score);
}

export function sizeAvailability(product, size) {
  if (!size) return "unknown";
  const color = product.selectedOptions?.color;
  const variants = (product.variants || []).filter(
    (v) =>
      v.size?.toLowerCase() === size.toLowerCase() &&
      (!color || !v.color || v.color === color),
  );
  if (variants.some((v) => v.available === true)) return "available";
  if (variants.length && variants.every((v) => v.available === false))
    return "unavailable";
  return "unknown";
}

export function stockLabel(status) {
  return (
    {
      in_stock: "In stock",
      out_of_stock: "Sold out",
      discontinued: "Discontinued",
      preorder: "Preorder",
      backorder: "Backorder",
      limited: "Limited availability",
    }[status] || "Unknown"
  );
}

export function refineQuery(query, previous = {}, currency = "USD") {
  const q = query.toLowerCase().trim();
  if (
    /^(reset|clear)( (all|my|the))?( filters)?[.!]?$|start over|show (me )?everything|all picks/.test(
      q,
    )
  ) {
    return {
      filters: {},
      reply:
        "A fresh start. I’ve cleared the shopping filters; your taste profile and saved pieces are still here.",
    };
  }
  const filters = { ...previous };
  const applied = [];
  const price = q.match(
    /(?:under|below|less than|up to|maximum|max|budget(?: of)?)\s*[$€£]?\s*(\d+(?:\.\d{1,2})?)/,
  );
  const requestedCurrency = q.includes("€")
    ? "EUR"
    : q.includes("£")
      ? "GBP"
      : null;
  if (price && requestedCurrency && requestedCurrency !== currency)
    return {
      filters,
      reply: `Your shopping currency is ${currency}. Change it to ${requestedCurrency} in Your taste first; I don’t convert prices between currencies in this prototype.`,
    };
  if (price) {
    filters.maxPrice = Number(price[1]);
    applied.push(`under ${money(filters.maxPrice, currency)}`);
  }
  if (/\b(more fitted|fitted|slimmer|slim fit|less baggy)\b/.test(q)) {
    filters.fit = "fitted";
    applied.push("fitted or tailored silhouettes");
  }
  if (/\b(work|office|professional)\b/.test(q)) {
    filters.occasion = "work";
    applied.push("pieces with workwear cues");
  }
  if (/\b(quality|fabric|natural|cotton|linen|silk|wool)\b/.test(q)) {
    filters.fabric = true;
    applied.push(
      "pieces listing cotton, linen, wool, silk, cashmere, or lyocell",
    );
  }
  if (/\b(no budget|any price|remove (the )?budget)\b/.test(q)) {
    delete filters.maxPrice;
    applied.push("any price");
  }
  if (applied.length)
    return {
      filters,
      reply: `I’ll look for ${applied.join(", ")} in your current collection. ${filters.fabric ? "Fabric composition is a clue, not a guarantee of quality. " : ""}These filters carry across stores. Use “Clear filters” to start fresh.`,
    };
  if (/\b(size|sizing|fit me)\b/.test(q))
    return {
      filters,
      reply:
        "Open a piece’s details to see sizes and any product evidence captured from the page. I can’t reliably recommend a size yet; your usual size is a preference, not a fit prediction.",
    };
  if (/\b(checkout|buy|purchase|order)\b/.test(q))
    return {
      filters,
      reply:
        "Open a piece at the store to choose your size and check out there. This prototype never places orders or handles payment details.",
    };
  if (/\b(compare|which|better)\b/.test(q))
    return {
      filters,
      reply:
        "Save a few pieces, then open Saved and select two or three to compare their price, fabric, and listed sizes side by side.",
    };
  if (/\b(instagram|tiktok|pinterest|inspiration)\b/.test(q))
    return {
      filters,
      reply:
        "You can add an inspiration image in Your taste. Images stay on this device as a moodboard; visual understanding and social account imports are future features.",
    };
  return {
    filters,
    reply:
      "I’m a local prototype stylist, so my vocabulary is small for now. Try “under $150,” “more fitted,” “for work,” or “better quality fabric.” You can also save pieces, compare them, and adjust Your taste.",
  };
}

export function filterLabels(filters, currency) {
  return [
    filters.maxPrice != null
      ? ["maxPrice", `Under ${money(filters.maxPrice, currency)}`]
      : null,
    filters.fit ? ["fit", "More fitted"] : null,
    filters.occasion ? ["occasion", "For work"] : null,
    filters.fabric ? ["fabric", "Fabric focus"] : null,
  ].filter(Boolean);
}

export function mergeProducts(previous, incoming, limit = 150) {
  const map = new Map(previous.map((p) => [p.id, p]));
  for (const p of incoming) map.set(p.id, { ...map.get(p.id), ...p });
  return [...map.values()].slice(-limit);
}

export function productSignature(product) {
  const { capturedAt, seenAt, savedAt, score, reasons, ...facts } = product;
  return JSON.stringify(facts, (_key, value) =>
    value && typeof value === "object" && !Array.isArray(value)
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((key) => [key, value[key]]),
        )
      : value,
  );
}
