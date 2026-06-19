import PageShell from "@/components/PageShell";

export default function DressSearchPage() {
  return (
    <PageShell title="Dress Search" breadcrumb="Search inventory by name or photo">
      <div className="card">
        <div className="card-body">
          <label>Dress name</label>
          <input
            type="text"
            className="form-control dress-name-suggest"
            placeholder="Type dress name…"
            id="dressSearchInput"
          />
          <p style={{ fontSize: 12, marginTop: 12, color: "var(--text-muted)" }}>
            Suggestions use the same any-word-order search as the Flask app.
          </p>
        </div>
      </div>
    </PageShell>
  );
}
