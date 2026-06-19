import { NextRequest } from "next/server";
import { searchBookingsByText, serializeBookingForList } from "@/lib/booking";
import { parseDate, startOfMonth, endOfMonth } from "@/lib/constants";
import { jsonOk } from "@/lib/api";

export async function GET(req: NextRequest) {
  const searchDate = req.nextUrl.searchParams.get("date") || new Date().toISOString().slice(0, 10);
  const queryText = req.nextUrl.searchParams.get("q")?.trim() || "";
  const refDate = parseDate(searchDate);
  const monthStart = startOfMonth(refDate);
  const monthEnd = endOfMonth(refDate);

  let results = await searchBookingsByText(queryText, {
    returnDate: { gte: monthStart, lt: monthEnd },
    status: "delivered",
  });

  if (!results.length && queryText) {
    const prevStart = new Date(Date.UTC(refDate.getUTCFullYear(), refDate.getUTCMonth() - 1, 1));
    const prevEnd = startOfMonth(refDate);
    results = await searchBookingsByText(queryText, {
      returnDate: { gte: prevStart, lt: prevEnd },
      status: "delivered",
    });
  }

  return jsonOk(results.map(serializeBookingForList));
}
