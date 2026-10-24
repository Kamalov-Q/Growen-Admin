import { useState } from "react";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { adminApi, type AdminVideo, type AdminVideoReport } from "../lib/api";
import { date, fullName } from "../lib/format";
import {
  Badge,
  Drawer,
  EmptyState,
  ErrorState,
  Pager,
  PageHeader,
  Skeleton,
} from "../components/ui";
import { useT } from "../lib/i18n";
import { toast } from "../lib/toast";
import { usePaging } from "../lib/usePaging";
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

/** The clip's own state — the maps above are about the complaint. Same
 *  words as the Videolar page, so one vocabulary covers both screens. */
const VIDEO_STATUS_LABEL: Record<string, string> = {
  READY: "Chiqarilgan",
  UPLOADING: "Tayyorlanmoqda",
  AWAITING_PAYMENT: "To'lov kutilmoqda",
  FAILED: "Xatolik",
  EXPIRED: "Muddati tugagan",
  REMOVED: "O'chirilgan",
};

const VIDEO_STATUS_TONE: Record<string, "success" | "warning" | "danger" | "neutral"> = {
  READY: "success",
  UPLOADING: "neutral",
  AWAITING_PAYMENT: "warning",
  FAILED: "danger",
  EXPIRED: "neutral",
  REMOVED: "danger",
};

const REASON_LABEL: Record<string, string> = {
  SPAM: "Spam / reklama",
  FRAUD: "Firibgarlik",
  WRONG_INFO: "Ma'lumotlar noto'g'ri",
  INAPPROPRIATE: "Nomaqbul kontent",
  COPYRIGHT: "Musiqa yoki video o'zganing",
  OTHER: "Boshqa",
};

/**
 * The video report queue.
 *
 * The one page in the dashboard where a decision has two halves: whether the
 * complaint was right, and whether the clip comes down. They are offered
 * together because they are one judgement — and upholding closes every other
 * open report about the same video, since they are all about the same clip.
 */
export function VideoReportsPage() {
  const t = useT();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<string>("OPEN");
  const { offset, setOffset, limit, setLimit } = usePaging();
  const [open, setOpen] = useState<AdminVideoReport | null>(null);
  const [openUser, setOpenUser] = useState<string | null>(null);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["admin", "video-reports", status, offset, limit],
    queryFn: () => adminApi.videoReports({ status, limit, offset }),
    placeholderData: keepPreviousData,
  });

  const resolve = useMutation({
    mutationFn: ({
      id,
      next,
      removeVideo,
      note,
    }: {
      id: string;
      next: "RESOLVED" | "DISMISSED";
      removeVideo?: boolean;
      note?: string;
    }) => adminApi.resolveVideoReport(id, { status: next, removeVideo, note }),
    onSuccess: (_d, { next, removeVideo }) => {
      toast.success(
        removeVideo
          ? "Hal qilindi — video o'chirildi"
          : next === "RESOLVED"
            ? "Hal qilindi"
            : "Rad etildi",
      );
      setOpen(null);
      void queryClient.invalidateQueries({ queryKey: ["admin"] });
    },
    onError: (e) => toast.error(e),
  });

  return (
    <>
      <PageHeader
        title={t("Video shikoyatlari")}
        subtitle={t("Shikoyatni tasdiqlab, videoni bir harakatda o'chirish mumkin")}
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
                  <th>Video</th>
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
                  : data?.items.map((report) => (
                      <Row
                        key={report.id}
                        report={report}
                        onOpen={setOpen}
                        onOpenUser={setOpenUser}
                      />
                    ))}
              </tbody>
            </table>
          </div>

          {!isLoading && !data?.items.length ? (
            <EmptyState
              title="Shikoyat yo'q"
              hint={
                status === "OPEN"
                  ? "Ochiq shikoyatlar yo'q — hammasi ko'rib chiqilgan."
                  : undefined
              }
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

      <ReportDrawer
        report={open}
        onClose={() => setOpen(null)}
        onResolve={(next, removeVideo) =>
          open && resolve.mutate({ id: open.id, next, removeVideo })
        }
        onOpenUser={setOpenUser}
        pending={resolve.isPending}
      />

      <UserDrawer id={openUser} onClose={() => setOpenUser(null)} />
    </>
  );
}

function Row({
  report: r,
  onOpen,
  onOpenUser,
}: {
  report: AdminVideoReport;
  onOpen: (report: AdminVideoReport) => void;
  onOpenUser: (userId: string) => void;
}) {
  return (
    <tr className="row-open" onClick={() => onOpen(r)}>
      <td>
        <div className="cell-main">{r.video.caption || "Izohsiz video"}</div>
        <div className="muted">
          {r.video.status === "REMOVED" ? "O'chirilgan" : r.video.id.slice(0, 8)}
        </div>
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
        <button className="btn btn--ghost btn--sm" onClick={() => onOpen(r)}>
          Ko'rish
        </button>
      </td>
    </tr>
  );
}

/**
 * The complaint, and the clip it is about, on one surface.
 *
 * The video is fetched here rather than embedded in the queue response: a
 * page of twenty reports does not need twenty players, and a moderator opens
 * one at a time.
 */
