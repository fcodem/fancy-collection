import FreeItemsClient from "@/components/FreeItemsClient";
import { todayIso } from "@/lib/constants";

export default async function FreeItemsPage() {
return (
    <FreeItemsClient today={todayIso()} />
  );
}
