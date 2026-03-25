"use client";

import { useState, useEffect } from "react";

export default function ResultStep({
  refNumber, onReset,
}: {
  refNumber: string;
  onReset: () => void;
}) {
  const [showCheck, setShowCheck] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setShowCheck(true), 200);
    return () => clearTimeout(t);
  }, []);

  return (
    <div>
      <div className="glass" style={{
        padding: "40px 24px", textAlign: "center",
        borderRadius: "var(--radius-xl)",
      }}>
        {/* Animated checkmark */}
        <div style={{
          width: 72, height: 72, borderRadius: "50%", margin: "0 auto 20px",
          background: "var(--success-muted)", border: "2px solid var(--success-border)",
          display: "flex", alignItems: "center", justifyContent: "center",
          transition: "all 0.5s var(--spring)",
          transform: showCheck ? "scale(1)" : "scale(0.5)",
          opacity: showCheck ? 1 : 0,
        }}>
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
            <path
              d="M9 16.5L14 21.5L23 11"
              stroke="var(--success)"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{
                strokeDasharray: 30,
                strokeDashoffset: showCheck ? 0 : 30,
                transition: "stroke-dashoffset 0.6s cubic-bezier(0.65, 0, 0.35, 1) 0.3s",
              }}
            />
          </svg>
        </div>

        <h2 style={{
          fontSize: 22, fontWeight: 700, color: "var(--text-primary)",
          marginBottom: 8, letterSpacing: "-0.02em",
        }}>
          Report Submitted
        </h2>
        <p style={{
          fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.6,
          maxWidth: 320, margin: "0 auto",
        }}>
          Your abandoned vehicle report has been sent to LADOT via their complaint form.
        </p>

        {/* Status */}
        <div style={{
          margin: "24px auto 0", maxWidth: 280,
          background: "var(--surface-1)", borderRadius: "var(--radius-md)",
          padding: "14px 20px", border: "1px solid var(--border)",
        }}>
          <div style={{
            fontSize: 10, fontWeight: 600, textTransform: "uppercase",
            letterSpacing: "0.1em", color: "var(--text-tertiary)", marginBottom: 6,
          }}>
            Status
          </div>
          <div style={{
            fontFamily: "var(--mono)", fontSize: 14, fontWeight: 600,
            color: refNumber === "PENDING" ? "var(--warning)" : "var(--success)",
            letterSpacing: "0.04em",
          }}>
            {refNumber === "PENDING" ? "Sent — confirmation unclear" : refNumber === "SUBMITTED" ? "Successfully submitted" : `Ref: ${refNumber}`}
          </div>
          <p style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 6 }}>
            LADOT does not provide a tracking number for online reports.
          </p>
        </div>
      </div>

      {/* What happens next */}
      <div className="glass" style={{
        padding: 20, marginTop: 16, borderRadius: "var(--radius-lg)",
      }}>
        <h3 style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", marginBottom: 12 }}>
          What happens next
        </h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {[
            { step: "1", text: "LADOT receives your report and assigns it to a field team" },
            { step: "2", text: "An officer will investigate the vehicle within 72 hours" },
            { step: "3", text: "If confirmed abandoned, the vehicle will be tagged and towed" },
          ].map((item) => (
            <div key={item.step} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
              <div style={{
                width: 24, height: 24, borderRadius: "50%", flexShrink: 0,
                background: "var(--accent-muted)", border: "1px solid var(--accent-border)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 11, fontWeight: 700, color: "var(--accent)",
              }}>
                {item.step}
              </div>
              <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.5, paddingTop: 2 }}>
                {item.text}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Report another */}
      <button onClick={onReset} style={{
        width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
        padding: "14px 20px", borderRadius: "var(--radius-md)", marginTop: 20,
        background: "var(--surface-1)", color: "var(--text-secondary)",
        border: "1px solid var(--border)", fontSize: 14, fontWeight: 500,
        cursor: "pointer", fontFamily: "var(--font)",
        transition: "all 0.2s var(--ease)",
      }}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <rect x="2" y="4" width="12" height="10" rx="2" stroke="currentColor" strokeWidth="1.5" />
          <path d="M5.5 4L6.5 2H9.5L10.5 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <circle cx="8" cy="9" r="2" stroke="currentColor" strokeWidth="1.5" />
        </svg>
        Report Another Vehicle
      </button>
    </div>
  );
}
