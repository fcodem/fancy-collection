import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Emoji from "../src/components/Emoji";

const samples = ["📅", "🔒", "✅", "👨‍💼", "⚠️"] as const;
for (const char of samples) {
  const html = renderToStaticMarkup(createElement(Emoji, { char }));
  console.log(char, "->", html);
  if (!html.includes("/emoji/") || !html.includes(".svg")) {
    console.error("FAIL: missing self-hosted twemoji path for", char);
    process.exit(1);
  }
}
console.log("OK: all sample emojis render as /emoji/*.svg images");
