import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy — LADOT Abandoned Vehicle Reporter",
};

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section style={{ marginBottom: 36 }}>
    <h2 style={{
      fontSize: 15, fontWeight: 600, color: "var(--text-primary)",
      marginBottom: 10, letterSpacing: "-0.01em",
    }}>
      {title}
    </h2>
    <div style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.7 }}>
      {children}
    </div>
  </section>
);

export default function PrivacyPage() {
  return (
    <div style={{
      maxWidth: 520, margin: "0 auto", padding: "0 16px 80px",
      position: "relative", zIndex: 1,
    }}>
      {/* Header */}
      <header style={{ padding: "40px 0 32px" }}>
        <Link href="/" style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          fontSize: 13, color: "var(--text-tertiary)", textDecoration: "none",
          marginBottom: 24,
          transition: "color 0.2s",
        }}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M9 3L5 7L9 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Back to app
        </Link>
        <h1 style={{
          fontSize: 26, fontWeight: 700, letterSpacing: "-0.03em",
          lineHeight: 1.2, color: "var(--text-primary)", marginBottom: 8,
        }}>
          Privacy Policy
        </h1>
        <p style={{ fontSize: 13, color: "var(--text-tertiary)" }}>
          Last updated: March 2026
        </p>
      </header>

      {/* Intro */}
      <div style={{
        background: "var(--surface-0)", border: "1px solid var(--border)",
        borderRadius: "var(--radius-lg)", padding: "16px 18px", marginBottom: 36,
        fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.7,
      }}>
        This app is a free, open-source citizen tool that helps you submit abandoned vehicle
        reports to the Los Angeles Department of Transportation (LADOT). It does not collect,
        store, or share any personal data. Everything stays on your device and goes directly
        to LADOT.
      </div>

      <Section title="What this app does">
        <p>When you use this app, it:</p>
        <ul style={{ paddingLeft: 18, marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
          <li>Optionally uses your camera or photo library to help identify a vehicle</li>
          <li>Optionally requests your GPS location to pre-fill the address fields</li>
          <li>Submits the completed report directly to LADOT's public reporting system</li>
        </ul>
        <p style={{ marginTop: 10 }}>
          That's it. No account required, no login, no tracking.
        </p>
      </Section>

      <Section title="Data we do not collect">
        <p>This app does <strong style={{ color: "var(--text-primary)", fontWeight: 500 }}>not</strong>:</p>
        <ul style={{ paddingLeft: 18, marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
          <li>Store any photos you take or upload</li>
          <li>Store license plate numbers or vehicle details</li>
          <li>Store or log your GPS coordinates</li>
          <li>Use cookies, analytics, or tracking pixels</li>
          <li>Create user accounts or profiles</li>
          <li>Share any information with third parties other than LADOT</li>
        </ul>
        <p style={{ marginTop: 10 }}>
          No database exists. Nothing is retained after your report is submitted.
        </p>
      </Section>

      <Section title="Photo & AI analysis">
        <p>
          If you choose to take or upload a photo, the image is processed entirely within your
          browser session to extract vehicle details (color, make, style, license plate). The
          image is sent to an AI vision service solely to perform this analysis and is not
          stored or used for any other purpose. Once the session ends, the image is gone.
        </p>
      </Section>

      <Section title="Location">
        <p>
          If you tap "Detect my location," your browser will ask for permission to access
          your GPS. This is used only to pre-fill the address fields. Your coordinates are
          not stored, logged, or transmitted anywhere except to a reverse-geocoding service
          (OpenStreetMap Nominatim) to convert them into a street address. That request
          contains no identifying information beyond the coordinates themselves.
        </p>
      </Section>

      <Section title="LADOT submission">
        <p>
          When you submit a report, the form data (vehicle details, address, optional email
          and comments) is forwarded to LADOT's existing public complaint system — the same
          system you would use by visiting their website directly. LADOT's own privacy
          practices apply to that submission. This app is not affiliated with LADOT.
        </p>
      </Section>

      <Section title="Third-party services">
        <p style={{ marginBottom: 8 }}>The app uses the following external services during a session:</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {[
            { name: "Google Gemini", purpose: "AI analysis of vehicle photos (image not retained)" },
            { name: "Plate Recognizer", purpose: "License plate detection from photos (image not retained)" },
            { name: "OpenStreetMap Nominatim", purpose: "Reverse geocoding of GPS coordinates" },
            { name: "LADOT ETIMS", purpose: "Street name lookup and final report submission" },
          ].map(({ name, purpose }) => (
            <div key={name} style={{
              background: "var(--surface-1)", border: "1px solid var(--border)",
              borderRadius: "var(--radius-md)", padding: "10px 14px",
              display: "flex", gap: 10,
            }}>
              <span style={{ fontWeight: 500, color: "var(--text-primary)", minWidth: 140, fontSize: 13 }}>{name}</span>
              <span style={{ color: "var(--text-tertiary)", fontSize: 13 }}>{purpose}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Contact">
        <p>
          This is a community-built tool. If you have questions or concerns about how this
          app works, you can review the source code or open an issue on the project
          repository.
        </p>
      </Section>
    </div>
  );
}
