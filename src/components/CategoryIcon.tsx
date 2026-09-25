import type { CategoryIconKey } from "../lib/api";

// One outline glyph per icon key, on the same 24×24 grid and stroke as the
// sidebar icons so they read as one set. Keys are what the server stores on a
// category (CATEGORY_ICON_KEYS) — keep all three lists in step.
const PATHS: Record<CategoryIconKey | "all", string[]> = {
  all: ["M4 4h7v7H4z", "M13 4h7v7h-7z", "M4 13h7v7H4z", "M13 13h7v7h-7z"],
  apartment: ["M5 21V4h14v17", "M9 8h2M13 8h2M9 12h2M13 12h2M9 16h2M13 16h2", "M3 21h18"],
  house: ["M3 11 12 4l9 7", "M5 10v10h14V10", "M10 20v-5h4v5"],
  land: ["M3 7l6-3 6 3 6-3v13l-6 3-6-3-6 3z", "M9 4v13M15 7v13"],
  shop: ["M4 9h16l-1.5-5h-13z", "M5 9v11h14V9", "M10 20v-5h4v5"],
  building: ["M4 21V8l6-4v17", "M10 21V10h10v11", "M13 13h1M16 13h1M13 17h1M16 17h1", "M3 21h18"],
  dacha: ["M12 21c-4-3-7-6.5-7-11a7 7 0 0 1 14 0c0 4.5-3 8-7 11z", "M12 21V11", "M12 14l-3-2M12 12l3-2"],
  hotel: ["M3 18V8", "M3 14h18v4", "M21 14v-2a3 3 0 0 0-3-3h-7v5", "M7 11.5a1.5 1.5 0 1 0 0-.01"],
  office: ["M4 8h16v12H4z", "M9 8V5h6v3", "M4 13h16", "M11 13v2h2v-2"],
  warehouse: ["M3 21V9l9-5 9 5v12", "M7 21v-8h10v8", "M7 17h10"],
  garage: ["M3 21V10l9-6 9 6v11", "M6 21v-7h12v7", "M6 17h12"],
  farm: ["M4 21v-9l5-4 5 4v9", "M14 21h7v-6l-3-3", "M8 21v-4h2v4", "M4 21h17"],
  grid: ["M4 4h7v7H4z", "M13 4h7v7h-7z", "M4 13h7v7H4z", "M13 13h7v7h-7z"],
};

export function CategoryIcon({
  icon,
  size = 18,
}: {
  /** An icon key; anything unknown (an older server) falls back to the grid. */
  icon: string;
  size?: number;
}) {
  const paths = PATHS[icon as CategoryIconKey | "all"] ?? PATHS.grid;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {paths.map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
