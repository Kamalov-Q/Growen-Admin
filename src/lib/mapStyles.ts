import type { StyleSpecification } from "maplibre-gl";

/**
 * The two maps the dashboard draws, the same pair as the mobile app
 * (mobile/src/features/map/mapLayer.ts) so a moderator sees what users see.
 * Both are free and keyless; their credits sit in the map's ⓘ control,
 * which the licences require to stay visible.
 */

/** OpenFreeMap's vector street map of OpenStreetMap data. */
export const STREET_STYLE = "https://tiles.openfreemap.org/styles/liberty";

const LABEL_TEXT = ["coalesce", ["get", "name:latin"], ["get", "name"]];

/** Esri satellite photos with OpenFreeMap street and place names over them. */
export const SATELLITE_STYLE: StyleSpecification = {
  version: 8,
  glyphs: "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf",
  sources: {
    esri: {
      type: "raster",
      tiles: [
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      ],
      tileSize: 256,
      maxzoom: 19,
      attribution:
        "Imagery © Esri, Maxar, Earthstar Geographics, and the GIS User Community",
    },
    // Not called "openmaptiles" like the street style's source: MapLibre
    // reuses a source's loaded tiles across a style switch when the name
    // matches, and these tiles were parsed for labels only — the street map
    // then came up with names but no roads or buildings.
    "satellite-labels": {
      type: "vector",
      url: "https://tiles.openfreemap.org/planet",
    },
  },
  layers: [
    { id: "satellite", type: "raster", source: "esri" },
    {
      id: "road-name",
      type: "symbol",
      source: "satellite-labels",
      "source-layer": "transportation_name",
      minzoom: 13,
      layout: {
        "symbol-placement": "line",
        "text-field": LABEL_TEXT as never,
        "text-font": ["Noto Sans Regular"],
        "text-size": ["interpolate", ["linear"], ["zoom"], 13, 11, 18, 14],
      },
      paint: {
        "text-color": "#ffffff",
        "text-halo-color": "rgba(0,0,0,0.75)",
        "text-halo-width": 1.5,
      },
    },
    {
      id: "place-name",
      type: "symbol",
      source: "satellite-labels",
      "source-layer": "place",
      layout: {
        "text-field": LABEL_TEXT as never,
        "text-font": ["Noto Sans Bold"],
        "text-size": ["interpolate", ["linear"], ["zoom"], 8, 12, 16, 15],
        "text-max-width": 8,
      },
      paint: {
        "text-color": "#ffffff",
        "text-halo-color": "rgba(0,0,0,0.8)",
        "text-halo-width": 1.5,
      },
    },
  ],
};

/** Tashkent centre, [lng, lat] — where a map with nothing to show opens. */
export const TASHKENT: [number, number] = [69.2797, 41.3111];
