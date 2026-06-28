export default function DeliverySlipLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100vh", background: "#e8e8e8", padding: 0 }}>
      {children}
    </div>
  );
}
