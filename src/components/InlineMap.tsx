"use client";

import { useEffect, useRef } from "react";
import mapboxgl, { Map, Marker } from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

const DEFAULT_CENTER: [number, number] = [-118.2437, 34.0522]; // lon, lat
const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";

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
  const mapInstanceRef = useRef<Map | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const onPinMoveRef = useRef(onPinMove);
  onPinMoveRef.current = onPinMove;

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;
    if (!TOKEN) {
      console.error("[InlineMap] NEXT_PUBLIC_MAPBOX_TOKEN not set");
      return;
    }
    mapboxgl.accessToken = TOKEN;

    const center: [number, number] = lat && lng ? [lng, lat] : DEFAULT_CENTER;
    const map = new mapboxgl.Map({
      container: mapRef.current,
      style: "mapbox://styles/mapbox/streets-v12",
      center,
      zoom: lat ? 17 : 14,
      attributionControl: false,
    });
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");

    // Custom blue dot marker matching the old Leaflet style.
    const el = document.createElement("div");
    el.style.cssText =
      "width:18px;height:18px;border-radius:50%;background:#3B82F6;" +
      "border:2.5px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.4);";
    const marker = new mapboxgl.Marker({ element: el, draggable: true, anchor: "center" })
      .setLngLat(center)
      .addTo(map);

    marker.on("dragend", () => {
      const { lng: mLng, lat: mLat } = marker.getLngLat();
      onPinMoveRef.current(mLat, mLng);
    });

    map.on("click", (e) => {
      marker.setLngLat(e.lngLat);
      onPinMoveRef.current(e.lngLat.lat, e.lngLat.lng);
    });

    mapInstanceRef.current = map;
    markerRef.current = marker;

    // Ensure the map sizes itself after the container paints.
    map.once("load", () => map.resize());

    return () => {
      map.remove();
      mapInstanceRef.current = null;
      markerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update marker + view when coords change externally (GPS detection).
  useEffect(() => {
    if (!lat || !lng || !mapInstanceRef.current || !markerRef.current) return;
    const lngLat: [number, number] = [lng, lat];
    markerRef.current.setLngLat(lngLat);
    mapInstanceRef.current.flyTo({ center: lngLat, zoom: 17, essential: true });
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
