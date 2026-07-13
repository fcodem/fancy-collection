const BLOCKED_PASSWORDS = new Set([
  "admin123",
  "password",
  "password123",
  "123456",
  "12345678",
  "qwerty",
  "owner",
  "fancy",
  "fancycollection",
]);

export function assertStrongPassword(
  password: string,
  opts: { role?: string | null; username?: string | null },
): void {
  const role = (opts.role || "").toLowerCase();
  const min = role === "owner" ? 16 : 12;
  if (password.length < min) {
    throw new Error(
      role === "owner"
        ? "Owner password must be at least 16 characters."
        : "Password must be at least 12 characters.",
    );
  }
  const lower = password.toLowerCase();
  if (BLOCKED_PASSWORDS.has(lower)) {
    throw new Error("That password is too common. Choose a unique password.");
  }
  const username = opts.username?.trim().toLowerCase();
  if (username && lower === username) {
    throw new Error("Password cannot be the same as the username.");
  }
  if (username && lower.includes(username) && username.length >= 4) {
    throw new Error("Password should not contain the username.");
  }
}
