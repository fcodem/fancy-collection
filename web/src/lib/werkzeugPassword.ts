import { pbkdf2Sync, scryptSync, timingSafeEqual } from "crypto";

/**
 * Verify passwords hashed by Flask/Werkzeug (generate_password_hash).
 * Formats: scrypt:32768:8:1$salt$hex  or  pbkdf2:sha256:600000$salt$hex
 */
export function verifyWerkzeugPassword(password: string, pwhash: string): boolean {
  if (!pwhash || !pwhash.includes("$")) return false;

  const firstSep = pwhash.indexOf("$");
  const secondSep = pwhash.indexOf("$", firstSep + 1);
  if (secondSep === -1) return false;

  const method = pwhash.slice(0, firstSep);
  const salt = pwhash.slice(firstSep + 1, secondSep);
  const hashval = pwhash.slice(secondSep + 1);

  try {
    if (method.startsWith("scrypt")) {
      const parts = method.split(":");
      const n = parseInt(parts[1] || "32768", 10);
      const r = parseInt(parts[2] || "8", 10);
      const p = parseInt(parts[3] || "1", 10);
      const derived = scryptSync(password, salt, 64, {
        N: n,
        r,
        p,
        maxmem: 256 * 1024 * 1024,
      });
      const stored = Buffer.from(hashval, "hex");
      if (derived.length !== stored.length) return false;
      return timingSafeEqual(derived, stored);
    }

    if (method.startsWith("pbkdf2")) {
      const algoParts = method.split(":");
      const digest = algoParts[1] || "sha256";
      const iterations = parseInt(algoParts[2] || "260000", 10);
      const stored = Buffer.from(hashval, "hex");
      const derived = pbkdf2Sync(password, salt, iterations, stored.length, digest);
      return timingSafeEqual(derived, stored);
    }
  } catch {
    return false;
  }

  return false;
}

export function isWerkzeugHash(hash: string): boolean {
  return hash.startsWith("scrypt:") || hash.startsWith("pbkdf2:");
}
