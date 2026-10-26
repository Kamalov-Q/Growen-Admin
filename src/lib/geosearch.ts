// Place search for the map, over OpenStreetMap's Nominatim.
//
// Nominatim rather than a point-only geocoder because of what it gives back
// for an administrative area: with `polygon_geojson=1` a tuman comes back as
// its REAL boundary — Chilonzor is a 610-point ring, Zangiota 1166 — not the
// bounding rectangle most geocoders return. That is the difference between
// outlining a district and drawing a box over three of them.
//
// The usage policy this file is built around:
//   · at most one request a second, and never one per keystroke — the search
//     box submits, it does not autocomplete
//   · a real Referer or User-Agent; a browser sends the Referer itself
//   · the credit below stays visible wherever results are shown
//
// The public instance is for light use. Moving to a self-hosted Nominatim or
// to Photon means changing ENDPOINT and the response mapping, and nothing
// above this file.
// tsconfig sets `types: ["vite/client"]`, which switches off the automatic
// pull of every @types package — so the global `GeoJSON` namespace is not
// there to reach for, and the shapes come in as an ordinary import.
import type { MultiPolygon, Polygon } from "geojson";
import type { LngLat } from "./geo";
import type { UzRegion } from "./api";

const ENDPOINT = "https://nominatim.openstreetmap.org/search";

/** Required by ODbL wherever a result is shown. */
export const GEOSEARCH_CREDIT = "OpenStreetMap / Nominatim";

/**
 * Words that describe what a place IS rather than name it.
 *
 * Nominatim matches on names, so these actively hurt: "Bodomzor" finds the
 * station, "Bodomzor metro" finds nothing at all. Yandex forgave this kind of
 * query; Nominatim does not, so the filler comes off before sending.
 */
const FILLER = /^(metro|metrosi|bekat|bekati|stansiya|stansiyasi|станция|метро|ст)$/i;

const clean = (query: string) =>
  query
    .split(/\s+/)
    .filter((word) => word && !FILLER.test(word))
    .join(" ")
    .trim();

/**
 * Resolve a bare district name to the full name OSM actually indexes under.
 *
 * This exists because of a specific, reproducible failure. Searching
 * "Chilonzor" returns the METRO STATION — and the district is not in the
 * results at all, not at limit 5 and not at limit 8. Searching "Chilonzor
 * tumani" returns the 610-point boundary straight away. OSM names the
 * relation "Chilonzor Tumani" and ranks a bare "Chilonzor" against
 * everything else that shares the word.
 *
 * So the official SOATO list (`GET /regions`, the same one the app's profile
 * uses) is consulted first: if what was typed names a district or a region,
 * the canonical name goes to Nominatim instead of the raw input, qualified
 * by its parent so Zangiota tumani is not confused with Zangiota the town.
 *
 * Matching is deliberately loose — "chilonzor", "Chilonzor tumani" and
 * "Чиланзарский район" all land on the same district — because a moderator
 * types the word, not the classifier entry.
 *
 * What comes back is the SOATO name UNQUALIFIED, which is counter-intuitive
 * and was measured rather than guessed. Adding the parent makes Nominatim
 * worse, not better: "Chilonzor tumani" returns the 610-point boundary,
 * "Chilonzor tumani, Toshkent shahri" returns nothing at all. The one
 * adjustment needed is the city suffix — OSM calls the capital "Toshkent",
 * so "Toshkent shahri" finds a ring road instead of the city. Same-name
 * districts in different regions are separated by the map's viewbox instead;
 * see `bias` below.
 */
