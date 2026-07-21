import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  computeMetaWebhookSignature,
  verifyMetaWebhookSignature,
  maskPhoneForWebhookLog,
} from "./webhookSignature";
import { parseIncomingWhatsAppMessage } from "./webhookTypes";
import {
  handleWebhookGetVerification,
  handleWebhookPost,
} from "./webhookRouteHandlers";

const TEST_SECRET = "test-meta-app-secret-value";
const VERIFY_TOKEN = "test-verify-token-value";

describe("Meta webhook signature", () => {
  before(() => {
    process.env.META_APP_SECRET = TEST_SECRET;
    process.env.NODE_ENV = "test";
  });

  after(() => {
    delete process.env.META_APP_SECRET;
  });

  it("accepts a valid POST signature", () => {
    const raw = JSON.stringify({ object: "whatsapp_business_account" });
    const sig = computeMetaWebhookSignature(raw, TEST_SECRET);
    assert.deepEqual(verifyMetaWebhookSignature(raw, sig), { ok: true });
  });

  it("rejects an invalid POST signature", () => {
    const raw = JSON.stringify({ object: "whatsapp_business_account" });
    assert.equal(verifyMetaWebhookSignature(raw, "sha256=deadbeef").ok, false);
  });

  it("rejects a missing POST signature", () => {
    const raw = "{}";
    const result = verifyMetaWebhookSignature(raw, null);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "missing_signature");
  });

  it("rejects tampered body", () => {
    const raw = JSON.stringify({ entry: [] });
    const sig = computeMetaWebhookSignature(raw, TEST_SECRET);
    const tampered = JSON.stringify({ entry: [{ id: "x" }] });
    assert.equal(verifyMetaWebhookSignature(tampered, sig).ok, false);
  });
});

describe("webhook message parsing", () => {
  it("parses text message", () => {
    const parsed = parseIncomingWhatsAppMessage(
      {
        id: "wamid.TEXT123",
        from: "919876543210",
        timestamp: "1700000000",
        type: "text",
        text: { body: "Hello shop" },
      },
      { profile: { name: "Test User" }, wa_id: "919876543210" },
    );
    assert.equal(parsed.messageType, "text");
    assert.equal(parsed.body, "Hello shop");
    assert.equal(parsed.metaMessageId, "wamid.TEXT123");
    assert.equal(parsed.media, null);
    assert.equal(parsed.isTextLike, true);
  });

  it("parses image message with media descriptor", () => {
    const parsed = parseIncomingWhatsAppMessage({
      id: "wamid.IMG123",
      from: "919876543210",
      timestamp: "1700000001",
      type: "image",
      image: { id: "media-img-1", mime_type: "image/jpeg", caption: "See dress" },
    });
    assert.equal(parsed.messageType, "image");
    assert.equal(parsed.media?.metaMediaId, "media-img-1");
    assert.equal(parsed.body, "See dress");
  });

  it("parses document message", () => {
    const parsed = parseIncomingWhatsAppMessage({
      id: "wamid.DOC123",
      from: "919876543210",
      timestamp: "1700000002",
      type: "document",
      document: {
        id: "media-doc-1",
        filename: "id-proof.pdf",
        mime_type: "application/pdf",
      },
    });
    assert.equal(parsed.messageType, "document");
    assert.equal(parsed.filename, "id-proof.pdf");
    assert.equal(parsed.media?.mimeType, "application/pdf");
  });

  it("parses audio message", () => {
    const parsed = parseIncomingWhatsAppMessage({
      id: "wamid.AUD123",
      from: "919876543210",
      timestamp: "1700000003",
      type: "audio",
      audio: { id: "media-aud-1", mime_type: "audio/ogg" },
    });
    assert.equal(parsed.messageType, "audio");
    assert.equal(parsed.media?.metaMediaId, "media-aud-1");
  });

  it("parses video message", () => {
    const parsed = parseIncomingWhatsAppMessage({
      id: "wamid.VID123",
      from: "919876543210",
      timestamp: "1700000004",
      type: "video",
      video: { id: "media-vid-1", mime_type: "video/mp4" },
    });
    assert.equal(parsed.messageType, "video");
    assert.equal(parsed.media?.mimeType, "video/mp4");
  });
});

describe("webhook logging hygiene", () => {
  it("masks phone numbers in logs", () => {
    assert.equal(maskPhoneForWebhookLog("+919876543210"), "******3210");
  });

  it("route does not log full message body", () => {
    const route = fs.readFileSync(
      path.join(process.cwd(), "src/app/api/whatsapp/webhook/route.ts"),
      "utf8",
    );
    assert.doesNotMatch(route, /Incoming from.*"\$\{body\}"/);
    assert.doesNotMatch(route, /full-phone-number/);
  });
});

