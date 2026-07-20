import { jsonOk, requireUserReadOnly, isResponse } from "@/lib/api";
import { getAllCategories } from "@/lib/categories";

export async function GET() {
  const user = await requireUserReadOnly();
  if (isResponse(user)) return user;
  const categories = await getAllCategories();
  return jsonOk(categories);
}
