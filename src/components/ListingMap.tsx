import { useEffect, useRef, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AttributionControl,
  LngLatBounds,
  Map as MapLibreMap,
  Marker,
  NavigationControl,
  setWorkerUrl,
  type GeoJSONSource,
  type MapMouseEvent,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
// MapLibre finds its worker next to its own file, and bundling moves that
// file — so outlines and street names (both drawn by the worker) silently
// vanished. Vite emits the worker as an asset and hands MapLibre its URL.
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import { SATELLITE_STYLE, STREET_STYLE, TASHKENT } from "../lib/mapStyles";
import type { LngLat, MapLocation } from "../lib/geo";
import { GEOSEARCH_CREDIT, searchPlace, type Place } from "../lib/geosearch";
import { adminApi } from "../lib/api";
import { ringCenter } from "../lib/geo";
import { useT } from "../lib/i18n";

setWorkerUrl(workerUrl);

type Layer = "satellite" | "street";
const LAYER_KEY = "admin.map.layer";

function readLayer(): Layer {
  try {
    return localStorage.getItem(LAYER_KEY) === "street" ? "street" : "satellite";
  } catch {
    return "satellite";
  }
}

const SHAPE_SOURCE = "listing-shape";
const PRIMARY = "#10b981";

// The search result, in a colour that is NOT the listing's: on this map
// "where the advert is" and "where you searched" are two different claims,
// and a moderator comparing them needs to see which is which at a glance.
const SEARCH_SOURCE = "map-search";
const SEARCH_COLOR = "#3b82f6";

export interface ListingMapProps {
  value: MapLocation;
  /** On: clicks place the pin or add corners, and both can be dragged. */
  editable?: boolean;
  onChange?: (next: MapLocation) => void;
  /** Changes when a different listing is shown, which re-frames the camera. */
  fitKey?: string;
  height?: number;
}

type ShapeData = Parameters<GeoJSONSource["setData"]>[0];

/** The outline as GeoJSON: a polygon from 3 corners, a line before that. */
function shapeData(value: MapLocation): ShapeData {
  if (value.kind !== "polygon" || value.ring.length < 2) {
    return { type: "FeatureCollection", features: [] };
  }
  const ring = value.ring;
  const geometry =
    ring.length >= 3
      ? { type: "Polygon" as const, coordinates: [[...ring, ring[0]]] }
      : { type: "LineString" as const, coordinates: ring };
  return {
    type: "FeatureCollection",
    features: [{ type: "Feature", properties: {}, geometry }],
  };
}

/** The found area as a feature collection; empty for a point or no result. */
function searchData(place: Place | null): ShapeData {
  return place?.kind === "area"
    ? {
        type: "FeatureCollection",
        features: [{ type: "Feature", properties: {}, geometry: place.geometry }],
      }
    : { type: "FeatureCollection", features: [] };
}

function searchPinElement(): HTMLElement {
  const el = document.createElement("div");
  el.className = "map-search-pin";
  el.innerHTML =
    '<svg viewBox="0 0 24 32" width="26" height="35" aria-hidden="true"><path d="M12 0C5.4 0 0 5.3 0 11.9 0 20.8 12 32 12 32s12-11.2 12-20.1C24 5.3 18.6 0 12 0z" fill="#3b82f6" stroke="#ffffff" stroke-width="2"/><circle cx="12" cy="12" r="4.5" fill="#ffffff"/></svg>';
  return el;
}

function pinElement(): HTMLElement {
  const el = document.createElement("div");
  el.className = "map-pin";
  el.innerHTML =
    '<svg viewBox="0 0 24 32" width="30" height="40" aria-hidden="true"><path d="M12 0C5.4 0 0 5.3 0 11.9 0 20.8 12 32 12 32s12-11.2 12-20.1C24 5.3 18.6 0 12 0z" fill="#10b981" stroke="#ffffff" stroke-width="2"/><circle cx="12" cy="12" r="4.5" fill="#ffffff"/></svg>';
  return el;
}

/**
 * Where a listing is, on MapLibre: the same engine, tiles and satellite
 * imagery as the mobile app. Read-only it shows the outline or the pin; with
 * `editable` it is the editor:
 *
 * - Pin mode: a click drops the pin, a drag moves it.
 * - Outline mode: each click adds a corner; corners drag, and a click on one
 *   removes it.
 *
 * MapLibre owns its DOM, so the map is built once and everything after that
 * is pushed into it imperatively; refs carry the latest props into its event
 * handlers.
 */
export function ListingMap({
  value,
  editable = false,
  onChange,
  fitKey,
  height = 320,
}: ListingMapProps) {
  const t = useT();
  const holder = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markers = useRef<Marker[]>([]);
  const meMarker = useRef<Marker | null>(null);
  const searchMarker = useRef<Marker | null>(null);

  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [found, setFound] = useState<Place | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);

  // Fetched once and held: the classifier does not change between page
  // loads, and the search needs it to turn "chilonzor" into the name OSM
  // indexes the boundary under.
  const { data: regions } = useQuery({
    queryKey: ["regions"],
    queryFn: adminApi.regions,
    staleTime: Infinity,
  });

  const valueRef = useRef(value);
  const editableRef = useRef(editable);
  const onChangeRef = useRef(onChange);
  // Read inside `style.load`, which fires again on every street/satellite
  // swap — see addShape.
  const foundRef = useRef<Place | null>(null);
  useEffect(() => {
    valueRef.current = value;
    editableRef.current = editable;
    onChangeRef.current = onChange;
    foundRef.current = found;
  });

  const [layer, setLayer] = useState<Layer>(readLayer);
  const [full, setFull] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  // ---- the map itself, once ------------------------------------------------
  useEffect(() => {
    if (!holder.current) return;
    const map = new MapLibreMap({
      container: holder.current,
      style: readLayer() === "satellite" ? SATELLITE_STYLE : STREET_STYLE,
      center: TASHKENT,
      zoom: 11,
      attributionControl: false,
      // Rotation only confuses a "which side of the road" check.
      dragRotate: false,
      pitchWithRotate: false,
    });
    map.touchZoomRotate.disableRotation();
    map.addControl(new NavigationControl({ showCompass: false }), "top-left");
    map.addControl(new AttributionControl({ compact: true }), "bottom-right");

    // A style swap (street ↔ satellite) wipes every source and layer, so the
    // outline is re-added each time a style finishes loading.
    const addShape = () => {
      if (map.getSource(SHAPE_SOURCE)) return;
      map.addSource(SHAPE_SOURCE, { type: "geojson", data: shapeData(valueRef.current) });
      map.addLayer({
        id: "listing-shape-fill",
        type: "fill",
        source: SHAPE_SOURCE,
        filter: ["==", ["geometry-type"], "Polygon"],
        paint: { "fill-color": PRIMARY, "fill-opacity": 0.25 },
      });
      map.addLayer({
        id: "listing-shape-line",
        type: "line",
        source: SHAPE_SOURCE,
        paint: { "line-color": PRIMARY, "line-width": 2.5 },
      });

      // The searched district, under the listing's own outline: when an
      // advert sits inside the area you searched for, the advert is the
      // thing being judged and must stay on top.
      map.addSource(SEARCH_SOURCE, {
        type: "geojson",
        data: searchData(foundRef.current),
      });
      map.addLayer(
        {
          id: "map-search-fill",
          type: "fill",
          source: SEARCH_SOURCE,
          paint: { "fill-color": SEARCH_COLOR, "fill-opacity": 0.1 },
        },
        "listing-shape-fill",
      );
      map.addLayer(
        {
          id: "map-search-line",
          type: "line",
          source: SEARCH_SOURCE,
          paint: {
            "line-color": SEARCH_COLOR,
            "line-width": 2.5,
            "line-dasharray": [2, 1.5],
          },
        },
        "listing-shape-fill",
      );
      setReady(true);
    };
    map.on("style.load", addShape);

    map.on("click", (e: MapMouseEvent) => {
      if (!editableRef.current || !onChangeRef.current) return;
      // A click on a corner or the pin is theirs, not the map's.
      if ((e.originalEvent.target as HTMLElement).closest(".maplibregl-marker")) return;
      const at: LngLat = [e.lngLat.lng, e.lngLat.lat];
      const current = valueRef.current;
      if (current.kind === "polygon") {
        onChangeRef.current({ kind: "polygon", ring: [...current.ring, at] });
      } else {
        onChangeRef.current({ kind: "point", point: at });
      }
    });

    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      markers.current = [];
      meMarker.current = null;
      searchMarker.current = null;
    };
  }, []);

  // ---- street / satellite --------------------------------------------------
  const switchLayer = () => {
    const next: Layer = layer === "satellite" ? "street" : "satellite";
    setLayer(next);
    try {
      localStorage.setItem(LAYER_KEY, next);
    } catch {
      /* private window: the choice just isn't remembered */
    }
    mapRef.current?.setStyle(next === "satellite" ? SATELLITE_STYLE : STREET_STYLE);
  };

  // ---- place search --------------------------------------------------------
  const runSearch = async (e: FormEvent) => {
    e.preventDefault();
    const map = mapRef.current;
    if (!map || !query.trim() || searching) return;

    setSearching(true);
    setSearchError(null);
    try {
      // The current view, as a preference rather than a filter: looking at
      // Tashkent, "Bodomzor" should mean the station here and not the
      // village of that name in Qashqadaryo.
      const b = map.getBounds();
      const place = await searchPlace(query, {
        bias: [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()],
        regions,
      });
      if (!place) {
        setFound(null);
        setSearchError(t("Bunday joy topilmadi"));
        return;
      }
      setFound(place);
    } catch {
      // One message for every failure: offline, rate-limited and malformed
      // all leave the moderator with the same thing to do, which is try
      // again or type something else.
      setFound(null);
      setSearchError(t("Qidiruv ishlamadi — keyinroq urinib ko'ring"));
    } finally {
      setSearching(false);
    }
  };

  const clearSearch = () => {
    setQuery("");
    setFound(null);
    setSearchError(null);
  };

  // The result on the map: an outline for a district, a pin for a station or
  // a street. Split by kind rather than always drawing both, because a dot in
  // the middle of a tuman points at nothing in particular.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;

    (map.getSource(SEARCH_SOURCE) as GeoJSONSource | undefined)?.setData(searchData(found));

    if (found?.kind === "point") {
      if (!searchMarker.current) {
        searchMarker.current = new Marker({
          element: searchPinElement(),
          anchor: "bottom",
        });
      }
      searchMarker.current.setLngLat(found.center).addTo(map);
    } else {
      searchMarker.current?.remove();
    }

    if (found?.kind === "area") {
      const [west, south, east, north] = found.bbox;
      // maxZoom so a one-block mahalla does not slam the camera to street
      // level, where the outline no longer fits on screen.
      map.fitBounds([[west, south], [east, north]], { padding: 40, maxZoom: 16 });
    } else if (found?.kind === "point") {
      map.flyTo({ center: found.center, zoom: 16 });
    }
  }, [found, ready, layer]);

  // ---- the outline, the corners and the pin --------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;

    (map.getSource(SHAPE_SOURCE) as GeoJSONSource | undefined)?.setData(shapeData(value));
    map.getCanvas().style.cursor = editable ? "crosshair" : "";

    for (const m of markers.current) m.remove();
    markers.current = [];

    if (value.kind === "point") {
      const pin = new Marker({ element: pinElement(), anchor: "bottom", draggable: editable })
        .setLngLat(value.point)
        .addTo(map);
      pin.on("dragend", () => {
        const p = pin.getLngLat();
        onChangeRef.current?.({ kind: "point", point: [p.lng, p.lat] });
      });
      markers.current.push(pin);
    }

    if (value.kind === "polygon" && editable) {
      value.ring.forEach((corner, index) => {
        const el = document.createElement("button");
        el.type = "button";
        el.className = `map-vertex${index === 0 ? " map-vertex--first" : ""}`;
        el.title = t("Bosing — o'chirish, torting — surish");
        let moved = false;

        const vertex = new Marker({ element: el, draggable: true })
          .setLngLat(corner)
          .addTo(map);

        vertex.on("dragstart", () => {
          moved = true;
        });
        // Live preview while dragging; the form only hears about the drop.
        vertex.on("drag", () => {
          const p = vertex.getLngLat();
          const ring = value.ring.map((c, i): LngLat => (i === index ? [p.lng, p.lat] : c));
          (map.getSource(SHAPE_SOURCE) as GeoJSONSource | undefined)?.setData(
            shapeData({ kind: "polygon", ring }),
          );
        });
        vertex.on("dragend", () => {
          const p = vertex.getLngLat();
          onChangeRef.current?.({
            kind: "polygon",
            ring: value.ring.map((c, i): LngLat => (i === index ? [p.lng, p.lat] : c)),
          });
        });
        el.addEventListener("mousedown", () => {
          moved = false;
        });
        el.addEventListener("click", (e) => {
          e.stopPropagation();
          if (moved) return;
          onChangeRef.current?.({
            kind: "polygon",
            ring: value.ring.filter((_, i) => i !== index),
          });
        });
        markers.current.push(vertex);
      });
    }
  }, [value, editable, ready, layer, t]);

  // ---- framing: when the listing (not the edit) changes ---------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const v = valueRef.current;
    if (v.kind === "polygon" && v.ring.length >= 2) {
      const bounds = v.ring.reduce(
        (b, p) => b.extend(p),
        new LngLatBounds(v.ring[0], v.ring[0]),
      );
      map.fitBounds(bounds, { padding: 48, maxZoom: 18, duration: 0 });
    } else if (v.kind === "polygon" && v.ring.length === 1) {
      map.jumpTo({ center: v.ring[0], zoom: 17 });
    } else if (v.kind === "point") {
      map.jumpTo({ center: v.point, zoom: 17 });
    } else {
      map.jumpTo({ center: TASHKENT, zoom: 11 });
    }
  }, [fitKey]);

  // ---- fullscreen ----------------------------------------------------------
  useEffect(() => {
    const id = requestAnimationFrame(() => mapRef.current?.resize());
    if (!full) return () => cancelAnimationFrame(id);
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // Only this layer closes; the editor behind stays open.
      e.stopImmediatePropagation();
      setFull(false);
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      cancelAnimationFrame(id);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [full]);

  // ---- my location ---------------------------------------------------------
  const locate = () => {
    const map = mapRef.current;
    if (!map || !navigator.geolocation) {
      setLocationError(t("Brauzer joylashuvni qo'llab-quvvatlamaydi"));
      return;
    }
    setLocating(true);
    setLocationError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const at: LngLat = [pos.coords.longitude, pos.coords.latitude];
        if (!meMarker.current) {
          const dot = document.createElement("div");
          dot.className = "map-me";
          meMarker.current = new Marker({ element: dot });
        }
        meMarker.current.setLngLat(at).addTo(map);
        map.flyTo({ center: at, zoom: Math.max(map.getZoom(), 15) });
      },
      (err) => {
        setLocating(false);
        setLocationError(
          err.code === err.PERMISSION_DENIED
            ? t("Joylashuvga ruxsat berilmadi")
            : t("Joylashuvni aniqlab bo'lmadi"),
        );
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 30_000 },
    );
  };

  /** Back to the listing itself after panning around. */
  const recenter = () => {
    const map = mapRef.current;
    const v = valueRef.current;
    if (!map) return;
    if (v.kind === "polygon" && v.ring.length >= 2) {
      const bounds = v.ring.reduce(
        (b, p) => b.extend(p),
        new LngLatBounds(v.ring[0], v.ring[0]),
      );
      map.fitBounds(bounds, { padding: 48, maxZoom: 18 });
    } else {
      const center =
        v.kind === "point" ? v.point : v.kind === "polygon" && v.ring.length ? ringCenter(v.ring) : null;
      if (center) map.flyTo({ center, zoom: 17 });
    }
  };

  return (
    <div className={`map${full ? " map--full" : ""}`}>
      <div
        ref={holder}
        className="map__canvas"
        style={full ? undefined : { height }}
      />

      <div className="map__controls">
        {/* Submit-driven, never per keystroke: Nominatim's policy forbids
            autocomplete against the public instance, and a moderator looking
            up a district types the whole word anyway. */}
        <form className="map__search" onSubmit={runSearch}>
          <input
            className="map__searchInput"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("Tuman, bekat yoki manzil")}
            aria-label={t("Xaritadan qidirish")}
            enterKeyHint="search"
          />
          {query || found ? (
            <button
              type="button"
              className="map__searchBtn"
              onClick={clearSearch}
              title={t("Tozalash")}
            >
              ✕
            </button>
          ) : null}
          <button
            type="submit"
            className="map__searchBtn"
            disabled={searching || !query.trim()}
            title={t("Qidirish")}
          >
            {searching ? "…" : "⌕"}
          </button>
        </form>

        <button
          type="button"
          className="map__btn"
          onClick={() => setFull((on) => !on)}
          title={full ? t("Kichraytirish") : t("Butun ekran")}
        >
          {full ? `✕ ${t("Yopish")}` : `⤢ ${t("Butun ekran")}`}
        </button>
        <button
          type="button"
          className={`map__btn${layer === "satellite" ? " map__btn--on" : ""}`}
          onClick={switchLayer}
          title={t("Xarita turi")}
        >
          {layer === "satellite" ? `🗺 ${t("Xarita")}` : `🛰 ${t("Sun'iy yo'ldosh")}`}
        </button>
        <button type="button" className="map__btn" onClick={recenter} title={t("E'longa qaytish")}>
          ⌖ {t("E'lon")}
        </button>
        <button
          type="button"
          className="map__btn"
          onClick={locate}
          disabled={locating}
          title={t("Mening joylashuvim")}
        >
          {locating ? "…" : `◎ ${t("Men qayerdaman")}`}
        </button>
      </div>

      {found ? (
        <p className="map__found">
          <span className="map__foundDot" aria-hidden="true" />
          <span className="map__foundName" title={found.label}>{found.label}</span>
          <span className="muted">· {GEOSEARCH_CREDIT}</span>
        </p>
      ) : null}

      {searchError ? <p className="map__error">{searchError}</p> : null}
      {locationError ? <p className="map__error">{locationError}</p> : null}
    </div>
  );
}
