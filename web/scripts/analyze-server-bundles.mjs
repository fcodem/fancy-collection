import fs from "node:fs";
import path from "node:path";
import { gzipSync } from "node:zlib";

const cwd = process.cwd();
const nextDir = path.join(cwd, ".next");
const args = process.argv.slice(2);

function option(name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function walk(directory, predicate = () => true, output = []) {
  if (!fs.existsSync(directory)) return output;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(full, predicate, output);
    else if (entry.isFile() && predicate(full)) output.push(full);
  }
  return output;
}

function bytes(directory) {
  return walk(directory).reduce((total, file) => total + fs.statSync(file).size, 0);
}

function normalized(file) {
  return file.replaceAll("\\", "/");
}

function isRuntimeDataFile(file) {
  return /\/public\/(?:uploads|booking-bills|admin-forensics)\//.test(
    normalized(file),
  );
}

function displayBytes(value) {
  if (value == null) return "not measured";
  const units = ["B", "KB", "MB", "GB"];
  let size = value;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${size.toFixed(unit === 0 ? 0 : 2)} ${units[unit]}`;
}

function traceName(traceFile) {
  return normalized(path.relative(path.join(nextDir, "server"), traceFile))
    .replace(/\.js\.nft\.json$/, "")
    .replace(/\/route$/, "")
    .replace(/\/page$/, "");
}

function classify(files, pattern) {
  return files.some((file) => pattern.test(normalized(file)));
}

if (!fs.existsSync(nextDir)) {
  console.error("Missing .next output. Run npm run build before bundle:report.");
  process.exit(1);
}

const traceFiles = walk(nextDir, (file) => file.endsWith(".nft.json"));
const traces = traceFiles.map((traceFile) => {
  const parsed = JSON.parse(fs.readFileSync(traceFile, "utf8"));
  const absoluteFiles = new Set();
  for (const relative of parsed.files ?? []) {
    const absolute = path.resolve(path.dirname(traceFile), relative);
    if (fs.existsSync(absolute) && fs.statSync(absolute).isFile()) {
      absoluteFiles.add(absolute);
    }
  }
  const entryFile = traceFile.replace(/\.nft\.json$/, "");
  if (fs.existsSync(entryFile)) absoluteFiles.add(entryFile);
  const files = [...absoluteFiles];
  const totalBytes = files.reduce((total, file) => total + fs.statSync(file).size, 0);
  return {
    name: traceName(traceFile),
    traceFile: normalized(path.relative(cwd, traceFile)),
    files,
    fileCount: files.length,
    totalBytes,
    deploymentBytes: files
      .filter((file) => !isRuntimeDataFile(file))
      .reduce((total, file) => total + fs.statSync(file).size, 0),
    chromium: classify(
      files,
      /node_modules\/(?:@sparticuz\/chromium|puppeteer(?:-core)?)(?:\/|$)/,
    ),
    aiNative: classify(
      files,
      /node_modules\/(?:@xenova\/transformers|onnxruntime-node)(?:\/|$)|\/(?:siglipModel|imageEmbedding\/backends)\.[cm]?js$/,
    ),
    sharp: classify(files, /node_modules\/(?:@img\/|sharp(?:\/|$))/),
    pdf: classify(
      files,
      /node_modules\/(?:jspdf|jspdf-autotable|pdfkit|puppeteer(?:-core)?)(?:\/|$)/,
    ),
  };
});

const tracedFiles = new Set(traces.flatMap((trace) => trace.files));
const runtimeDataFiles = [...tracedFiles].filter(isRuntimeDataFile);
const deployableTracedFiles = [...tracedFiles].filter(
  (file) => !isRuntimeDataFile(file),
);
const topFiles = deployableTracedFiles
  .map((file) => ({
    file: normalized(path.relative(cwd, file)),
    bytes: fs.statSync(file).size,
  }))
  .sort((a, b) => b.bytes - a.bytes)
  .slice(0, 30);

const sortedTraces = [...traces].sort(
  (a, b) => b.deploymentBytes - a.deploymentBytes,
);
const appFunctions = traces.filter((trace) => trace.traceFile.includes(".next/server/app/"));
const apiFunctions = appFunctions.filter((trace) => trace.name.startsWith("app/api/"));
const pageFunctions = appFunctions.filter((trace) => !trace.name.startsWith("app/api/"));
const publicFiles = walk(path.join(cwd, "public"))
  .filter((file) => !isRuntimeDataFile(file))
  .map((file) => ({
    file: normalized(path.relative(cwd, file)),
    bytes: fs.statSync(file).size,
  }))
  .sort((a, b) => b.bytes - a.bytes);
const buildManifestPath = path.join(nextDir, "build-manifest.json");
const buildManifest = fs.existsSync(buildManifestPath)
  ? JSON.parse(fs.readFileSync(buildManifestPath, "utf8"))
  : {};
const firstLoadFiles = new Set([
  ...(buildManifest.rootMainFiles ?? []),
  ...(buildManifest.pages?.["/_app"] ?? []),
]);
const firstLoadJsBytes = [...firstLoadFiles].reduce((total, relative) => {
  const file = path.join(nextDir, relative);
  return total + (fs.existsSync(file) ? fs.statSync(file).size : 0);
}, 0);
const firstLoadJsGzipBytes = [...firstLoadFiles].reduce((total, relative) => {
  const file = path.join(nextDir, relative);
  return total + (fs.existsSync(file) ? gzipSync(fs.readFileSync(file)).byteLength : 0);
}, 0);

const report = {
  generatedAt: new Date().toISOString(),
  label: option("--label") ?? "bundle",
  buildDurationMs: Number(option("--build-duration-ms")) || null,
  metrics: {
    deployedFunctionCount: Number(option("--deployed-function-count")) || null,
    functionCount: appFunctions.length,
    apiFunctionCount: apiFunctions.length,
    pageFunctionCount: pageFunctions.length,
    traceCount: traces.length,
    largestFunction: sortedTraces[0]
      ? {
          route: sortedTraces[0].name,
          bytes: sortedTraces[0].deploymentBytes,
          fileCount: sortedTraces[0].fileCount,
        }
      : null,
    uniqueTracedBytes: [...tracedFiles].reduce(
      (total, file) => total + fs.statSync(file).size,
      0,
    ),
    deployableUniqueTracedBytes: deployableTracedFiles.reduce(
      (total, file) => total + fs.statSync(file).size,
      0,
    ),
    nextOutputBytes: bytes(nextDir),
    buildCacheBytes: bytes(path.join(nextDir, "cache")),
    publicBytes: bytes(path.join(cwd, "public")),
    firstLoadJsBytes,
    firstLoadJsGzipBytes,
    runtimeDataTracedFiles: runtimeDataFiles.length,
    runtimeDataTracedBytes: runtimeDataFiles.reduce(
      (total, file) => total + fs.statSync(file).size,
      0,
    ),
  },
  routes: {
    chromium: traces.filter((trace) => trace.chromium).map((trace) => trace.name),
    aiNative: traces.filter((trace) => trace.aiNative).map((trace) => trace.name),
    sharp: traces.filter((trace) => trace.sharp).map((trace) => trace.name),
    pdf: traces.filter((trace) => trace.pdf).map((trace) => trace.name),
  },
  largestFunctions: sortedTraces.slice(0, 30).map((trace) => ({
    route: trace.name,
    bytes: trace.deploymentBytes,
    localBytes: trace.totalBytes,
    fileCount: trace.fileCount,
  })),
  topFiles,
  publicFiles: publicFiles.slice(0, 30),
};

const baselinePath = option("--baseline");
if (baselinePath && fs.existsSync(baselinePath)) {
  const baseline = JSON.parse(fs.readFileSync(baselinePath, "utf8"));
  report.baseline = {
    path: normalized(path.relative(cwd, path.resolve(baselinePath))),
    metrics: baseline.metrics,
    delta: Object.fromEntries(
      [
        "functionCount",
        "uniqueTracedBytes",
        "nextOutputBytes",
        "buildCacheBytes",
        "publicBytes",
      ].map((key) => [key, report.metrics[key] - baseline.metrics[key]]),
    ),
  };
}

const expectedChromiumRoute = "app/api/internal/slip/render";
if (
  args.includes("--assert-isolation") &&
  (report.routes.chromium.length !== 1 ||
    report.routes.chromium[0] !== expectedChromiumRoute)
) {
  console.error(
    `Chromium isolation failed: expected only ${expectedChromiumRoute}, saw ${report.routes.chromium.join(", ") || "none"}`,
  );
  process.exitCode = 2;
}

const ordinaryAiRoutes = new Set([
  "app/api/health",
  "app/api/inventory",
  "app/api/inventory/[id]",
  "instrumentation",
]);
if (args.includes("--assert-isolation")) {
  const leaked = report.routes.aiNative.filter((route) => ordinaryAiRoutes.has(route));
  if (leaked.length) {
    console.error(`AI native isolation failed for ordinary routes: ${leaked.join(", ")}`);
    process.exitCode = 3;
  }
}

const markdown = [
  `# Server bundle trace report — ${report.label}`,
  "",
  `Generated: ${report.generatedAt}`,
  "",
  "## Metrics",
  "",
  `- Deployed Node.js functions: ${report.metrics.deployedFunctionCount ?? "not supplied"}`,
  `- Local function traces: ${report.metrics.functionCount} (${report.metrics.apiFunctionCount} API, ${report.metrics.pageFunctionCount} pages)`,
  `- Largest function: ${report.metrics.largestFunction?.route ?? "none"} (${displayBytes(report.metrics.largestFunction?.bytes)})`,
  `- Unique traced server files: ${displayBytes(report.metrics.uniqueTracedBytes)}`,
  `- Deployable traced server files (runtime data excluded): ${displayBytes(report.metrics.deployableUniqueTracedBytes)}`,
  `- Next output: ${displayBytes(report.metrics.nextOutputBytes)}`,
  `- Build cache: ${displayBytes(report.metrics.buildCacheBytes)}`,
  `- Shared first-load JavaScript: ${displayBytes(report.metrics.firstLoadJsGzipBytes)} gzip (${displayBytes(report.metrics.firstLoadJsBytes)} raw)`,
  `- Public assets: ${displayBytes(report.metrics.publicBytes)}`,
  `- Runtime/customer files present in traces: ${report.metrics.runtimeDataTracedFiles} (${displayBytes(report.metrics.runtimeDataTracedBytes)})`,
  `- Build duration: ${report.buildDurationMs ? `${(report.buildDurationMs / 1000).toFixed(1)} s` : "not measured"}`,
  "",
  "## Heavy package routes",
  "",
  `- Chromium/Puppeteer (${report.routes.chromium.length}): ${report.routes.chromium.join(", ") || "none"}`,
  `- AI native (${report.routes.aiNative.length}): ${report.routes.aiNative.join(", ") || "none"}`,
  `- Sharp/native image (${report.routes.sharp.length}): ${report.routes.sharp.join(", ") || "none"}`,
  `- PDF packages (${report.routes.pdf.length}): ${report.routes.pdf.join(", ") || "none"}`,
  "",
  "## Top 30 largest traced deployment files",
  "",
  ...report.topFiles.map(
    (entry, index) => `${index + 1}. ${displayBytes(entry.bytes)} — \`${entry.file}\``,
  ),
  "",
  "## Top 30 largest function traces",
  "",
  ...report.largestFunctions.map(
    (entry, index) =>
      `${index + 1}. ${displayBytes(entry.bytes)} (${entry.fileCount} files) — \`${entry.route}\``,
  ),
  "",
  "## Largest public files",
  "",
  ...report.publicFiles.map(
    (entry, index) => `${index + 1}. ${displayBytes(entry.bytes)} — \`${entry.file}\``,
  ),
  "",
];

const jsonPath = option("--json");
if (jsonPath) {
  fs.mkdirSync(path.dirname(path.resolve(jsonPath)), { recursive: true });
  fs.writeFileSync(path.resolve(jsonPath), `${JSON.stringify(report, null, 2)}\n`);
}
const markdownPath = option("--markdown");
if (markdownPath) {
  fs.mkdirSync(path.dirname(path.resolve(markdownPath)), { recursive: true });
  fs.writeFileSync(path.resolve(markdownPath), `${markdown.join("\n")}\n`);
}

console.log(markdown.join("\n"));
