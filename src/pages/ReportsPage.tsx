import { useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminApi, type AdminReport } from "../lib/api";
import { date, fullName } from "../lib/format";
import { Badge, EmptyState, ErrorState, Pager, PageHeader, Skeleton } from "../components/ui";
import { useT } from "../lib/i18n";
import { toast } from "../lib/toast";
import { usePaging } from "../lib/usePaging";
import { ListingDrawer } from "../components/ListingDrawer";

const STATUSES = ["OPEN", "RESOLVED", "DISMISSED", ""] as const;
const STATUS_LABEL: Record<string, string> = {
  "": "Barchasi",
  OPEN: "Ochiq",
  RESOLVED: "Hal qilindi",
  DISMISSED: "Rad etildi",
};
const STATUS_TONE: Record<string, "danger" | "success" | "neutral"> = {
  OPEN: "danger",
  RESOLVED: "success",
  DISMISSED: "neutral",
};

/** The app's fixed report reasons, labelled for the moderators. */
const REASON_LABEL: Record<string, string> = {
  FRAUD: "Firibgarlik",
  WRONG_INFO: "Ma'lumotlar noto'g'ri",
  ALREADY_SOLD: "Allaqachon sotilgan",
  WRONG_PRICE: "Narx noto'g'ri",
  DUPLICATE: "Takroriy e'lon",
  INAPPROPRIATE: "Nomaqbul kontent",
  OTHER: "Boshqa sabab",
};

export function ReportsPage() {
  const t = useT();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<string>("OPEN");
  const { offset, setOffset, limit, setLimit } = usePaging();
  const [openListing, setOpenListing] = useState<string | null>(null);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["admin", "reports", status, offset, limit],
    queryFn: () => adminApi.reports({ status: status || undefined, limit, offset }),
    placeholderData: keepPreviousData,
  });

  const setReportStatus = useMutation({
    mutationFn: ({ id, to }: { id: string; to: AdminReport["status"] }) =>
      adminApi.setReportStatus(id, to),
    onSuccess: (_r, { to }) => {
      toast.success(
        to === "RESOLVED"
          ? "Hal qilindi deb belgilandi"
          : to === "DISMISSED"
            ? "Rad etildi"
            : "Qayta ochildi",
      );
      void queryClient.invalidateQueries({ queryKey: ["admin"] });
    },
    onError: (e) => toast.error(e),
  });

  return (
    <>
      <PageHeader
        title={t("Shikoyatlar")}
        subtitle={t("Foydalanuvchilar e'lonlar haqida yuborgan xabarlar")}
      />

      {isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : (
        <div className="card">
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
            <span className="muted">
              {data ? `Jami ${data.total.toLocaleString("ru-RU")} ta` : " "}
            </span>
          </div>

          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>E'lon</th>
                  <th>Sabab</th>
                  <th>Kim yuborgan</th>
                  <th>Sana</th>
                  <th>Holati</th>
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
                        onClick={() => setOpenListing(r.listing.id)}
                      >
                        <td>
                          <div className="cell-main">
                            {r.listing.title ?? "Sarlavhasiz"}
                          </div>
                          <div className="muted">{r.listing.address ?? ""}</div>
                        </td>
                        <td>
                          <Badge tone={r.reason === "FRAUD" ? "danger" : "neutral"}>
                            {REASON_LABEL[r.reason] ?? r.reason}
                          </Badge>
                          {r.comment ? (
                            <div className="muted report-comment">“{r.comment}”</div>
                          ) : null}
                        </td>
                        <td>
                          <div>{r.reporter ? fullName(r.reporter) || "—" : "—"}</div>
                          <div className="muted">{r.reporter?.phoneNumber ?? ""}</div>
                        </td>
                        <td className="muted">{date(r.createdAt)}</td>
                        <td>
                          <Badge tone={STATUS_TONE[r.status] ?? "neutral"}>
                            <span className="badge--dot" />
                            {STATUS_LABEL[r.status] ?? r.status}
                          </Badge>
                        </td>
                        <td onClick={(e) => e.stopPropagation()}>
                          <div className="row-actions" style={{ justifyContent: "flex-end" }}>
                            {r.status === "OPEN" ? (
                              <>
                                <button
                                  className="btn btn--primary btn--sm"
                                  disabled={setReportStatus.isPending}
                                  onClick={() =>
                                    setReportStatus.mutate({ id: r.id, to: "RESOLVED" })
                                  }
                                >
                                  Hal qilindi
                                </button>
                                <button
                                  className="btn btn--ghost btn--sm"
                                  disabled={setReportStatus.isPending}
                                  onClick={() =>
                                    setReportStatus.mutate({ id: r.id, to: "DISMISSED" })
                                  }
                                >
                                  Rad etish
                                </button>
                              </>
                            ) : (
                              <button
                                className="btn btn--ghost btn--sm"
                                disabled={setReportStatus.isPending}
                                onClick={() =>
                                  setReportStatus.mutate({ id: r.id, to: "OPEN" })
                                }
                              >
                                Qayta ochish
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>

          {!isLoading && !data?.items.length ? (
            <EmptyState
              title={status === "OPEN" ? "Ochiq shikoyatlar yo'q" : "Shikoyatlar yo'q"}
              hint={status ? "Boshqa holatni tanlab ko'ring." : undefined}
            />
          ) : null}

          <Pager offset={offset} limit={limit} total={data?.total ?? 0} onChange={setOffset}
            onLimitChange={setLimit}
          />
        </div>
      )}

      <ListingDrawer id={openListing} onClose={() => setOpenListing(null)} />
    </>
  );
}
