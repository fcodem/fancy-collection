import Link from "next/link";

export default function PlaceholderPage({
  title,
  flaskPath,
  note,
}: {
  title: string;
  flaskPath?: string;
  note?: string;
}) {
  return (
    <div className="card">
      <div className="card-header"><h3 className="card-title">{title}</h3></div>
      <div className="card-body">
        <p style={{ marginBottom: 16 }}>
          This screen is part of the Next.js migration. Core APIs are available; full UI for this page is being ported.
        </p>
        {note && <p style={{ color: "var(--text-muted)", fontSize: 13 }}>{note}</p>}
        {flaskPath && (
          <p style={{ fontSize: 13 }}>
            Until this page is complete, use the original Flask app at{" "}
            <Link href={`http://localhost:5000${flaskPath}`}>localhost:5000{flaskPath}</Link> for full functionality.
          </p>
        )}
      </div>
    </div>
  );
}
