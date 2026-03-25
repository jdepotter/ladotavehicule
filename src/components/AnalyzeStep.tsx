"use client";

export default function AnalyzeStep({
  imageDataUrl,
  error,
  onBack,
}: {
  imageDataUrl: string;
  error: string | null;
  onBack: () => void;
}) {
  return (
    <div>
      {/* Image preview */}
      <div style={{
        position: "relative", borderRadius: "var(--radius-xl)", overflow: "hidden",
        marginBottom: 24,
      }}>
        <img
          src={imageDataUrl}
          alt="Vehicle"
          style={{
            width: "100%", height: 200, objectFit: "cover", display: "block",
            filter: "brightness(0.6)",
          }}
        />
        <div style={{
          position: "absolute", inset: 0,
          background: "linear-gradient(180deg, transparent 0%, rgba(11,15,20,0.8) 100%)",
          display: "flex", alignItems: "flex-end", padding: 20,
        }}>
          <div style={{ width: "100%" }}>
            {!error && (
              <div style={{
                width: "100%", height: 3, borderRadius: 2,
                background: "rgba(255,255,255,0.1)", marginBottom: 12, overflow: "hidden",
              }}>
                <div style={{
                  height: "100%", borderRadius: 2, background: "var(--accent)",
                  width: "60%", animation: "shimmer 1.5s infinite",
                }} />
              </div>
            )}
            <p style={{
              fontSize: 12, fontFamily: "var(--mono)", letterSpacing: "0.02em",
              color: "rgba(255,255,255,0.7)",
            }}>
              {error ? "Analysis failed" : "Analyzing vehicle…"}
            </p>
          </div>
        </div>
      </div>

      {/* Status card */}
      <div className="glass" style={{ padding: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{
            width: 44, height: 44, borderRadius: "var(--radius-md)", flexShrink: 0,
            background: error ? "var(--error-muted)" : "var(--accent-muted)",
            border: `1px solid ${error ? "var(--error-border)" : "var(--accent-border)"}`,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            {error ? (
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <circle cx="10" cy="10" r="8" stroke="var(--error)" strokeWidth="1.5" />
                <path d="M7 7L13 13M13 7L7 13" stroke="var(--error)" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            ) : (
              <div className="spinner" />
            )}
          </div>
          <div style={{ flex: 1 }}>
            <h3 style={{
              fontSize: 15, fontWeight: 600, marginBottom: 2,
              color: error ? "var(--error)" : "var(--text-primary)",
            }}>
              {error ? "Analysis Failed" : "Analyzing Vehicle"}
            </h3>
            <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.4 }}>
              {error || "Identifying plate, vehicle type, and color…"}
            </p>
          </div>
        </div>

        {error && (
          <button onClick={onBack} style={{
            marginTop: 16, width: "100%", padding: "12px 16px",
            borderRadius: "var(--radius-md)", background: "var(--surface-1)",
            border: "1px solid var(--border)", color: "var(--text-secondary)",
            fontSize: 14, fontWeight: 500, cursor: "pointer", fontFamily: "var(--font)",
          }}>
            ← Go back and retry
          </button>
        )}

        {!error && (
          <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            {["Plate", "State", "Color", "Make", "Style", "Conf."].map((label) => (
              <div key={label} style={{
                background: "var(--surface-1)", borderRadius: "var(--radius-sm)", padding: 10,
              }}>
                <div style={{
                  fontSize: 10, fontWeight: 500, textTransform: "uppercase",
                  letterSpacing: "0.08em", color: "var(--text-tertiary)", marginBottom: 6,
                }}>
                  {label}
                </div>
                <div className="skeleton" style={{ height: 14, width: "70%" }} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
