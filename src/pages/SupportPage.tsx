import { useEffect, useRef, useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminApi, resolveMediaUrl, type AdminSupportMessage } from "../lib/api";
import { dateTime, fullName } from "../lib/format";
import { Avatar, Badge, EmptyState, ErrorState, Pager, PageHeader, Skeleton } from "../components/ui";
import { toast } from "../lib/toast";
import { usePaging } from "../lib/usePaging";
import { useT, useLang } from "../lib/i18n";
import { getSupportSocket } from "../lib/support-socket";
import { VoicePlayer } from "../components/VoicePlayer";

const STATUSES = ["OPEN", "CLOSED", ""] as const;

export function SupportPage() {
  const t = useT();
  // Subscribed so the table re-renders (and re-formats its dates) when the
  // language changes; the formatter reads the language itself.
  useLang();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<string>("OPEN");
  const { offset, setOffset, limit, setLimit } = usePaging();
  const [openId, setOpenId] = useState<string | null>(null);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["admin", "support", status, offset, limit],
    queryFn: () => adminApi.supportThreads({ status, limit, offset }),
    placeholderData: keepPreviousData,
  });

  // A customer writing while the queue is open should appear in it, not on
  // the next manual refresh.
  useEffect(() => {
    const socket = getSupportSocket();
    const refresh = () =>
      void queryClient.invalidateQueries({ queryKey: ["admin", "support"] });

    socket.on("support:message", refresh);
    socket.on("support:thread", refresh);
    return () => {
      socket.off("support:message", refresh);
      socket.off("support:thread", refresh);
    };
  }, [queryClient]);

  const time = dateTime;

  return (
    <>
      <PageHeader
        title={t("Yordam")}
        subtitle={t("Foydalanuvchilar bilan to'g'ridan-to'g'ri yozishma")}
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
                  {t(s === "OPEN" ? "Ochiq" : s === "CLOSED" ? "Yopilgan" : "Barchasi")}
                </button>
              ))}
            </div>
            <span className="muted">
              {data ? `${t("Jami")} ${data.total.toLocaleString("ru-RU")}` : " "}
            </span>
          </div>

          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{t("Foydalanuvchi")}</th>
                  <th>{t("Oxirgi xabar")}</th>
                  <th>{t("Vaqt")}</th>
                  <th>{t("Holati")}</th>
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
                  : data?.items.map((thread) => (
                      <tr
                        key={thread.id}
                        className="row--click"
                        onClick={() => setOpenId(thread.id)}
                      >
                        <td>
                          <div className="support-user">
                            <Avatar
                              name={thread.user?.name ?? null}
                              surname={thread.user?.surname ?? null}
                              photo={resolveMediaUrl(thread.user?.avatarThumbUrl) || undefined}
                            />
                            <div>
                              <div className="cell-main">
                                {thread.user ? fullName(thread.user) || "—" : "—"}
                              </div>
                              <div className="muted">
                                {thread.user?.phoneNumber ?? ""}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td>
                          <div className="report-comment">
                            {thread.lastMessage || "—"}
                          </div>
                        </td>
                        <td className="muted">{time(thread.lastMessageAt)}</td>
                        <td>
                          {/* Unanswered is the state that matters; the
                              open/closed flag is secondary to it. */}
                          {thread.adminUnread > 0 ? (
                            <Badge tone="danger">
                              {t("Javob kutilmoqda")} · {thread.adminUnread}
                            </Badge>
                          ) : (
                            <Badge tone={thread.status === "OPEN" ? "neutral" : "success"}>
                              {t(thread.status === "OPEN" ? "Ochiq" : "Yopilgan")}
                            </Badge>
                          )}
                        </td>
                        <td>
                          <div className="row-actions" style={{ justifyContent: "flex-end" }}>
                            <button className="btn btn--ghost btn--sm">
                              {t("Ochish")} ›
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>

          {!isLoading && !data?.items.length ? (
            <EmptyState title={t("Murojaatlar yo'q")} />
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

      <SupportDrawer id={openId} onClose={() => setOpenId(null)} />
    </>
  );
}

/** One thread, with the reply box. Kept in this file because it is the only
 *  thing that uses it and it is half the page's behaviour. */
function SupportDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const t = useT();
  useLang();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState("");
  // Which message's "…" menu is open, and which one the reply answers.
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<AdminSupportMessage | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["admin", "support", "thread", id],
    queryFn: () => adminApi.supportThread(id!),
    enabled: !!id,
  });

  // Opening a thread is reading it.
  useEffect(() => {
    if (!id) return;
    void adminApi
      .supportMarkRead(id)
      .then(() => queryClient.invalidateQueries({ queryKey: ["admin", "support"] }))
      .catch(() => {});
  }, [id, queryClient]);

  // Live: a customer replying while the drawer is open should appear in it.
  useEffect(() => {
    if (!id) return;
    const socket = getSupportSocket();
    const onMessage = () =>
      void queryClient.invalidateQueries({
        queryKey: ["admin", "support", "thread", id],
      });
    socket.on("support:message", onMessage);
    return () => {
      socket.off("support:message", onMessage);
    };
  }, [id, queryClient]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [data?.messages.length]);

  const send = useMutation({
    mutationFn: (body: string) =>
      adminApi.supportSend(id!, body, { replyToId: replyTo?.id }),
    onSuccess: () => {
      setDraft("");
      setReplyTo(null);
      void queryClient.invalidateQueries({ queryKey: ["admin", "support"] });
    },
    onError: (e) => toast.error(e),
  });

  const pin = useMutation({
    mutationFn: (messageId: string | null) => adminApi.supportPin(id!, messageId),
    onSuccess: () => {
      setMenuFor(null);
      void queryClient.invalidateQueries({ queryKey: ["admin", "support"] });
    },
    onError: (e) => toast.error(e),
  });

  const setStatus = useMutation({
    mutationFn: (next: "OPEN" | "CLOSED") => adminApi.supportSetStatus(id!, next),
    onSuccess: (_d, next) => {
      toast.success(next === "CLOSED" ? "Murojaat yopildi" : "Murojaat ochildi");
      void queryClient.invalidateQueries({ queryKey: ["admin", "support"] });
    },
    onError: (e) => toast.error(e),
  });

  if (!id) return null;

  const time = dateTime;

  return (
    <div className="overlay overlay--right" onClick={onClose}>
      <aside className="drawer" onClick={(e) => e.stopPropagation()}>
        <header className="drawer__head">
          <div className="drawer__headings">
            <h2>{data?.user ? fullName(data.user) || "—" : t("Yordam")}</h2>
            <p className="muted">{data?.user?.phoneNumber ?? ""}</p>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label={t("Yopish")}>
            ✕
          </button>
        </header>

        <div className="drawer__body support-thread">
          {isError ? (
            <ErrorState error={error} onRetry={() => void refetch()} />
          ) : isLoading || !data ? (
            <Skeleton width="100%" height={120} />
          ) : (
            <>
              {data.messages.map((m) => (
                <div
                  key={m.id}
                  className={`support-msg${m.fromAdmin ? " support-msg--admin" : ""}${
                    m.id === data.pinnedMessageId ? " support-msg--pinned" : ""
                  }`}
                >
                  {m.id === data.pinnedMessageId ? (
                    <span className="support-msg__pin muted">📌 {t("Qadalgan")}</span>
                  ) : null}

                  {/* The quoted line, so an answer reads without scrolling. */}
                  {m.replyToId ? (
                    <span className="support-msg__quote muted">
                      {data.messages.find((q) => q.id === m.replyToId)?.body ??
                        t("Xabar")}
                    </span>
                  ) : null}
                  {/* Forwarded out of a chat — whose words these were.
                      Without it a screenshot of someone else's threat reads
                      as the customer's own message. */}
                  {m.forwardedFromName ? (
                    <span className="support-msg__fwd muted">
                      ↪ {m.forwardedFromName}
                    </span>
                  ) : null}

                  {m.imageThumbUrl || m.imageUrl ? (
                    <a
                      href={resolveMediaUrl(m.imageUrl ?? m.imageThumbUrl)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <img
                        className="support-msg__img"
                        src={resolveMediaUrl(m.imageThumbUrl ?? m.imageUrl)}
                        alt=""
                      />
                    </a>
                  ) : null}
                  {/* A voice note plays here, with its real waveform: the
                      question is often "how did they say it", and a link to
                      a .m4a answers none of it. Video and files still open
                      out — the browser is better at those than we would be. */}
                  {m.mediaUrl && m.type === "VOICE" ? (
                    <VoicePlayer
                      url={resolveMediaUrl(m.mediaUrl)!}
                      durationSec={m.durationSec}
                      waveform={m.waveform}
                    />
                  ) : m.mediaUrl ? (
                    <a
                      className="support-msg__file"
                      href={resolveMediaUrl(m.mediaUrl)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {m.type === "VOICE" ? "🎤" : m.type.startsWith("VIDEO") ? "🎬" : "📎"}{" "}
                      {m.fileName ?? m.type}
                      {m.durationSec ? ` · ${m.durationSec}s` : ""}
                    </a>
                  ) : null}

                  {m.body ? <p className="support-msg__text">{m.body}</p> : null}
                  <span className="support-msg__foot">
                    <span className="support-msg__time muted">
                      {time(m.createdAt)}
                    </span>
                    <button
                      className="support-msg__more"
                      onClick={() => setMenuFor(menuFor === m.id ? null : m.id)}
                      aria-label={t("Yana")}
                      aria-expanded={menuFor === m.id}
                    >
                      ⋯
                    </button>
                  </span>

                  {menuFor === m.id ? (
                    <span className="support-msg__menu">
                      <button
                        onClick={() => {
                          setReplyTo(m);
                          setMenuFor(null);
                        }}
                      >
                        {t("Javob berish")}
                      </button>
                      <button
                        disabled={pin.isPending}
                        onClick={() =>
                          pin.mutate(
                            data.pinnedMessageId === m.id ? null : m.id,
                          )
                        }
                      >
                        {t(
                          data.pinnedMessageId === m.id
                            ? "Qadalganni olib tashlash"
                            : "Qadab qo'yish",
                        )}
                      </button>
                    </span>
                  ) : null}
                </div>
              ))}
              <div ref={endRef} />
            </>
          )}
        </div>

        <footer className="drawer__foot support-foot">
          {replyTo ? (
            <div className="support-reply">
              <span className="support-reply__text">
                {replyTo.body || t("Xabar")}
              </span>
              <button
                className="icon-btn"
                onClick={() => setReplyTo(null)}
                aria-label={t("Bekor qilish")}
              >
                ✕
              </button>
            </div>
          ) : null}

          <textarea
            className="input support-input"
            rows={2}
            value={draft}
            placeholder={t("Javob yozing…")}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              // Enter sends, Shift+Enter breaks the line — the convention in
              // every messenger, and support replies are usually one line.
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (draft.trim()) send.mutate(draft.trim());
              }
            }}
          />
          <div className="support-foot__actions">
            <button
              className="btn btn--primary"
              disabled={!draft.trim() || send.isPending}
              onClick={() => send.mutate(draft.trim())}
            >
              {t("Yuborish")}
            </button>
            <button
              className="btn btn--ghost"
              disabled={setStatus.isPending}
              onClick={() =>
                setStatus.mutate(data?.status === "CLOSED" ? "OPEN" : "CLOSED")
              }
            >
              {t(data?.status === "CLOSED" ? "Qayta ochish" : "Yopish")}
            </button>
          </div>
        </footer>
      </aside>
    </div>
  );
}
