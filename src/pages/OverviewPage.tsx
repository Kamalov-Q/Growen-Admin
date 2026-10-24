import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { adminApi } from "../lib/api";
import { PageHeader, ErrorState, Skeleton } from "../components/ui";
import { useT } from "../lib/i18n";
import { CategoryIcon } from "../components/CategoryIcon";
import type { CategoryCounts, Overview } from "../lib/api";
import { useCategories } from "../lib/useCategories";

const ICON = {
  users: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20c.8-3.2 3.4-5 6.5-5s5.7 1.8 6.5 5" />
      <path d="M16 5.5a3 3 0 0 1 0 5.4M21.5 20c-.5-2.2-1.8-3.8-3.8-4.5" />
    </svg>
  ),
  spark: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 17l5-5 4 4 8-8" />
      <path d="M15 8h5v5" />
    </svg>
  ),
  shield: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l7 3v5c0 4.5-3 8.5-7 10-4-1.5-7-5.5-7-10V6z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  ),
  home: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 21V8l8-5 8 5v13" />
      <path d="M9 21v-6h6v6" />
    </svg>
  ),
  flag: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 21V4" />
      <path d="M5 4h13l-2.5 4L18 12H5" />
    </svg>
  ),
  archive: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="5" rx="1" />
      <path d="M5 9v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9" />
      <path d="M10 13h4" />
    </svg>
  ),
  chat: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 11.5a8.4 8.4 0 0 1-9 8.4L3 21l1.1-3.3A8.4 8.4 0 1 1 21 11.5Z" />
    </svg>
  ),
  badge: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="9" r="5" />
      <path d="m9 13.5-1 7.5 4-2 4 2-1-7.5" />
    </svg>
  ),
  chevron: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m9 18 6-6-6-6" />
    </svg>
  ),
  done: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="m8.5 12 2.5 2.5 4.5-5" />
    </svg>
  ),
} as const;

/** Counters first: the one screen that answers "what happened this week". */
export function OverviewPage() {
  const t = useT();
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["admin", "overview"],
    queryFn: adminApi.overview,
  });

  return (
    <>
      <PageHeader title={t("Boshqaruv paneli")} subtitle={t("Umumiy ko'rsatkichlar")} />

      {isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : (
        <div className="section-gap">
          {/* What is waiting, before what has accumulated. An admin opens this
              page to find out whether anything needs them — totals can wait
              until after that question is answered. */}
          <WorkQueue data={data} loading={isLoading} />

          <p className="section-title">Foydalanuvchilar</p>
          <div className="stats">
            <Stat
              to="/users"
              icon={ICON.users}
              label="Jami"
              value={data?.users.total}
              loading={isLoading}
            />
            <Stat
              icon={ICON.spark}
              label="Yangi (7 kun)"
              value={data?.users.newThisWeek}
              hint="oxirgi hafta"
              loading={isLoading}
            />
            <Stat
              icon={ICON.shield}
              label="Administratorlar"
              value={data?.users.admins}
              loading={isLoading}
              neutral
            />
          </div>

          <p className="section-title">E'lonlar</p>
          <div className="stats">
            <Stat
              to="/listings"
              icon={ICON.home}
              label="Jami"
              value={data?.listings.total}
              loading={isLoading}
            />
            <Stat
              to="/listings?status=ACTIVE"
              icon={ICON.spark}
              label="Faol"
              value={data?.listings.active}
              loading={isLoading}
            />
            <Stat
              icon={ICON.spark}
              label="Yangi (7 kun)"
              value={data?.listings.newThisWeek}
              hint="oxirgi hafta"
              loading={isLoading}
            />
            <Stat
              to="/listings?status=ARCHIVED"
              icon={ICON.archive}
              label="Arxivdagi"
              value={data?.listings.archived}
              loading={isLoading}
              neutral
            />
          </div>

          {/* Videos, only once there are any: a row of zeroes on a product
              whose video feature has not been switched on yet reads as
              something broken. */}
          {data?.videos ? (
            <>
              <p className="section-title">Videolar</p>
              <div className="stats">
                <Stat
                  to="/videos?status=READY"
                  icon={ICON.spark}
                  label="Chiqarilgan"
                  value={data.videos.published}
                  loading={isLoading}
                />
                <Stat
                  icon={ICON.spark}
                  label="Yangi (7 kun)"
                  value={data.videos.newThisWeek}
                  hint="oxirgi hafta"
                  loading={isLoading}
                />
                {/* The number worth watching: encoded, valid, and waiting
                    for a wallet. A pile of it is a pricing problem, not a
                    technical one. */}
                <Stat
                  to="/videos?status=AWAITING_PAYMENT"
                  icon={ICON.flag}
                  label="To'lov kutilmoqda"
                  value={data.videos.awaitingPayment}
                  loading={isLoading}
                  neutral
                />
              </div>
            </>
          ) : null}

          <CategoryBreakdown
            counts={data?.listings.byCategory}
            total={data?.listings.total ?? 0}
            loading={isLoading}
          />
        </div>
      )}
    </>
  );
}

/**
 * The four things that can be waiting on a moderator, as a to-do list.
 *
 * These were plain counters filed under "E'lonlar", which is where they did
 * the least good: a chat report is not a listing statistic, and a number on
 * a card gives no way to act on it. Each one is now a link to the page that
 * clears it, amber while something is pending and quiet when it is not.
 *
 * When every queue is empty the list is replaced by one line saying so —
 * four zeroes look like a page that failed to load.
 */
