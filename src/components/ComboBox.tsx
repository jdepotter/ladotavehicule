"use client";

import { useState, useEffect, useRef } from "react";

export default function ComboBox({
  label,
  value,
  onChange,
  options,
  placeholder,
  required,
  badge,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder?: string;
  required?: boolean;
  badge?: React.ReactNode;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Filter options based on typed query
  const filtered = query
    ? options.filter((o) => o.toLowerCase().includes(query.toLowerCase()))
    : options;

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const select = (v: string) => {
    onChange(v);
    setQuery("");
    setOpen(false);
  };

  return (
    <div ref={wrapperRef} style={{ position: "relative" }}>
      <label style={{
        fontSize: 12, fontWeight: 500, letterSpacing: "0.01em",
        color: "var(--text-secondary)", marginBottom: 6, display: "flex",
        alignItems: "center", gap: 6,
      }}>
        {label}
        {required && <span style={{ color: "var(--error)", fontSize: 10 }}>*</span>}
        {badge}
      </label>
      <input
        value={open ? query : value}
        onChange={(e) => {
          setQuery(e.target.value);
          if (!open) setOpen(true);
        }}
        onFocus={() => {
          setQuery("");
          setOpen(true);
        }}
        placeholder={value || placeholder || "Select…"}
        style={{
          background: "var(--surface-1)",
          border: `1px solid ${value ? "var(--border)" : "var(--border)"}`,
          color: open && !query ? "var(--text-tertiary)" : "var(--text-primary)",
          fontSize: 14, padding: "12px 14px",
          borderRadius: "var(--radius-md)", width: "100%",
          fontFamily: "var(--font)",
        }}
      />

      {open && filtered.length > 0 && (
        <div style={{
          position: "absolute", top: "100%", left: 0, right: 0, zIndex: 1000,
          background: "var(--surface-2)", border: "1px solid var(--border)",
          borderRadius: "var(--radius-sm)", marginTop: 4,
          maxHeight: 200, overflowY: "auto",
          boxShadow: "var(--shadow-lg)",
        }}>
          {filtered.map((o) => (
            <button
              key={o}
              onClick={() => select(o)}
              style={{
                display: "block", width: "100%", textAlign: "left",
                padding: "10px 12px", border: "none", cursor: "pointer",
                background: o === value ? "var(--accent-muted)" : "transparent",
                color: o === value ? "var(--accent)" : "var(--text-primary)",
                fontSize: 13, fontFamily: "var(--font)",
                borderBottom: "1px solid var(--border)",
              }}
            >
              {o}
            </button>
          ))}
        </div>
      )}

      {open && filtered.length === 0 && query && (
        <div style={{
          position: "absolute", top: "100%", left: 0, right: 0, zIndex: 1000,
          background: "var(--surface-2)", border: "1px solid var(--border)",
          borderRadius: "var(--radius-sm)", marginTop: 4,
          padding: "10px 12px", fontSize: 13, color: "var(--text-tertiary)",
          boxShadow: "var(--shadow-lg)",
        }}>
          No match for "{query}"
        </div>
      )}
    </div>
  );
}
