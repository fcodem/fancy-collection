/**
 * Light checks before `next dev` when npm run dev is used directly (without start-web.bat).
 * Full repair: run repair-web.bat from the project root.
 */
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const envFile = path.join(root, ".env");

if (!fs.existsSync(envFile)) {
  console.error("\nMissing web/.env — copy .env.example to .env and set DATABASE_URL.\n");
  process.exit(1);
}

const schemaPath = path.join(root, "prisma", "schema.prisma");
const clientSchema = path.join(root, "node_modules", ".prisma", "client", "schema.prisma");
const clientIndex = path.join(root, "node_modules", ".prisma", "client", "index.js");

const REQUIRED_MODELS = ["Booking", "ProspectLead", "ShopEnquiry"];
const REQUIRED_BOOKING_FIELDS = ["qrToken", "refundAmount", "refundedAt", "incompletePhoto"];

function readGeneratedClientSchema() {
  if (!fs.existsSync(clientSchema)) return "";
  return fs.readFileSync(clientSchema, "utf8");
}

function needsPrismaGenerate() {
  if (!fs.existsSync(clientIndex)) return true;
  if (!fs.existsSync(clientSchema)) return true;
  if (fs.statSync(schemaPath).mtimeMs > fs.statSync(clientIndex).mtimeMs) return true;

  const generated = readGeneratedClientSchema();
  const source = fs.readFileSync(schemaPath, "utf8");

  for (const model of REQUIRED_MODELS) {
    if (source.includes(`model ${model}`) && !generated.includes(`model ${model}`)) {
      return true;
    }
  }

  for (const field of REQUIRED_BOOKING_FIELDS) {
    if (source.includes(field) && !generated.includes(field)) return true;
  }

  return false;
}

if (needsPrismaGenerate()) {
  console.log("\nPrisma schema/client out of sync — running prisma generate...\n");
  execSync("npx prisma generate", { cwd: root, stdio: "inherit" });
}
