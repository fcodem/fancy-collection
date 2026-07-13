import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import prisma from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * First-run setup: create owner account when the users table is empty.
 * GET  /api/setup/bootstrap-owner → { needsBootstrap }
 * POST /api/setup/bootstrap-owner → creates owner / admin123 (only if zero users)
 */
export async function POST() {
  try {
    const userCount = await prisma.user.count();
    if (userCount > 0) {
      return NextResponse.json(
        {
          ok: false,
          error: "Users already exist. Bootstrap is disabled. Use owner login or reset-owner script.",
        },
        { status: 409 },
      );
    }

    const passwordHash = await bcrypt.hash("admin123", 10);
    const owner = await prisma.user.create({
      data: {
        username: "owner",
        passwordHash,
        role: "owner",
        active: true,
      },
    });

    return NextResponse.json({
      ok: true,
      message: "Owner account created. Change this password after first login.",
      username: owner.username,
      password: "admin123",
      userId: owner.id,
    });
  } catch (e) {
    console.error("[bootstrap-owner]", e);
    return NextResponse.json(
      {
        ok: false,
        error: e instanceof Error ? e.message : "Bootstrap failed",
        hint: "Check DATABASE_URL / SESSION_SECRET in Vercel env, then retry.",
      },
      { status: 500 },
    );
  }
}

export async function GET() {
  try {
    const userCount = await prisma.user.count();
    return NextResponse.json({
      ok: true,
      needsBootstrap: userCount === 0,
      userCount,
    });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        error: e instanceof Error ? e.message : "DB check failed",
      },
      { status: 500 },
    );
  }
}
