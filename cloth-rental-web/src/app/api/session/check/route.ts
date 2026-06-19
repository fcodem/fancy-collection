import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";

export async function GET() {
  const user = await getCurrentUser();
  if (user) return NextResponse.json({ active: true });
  return NextResponse.json({ active: false }, { status: 401 });
}
