"use client";

import { useState } from "react";
import { fetchJson } from "@/lib/fetchJson";

type PhotoSet = {
  original: string | null;
  enhanced: string | null;
  marketing: string | null;
  enhancementStatus: string;
  enhancedAt: string | null;
};

type Tab = "original" | "enhanced" | "marketing";

export default function InventoryPhotoTabs({
  itemId,
  photos,
  displayName,
  isOwner,
}: {
  itemId: number;
  photos: PhotoSet;
  displayName: string;
  isOwner: boolean;
}) {
  const hasEnhanced = !!photos.enhanced;
  const hasMarketing = !!photos.marketing;

  // Auto-enhancement is paused — always open on the uploaded original.
  const [active, setActive] = useState<Tab>("original");
  const [rerunning, setRerunning] = useState(false);
  const [rerunMsg, setRerunMsg] = useState("");

  const current =
    active === "enhanced" ? photos.enhanced
    : active === "marketing" ? photos.marketing
    : photos.original;

  async function triggerReEnhancement() {
    setRerunning(true);
    setRerunMsg("");
    try {
      await fetchJson(`/api/admin/recognition/${itemId}/embedding`, { method: "POST" });
      setRerunMsg("AI metadata refresh queued. Refresh in about a minute.");
    } catch (err) {
      setRerunMsg(err instanceof Error ? err.message : "Failed to queue re-enhancement");
    } finally {
      setRerunning(false);
    }
  }

  const tabs: { key: Tab; label: string; badge?: string }[] = [
    {
      key: "original",
      label: "Original",
      badge: undefined,
    },
    {
      key: "enhanced",
      label: "Enhanced",
      badge: photos.enhancementStatus === "processing" ? "…"
        : photos.enhancementStatus === "failed" ? "✗"
        : hasEnhanced ? "✓"
        : undefined,
    },
    {
      key: "marketing",
      label: "Marketing",
      badge: hasMarketing ? "✓" : undefined,
    },
  ];

  return (
    <div className="inv-detail-photo">
      {/* Tab bar */}
      <div
        style={{
          display: "flex",
          gap: 0,
          borderBottom: "2px solid #e5e5e5",
          marginBottom: 8,
        }}
      >
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setActive(t.key)}
            style={{
              padding: "6px 14px",
              fontSize: 12,
              fontWeight: active === t.key ? 700 : 400,
              border: "none",
              borderBottom: active === t.key ? "2px solid var(--accent, #8b6914)" : "2px solid transparent",
              background: "none",
              cursor: "pointer",
              color: active === t.key ? "var(--accent, #8b6914)" : "#888",
              marginBottom: -2,
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            {t.label}
            {t.badge && (
              <span
                style={{
                  fontSize: 10,
                  color:
                    t.badge === "✓" ? "#1a7a3c"
                    : t.badge === "✗" ? "#c00"
                    : "#b45309",
                  fontWeight: 700,
                }}
              >
                {t.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Photo */}
      {current ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={current}
          alt={`${displayName} — ${active}`}
          className="inv-detail-photo-img"
          style={{
            border:
              active === "enhanced" ? "2px solid var(--accent, #8b6914)"
              : active === "marketing" ? "2px solid #7c3aed"
              : "1px solid #e5e5e5",
          }}
        />
      ) : (
        <div className="inv-detail-photo-empty">
          {active === "original"
            ? "No photo uploaded"
            : active === "enhanced"
              ? photos.enhancementStatus === "processing"
                ? "Enhancement in progress…"
                : photos.enhancementStatus === "failed"
                  ? "Enhancement failed"
                  : "Auto-enhancement paused — upload is used as-is"
              : "No marketing image"}
        </div>
      )}

      {/* Status label */}
      <div style={{ marginTop: 4, fontSize: 11, color: "#999", textAlign: "center", minHeight: 16 }}>
        {active === "enhanced" && photos.enhancedAt
          ? `Enhanced on ${new Date(photos.enhancedAt).toLocaleDateString("en-GB")}`
          : active === "enhanced" && !hasEnhanced
            ? "Pipeline 2 paused — metadata still collected from upload"
          : active === "original"
            ? "Original upload — never modified"
            : active === "marketing"
              ? hasMarketing ? "Marketing image — not shown to customers" : ""
              : ""}
      </div>

      {/* Owner actions — re-run kept for future; currently queues metadata only while enhancement is paused */}
      {isOwner && active === "enhanced" && (
        <div style={{ marginTop: 8, textAlign: "center" }}>
          <button
            className="btn btn-sm btn-outline"
            style={{ fontSize: 11 }}
            onClick={triggerReEnhancement}
            disabled={rerunning}
            title="Auto-enhancement is paused. This refreshes AI metadata from the uploaded image."
          >
            {rerunning ? "Queuing…" : "Refresh AI Metadata"}
          </button>
          {rerunMsg && (
            <div style={{ marginTop: 4, fontSize: 11, color: "#666" }}>{rerunMsg}</div>
          )}
        </div>
      )}

      {isOwner && active === "marketing" && !hasMarketing && (
        <div style={{ marginTop: 8, textAlign: "center" }}>
          <a
            href="/ai-tools/catalog-generator"
            className="btn btn-sm"
            style={{ fontSize: 11, background: "#7c3aed", color: "#fff" }}
          >
            Generate Marketing Image
          </a>
        </div>
      )}
    </div>
  );
}
