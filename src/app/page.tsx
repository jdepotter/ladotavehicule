"use client";

import { useState } from "react";
import Link from "next/link";
import PhotoStep from "@/components/PhotoStep";
import AnalyzeStep from "@/components/AnalyzeStep";
import ReviewStep from "@/components/ReviewStep";
import ResultStep from "@/components/ResultStep";

export type VehicleData = {
  color: string;
  make: string;
  style: string;
  license_plate: string | null;
  plate_state: string | null;
  plate_confidence: string;
  source: string;
  warnings?: string[];
};

export type FormData = {
  vehicleColor: string;
  vehicleMake: string;
  vehicleStyle: string;
  plateState: string;
  licensePlate: string;
  zipCode: string;
  blockNumber: string;
  streetName: string;
  crossStreet: string;
  email: string;
  comments: string;
};

const STEPS = [
  { label: "Capture", icon: "camera" },
  { label: "Analyze", icon: "sparkles" },
  { label: "Review", icon: "edit" },
  { label: "Done", icon: "check" },
];

function StepIcon({ type, active, done }: { type: string; active: boolean; done: boolean }) {
  const color = done ? "var(--success)" : active ? "var(--accent)" : "var(--text-tertiary)";
  const size = 16;
  if (done) {
    return (
      <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
        <path d="M3.5 8.5L6.5 11.5L12.5 4.5" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (type === "camera") {
    return (
      <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
        <rect x="1" y="4" width="14" height="10" rx="2" stroke={color} strokeWidth="1.5" />
        <path d="M5.5 4L6.5 2H9.5L10.5 4" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="8" cy="9" r="2.5" stroke={color} strokeWidth="1.5" />
      </svg>
    );
  }
  if (type === "sparkles") {
    return (
      <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
        <path d="M8 1L9.5 6.5L15 8L9.5 9.5L8 15L6.5 9.5L1 8L6.5 6.5L8 1Z" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
      </svg>
    );
  }
  if (type === "edit") {
    return (
      <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
        <path d="M11.5 1.5L14.5 4.5L5 14H2V11L11.5 1.5Z" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <path d="M3.5 8.5L6.5 11.5L12.5 4.5" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function Home() {
  const [step, setStep] = useState(1);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [vehicleData, setVehicleData] = useState<VehicleData | null>(null);
  const [refNumber, setRefNumber] = useState("");
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);

  // Single API call — triggered once from PhotoStep's "Analyze" button
  const startAnalysis = async () => {
    if (!imageBase64) return;
    setStep(2);
    setAnalyzeError(null);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setVehicleData(data);
      setStep(3);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setAnalyzeError(message);
    }
  };

  // Skip photo — go straight to manual form entry
  const skipToManual = () => {
    setVehicleData(null);
    setStep(3);
  };

  return (
    <div style={{
      position: "relative", zIndex: 1, maxWidth: 520, margin: "0 auto",
      padding: "0 16px 80px", minHeight: "100vh",
    }}>
      {/* Header */}
      <header style={{ padding: "40px 0 28px" }}>
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          background: "var(--accent-muted)", border: "1px solid var(--accent-border)",
          color: "var(--accent)", fontFamily: "var(--mono)", fontSize: 10,
          fontWeight: 500, letterSpacing: "0.1em", padding: "4px 10px",
          borderRadius: 100, textTransform: "uppercase", marginBottom: 16,
        }}>
          <span style={{
            width: 5, height: 5, borderRadius: "50%", background: "var(--accent)",
          }} />
          LADOT Report
        </div>
        <h1 style={{
          fontSize: 28, fontWeight: 700, letterSpacing: "-0.03em",
          lineHeight: 1.15, color: "var(--text-primary)",
        }}>
          Report an Abandoned<br />
          <span style={{ color: "var(--accent)" }}>Vehicle</span>
        </h1>
        <p style={{
          marginTop: 8, fontSize: 14, color: "var(--text-secondary)",
          fontWeight: 400, lineHeight: 1.5,
        }}>
          AI-powered identification with automatic form submission to LADOT.
        </p>
      </header>

      {/* Progress bar */}
      <div style={{
        display: "flex", alignItems: "center", gap: 0,
        padding: "16px 0", marginBottom: 24,
      }}>
        {STEPS.map((s, i) => {
          const n = i + 1;
          const isActive = n === step;
          const isDone = n < step;
          return (
            <div key={s.label} style={{ display: "flex", alignItems: "center", flex: i < STEPS.length - 1 ? 1 : "none" }}>
              {/* Step node */}
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                <div style={{
                  width: 36, height: 36, borderRadius: "50%",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  background: isDone ? "var(--success-muted)" : isActive ? "var(--accent-muted)" : "var(--surface-1)",
                  border: `1.5px solid ${isDone ? "var(--success-border)" : isActive ? "var(--accent-border)" : "var(--border)"}`,
                  transition: "all 0.3s var(--ease)",
                  boxShadow: isActive ? "var(--shadow-glow)" : "none",
                }}>
                  <StepIcon type={s.icon} active={isActive} done={isDone} />
                </div>
                <span style={{
                  fontSize: 11, fontWeight: 500, letterSpacing: "0.02em",
                  color: isDone ? "var(--success)" : isActive ? "var(--accent)" : "var(--text-tertiary)",
                  transition: "color 0.3s var(--ease)",
                }}>
                  {s.label}
                </span>
              </div>
              {/* Connector line */}
              {i < STEPS.length - 1 && (
                <div style={{
                  flex: 1, height: 1.5, margin: "0 8px", marginBottom: 22,
                  background: isDone ? "var(--success)" : "var(--border)",
                  borderRadius: 1,
                  transition: "background 0.3s var(--ease)",
                }} />
              )}
            </div>
          );
        })}
      </div>

      {/* Panels */}
      <div className="step-enter" key={step}>
        {step === 1 && (
          <PhotoStep
            imageDataUrl={imageDataUrl}
            setImageBase64={setImageBase64}
            setImageDataUrl={setImageDataUrl}
            onNext={startAnalysis}
            onSkip={skipToManual}
            imageReady={!!imageBase64}
          />
        )}
        {step === 2 && (
          <AnalyzeStep
            imageDataUrl={imageDataUrl!}
            error={analyzeError}
            onBack={() => { setStep(1); setAnalyzeError(null); }}
          />
        )}
        {step === 3 && (
          <ReviewStep
            imageDataUrl={imageDataUrl}
            vehicleData={vehicleData}
            onBack={() => setStep(1)}
            onSubmit={(ref) => { setRefNumber(ref); setStep(4); }}
          />
        )}
        {step === 4 && (
          <ResultStep
            refNumber={refNumber}
            onReset={() => {
              setStep(1);
              setImageBase64(null);
              setImageDataUrl(null);
              setVehicleData(null);
            }}
          />
        )}
      </div>

      {/* Footer */}
      <footer style={{ marginTop: 40, textAlign: "center" }}>
        <Link href="/privacy" style={{
          fontSize: 12, color: "var(--text-tertiary)", textDecoration: "none",
          transition: "color 0.2s",
        }}>
          Privacy Policy
        </Link>
      </footer>
    </div>
  );
}
