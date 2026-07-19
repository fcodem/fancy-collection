import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const onnxRoot = path.join(
  root,
  "node_modules",
  "onnxruntime-node",
  "bin",
  "napi-v3",
);

function removeOtherPlatforms(base, keepRelative) {
  if (!fs.existsSync(base)) return { removed: 0, bytes: 0 };
  const keep = path.resolve(base, keepRelative);
  let removed = 0;
  let bytes = 0;

  for (const platformEntry of fs.readdirSync(base, { withFileTypes: true })) {
    if (!platformEntry.isDirectory()) continue;
    const platformDir = path.join(base, platformEntry.name);
    for (const archEntry of fs.readdirSync(platformDir, { withFileTypes: true })) {
      if (!archEntry.isDirectory()) continue;
      const candidate = path.resolve(platformDir, archEntry.name);
      if (candidate === keep) continue;
      for (const file of fs.readdirSync(candidate, { withFileTypes: true })) {
        if (file.isFile()) bytes += fs.statSync(path.join(candidate, file.name)).size;
      }
      fs.rmSync(candidate, { recursive: true, force: true });
      removed += 1;
    }
    if (fs.readdirSync(platformDir).length === 0) fs.rmdirSync(platformDir);
  }

  return { removed, bytes };
}

const supportedPlatforms = new Set(["win32", "darwin", "linux"]);
const supportedArchitectures = new Set(["x64", "arm64"]);
if (
  supportedPlatforms.has(process.platform) &&
  supportedArchitectures.has(process.arch)
) {
  const result = removeOtherPlatforms(
    onnxRoot,
    path.join(process.platform, process.arch),
  );
  console.log(
    `[native-prune] kept onnxruntime ${process.platform}/${process.arch}; removed ${result.removed} platform directories (${(result.bytes / 1024 / 1024).toFixed(2)} MB)`,
  );
} else {
  console.warn(
    `[native-prune] unsupported platform ${process.platform}/${process.arch}; no files removed`,
  );
}
