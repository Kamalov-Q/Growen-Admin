import { useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminApi, resolveMediaUrl, type AdminUserRow } from "../lib/api";
import { useSession } from "../lib/session";
import { date, fullName, useDebounced } from "../lib/format";
import { Avatar, Badge, EmptyState, ErrorState, Modal, Pager, PageHeader, Skeleton } from "../components/ui";
import { useT } from "../lib/i18n";
import { toast } from "../lib/toast";
import { usePaging } from "../lib/usePaging";
import { UserDrawer } from "../components/UserDrawer";

/** What the confirm dialog is being asked to do, and to whom. */
type PendingAction =
  | { kind: "ban"; user: AdminUserRow }
  | { kind: "unban"; user: AdminUserRow }
  | { kind: "revoke"; user: AdminUserRow };

/**
 * No "make admin" here on purpose: admin rights are granted on the server
 * (ADMIN_PHONES, or `npm run admin:grant`). A button that mints admins is a
 * standing target — one compromised admin session would be enough to keep
 * itself in. Taking rights away stays, since that must always be possible.
 */
const ACTION_COPY: Record<PendingAction["kind"], { title: string; confirm: string }> = {
  ban: { title: "Foydalanuvchini bloklash", confirm: "Bloklash" },
  unban: { title: "Blokdan chiqarish", confirm: "Faollashtirish" },
  revoke: { title: "Admin huquqini olish", confirm: "Olib tashlash" },
};

