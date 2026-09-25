import { useCallback, useState } from "react";
import { setPrefs, usePrefs } from "./prefs";

/** Rows per page a moderator can pick between. The first one is the default. */
export const PAGE_SIZES = [20, 50, 100] as const;

/**
 * Offset + limit for a server-paged table, with the two rules every one of
 * them needs: changing the page size puts you back on page one (page 4 of
 * 20-row pages is not page 4 of 100-row pages), and so does changing a filter.
 *
 * The size itself is a shared preference, not local state — it is set from two
 * places (the pager under each table, and Settings), and a copy per table
 * would mean a table that is already open keeps the old size.
 */
export function usePaging() {
  const [offset, setOffset] = useState(0);
  const { pageSize } = usePrefs();

  const setLimit = useCallback((next: number) => {
    setPrefs({ pageSize: next });
    setOffset(0);
  }, []);

  return { offset, setOffset, limit: pageSize, setLimit };
}
