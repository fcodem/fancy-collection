/**
 * Strip ServerAppShell wrappers from pages (shell now lives in root layout).
 * Run: node scripts/strip-server-app-shell.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.join(__dirname, "..", "src", "app");

function stripServerAppShell(filePath) {
  let src = fs.readFileSync(filePath, "utf8");
  if (!src.includes("ServerAppShell")) return false;

  const original = src;
  const hadRequireOwner = /<ServerAppShell\s+requireOwner\s*>/.test(original);

  src = src.replace(/import ServerAppShell from "@\/components\/ServerAppShell";\r?\n/g, "");

  src = src.replace(
    /<ServerAppShell(?:\s+requireOwner)?>\s*([\s\S]*?)\s*<\/ServerAppShell>/g,
    (_, inner) => inner.trim(),
  );

  if (hadRequireOwner && !src.includes("isOwner(user)")) {
    if (!src.includes('from "@/lib/auth"')) {
      src = `import { redirect } from "next/navigation";\nimport { getCurrentUser, isOwner } from "@/lib/auth";\n${src}`;
    }
    src = src.replace(
      /(export default async function \w+[^{]*\{)\s*\n/,
      `$1
  const user = await getCurrentUser();
  if (!user || !isOwner(user)) redirect("/inventory");

`,
    );
  }

  if (src !== original) {
    fs.writeFileSync(filePath, src);
    return true;
  }
  return false;
}

function walk(dir, fn) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory() && ent.name !== "api") walk(p, fn);
    else if (ent.name === "page.tsx") fn(p);
  }
}

let n = 0;
walk(appDir, (p) => {
  if (stripServerAppShell(p)) {
    n++;
    console.log("stripped:", path.relative(appDir, p));
  }
});

const financeLayout = path.join(appDir, "finance", "layout.tsx");
if (fs.existsSync(financeLayout)) {
  fs.writeFileSync(
    financeLayout,
    `import { redirect } from "next/navigation";
import { getCurrentUser, isOwner } from "@/lib/auth";

export default async function FinanceLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!isOwner(user)) redirect("/");

  return children;
}
`,
  );
  console.log("updated finance/layout.tsx");
}

console.log(`Done. Stripped ${n} pages.`);
