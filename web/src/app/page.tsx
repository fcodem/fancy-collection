import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentUserForLayout, isOwner } from "@/lib/auth";
import DashboardSectionBoundary from "@/components/DashboardSectionBoundary";
import {
  DashboardAiHealthSection,
  DashboardBusinessSection,
  DashboardEssentialSection,
  DashboardFinanceSection,
  DashboardOrdersSection,
  DashboardOverdueSection,
  DashboardReturningSection,
  DashboardSectionSkeleton,
  DashboardShellSkeleton,
  DashboardStaffSection,
} from "@/components/DashboardSections";

export const dynamic = "force-dynamic";
/** Keep dashboard under Vercel hobby/pro function limits; fail rather than hang. */
export const maxDuration = 30;

export default async function DashboardPage() {
  const user = await getCurrentUserForLayout();
  if (!user) redirect("/login");

  const owner = isOwner(user);
  return (
    <>
      <DashboardSectionBoundary title="Essential dashboard cards">
        <Suspense fallback={<DashboardShellSkeleton />}>
          <DashboardEssentialSection isOwner={owner} />
        </Suspense>
      </DashboardSectionBoundary>

      <DashboardSectionBoundary title="Business summary">
        <Suspense fallback={<DashboardSectionSkeleton title="Business & Inventory Summary" />}>
          <DashboardBusinessSection />
        </Suspense>
      </DashboardSectionBoundary>

      <DashboardSectionBoundary title="Finance summary">
        <Suspense fallback={<DashboardSectionSkeleton title="Finance Summary" />}>
          <DashboardFinanceSection />
        </Suspense>
      </DashboardSectionBoundary>

      <DashboardSectionBoundary title="Orders due soon">
        <Suspense fallback={<DashboardSectionSkeleton title="Orders Due Soon" />}>
          <DashboardOrdersSection />
        </Suspense>
      </DashboardSectionBoundary>

      <DashboardSectionBoundary title="Overdue rentals">
        <Suspense fallback={<DashboardSectionSkeleton title="Overdue Rentals" />}>
          <DashboardOverdueSection />
        </Suspense>
      </DashboardSectionBoundary>

      <DashboardSectionBoundary title="Returning today">
        <Suspense fallback={<DashboardSectionSkeleton title="Returning Today" />}>
          <DashboardReturningSection />
        </Suspense>
      </DashboardSectionBoundary>

      {owner && (
        <DashboardSectionBoundary title="Owner and staff widgets">
          <Suspense fallback={<DashboardSectionSkeleton title="Owner / Staff" />}>
            <DashboardStaffSection />
          </Suspense>
        </DashboardSectionBoundary>
      )}

      <DashboardSectionBoundary title="AI health">
        <Suspense fallback={<DashboardSectionSkeleton title="AI Indexing Health" />}>
          <DashboardAiHealthSection />
        </Suspense>
      </DashboardSectionBoundary>
    </>
  );
}
