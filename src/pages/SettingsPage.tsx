import { useQuery } from "@tanstack/react-query";
import { adminApi } from "../lib/api";
import { useAuth } from "../features/auth/useAuth";
import { ErrorState, PageHeader, Skeleton } from "../components/ui";
import { localeOf, setLang, useLang, useT, type Lang } from "../lib/i18n";
import { PAGE_SIZES } from "../lib/usePaging";
import {
  setPrefs,
  usePrefs,
  type CurrencyMode,
  type ThemeMode,
} from "../lib/prefs";

export function SettingsPage() {
  const t = useT();
  const lang = useLang();
  const prefs = usePrefs();
  const { user } = useAuth();

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["admin", "system"],
    queryFn: adminApi.system,
    // The SMS balance is the reason to open this page; a cached one from
    // twenty minutes ago is not an answer to "can people still log in".
    staleTime: 0,
    refetchOnMount: "always",
    // One attempt: if the endpoint is not deployed yet, three retries only
    // means the card sits on skeletons three times as long before saying so.
    retry: false,
  });

  const fmtDate = (iso: string | null) =>
    iso ? new Date(iso).toLocaleString(localeOf(lang)) : "—";

  return (
    <>
      <PageHeader
        title={t("Sozlamalar")}
        subtitle={t("Sozlamalar shu brauzerda saqlanadi")}
      />

      <div className="settings">
        <section className="card settings__card">
          <h2 className="settings__title">{t("Til va ko'rinish")}</h2>

          <Field label={t("Interfeys tili")}>
            <Choice
              value={lang}
              options={[
                { value: "uz" as Lang, label: "O'zbekcha" },
                { value: "ru" as Lang, label: "Русский" },
              ]}
              onChange={setLang}
            />
          </Field>

          <Field label={t("Mavzu")}>
            <Choice
              value={prefs.theme}
              options={[
                { value: "system" as ThemeMode, label: t("Tizim") },
                { value: "light" as ThemeMode, label: t("Yorug'") },
                { value: "dark" as ThemeMode, label: t("Qorong'i") },
              ]}
              onChange={(theme) => setPrefs({ theme })}
            />
          </Field>
        </section>

        <section className="card settings__card">
          <h2 className="settings__title">{t("Narxlarni ko'rsatish")}</h2>

          <Field label={t("Valyuta")}>
            <Choice
              value={prefs.currency}
              options={[
                { value: "auto" as CurrencyMode, label: t("Asl valyutada") },
                { value: "USD" as CurrencyMode, label: "USD ($)" },
                { value: "UZS" as CurrencyMode, label: "UZS (so'm)" },
              ]}
              onChange={(currency) => setPrefs({ currency })}
            />
          </Field>

          <Field label={t("Bir sahifadagi qatorlar")}>
            <Choice
              value={prefs.pageSize}
              options={PAGE_SIZES.map((n) => ({ value: n, label: String(n) }))}
              onChange={(pageSize) => setPrefs({ pageSize })}
            />
          </Field>
        </section>

        <section className="card settings__card">
          {/* These are live numbers, and the SMS balance is the one people
              come back to check. Reloading the whole dashboard to see it
              move is the wrong amount of work for one figure. */}
          <div className="settings__head">
            <h2 className="settings__title">{t("Tizim holati")}</h2>
            <button
              className="btn btn--ghost btn--sm"
              onClick={() => void refetch()}
              disabled={isFetching}
              title={t("Yangilash")}
            >
              {isFetching ? "…" : `↻ ${t("Yangilash")}`}
            </button>
          </div>

          {isError ? (
            // Named rather than left spinning: the usual cause is an API that
            // has not been redeployed, and a skeleton forever looks like a
            // bug in this page instead.
            <ErrorState error={error} onRetry={() => void refetch()} />
          ) : isLoading || !data ? (
            <>
              <Skeleton width="60%" />
              <Skeleton width="45%" />
            </>
          ) : (
            <dl className="kv">
              <dt>{t("Markaziy bank kursi")}</dt>
              <dd>
                1 USD = {data.usdToUzs.toLocaleString(localeOf(lang))} so'm{" "}
                <span className="muted">· {fmtDate(data.rateUpdatedAt)}</span>
              </dd>

              <dt>{t("SMS balansi")}</dt>
              <dd>
                {data.smsBalance === null ? (
                  // Named, not hidden: at zero balance every phone login in
                  // the country stops working, and "—" would read as fine.
                  <span className="settings__bad">
                    {data.smsError ?? "—"}
                  </span>
                ) : (
                  <span
                    className={
                      data.smsBalance < 10_000 ? "settings__bad" : undefined
                    }
                  >
                    {data.smsBalance.toLocaleString(localeOf(lang))} so'm
                  </span>
                )}
              </dd>

              <dt>{t("Server vaqti")}</dt>
              <dd>{fmtDate(data.serverTime)}</dd>
            </dl>
          )}
        </section>

        <section className="card settings__card">
          <h2 className="settings__title">{t("Hisobim")}</h2>
          <dl className="kv">
            <dt>{t("MUALLIF")}</dt>
            <dd>{[user?.name, user?.surname].filter(Boolean).join(" ") || "—"}</dd>
            <dt>{t("Aloqa telefoni")}</dt>
            <dd>{user?.phoneNumber ?? "—"}</dd>
          </dl>
        </section>
      </div>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="settings__field">
      <span className="settings__label">{label}</span>
      {children}
    </div>
  );
}

/**
 * A segmented control rather than a `<select>`: every choice here has two or
 * three options, and showing them all costs one row and saves a click.
 */
function Choice<T extends string | number>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (next: T) => void;
}) {
  return (
    <div className="segmented">
      {options.map((o) => (
        <button
          key={String(o.value)}
          className={`segmented__btn${o.value === value ? " segmented__btn--active" : ""}`}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
