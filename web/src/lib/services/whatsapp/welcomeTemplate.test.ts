import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildCustomerWelcomeTemplateComponents,
  customerWelcomeTemplateName,
  customerWelcomeTemplatePreviewBody,
  getCustomerWelcomeTemplateDefaults,
} from "./welcomeTemplateCopy";
import { getWhatsAppBotSettingsDefaults } from "./botSettings";

const settings = getWhatsAppBotSettingsDefaults();

describe("customer welcome Meta template", () => {
  it("uses default template name", () => {
    assert.match(customerWelcomeTemplateName(), /^customer_welcome/);
  });

  it("builds two URL buttons for Maps and Instagram", () => {
    const components = buildCustomerWelcomeTemplateComponents(settings);
    const buttons = components.find((c) => c.type === "BUTTONS");
    assert.ok(buttons && "buttons" in buttons);
    assert.equal(buttons.buttons.length, 2);
    assert.equal(buttons.buttons[0]?.type, "URL");
    assert.equal(buttons.buttons[1]?.type, "URL");
    assert.match(String(buttons.buttons[0]?.url), /google\.com\/maps|maps\.google/i);
    assert.match(String(buttons.buttons[1]?.url), /instagram\.com\/fancycollection_renuagarwal/i);
  });

  it("includes both shop phone numbers in body", () => {
    const components = buildCustomerWelcomeTemplateComponents(settings);
    const body = components.find((c) => c.type === "BODY");
    assert.ok(body && "text" in body);
    assert.match(String(body.text), /8077843874/);
    assert.match(String(body.text), /8630834711/);
  });

  it("preview body mentions both buttons", () => {
    const preview = customerWelcomeTemplatePreviewBody(settings);
    assert.match(preview, /Shop Location/i);
    assert.match(preview, /Instagram/i);
    assert.match(preview, /automated reply/i);
  });

  it("template body includes automated disclaimer", () => {
    const components = buildCustomerWelcomeTemplateComponents(settings);
    const body = components.find((c) => c.type === "BODY");
    assert.ok(body && "text" in body);
    assert.match(String(body.text), /automated reply/i);
  });

  it("defaults export matches template name", () => {
    const defaults = getCustomerWelcomeTemplateDefaults();
    assert.equal(defaults.name, customerWelcomeTemplateName());
    assert.equal(defaults.category, "UTILITY");
  });
});
