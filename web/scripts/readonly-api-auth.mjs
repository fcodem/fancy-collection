import { readFileSync, writeFileSync, readdirSync, statSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const apiDir = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "app", "api");

function walk(dir, files = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, files);
    else if (name === "route.ts") files.push(p);
  }
  return files;
}

for (const file of walk(apiDir)) {
  let src = readFileSync(file, "utf8");
  if (!src.includes("export async function GET")) continue;
  if (!src.includes("requireUser")) continue;

  const hasMutations =
    src.includes("export async function POST") ||
    src.includes("export async function PUT") ||
    src.includes("export async function PATCH") ||
    src.includes("export async function DELETE");

  if (hasMutations) {
    src = src.replace(
      /(export async function GET[\s\S]*?)await requireUser\(\)/,
      "$1await requireUserReadOnly()"
    );
  } else {
    src = src.replace(/\brequireUser\b/g, "requireUserReadOnly");
  }

  if (!src.includes("requireUserReadOnly")) continue;

  src = src.replace(/import \{([^}]+)\} from "@\/lib\/api";/, (_, imports) => {
    const parts = [...new Set(imports.split(",").map((s) => s.trim()).filter(Boolean))];
    if (!parts.includes("requireUserReadOnly")) {
      parts.splice(parts.indexOf("requireUser") ?? parts.length, 1, "requireUserReadOnly");
    }
    return `import { ${parts.join(", ")} } from "@/lib/api";`;
  });

  writeFileSync(file, src);
  console.log("Updated:", file);
}

console.log("Done");
