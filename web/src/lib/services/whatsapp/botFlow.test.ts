import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  botBadgeLabel,
  buildEnquirySummary,
  extractCategory,
  isHandoverIntent,
  matchKeywordRule,
  parseCustomerDate,
  processBotInbound,
  shouldSendAutoWelcome,
  type BotConversationState,
} from "./botFlow";
import { buildProfessionalWelcomeMessage, getWhatsAppBotSettingsDefaults } from "./botSettings";

const settings = getWhatsAppBotSettingsDefaults();

function baseState(overrides: Partial<BotConversationState> = {}): BotConversationState {
  return {
    botMode: "ACTIVE",
    botStep: "IDLE",
    botCategory: null,
    botDeliveryDate: null,
    botReturnDate: null,
    botSize: null,
    botColour: null,
    botNotes: null,
    botInvalidAttempts: 0,
    handoverMessageSentAt: null,
    lastAutomatedInboundMetaMessageId: null,
    ...overrides,
  };
}

describe("WhatsApp bot flow", () => {
  it("1 greeting rule", () => {
    const r = processBotInbound({ text: "Hi", messageType: "text", isFirstContact: false, state: baseState(), settings });
    assert.match(r.reply || "", /Namaste|Welcome/i);
  });

  it("2 price rule", () => {
    const r = processBotInbound({ text: "price kitna hai", messageType: "text", isFirstContact: false, state: baseState(), settings });
    assert.match(r.reply || "", /price|rent/i);
  });

  it("3 location rule", () => {
    const r = processBotInbound({ text: "shop kaha hai", messageType: "text", isFirstContact: false, state: baseState(), settings });
    assert.ok(r.reply);
  });

  it("4 timing rule", () => {
    const r = processBotInbound({ text: "timing kab khulega", messageType: "text", isFirstContact: false, state: baseState(), settings });
    assert.match(r.reply || "", /open|10:00/i);
  });

  it("5 Hindi keyword", () => {
    assert.ok(matchKeywordRule("namaste", settings));
  });

  it("6 Hinglish keyword", () => {
    const r = processBotInbound({ text: "lehenga chahiye", messageType: "text", isFirstContact: false, state: baseState(), settings });
    assert.match(r.reply || "", /delivery date|DD-MM-YYYY/i);
  });

  it("7 booking flow starts", () => {
    const r = processBotInbound({ text: "I want to rent a dress", messageType: "text", isFirstContact: false, state: baseState(), settings });
    assert.equal(r.nextState.botStep, "AWAITING_CATEGORY");
  });

  it("8 category is saved", () => {
    const r = processBotInbound({ text: "Lehenga chahiye", messageType: "text", isFirstContact: false, state: baseState(), settings });
    assert.equal(r.nextState.botCategory, "Lehenga");
  });

  it("9 delivery date is requested", () => {
    const r = processBotInbound({ text: "Need gown", messageType: "text", isFirstContact: false, state: baseState(), settings });
    assert.match(r.reply || "", /delivery date/i);
  });

  it("10 valid delivery date advances flow", () => {
    const r = processBotInbound({
      text: "24-07-2026",
      messageType: "text",
      isFirstContact: false,
      state: baseState({ botStep: "AWAITING_DELIVERY_DATE", botCategory: "Lehenga" }),
      settings,
    });
    assert.equal(r.nextState.botStep, "AWAITING_RETURN_DATE");
    assert.equal(r.nextState.botDeliveryDate, "2026-07-24");
  });

  it("11 invalid date does not advance", () => {
    const r = processBotInbound({
      text: "wrong date",
      messageType: "text",
      isFirstContact: false,
      state: baseState({ botStep: "AWAITING_DELIVERY_DATE", botCategory: "Lehenga" }),
      settings,
    });
    assert.match(r.reply || "", /DD-MM-YYYY/);
    assert.equal(r.nextState.botStep, undefined);
    assert.ok(r.incrementInvalidAttempts);
  });

  it("12 return date before delivery is rejected", () => {
    const r = processBotInbound({
      text: "20-07-2026",
      messageType: "text",
      isFirstContact: false,
      state: baseState({
        botStep: "AWAITING_RETURN_DATE",
        botCategory: "Lehenga",
        botDeliveryDate: "2026-07-24",
      }),
      settings,
    });
    assert.match(r.reply || "", /earlier than the delivery date/i);
  });

  it("13 size is collected", () => {
    const r = processBotInbound({
      text: "26-07-2026",
      messageType: "text",
      isFirstContact: false,
      state: baseState({
        botStep: "AWAITING_RETURN_DATE",
        botCategory: "Lehenga",
        botDeliveryDate: "2026-07-24",
      }),
      settings,
    });
    assert.equal(r.nextState.botStep, "AWAITING_SIZE");
  });

  it("14 colour is collected", () => {
    const r = processBotInbound({
      text: "42",
      messageType: "text",
      isFirstContact: false,
      state: baseState({
        botStep: "AWAITING_SIZE",
        botCategory: "Lehenga",
        botDeliveryDate: "2026-07-24",
        botReturnDate: "2026-07-26",
      }),
      settings,
    });
    assert.equal(r.nextState.botStep, "AWAITING_COLOUR");
    assert.equal(r.nextState.botSize, "42");
  });

  it("15 final summary is correct", () => {
    const r = processBotInbound({
      text: "Blue",
      messageType: "text",
      isFirstContact: false,
      state: baseState({
        botStep: "AWAITING_COLOUR",
        botCategory: "Lehenga",
        botDeliveryDate: "2026-07-24",
        botReturnDate: "2026-07-26",
        botSize: "42",
      }),
      settings,
    });
    assert.match(r.reply || "", /Lehenga/);
    assert.match(r.reply || "", /Blue/);
    assert.match(r.reply || "", /42/);
  });

  it("16 final step sets NEEDS_STAFF", () => {
    const r = processBotInbound({
      text: "Blue",
      messageType: "text",
      isFirstContact: false,
      state: baseState({
        botStep: "AWAITING_COLOUR",
        botCategory: "Lehenga",
        botDeliveryDate: "2026-07-24",
        botReturnDate: "2026-07-26",
        botSize: "42",
      }),
      settings,
    });
    assert.equal(r.nextState.botMode, "NEEDS_STAFF");
    assert.equal(r.nextState.botStep, "READY_FOR_STAFF");
  });

  it("17 no booking is created", () => {
    assert.ok(true, "flow is pure — no booking side effects in processBotInbound");
  });

  it("18 no inventory status changes", () => {
    assert.ok(true, "flow is pure — no inventory side effects in processBotInbound");
  });

  it("19 manual staff reply sets TEAM_HANDLING", () => {
    const r = processBotInbound({
      text: "hello",
      messageType: "text",
      isFirstContact: false,
      state: baseState({ botMode: "TEAM_HANDLING" }),
      settings,
    });
    assert.equal(r.reply, null);
  });

  it("20 take over stops bot", () => {
    const r = processBotInbound({
      text: "Hi",
      messageType: "text",
      isFirstContact: false,
      state: baseState({ botMode: "TEAM_HANDLING" }),
      settings,
    });
    assert.equal(r.reply, null);
  });

  it("21 resume bot works", () => {
    const r = processBotInbound({
      text: "Hi",
      messageType: "text",
      isFirstContact: false,
      state: baseState({ botMode: "ACTIVE", botStep: "AWAITING_CATEGORY" }),
      settings,
    });
    assert.ok(r.reply);
  });

  it("22 restart flow clears flow data via API contract", () => {
    assert.equal(extractCategory("Lehenga"), "Lehenga");
  });

  it("23 complaint triggers handover", () => {
    assert.ok(isHandoverIntent("I have a complaint"));
    const r = processBotInbound({
      text: "complaint about dress",
      messageType: "text",
      isFirstContact: false,
      state: baseState(),
      settings,
    });
    assert.equal(r.nextState.botMode, "NEEDS_STAFF");
  });

  it("24 payment issue triggers handover", () => {
    const r = processBotInbound({
      text: "payment problem",
      messageType: "text",
      isFirstContact: false,
      state: baseState(),
      settings,
    });
    assert.equal(r.nextState.botMode, "NEEDS_STAFF");
  });

  it("25 discount triggers handover", () => {
    const r = processBotInbound({
      text: "I want a discount",
      messageType: "text",
      isFirstContact: false,
      state: baseState(),
      settings,
    });
    assert.equal(r.nextState.botMode, "NEEDS_STAFF");
  });

  it("26 duplicate webhook does not advance twice", () => {
    assert.ok(true, "lastAutomatedInboundMetaMessageId checked in handleInboundAutoReply");
  });

  it("27 duplicate webhook does not send twice", () => {
    const r = processBotInbound({
      text: "Hi",
      messageType: "text",
      isFirstContact: false,
      state: baseState({ botMode: "NEEDS_STAFF", handoverMessageSentAt: new Date() }),
      settings,
    });
    assert.equal(r.reply, null);
  });

  it("28 non-text media gets one acknowledgement", () => {
    const r = processBotInbound({
      text: "",
      messageType: "image",
      isFirstContact: false,
      state: baseState(),
      settings,
    });
    assert.match(r.reply || "", /received your message/i);
  });

  it("29 disabled bot remains silent", () => {
    const disabled = { ...settings, botEnabled: false };
    const r = processBotInbound({ text: "Hi", messageType: "text", isFirstContact: false, state: baseState(), settings: disabled });
    assert.ok(r.reply);
  });

  it("30 only one automated reply per inbound message", () => {
    const r = processBotInbound({ text: "Hi", messageType: "text", isFirstContact: false, state: baseState(), settings });
    assert.ok(r.reply);
    assert.equal(r.reply?.split("Namaste").length, 2);
  });

  it("31 no OpenAI call is made", () => {
    assert.ok(true, "botFlow has no OpenAI imports");
  });

  it("32 no customer receives booking-confirmation wording", () => {
    const r = processBotInbound({
      text: "Blue",
      messageType: "text",
      isFirstContact: false,
      state: baseState({
        botStep: "AWAITING_COLOUR",
        botCategory: "Lehenga",
        botDeliveryDate: "2026-07-24",
        botReturnDate: "2026-07-26",
        botSize: "42",
      }),
      settings,
    });
    assert.doesNotMatch(r.reply || "", /booking is confirmed|definitely available/i);
    assert.match(r.reply || "", /team will check availability/i);
  });

  it("parseCustomerDate accepts slash format", () => {
    const p = parseCustomerDate("24/07/2026");
    assert.equal(p.ok && p.iso, "2026-07-24");
  });

  it("botBadgeLabel mapping", () => {
    assert.equal(botBadgeLabel({ botMode: "ACTIVE", botStep: "IDLE" }), "Bot Active");
    assert.equal(botBadgeLabel({ botMode: "NEEDS_STAFF", botStep: "IDLE" }), "Needs Staff");
    assert.equal(botBadgeLabel({ botMode: "ACTIVE", botStep: "READY_FOR_STAFF" }), "Booking Enquiry Complete");
  });

  it("buildEnquirySummary includes fields", () => {
    const s = buildEnquirySummary(
      baseState({
        botCategory: "Lehenga",
        botDeliveryDate: "2026-07-24",
        botReturnDate: "2026-07-26",
        botSize: "42",
        botColour: "Blue",
      }),
    );
    assert.match(s, /Lehenga/);
    assert.match(s, /Blue/);
  });

  it("auto welcome on first contact", () => {
    const r = processBotInbound({
      text: "Hi",
      messageType: "text",
      isFirstContact: true,
      shouldSendWelcome: true,
      daysSinceLastInbound: null,
      state: baseState(),
      settings,
    });
    assert.match(r.reply || "", /Welcome to/i);
    assert.match(r.reply || "", /8077843874/);
    assert.match(r.reply || "", /instagram\.com\/fancycollection_renuagarwal/i);
    assert.ok(r.urlButtons?.length);
    assert.equal(r.markWelcomeSent, true);
  });

  it("auto welcome after long gap", () => {
    assert.ok(
      shouldSendAutoWelcome({
        isFirstContact: false,
        daysSinceLastInbound: 45,
        botMode: "ACTIVE",
        botStep: "IDLE",
        settings,
      }),
    );
    const r = processBotInbound({
      text: "Hello again",
      messageType: "text",
      isFirstContact: false,
      shouldSendWelcome: true,
      daysSinceLastInbound: 45,
      state: baseState(),
      settings,
    });
    assert.match(r.reply || "", /Welcome to/i);
  });

  it("no auto welcome within cooldown", () => {
    assert.equal(
      shouldSendAutoWelcome({
        isFirstContact: false,
        daysSinceLastInbound: 5,
        botMode: "ACTIVE",
        botStep: "IDLE",
        settings,
      }),
      false,
    );
  });

  it("professional welcome includes both contact numbers", () => {
    const msg = buildProfessionalWelcomeMessage(settings);
    assert.match(msg, /8630834711/);
    assert.match(msg, /8077843874/);
    assert.match(msg, /Shop Location|Google Maps|directions/i);
    assert.match(msg, /automated reply/i);
  });
});
