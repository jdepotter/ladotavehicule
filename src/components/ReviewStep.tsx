"use client";

import { useState, lazy, Suspense } from "react";
import type { VehicleData } from "@/app/page";
import { Lightbox } from "./PhotoStep";
import StreetInput from "./StreetInput";
import ComboBox from "./ComboBox";
import { COLORS, MAKES, STYLES, US_STATES as STATES } from "@/lib/etimsCodes";

// Lazy load map to avoid SSR issues with Leaflet
const InlineMap = lazy(() => import("./InlineMap"));

const inputStyle: React.CSSProperties = {
  background: "var(--surface-1)", border: "1px solid var(--border)",
  color: "var(--text-primary)", fontSize: 14, padding: "12px 14px",
  borderRadius: "var(--radius-md)", width: "100%",
  fontFamily: "var(--font)", transition: "border-color 0.2s var(--ease)",
  WebkitAppearance: "none", appearance: "none" as const,
};

const labelStyle: React.CSSProperties = {
  fontSize: 12, fontWeight: 500, letterSpacing: "0.01em",
  color: "var(--text-secondary)", marginBottom: 6, display: "flex",
  alignItems: "center", gap: 6,
};

function AiBadge() {
  return (
    <span style={{
      background: "var(--success-muted)", border: "1px solid var(--success-border)",
      color: "var(--success)", fontSize: 9, fontWeight: 600, padding: "1px 6px",
      borderRadius: 100, letterSpacing: "0.05em",
    }}>AI</span>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase",
      color: "var(--text-tertiary)", margin: "28px 0 14px",
      display: "flex", alignItems: "center", gap: 10,
    }}>
      {children}
      <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
    </div>
  );
}

