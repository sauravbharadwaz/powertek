import React, { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

/* Free satellite basemap — Esri World Imagery (no API key). */
const ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const ESRI_ATTR = "Imagery © Esri, Maxar, Earthstar Geographics";

const pin = (color) =>
  L.divIcon({
    className: "",
    html: `<span style="display:block;width:16px;height:16px;border-radius:50%;background:${color};box-shadow:0 0 0 3px ${color}55,0 0 10px ${color};border:2px solid #06141c"></span>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });

export default function LocationMap({ center, corners, accent = "#22d3ee", interactive = true, onPick }) {
  const elRef = useRef(null);
  const mapRef = useRef(null);
  const layerRef = useRef(null);

  // init once
  useEffect(() => {
    if (mapRef.current || !elRef.current) return;
    const map = L.map(elRef.current, { attributionControl: true, zoomControl: true, worldCopyJump: true });
    L.tileLayer(ESRI, { attribution: ESRI_ATTR, maxZoom: 20 }).addTo(map);
    map.setView(center || [20, 0], center ? 16 : 2);
    layerRef.current = L.layerGroup().addTo(map);
    if (onPick) map.on("click", (e) => onPick([e.latlng.lat, e.latlng.lng]));
    mapRef.current = map;
    // size fix after mount
    setTimeout(() => map.invalidateSize(), 60);
    return () => { map.remove(); mapRef.current = null; };
  }, []);

  // redraw markers / footprint when location changes
  useEffect(() => {
    const map = mapRef.current, grp = layerRef.current;
    if (!map || !grp) return;
    grp.clearLayers();
    if (!center) { map.setView([20, 0], 2); return; }
    L.marker(center, { icon: pin(accent) }).addTo(grp);
    if (corners && corners.length === 4) {
      const poly = L.polygon(corners, { color: accent, weight: 1.5, fillColor: accent, fillOpacity: 0.12 }).addTo(grp);
      map.fitBounds(poly.getBounds().pad(0.6), { maxZoom: 18 });
    } else {
      map.setView(center, 16);
    }
  }, [center, corners, accent]);

  // keep interactivity in sync
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const fns = ["dragging", "scrollWheelZoom", "doubleClickZoom", "boxZoom", "keyboard"];
    fns.forEach((f) => (interactive ? map[f]?.enable() : map[f]?.disable()));
  }, [interactive]);

  return <div ref={elRef} className="h-full w-full" style={{ background: "#0a0f16" }} />;
}
