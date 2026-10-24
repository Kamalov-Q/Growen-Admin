import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { adminApi, type AdminVideo, type AdminVideoStatus } from "../lib/api";
import { Link } from "react-router-dom";
import { date, fullName, useDebounced } from "../lib/format";
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
import { confirmDialog } from "../lib/confirm";
import { usePaging } from "../lib/usePaging";
import { UserDrawer } from "../components/UserDrawer";

const STATUSES = ["", "READY", "UPLOADING", "AWAITING_PAYMENT", "FAILED", "REMOVED"] as const;

const STATUS_LABEL: Record<string, string> = {
  "": "Barchasi",
  READY: "Chiqarilgan",
  UPLOADING: "Tayyorlanmoqda",
  AWAITING_PAYMENT: "To'lov kutilmoqda",
  FAILED: "Xatolik",
  EXPIRED: "Muddati tugagan",
  REMOVED: "O'chirilgan",
};

const STATUS_TONE: Record<string, "success" | "warning" | "danger" | "neutral"> = {
  READY: "success",
  UPLOADING: "neutral",
  AWAITING_PAYMENT: "warning",
  FAILED: "danger",
  EXPIRED: "neutral",
  REMOVED: "danger",
};

/** The same words the report queue uses — one vocabulary, two screens. */
const REPORT_REASON_LABEL: Record<string, string> = {
  SPAM: "Spam / reklama",
  FRAUD: "Firibgarlik",
  WRONG_INFO: "Ma'lumotlar noto'g'ri",
  INAPPROPRIATE: "Nomaqbul kontent",
  COPYRIGHT: "Musiqa yoki video o'zganing",
  OTHER: "Boshqa",
};

const REPORT_STATUS_LABEL: Record<string, string> = {
  OPEN: "Ochiq",
  RESOLVED: "Hal qilindi",
  DISMISSED: "Rad etildi",
};

const REPORT_STATUS_TONE: Record<string, "danger" | "success" | "neutral"> = {
  OPEN: "danger",
  RESOLVED: "success",
  DISMISSED: "neutral",
};

const FAIL_LABEL: Record<string, string> = {
  TOO_LONG: "1 daqiqadan uzun",
  ENCODING_FAILED: "Tayyorlashda xatolik",
  ABANDONED: "Yuklash tugallanmagan",
};

/**
 * Videolar — every clip in the product, in every state.
 *
 * Needed because everyone can post. The failed and unpaid rows are here on
 * purpose: they are what an upload problem looks like from this side, and
 * without them a seller's "my video never appeared" is unanswerable.
 */
