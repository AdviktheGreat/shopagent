(() => {
  const normalizeAvailability = (value) => {
    const code = String(value || "")
      .split("/")
      .pop()
      .toLowerCase()
      .replace(/[_\s-]/g, "");
    const known = {
      instock: ["in_stock", true],
      outofstock: ["out_of_stock", false],
      soldout: ["out_of_stock", false],
      discontinued: ["discontinued", false],
      preorder: ["preorder", true],
      backorder: ["backorder", true],
      limitedavailability: ["limited", true],
    };
    const [availability, available] = known[code] || ["unknown", null];
    return { availability, available };
  };
  const summarize = (variants, color = "") => {
    const current = color
      ? variants.filter((v) => !v.color || v.color === color)
      : variants;
    return {
      variants,
      colors: [...new Set(variants.map((v) => v.color).filter(Boolean))],
      sizes: [...new Set(current.map((v) => v.size).filter(Boolean))],
      availableSizes: [
        ...new Set(
          current
            .filter((v) => v.available === true)
            .map((v) => v.size)
            .filter(Boolean),
        ),
      ],
      availability: current.some((v) => v.available === true)
        ? "InStock"
        : current.length && current.every((v) => v.available === false)
          ? "OutOfStock"
          : "",
    };
  };
  globalThis.ShopagentVariantEvidence = { normalizeAvailability, summarize };
})();
