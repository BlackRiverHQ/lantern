/* prepare-public.mjs — the landing page and its assets are the site's source of truth, so they are
   copied in at build time rather than committed twice. The dashboard's old page, script and
   stylesheet are deliberately not copied: site/next/ is the dashboard now. */

import { cp, mkdir, rm, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const site = join(here, "..", ".."); // site/
const pub = join(here, "..", "public");

const SKIP = new Set([
  "css/dashboard.css",
  "js/console.js",
  "js/run.js",
  "js/dashboard.js",
]);

const KEEP_DIRS = ["css", "fonts", "img", "video"];

async function exists(p) {
  try { await stat(p); return true; } catch { return false; }
}

await rm(pub, { recursive: true, force: true });
await mkdir(pub, { recursive: true });
await cp(join(site, "index.html"), join(pub, "index.html"));

for (const dir of KEEP_DIRS) {
  const from = join(site, "assets", dir);
  if (!(await exists(from))) continue;
  await cp(from, join(pub, "assets", dir), { recursive: true });
}

// the landing page's own script, and nothing else from assets/js
const js = join(site, "assets", "js");
if (await exists(join(js, "site.js"))) {
  await mkdir(join(pub, "assets", "js"), { recursive: true });
  await cp(join(js, "site.js"), join(pub, "assets", "js", "site.js"));
}

console.log("public/ built from site/", SKIP.size ? "(dashboard's old assets left out)" : "");