export function VideosPage() {
  const t = useT();
  const queryClient = useQueryClient();
  /**
   * The status filter lives in the URL, not in state.
   *
   * It is what makes the overview's "to'lov kutilmoqda" tile a link that
   * actually lands on those rows — and it makes a filtered table something
   * you can bookmark or send to another moderator.
   */
  const [params, setParams] = useSearchParams();
  const statusParam = params.get("status") ?? "";
  const status = (STATUSES as readonly string[]).includes(statusParam)
    ? statusParam
    : "";
  const setStatus = (next: string) => {
    const copy = new URLSearchParams(params);
    if (next) copy.set("status", next);
    else copy.delete("status");
    // Replace, not push: flipping through filters should not have to be
    // un-done one back-press at a time.
    setParams(copy, { replace: true });
  };
  const [search, setSearch] = useState("");
  const q = useDebounced(search);
  const { offset, setOffset, limit, setLimit } = usePaging();
  const [open, setOpen] = useState<AdminVideo | null>(null);
  const [openUser, setOpenUser] = useState<string | null>(null);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["admin", "videos", status, q, offset, limit],
    queryFn: () => adminApi.videos({ status, q, limit, offset }),
    placeholderData: keepPreviousData,
  });

  const remove = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
      adminApi.removeVideo(id, reason),
    onSuccess: () => {
      toast.success("Video o'chirildi");
      setOpen(null);
      void queryClient.invalidateQueries({ queryKey: ["admin"] });
    },
    onError: (e) => toast.error(e),
  });

  /**
   * Saving an edit refreshes the open drawer from the server's answer rather
   * than closing it. A moderator fixing a caption is usually mid-review —
   * the reports below it are the reason they are here — and a drawer that
   * shuts on save takes them back to the list they will immediately reopen.
   */
  const update = useMutation({
    mutationFn: ({
      id,
      ...body
    }: {
      id: string;
      caption?: string;
      listingId?: string | null;
    }) => adminApi.updateVideo(id, body),
    onSuccess: (saved) => {
      toast.success("Saqlandi");
      setOpen(saved);
      void queryClient.invalidateQueries({ queryKey: ["admin"] });
    },
    onError: (e) => toast.error(e),
  });

  const onRemove = async (video: AdminVideo) => {
    const ok = await confirmDialog({
      title: "Video o'chirilsinmi?",
      message:
        "Video Videolar bo'limidan olib tashlanadi. Fayl Bunny'da 30 kundan keyin o'chiriladi, shuning uchun qarorni keyin ham ko'rib chiqish mumkin. Pul qaytarilmaydi.",
      confirmLabel: "O'chirish",
      destructive: true,
    });
    if (!ok) return;
    remove.mutate({ id: video.id });
  };

  return (
    <>
      <PageHeader
        title={t("Videolar")}
        subtitle={t("Hamma video joylashi mumkin — shuning uchun bu ro'yxat")}
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

            <input
              className="input"
              placeholder="Izoh bo'yicha qidirish"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setOffset(0);
              }}
            />
          </div>

          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Video</th>
                  <th>Muallif</th>
                  <th>E'lon</th>
                  <th>Holati</th>
                  <th>Ko'rish · Yoqdi · Izoh</th>
                  <th>Sana</th>
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
                  : data?.items.map((video) => (
                      <Row
                        key={video.id}
                        video={video}
                        onOpen={setOpen}
                        onOpenUser={setOpenUser}
                      />
                    ))}
              </tbody>
            </table>
          </div>

          {!isLoading && !data?.items.length ? (
            <EmptyState
              title="Video yo'q"
              hint={
                status || q
                  ? "Filtr bo'yicha hech narsa topilmadi."
                  : "Hali hech kim video joylashtirmagan."
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

      <VideoDrawer
        video={open}
        onClose={() => setOpen(null)}
        onRemove={onRemove}
        onSave={(id, body) => update.mutate({ id, ...body })}
        onOpenUser={setOpenUser}
        pending={remove.isPending}
        saving={update.isPending}
      />

      <UserDrawer id={openUser} onClose={() => setOpenUser(null)} />
    </>
  );
}

/** One row; module scope so React keeps rows mounted across renders. */
function Row({
  video,
  onOpen,
  onOpenUser,
}: {
  video: AdminVideo;
  onOpen: (video: AdminVideo) => void;
  onOpenUser: (userId: string) => void;
}) {
  return (
    <tr className="row-open" onClick={() => onOpen(video)}>
      <td>
        <div className="media-cell">
          {video.thumbUrl ? (
            <img className="media-cell__thumb" src={video.thumbUrl} alt="" />
          ) : (
            <div className="media-cell__thumb media-cell__thumb--empty" />
          )}
          <div>
            <div className="cell-main">{video.caption || "Izohsiz"}</div>
            <div className="muted">
              {video.durationSec ? `${Math.round(video.durationSec)} s` : "—"}
            </div>
          </div>
        </div>
      </td>

      <td onClick={(e) => e.stopPropagation()}>
        <button
          className="person-link"
          onClick={() => onOpenUser(video.authorId)}
        >
          <div>
            <div>{video.author ? fullName(video.author) || "—" : "—"}</div>
            {video.author?.isVerifiedRealtor ? (
              <div className="muted">Tasdiqlangan</div>
            ) : null}
          </div>
        </button>
      </td>

      <td>
        {video.listing ? (
          <div className="cell-main">{video.listing.title ?? "Nomsiz e'lon"}</div>
        ) : (
          <span className="muted">—</span>
        )}
      </td>

      <td>
        <Badge tone={STATUS_TONE[video.status] ?? "neutral"}>
          {STATUS_LABEL[video.status] ?? video.status}
        </Badge>
        {video.failReason ? (
          <div className="muted">
            {FAIL_LABEL[video.failReason] ?? video.failReason}
          </div>
        ) : null}
      </td>

      <td className="nowrap">
        {video.viewCount} · {video.likeCount} · {video.commentCount}
      </td>

      <td className="muted nowrap">{date(video.publishedAt ?? video.createdAt)}</td>

      <td>
        <button className="btn btn--ghost btn--sm" onClick={() => onOpen(video)}>
          Ko'rish
        </button>
      </td>
    </tr>
  );
}

/**
 * One video, playing.
 *
 * Bunny's own iframe rather than a `<video>` tag: the clip is served as HLS,
 * which Chrome cannot play without a JavaScript player, and the embed is the
 * one URL that works in every browser without adding a media library to this
 * bundle.
 */
function VideoDrawer({
  video,
  onClose,
  onRemove,
  onSave,
  onOpenUser,
  pending,
  saving,
}: {
  video: AdminVideo | null;
  onClose: () => void;
  onRemove: (video: AdminVideo) => void;
  onSave: (
    id: string,
    body: { caption?: string; listingId?: string | null },
  ) => void;
  onOpenUser: (userId: string) => void;
  pending: boolean;
  saving: boolean;
}) {
  if (!video) return null;
  // Keyed on the video, so opening a different row starts the form from that
  // row's caption rather than carrying the last one's draft across.
  return (
    <VideoDrawerBody
      key={video.id}
      video={video}
      onClose={onClose}
      onRemove={onRemove}
      onSave={onSave}
      onOpenUser={onOpenUser}
      pending={pending}
      saving={saving}
    />
  );
}

function VideoDrawerBody({
  video,
  onClose,
  onRemove,
  onSave,
  onOpenUser,
  pending,
  saving,
}: {
  video: AdminVideo;
  onClose: () => void;
  onRemove: (video: AdminVideo) => void;
  onSave: (
    id: string,
    body: { caption?: string; listingId?: string | null },
  ) => void;
  onOpenUser: (userId: string) => void;
  pending: boolean;
  saving: boolean;
}) {
  const [caption, setCaption] = useState(video.caption ?? "");
  const [unlink, setUnlink] = useState(false);

  /**
   * What has been reported about THIS clip.
   *
   * The queue at /video-reports is the right place to work through
   * complaints in order; this is the other direction — an admin who already
   * has a video open needs to know whether anyone has objected to it before
   * deciding whether to touch it. Loaded with the drawer, not with the list:
   * one request per video actually inspected, not one per row rendered.
   */
  const reports = useQuery({
    queryKey: ["admin", "video", video.id, "reports"],
    queryFn: () => adminApi.videoReports({ videoId: video.id, limit: 20 }),
  });

  const openCount =
    reports.data?.items.filter((r) => r.status === "OPEN").length ?? 0;

  const dirty =
    caption.trim() !== (video.caption ?? "") || (unlink && !!video.listingId);

  const save = () => {
    if (!dirty) return;
    onSave(video.id, {
      caption: caption.trim(),
      ...(unlink && video.listingId ? { listingId: null } : {}),
    });
    setUnlink(false);
  };

  const removable: AdminVideoStatus[] = ["READY", "AWAITING_PAYMENT", "UPLOADING"];

  return (
    <Drawer
      open
      title={video.caption || "Video"}
      subtitle={
        <span className="muted">
          {STATUS_LABEL[video.status] ?? video.status} ·{" "}
          {date(video.publishedAt ?? video.createdAt)}
        </span>
      }
      onClose={onClose}
      footer={
        <>
          <button
            className="btn btn--primary"
            disabled={!dirty || saving}
            onClick={save}
          >
            {saving ? "Saqlanmoqda…" : "Saqlash"}
          </button>
          {removable.includes(video.status) ? (
            <button
              className="btn btn--danger"
              disabled={pending}
              onClick={() => void onRemove(video)}
            >
              Videoni o'chirish
            </button>
          ) : null}
        </>
      }
    >
      {video.embedUrl && video.hlsUrl ? (
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
        <EmptyState
          title="Video hali tayyor emas"
          hint="Fayl Bunny'da tayyorlanmoqda yoki yuklanmagan."
        />
      )}

      <dl className="kv">
        <dt>Muallif</dt>
        <dd>
          <button className="person-link" onClick={() => onOpenUser(video.authorId)}>
            {video.author ? fullName(video.author) || video.authorId : video.authorId}
          </button>
        </dd>

        <dt>E'lon</dt>
        <dd>
          {video.listing?.title ?? "—"}
          {/* Unlinking only. Pointing a clip at a DIFFERENT advert is not
              offered here on purpose: the server requires the listing to
              belong to the video's own author, so the only safe edit from
              this side is clearing a link that is wrong. */}
          {video.listingId ? (
            <label className="check" style={{ marginTop: 6 }}>
              <input
                type="checkbox"
                checked={unlink}
                onChange={(e) => setUnlink(e.target.checked)}
              />
              <span>E'londan uzish</span>
            </label>
          ) : null}
        </dd>

        <dt>Davomiyligi</dt>
        <dd>{video.durationSec ? `${Math.round(video.durationSec)} s` : "—"}</dd>

        <dt>O'lchami</dt>
        <dd>{video.width && video.height ? `${video.width}×${video.height}` : "—"}</dd>

        <dt>Ko'rishlar</dt>
        <dd>{video.viewCount}</dd>

        <dt>Yoqdi</dt>
        <dd>{video.likeCount}</dd>

        <dt>Izohlar</dt>
        <dd>{video.commentCount}</dd>

        <dt>Shikoyatlar</dt>
        <dd>
          {reports.isLoading
            ? "…"
            : openCount > 0
              ? `${openCount} ochiq`
              : (reports.data?.total ?? 0) > 0
                ? `${reports.data?.total} — hammasi yopilgan`
                : "—"}
        </dd>
      </dl>

      {/* The caption is the half of a reel that can be wrong rather than
          against the rules — a phone number where the rules say none, a wall
          of keywords, somebody else's address. Editable here so that fixing
          one does not have to mean taking the whole clip down. */}
      <div className="field">
        <label className="field__label" htmlFor="video-caption">
          Izoh matni
        </label>
        <textarea
          id="video-caption"
          className="input"
          rows={4}
          value={caption}
          disabled={saving}
          onChange={(e) => setCaption(e.target.value)}
          placeholder="Izohsiz"
        />
      </div>

      {/* What people have objected to about this clip, newest first. The
          queue is where complaints get worked through in order; this is for
          the admin who already has the video open and needs to know whether
          anybody has complained before deciding what to do with it. */}
      <section className="drawer-section">
        <h4 className="drawer-section__title">
          Shikoyatlar
          {(reports.data?.total ?? 0) > 0 ? (
            <Link className="btn btn--ghost btn--sm" to="/video-reports">
              Navbatda ochish
            </Link>
          ) : null}
        </h4>

        {reports.isLoading ? (
          <>
            <Skeleton width="100%" height={56} />
            <Skeleton width="70%" />
          </>
        ) : !reports.data?.items.length ? (
          <p className="muted">Bu videoga shikoyat kelmagan.</p>
        ) : (
          <ul className="report-list">
            {reports.data.items.map((r) => (
              <li key={r.id} className="report-list__item">
                <div className="report-list__head">
                  <span>{REPORT_REASON_LABEL[r.reason] ?? r.reason}</span>
                  <Badge tone={REPORT_STATUS_TONE[r.status] ?? "neutral"}>
                    {REPORT_STATUS_LABEL[r.status] ?? r.status}
                  </Badge>
                </div>
                <div className="muted">
                  {r.reporter ? fullName(r.reporter) || "—" : "—"} ·{" "}
                  {date(r.createdAt)}
                </div>
                {r.comment ? (
                  <p className="report-quote">{r.comment}</p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </Drawer>
  );
}
