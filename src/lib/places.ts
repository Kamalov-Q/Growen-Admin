import { useQuery } from "@tanstack/react-query";
import { api } from "./api";

export interface UzDistrict {
  /** Official SOATO code — what a profile stores. */
  code: string;
  uz: string;
  ru: string;
}

export interface UzRegion extends UzDistrict {
  districts: UzDistrict[];
}

/**
 * Regions and districts, from the server.
 *
 * Not a table in this repo: the server validates the codes it accepts, so a
 * second list here would disagree with it the first time one of them changed
 * — and the dashboard is exactly where that disagreement would be invisible.
 */
export function usePlaces() {
  const query = useQuery({
    queryKey: ["regions"],
    queryFn: () => api<UzRegion[]>("/regions"),
    staleTime: 60 * 60_000,
  });

  return { ...query, regions: query.data ?? [] };
}

/** A stored code as a readable place, region first. */
export function placeLabel(
  regions: UzRegion[],
  code: string | null | undefined,
): string {
  if (!code) return "—";

  for (const region of regions) {
    if (region.code === code) return region.uz;

    const district = region.districts.find((d) => d.code === code);
    if (district) return `${region.uz}, ${district.uz}`;
  }

  // Unknown, or the list has not loaded yet. Showing the raw code beats
  // showing nothing while holding data.
  return code;
}
