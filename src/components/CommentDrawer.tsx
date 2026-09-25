import { useQuery } from "@tanstack/react-query";
import { adminApi, resolveMediaUrl } from "../lib/api";
import { fullName } from "../lib/format";
import { Avatar, Badge, Drawer, ErrorState, Skeleton } from "./ui";

const time = (iso: string) =>
  new Date(iso).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

/**
 * One comment, shown inside the exchange it belongs to.
 *
 * The thread is the point: deciding whether a line is abuse needs what it was
 * answering — on its own, "unchalikmas manimcha" is unreadable either way.
 * The clicked row is highlighted so it stays findable in a long exchange.
 */
export function CommentDrawer({
  id,
  onClose,
  onOpenListing,
  onDelete,
  deleting,
}: {
  id: string | null;
  onClose: () => void;
  onOpenListing: (listingId: string) => void;
  onDelete: (commentId: string) => void;
  deleting: boolean;
}) {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["admin", "comment", id],
    queryFn: () => adminApi.comment(id!),
    enabled: !!id,
  });

  return (
    <Drawer
      open={!!id}
      title="Izoh"
      subtitle={
        data
          ? `${data.isReply ? "Javob" : "Izoh"} · ${time(data.createdAt)}`
          : undefined
      }
      onClose={onClose}
      footer={
        data ? (
          <>
            <button
              className="btn btn--primary"
              onClick={() => data.listing && onOpenListing(data.listing.id)}
              disabled={!data.listing}
            >
              E'lonni ochish
            </button>
            <button
              className="btn btn--danger-soft"
              disabled={deleting}
              onClick={() => onDelete(data.id)}
            >
              O'chirish
            </button>
          </>
        ) : undefined
      }
    >
      {isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : isLoading || !data ? (
        <>
          <Skeleton width="100%" height={80} />
          <Skeleton width="70%" />
          <Skeleton width="85%" />
        </>
      ) : (
        <>
          <div className="panel">
            <p className="section-title">E'lon</p>
            <div className="comment-listing">
              {data.listing?.thumbUrl ? (
                <img
                  className="comment-listing__thumb"
                  src={resolveMediaUrl(data.listing.thumbUrl)}
                  alt=""
                />
              ) : null}
              <div>
                <div className="cell-main">
                  {data.listing?.title ?? "Sarlavhasiz"}
                </div>
                <div className="muted">
                  {/* A comment outlives the advert it sat under. */}
                  {data.listing ? data.listing.id : "E'lon o'chirilgan"}
                </div>
              </div>
            </div>
          </div>

          <div className="panel">
            <p className="section-title">Suhbat</p>
            {data.thread.map((c) => (
              <div
                key={c.id}
                className={`thread-row${c.isSelected ? " thread-row--target" : ""}${
                  c.isReply ? " thread-row--reply" : ""
                }`}
              >
                <Avatar
                  name={c.author?.name ?? null}
                  surname={c.author?.surname ?? null}
                  photo={resolveMediaUrl(c.author?.avatarThumbUrl) || undefined}
                />
                <div className="thread-row__body">
                  <div className="thread-row__head">
                    <b>{c.author ? fullName(c.author) || "—" : "—"}</b>
                    <span className="muted">{time(c.createdAt)}</span>
                    {c.likeCount > 0 ? (
                      <span className="muted">· {c.likeCount} ♥</span>
                    ) : null}
                  </div>
                  {c.imageThumbUrl || c.imageUrl ? (
                    <img
                      className="comment-thumb"
                      src={resolveMediaUrl(c.imageThumbUrl ?? c.imageUrl)}
                      alt=""
                    />
                  ) : null}
                  {c.body ? <p className="thread-row__text">{c.body}</p> : null}
                </div>
              </div>
            ))}
          </div>

          {data.likedBy.length ? (
            <div className="panel">
              <p className="section-title">Yoqtirganlar · {data.likeCount}</p>
              <div className="liker-list">
                {data.likedBy.map((u) => (
                  <span key={u.id} className="liker">
                    <Avatar
                      name={u.name}
                      surname={u.surname}
                      photo={resolveMediaUrl(u.avatarThumbUrl) || undefined}
                    />
                    {fullName(u) || "—"}
                  </span>
                ))}
                {/* The endpoint caps the list; say so rather than implying
                    these are all of them. */}
                {data.likeCount > data.likedBy.length ? (
                  <Badge>
                    +{data.likeCount - data.likedBy.length}
                  </Badge>
                ) : null}
              </div>
            </div>
          ) : null}
        </>
      )}
    </Drawer>
  );
}
