// Generate the extension's small raster toolbar icons without a graphics dependency.
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
const directory = resolve(import.meta.dirname, "../extension/icons");
mkdirSync(directory, { recursive: true });
function crc32(buffer) {
  let crc = -1;
  for (const value of buffer) {
    crc ^= value;
    for (let bit = 0; bit < 8; bit++)
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ -1) >>> 0;
}
function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type), data]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}
for (const size of [16, 32, 48, 128]) {
  const pixels = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const rgba = [0, 0, 0, 0];
      for (let sy = 0; sy < 4; sy++)
        for (let sx = 0; sx < 4; sx++) {
          const px = ((x + (sx + 0.5) / 4) / size) * 128;
          const py = ((y + (sy + 0.5) / 4) / size) * 128;
          const dx = Math.max(22 - px, px - 106, 0),
            dy = Math.max(22 - py, py - 106, 0);
          if (Math.hypot(dx, dy) > 22) continue;
          let spark = false;
          for (let ray = 0; ray < 8; ray++) {
            const a = (ray * Math.PI) / 4;
            const along = (px - 64) * Math.cos(a) + (py - 64) * Math.sin(a);
            const across = -(px - 64) * Math.sin(a) + (py - 64) * Math.cos(a);
            if (along >= 11 && along <= 40 && Math.abs(across) <= 4.5)
              spark = true;
          }
          const color = spark ? [227, 159, 126] : [48, 55, 42];
          color.forEach((v, i) => {
            rgba[i] += v;
          });
          rgba[3] += 255;
        }
      const offset = y * (size * 4 + 1) + 1 + x * 4;
      for (let c = 0; c < 4; c++) pixels[offset + c] = Math.round(rgba[c] / 16);
    }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;
  writeFileSync(
    resolve(directory, `icon-${size}.png`),
    Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      chunk("IHDR", header),
      chunk("IDAT", deflateSync(pixels)),
      chunk("IEND", Buffer.alloc(0)),
    ]),
  );
}
console.log("Generated 16, 32, 48, and 128px Shopagent icons.");