export default function ReviewStep({
  imageDataUrl, vehicleData, onBack, onSubmit,
}: {
  imageDataUrl: string | null;
  vehicleData: VehicleData | null;
  onBack: () => void;
  onSubmit: (ref: string) => void;
}) {
  const [form, setForm] = useState({
    vehicleColor: vehicleData?.color || "",
    vehicleMake: vehicleData?.make || "",
    vehicleStyle: vehicleData?.style || "",
    plateState: vehicleData?.plate_state || "",
    licensePlate: vehicleData?.license_plate || "",
    zipCode: "",
    blockNumber: "",
    streetName: "",
    crossStreet: "",
    email: "",
    comments: "",
    previouslyReported: false,
    dwelling: false,
  });
  const [submitting, setSubmitting] = useState(false);
  const [resolvedStreet, setResolvedStreet] = useState("");
  const [resolvedCross, setResolvedCross] = useState("");

  const [gpsLoading, setGpsLoading] = useState(false);
  const [mapLoading, setMapLoading] = useState(false);
  const [gpsCoords, setGpsCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const set = (field: string, value: string) => {
    setForm((f) => ({ ...f, [field]: value }));
    setFormError(null);
  };

  const getLocation = () => {
    if (!navigator.geolocation) return;
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(async (pos) => {
      const { latitude, longitude } = pos.coords;
      setGpsCoords({ lat: latitude, lng: longitude });
      try {
        const res = await fetch("/api/geocode", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ latitude, longitude }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        setForm((f) => ({
          ...f,
          zipCode: data.zipCode || f.zipCode,
          blockNumber: data.blockNumber || f.blockNumber,
          streetName: data.streetName || f.streetName,
          crossStreet: data.crossStreet || f.crossStreet,
        }));
      } catch { /* ignore */ }
      setGpsLoading(false);
    }, () => { setGpsLoading(false); }, {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0,
    });
  };

  const handleSubmit = async () => {
    setFormError(null);
    const required: [string, string][] = [
      ["vehicleColor", "Color"], ["vehicleMake", "Make"], ["vehicleStyle", "Style"],
      ["zipCode", "Zip Code"], ["blockNumber", "Block Number"],
      ["streetName", "Street Name"], ["crossStreet", "Cross Street"],
    ];
    for (const [key, label] of required) {
      if (!form[key as keyof typeof form]) {
        setFormError(`${label} is required`);
        return;
      }
    }
    if (!resolvedStreet) {
      setFormError("Street name not found in LADOT database — pick from suggestions");
      return;
    }
    if (!resolvedCross) {
      setFormError("Cross street not found in LADOT database — pick from suggestions");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/proxy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          streetName: resolvedStreet,
          crossStreet: resolvedCross,
        }),
      });
      const data = await res.json();
      if (data.success) {
        onSubmit("SUBMITTED");
      } else {
        setFormError(data.message || "Submission failed");
        if (!data.errors?.length) {
          onSubmit("PENDING");
        }
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setFormError(message);
    } finally {
      setSubmitting(false);
    }
  };

  const aiFilled = {
    color: !!vehicleData?.color && vehicleData.color !== "UNKNOWN",
    make: !!vehicleData?.make && vehicleData.make !== "UNKNOWN",
    style: !!vehicleData?.style && vehicleData.style !== "UNKNOWN",
    plate: !!vehicleData?.license_plate,
    plateState: !!vehicleData?.plate_state,
    crossStreet: false,
  };

  const [lightbox, setLightbox] = useState(false);

  return (
    <div>
      {lightbox && imageDataUrl && <Lightbox src={imageDataUrl} onClose={() => setLightbox(false)} />}

      {/* Image preview */}
      {imageDataUrl ? (
      <div style={{
        borderRadius: "var(--radius-lg)", overflow: "hidden", marginBottom: 4,
        position: "relative", background: "var(--surface-0)",
        border: "1px solid var(--border)",
      }}>
        <img
          src={imageDataUrl}
          alt="Vehicle"
          onClick={() => setLightbox(true)}
          style={{
            width: "100%", maxHeight: 200, objectFit: "contain",
            display: "block", cursor: "zoom-in",
            background: "var(--surface-0)",
          }}
        />
        {/* Enlarge button */}
        <div
          onClick={() => setLightbox(true)}
          style={{
            position: "absolute", top: 8, right: 8,
            width: 28, height: 28, borderRadius: "var(--radius-sm)",
            background: "rgba(0,0,0,0.5)", backdropFilter: "blur(8px)",
            border: "1px solid rgba(255,255,255,0.15)",
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "zoom-in",
          }}
        >
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
            <circle cx="7" cy="7" r="5" stroke="white" strokeWidth="1.5" />
            <path d="M11 11L14 14" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
            <path d="M5 7H9M7 5V9" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </div>
        {/* Tags overlay */}
        <div style={{
          position: "absolute", bottom: 0, left: 0, right: 0,
          background: "linear-gradient(180deg, transparent 0%, rgba(11,15,20,0.85) 100%)",
          display: "flex", alignItems: "flex-end", padding: "20px 12px 10px",
        }}>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {vehicleData?.color && vehicleData.color !== "UNKNOWN" && (
              <span style={tagStyle}>{vehicleData.color}</span>
            )}
            {vehicleData?.make && vehicleData.make !== "UNKNOWN" && (
              <span style={tagStyle}>{vehicleData.make}</span>
            )}
            {vehicleData?.style && vehicleData.style !== "UNKNOWN" && (
              <span style={tagStyle}>{vehicleData.style}</span>
            )}
          </div>
        </div>
      </div>
      ) : (
      <div style={{
        borderRadius: "var(--radius-lg)", marginBottom: 4,
        padding: "14px 16px",
        background: "var(--surface-0)", border: "1px solid var(--border)",
        display: "flex", alignItems: "center", gap: 10,
      }}>
        <div style={{
          width: 36, height: 36, borderRadius: "var(--radius-md)", flexShrink: 0,
          background: "var(--surface-1)", border: "1px solid var(--border)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <rect x="1" y="4" width="14" height="10" rx="2" stroke="var(--text-tertiary)" strokeWidth="1.5" />
            <path d="M5.5 4L6.5 2H9.5L10.5 4" stroke="var(--text-tertiary)" strokeWidth="1.5" strokeLinecap="round" />
            <circle cx="8" cy="9" r="2.5" stroke="var(--text-tertiary)" strokeWidth="1.5" />
          </svg>
        </div>
        <div>
          <p style={{ fontSize: 13, fontWeight: 500, color: "var(--text-secondary)", margin: 0 }}>No photo — manual entry</p>
          <p style={{ fontSize: 12, color: "var(--text-tertiary)", margin: "2px 0 0" }}>Fill in all vehicle details below</p>
        </div>
      </div>
      )}

      {/* AI verification note */}
      {vehicleData && (
        <div style={{
          display: "flex", alignItems: "center", gap: 7,
          marginTop: 10, padding: "8px 12px",
          borderRadius: "var(--radius-md)",
          background: "var(--surface-1)", border: "1px solid var(--border)",
        }}>
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0, opacity: 0.6 }}>
            <circle cx="8" cy="8" r="6.5" stroke="var(--text-tertiary)" strokeWidth="1.5" />
            <path d="M8 7V11M8 5V5.5" stroke="var(--text-tertiary)" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <span style={{ fontSize: 12, color: "var(--text-tertiary)", lineHeight: 1.4 }}>
            AI-filled — please verify details before submitting.
          </span>
        </div>
      )}

      {/* Warnings from API */}
      {vehicleData?.warnings && vehicleData.warnings.length > 0 && (
        <div style={{
          background: "var(--warning-muted)", border: "1px solid var(--warning-border)",
          borderRadius: "var(--radius-md)", padding: "10px 14px", marginTop: 12,
          fontSize: 12, color: "var(--warning)", lineHeight: 1.5,
          display: "flex", alignItems: "flex-start", gap: 8,
        }}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0, marginTop: 1 }}>
            <path d="M8 1L15 14H1L8 1Z" stroke="var(--warning)" strokeWidth="1.5" strokeLinejoin="round" />
            <path d="M8 6V9M8 11.5V12" stroke="var(--warning)" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <span>{vehicleData.warnings.join(". ")}. Please fill in missing fields manually.</span>
        </div>
      )}

      {/* Vehicle Details */}
      <SectionLabel>Vehicle Details</SectionLabel>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <ComboBox
          label="Color"
          required
          value={form.vehicleColor}
          onChange={(v) => set("vehicleColor", v)}
          options={COLORS}
          placeholder="Select color"
          badge={aiFilled.color ? <AiBadge /> : undefined}
        />
        <ComboBox
          label="Make"
          required
          value={form.vehicleMake}
          onChange={(v) => set("vehicleMake", v)}
          options={MAKES}
          placeholder="Select make"
          badge={aiFilled.make ? <AiBadge /> : undefined}
        />
        <ComboBox
          label="Style"
          required
          value={form.vehicleStyle}
          onChange={(v) => set("vehicleStyle", v)}
          options={STYLES}
          placeholder="Select style"
          badge={aiFilled.style ? <AiBadge /> : undefined}
        />
        <ComboBox
          label="Plate State"
          value={form.plateState}
          onChange={(v) => set("plateState", v)}
          options={STATES}
          placeholder="Select state"
          badge={aiFilled.plateState ? <AiBadge /> : undefined}
        />
        <div style={{ gridColumn: "1 / -1" }}>
          <label style={labelStyle}>
            License Plate
            {aiFilled.plate && <AiBadge />}
            {aiFilled.plate && vehicleData?.plate_confidence && (
              <span style={{
                fontSize: 9, fontWeight: 600, padding: "1px 6px", borderRadius: 100,
                letterSpacing: "0.05em",
                ...(vehicleData.plate_confidence === "high"
                  ? { background: "var(--success-muted)", border: "1px solid var(--success-border)", color: "var(--success)" }
                  : vehicleData.plate_confidence === "medium"
                  ? { background: "var(--warning-muted)", border: "1px solid var(--warning-border)", color: "var(--warning)" }
                  : { background: "var(--error-muted)", border: "1px solid var(--error-border)", color: "var(--error)" }),
              }}>
                {vehicleData.plate_confidence.toUpperCase()}
              </span>
            )}
          </label>
          {aiFilled.plate && vehicleData?.plate_confidence !== "high" && (
            <div style={{
              fontSize: 12, color: "var(--warning)", marginBottom: 6,
              display: "flex", alignItems: "center", gap: 6,
            }}>
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                <path d="M8 1L15 14H1L8 1Z" stroke="var(--warning)" strokeWidth="1.5" strokeLinejoin="round" />
                <path d="M8 6V9M8 11.5V12" stroke="var(--warning)" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              Please verify — AI was not fully confident on this plate
            </div>
          )}
          <input
            value={form.licensePlate}
            onChange={(e) => set("licensePlate", e.target.value.toUpperCase())}
            placeholder="e.g. 7ABC123"
            style={{ ...inputStyle, fontFamily: "var(--mono)", letterSpacing: "0.05em" }}
          />
        </div>
      </div>

      {/* Location */}
      <SectionLabel>Location</SectionLabel>

      {/* GPS detect button */}
      <button onClick={getLocation} disabled={gpsLoading} style={{
        width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
        padding: "12px 16px", borderRadius: "var(--radius-md)",
        background: "var(--surface-1)", border: "1px solid var(--border)",
        color: "var(--text-secondary)", fontSize: 13, fontWeight: 500,
        cursor: gpsLoading ? "wait" : "pointer", fontFamily: "var(--font)",
        marginBottom: 12, opacity: gpsLoading ? 0.7 : 1,
      }}>
        {gpsLoading ? (
          <div className="spinner" style={{ width: 14, height: 14 }} />
        ) : (
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="8" r="3" stroke="currentColor" strokeWidth="1.5" />
            <path d="M8 1V3M8 13V15M1 8H3M13 8H15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        )}
        {gpsLoading ? "Detecting…" : "Detect my GPS location"}
      </button>

      {/* Inline map — drag pin to adjust */}
      <div style={{ marginBottom: 12 }}>
        <Suspense fallback={
          <div style={{ width: "100%", height: 200, borderRadius: "var(--radius-md)", background: "var(--surface-1)" }} />
        }>
          <InlineMap
            lat={gpsCoords?.lat}
            lng={gpsCoords?.lng}
            onPinMove={async (lat, lng) => {
              setGpsCoords({ lat, lng });
              setMapLoading(true);
              try {
                const res = await fetch("/api/geocode", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ latitude: lat, longitude: lng }),
                });
                const data = await res.json();
                if (res.ok) {
                  setForm((f) => ({
                    ...f,
                    zipCode: data.zipCode || f.zipCode,
                    blockNumber: data.blockNumber || f.blockNumber,
                    streetName: data.streetName || f.streetName,
                    crossStreet: data.crossStreet || f.crossStreet,
                  }));
                  setResolvedStreet("");
                  setResolvedCross("");
                }
              } catch { /* ignore */ }
              setMapLoading(false);
            }}
          />
        </Suspense>
        <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 6, textAlign: "center", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
          {mapLoading ? (
            <>
              <div className="spinner" style={{ width: 12, height: 12 }} />
              Updating address…
            </>
          ) : (
            "Drag pin or tap to adjust location"
          )}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div>
          <label style={labelStyle}>Zip Code <span style={{ color: "var(--error)", fontSize: 10 }}>*</span></label>
          <input value={form.zipCode} onChange={(e) => set("zipCode", e.target.value)} placeholder="90001" maxLength={5} style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>Block Number <span style={{ color: "var(--error)", fontSize: 10 }}>*</span></label>
          <input value={form.blockNumber} onChange={(e) => set("blockNumber", e.target.value)} placeholder="1234" style={inputStyle} />
        </div>
        <div style={{ gridColumn: "1 / -1" }}>
          <StreetInput
            label="Street Name"
            required
            value={form.streetName}
            onChange={(v) => set("streetName", v)}
            resolvedValue={resolvedStreet}
            onResolved={setResolvedStreet}
            placeholder="e.g. Osage, Main, 83rd"
          />
        </div>
        <div style={{ gridColumn: "1 / -1" }}>
          <StreetInput
            label="Nearest Cross Street"
            required
            value={form.crossStreet}
            onChange={(v) => set("crossStreet", v)}
            resolvedValue={resolvedCross}
            onResolved={setResolvedCross}
            placeholder="e.g. Manchester, 83rd"
          />
        </div>
      </div>

      {/* Optional */}
      <SectionLabel>Optional</SectionLabel>
      <div style={{ display: "grid", gap: 12 }}>
        <label style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          cursor: "pointer", fontSize: 13, color: "var(--text-secondary)",
          padding: "12px 14px", background: "var(--surface-1)",
          borderRadius: "var(--radius-md)", border: "1px solid var(--border)",
        }}>
          <span>Previously reported this vehicle</span>
          <div
            onClick={(e) => { e.preventDefault(); setForm((f) => ({ ...f, previouslyReported: !f.previouslyReported })); }}
            style={{
              width: 40, height: 22, borderRadius: 11, padding: 2,
              background: form.previouslyReported ? "var(--accent)" : "var(--surface-3)",
              transition: "background 0.2s var(--ease)", cursor: "pointer",
              display: "flex", alignItems: "center",
            }}
          >
            <div style={{
              width: 18, height: 18, borderRadius: "50%", background: "white",
              transition: "transform 0.2s var(--spring)",
              transform: form.previouslyReported ? "translateX(18px)" : "translateX(0)",
              boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
            }} />
          </div>
        </label>
        <label style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          cursor: "pointer", fontSize: 13, color: "var(--text-secondary)",
          padding: "12px 14px", background: "var(--surface-1)",
          borderRadius: "var(--radius-md)", border: "1px solid var(--border)",
        }}>
          <span>Someone appears to be living in the vehicle</span>
          <div
            onClick={(e) => { e.preventDefault(); setForm((f) => ({ ...f, dwelling: !f.dwelling })); }}
            style={{
              width: 40, height: 22, borderRadius: 11, padding: 2,
              background: form.dwelling ? "var(--accent)" : "var(--surface-3)",
              transition: "background 0.2s var(--ease)", cursor: "pointer",
              display: "flex", alignItems: "center", flexShrink: 0,
            }}
          >
            <div style={{
              width: 18, height: 18, borderRadius: "50%", background: "white",
              transition: "transform 0.2s var(--spring)",
              transform: form.dwelling ? "translateX(18px)" : "translateX(0)",
              boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
            }} />
          </div>
        </label>
        <div>
          <label style={labelStyle}>Email (for confirmation)</label>
          <input value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="you@example.com" type="email" style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>Comments</label>
          <input value={form.comments} onChange={(e) => set("comments", e.target.value)} placeholder="Additional details…" style={inputStyle} />
        </div>
      </div>

      {/* Inline error */}
      {formError && (
        <div style={{
          marginTop: 16, padding: "10px 14px", borderRadius: "var(--radius-md)",
          background: "var(--error-muted)", border: "1px solid var(--error-border)",
          color: "var(--error)", fontSize: 13, lineHeight: 1.4,
          display: "flex", alignItems: "center", gap: 8,
        }}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
            <circle cx="8" cy="8" r="7" stroke="var(--error)" strokeWidth="1.5" />
            <path d="M8 4.5V8.5M8 10.5V11" stroke="var(--error)" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          {formError}
        </div>
      )}

      {/* Actions */}
      <div style={{ display: "flex", gap: 10, marginTop: 28 }}>
        <button onClick={onBack} style={{
          display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
          padding: "14px 18px", borderRadius: "var(--radius-md)",
          background: "transparent", color: "var(--text-tertiary)",
          border: "1px solid var(--border)", fontSize: 13, fontWeight: 500,
          cursor: "pointer", fontFamily: "var(--font)",
          transition: "all 0.2s var(--ease)",
        }}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M9 3L5 7L9 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Back
        </button>
        <button
          onClick={handleSubmit}
          disabled={submitting}
          style={{
            flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            padding: "14px 20px", borderRadius: "var(--radius-md)",
            background: submitting ? "var(--surface-2)" : "var(--accent)",
            color: submitting ? "var(--text-tertiary)" : "white",
            border: "none", fontSize: 14, fontWeight: 600,
            cursor: submitting ? "not-allowed" : "pointer",
            boxShadow: submitting ? "none" : "var(--shadow-glow)",
            fontFamily: "var(--font)", transition: "all 0.2s var(--ease)",
          }}
        >
          {submitting ? (
            <><div className="spinner" style={{ width: 16, height: 16 }} /> Submitting…</>
          ) : (
            <>
              Submit Report
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M5 3L9 7L5 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </>
          )}
        </button>
      </div>
    </div>
  );
}

const tagStyle: React.CSSProperties = {
  fontSize: 11, fontWeight: 600, padding: "3px 8px",
  borderRadius: 100, background: "rgba(255,255,255,0.12)",
  color: "rgba(255,255,255,0.9)", backdropFilter: "blur(8px)",
  letterSpacing: "0.02em",
};
