export type SaveConfirmedInfo = {
  title: string;
  detail?: string;
  hint?: string;
};

export function SaveConfirmedBanner({
  title,
  detail,
  hint = "Enter the next record below.",
}: SaveConfirmedInfo) {
  return (
    <div className="alert alert-success" style={{ marginBottom: 16, fontSize: 15 }}>
      <i className="fa-solid fa-circle-check" style={{ marginRight: 8 }} />
      <strong>{title}</strong>
      {detail ? (
        <>
          {" "}
          — <span>{detail}</span>
        </>
      ) : null}
      {hint ? <> {hint}</> : null}
    </div>
  );
}

export function buildSaveRedirectUrl(
  path: string,
  params: Record<string, string | number | undefined | null> = {},
) {
  const sp = new URLSearchParams({ saved: "1" });
  for (const [key, value] of Object.entries(params)) {
    if (value != null && value !== "") sp.set(key, String(value));
  }
  return `${path}?${sp.toString()}`;
}
