import { useQuery } from "@tanstack/react-query";
import { adminApi } from "./api";
import { setRate } from "./format";

/**
 * Keeps the CBU rate in the module cache `money()` reads from.
 *
 * Mounted once in the app shell rather than per page: the currency setting
 * applies to every table, and a rate that only loaded on the settings screen
 * would leave the first page you opened showing unconverted prices.
 */
export function useRate() {
  useQuery({
    queryKey: ["admin", "system", "rate"],
    queryFn: async () => {
      const system = await adminApi.system();
      setRate(system.usdToUzs || null);
      return system.usdToUzs;
    },
    // The CBU publishes once a day; an hour is plenty fresh.
    staleTime: 60 * 60_000,
    retry: false,
  });
}
