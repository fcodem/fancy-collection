import type { CSSProperties } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import {
  BRAND_ADDRESS_DEFAULT,
  BRAND_FULL_NAME,
  BRAND_OWNER,
  BRAND_PHONE_PRIMARY,
  BRAND_PHONE_SECONDARY,
  BRAND_THEME_COLOR,
} from "@/lib/branding";

export const metadata: Metadata = {
  title: "User Data Deletion Instructions",
  description: `How to request deletion of personal data held by ${BRAND_FULL_NAME} (Meta / WhatsApp App Review).`,
  robots: { index: true, follow: true },
};

const pageWrap: CSSProperties = {
  minHeight: "100vh",
  fontFamily: "Georgia, 'Times New Roman', serif",
  background: "#f7f5f0",
  color: "#1a1a1a",
};

/**
 * Meta App Review often requires a separate "User Data Deletion" instructions URL.
 * Deletion is handled manually by the business (no automated Graph callback yet).
 */
export default function DataDeletionPage() {
  const businessName = process.env.BUSINESS_NAME?.trim() || BRAND_FULL_NAME;
  const address = process.env.BUSINESS_ADDRESS?.trim() || BRAND_ADDRESS_DEFAULT;
  const phonePrimary = process.env.BUSINESS_PHONE?.trim() || BRAND_PHONE_PRIMARY;

  return (
    <div style={pageWrap}>
      <header
        style={{
          background: BRAND_THEME_COLOR,
          color: "#fff",
          padding: "1.75rem 1.25rem",
          borderBottom: "4px solid #0f3d1a",
        }}
      >
        <div style={{ maxWidth: 720, margin: "0 auto" }}>
          <p style={{ margin: 0, fontSize: "0.75rem", letterSpacing: "0.08em", opacity: 0.9 }}>LEGAL</p>
          <h1 style={{ margin: "0.2rem 0 0", fontSize: "1.55rem" }}>User Data Deletion Instructions</h1>
          <p style={{ margin: "0.35rem 0 0", opacity: 0.95 }}>{businessName}</p>
        </div>
      </header>

      <main style={{ maxWidth: 720, margin: "0 auto", padding: "2rem 1.25rem 4rem", lineHeight: 1.65, fontSize: "1.05rem" }}>
        <p>
          This page explains how to request deletion of personal data associated with{" "}
          <strong>{businessName}</strong> (operated by {BRAND_OWNER}), including data processed in connection with our{" "}
          <strong>Meta / WhatsApp Business</strong> integration.
        </p>

        <h2 style={{ color: BRAND_THEME_COLOR, fontSize: "1.25rem" }}>How to request deletion</h2>
        <ol>
          <li>
            Send a WhatsApp message or call us at <strong>{phonePrimary}</strong>
            {phonePrimary !== BRAND_PHONE_SECONDARY ? (
              <>
                {" "}
                or <strong>{BRAND_PHONE_SECONDARY}</strong>
              </>
            ) : null}
            .
          </li>
          <li>
            Write clearly: <em>&quot;Please delete my personal data&quot;</em>.
          </li>
          <li>
            Include:
            <ul>
              <li>The phone / WhatsApp number we should delete;</li>
              <li>Your full name as used on the booking (if any);</li>
              <li>Booking number or slip reference, if you have it.</li>
            </ul>
          </li>
          <li>
            We will verify the request (to protect against unauthorised deletions) and then delete or anonymise eligible
            records from our systems, including related WhatsApp conversation history we store, where we are not legally
            required to retain it.
          </li>
        </ol>

        <h2 style={{ color: BRAND_THEME_COLOR, fontSize: "1.25rem" }}>What we may retain</h2>
        <p>
          We may keep limited information where required for tax, accounting, fraud prevention, active rentals, or legal
          disputes. If something cannot be deleted immediately, we will tell you what remains and why.
        </p>

        <h2 style={{ color: BRAND_THEME_COLOR, fontSize: "1.25rem" }}>Meta / Facebook App note</h2>
        <p>
          Our Meta App is used for WhatsApp Business messaging. We do not create Facebook Login customer accounts. If
          Meta requires a data-deletion callback URL in the future, we may add an automated endpoint; until then,
          deletion requests are handled manually through the contact channels above.
        </p>

        <h2 style={{ color: BRAND_THEME_COLOR, fontSize: "1.25rem" }}>Contact</h2>
        <p>
          <strong>{businessName}</strong>
          <br />
          {address}
          <br />
          Phone / WhatsApp: {phonePrimary}
          {phonePrimary !== BRAND_PHONE_SECONDARY ? ` / ${BRAND_PHONE_SECONDARY}` : ""}
        </p>

        <p>
          <Link href="/privacy">← Back to Privacy Policy</Link>
        </p>
      </main>
    </div>
  );
}
