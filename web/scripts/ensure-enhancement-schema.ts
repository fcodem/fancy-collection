/**
 * Ensures enhancement / three-pipeline photo columns exist before Next.js serves traffic.
 * Run automatically from scripts/ensure-dev-ready.mjs on `npm run dev`.
 */
import { ensureEnhancementSchema } from "../src/lib/ai/ensureEnhancementSchema";

async function main() {
  const result = await ensureEnhancementSchema();
  if (result.applied.length > 0) {
    console.log(`[schema] Applied missing columns: ${result.applied.join(", ")}`);
  }
  if (result.missing.length > 0) {
    console.error(`[schema] Still missing columns: ${result.missing.join(", ")}`);
    console.error("[schema] Run: npx prisma migrate deploy");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("[schema] ensureEnhancementSchema failed:", err);
  process.exit(1);
});
