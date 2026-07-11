import { NextRequest } from "next/server";
import fs from "fs";
import path from "path";
import { jsonOk, jsonError, requireOwner, isResponse, requireJsonContentType } from "@/lib/api";

function envLocalPath(): string {
  return path.join(process.cwd(), ".env.local");
}

function upsertEnvKey(contents: string, key: string, value: string): string {
  const line = `${key}=${value}`;
  const re = new RegExp(`^${key}=.*$`, "m");
  if (re.test(contents)) return contents.replace(re, line);
  const trimmed = contents.replace(/\s*$/, "");
  return `${trimmed}\n${line}\n`;
}

/** Owner-only: replace WHATSAPP_ACCESS_TOKEN in .env.local and current process. */
export async function POST(req: NextRequest) {
  const user = await requireOwner();
  if (isResponse(user)) return user;

  const ct = requireJsonContentType(req);
  if (ct) return ct;

  const body = (await req.json()) as { accessToken?: string };
  const token = (body.accessToken || "").trim();
  if (token.length < 40) {
    return jsonError("Access token looks too short. Paste the full Meta token.", 400);
  }
  if (!/^EAA[A-Za-z0-9]+/.test(token) && !/^[A-Za-z0-9_-]{40,}$/.test(token)) {
    return jsonError("Token format looks invalid. Use a Meta System User / WhatsApp access token.", 400);
  }

  const filePath = envLocalPath();
  let existing = "";
  try {
    existing = fs.readFileSync(filePath, "utf8");
  } catch {
    existing = "";
  }

  const next = upsertEnvKey(existing, "WHATSAPP_ACCESS_TOKEN", token);
  try {
    fs.writeFileSync(filePath, next, "utf8");
  } catch (e) {
    return jsonError(
      e instanceof Error ? e.message : "Failed to write .env.local",
      500,
    );
  }

  process.env.WHATSAPP_ACCESS_TOKEN = token;

  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
  const ver = process.env.WHATSAPP_API_VERSION?.trim() || "v21.0";
  let metaOk = false;
  let metaError: string | undefined;
  let displayPhone: string | undefined;
  if (phoneId) {
    try {
      const res = await fetch(
        `https://graph.facebook.com/${ver}/${phoneId}?fields=display_phone_number,verified_name`,
        { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" },
      );
      const data = (await res.json()) as {
        display_phone_number?: string;
        error?: { message?: string };
      };
      if (res.ok && !data.error) {
        metaOk = true;
        displayPhone = data.display_phone_number;
      } else {
        metaError = data.error?.message || `HTTP ${res.status}`;
      }
    } catch (e) {
      metaError = e instanceof Error ? e.message : "Meta ping failed";
    }
  }

  return jsonOk({
    ok: true,
    saved: true,
    metaOk,
    displayPhone,
    metaError,
    message: metaOk
      ? "Token saved and verified with Meta. Restart the server when convenient so all workers reload env."
      : "Token saved to .env.local. Meta verification failed — check the token and restart the server.",
  });
}
