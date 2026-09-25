import { useEffect, useState } from "react";
import { getLang, localeOf } from "./i18n";
import { getPrefs } from "./prefs";

/**
 * The CBU rate, cached in module scope.
 *
 * `money()` is called once per row and has to stay synchronous, so it cannot
 * await anything. The settings page fetches the rate and parks it here; until
 * that lands, conversion is simply skipped and prices show as stored — a
 * wrong number would be worse than an unconverted one.
 */
let rate: number | null = null;

export const setRate = (next: number | null) => {
  rate = next;
};

export const getRate = () => rate;

/** Shared formatting for the tables. */
export const fullName = (p: { name: string | null; surname: string | null }) =>
  [p.name, p.surname].filter(Boolean).join(" ");

/**
 * Dates are written with numeric parts, not month names.
 *
 * Uzbek's CLDR data renders an abbreviated month as "M09", so `month: short`
 * produced "M09 25 05:04" — a date nobody can read in either language.
 * 25.09.2026 is unambiguous in both.
 */
export const date = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString(localeOf(getLang()), {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      })
    : "—";

/** The same rule, with the clock — for message and thread timestamps. */
export const dateTime = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString(localeOf(getLang()), {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

/**
 * A price, in whichever currency Settings asked for.
 *
 * "auto" leaves every offer in the currency it was written in, which is the
 * honest default: that is the number the seller typed and the one the buyer
 * sees in the app. The other two convert at the CBU rate, for the times when
 * a column of mixed dollars and so'm is impossible to scan.
 *
 * A converted price is marked with "≈", because it is arithmetic rather than
 * something anyone agreed to.
 */
export const money = (price: string, currency: string) => {
  const n = Number(price);
  const mode = getPrefs().currency;
  const rate = getRate();

  if (mode === "auto" || !rate || mode === currency) {
    return `${n.toLocaleString("ru-RU")} ${currency === "USD" ? "$" : "so'm"}`;
  }

  if (mode === "USD") {
    const usd = Math.round((n / rate) * 100) / 100;
    return `≈ ${usd.toLocaleString("ru-RU", { maximumFractionDigits: 2 })} $`;
  }
  return `≈ ${Math.round(n * rate).toLocaleString("ru-RU")} so'm`;
};

/** Debounces a search box so typing doesn't fire a request per keystroke. */
export function useDebounced<T>(value: T, ms = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return debounced;
}
