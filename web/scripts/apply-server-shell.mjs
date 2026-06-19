import { readFileSync, writeFileSync, readdirSync, statSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const appDir = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "app");

function walk(dir, files = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === "login" || name === "api" || name === "(app)") continue;
      walk(p, files);
    } else if (name === "page.tsx" || name === "layout.tsx") {
      files.push(p);
    }
  }
  return files;
}

const files = walk(appDir);

for (const file of files) {
  let src = readFileSync(file, "utf8");
  if (!src.includes("AppShell")) continue;

  // Finance layout: owner gate only, no shell (parent pages use ServerAppShell)
  if (file.endsWith("finance\\layout.tsx") || file.endsWith("finance/layout.tsx")) {
    src = src
      .replace(/import AppShell from "@\/components\/AppShell";\n/, "")
      .replace(
        /return \(\s*<AppShell isOwner=\{true\} username=\{user\.username\}>\s*\{children\}\s*<\/AppShell>\s*\);/,
        "return children;"
      );
    writeFileSync(file, src);
    console.log("Updated finance layout:", file);
    continue;
  }

  src = src.replace(/import AppShell from "@\/components\/AppShell";/g, 'import ServerAppShell from "@/components/ServerAppShell";');
  src = src.replace(/<AppShell isOwner=\{isOwner\(user\)\} username=\{user\.username\}>/g, "<ServerAppShell>");
  src = src.replace(/<AppShell isOwner=\{owner\} username=\{user\.username\}>/g, "<ServerAppShell>");
  src = src.replace(/<AppShell isOwner username=\{user\.username\}>/g, "<ServerAppShell>");
  src = src.replace(/<\/AppShell>/g, "</ServerAppShell>");

  // Drop auth redirect when only used for shell (keep owner checks)
  if (
    !src.includes("isOwner(user)") &&
    !src.includes("!isOwner") &&
    !src.includes("user.") &&
    src.includes("if (!user) redirect")
  ) {
    src = src.replace(/\s*const user = await getCurrentUser\(\);\s*if \(!user\) redirect\("\/login"\);\s*/g, "\n");
    src = src.replace(/import \{ getCurrentUser(?:, isOwner)? \} from "@\/lib\/auth";\n/, "");
    src = src.replace(/import \{ redirect \} from "next\/navigation";\n/, "");
    src = src.replace(/import \{ isOwner, getCurrentUser \} from "@\/lib\/auth";\n/, "");
    src = src.replace(/import \{ getCurrentUser, isOwner \} from "@\/lib\/auth";\n/, "");
  }

  writeFileSync(file, src);
  console.log("Updated:", file);
}

console.log("Done.", files.length, "files scanned");