function ReportDrawer({
  report,
  onClose,
  onResolve,
  onOpenUser,
  pending,
}: {
  report: AdminVideoReport | null;
  onClose: () => void;
  onResolve: (next: "RESOLVED" | "DISMISSED", removeVideo?: boolean) => void;
  onOpenUser: (userId: string) => void;
  pending: boolean;
}) {
  const { data: video } = useQuery<AdminVideo>({
    queryKey: ["admin", "video", report?.video.id],
    queryFn: () => adminApi.video(report!.video.id),
    enabled: !!report,
  });

  if (!report) return null;

  const open = report.status === "OPEN";
  const alreadyRemoved = video?.status === "REMOVED";

  return (
    <Drawer
      open
      title={REASON_LABEL[report.reason] ?? report.reason}
      subtitle={
        <span className="drawer__substatus">
          <Badge tone={STATUS_TONE[report.status] ?? "neutral"}>
            {STATUS_LABEL[report.status] ?? report.status}
          </Badge>
          <span className="muted">{date(report.createdAt)}</span>
        </span>
      }
      onClose={onClose}
      footer={
        open ? (
          <div className="drawer__actions">
            {/* Upholding and taking it down are one decision, so the
                strongest action is one button — not "resolve", then find the
                video again on another page. */}
            <button
              className="btn btn--danger"
              disabled={pending || alreadyRemoved}
              onClick={() => onResolve("RESOLVED", true)}
            >
              Tasdiqlash va o'chirish
            </button>
            <button
              className="btn"
              disabled={pending}
              onClick={() => onResolve("RESOLVED")}
            >
              Faqat tasdiqlash
            </button>
            <button
              className="btn btn--ghost"
              disabled={pending}
              onClick={() => onResolve("DISMISSED")}
            >
              Rad etish
            </button>
          </div>
        ) : null
      }
    >
      {/* Two columns, because the drawer is half a desktop wide and a reel
          is 9:16: stacked, the clip floated in the middle of a column of
          whitespace with the facts stranded below the fold. The clip holds
          the left rail; everything the decision rests on sits beside it. */}
      <div className="media-detail">
        <div className="media-detail__media">
          {video?.embedUrl && video.hlsUrl ? (
            <div className="video-embed">
              <iframe
                src={video.embedUrl}
                title={video.caption ?? "Video"}
                loading="lazy"
                allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture"
                allowFullScreen
              />
            </div>
          ) : (
            /* The frame stays, so the drawer keeps its shape and the reason
               sits where the picture would have been. */
            <div className="video-embed video-embed--empty">
              <p className="empty__title">Video ko'rsatib bo'lmadi</p>
              <p className="muted">
                {alreadyRemoved
                  ? "Video allaqachon o'chirilgan."
                  : "Fayl hali tayyor emas yoki Bunny'dan o'chirilgan."}
              </p>
            </div>
          )}
        </div>

        <div className="media-detail__facts">
          {/* What the clip says it is — the drawer named the complaint but
              never the video, so a moderator could not tell one report from
              the next without opening the queue again. */}
          <p className="media-detail__caption">
            {report.video.caption || (
              <span className="muted">Izohsiz video</span>
            )}
          </p>

          {report.comment ? (
            <p className="report-quote">{report.comment}</p>
          ) : null}

          <div className="panel">
            <dl className="kv">
              <dt>Shikoyatchi</dt>
              <dd>
                {report.reporter ? (
                  <button
                    className="person-link"
                    onClick={() => onOpenUser(report.reporter!.id)}
                  >
                    {fullName(report.reporter) ||
                      report.reporter.phoneNumber ||
                      "—"}
                  </button>
                ) : (
                  "—"
                )}
              </dd>

              <dt>Muallif</dt>
              <dd>
                {video?.author ? (
                  <button
                    className="person-link"
                    onClick={() => onOpenUser(video.author!.id)}
                  >
                    {fullName(video.author) || video.authorId}
                  </button>
                ) : (
                  "—"
                )}
              </dd>

              <dt>Video holati</dt>
              <dd>
                {video ? (
                  <Badge tone={VIDEO_STATUS_TONE[video.status] ?? "neutral"}>
                    {VIDEO_STATUS_LABEL[video.status] ?? video.status}
                  </Badge>
                ) : (
                  "—"
                )}
              </dd>

              <dt>E'lon</dt>
              <dd>{video?.listing?.title ?? "—"}</dd>

              <dt>Davomiyligi</dt>
              <dd>
                {video?.durationSec ? `${Math.round(video.durationSec)} s` : "—"}
              </dd>

              {report.resolutionNote ? (
                <>
                  <dt>Izoh</dt>
                  <dd>{report.resolutionNote}</dd>
                </>
              ) : null}
            </dl>
          </div>

          {/* The three numbers that say whether taking it down matters — a
              clip nobody watched and a clip with ten thousand views are not
              the same decision. */}
          <div className="media-detail__stats">
            <Stat label="Ko'rishlar" value={video?.viewCount} />
            <Stat label="Yoqdi" value={video?.likeCount} />
            <Stat label="Izohlar" value={video?.commentCount} />
          </div>
        </div>
      </div>
    </Drawer>
  );
}

/** One number with its name. Muted label, loud figure. */
function Stat({ label, value }: { label: string; value?: number }) {
  return (
    <div className="media-detail__stat">
      <span className="media-detail__statValue">{value ?? "—"}</span>
      <span className="muted">{label}</span>
    </div>
  );
}
