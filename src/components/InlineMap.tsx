"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const DEFAULT_CENTER: [number, number] = [34.0522, -118.2437];

export default function InlineMap({
  lat,
  lng,
  onPinMove,
}: {
  lat?: number;
  lng?: number;
  onPinMove: (lat: number, lng: number) => void;
}) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  // Keep a ref to always call the latest callback
  const onPinMoveRef = useRef(onPinMove);
  onPinMoveRef.current = onPinMove;

  const center: [number, number] = lat && lng ? [lat, lng] : DEFAULT_CENTER;

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    const map = L.map(mapRef.current, {
      center,
      zoom: lat ? 17 : 14,
      zoomControl: false,
      attributionControl: false,
    });

    L.control.zoom({ position: "topright" }).addTo(map);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
    }).addTo(map);

    const icon = L.divIcon({
      className: "",
      html: `<div style="
        width: 18px; height: 18px; border-radius: 50%;
        background: #3B82F6; border: 2.5px solid white;
        box-shadow: 0 2px 6px rgba(0,0,0,0.4);
        position: relative; top: -9px; left: -9px;
      "></div>`,
      iconSize: [18, 18],
      iconAnchor: [9, 9],
    });

    const marker = L.marker(center, { draggable: true, icon }).addTo(map);

    marker.on("dragend", () => {
      const pos = marker.getLatLng();
      onPinMoveRef.current(pos.lat, pos.lng);
    });

    map.on("click", (e: L.LeafletMouseEvent) => {
      marker.setLatLng(e.latlng);
      onPinMoveRef.current(e.latlng.lat, e.latlng.lng);
    });

    mapInstanceRef.current = map;
    markerRef.current = marker;

    setTimeout(() => map.invalidateSize(), 100);

    return () => {
      map.remove();
      mapInstanceRef.current = null;
      markerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update marker + view when coords change externally (GPS detection)
  useEffect(() => {
    if (!lat || !lng || !mapInstanceRef.current || !markerRef.current) return;
    const pos: [number, number] = [lat, lng];
    markerRef.current.setLatLng(pos);
    mapInstanceRef.current.setView(pos, 17);
  }, [lat, lng]);

  return (
    <div
      ref={mapRef}
      style={{
        width: "100%",
        height: 200,
        borderRadius: "var(--radius-md)",
        overflow: "hidden",
        border: "1px solid var(--border)",
        position: "relative",
        zIndex: 0,
      }}
    />
  );
}
