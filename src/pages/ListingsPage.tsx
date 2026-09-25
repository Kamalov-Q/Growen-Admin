import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { adminApi, resolveMediaUrl } from "../lib/api";
import { date, fullName, money, useDebounced } from "../lib/format";
import { Badge, EmptyState, ErrorState, Pager, PageHeader, Skeleton } from "../components/ui";
import { useT } from "../lib/i18n";
import { ListingDrawer } from "../components/ListingDrawer";
import { useCategories } from "../lib/useCategories";
import { CategoryIcon } from "../components/CategoryIcon";
import { usePaging } from "../lib/usePaging";

const STATUSES = ["", "ACTIVE", "DRAFT", "ARCHIVED"] as const;
const STATUS_LABEL: Record<string, string> = {
  "": "Barchasi",
  ACTIVE: "Faol",
  DRAFT: "Qoralama",
  ARCHIVED: "Arxiv",
};
const STATUS_TONE: Record<string, "success" | "warning" | "neutral"> = {
  ACTIVE: "success",
  DRAFT: "warning",
  ARCHIVED: "neutral",
};

export function ListingsPage() {
  const t = useT();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string>("");
  const [category, setCategory] = useState<string>("");
  // Live categories, hidden ones included: an admin still needs to find the
  // listings sitting in a category the app no longer offers.
  const { categories, nameOf } = useCategories();
  const { offset, setOffset, limit, setLimit } = usePaging();
  const [openId, setOpenId] = useState<string | null>(null);
  const search = useDebounced(q);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["admin", "listings", search, status, category, offset, limit],
    queryFn: () =>
      adminApi.listings({ q: search, status, category, limit, offset }),
    placeholderData: keepPreviousData,
  });

  return (
    <>
      <PageHeader title={t("E'lonlar")} subtitle={t("Eng yangisi birinchi")} />

      {isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : (
        <div className="card">
          {/* Filters live with the table they filter, not floating by the title. */}
          <div className="card__toolbar">
            <div className="segmented">
              {STATUSES.map((s) => (
                <button
                  key={s || "all"}
                  className={`segmented__btn${status === s ? " segmented__btn--active" : ""}`}
                  onClick={() => {
                    setStatus(s);
                    setOffset(0);
                  }}
                >
                  {STATUS_LABEL[s]}
                </button>
              ))}
            </div>
            <input
              className="input input--search"
              type="search"
              placeholder="Sarlavha yoki manzil"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setOffset(0);
              }}
            />
          </div>

          {/* Counts follow the status and search above, so each number is
              exactly what that chip will list. */}
          <div className="cat-chips" role="tablist" aria-label="Turlar">
            <CategoryChip
              icon="all"
              label="Barcha turlar"
              count={
                data?.byCategory
                  ? Object.values(data.byCategory).reduce<number>((a, n) => a + (n ?? 0), 0)
                  : undefined
              }
              active={category === ""}
              onClick={() => {
                setCategory("");
                setOffset(0);
              }}
            />
            {categories.map((c) => (
              <CategoryChip
                key={c.slug}
                icon={c.icon}
                label={c.isActive ? c.nameUz : `${c.nameUz} (yashirin)`}
                count={data?.byCategory ? (data.byCategory[c.slug] ?? 0) : undefined}
                active={category === c.slug}
                onClick={() => {
                  setCategory(c.slug);
                  setOffset(0);
                }}
              />
            ))}
          </div>

          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>E'lon</th>
                  <th>Egasi</th>
                  <th>Narx</th>
                  <th>Holati</th>
                  <th>Sana</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {isLoading
                  ? Array.from({ length: 6 }).map((_, i) => (
                      <tr key={i}>
                        {Array.from({ length: 6 }).map((__, c) => (
                          <td key={c}>
                            <Skeleton width="70%" />
                          </td>
                        ))}
                      </tr>
                    ))
                  : data?.items.map((l) => {
                      const thumb = resolveMediaUrl(l.thumbUrl);
                      return (
                        <tr key={l.id} className="row--click" onClick={() => setOpenId(l.id)}>
                          <td>
                            <div className="listing-cell">
                              {thumb ? (
                                <img className="thumb" src={thumb} alt="" loading="lazy" />
                              ) : (
                                <span className="thumb thumb--empty" aria-hidden>
                                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <rect x="3" y="5" width="18" height="14" rx="2" />
                                    <circle cx="9" cy="10" r="1.6" />
                                    <path d="m5 19 5.5-5.5L14 17l3-3 4 4" />
                                  </svg>
                                </span>
                              )}
                              <div>
                                <div className="cell-main">{l.title ?? "Sarlavhasiz"}</div>
                                <div className="muted">
                                  {[nameOf(l.category), l.rooms ? `${l.rooms} xona` : null, l.address]
                                    .filter(Boolean)
                                    .join(" · ")}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td>
                            <div>{l.owner ? fullName(l.owner) || "—" : "—"}</div>
                            <div className="muted">{l.owner?.phoneNumber ?? ""}</div>
                          </td>
                          <td className="cell-num nowrap">
                            {l.offers?.length
                              ? l.offers
                                  .filter((o) => o.isActive)
                                  .map((o) => money(o.price, o.currency))
                                  .join(" / ") || "—"
                              : "—"}
                          </td>
                          <td>
                            <Badge tone={STATUS_TONE[l.status] ?? "neutral"}>
                              <span className="badge--dot" />
                              {STATUS_LABEL[l.status] ?? l.status}
                            </Badge>
                          </td>
                          <td className="muted nowrap">{date(l.createdAt)}</td>
                          <td>
                            <button
                              className="btn btn--ghost btn--sm row-open"
                              onClick={(e) => {
                                e.stopPropagation();
                                setOpenId(l.id);
                              }}
                            >
                              Ochish
                              <svg className="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="m9 6 6 6-6 6" />
                              </svg>
                            </button>
                          </td>
                        </tr>
                      );
                    })}
              </tbody>
            </table>
          </div>

          {!isLoading && !data?.items.length ? (
            <EmptyState
              title="E'lon topilmadi"
              hint={search || status || category ? "Filtrlarni o'zgartirib ko'ring." : undefined}
            />
          ) : null}

          <Pager offset={offset} limit={limit} total={data?.total ?? 0} onChange={setOffset}
            onLimitChange={setLimit}
          />
        </div>
      )}

      <ListingDrawer id={openId} onClose={() => setOpenId(null)} />
    </>
  );
}

function CategoryChip({
  icon,
  label: text,
  count,
  active,
  onClick,
}: {
  icon: string;
  label: string;
  count: number | undefined;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      role="tab"
      aria-selected={active}
      className={`cat-chip${active ? " cat-chip--active" : ""}${count === 0 && !active ? " cat-chip--empty" : ""}`}
      onClick={onClick}
    >
      <CategoryIcon icon={icon} size={17} />
      <span>{text}</span>
      {count !== undefined ? <span className="cat-chip__count">{count}</span> : null}
    </button>
  );
}
