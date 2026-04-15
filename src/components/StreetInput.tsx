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
  const [committed, setCommitted] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Fetch suggestions and record the top match as the "resolved" candidate.
  // IMPORTANT: we never rewrite the user's typed text here — that happens only
  // on commit (blur / Enter / Tab / click a suggestion). The submit handler
  // uses `resolvedValue`, not the input text, as the source of truth.
  const fetchSuggestions = async (term: string) => {
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
        onResolved(results.length > 0 ? results[0] : "");
      }
    } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => {
    // Geocode / map pin path: parent seeded value + resolvedValue together — skip.
    if (value === resolvedValue && resolvedValue) return;
    // Just-committed: we rewrote the input to match resolvedValue — skip.
    if (value === committed && committed) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchSuggestions(value), 300);
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

  // Swap the input text to the canonical ETIMS name on commit events.
  const commit = () => {
    if (resolvedValue && resolvedValue !== value) {
      setCommitted(resolvedValue);
      onChange(resolvedValue);
    }
    setShowSuggestions(false);
  };

  const selectSuggestion = (s: string) => {
    setCommitted(s);
    onChange(s);
    onResolved(s);
    setSuggestions([]);
    setShowSuggestions(false);
  };

  const showPreview = resolvedValue && resolvedValue !== value && !loading;

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
          setCommitted("");
          setShowSuggestions(true);
        }}
        onFocus={() => { if (suggestions.length > 0) setShowSuggestions(true); }}
        onBlur={() => {
          // Delay so a click on a suggestion (onMouseDown) fires first.
          setTimeout(commit, 120);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === "Tab") commit();
        }}
        placeholder={placeholder}
        style={{
          background: "var(--surface-1)",
          border: `1px solid ${resolvedValue ? "var(--success-border)" : "var(--border)"}`,
          color: "var(--text-primary)", fontSize: 14, padding: "12px 14px",
          borderRadius: "var(--radius-md)", width: "100%",
          fontFamily: "var(--font)",
        }}
      />

      {showPreview && (
        <div style={{ fontSize: 11, marginTop: 4, color: "var(--text-tertiary)" }}>
          Will be submitted as <strong>{resolvedValue}</strong>
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
              // onMouseDown fires before onBlur, so the selection lands before commit().
              onMouseDown={(e) => { e.preventDefault(); selectSuggestion(s); }}
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
