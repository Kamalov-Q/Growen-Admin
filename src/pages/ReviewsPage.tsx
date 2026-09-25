import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { adminApi, type AdminReview } from "../lib/api";
import { date, fullName } from "../lib/format";
import { Badge, EmptyState, ErrorState, Pager, PageHeader, Skeleton } from "../components/ui";
import { useT } from "../lib/i18n";
import { toast } from "../lib/toast";
import { usePaging } from "../lib/usePaging";
import { ListingDrawer } from "../components/ListingDrawer";

/** The filters worth having: everything, the complaints, and the ones that
 *  actually say something. Moderation reads the bottom of the list first. */
const VIEWS = [
  { key: "all", label: "Barchasi" },
  { key: "low", label: "Past baho (≤ 2)" },
  { key: "text", label: "Matnli" },
] as const;
type View = (typeof VIEWS)[number]["key"];

/** Stars as text — a table cell does not need five glyphs to be scannable. */
function Rating({ value }: { value: number }) {
  return (
    <span className="rating-cell">
      <span className="rating-cell__star">★</span>
      <b>{value}</b>
      <span className="muted">/5</span>
    </span>
  );
}

export function ReviewsPage() {
  const t = useT();
  const queryClient = useQueryClient();
  const [view, setView] = useState<View>("all");
  const { offset, setOffset, limit, setLimit } = usePaging();
  const [openListing, setOpenListing] = useState<string | null>(null);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["admin", "reviews", view, offset, limit],
    queryFn: () =>
      adminApi.reviews({
        limit,
        offset,
        ...(view === "low" ? { maxRating: 2 } : {}),
        ...(view === "text" ? { withText: true } : {}),
      }),
    placeholderData: keepPreviousData,
  });

  const remove = useMutation({
    mutationFn: (id: string) => adminApi.deleteReview(id),
    onSuccess: () => {
      toast.success("Sharh o'chirildi");
      // The listing's average moved with it, so the listings table and the
      // overview are stale too.
      void queryClient.invalidateQueries({ queryKey: ["admin"] });
    },
    onError: (e) => toast.error(e),
  });

  const onDelete = (r: AdminReview) => {
    const who = r.author ? fullName(r.author) || "foydalanuvchi" : "foydalanuvchi";
    if (!confirm(`${who} qoldirgan sharh o'chirilsinmi? Buni qaytarib bo'lmaydi.`)) {
      return;
    }
    remove.mutate(r.id);
  };

  return (
    <>
      <PageHeader
        title={t("Sharhlar")}
        subtitle={t("E'lonlarga qoldirilgan baholar va izohlar")}
      />

      {isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : (
        <div className="card">
          <div className="card__toolbar">
            <div className="segmented">
              {VIEWS.map((v) => (
                <button
                  key={v.key}
                  className={`segmented__btn${view === v.key ? " segmented__btn--active" : ""}`}
                  onClick={() => {
                    setView(v.key);
                    setOffset(0);
                  }}
                >
                  {v.label}
                </button>
              ))}
            </div>
            <span className="muted">
              {data ? `Jami ${data.total.toLocaleString("ru-RU")} ta` : " "}
            </span>
          </div>

          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>E'lon</th>
                  <th>Baho</th>
                  <th>Izoh</th>
                  <th>Muallif</th>
                  <th>Sana</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {isLoading
                  ? Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i}>
                        {Array.from({ length: 6 }).map((__, c) => (
                          <td key={c}>
                            <Skeleton width="70%" />
                          </td>
                        ))}
                      </tr>
                    ))
                  : data?.items.map((r) => (
                      <tr
                        key={r.id}
                        className="row--click"
                        onClick={() => setOpenListing(r.listingId)}
                      >
                        <td>
                          <div className="cell-main">
                            {r.listingTitle ?? "Sarlavhasiz"}
                          </div>
                        </td>
                        <td>
                          {/* Two stars and below is what a moderator is
                              looking for, so it is the one that gets colour. */}
                          <Badge tone={r.rating <= 2 ? "danger" : "neutral"}>
                            <Rating value={r.rating} />
                          </Badge>
                        </td>
                        <td>
                          {r.comment ? (
                            <div className="report-comment">“{r.comment}”</div>
                          ) : (
                            <span className="muted">— faqat baho</span>
                          )}
                        </td>
                        <td>
                          <div>{r.author ? fullName(r.author) || "—" : "—"}</div>
                        </td>
                        <td className="muted">{date(r.createdAt)}</td>
                        <td onClick={(e) => e.stopPropagation()}>
                          <div className="row-actions" style={{ justifyContent: "flex-end" }}>
                            <button
                              className="btn btn--danger-soft btn--sm"
                              disabled={remove.isPending}
                              onClick={() => onDelete(r)}
                            >
                              O'chirish
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>

          {!isLoading && !data?.items.length ? (
            <EmptyState
              title="Sharhlar yo'q"
              hint={view === "all" ? undefined : "Boshqa filtrni tanlab ko'ring."}
            />
          ) : null}

          <Pager
            offset={offset}
            limit={limit}
            total={data?.total ?? 0}
            onChange={setOffset}
            onLimitChange={setLimit}
          />
        </div>
      )}

      <ListingDrawer id={openListing} onClose={() => setOpenListing(null)} />
    </>
  );
}
