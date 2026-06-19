import ServerAppShell from "@/components/ServerAppShell";
import CustomersClient from "@/components/CustomersClient";

export default async function CustomersPage() {
return (
    <ServerAppShell>
      <CustomersClient />
    </ServerAppShell>
  );
}
