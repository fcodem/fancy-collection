import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import prisma from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function bootstrapAllowed(): boolean {
  // Disabled on Vercel/production unless an explicit one-time secret is provided.
  if (process.env.VERCEL === "1" || process.env.NODE_ENV === "production") {
    return Boolean(process.env.SETUP_BOOTSTRAP_SECRET?.trim());
  }
  return true;
}

function requireBootstrapSecret(req: Request): boolean {
  const expected = process.env.SETUP_BOOTSTRAP_SECRET?.trim();
  if (!expected) return true; // local only path
  const got =
    req.headers.get("x-setup-bootstrap-secret")?.trim() ||
    new URL(req.url).searchParams.get("secret")?.trim() ||
    "";
  return got.length > 0 && got === expected;
}

/**
 * First-run setup only. Disabled in production unless SETUP_BOOTSTRAP_SECRET is set
 * and sent as header x-setup-bootstrap-secret. Never returns a default password.
 */
export async function POST(req: Request) {
  if (!bootstrapAllowed() || !requireBootstrapSecret(req)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const userCount = await prisma.user.count();
    if (userCount > 0) {
      return NextResponse.json(
        { ok: false, error: "Users already exist. Bootstrap is disabled." },
        { status: 409 },
      );
    }

    const password =
      process.env.OWNER_BOOTSTRAP_PASSWORD?.trim() ||
      randomBytes(18).toString("base64url");
    if (password.length < 16) {
      return NextResponse.json(
        {
          ok: false,
          error: "OWNER_BOOTSTRAP_PASSWORD must be at least 16 characters when set.",
        },
        { status: 400 },
      );
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const owner = await prisma.user.create({
      data: {
        username: "owner",
        passwordHash,
        role: "owner",
        active: true,
      },
    });

    // Password returned only once at first bootstrap — change immediately after login.
    return NextResponse.json({
      ok: true,
      message:
        "Owner account created. Store the password securely and change it after first login. This endpoint should be disabled after setup.",
      username: owner.username,
      temporaryPassword: password,
      userId: owner.id,
    });
  } catch (e) {
    console.error("[bootstrap-owner]", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Bootstrap failed" },
      { status: 500 },
    );
  }
}

export async function GET(req: Request) {
  if (!bootstrapAllowed() || !requireBootstrapSecret(req)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  try {
    const userCount = await prisma.user.count();
    return NextResponse.json({
      ok: true,
      needsBootstrap: userCount === 0,
    });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
