import { useQuery } from "@tanstack/react-query";
import { adminApi, type AdminCategory } from "./api";

/**
 * Every category (hidden included), from the server. Shared by the categories
 * page, the listings filter, the overview breakdown and the listing drawer, so
 * a rename in one place shows up everywhere without a reload.
 */
export function useCategories() {
  const query = useQuery({
    queryKey: ["admin", "categories"],
    queryFn: adminApi.categories,
    staleTime: 60_000,
  });

  const bySlug = new Map<string, AdminCategory>(
    (query.data ?? []).map((c) => [c.slug, c]),
  );

  /** Display name for a slug; the slug itself until the list has loaded. */
  const nameOf = (slug: string | null | undefined) =>
    slug ? (bySlug.get(slug)?.nameUz ?? slug) : "—";

  return { ...query, categories: query.data ?? [], bySlug, nameOf };
}
