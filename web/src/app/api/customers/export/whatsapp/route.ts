import { NextRequest } from "next/server";
import { exportCustomersWhatsapp } from "@/lib/services/customersOps";
import { requireUser, isResponse } from "@/lib/api";

export async function GET(req: NextRequest) {
  const user = await requireUser();
  if (isResponse(user)) return user;
  const category = req.nextUrl.searchParams.get("category") || "";
  const csv = await exportCustomersWhatsapp(category);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": 'attachment; filename="customers_whatsapp.csv"',
    },
  });
}
