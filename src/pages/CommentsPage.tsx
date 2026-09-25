import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { adminApi, resolveMediaUrl, type AdminComment } from "../lib/api";
import { date, fullName } from "../lib/format";
import { Badge, EmptyState, ErrorState, Pager, PageHeader, Skeleton } from "../components/ui";
import { useT } from "../lib/i18n";
import { toast } from "../lib/toast";
import { usePaging } from "../lib/usePaging";
import { ListingDrawer } from "../components/ListingDrawer";
import { CommentDrawer } from "../components/CommentDrawer";

export function CommentsPage() {
  const t = useT();
  const queryClient = useQueryClient();
  const { offset, setOffset, limit, setLimit } = usePaging();
  const [openListing, setOpenListing] = useState<string | null>(null);
  const [openComment, setOpenComment] = useState<string | null>(null);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["admin", "comments", offset, limit],
    queryFn: () => adminApi.comments({ limit, offset }),
    placeholderData: keepPreviousData,
  });

  const remove = useMutation({
    mutationFn: (id: string) => adminApi.deleteComment(id),
    onSuccess: () => {
      toast.success("Izoh o'chirildi");
      // The drawer is showing a comment that no longer exists.
      setOpenComment(null);
      void queryClient.invalidateQueries({ queryKey: ["admin"] });
    },
    onError: (e) => toast.error(e),
  });

  const onDelete = (c: AdminComment) => {
    // Deleting a top-level comment takes its replies too, so the warning has
    // to say so — the row on screen is not the whole of what disappears.
    const extra =
      !c.isReply && c.replyCount > 0
        ? ` Unga berilgan ${c.replyCount} ta javob ham o'chiriladi.`
        : "";
    if (!confirm(`Bu izoh o'chirilsinmi?${extra} Buni qaytarib bo'lmaydi.`)) {
      return;
    }
    remove.mutate(c.id);
  };

  return (
    <>
      <PageHeader
        title={t("Izohlar")}
        subtitle={t("E'lonlar ostidagi savol-javoblar")}
      />

      {isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : (
        <div className="card">
          <div className="card__toolbar">
            <span className="muted">
              {data ? `Jami ${data.total.toLocaleString("ru-RU")} ta` : " "}
            </span>
          </div>

          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>E'lon</th>
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
                        {Array.from({ length: 5 }).map((__, c) => (
                          <td key={c}>
                            <Skeleton width="70%" />
                          </td>
                        ))}
                      </tr>
                    ))
                  : data?.items.map((c) => (
                      <tr
                        key={c.id}
                        className="row--click"
                        onClick={() => setOpenComment(c.id)}
                      >
                        <td onClick={(e) => e.stopPropagation()}>
                          <button
                            className="link-cell"
                            onClick={() => setOpenListing(c.listingId)}
                          >
                            {c.listingTitle ?? "Sarlavhasiz"}
                          </button>
                        </td>
                        <td>
                          {/* A comment can be a photo with nothing said, so
                              the thumbnail is content here, not decoration. */}
                          {c.imageThumbUrl || c.imageUrl ? (
                            <img
                              className="comment-thumb"
                              src={resolveMediaUrl(c.imageThumbUrl ?? c.imageUrl)}
                              alt=""
                            />
                          ) : null}
                          {c.body ? (
                            <div className="report-comment">“{c.body}”</div>
                          ) : null}
                          <div className="muted">
                            {c.isReply ? (
                              <Badge>Javob</Badge>
                            ) : c.replyCount > 0 ? (
                              <Badge tone="neutral">{c.replyCount} javob</Badge>
                            ) : null}
                            {c.likeCount > 0 ? ` · ${c.likeCount} ♥` : ""}
                          </div>
                        </td>
                        <td>{c.author ? fullName(c.author) || "—" : "—"}</td>
                        <td className="muted">{date(c.createdAt)}</td>
                        <td onClick={(e) => e.stopPropagation()}>
                          <div className="row-actions" style={{ justifyContent: "flex-end" }}>
                            <button
                              className="btn btn--danger-soft btn--sm"
                              disabled={remove.isPending}
                              onClick={() => onDelete(c)}
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
            <EmptyState title="Izohlar yo'q" />
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

      <CommentDrawer
        id={openComment}
        onClose={() => setOpenComment(null)}
        onOpenListing={(listingId) => {
          setOpenComment(null);
          setOpenListing(listingId);
        }}
        onDelete={(commentId) => {
          const row = data?.items.find((c) => c.id === commentId);
          if (row) onDelete(row);
        }}
        deleting={remove.isPending}
      />

      <ListingDrawer id={openListing} onClose={() => setOpenListing(null)} />
    </>
  );
}
