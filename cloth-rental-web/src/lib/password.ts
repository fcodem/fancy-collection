import { pbkdf2Sync, randomBytes, timingSafeEqual } from "crypto";

/** Compatible with Flask/Werkzeug pbkdf2:sha256 hashes from SQLite migration */
export function verifyPassword(password: string, storedHash: string): boolean {
  if (!storedHash) return false;
  const parts = storedHash.split("$");
  if (parts.length !== 3) return false;
  const [method, salt, hashHex] = parts;
  const methodParts = method.split(":");
  if (methodParts[0] !== "pbkdf2" || methodParts[1] !== "sha256") return false;
  const iterations = parseInt(methodParts[2], 10);
  if (!iterations || !salt || !hashHex) return false;
  const derived = pbkdf2Sync(password, salt, iterations, 32, "sha256");
  const stored = Buffer.from(hashHex, "hex");
  if (derived.length !== stored.length) return false;
  return timingSafeEqual(derived, stored);
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const iterations = 600000;
  const hash = pbkdf2Sync(password, salt, iterations, 32, "sha256").toString("hex");
  return `pbkdf2:sha256:${iterations}$${salt}$${hash}`;
}
