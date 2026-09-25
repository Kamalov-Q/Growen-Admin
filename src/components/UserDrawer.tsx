import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { toast } from "../lib/toast";
import { adminApi, resolveMediaUrl } from "../lib/api";
import { dateTime, fullName } from "../lib/format";
import { Avatar, Badge, Drawer, ErrorState, Skeleton } from "./ui";
import { useT } from "../lib/i18n";

const PROVIDER_LABEL: Record<string, string> = {
  PHONE: "Telefon",
  GOOGLE: "Google",
  TELEGRAM: "Telegram",
};

/**
 * One person's record: who they are, how they sign in, what they have posted
 * and what has been said about them.
 *
 * Deliberately nothing private — no chat contents, no saved listings. A
 * moderator deciding whether to ban somebody needs their record, not their
 * correspondence, which is the same rule the chat endpoints enforce.
 */
export function UserDrawer({
  id,
  onClose,
}: {
  id: string | null;
  onClose: () => void;
}) {
  const t = useT();
  const navigate = useNavigate();

  /**
   * Opening a support thread with them. Created on the spot if they have
   * never written — a moderator who has just read somebody's record often
   * needs to ask them something, and waiting for the customer to write first
   * would be a strange rule.
   */
  const openThread = useMutation({
    mutationFn: (userId: string) => adminApi.supportThreadByUser(userId),
    onSuccess: (thread) => {
      onClose();
      // The support page reads this and opens the thread, so the moderator
      // lands in the conversation rather than on a queue they have to search.
      navigate(`/support?thread=${thread.id}`);
    },
    onError: (e) => toast.error(e),
  });

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["admin", "user", id],
    queryFn: () => adminApi.user(id!),
    enabled: !!id,
  });

  return (
    <Drawer
      open={!!id}
      title={data ? fullName(data) || t("Foydalanuvchi") : t("Foydalanuvchi")}
      subtitle={data?.phoneNumber ?? undefined}
      onClose={onClose}
      footer={
        data ? (
          <button
            className="btn btn--primary"
            disabled={openThread.isPending}
            onClick={() => openThread.mutate(data.id)}
          >
            {openThread.isPending ? "…" : `✉ ${t("Xabar yozish")}`}
          </button>
        ) : undefined
      }
    >
      {isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : isLoading || !data ? (
        <>
          <Skeleton width="100%" height={72} />
          <Skeleton width="70%" />
          <Skeleton width="85%" />
        </>
      ) : (
        <>
          <div className="panel user-head">
            <Avatar
              name={data.name}
              surname={data.surname}
              photo={resolveMediaUrl(data.avatarUrl)}
            />
            <div>
              <div className="cell-main">{fullName(data) || "—"}</div>
              <div className="muted">{data.email ?? data.phoneNumber ?? "—"}</div>
              <div className="user-head__tags">
                <Badge tone={data.role === "ADMIN" ? "accent" : "neutral"}>
                  {data.role}
                </Badge>
                <Badge tone={data.status === "BANNED" ? "danger" : "success"}>
                  <span className="badge--dot" />
                  {t(data.status === "BANNED" ? "Bloklangan" : "Faol")}
                </Badge>
                {data.isVerifiedRealtor ? (
                  <Badge tone="accent">{t("Rieltor")}</Badge>
                ) : null}
                {data.isOnline ? (
                  <Badge tone="success">{t("Onlayn")}</Badge>
                ) : null}
              </div>
            </div>
          </div>

          {/* The numbers first: they are what the drawer is opened for. */}
          <div className="panel">
            <p className="section-title">{t("E'lonlar")}</p>
            <div className="stat-grid">
              <Stat label={t("Jami")} value={data.listings.total} />
              <Stat label={t("Faol")} value={data.listings.active} />
              <Stat label={t("Qoralama")} value={data.listings.draft} />
              <Stat label={t("Arxiv")} value={data.listings.archived} />
              <Stat label={t("Ko'rishlar")} value={data.listings.views} />
            </div>
          </div>

          <div className="panel">
            <p className="section-title">{t("Faolligi")}</p>
            <div className="stat-grid">
              <Stat
                label={t("Sharhlar")}
                value={data.reviewsWritten.count}
                hint={
                  data.reviewsWritten.average
                    ? `★ ${data.reviewsWritten.average}`
                    : undefined
                }
              />
              <Stat label={t("Izohlar")} value={data.commentsWritten} />
              {/* Reports against them is the number that decides trust, so it
                  is the one that turns red. */}
              <Stat
                label={t("Shikoyatlar")}
                value={data.reports.against}
                tone={data.reports.against > 0 ? "danger" : undefined}
              />
              <Stat label={t("Yuborgan shikoyatlari")} value={data.reports.filed} />
            </div>
          </div>

          <div className="panel">
            <p className="section-title">{t("Ma'lumotlar")}</p>
            <dl className="kv">
              <dt>ID</dt>
              <dd>
                <code className="mono">{data.id}</code>
              </dd>
              <dt>{t("Kirish usullari")}</dt>
              <dd>
                {data.identities.length
                  ? data.identities
                      .map((i) => PROVIDER_LABEL[i.provider] ?? i.provider)
                      .join(", ")
                  : "—"}
              </dd>
              <dt>{t("Ro'yxatdan o'tgan")}</dt>
              <dd>{dateTime(data.createdAt)}</dd>
              <dt>{t("Oxirgi faollik")}</dt>
              <dd>
                {data.isOnline ? t("Onlayn") : dateTime(data.lastSeenAt)}
              </dd>
            </dl>
          </div>
        </>
      )}
    </Drawer>
  );
}

function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: number;
  hint?: string;
  tone?: "danger";
}) {
  return (
    <div className="stat">
      <span className={`stat__value${tone ? ` stat__value--${tone}` : ""}`}>
        {value.toLocaleString("ru-RU")}
      </span>
      <span className="stat__label muted">{label}</span>
      {hint ? <span className="stat__hint muted">{hint}</span> : null}
    </div>
  );
}
