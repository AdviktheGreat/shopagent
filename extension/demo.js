// Fictional products, prices, and brands. No live inventory claims.
export const DEMO_PRODUCTS = [
  {
    id: "demo-1",
    title: "The everyday linen blazer",
    store: "FORME",
    price: 129,
    material: "55% linen, 45% cotton",
    tags: ["Minimal", "Classic"],
    sizes: ["XS", "S", "M", "L", "XL"],
    description: "A tailored, lightly fitted blazer for work and weekends.",
    art: "blazer",
    color: "#b9a78f",
    background: "#e9e3d9",
  },
  {
    id: "demo-2",
    title: "Sculpted rib midi dress",
    store: "STILL STUDIO",
    price: 98,
    material: "95% cotton, 5% elastane",
    tags: ["Minimal", "Classic"],
    sizes: ["XS", "S", "M", "L"],
    description:
      "Fitted ribbed cotton midi dress. A simple silhouette for the office or dinner.",
    art: "dress",
    color: "#3e4039",
    background: "#e2e6de",
  },
  {
    id: "demo-3",
    title: "Weekend wide-leg trouser",
    store: "FORME",
    price: 115,
    material: "70% lyocell, 30% linen",
    tags: ["Relaxed", "Minimal"],
    sizes: ["XS", "S", "M", "L", "XL"],
    description:
      "Relaxed wide-leg trousers with a soft drape and a tailored waist for work.",
    art: "trouser",
    color: "#e3d7bf",
    background: "#ddd9cf",
  },
  {
    id: "demo-4",
    title: "Silk slip, softly spoken",
    store: "SUNDAY THEORY",
    price: 189,
    material: "100% silk",
    tags: ["Romantic", "Minimal"],
    sizes: ["XS", "S", "M", "L"],
    description:
      "A fluid silk slip dress with a softly fitted bias cut for evenings.",
    art: "slip",
    color: "#936c62",
    background: "#e9dbd4",
  },
  {
    id: "demo-5",
    title: "Your borrowed cotton shirt",
    store: "STILL STUDIO",
    price: 79,
    material: "100% cotton",
    tags: ["Relaxed", "Classic"],
    sizes: ["XS", "S", "M", "L", "XL"],
    description:
      "An oversized cotton shirt with clean lines for work or a slow Sunday.",
    art: "shirt",
    color: "#b0bdc3",
    background: "#dce2e5",
  },
  {
    id: "demo-6",
    title: "A little floral moment",
    store: "SUNDAY THEORY",
    price: 142,
    material: "100% viscose",
    tags: ["Romantic", "Statement"],
    sizes: ["XS", "S", "M", "L"],
    description:
      "A fitted floral dress with a gathered waist and soft ruffle detail.",
    art: "dress",
    color: "#758472",
    background: "#e0e5d9",
  },
  {
    id: "demo-7",
    title: "The wool layering knit",
    store: "FORME",
    price: 165,
    material: "90% wool, 10% cashmere",
    tags: ["Classic", "Minimal"],
    sizes: ["S", "M", "L", "XL"],
    description:
      "A relaxed wool knit with a simple crew neck and a soft handfeel.",
    art: "shirt",
    color: "#866f5b",
    background: "#e7ded3",
  },
  {
    id: "demo-8",
    title: "Off-duty stretch top",
    store: "STILL STUDIO",
    price: 48,
    material: "85% recycled polyester, 15% elastane",
    tags: ["Sporty", "Minimal"],
    sizes: ["XS", "S", "M", "L"],
    description:
      "A fitted stretch top for movement, layering, and everything between.",
    art: "shirt",
    color: "#403f46",
    background: "#dddce4",
  },
].map((p) => ({
  ...p,
  currency: "USD",
  url: "",
  demo: true,
  source: "demo",
  capturedAt: 0,
}));

export function garmentArt(product) {
  const shapes = {
    blazer:
      '<path d="M82 56 57 67 40 169 67 175 80 112 75 246 165 246 160 112 173 175 200 169 183 67 158 56 120 69Z"/><path d="m100 58 20 54-36-25 14-12-10-12m52-5-20 54 36-25-14-12 10-12M120 112v133M90 170h22m20 0h22" fill="none" stroke="rgba(30,30,30,.3)" stroke-width="2"/><circle cx="127" cy="145" r="2" fill="#655b4c"/>',
    dress:
      '<path d="M95 52 82 63 78 111 93 139 67 255Q120 270 173 255L147 139 162 111 158 63 145 52 135 71 105 71Z"/><path d="M95 52q25 40 50 0M94 139q26 10 52 0M120 146v103" fill="none" stroke="rgba(255,255,255,.22)" stroke-width="2"/>',
    slip: '<path d="M90 56 90 95 99 126 77 258Q120 269 163 258L141 126 150 95 150 56 143 56 140 94Q120 119 100 94L97 56Z"/><path d="m100 106 40 8m-22 23-16 110m36-115 5 114" fill="none" stroke="rgba(255,255,255,.2)" stroke-width="2"/>',
    trouser:
      '<path d="M81 52h78l6 78 15 136-48 1-15-119-8 119-49-1 17-136Z"/><path d="M82 65h76M119 66v74M94 75 80 257m63-182 18 182" fill="none" stroke="rgba(30,30,30,.18)" stroke-width="2"/>',
    shirt:
      '<path d="m91 65-31 13-30 75 30 15 24-48-5 113q41 10 82 0l-5-113 24 48 30-15-30-75-31-13-15 15h-28Z"/><path d="m93 65 13 33 14-18 14 18 13-33M120 83v151M88 194l-2 27m68-27 2 27" fill="none" stroke="rgba(30,30,30,.22)" stroke-width="2"/><g fill="rgba(30,30,30,.35)"><circle cx="123" cy="113" r="1.5"/><circle cx="123" cy="138" r="1.5"/><circle cx="123" cy="163" r="1.5"/></g>',
  };
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="310" viewBox="0 0 240 310"><defs><filter id="s"><feDropShadow dx="2" dy="8" stdDeviation="7" flood-opacity=".12"/></filter><linearGradient id="l" x1="0" y1="0" x2="1" y2="1"><stop stop-color="white" stop-opacity=".16"/><stop offset="1" stop-color="black" stop-opacity=".12"/></linearGradient></defs><rect width="240" height="310" fill="${product.background || "#e9e3d9"}"/><ellipse cx="120" cy="282" rx="64" ry="7" fill="black" opacity=".04"/><g fill="${product.color || "#9d9688"}" filter="url(#s)">${shapes[product.art] || shapes.shirt}</g><rect width="240" height="310" fill="url(#l)"/></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