describe("webhook route GET verification", () => {
  before(() => {
    process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN = VERIFY_TOKEN;
  });

  after(() => {
    delete process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
  });

  it("returns challenge for correct verify token", () => {
    const result = handleWebhookGetVerification({
      mode: "subscribe",
      token: VERIFY_TOKEN,
      challenge: "abc123",
      verifyToken: VERIFY_TOKEN,
    });
    assert.equal(result.status, 200);
    assert.equal(result.body, "abc123");
  });

  it("returns 403 for incorrect verify token", () => {
    const result = handleWebhookGetVerification({
      mode: "subscribe",
      token: "wrong",
      challenge: "abc123",
      verifyToken: VERIFY_TOKEN,
    });
    assert.equal(result.status, 403);
  });
});

describe("webhook route POST security and ack", () => {
  before(() => {
    process.env.META_APP_SECRET = TEST_SECRET;
    process.env.NODE_ENV = "test";
  });

  after(() => {
    delete process.env.META_APP_SECRET;
  });

  it("returns 401 for invalid signature", async () => {
    const result = await handleWebhookPost(JSON.stringify({ entry: [] }), "sha256=invalid", {
      acceptPayload: async () => ({ accepted: 0, duplicates: 0, queued: 0 }),
      drainQueue: async () => 0,
      scheduleDrain: () => {},
    });
    assert.equal(result.status, 401);
  });

  it("returns 401 when signature header is missing", async () => {
    const result = await handleWebhookPost(JSON.stringify({ entry: [] }), null, {
      acceptPayload: async () => ({ accepted: 0, duplicates: 0, queued: 0 }),
      drainQueue: async () => 0,
      scheduleDrain: () => {},
    });
    assert.equal(result.status, 401);
  });

  it("returns HTTP 200 quickly with valid signature", async () => {
    const body = JSON.stringify({ entry: [{ changes: [{ value: {} }] }] });
    const sig = computeMetaWebhookSignature(body, TEST_SECRET);
    let acceptCalls = 0;
    const started = Date.now();
    const result = await handleWebhookPost(body, sig, {
      acceptPayload: async () => {
        acceptCalls += 1;
        return { accepted: 0, duplicates: 0, queued: 0 };
      },
      drainQueue: async () => 0,
      scheduleDrain: () => {},
    });
    const elapsed = Date.now() - started;
    assert.equal(result.status, 200);
    assert.equal(result.body, "OK");
    assert.ok(elapsed < 500, `expected fast ack, took ${elapsed}ms`);
    assert.equal(acceptCalls, 1);
  });
});

describe("webhook durable queue and idempotency contracts", () => {
  const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");

  it("uses unique metaMessageId and queue for follow-up", () => {
    const inbound = read("src/lib/services/whatsapp/webhookInbound.ts");
    assert.match(inbound, /metaMessageId: parsed\.metaMessageId/);
    assert.match(inbound, /duplicate: true/);
    assert.match(inbound, /whatsAppWebhookQueue/);
    assert.match(inbound, /enqueueWebhookFollowUp/);
    assert.match(inbound, /handleInboundAutoReply/);
    assert.doesNotMatch(inbound, /graph\.facebook\.com/);
  });

  it("downloads media via token and stores private blob reference", () => {
    const media = read("src/lib/services/whatsapp/webhookMedia.ts");
    assert.match(media, /Authorization.*Bearer/);
    assert.match(media, /whatsapp-inbox/);
    assert.match(media, /savePrivateBookingMedia/);
  });

  it("schema enforces unique meta message id", () => {
    const schema = read("prisma/schema.prisma");
    assert.match(schema, /metaMessageId\s+String\?\s+@unique/);
    assert.match(schema, /WhatsAppWebhookQueue/);
  });

  it("status updates are handled in fast path", () => {
    const inbound = read("src/lib/services/whatsapp/webhookInbound.ts");
    assert.match(inbound, /persistStatusUpdate/);
    assert.match(inbound, /deliveryStatus/);
  });

  it("duplicate delivery does not increment unread in duplicate branch", () => {
    const inbound = read("src/lib/services/whatsapp/webhookInbound.ts");
    assert.match(inbound, /duplicate_ignored/);
    assert.match(inbound, /if \(persisted\.duplicate\)/);
  });
});

describe("auto-reply queue", () => {
  it("auto-reply runs from queue drain not webhook hot path", () => {
    const route = fs.readFileSync(
      path.join(process.cwd(), "src/app/api/whatsapp/webhook/route.ts"),
      "utf8",
    );
    assert.doesNotMatch(route, /handleInboundAutoReply/);
    assert.match(route, /drainWhatsAppWebhookQueue/);
    assert.match(route, /after\(/);
  });
});
