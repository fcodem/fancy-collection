/** Routes that render without the app sidebar (prints, login, public QR). */
export function isBareRoute(pathname: string): boolean {
  if (pathname === "/~offline") return true;
  if (pathname.startsWith("/login")) return true;
  if (pathname.startsWith("/booking/qr/")) return true;
  if (/^\/booking\/\d+\/(slip|print|delivery-slip|return-slip|incomplete-slip)(\/|$)/.test(pathname)) return true;
  if (/^\/billing\/\d+\/print(\/|$)/.test(pathname)) return true;
  if (/^\/postponed-booking\/\d+\/print(\/|$)/.test(pathname)) return true;
  return false;
}