function WorkQueue({
  data,
  loading,
}: {
  data: Overview | undefined;
  loading: boolean;
}) {
  const queues = [
    { to: "/verification", label: "Tasdiqlash so'rovlari", n: data?.verification?.pending ?? 0, icon: ICON.badge },
    { to: "/reports", label: "E'lon shikoyatlari", n: data?.reports?.open ?? 0, icon: ICON.flag },
    { to: "/chat-reports", label: "Suhbat shikoyatlari", n: data?.chatReports?.open ?? 0, icon: ICON.chat },
    // Everyone can post video, so this queue is the one that can grow on its
    // own overnight.
    { to: "/video-reports", label: "Video shikoyatlari", n: data?.videoReports?.open ?? 0, icon: ICON.flag },
  ];
  const waiting = queues.reduce((sum, q) => sum + q.n, 0);

  if (loading) {
    return (
      <>
        <p className="section-title">Ishlash kerak</p>
        <div className="queue">
          {queues.map((q) => (
            <div key={q.to} className="queue__card">
              <span className="queue__icon">{q.icon}</span>
              <span className="queue__body">
                <Skeleton width={38} height={21} />
                <span className="queue__label">{q.label}</span>
              </span>
            </div>
          ))}
        </div>
      </>
    );
  }

  return (
    <>
      <div className="section-title__row">
        <p className="section-title">Ishlash kerak</p>
        {waiting > 0 ? (
          <span className="muted">{waiting} ta kutmoqda</span>
        ) : null}
      </div>

      {waiting === 0 ? (
        <p className="queue-clear">
          {ICON.done}
          Hammasi ko'rib chiqilgan — kutayotgan so'rov yo'q
        </p>
      ) : (
        <div className="queue">
          {queues.map((q) => (
            <Link
              key={q.to}
              to={q.to}
              className={`queue__card${q.n > 0 ? " queue__card--due" : ""}`}
            >
              <span className="queue__icon">{q.icon}</span>
              <span className="queue__body">
                <span className="queue__count">{q.n}</span>
                <span className="queue__label">{q.label}</span>
              </span>
              <span className="queue__go">{ICON.chevron}</span>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}

/**
 * One counter. Given a `to`, the whole card becomes the link to the page
 * behind the number — reading "412 e'lon" and then hunting the sidebar for
 * where to see them was the old way round.
 */
function Stat({
  to,
  icon,
  label,
  value,
  hint,
  loading,
  neutral,
}: {
  to?: string;
  icon: ReactNode;
  label: string;
  value: number | undefined;
  hint?: string;
  loading: boolean;
  neutral?: boolean;
}) {
  const body = (
    <>
      <div className="stat__head">
        <span className="stat__label">{label}</span>
        <span className={`stat__icon${neutral ? " stat__icon--neutral" : ""}`}>{icon}</span>
      </div>
      {loading ? (
        <Skeleton width={72} height={32} />
      ) : (
        <strong className="stat__value">{value?.toLocaleString("ru-RU") ?? "—"}</strong>
      )}
      {hint && !loading ? (
        <span className="stat__hint">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M7 17 17 7" />
            <path d="M9 7h8v8" />
          </svg>
          {hint}
        </span>
      ) : null}
    </>
  );

  return to ? (
    <Link to={to} className="card stat">
      {body}
    </Link>
  ) : (
    <div className="card stat">{body}</div>
  );
}

/**
 * Every category, with its count and share of all listings. Categories with
 * no listings stay in the list at 0 — "no hotels yet" is information too.
 * Sorted by count so the mix reads top-down.
 */
function CategoryBreakdown({
  counts,
  total,
  loading,
}: {
  counts: CategoryCounts | undefined;
  total: number;
  loading: boolean;
}) {
  const { categories, isLoading: categoriesLoading } = useCategories();
  const rows = categories
    .map((c) => ({ c, n: counts?.[c.slug] ?? 0 }))
    .sort((a, b) => b.n - a.n);
  const max = Math.max(1, ...rows.map((r) => r.n));
  const busy = loading || categoriesLoading;

  return (
    <div className="card cat-bars">
      <div className="cat-bars__head">
        <span className="cat-bars__title">Turlar bo'yicha</span>
        <span className="muted">
          {busy ? "" : `jami ${total.toLocaleString("ru-RU")} ta e'lon`}
        </span>
      </div>
      <div className="cat-bars__rows">
        {rows.map(({ c, n }) => (
          <div
            key={c.slug}
            className={`cat-bars__row${!busy && n === 0 ? " cat-bars__row--zero" : ""}`}
          >
            <span className="cat-bars__icon">
              <CategoryIcon icon={c.icon} />
            </span>
            <span className="cat-bars__label">
              {c.nameUz}
              {c.isActive ? null : <span className="muted"> · yashirin</span>}
            </span>
            <span className="cat-bars__track">
              {busy || n === 0 ? null : (
                <span className="cat-bars__fill" style={{ width: `${(n / max) * 100}%` }} />
              )}
            </span>
            <span className="cat-bars__value">
              {busy ? (
                <Skeleton width={40} height={14} />
              ) : (
                <>
                  <strong>{n}</strong>
                  <span className="muted">
                    {total ? ` · ${Math.round((n / total) * 100)}%` : ""}
                  </span>
                </>
              )}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
