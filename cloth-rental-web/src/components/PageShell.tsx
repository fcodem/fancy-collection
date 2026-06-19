import AppLayout from "@/components/AppLayout";

/** Placeholder — page shell; business APIs are ported under /api/* */
export default function PageShell({
  title,
  breadcrumb,
  children,
}: {
  title: string;
  breadcrumb?: string;
  children?: React.ReactNode;
}) {
  return (
    <AppLayout title={title} breadcrumb={breadcrumb}>
      {children || (
        <div className="card">
          <div className="card-body">
            <p>
              This screen is wired in Next.js. Connect UI from the Flask template or use the matching{" "}
              <code>/api/</code> endpoint — same data as the Python app.
            </p>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
