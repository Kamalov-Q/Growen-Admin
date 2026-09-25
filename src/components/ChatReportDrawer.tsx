import { useQuery } from "@tanstack/react-query";
import { adminApi, resolveMediaUrl, type AdminChatMessage } from "../lib/api";
import { fullName } from "../lib/format";
import { Badge, Drawer, ErrorState, Skeleton } from "./ui";

const REASON_LABEL: Record<string, string> = {
  SPAM: "Spam / reklama",
  SCAM: "Firibgarlik",
  HARASSMENT: "Haqorat yoki tahdid",
  INAPPROPRIATE: "Nomaqbul kontent",
  OTHER: "Boshqa",
};

const time = (iso: string) =>
  new Date(iso).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

/**
 * The transcript of ONE reported conversation.
 *
 * Fetched by report id, never by conversation id — the API has no endpoint
 * that opens a chat, so this drawer cannot be pointed at a conversation
 * nobody reported.
 */
export function ChatReportDrawer({
  id,
  onClose,
  onSetStatus,
  pending,
}: {
  id: string | null;
  onClose: () => void;
  onSetStatus: (id: string, next: "RESOLVED" | "DISMISSED") => void;
  pending: boolean;
}) {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["admin", "chat-report", id],
    queryFn: () => adminApi.chatReport(id!),
    enabled: !!id,
  });

  const reporterId = data?.reporter?.id;
  const nameOf = (senderId: string) => {
    const c = data?.conversation;
    if (c?.host?.id === senderId) return fullName(c.host) || c.host.phoneNumber || "Host";
    if (c?.guest?.id === senderId) return fullName(c.guest) || c.guest.phoneNumber || "Guest";
    return "—";
  };

  return (
    <Drawer
      open={!!id}
      title="Yozishma"
      subtitle={
        data
          ? `${REASON_LABEL[data.reason] ?? data.reason} · ${data.messages.length} ta xabar`
          : undefined
      }
      onClose={onClose}
      footer={
        data && data.status === "OPEN" ? (
          <>
            <button
              className="btn btn--primary"
              disabled={pending}
              onClick={() => onSetStatus(data.id, "RESOLVED")}
            >
              Hal qilindi
            </button>
            <button
              className="btn btn--ghost"
              disabled={pending}
              onClick={() => onSetStatus(data.id, "DISMISSED")}
            >
              Rad etish
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
            <p className="section-title">Shikoyat</p>
            <dl className="kv">
              <dt>Sabab</dt>
              <dd>{REASON_LABEL[data.reason] ?? data.reason}</dd>
              {data.comment ? (
                <>
                  <dt>Izoh</dt>
                  <dd>{data.comment}</dd>
                </>
              ) : null}
              <dt>Shikoyatchi</dt>
              <dd>
                {data.reporter ? fullName(data.reporter) || "—" : "—"}
                {data.reporter?.phoneNumber ? (
                  <span className="muted"> · {data.reporter.phoneNumber}</span>
                ) : null}
              </dd>
              <dt>E'lon</dt>
              <dd>{data.conversation?.listing?.title ?? "—"}</dd>
              <dt>Yuborilgan</dt>
              <dd>{time(data.createdAt)}</dd>
            </dl>
          </div>

          {data.truncated ? (
            <p className="muted">
              Faqat oxirgi {data.messages.length} ta xabar ko'rsatilmoqda.
            </p>
          ) : null}

          <div className="panel">
            <p className="section-title">Yozishma</p>
            <div className="thread">
              {data.messages.map((m) => (
                <Bubble
                  key={m.id}
                  message={m}
                  // The reporter's own messages sit on the right, so "who said
                  // what" reads at a glance from the complainant's side.
                  mine={m.senderId === reporterId}
                  author={nameOf(m.senderId)}
                  flagged={m.id === data.reportedMessageId}
                />
              ))}
              {!data.messages.length ? <p className="muted">Xabarlar yo'q</p> : null}
            </div>
          </div>
        </>
      )}
    </Drawer>
  );
}

function Bubble({
  message: m,
  mine,
  author,
  flagged,
}: {
  message: AdminChatMessage;
  mine: boolean;
  author: string;
  flagged: boolean;
}) {
  return (
    <div className={`thread__row${mine ? " thread__row--mine" : ""}`}>
      <div className={`thread__bubble${flagged ? " thread__bubble--flagged" : ""}`}>
        <div className="thread__meta">
          <strong>{author}</strong>
          <span className="muted">{time(m.createdAt)}</span>
          {m.editedAt ? <span className="muted">· tahrirlangan</span> : null}
          {flagged ? <Badge tone="danger">shikoyat</Badge> : null}
        </div>

        {m.deletedAt ? (
          <p className="thread__deleted">Xabar o'chirilgan</p>
        ) : m.type === "IMAGE" && m.mediaUrl ? (
          <a href={resolveMediaUrl(m.mediaUrl)} target="_blank" rel="noreferrer">
            <img className="thread__img" src={resolveMediaUrl(m.thumbUrl ?? m.mediaUrl)} alt="" />
          </a>
        ) : m.type === "VOICE" && m.mediaUrl ? (
          <audio controls src={resolveMediaUrl(m.mediaUrl)} className="thread__audio" />
        ) : m.mediaUrl ? (
          <a className="link" href={resolveMediaUrl(m.mediaUrl)} target="_blank" rel="noreferrer">
            {m.fileName ?? "Fayl"} ↗
          </a>
        ) : null}

        {m.body ? <p className="thread__body">{m.body}</p> : null}
      </div>
    </div>
  );
}
