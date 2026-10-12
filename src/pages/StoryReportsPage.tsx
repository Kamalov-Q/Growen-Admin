import { useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminApi, resolveMediaUrl, type AdminStoryReport } from "../lib/api";
import { date, fullName } from "../lib/format";
import { Badge, EmptyState, ErrorState, Pager, PageHeader, Skeleton } from "../components/ui";
import { useT } from "../lib/i18n";
import { toast } from "../lib/toast";
import { confirmDialog } from "../lib/confirm";
import { usePaging } from "../lib/usePaging";
import { UserDrawer } from "../components/UserDrawer";

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

/** The app's fixed story-report reasons, labelled for the moderators. */
const REASON_LABEL: Record<string, string> = {
  SPAM: "Spam yoki reklama",
  SCAM: "Firibgarlik",
  INAPPROPRIATE: "Nomaqbul kontent",
  HARASSMENT: "Haqorat yoki tahdid",
  COPYRIGHT: "Mualliflik huquqi buzilgan",
  OTHER: "Boshqa sabab",
};

const TYPE_LABEL: Record<string, string> = {
  IMAGE: "Rasm",
  VIDEO: "Video",
  TEXT: "Matn",
};

/**
 * The queue of reported stories.
 *
 * A story lasts a day or two and the report outlives it, so each row carries
 * the server's copy of what was posted — a moderator opening this tomorrow
 * can still see what the complaint was about, even though the story itself
 * has expired and nobody in the app can reach it any more.
 */
export function StoryReportsPage() {
  const t = useT();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<string>("OPEN");
  const { offset, setOffset, limit, setLimit } = usePaging();
  const [openUser, setOpenUser] = useState<string | null>(null);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["admin", "story-reports", status, offset, limit],
    queryFn: () => adminApi.storyReports({ status: status || undefined, limit, offset }),
    placeholderData: keepPreviousData,
  });

  const setReportStatus = useMutation({
    mutationFn: ({ id, to }: { id: string; to: AdminStoryReport["status"] }) =>
      adminApi.setStoryReportStatus(id, to),
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

  const removeStory = useMutation({
    mutationFn: (storyId: string) => adminApi.removeReportedStory(storyId),
    onSuccess: () => {
      toast.success("Hikoya o'chirildi");
      void queryClient.invalidateQueries({ queryKey: ["admin"] });
    },
    onError: (e) => toast.error(e),
  });

  // Asked before it happens: taking a story down is visible to its author and
  // cannot be undone from here.
  const confirmRemove = async (r: AdminStoryReport) => {
    const ok = await confirmDialog({
      title: "Hikoyani o'chirasizmi?",
      message: "Hikoya hammadan yo'qoladi. Shikoyat navbatda qoladi.",
      confirmLabel: "O'chirish",
      destructive: true,
    });
    if (ok) removeStory.mutate(r.storyId);
  };

  const busy = setReportStatus.isPending || removeStory.isPending;

  return (
    <>
      <PageHeader
        title={t("Hikoya shikoyatlari")}
        subtitle={t("Muddati tugagan hikoya ham shu yerda saqlanib qoladi")}
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
              {data ? `Jami ${data.total.toLocaleString("ru-RU")} ta` : " "}
            </span>
          </div>

          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Hikoya</th>
                  <th>Sabab</th>
                  <th>Muallif</th>
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
                        {Array.from({ length: 7 }).map((__, c) => (
                          <td key={c}>
                            <Skeleton width="70%" />
                          </td>
                        ))}
                      </tr>
                    ))
                  : data?.items.map((r) => (
                      <tr key={r.id}>
                        <td>
                          <StoryCell report={r} />
                        </td>
                        <td>
                          <Badge
                            tone={
                              r.reason === "SCAM" || r.reason === "HARASSMENT"
                                ? "danger"
                                : "neutral"
                            }
                          >
                            {REASON_LABEL[r.reason] ?? r.reason}
                          </Badge>
                          {r.comment ? (
                            <div className="muted report-comment">“{r.comment}”</div>
                          ) : null}
                        </td>
                        <td>
                          <PersonCell
                            person={r.author}
                            onOpen={setOpenUser}
                          />
                        </td>
                        <td>
                          <PersonCell
                            person={r.reporter}
                            onOpen={setOpenUser}
                          />
                        </td>
                        <td className="muted nowrap">{date(r.createdAt)}</td>
                        <td>
                          <Badge tone={STATUS_TONE[r.status] ?? "neutral"}>
                            <span className="badge--dot" />
                            {STATUS_LABEL[r.status] ?? r.status}
                          </Badge>
                        </td>
                        <td>
                          <div className="row-actions" style={{ justifyContent: "flex-end" }}>
                            {/* Nothing to take down once it has expired or
                                already been removed — only a decision left. */}
                            {r.stillLive ? (
                              <button
                                className="btn btn--danger btn--sm"
                                disabled={busy}
                                onClick={() => void confirmRemove(r)}
                              >
                                Hikoyani o'chirish
                              </button>
                            ) : null}
                            {r.status === "OPEN" ? (
                              <>
                                <button
                                  className="btn btn--primary btn--sm"
                                  disabled={busy}
                                  onClick={() =>
                                    setReportStatus.mutate({ id: r.id, to: "RESOLVED" })
                                  }
                                >
                                  Hal qilindi
                                </button>
                                <button
                                  className="btn btn--ghost btn--sm"
                                  disabled={busy}
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
                                disabled={busy}
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

          <Pager
            offset={offset}
            limit={limit}
            total={data?.total ?? 0}
            onChange={setOffset}
            onLimitChange={setLimit}
          />
        </div>
      )}

      <UserDrawer id={openUser} onClose={() => setOpenUser(null)} />
    </>
  );
}

/**
 * What was reported, as far as the queue can show it: the still, the kind, and
 * the words. The thumbnail opens the full media in a new tab — a video cannot
 * be judged from one frame, and the dashboard has no player.
 */
function StoryCell({ report: r }: { report: AdminStoryReport }) {
  const full = resolveMediaUrl(r.story.mediaUrl);
  const still = resolveMediaUrl(r.story.thumbUrl ?? r.story.mediaUrl);

  return (
    <div className="story-cell">
      {still && r.story.type !== "TEXT" ? (
        <a href={full} target="_blank" rel="noreferrer" title="To'liq ko'rish">
          <img className="story-thumb" src={still} alt="" />
          {r.story.type === "VIDEO" ? (
            <span className="story-thumb__badge">▶</span>
          ) : null}
        </a>
      ) : (
        <div className="story-thumb story-thumb--text">
          {TYPE_LABEL.TEXT}
        </div>
      )}

      <div>
        <div className="cell-main">{TYPE_LABEL[r.story.type] ?? r.story.type}</div>
        {r.story.body ? (
          <div className="muted report-comment">{r.story.body}</div>
        ) : null}
        {!r.stillLive ? (
          <div className="muted">Hikoya endi mavjud emas</div>
        ) : null}
      </div>
    </div>
  );
}

function PersonCell({
  person,
  onOpen,
}: {
  person: AdminStoryPersonLike;
  onOpen: (id: string) => void;
}) {
  return (
    <button
      className="person-link"
      onClick={() => person && onOpen(person.id)}
      disabled={!person}
    >
      <div>
        <div>{person ? fullName(person) || "—" : "—"}</div>
        <div className="muted">{person?.phoneNumber ?? ""}</div>
      </div>
    </button>
  );
}

type AdminStoryPersonLike = AdminStoryReport["author"];
