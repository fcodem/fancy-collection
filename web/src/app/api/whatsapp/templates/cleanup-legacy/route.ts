import { NextRequest } from "next/server";
import { jsonOk, jsonError, requireOwner, isResponse } from "@/lib/api";
import { graphApiVersion } from "@/lib/services/whatsapp/metaApi";
import {
  ACTIVE_WHATSAPP_TEMPLATE_NAMES,
  isLegacyWhatsAppTemplateName,
  LEGACY_WHATSAPP_TEMPLATE_NAMES,
} from "@/lib/services/whatsapp/legacyTemplates";

type MetaTpl = { name: string; status?: string; language?: string; id?: string };

async function listAllTemplates(token: string, wabaid: string): Promise<MetaTpl[]> {
  const res = await fetch(
    `https://graph.facebook.com/${graphApiVersion()}/${wabaid}/message_templates` +
      `?fields=name,status,language,id&limit=100`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const data = (await res.json()) as { data?: MetaTpl[]; error?: { message?: string } };
  if (!res.ok) throw new Error(data.error?.message || `List HTTP ${res.status}`);
  return data.data || [];
}

async function deleteByName(token: string, wabaid: string, name: string) {
  const url =
    `https://graph.facebook.com/${graphApiVersion()}/${wabaid}/message_templates` +
    `?name=${encodeURIComponent(name)}`;
  const res = await fetch(url, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = (await res.json().catch(() => ({}))) as {
    success?: boolean;
    error?: { message?: string; error_user_msg?: string };
  };
  if (!res.ok) {
    return {
      ok: false as const,
      error: data.error?.error_user_msg || data.error?.message || `HTTP ${res.status}`,
    };
  }
  return { ok: true as const };
}

/** Owner-only: delete obsolete slip/notice templates from Meta (keeps current v3 + marketing). */
export async function POST(req: NextRequest) {
  const user = await requireOwner();
  if (isResponse(user)) return user;

  const token = process.env.WHATSAPP_ACCESS_TOKEN?.trim();
  const wabaid = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID?.trim();
  if (!token || !wabaid) return jsonError("WhatsApp credentials not configured", 500);

  const body = (await req.json().catch(() => ({}))) as { dryRun?: boolean; names?: string[] };
  const dryRun = Boolean(body.dryRun);

  let listed: MetaTpl[];
  try {
    listed = await listAllTemplates(token, wabaid);
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Failed to list templates", 500);
  }

  const onMeta = new Set(listed.map((t) => t.name.toLowerCase()));
  const explicit = (body.names || []).map((n) => n.trim().toLowerCase()).filter(Boolean);

  const candidates = [
    ...new Set([
      ...LEGACY_WHATSAPP_TEMPLATE_NAMES.map((n) => n.toLowerCase()),
      ...listed.map((t) => t.name.toLowerCase()).filter(isLegacyWhatsAppTemplateName),
      ...explicit,
    ]),
  ].filter((n) => !ACTIVE_WHATSAPP_TEMPLATE_NAMES.has(n));

  const toDelete = candidates.filter((n) => onMeta.has(n) || explicit.includes(n));
  const missing = candidates.filter((n) => !onMeta.has(n) && !explicit.includes(n));

  if (dryRun) {
    return jsonOk({
      ok: true,
      dryRun: true,
      keep: [...ACTIVE_WHATSAPP_TEMPLATE_NAMES],
      wouldDelete: toDelete,
      notOnMeta: missing,
      onMetaCount: listed.length,
    });
  }

  const results: Array<{ name: string; ok: boolean; error?: string; skipped?: boolean }> = [];
  for (const name of toDelete) {
    if (!onMeta.has(name)) {
      results.push({ name, ok: true, skipped: true });
      continue;
    }
    const r = await deleteByName(token, wabaid, name);
    results.push(r.ok ? { name, ok: true } : { name, ok: false, error: r.error });
    await new Promise((r) => setTimeout(r, 350));
  }

  return jsonOk({
    ok: results.every((r) => r.ok),
    deleted: results.filter((r) => r.ok && !r.skipped).map((r) => r.name),
    failed: results.filter((r) => !r.ok),
    skipped: results.filter((r) => r.skipped).map((r) => r.name),
    keep: [...ACTIVE_WHATSAPP_TEMPLATE_NAMES],
  });
}
