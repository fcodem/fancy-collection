import RecognitionAdminClient from "@/components/RecognitionAdminClient";

export default function RecognitionAdminPage() {
  return (
    <div className="page-content">
      <h1 className="page-title">Recognition Pipeline</h1>
      <p style={{ color: "var(--text-muted)", marginBottom: 20, fontSize: 14 }}>
        Rebuild AI fingerprints, inspect feature data, and compare inventory items.
      </p>
      <RecognitionAdminClient />
    </div>
  );
}
