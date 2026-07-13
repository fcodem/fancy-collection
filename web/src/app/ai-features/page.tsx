import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser, isOwner } from "@/lib/auth";

export const dynamic = "force-dynamic";

type AiFeatureLink = {
  href: string;
  label: string;
  description: string;
  icon: string;
  ownerOnly?: boolean;
};

const AI_FEATURES: AiFeatureLink[] = [
  {
    href: "/booking-assistant",
    label: "AI Booking Assistant",
    description: "Ask questions about availability and bookings in plain language.",
    icon: "fa-robot",
  },
  {
    href: "/inventory/search",
    label: "Dress Search",
    description: "Find dresses by photo or description using AI matching.",
    icon: "fa-shirt",
  },
  {
    href: "/ai-dashboard",
    label: "AI Mode",
    description: "Owner AI overview dashboard.",
    icon: "fa-wand-magic-sparkles",
    ownerOnly: true,
  },
  {
    href: "/admin/ai-indexing",
    label: "AI Indexing Health",
    description: "Monitor dress index queue and worker health.",
    icon: "fa-heart-pulse",
    ownerOnly: true,
  },
  {
    href: "/admin/recognition",
    label: "AI Recognition",
    description: "Catalog fingerprints and recognition status.",
    icon: "fa-fingerprint",
    ownerOnly: true,
  },
  {
    href: "/admin/recognition/diagnostics",
    label: "AI Diagnostics",
    description: "Deep diagnostics for recognition pipelines.",
    icon: "fa-microscope",
    ownerOnly: true,
  },
  {
    href: "/admin/ai-debug",
    label: "AI Dress Checker Debug",
    description: "Debug dress checker matching behaviour.",
    icon: "fa-bug",
    ownerOnly: true,
  },
  {
    href: "/admin/dress-checker-debug",
    label: "Dress Checker Scores",
    description: "Inspect match scores and search debug output.",
    icon: "fa-chart-bar",
    ownerOnly: true,
  },
  {
    href: "/admin/ai-settings",
    label: "AI Settings",
    description: "Configure AI features and thresholds.",
    icon: "fa-sliders",
    ownerOnly: true,
  },
];

export default async function AiFeaturesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const owner = isOwner(user);
  const links = AI_FEATURES.filter((f) => owner || !f.ownerOnly);

  return (
    <div className="card">
      <div className="card-body">
        <h1 className="page-title" style={{ marginTop: 0 }}>AI Features</h1>
        <p style={{ marginTop: 0, color: "#64748b", maxWidth: 640 }}>
          All AI tools in one place. Open any feature below — pages are unchanged, only the sidebar menu was simplified.
        </p>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
            gap: 14,
            marginTop: 16,
          }}
        >
          {links.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              style={{
                display: "block",
                padding: "16px 18px",
                borderRadius: 10,
                border: "1px solid #e2e8f0",
                background: "#fff",
                textDecoration: "none",
                color: "inherit",
                boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                <i className={`fa-solid ${item.icon}`} style={{ color: "#7B1F45", fontSize: 18 }} />
                <strong style={{ fontSize: 15 }}>{item.label}</strong>
              </div>
              <div style={{ fontSize: 13, color: "#64748b", lineHeight: 1.4 }}>{item.description}</div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
