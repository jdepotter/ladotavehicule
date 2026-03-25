"use client";

import { useRef, useState } from "react";

function resizeImage(dataUrl: string, maxPx = 1280, quality = 0.88): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const ratio = Math.min(maxPx / img.width, maxPx / img.height, 1);
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * ratio);
      canvas.height = Math.round(img.height * ratio);
      canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.src = dataUrl;
  });
}

function Lightbox({ src, onClose }: { src: string; onClose: () => void }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 10000,
        background: "rgba(0,0,0,0.85)", backdropFilter: "blur(8px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 20, cursor: "zoom-out",
        animation: "slideIn 0.2s var(--ease)",
      }}
    >
      <img
        src={src}
        alt="Full size"
        style={{
          maxWidth: "100%", maxHeight: "100%", objectFit: "contain",
          borderRadius: "var(--radius-lg)",
          boxShadow: "0 16px 64px rgba(0,0,0,0.5)",
        }}
      />
      <div style={{
        position: "absolute", top: 16, right: 16,
        width: 36, height: 36, borderRadius: "50%",
        background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)",
        display: "flex", alignItems: "center", justifyContent: "center",
        cursor: "pointer",
      }}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M4 4L12 12M12 4L4 12" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </div>
    </div>
  );
}

export { Lightbox };

export default function PhotoStep({
  imageDataUrl, setImageBase64, setImageDataUrl, onNext, imageReady,
}: {
  imageDataUrl: string | null;
  setImageBase64: (b: string) => void;
  setImageDataUrl: (d: string) => void;
  onNext: () => void;
  imageReady: boolean;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [lightbox, setLightbox] = useState(false);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const resized = await resizeImage(ev.target!.result as string);
      setImageDataUrl(resized);
      setImageBase64(resized.split(",")[1]);
    };
    reader.readAsDataURL(file);
  };

  return (
    <div>
      {lightbox && imageDataUrl && (
        <Lightbox src={imageDataUrl} onClose={() => setLightbox(false)} />
      )}

      {/* Upload zone */}
      <div
        onClick={() => {
          if (!imageDataUrl) cameraRef.current?.click();
        }}
        style={{
          position: "relative", borderRadius: "var(--radius-xl)", overflow: "hidden",
          background: "var(--surface-0)",
          border: imageDataUrl ? "1px solid var(--border)" : "2px dashed var(--border-hover)",
          cursor: imageDataUrl ? "default" : "pointer",
          transition: "all 0.3s var(--ease)",
        }}
        onMouseEnter={(e) => {
          if (!imageDataUrl) e.currentTarget.style.borderColor = "var(--accent)";
        }}
        onMouseLeave={(e) => {
          if (!imageDataUrl) e.currentTarget.style.borderColor = "var(--border-hover)";
        }}
      >
        {imageDataUrl ? (
          <div style={{ position: "relative" }}>
            <img
              src={imageDataUrl}
              alt="Preview"
              onClick={() => setLightbox(true)}
              style={{
                width: "100%", maxHeight: 400, objectFit: "contain",
                display: "block", cursor: "zoom-in",
                background: "var(--surface-0)",
              }}
            />
            {/* Enlarge hint */}
            <div
              onClick={() => setLightbox(true)}
              style={{
                position: "absolute", top: 10, right: 10,
                width: 32, height: 32, borderRadius: "var(--radius-sm)",
                background: "rgba(0,0,0,0.5)", backdropFilter: "blur(8px)",
                border: "1px solid rgba(255,255,255,0.15)",
                display: "flex", alignItems: "center", justifyContent: "center",
                cursor: "zoom-in",
              }}
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <circle cx="7" cy="7" r="5" stroke="white" strokeWidth="1.5" />
                <path d="M11 11L14 14" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
                <path d="M5 7H9M7 5V9" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </div>
          </div>
        ) : (
          <div style={{
            display: "flex", flexDirection: "column", alignItems: "center",
            gap: 12, padding: 32, aspectRatio: "4/3", justifyContent: "center",
          }}>
            <div style={{
              width: 64, height: 64, borderRadius: "var(--radius-lg)",
              background: "var(--accent-muted)", border: "1px solid var(--accent-border)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                <rect x="2" y="6" width="20" height="14" rx="3" stroke="var(--accent)" strokeWidth="1.5" />
                <path d="M8 6L9.5 3H14.5L16 6" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round" />
                <circle cx="12" cy="13" r="3.5" stroke="var(--accent)" strokeWidth="1.5" />
              </svg>
            </div>
            <div style={{ textAlign: "center" }}>
              <p style={{ fontSize: 15, fontWeight: 500, color: "var(--text-primary)", marginBottom: 4 }}>
                Take or upload a photo
              </p>
              <p style={{ fontSize: 13, color: "var(--text-tertiary)" }}>
                JPG, PNG, HEIC — we'll identify the vehicle automatically
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Hidden file inputs — camera and gallery are separate */}
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFile}
        style={{ display: "none" }}
      />
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        onChange={handleFile}
        style={{ display: "none" }}
      />

      {/* Action buttons */}
      <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
        <button
          onClick={() => cameraRef.current?.click()}
          style={{
            flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            padding: "14px 16px", borderRadius: "var(--radius-md)",
            background: "var(--surface-1)", color: "var(--text-secondary)",
            border: "1px solid var(--border)", fontSize: 13, fontWeight: 500,
            cursor: "pointer", transition: "all 0.2s var(--ease)",
            fontFamily: "var(--font)",
          }}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <rect x="1" y="4" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.5" />
            <path d="M5.5 4L6.5 2H9.5L10.5 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <circle cx="8" cy="9" r="2.5" stroke="currentColor" strokeWidth="1.5" />
          </svg>
          Camera
        </button>
        <button
          onClick={() => fileRef.current?.click()}
          style={{
            flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            padding: "14px 16px", borderRadius: "var(--radius-md)",
            background: "var(--surface-1)", color: "var(--text-secondary)",
            border: "1px solid var(--border)", fontSize: 13, fontWeight: 500,
            cursor: "pointer", transition: "all 0.2s var(--ease)",
            fontFamily: "var(--font)",
          }}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M2 10V13H14V10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <path d="M8 2V10M8 2L5 5M8 2L11 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Upload
        </button>
        <button
          disabled={!imageReady}
          onClick={onNext}
          style={{
            flex: 2, display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            padding: "14px 20px", borderRadius: "var(--radius-md)",
            background: imageReady ? "var(--accent)" : "var(--surface-1)",
            color: imageReady ? "white" : "var(--text-tertiary)",
            border: "none", fontSize: 14, fontWeight: 600,
            cursor: imageReady ? "pointer" : "not-allowed",
            transition: "all 0.2s var(--ease)",
            boxShadow: imageReady ? "var(--shadow-glow)" : "none",
            fontFamily: "var(--font)",
          }}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M8 1L9.5 6.5L15 8L9.5 9.5L8 15L6.5 9.5L1 8L6.5 6.5L8 1Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
          </svg>
          Analyze Vehicle
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M5 3L9 7L5 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}
