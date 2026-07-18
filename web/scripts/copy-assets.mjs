import { cpSync, mkdirSync, existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const root = dirname(fileURLToPath(import.meta.url));
const webRoot = join(root, "..");
const flaskStatic = join(webRoot, "..", "fancynew", "static");
const publicDir = join(webRoot, "public");

const copies = [
  ["js/dress-suggest.js", "js/dress-suggest.js"],
];

mkdirSync(join(publicDir, "css"), { recursive: true });

for (const [src, dest] of copies) {
  const from = join(flaskStatic, src);
  const to = join(publicDir, dest);
  if (existsSync(from)) {
    cpSync(from, to, { recursive: true, force: true });
    console.log("Copied", from, "→", to);
  } else {
    console.warn("Skip (not found):", from);
  }
}

console.log("Assets ready.");
