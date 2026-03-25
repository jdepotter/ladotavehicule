"use client";

import { useState, useEffect, useRef } from "react";

export default function StreetInput({
  label,
  value,
  onChange,
  resolvedValue,
  onResolved,
  placeholder,
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  resolvedValue: string;
  onResolved: (v: string) => void;
  placeholder?: string;
  required?: boolean;
}) {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [loading, setLoading] = useState(false);
  const [originalValue, setOriginalValue] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const skipFetchRef = useRef(false);

  const fetchAndResolve = async (term: string) => {
    if (term.length < 2) {
      setSuggestions([]);
      onResolved("");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/street-lookup?term=${encodeURIComponent(term)}`);
      if (res.ok) {
        const results: string[] = await res.json();
        setSuggestions(results.slice(0, 8));

        if (results.length > 0) {
          const best = results[0];
          onResolved(best);
          // Replace the input value with the ETIMS value
          if (best !== term) {
            setOriginalValue(term);
            skipFetchRef.current = true;
            onChange(best);
          }
        } else {
          onResolved("");
        }
      }
    } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => {
    // Skip fetch if we just programmatically set the value
    if (skipFetchRef.current) {
      skipFetchRef.current = false;
      return;
    }
    // Don't re-fetch if already resolved
    if (value === resolvedValue && resolvedValue) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchAndResolve(value), 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const selectSuggestion = (s: string) => {
    skipFetchRef.current = true;
    onChange(s);
    onResolved(s);
    setOriginalValue("");
    setSuggestions([]);
    setShowSuggestions(false);
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
      </label>
      <input
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          onResolved("");
          setOriginalValue("");
          setShowSuggestions(true);
        }}
        onFocus={() => { if (suggestions.length > 0) setShowSuggestions(true); }}
        placeholder={placeholder}
        style={{
          background: "var(--surface-1)",
          border: `1px solid ${resolvedValue ? "var(--success-border)" : "var(--border)"}`,
          color: "var(--text-primary)", fontSize: 14, padding: "12px 14px",
          borderRadius: "var(--radius-md)", width: "100%",
          fontFamily: "var(--font)",
        }}
      />

      {/* Show what the original input was, so user knows what was auto-resolved */}
      {originalValue && resolvedValue && originalValue !== resolvedValue && (
        <div style={{
          fontSize: 11, marginTop: 4, display: "flex", alignItems: "center", gap: 4,
          color: "var(--text-tertiary)",
        }}>
          Detected: {originalValue}
        </div>
      )}
      {value.length >= 2 && !resolvedValue && !loading && (
        <div style={{ fontSize: 11, marginTop: 4, color: "var(--warning)" }}>
          Not found in LADOT database — pick from suggestions
        </div>
      )}
      {loading && (
        <div style={{ fontSize: 11, marginTop: 4, color: "var(--text-tertiary)" }}>
          Looking up…
        </div>
      )}

      {/* Suggestions dropdown */}
      {showSuggestions && suggestions.length > 0 && (
        <div style={{
          position: "absolute", top: "100%", left: 0, right: 0, zIndex: 1000,
          background: "var(--surface-2)", border: "1px solid var(--border)",
          borderRadius: "var(--radius-sm)", marginTop: 4,
          maxHeight: 200, overflowY: "auto",
          boxShadow: "var(--shadow-lg)",
        }}>
          {suggestions.map((s) => (
            <button
              key={s}
              onClick={() => selectSuggestion(s)}
              style={{
                display: "block", width: "100%", textAlign: "left",
                padding: "10px 12px", border: "none", cursor: "pointer",
                background: s === resolvedValue ? "var(--accent-muted)" : "transparent",
                color: s === resolvedValue ? "var(--accent)" : "var(--text-primary)",
                fontSize: 13, fontFamily: "var(--font)",
                borderBottom: "1px solid var(--border)",
              }}
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
