import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

/**
 * Where a listing is, on a real map — the drawn boundary when it has one, a
 * pin when it doesn't, plus a "my location" button so a moderator can see how
 * far the property is from them.
 *
 * Leaflet with open tiles rather than Google: the dashboard would otherwise
 * need its own Maps key, and the project's key is restricted to the mobile
 * apps' bundle ids. Satellite first, like the app — Uzbek street maps are
 * thin, and rooftops are what an outline is checked against.
 */
const SATELLITE = {
  url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  attribution: "Esri, Maxar, Earthstar Geographics",
};
// Street and place names, drawn over the imagery — satellite alone gives a
// moderator no way to read an address.
const LABELS =
  "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}";
const STREETS = {
  url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
  attribution: "© OpenStreetMap",
};

export interface ListingMapProps {
  /** Drawn outline, GeoJSON rings of [lng, lat]. */
  geom?: { type: "Polygon"; coordinates: [number, number][][] } | null;
  /** The pin, or the boundary's centre — [lng, lat]. */
  centroid?: { type: "Point"; coordinates: [number, number] } | null;
  height?: number;
}

export function ListingMap({ geom, centroid, height = 260 }: ListingMapProps) {
  const holder = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const satellite = useRef<L.TileLayer | null>(null);
  const labels = useRef<L.TileLayer | null>(null);
  const streets = useRef<L.TileLayer | null>(null);
  const me = useRef<L.LayerGroup | null>(null);
  const [mode, setMode] = useState<"satellite" | "streets">("satellite");
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  // A 260px strip inside a drawer is enough to confirm a pin is roughly
  // right, and not enough to check which side of the road it is on.
  const [full, setFull] = useState(false);

  // Built once per listing: Leaflet owns its DOM, so React only hands it a box.
  useEffect(() => {
    if (!holder.current) return;

    const instance = L.map(holder.current, { zoomControl: true, attributionControl: true });
    map.current = instance;

    satellite.current = L.tileLayer(SATELLITE.url, {
      maxZoom: 19,
      attribution: SATELLITE.attribution,
    }).addTo(instance);
    labels.current = L.tileLayer(LABELS, { maxZoom: 19 }).addTo(instance);
    streets.current = L.tileLayer(STREETS.url, {
      maxZoom: 19,
      attribution: STREETS.attribution,
    });
    me.current = L.layerGroup().addTo(instance);

    const ring = geom?.coordinates?.[0];
    if (ring && ring.length >= 3) {
      // GeoJSON is [lng, lat]; Leaflet wants [lat, lng].
      const shape = L.polygon(
        ring.map(([lng, lat]) => [lat, lng] as [number, number]),
        { color: "#10b981", weight: 2, fillOpacity: 0.25 },
      ).addTo(instance);
      instance.fitBounds(shape.getBounds(), { padding: [24, 24], maxZoom: 18 });
    } else if (centroid) {
      const [lng, lat] = centroid.coordinates;
      L.marker([lat, lng]).addTo(instance);
      instance.setView([lat, lng], 17);
    } else {
      // Nothing to show: Tashkent, so the map isn't a grey void.
      instance.setView([41.3111, 69.2797], 11);
    }

    return () => {
      instance.remove();
      map.current = null;
    };
  }, [geom, centroid]);

  const toggleMode = () => {
    const instance = map.current;
    if (!instance || !satellite.current || !labels.current || !streets.current) return;
    if (mode === "satellite") {
      instance.removeLayer(satellite.current);
      instance.removeLayer(labels.current);
      streets.current.addTo(instance);
      setMode("streets");
    } else {
      instance.removeLayer(streets.current);
      satellite.current.addTo(instance);
      labels.current.addTo(instance);
      setMode("satellite");
    }
  };

  const locate = () => {
    const instance = map.current;
    if (!instance || !navigator.geolocation) {
      setLocationError("Brauzer joylashuvni qo'llab-quvvatlamaydi");
      return;
    }
    setLocating(true);
    setLocationError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const { latitude, longitude, accuracy } = pos.coords;
        me.current?.clearLayers();
        // A dot plus its accuracy circle, the way the app draws it.
        L.circleMarker([latitude, longitude], {
          radius: 7,
          color: "#ffffff",
          weight: 2,
          fillColor: "#2563eb",
          fillOpacity: 1,
        }).addTo(me.current!);
        L.circle([latitude, longitude], {
          radius: accuracy,
          color: "#2563eb",
          weight: 1,
          fillOpacity: 0.12,
        }).addTo(me.current!);
        instance.panTo([latitude, longitude]);
      },
      (err) => {
        setLocating(false);
        setLocationError(
          err.code === err.PERMISSION_DENIED
            ? "Joylashuvga ruxsat berilmadi"
            : "Joylashuvni aniqlab bo'lmadi",
        );
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 30_000 },
    );
  };

  // Leaflet measures its container once and caches the result; a box that
  // changes size without being told renders half its tiles grey. The frame
  // delay lets the browser apply the new layout before the measurement.
  useEffect(() => {
    if (!map.current) return;
    const id = requestAnimationFrame(() => map.current?.invalidateSize());
    return () => cancelAnimationFrame(id);
  }, [full]);

  // Escape is the way out of anything fullscreen; without it the only exit is
  // a button that the map itself can hide behind on a small window.
  useEffect(() => {
    if (!full) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setFull(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [full]);

  return (
    <div className={`map${full ? " map--full" : ""}`}>
      <div
        ref={holder}
        className="map__canvas"
        // Fullscreen hands the height to CSS; inline styles would win over it.
        style={full ? undefined : { height }}
      />

      <div className="map__controls">
        <button
          className="map__btn"
          onClick={() => setFull((on) => !on)}
          title={full ? "Kichraytirish" : "Butun ekran"}
        >
          {full ? "✕ Yopish" : "⤢ Butun ekran"}
        </button>
        <button className="map__btn" onClick={toggleMode} title="Xarita turi">
          {mode === "satellite" ? "Xarita" : "Sun'iy yo'ldosh"}
        </button>
        <button
          className="map__btn"
          onClick={locate}
          disabled={locating}
          title="Mening joylashuvim"
        >
          {locating ? "..." : "◎ Men qayerdaman"}
        </button>
      </div>

      {locationError ? <p className="map__error">{locationError}</p> : null}
    </div>
  );
}