export function UsersPage() {
  const t = useT();
  const [q, setQ] = useState("");
  const { offset, setOffset, limit, setLimit } = usePaging();
  const [openUser, setOpenUser] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [banReason, setBanReason] = useState("");
  const search = useDebounced(q);
  const session = useSession();
  const queryClient = useQueryClient();

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["admin", "users", search, offset, limit],
    queryFn: () => adminApi.users({ q: search, limit, offset }),
    placeholderData: keepPreviousData,
  });

  const act = useMutation({
    mutationFn: (a: PendingAction) => {
      switch (a.kind) {
        case "ban":
          return adminApi.setUserStatus(a.user.id, {
            status: "BANNED",
            banReason: banReason.trim() || undefined,
          });
        case "unban":
          return adminApi.setUserStatus(a.user.id, { status: "ACTIVE" });
        case "revoke":
          return adminApi.setUserRole(a.user.id, { role: "USER" });
      }
    },
    onSuccess: (_row, a) => {
      toast.success(
        a.kind === "ban"
          ? "Foydalanuvchi bloklandi"
          : a.kind === "unban"
            ? "Foydalanuvchi faollashtirildi"
            : "Admin huquqi olindi",
      );
      setPending(null);
      setBanReason("");
      void queryClient.invalidateQueries({ queryKey: ["admin"] });
    },
    onError: (e) => toast.error(e),
  });

  return (
    <>
      <PageHeader title={t("Foydalanuvchilar")} subtitle={t("Eng yangisi birinchi")} />

      {isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : (
        <div className="card">
          <div className="card__toolbar">
            <span className="muted">
              {data ? `Jami ${data.total.toLocaleString("ru-RU")} ta` : " "}
            </span>
            <input
              className="input input--search"
              type="search"
              placeholder="Ism, telefon yoki email"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setOffset(0); // a new search starts from its own first page
              }}
            />
          </div>
          <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Foydalanuvchi</th>
                <th>Telefon</th>
                <th>Rol</th>
                <th>Holati</th>
                <th>Ro'yxatdan o'tgan</th>
                <th>Amallar</th>
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 6 }).map((__, c) => (
                        <td key={c}>
                          <Skeleton width="70%" />
                        </td>
                      ))}
                    </tr>
                  ))
                : data?.items.map((u) => {
                    const self = u.id === session?.user.id;
                    const banned = u.status === "BANNED";
                    return (
                      <tr key={u.id}>
                        <td>
                          <div className="person">
                            <Avatar
                              name={u.name}
                              surname={u.surname}
                              photo={resolveMediaUrl(u.avatarUrl)}
                            />
                            <div>
                              <div className="cell-main">{fullName(u) || "—"}</div>
                              <div className="muted">{u.email ?? ""}</div>
                            </div>
                          </div>
                        </td>
                        <td>{u.phoneNumber ?? "—"}</td>
                        <td>
                          <Badge tone={u.role === "ADMIN" ? "accent" : "neutral"}>{u.role}</Badge>
                        </td>
                        <td>
                          <Badge tone={banned ? "danger" : "success"}>
                            <span className="badge--dot" />
                            {banned ? "BLOKLANGAN" : "FAOL"}
                          </Badge>
                          {u.isOnline ? <Badge tone="success">onlayn</Badge> : null}
                          {u.isVerifiedRealtor ? <Badge tone="accent">rieltor</Badge> : null}
                        </td>
                        <td className="nowrap">{date(u.createdAt)}</td>
                        <td>
                          <div className="row-actions">
                            {/* Available for every row including your own:
                                looking at a record is not a moderation
                                action, and hiding it from yourself would
                                only make it harder to check the page works. */}
                            <button
                              className="icon-btn"
                              onClick={() => setOpenUser(u.id)}
                              aria-label={t("Ko'rish")}
                              title={t("Ko'rish")}
                            >
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z" />
                                <circle cx="12" cy="12" r="3" />
                              </svg>
                            </button>
                          </div>
                          {self ? (
                            <span className="muted">siz</span>
                          ) : (
                            <div className="row-actions">
                              {u.role === "ADMIN" ? (
                                <button
                                  className="btn btn--ghost btn--sm"
                                  onClick={() => setPending({ kind: "revoke", user: u })}
                                >
                                  Adminlikdan olish
                                </button>
                              ) : (
                                <>
                                  {banned ? (
                                    <button
                                      className="btn btn--ghost btn--sm"
                                      onClick={() => setPending({ kind: "unban", user: u })}
                                    >
                                      Blokdan chiqarish
                                    </button>
                                  ) : (
                                    <button
                                      className="btn btn--danger btn--sm"
                                      onClick={() => setPending({ kind: "ban", user: u })}
                                    >
                                      Bloklash
                                    </button>
                                  )}
                                </>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
            </tbody>
          </table>
          </div>

          {!isLoading && !data?.items.length ? (
            <EmptyState
              title="Hech narsa topilmadi"
              hint={search ? "Boshqa so'rov bilan urinib ko'ring." : undefined}
            />
          ) : null}

          <Pager offset={offset} limit={limit} total={data?.total ?? 0} onChange={setOffset}
            onLimitChange={setLimit}
          />
        </div>
      )}

      <Modal
        open={!!pending}
        title={pending ? ACTION_COPY[pending.kind].title : ""}
        onClose={() => {
          setPending(null);
          setBanReason("");
        }}
        footer={
          <>
            <button
              className="btn btn--ghost"
              onClick={() => {
                setPending(null);
                setBanReason("");
              }}
            >
              Bekor qilish
            </button>
            <button
              className={`btn ${pending?.kind === "ban" ? "btn--danger" : "btn--primary"}`}
              disabled={act.isPending}
              onClick={() => pending && act.mutate(pending)}
            >
              {act.isPending ? "..." : pending ? ACTION_COPY[pending.kind].confirm : ""}
            </button>
          </>
        }
      >
        {pending ? (
          <>
            <p style={{ margin: 0 }}>
              <strong>{fullName(pending.user) || pending.user.phoneNumber}</strong>
              {pending.kind === "ban"
                ? " ilovaga kira olmaydigan bo'ladi va barcha sessiyalari yopiladi."
                : pending.kind === "unban"
                  ? " yana ilovaga kira oladigan bo'ladi."
                  : " endi boshqaruv paneliga kira olmaydi."}
            </p>
            {pending.kind === "ban" ? (
              <label className="field">
                <span className="field__label">Sabab (ixtiyoriy)</span>
                <input
                  className="input"
                  value={banReason}
                  maxLength={300}
                  placeholder="Masalan: soxta e'lonlar"
                  onChange={(e) => setBanReason(e.target.value)}
                />
              </label>
            ) : null}
          </>
        ) : null}
      </Modal>

      <UserDrawer id={openUser} onClose={() => setOpenUser(null)} />
    </>
  );
}
