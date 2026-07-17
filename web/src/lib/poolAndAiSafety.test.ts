import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PHOTO_SEARCH_MAX_BYTES } from "@/lib/services/siglipSearch";
import { normalizeDatabaseUrl } from "@/lib/prisma";

describe("AI photo size fence", () => {
  it("caps remote/local photo loads at 10MB", () => {
    assert.equal(PHOTO_SEARCH_MAX_BYTES, 10 * 1024 * 1024);
  });
});

describe("pool connection_limit policy", () => {
  it("forces connection_limit=3 for supabase pooler URLs", () => {
    const prevVercel = process.env.VERCEL;
    process.env.VERCEL = "1";
    try {
      const out = normalizeDatabaseUrl(
        "postgresql://u:p@db.xxx.supabase.co:6543/postgres?sslmode=require",
      );
      assert.ok(out);
      assert.match(out!, /connection_limit=3/);
      assert.match(out!, /pgbouncer=true/);
    } finally {
      if (prevVercel === undefined) delete process.env.VERCEL;
      else process.env.VERCEL = prevVercel;
    }
  });
});
