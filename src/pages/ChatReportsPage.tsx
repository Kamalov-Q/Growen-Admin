import { useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminApi, type AdminChatReport } from "../lib/api";
import { date, fullName } from "../lib/format";
import { Badge, EmptyState, ErrorState, Pager, PageHeader, Skeleton } from "../components/ui";
import { useT } from "../lib/i18n";
import { toast } from "../lib/toast";
import { usePaging } from "../lib/usePaging";
import { ChatReportDrawer } from "../components/ChatReportDrawer";
import { UserDrawer } from "../components/UserDrawer";

const STATUSES = ["OPEN", "RESOLVED", "DISMISSED", ""] as const;
const STATUS_LABEL: Record<string, string> = {
  OPEN: "Ochiq",
  RESOLVED: "Hal qilindi",
  DISMISSED: "Rad etildi",
  "": "Barchasi",
};
const STATUS_TONE: Record<string, "danger" | "success" | "neutral"> = {
  OPEN: "danger",
  RESOLVED: "success",
  DISMISSED: "neutral",
};
const REASON_LABEL: Record<string, string> = {
  SPAM: "Spam / reklama",
  SCAM: "Firibgarlik",
  HARASSMENT: "Haqorat yoki tahdid",
  INAPPROPRIATE: "Nomaqbul kontent",
  OTHER: "Boshqa",
};

/**
 * The queue of reported conversations. Chats are private: this list, and the
 * transcript behind each row, exist only because someone in the chat reported
 * it — there is no way to browse conversations from here.
 */
export function ChatReportsPage() {
  const t = useT();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<string>("OPEN");
  const { offset, setOffset, limit, setLimit } = usePaging();
  const [openReport, setOpenReport] = useState<string | null>(null);
  const [openUser, setOpenUser] = useState<string | null>(null);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["admin", "chat-reports", status, offset, limit],
    queryFn: () => adminApi.chatReports({ status, limit, offset }),
    placeholderData: keepPreviousData,
  });

  const setReportStatus = useMutation({
    mutationFn: ({ id, next }: { id: string; next: "RESOLVED" | "DISMISSED" }) =>
      adminApi.setChatReportStatus(id, next),
    onSuccess: (_d, { next }) => {
      toast.success(next === "RESOLVED" ? "Hal qilindi" : "Rad etildi");
      void queryClient.invalidateQueries({ queryKey: ["admin"] });
    },
    onError: (e) => toast.error(e),
  });

  return (
    <>
      <PageHeader
        title={t("Suhbat shikoyatlari")}
        subtitle={t("Yozishmalar faqat shikoyat orqali ko'rinadi")}
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
          </div>

          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Suhbat</th>
                  <th>Sabab</th>
                  <th>Shikoyatchi</th>
                  <th>Holati</th>
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
                  : data?.items.map((r) => <Row
                        key={r.id}
                        report={r}
                        onOpen={setOpenReport}
                        onOpenUser={setOpenUser}
                      />)}
              </tbody>
            </table>
          </div>

          {!isLoading && !data?.items.length ? (
            <EmptyState
              title="Shikoyat yo'q"
              hint={status === "OPEN" ? "Ochiq shikoyatlar yo'q — hammasi ko'rib chiqilgan." : undefined}
            />
          ) : null}

          <Pager offset={offset} limit={limit} total={data?.total ?? 0} onChange={setOffset}
            onLimitChange={setLimit}
          />
        </div>
      )}

      <UserDrawer id={openUser} onClose={() => setOpenUser(null)} />

      <ChatReportDrawer
        id={openReport}
        onClose={() => setOpenReport(null)}
        onSetStatus={(id, next) => setReportStatus.mutate({ id, next })}
        pending={setReportStatus.isPending}
      />
    </>
  );

}

/** One queue row; module scope so React keeps rows mounted across renders. */
function Row({
  report: r,
  onOpen,
  onOpenUser,
}: {
  report: AdminChatReport;
  onOpen: (id: string) => void;
  /** Opens whoever filed the report — their record, not the thread. */
  onOpenUser: (userId: string) => void;
}) {
  const people = [r.conversation?.host, r.conversation?.guest]
    .map((p) => (p ? fullName(p) || p.phoneNumber : null))
    .filter(Boolean)
    .join(" ↔ ");

  return (
    <tr className="row-open" onClick={() => onOpen(r.id)}>
      <td>
        <div className="cell-main">{people || "—"}</div>
        <div className="muted">{r.conversation?.listing?.title ?? "E'lon o'chirilgan"}</div>
      </td>
      <td>
        <div>{REASON_LABEL[r.reason] ?? r.reason}</div>
        {r.comment ? <div className="muted">{r.comment}</div> : null}
      </td>
      <td onClick={(e) => e.stopPropagation()}>
        <button
          className="person-link"
          onClick={() => r.reporter && onOpenUser(r.reporter.id)}
          disabled={!r.reporter}
        >
          <div>
            <div>{r.reporter ? fullName(r.reporter) || "—" : "—"}</div>
            <div className="muted">{r.reporter?.phoneNumber ?? ""}</div>
          </div>
        </button>
      </td>
      <td>
        <Badge tone={STATUS_TONE[r.status] ?? "neutral"}>
          {STATUS_LABEL[r.status] ?? r.status}
        </Badge>
      </td>
      <td className="muted nowrap">{date(r.createdAt)}</td>
      <td>
        <button className="btn btn--ghost btn--sm" onClick={() => onOpen(r.id)}>
          Yozishmani ochish
        </button>
      </td>
    </tr>
  );
}
