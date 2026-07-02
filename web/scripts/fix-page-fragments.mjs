/** Fix pages where ServerAppShell removal left multiple root JSX nodes without a fragment. */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import ts from "typescript";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.join(__dirname, "..", "src", "app");

function walk(dir, fn) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory() && ent.name !== "api") walk(p, fn);
    else if (ent.name === "page.tsx") fn(p);
  }
}

function fixFile(filePath) {
  const src = fs.readFileSync(filePath, "utf8");
  const sf = ts.createSourceFile(filePath, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let changed = false;

  function visit(node) {
    if (
      ts.isReturnStatement(node) &&
      node.expression &&
      ts.isParenthesizedExpression(node.expression) &&
      ts.isJsxFragment(node.expression.expression) === false &&
      ts.isJsxElement(node.expression.expression) === false
    ) {
      // skip
    }
    if (
      ts.isReturnStatement(node) &&
      node.expression &&
      ts.isParenthesizedExpression(node.expression)
    ) {
      const inner = node.expression.expression;
      if (ts.isJsxElement(inner) || ts.isJsxFragment(inner)) {
        // count top-level siblings inside parens - hard with AST
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sf);

  // Simple regex fix: return (\n    <X />\n      <Y
  const broken = /return \(\s*\n(\s*)<([A-Za-z][\w.]*)/;
  if (!broken.test(src)) return false;

  // If already has fragment right after return (
  if (/return \(\s*\n\s*<>/.test(src)) return false;

  const fixed = src.replace(/return \(\s*\n(\s*)(<[A-Za-z])/m, "return (\n$1<>$2");
  if (fixed === src) return false;

  // Add closing fragment before final ); of return - find last \n  ); before function end
  const lastReturnClose = fixed.lastIndexOf("\n  );");
  if (lastReturnClose === -1) return false;
  const withClose =
    fixed.slice(0, lastReturnClose) + "\n    </>" + fixed.slice(lastReturnClose);

  if (withClose === src) return false;
  fs.writeFileSync(filePath, withClose);
  return true;
}

let n = 0;
walk(appDir, (p) => {
  if (fixFile(p)) {
    n++;
    console.log("fixed:", path.relative(appDir, p));
  }
});
console.log(`Fixed ${n} files.`);
