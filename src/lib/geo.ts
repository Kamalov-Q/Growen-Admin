// Where a listing is, in the shape the map editor works with, and the
// conversions to and from the API's GeoJSON. All coordinates are [lng, lat].

export type LngLat = [number, number];

export type MapLocation =
  /** A drawn outline, as an OPEN ring: the closing point is added on save. */
  | { kind: "polygon"; ring: LngLat[] }
  | { kind: "point"; point: LngLat }
  | { kind: "none" };

const samePoint = (a: LngLat, b: LngLat) => a[0] === b[0] && a[1] === b[1];

/** The API's closed ring without its repeated last point. */
export function openRing(ring: LngLat[]): LngLat[] {
  return ring.length > 1 && samePoint(ring[0], ring[ring.length - 1])
    ? ring.slice(0, -1)
    : ring;
}

/** GeoJSON wants the first point repeated at the end; the server checks it. */
export function closeRing(ring: LngLat[]): LngLat[] {
  return ring.length && !samePoint(ring[0], ring[ring.length - 1])
    ? [...ring, ring[0]]
    : ring;
}

export function locationFromListing(l: {
  geom?: { coordinates: LngLat[][] } | null;
  centroid?: { coordinates: LngLat } | null;
}): MapLocation {
  const ring = l.geom?.coordinates?.[0];
  if (ring && ring.length >= 4) return { kind: "polygon", ring: openRing(ring) };
  if (l.centroid) return { kind: "point", point: l.centroid.coordinates };
  return { kind: "none" };
}

/** Plain average of the corners — good enough to drop a pin on a plot. */
export function ringCenter(ring: LngLat[]): LngLat {
  const n = ring.length || 1;
  return [
    ring.reduce((s, p) => s + p[0], 0) / n,
    ring.reduce((s, p) => s + p[1], 0) / n,
  ];
}

/**
 * Area of a ring in m², on a sphere. Shown next to the editor so a moderator
 * can compare the drawn plot with the area the seller typed; the server does
 * its own exact sum with PostGIS when it saves.
 */
export function ringAreaM2(ring: LngLat[]): number {
  if (ring.length < 3) return 0;
  const R = 6_378_137;
  const rad = Math.PI / 180;
  let sum = 0;
  for (let i = 0; i < ring.length; i++) {
    const [lng1, lat1] = ring[i];
    const [lng2, lat2] = ring[(i + 1) % ring.length];
    sum += (lng2 - lng1) * rad * (2 + Math.sin(lat1 * rad) + Math.sin(lat2 * rad));
  }
  return Math.abs((sum * R * R) / 2);
}

/** Whether two locations are the same, for "has the admin changed it". */
export function sameLocation(a: MapLocation, b: MapLocation): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "point" && b.kind === "point") return samePoint(a.point, b.point);
  if (a.kind === "polygon" && b.kind === "polygon") {
    return (
      a.ring.length === b.ring.length && a.ring.every((p, i) => samePoint(p, b.ring[i]))
    );
  }
  return true;
}
