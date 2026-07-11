import type { CSSProperties, ReactNode } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import {
  BRAND_ADDRESS_DEFAULT,
  BRAND_FULL_NAME,
  BRAND_GSTIN,
  BRAND_LOGO_PATH,
  BRAND_OWNER,
  BRAND_PHONE_PRIMARY,
  BRAND_PHONE_SECONDARY,
  BRAND_THEME_COLOR,
} from "@/lib/branding";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: `Privacy Policy for ${BRAND_FULL_NAME} — how we collect, use, and share information, including Meta / WhatsApp Business integrations.`,
  robots: { index: true, follow: true },
};

const LAST_UPDATED = "11 July 2026";

const pageWrap: CSSProperties = {
  margin: 0,
  minHeight: "100vh",
  fontFamily: "Georgia, 'Times New Roman', serif",
  background: "#f7f5f0",
  color: "#1a1a1a",
};

const h3: CSSProperties = {
  fontSize: "1.1rem",
  margin: "1.25rem 0 0.5rem",
  color: BRAND_THEME_COLOR,
};

export default function PrivacyPolicyPage() {
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
        <div style={{ maxWidth: 820, margin: "0 auto", display: "flex", gap: "1rem", alignItems: "center" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={BRAND_LOGO_PATH}
            alt={businessName}
            width={56}
            height={56}
            style={{ borderRadius: 8, background: "#fff", objectFit: "contain" }}
          />
          <div>
            <p style={{ margin: 0, fontSize: "0.75rem", letterSpacing: "0.08em", opacity: 0.9 }}>LEGAL</p>
            <h1 style={{ margin: "0.2rem 0 0", fontSize: "1.65rem", fontWeight: 700 }}>Privacy Policy</h1>
            <p style={{ margin: "0.35rem 0 0", fontSize: "0.95rem", opacity: 0.95 }}>{businessName}</p>
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 820, margin: "0 auto", padding: "2rem 1.25rem 4rem", lineHeight: 1.65, fontSize: "1.05rem" }}>
        <p style={{ marginTop: 0 }}>
          <strong>Last updated:</strong> {LAST_UPDATED}
        </p>
        <p>
          This Privacy Policy explains how <strong>{businessName}</strong> (&quot;we&quot;, &quot;us&quot;, or
          &quot;our&quot;), operated by <strong>{BRAND_OWNER}</strong>, collects, uses, stores, and shares personal
          information when you interact with our bridal / wedding rental business, our staff web application (the
          &quot;Service&quot;), and our communications through <strong>WhatsApp</strong> and related{" "}
          <strong>Meta Platforms</strong> products (including the WhatsApp Business / Cloud API and any Meta App we
          configure for this business).
        </p>
        <p>
          By providing your details to our shop, booking a rental, messaging us on WhatsApp, or using a booking slip
          link we send you, you acknowledge the practices described in this Policy.
        </p>

        <nav
          aria-label="Table of contents"
          style={{
            background: "#fff",
            border: "1px solid #ddd5c8",
            borderRadius: 8,
            padding: "1rem 1.25rem",
            margin: "1.5rem 0",
          }}
        >
          <p style={{ margin: "0 0 0.5rem", fontWeight: 700 }}>Contents</p>
          <ol style={{ margin: 0, paddingLeft: "1.25rem" }}>
            <li><a href="#who-we-are">Who we are</a></li>
            <li><a href="#scope">Scope of this Policy</a></li>
            <li><a href="#data-we-collect">Information we collect</a></li>
            <li><a href="#how-we-use">How we use information</a></li>
            <li><a href="#meta-whatsapp">WhatsApp, Meta App &amp; messaging</a></li>
            <li><a href="#sharing">How we share information</a></li>
            <li><a href="#public-links">Public booking slip links</a></li>
            <li><a href="#cookies">Cookies &amp; similar technologies</a></li>
            <li><a href="#retention">Retention</a></li>
            <li><a href="#security">Security</a></li>
            <li><a href="#rights">Your rights &amp; choices</a></li>
            <li><a href="#deletion">Data deletion requests</a></li>
            <li><a href="#children">Children</a></li>
            <li><a href="#international">International transfers</a></li>
            <li><a href="#changes">Changes to this Policy</a></li>
            <li><a href="#contact">Contact us</a></li>
          </ol>
        </nav>

        <Section id="who-we-are" title="1. Who we are">
          <p>
            <strong>Business name:</strong> {businessName}
            <br />
            <strong>Proprietor / operator:</strong> {BRAND_OWNER}
            <br />
            <strong>Address:</strong> {address}
            <br />
            <strong>GSTIN:</strong> {BRAND_GSTIN}
            <br />
            <strong>Phone / WhatsApp:</strong> {phonePrimary}
            {phonePrimary !== BRAND_PHONE_SECONDARY ? ` / ${BRAND_PHONE_SECONDARY}` : ""}
          </p>
          <p>
            We operate a wedding and occasion outfit rental business in Moradabad, India. Our Service is primarily a{" "}
            <strong>staff-facing rental management portal</strong>. Customers typically do not create online accounts;
            customer information is entered by our staff and used to fulfil rentals and communicate via WhatsApp.
          </p>
        </Section>

        <Section id="scope" title="2. Scope of this Policy">
          <p>This Policy covers personal information processed in connection with:</p>
          <ul>
            <li>In-store and phone bookings, deliveries, returns, and related paperwork;</li>
            <li>Our staff web application (login, booking, inventory, WhatsApp inbox, and admin tools);</li>
            <li>WhatsApp Business messaging (including templates, documents/PDFs, and chat replies);</li>
            <li>
              Any Meta / Facebook Developer App we use to connect WhatsApp Cloud API, webhooks, or related Meta products
              to our Service;
            </li>
            <li>Public links to booking, delivery, or return slip PDFs that we share with you.</li>
          </ul>
        </Section>

        <Section id="data-we-collect" title="3. Information we collect">
          <h3 style={h3}>3.1 Customer &amp; booking information</h3>
          <p>When you book or enquire with us, we may collect:</p>
          <ul>
            <li>Name and contact details (phone numbers, WhatsApp number, email if provided);</li>
            <li>Postal / delivery address and event venue details;</li>
            <li>Booking dates, times, outfit selections, notes, and payment mode / amount records;</li>
            <li>
              Identity verification information, including <strong>government ID details and ID photographs</strong>{" "}
              taken or uploaded at delivery or as required for rental security;
            </li>
            <li>Photos related to incomplete returns or outfit condition, where applicable;</li>
            <li>Prospect / enquiry details if you contact the shop before booking.</li>
          </ul>

          <h3 style={h3}>3.2 WhatsApp &amp; messaging information</h3>
          <p>When you message or receive messages from our business WhatsApp number, we may process:</p>
          <ul>
            <li>Your WhatsApp phone number and profile display name;</li>
            <li>Message content (text, captions) and media you send us;</li>
            <li>Delivery and read status information provided by Meta;</li>
            <li>
              Outbound content we send you, including booking confirmation, delivery/return slips, reminders, and (where
              applicable) promotional template messages.
            </li>
          </ul>

          <h3 style={h3}>3.3 Staff account information</h3>
          <p>For authorised staff using the Service we collect:</p>
          <ul>
            <li>Username and hashed password;</li>
            <li>Role / permission level and session identifiers;</li>
            <li>Login attempt records (including IP address) for security and rate limiting;</li>
            <li>Optional staff profile details (name, phone) and attendance / payroll records for internal HR use;</li>
            <li>Activity logs of actions taken in the system.</li>
          </ul>

          <h3 style={h3}>3.4 Technical &amp; operational data</h3>
          <ul>
            <li>Session cookies required for staff authentication;</li>
            <li>Basic UI preferences stored in the staff browser (for example sidebar layout);</li>
            <li>
              Inventory and garment photographs used for catalogue and AI-assisted dress matching (these are product
              images; they are not intended to identify customers).
            </li>
          </ul>
          <p>
            We do <strong>not</strong> operate consumer account sign-up on this website, and we do{" "}
            <strong>not</strong> use Google Analytics, Facebook Pixel, or similar advertising trackers on the Service as
            of the date of this Policy.
          </p>
        </Section>

        <Section id="how-we-use" title="4. How we use information">
          <p>We use personal information to:</p>
          <ul>
            <li>Create and manage rental bookings, deliveries, returns, and invoices;</li>
            <li>Verify customer identity and protect rental inventory;</li>
            <li>
              Send transactional WhatsApp messages (booking slips, delivery/return receipts, reminders, postponement
              notices);
            </li>
            <li>Respond to customer messages and run our WhatsApp inbox / auto-replies;</li>
            <li>
              Send marketing or festive offers via WhatsApp <strong>only</strong> where Meta template rules and
              applicable law allow, and you can ask us to stop;
            </li>
            <li>Operate staff login, security, audit logging, and business reporting;</li>
            <li>
              Improve inventory search using AI tools on garment images (not for profiling customers for advertising);
            </li>
            <li>Comply with legal, tax, and accounting obligations;</li>
            <li>Detect, prevent, and investigate fraud, abuse, or security incidents.</li>
          </ul>
        </Section>

        <Section id="meta-whatsapp" title="5. WhatsApp, Meta App &amp; messaging (important for Meta App Review)">
          <p>
            We use <strong>Meta&apos;s WhatsApp Business Platform / Cloud API</strong> (and related Meta developer tools)
            to communicate with customers. When you interact with us on WhatsApp, Meta also processes information under
            Meta&apos;s own terms and policies.
          </p>
          <p>
            <strong>Data we may share with Meta / WhatsApp in order to message you includes:</strong>
          </p>
          <ul>
            <li>Your phone number (in international format);</li>
            <li>Your name and booking reference details used as template parameters;</li>
            <li>
              Document attachments such as PDF booking / delivery / return slips (these PDFs may contain your name,
              address, phone numbers, outfit details, and payment summary);
            </li>
            <li>Message content and media exchanged in the chat;</li>
            <li>Webhook events (delivery/read status, inbound messages) that Meta sends to our servers.</li>
          </ul>
          <p>
            We do <strong>not</strong> use Facebook Login to create customer accounts on this Service. Our Meta App
            connection is for <strong>WhatsApp Business messaging and related business tooling</strong>, not for
            publishing to personal Facebook timelines or scraping friend lists.
          </p>
          <p>
            Meta&apos;s processing of WhatsApp data is also governed by Meta&apos;s Privacy Policy and WhatsApp Business
            terms. Please review Meta&apos;s documentation and policies for how Meta handles WhatsApp Business data.
          </p>
        </Section>

        <Section id="sharing" title="6. How we share information">
          <p>We share personal information only as needed to run the business, including with:</p>
          <ul>
            <li>
              <strong>Meta Platforms, Inc. / WhatsApp</strong> — as described in Section 5;
            </li>
            <li>
              <strong>Cloud hosting &amp; database providers</strong> that store our application data (for example
              PostgreSQL hosting and file/object storage used for photos and PDFs);
            </li>
            <li>
              <strong>OpenAI</strong> (or similar AI providers), when staff use image recognition / catalogue tools —
              typically garment photos and related prompts, not your ID documents as a primary purpose;
            </li>
            <li>
              <strong>Error monitoring</strong> tools (for example Sentry), if enabled, configured to avoid sending
              unnecessary personal data by default;
            </li>
            <li>
              <strong>Realtime infrastructure</strong> (for example Ably), if enabled, to sync operational events for
              staff browsers;
            </li>
            <li>Professional advisers, or authorities, where required by law or to protect our rights and property.</li>
          </ul>
          <p>We do not sell customer personal information.</p>
        </Section>

        <Section id="public-links" title="7. Public booking slip links">
          <p>
            Booking, delivery, and return slip PDFs may be available via a link that includes a public booking
            identifier (for example a WhatsApp &quot;View booking slip&quot; button). Anyone who has the link can open
            the PDF. Please do not forward slip links to people who should not see your booking details. If you believe a
            link was shared accidentally, contact us so we can help.
          </p>
        </Section>

        <Section id="cookies" title="8. Cookies &amp; similar technologies">
          <p>We use a limited set of cookies and browser storage:</p>
          <ul>
            <li>
              <strong>Staff session cookie</strong> (<code>fancy_collection_session</code>) — encrypted, HTTP-only cookie
              used to keep staff logged in (typically up to 7 days). This is essential for the staff portal and is not an
              advertising cookie.
            </li>
            <li>
              <strong>sessionStorage</strong> — temporary token during staff login approval flows;
            </li>
            <li>
              <strong>localStorage</strong> — non-identifying UI preference (for example sidebar collapsed state).
            </li>
          </ul>
          <p>
            Customers viewing a public slip PDF link are not required to log in and are not tracked with marketing
            cookies by this Service.
          </p>
        </Section>

        <Section id="retention" title="9. Retention">
          <p>
            We keep booking, customer, ID, payment, and WhatsApp records for as long as needed to fulfil rentals, handle
            disputes, meet tax/accounting requirements, and operate the business. Staff session cookies expire as
            described above; database records are retained until deleted in the ordinary course of business or upon a
            verified deletion request where we are not legally required to keep them.
          </p>
        </Section>

        <Section id="security" title="10. Security">
          <p>
            We use reasonable administrative and technical measures appropriate to a small business rental system,
            including hashed staff passwords, encrypted session cookies, role-based access for staff/owner features, and
            access limited to authorised personnel. No method of transmission or storage is 100% secure; please protect
            any slip links and ID documents shared with you.
          </p>
        </Section>

        <Section id="rights" title="11. Your rights &amp; choices">
          <p>Subject to applicable Indian law, you may request to:</p>
          <ul>
            <li>Access the personal information we hold about you;</li>
            <li>Correct inaccurate information;</li>
            <li>Request deletion of information we are not required to retain;</li>
            <li>Ask us to stop promotional WhatsApp messages (transactional rental messages may still be necessary).</li>
          </ul>
          <p>Contact us using the details in Section 16. We may need to verify your identity before fulfilling a request.</p>
        </Section>

        <Section id="deletion" title="12. Data deletion requests (including Meta App users)">
          <p>
            If you want us to delete personal information associated with your phone number, WhatsApp chat, or booking
            records, please contact us by WhatsApp or phone (Section 16) and state that you are making a{" "}
            <strong>data deletion request</strong>. Include the phone number used with us and, if known, your booking
            reference.
          </p>
          <p>
            We will review the request and delete or anonymise eligible data within a reasonable period, except where we
            must retain information for legal, accounting, fraud-prevention, or active rental obligations.
          </p>
          <p>
            Step-by-step instructions for Meta App Review are also published at:{" "}
            <Link href="/data-deletion">Data Deletion Instructions</Link>.
          </p>
        </Section>

        <Section id="children" title="13. Children">
          <p>
            Our rental services are directed to adults. We do not knowingly collect personal information from children
            under 13 (or under the age required by local law). If you believe a child has provided us information,
            contact us and we will take appropriate steps.
          </p>
        </Section>

        <Section id="international" title="14. International transfers">
          <p>
            Our primary operations are in India. Some processors (for example Meta, cloud hosts, or AI providers) may
            process data in other countries. Where that occurs, we rely on appropriate contractual and platform safeguards
            offered by those providers.
          </p>
        </Section>

        <Section id="changes" title="15. Changes to this Policy">
          <p>
            We may update this Privacy Policy from time to time. The &quot;Last updated&quot; date at the top will change
            when we do. Continued use of our services after an update constitutes acknowledgement of the revised Policy
            where permitted by law.
          </p>
        </Section>

        <Section id="contact" title="16. Contact us">
          <p>
            For privacy questions, access requests, or deletion requests:
            <br />
            <strong>{businessName}</strong>
            <br />
            {address}
            <br />
            Phone / WhatsApp: {phonePrimary}
            {phonePrimary !== BRAND_PHONE_SECONDARY ? ` / ${BRAND_PHONE_SECONDARY}` : ""}
          </p>
          <p style={{ fontSize: "0.95rem", color: "#444" }}>
            Related: <Link href="/data-deletion">User Data Deletion Instructions</Link>
            {" · "}
            <Link href="/login">Staff login</Link>
          </p>
        </Section>
      </main>

      <footer
        style={{
          borderTop: "1px solid #ddd5c8",
          padding: "1.25rem",
          textAlign: "center",
          fontSize: "0.9rem",
          color: "#555",
          background: "#fff",
        }}
      >
        © {new Date().getFullYear()} {businessName}. All rights reserved.
      </footer>
    </div>
  );
}

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section id={id} style={{ marginTop: "2rem", scrollMarginTop: 24 }}>
      <h2
        style={{
          fontSize: "1.35rem",
          color: BRAND_THEME_COLOR,
          borderBottom: "2px solid #cfe3d4",
          paddingBottom: "0.35rem",
          marginBottom: "0.75rem",
        }}
      >
        {title}
      </h2>
      {children}
    </section>
  );
}