const tight = (value: string) =>
  value.toLowerCase().replace(/[\u02BB\u02BC'`\u2019]/g, "").replace(/\s+/g, " ").trim();

/** …and again without the administrative noun, so "chilonzor" still matches. */
const loose = (value: string) =>
  tight(value)
    .replace(/^(?:город|г\.)\s+/, "")
    .replace(/\s+(?:tumani|tuman|shahri|shahar|viloyati|respublikasi|район|районы|область|область\s+ташкентская|город|города)$/, "")
    .trim();

export function canonicalPlaceName(
  regions: readonly UzRegion[],
  query: string,
): string | null {
  const asTyped = tight(query);
  const stripped = loose(query);
  if (!stripped) return null;

  /** OSM calls the capital "Toshkent"; SOATO calls it "Toshkent shahri". */
  const osmName = (name: string) => name.replace(/\s+shahri$/i, "");

  // Exact first, suffix-stripped second. The order matters: "Toshkent
  // viloyati" and "Toshkent shahri" both reduce to "toshkent", and only the
  // exact pass can tell the oblast from the city it surrounds.
  for (const exact of [true, false]) {
    const want = exact ? asTyped : stripped;
    const norm = exact ? tight : loose;

    for (const region of regions) {
      for (const district of region.districts) {
        if (norm(district.uz) === want || norm(district.ru) === want) {
          return district.uz;
        }
      }
    }
    for (const region of regions) {
      if (norm(region.uz) === want || norm(region.ru) === want) {
        return osmName(region.uz);
      }
    }
  }

  return null;
}

/** A district, city or region — something with an outline worth drawing. */
export interface PlaceArea {
  kind: "area";
  label: string;
  /** Polygon or MultiPolygon, [lng, lat] throughout, as the map wants it. */
  geometry: Polygon | MultiPolygon;
  /** [west, south, east, north] — what the camera is framed against. */
  bbox: [number, number, number, number];
}

/** A station, street or building — something the camera flies to. */
export interface PlacePoint {
  kind: "point";
  label: string;
  center: LngLat;
}

export type Place = PlaceArea | PlacePoint;

interface NominatimResult {
  category?: string;
  type?: string;
  display_name?: string;
  name?: string;
  lat?: string;
  lon?: string;
  /** [south, north, west, east], as strings. */
  boundingbox?: [string, string, string, string];
  geojson?: { type?: string; coordinates?: unknown };
}

/**
 * The two ways Uzbek names get written, because OSM uses both and Nominatim
 * matches neither leniently.
 *
 * Measured, not assumed. "Mirzo Ulug'bek tumani" with a plain apostrophe
 * returns the 722-point boundary and with U+02BB returns a railway station;
 * "Qoraqalpog'iston Respublikasi" does exactly the reverse — plain finds a
 * government office, U+02BB finds the 3344-point republic. SOATO stores the
 * plain form, so that is tried first and the typographic one is the retry.
 */
const APOSTROPHES = /['\u02BB\u02BC\u2019`]/g;

function spellings(name: string): string[] {
  const plain = name.replace(APOSTROPHES, "'");
  const osm = name.replace(APOSTROPHES, "\u02BB");
  return plain === osm ? [plain] : [plain, osm];
}

/** An administrative boundary with a real outline, or nothing. */
function asArea(hit: NominatimResult): PlaceArea | null {
  const geometry = hit.geojson;
  if (geometry?.type !== "Polygon" && geometry?.type !== "MultiPolygon") return null;
  if (!hit.boundingbox) return null;
  const [south, north, west, east] = hit.boundingbox.map(Number);
  if (![south, north, west, east].every(Number.isFinite)) return null;
  return {
    kind: "area",
    label: hit.display_name || hit.name || "",
    geometry: geometry as PlaceArea["geometry"],
    bbox: [west, south, east, north],
  };
}

function asPoint(hit: NominatimResult): PlacePoint | null {
  const lat = Number(hit.lat);
  const lon = Number(hit.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return { kind: "point", label: hit.display_name || hit.name || "", center: [lon, lat] };
}

async function ask(
  q: string,
  options: { bias?: [number, number, number, number]; signal?: AbortSignal },
  limit: number,
): Promise<NominatimResult[]> {
  const params = new URLSearchParams({
    q,
    format: "jsonv2",
    polygon_geojson: "1",
    limit: String(limit),
    // Everything this dashboard moderates is in one country, and the filter
    // removes a whole class of same-name matches abroad.
    countrycodes: "uz",
    // Latin names where OSM has them, which is how the rest of the map reads.
    "accept-language": "uz,ru",
  });
  if (options.bias) params.set("viewbox", options.bias.join(","));

  const res = await fetch(`${ENDPOINT}?${params}`, { signal: options.signal });
  if (!res.ok) throw new Error(`Nominatim ${res.status}`);
  return (await res.json()) as NominatimResult[];
}

/** One request a second, which is the policy's hard limit. */
const breathe = () => new Promise((done) => setTimeout(done, 1100));

/**
 * Find a place, or null.
 *
 * `bias` is the box the map is currently showing. Nominatim treats it as a
 * preference rather than a filter (no `bounded=1`), which is what you want:
 * searching "Bodomzor" while looking at Tashkent should find the station, not
 * the village of that name in Qashqadaryo — but searching somewhere else
 * entirely should still work.
 */
export async function searchPlace(
  query: string,
  options: {
    bias?: [number, number, number, number];
    /** The SOATO list, so a bare district name resolves before it is sent. */
    regions?: readonly UzRegion[];
    signal?: AbortSignal;
  } = {},
): Promise<Place | null> {
  const known = options.regions ? canonicalPlaceName(options.regions, query) : null;

  // Free text — a street, a station, a building. One request, first answer.
  if (!known) {
    const q = clean(query);
    if (!q) return null;
    const [hit] = await ask(q, options, 1);
    if (!hit) return null;
    // A road arrives as a LineString, which is a shape nobody wants
    // highlighted as a search area, so only an actual boundary is kept.
    return (hit.category === "boundary" ? asArea(hit) : null) ?? asPoint(hit);
  }

  // A district or region: there IS a right answer, so look past the first
  // result for it rather than drawing whatever shares the name.
  let fallback: NominatimResult | undefined;
  const tries = spellings(known);

  for (let i = 0; i < tries.length; i++) {
    if (i > 0) await breathe();
    const hits = await ask(tries[i], options, 5);
    fallback ??= hits[0];

    for (const hit of hits) {
      if (hit.category !== "boundary" || hit.type !== "administrative") continue;
      const area = asArea(hit);
      if (area) return area;
    }
  }

  return fallback ? asPoint(fallback) : null;
}
