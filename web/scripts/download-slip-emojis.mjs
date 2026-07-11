/**
 * Downloads Twemoji SVG assets for slip templates into public/emoji/.
 * Run: node scripts/download-slip-emojis.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import twemoji from "twemoji";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, "..", "public", "emoji");
const TWEMOJI_VERSION = "14.0.2";
const CDN_BASE = `https://cdn.jsdelivr.net/gh/twitter/twemoji@${TWEMOJI_VERSION}/assets/svg`;

const SLIP_EMOJI_CHARS = [
  "📍",
  "📞",
  "👤",
  "💬",
  "🏛️",
  "👨‍💼",
  "📅",
  "📦",
  "🔄",
  "🔒",
  "💡",
  "⚠️",
  "⚠",
  "🗓️",
  "🚚",
  "📋",
  "✅",
];

fs.mkdirSync(OUT_DIR, { recursive: true });

const codepoints = new Set();
function twemojiFilename(icon) {
  return icon.replace(/-fe0f/g, "");
}

for (const char of SLIP_EMOJI_CHARS) {
  codepoints.add(twemojiFilename(twemoji.convert.toCodePoint(char)));
}

let ok = 0;
let fail = 0;

for (const icon of [...codepoints].sort()) {
  const dest = path.join(OUT_DIR, `${icon}.svg`);
  const url = `${CDN_BASE}/${icon}.svg`;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.error(`FAIL ${icon}: HTTP ${res.status}`);
      fail++;
      continue;
    }
    const svg = await res.text();
    fs.writeFileSync(dest, svg, "utf8");
    console.log(`OK ${icon}.svg`);
    ok++;
  } catch (err) {
    console.error(`FAIL ${icon}:`, err instanceof Error ? err.message : err);
    fail++;
  }
}

console.log(`\nDone: ${ok} saved, ${fail} failed → ${OUT_DIR}`);
if (fail > 0) process.exit(1);
