import LateReturnClient from "@/components/LateReturnClient";
import { loadLateReturnPageCached } from "@/lib/services/lateReturnData";

export const dynamic = "force-dynamic";

export default async function LateReturnPage() {
  const initial = await loadLateReturnPageCached({ page: 1 });
  return <LateReturnClient initial={initial} />;
}
