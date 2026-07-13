import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Bootstrap is permanently disabled — never create accounts via public API. */
export async function GET() {
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}

export async function POST() {
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}

export async function PUT() {
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}

export async function DELETE() {
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}
