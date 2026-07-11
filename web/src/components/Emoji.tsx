import React from "react";
import type { CSSProperties } from "react";
import twemoji from "twemoji";

const TWEMOJI_BASE = "/emoji/";

const twemojiOptions: twemoji.ParseOptions = {
  folder: "svg",
  ext: ".svg",
  base: TWEMOJI_BASE,
  callback: (icon, opts) => `${opts.base}${icon.replace(/-fe0f/g, "")}${opts.ext}`,
};

type EmojiProps = {
  char: string;
  className?: string;
  style?: CSSProperties;
};

/** Inline Twemoji image for reliable PDF rendering on serverless Chromium. */
export default function Emoji({ char, className, style }: EmojiProps) {
  const html = twemoji.parse(char, twemojiOptions);
  return (
    <span
      className={className ? `slip-emoji ${className}` : "slip-emoji"}
      style={style}
      aria-hidden
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

export function emojiAssetPath(char: string): string {
  const icon = twemoji.convert.toCodePoint(char).replace(/-fe0f/g, "");
  return `${TWEMOJI_BASE}${icon}.svg`;
}
