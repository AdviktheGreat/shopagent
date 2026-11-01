import { readFileSync, existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import { EXTRACTION_FILES } from "../extension/reader-files.js";
const root = resolve(import.meta.dirname, "..");
const extension = resolve(root, "extension");
const manifest = JSON.parse(
  readFileSync(resolve(extension, "manifest.json"), "utf8"),
);
assert.equal(manifest.manifest_version, 3);
assert.ok(!manifest.host_permissions, "All store access must be optional");
assert.ok(!manifest.content_scripts, "No background page surveillance");
for (const file of [
  manifest.background.service_worker,
  manifest.side_panel.default_path,
])
  assert.ok(existsSync(resolve(extension, file)), `${file} is missing`);
for (const file of Object.values(manifest.icons || {}))
  assert.ok(existsSync(resolve(extension, file)), `${file} is missing`);
const scripts = readdirSync(extension, { recursive: true }).filter((f) =>
  f.endsWith(".js"),
);
for (const file of EXTRACTION_FILES)
  assert.ok(existsSync(resolve(extension, file)), `${file} is missing`);
for (const file of scripts) {
  const result = spawnSync(
    process.execPath,
    ["--check", resolve(extension, file)],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
}
const html = readFileSync(
  resolve(extension, manifest.side_panel.default_path),
  "utf8",
);
assert.ok(
  !/\bon\w+\s*=|<script(?![^>]*\bsrc=)/i.test(html),
  "Extension CSP requires external scripts and no inline handlers",
);
console.log(
  "Manifest, referenced entrypoints, JavaScript syntax, and HTML CSP checks passed.",
);
