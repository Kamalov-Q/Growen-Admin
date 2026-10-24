import { useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  adminApi,
  type AdminAdjustmentRow,
  type AdminPaymentRow,
  type AdminWalletRow,
  type PaymentProvider,
} from "../lib/api";
import { date, dateTime } from "../lib/format";
import {
  Badge,
  EmptyState,
  ErrorState,
  Modal,
  Pager,
  PageHeader,
  Skeleton,
} from "../components/ui";
import { useT } from "../lib/i18n";
import { toast } from "../lib/toast";
import { usePaging } from "../lib/usePaging";
import { UserDrawer } from "../components/UserDrawer";

const PAYMENT_STATUSES: { id: string; label: string }[] = [
  { id: "", label: "Barchasi" },
  { id: "PAID", label: "To'langan" },
  { id: "PREPARED", label: "Jarayonda" },
  { id: "CREATED", label: "Yaratilgan" },
  { id: "CANCELLED", label: "Bekor qilingan" },
];

const PROVIDERS: { id: string; label: string; color: string }[] = [
  { id: "", label: "Barcha tizimlar", color: "inherit" },
  { id: "CLICK", label: "Click", color: "#0073FF" },
  { id: "PAYME", label: "Payme", color: "#00BBC7" },
  { id: "PAYNET", label: "Paynet", color: "#00A859" },
];

const STATUS_TONE: Record<string, "success" | "warning" | "neutral" | "danger"> = {
  PAID: "success",
  PREPARED: "warning",
  CREATED: "neutral",
  CANCELLED: "danger",
};

/** Epoch milliseconds, as the payment providers send them. */
const providerTime = (ms: string | null) =>
  ms ? new Date(Number(ms)).toLocaleString("ru-RU") : "—";

/**
 * The half of a payment the table cannot show.
 *
 * Fetched per modal rather than per row: `providerPayload` and
 * `fiscalResponse` are jsonb, and pulling twenty of them to render one would
 * be wasteful. The ledger comes first because it answers the question that
 * actually brings somebody to this screen — the status says PAID, so did the
 * money reach the wallet?
 */
function PaymentExtras({ id }: { id: string }) {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["admin", "payment", id],
    queryFn: () => adminApi.payment(id),
  });

  if (isLoading) return <Skeleton width="100%" height={120} />;
  if (isError || !data)
    return <ErrorState error={error} onRetry={() => void refetch()} />;

  const expected = Number(data.amount) + Number(data.bonusAmount ?? 0);
  const credited = Number(data.credited);
  // Only meaningful once the payment is supposed to have moved money.
  const mismatch = data.status === "PAID" && credited !== expected;

  return (
    <>
      <p className="section-title" style={{ marginTop: 18 }}>
        Hisobga tushgani
      </p>

      {mismatch ? (
        <p className="alert" role="alert">
          To'lov PAID, lekin hisobga {soms(credited)} tushgan — kutilgani{" "}
          {soms(expected)}.
        </p>
      ) : null}

      {data.ledger.length === 0 ? (
        <p className="muted">
          {data.status === "PAID"
            ? "Hisobga hech narsa tushmagan — bu xato."
            : "Hali hisobga tushmagan."}
        </p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Turi</th>
              <th>Summa</th>
              <th>Keyingi balans</th>
              <th>Vaqti</th>
            </tr>
          </thead>
          <tbody>
            {data.ledger.map((row) => (
              <tr key={row.id}>
                <td>{row.kind}</td>
                <td>{soms(row.amount)}</td>
                <td>{soms(row.balanceAfter)}</td>
                <td>{dateTime(row.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <p className="section-title" style={{ marginTop: 18 }}>
        Qo'shimcha ma'lumot
      </p>
      <div className="form-grid">
        <div className="field">
          <span className="field__label">Idempotentlik kaliti (clientId)</span>
          <div className="input mono">{data.clientId ?? "—"}</div>
        </div>
        <div className="field">
          <span className="field__label">Provider hujjat ID</span>
          <div className="input mono">{data.providerDocId ?? "—"}</div>
        </div>

        <div className="field">
          <span className="field__label">Provider: yaratildi</span>
          <div className="cell-main">{providerTime(data.providerCreateTime)}</div>
        </div>
        <div className="field">
          <span className="field__label">Provider: bajarildi</span>
          <div className="cell-main">{providerTime(data.providerPerformTime)}</div>
        </div>

        <div className="field">
          <span className="field__label">Provider: bekor qilindi</span>
          <div className="cell-main">{providerTime(data.providerCancelTime)}</div>
        </div>
        <div className="field">
          <span className="field__label">Bekor qilingan vaqt</span>
          <div className="cell-main">{dateTime(data.cancelledAt)}</div>
        </div>

        <div className="field">
          <span className="field__label">Fiskal urinishlar</span>
          <div className="cell-main">{data.fiscalAttempts}</div>
        </div>
        <div className="field">
          <span className="field__label">Oxirgi o'zgarish</span>
          <div className="cell-main">{dateTime(data.updatedAt)}</div>
        </div>
      </div>

      {/* Raw, and collapsed: the definitive record of what the provider
          actually sent, for the cases the fields above cannot explain. */}
      {data.fiscalResponse ? (
        <details className="payment-raw">
          <summary>Fiskal javobi (xom)</summary>
          <pre className="mono">{JSON.stringify(data.fiscalResponse, null, 2)}</pre>
        </details>
      ) : null}
      {data.providerPayload ? (
        <details className="payment-raw">
          <summary>Provider javobi (xom)</summary>
          <pre className="mono">{JSON.stringify(data.providerPayload, null, 2)}</pre>
        </details>
      ) : null}
    </>
  );
}

const soms = (value: string | number) =>
  `${Number(value || 0).toLocaleString("ru-RU")} so'm`;

/** A signed amount, so a debit reads as one at a glance. */
const signedSoms = (value: string | number) => {
  const n = Number(value || 0);
  return `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toLocaleString("ru-RU")} so'm`;
};

/** Whatever we know this person by, in the order a human would pick. */
const personTitle = (p: {
  userId: string;
  userName: string | null;
  userSurname: string | null;
  userPhone: string | null;
}) =>
  [p.userName, p.userSurname].filter(Boolean).join(" ") ||
  p.userPhone ||
  p.userId.slice(0, 8);

export function BillingPage() {
  const t = useT();
  const [activeTab, setActiveTab] = useState<"payments" | "wallets" | "adjustments">(
    "payments",
  );
  const [openUser, setOpenUser] = useState<string | null>(null);
  /**
   * Set when the history was opened from one wallet's "Tarix" button, so the
   * audit tab starts scoped to that person. Cleared by the chip it renders —
   * the tab is also a standalone view of every adjustment.
   */
  const [auditUser, setAuditUser] = useState<{ id: string; label: string } | null>(
    null,
  );

  return (
    <>
      <PageHeader
        title={t("To'lovlar va Hamyonlar")}
        subtitle={t("Click, Payme, Paynet to'lovlari jurnali va foydalanuvchilar balanslari")}
      />

      <div className="section-gap">
        <div className="segmented" style={{ width: "fit-content" }}>
          <button
            className={`segmented__btn${activeTab === "payments" ? " segmented__btn--active" : ""}`}
            onClick={() => setActiveTab("payments")}
          >
            {t("To'lovlar jurnali")}
          </button>
          <button
            className={`segmented__btn${activeTab === "wallets" ? " segmented__btn--active" : ""}`}
            onClick={() => setActiveTab("wallets")}
          >
            {t("Foydalanuvchi hamyonlari")}
          </button>
          <button
            className={`segmented__btn${activeTab === "adjustments" ? " segmented__btn--active" : ""}`}
            onClick={() => {
              setAuditUser(null);
              setActiveTab("adjustments");
            }}
          >
            {t("Qo'lda o'zgartirishlar")}
          </button>
        </div>

        {activeTab === "payments" ? (
          <PaymentsLedger onOpenUser={setOpenUser} />
        ) : activeTab === "wallets" ? (
          <WalletsLedger
            onOpenUser={setOpenUser}
            onOpenHistory={(w) => {
              setAuditUser({ id: w.userId, label: personTitle(w) });
              setActiveTab("adjustments");
            }}
          />
        ) : (
          <AdjustmentsLedger
            user={auditUser}
            onClearUser={() => setAuditUser(null)}
            onOpenUser={setOpenUser}
          />
        )}
      </div>

      <UserDrawer id={openUser} onClose={() => setOpenUser(null)} />
    </>
  );
}

// ─── PAYMENTS LEDGER ──────────────────────────────────────────────────────────

function PaymentsLedger({ onOpenUser }: { onOpenUser: (id: string) => void }) {
  const t = useT();
  const [status, setStatus] = useState<string>("");
  const [provider, setProvider] = useState<string>("");
  const { offset, setOffset, limit, setLimit } = usePaging();
  const [inspecting, setInspecting] = useState<AdminPaymentRow | null>(null);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["admin", "payments", status, provider, offset, limit],
    queryFn: () =>
      adminApi.payments({
        status: status || undefined,
        provider: provider || undefined,
        limit,
        offset,
      }),
    placeholderData: keepPreviousData,
  });

  return (
    <>
      {isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : (
        <div className="card">
          <div
            className="card__toolbar"
            style={{ flexWrap: "wrap", gap: 12, justifyContent: "space-between" }}
          >
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
              {/* Status filter tabs */}
              <div className="segmented">
                {PAYMENT_STATUSES.map((s) => (
                  <button
                    key={s.id || "all"}
                    className={`segmented__btn${status === s.id ? " segmented__btn--active" : ""}`}
                    onClick={() => {
                      setStatus(s.id);
                      setOffset(0);
                    }}
                  >
                    {t(s.label)}
                  </button>
                ))}
              </div>

              {/* Provider filter dropdown */}
              <select
                className="input"
                style={{ width: "auto", minWidth: 150, padding: "5px 10px" }}
                value={provider}
                onChange={(e) => {
                  setProvider(e.target.value);
                  setOffset(0);
                }}
              >
                {PROVIDERS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>

            <span className="muted">
              {data ? `Jami ${data.total.toLocaleString("ru-RU")} ta to'lov` : " "}
            </span>
          </div>

          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Foydalanuvchi</th>
                  <th>Tizim</th>
                  <th>Summa</th>
                  <th>Holati</th>
                  <th>Tranzaksiya ID</th>
                  <th>Sana</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {isLoading
                  ? Array.from({ length: 6 }).map((_, i) => (
                      <tr key={i}>
                        {Array.from({ length: 7 }).map((__, c) => (
                          <td key={c}>
                            <Skeleton width="75%" />
                          </td>
                        ))}
                      </tr>
                    ))
                  : data?.items.map((r) => {
                      const userTitle =
                        [r.userName, r.userSurname].filter(Boolean).join(" ") ||
                        r.userPhone ||
                        r.userId.slice(0, 8);
                      const hasBonus = r.bonusAmount && Number(r.bonusAmount) > 0;

                      return (
                        <tr key={r.id}>
                          <td>
                            <button
                              className="person-link"
                              onClick={() => onOpenUser(r.userId)}
                            >
                              <div>
                                <div className="cell-main">{userTitle}</div>
                                <div className="muted">{r.userPhone ?? r.userId.slice(0, 8)}</div>
                              </div>
                            </button>
                          </td>
                          <td>
                            <ProviderBadge provider={r.provider} />
                          </td>
                          <td>
                            <div className="cell-main" style={{ fontWeight: 600 }}>
                              {soms(r.amount)}
                            </div>
                            {hasBonus ? (
                              <span className="muted" style={{ fontSize: 12, color: "#10B981" }}>
                                +{soms(r.bonusAmount!)} bonus
                              </span>
                            ) : null}
                          </td>
                          <td>
                            <Badge tone={STATUS_TONE[r.status] ?? "neutral"}>
                              <span className="badge--dot" />
                              {r.status}
                            </Badge>
                          </td>
                          <td>
                            <span className="mono" style={{ fontSize: 13 }}>
                              {r.providerTxnId || r.prepareId || "—"}
                            </span>
                            {r.fiscalStatus && r.fiscalStatus !== "NONE" ? (
                              <div className="muted" style={{ fontSize: 11 }}>
                                Fiskal: {r.fiscalStatus}
                              </div>
                            ) : null}
                          </td>
                          <td className="muted nowrap">
                            <div>{date(r.createdAt)}</div>
                            <div style={{ fontSize: 11.5 }}>
                              {r.paidAt ? `To'langan: ${dateTime(r.paidAt)}` : dateTime(r.createdAt)}
                            </div>
                          </td>
                          <td>
                            <div className="row-actions" style={{ justifyContent: "flex-end" }}>
                              <button
                                className="btn btn--ghost btn--sm"
                                onClick={() => setInspecting(r)}
                              >
                                {t("Batafsil")}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
              </tbody>
            </table>
          </div>

          {!isLoading && !data?.items.length ? (
            <EmptyState
              title={status || provider ? "To'lovlar topilmadi" : "Hali to'lovlar mavjud emas"}
              hint={status || provider ? "Boshqa filtrlarni tanlab ko'ring." : undefined}
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

      {/* Transaction Details Modal */}
      {inspecting ? (
        <Modal
          open
          title={`To'lov tafsilotlari: #${inspecting.id.slice(0, 8)}`}
          onClose={() => setInspecting(null)}
          footer={
            <button className="btn btn--ghost" onClick={() => setInspecting(null)}>
              {t("Yopish")}
            </button>
          }
        >
          <div className="form-grid">
            <div className="field">
              <span className="field__label">To'lov ID</span>
              <div className="input mono" style={{ userSelect: "all" }}>
                {inspecting.id}
              </div>
            </div>
            <div className="field">
              <span className="field__label">Foydalanuvchi ID</span>
              <div className="input mono" style={{ userSelect: "all" }}>
                {inspecting.userId}
              </div>
            </div>

            <div className="field">
              <span className="field__label">To'lov tizimi</span>
              <div>
                <ProviderBadge provider={inspecting.provider} />
              </div>
            </div>
            <div className="field">
              <span className="field__label">Holati</span>
              <div>
                <Badge tone={STATUS_TONE[inspecting.status] ?? "neutral"}>
                  <span className="badge--dot" />
                  {inspecting.status}
                </Badge>
              </div>
            </div>

            <div className="field">
              <span className="field__label">Asosiy summa</span>
              <div className="cell-main" style={{ fontSize: 16, fontWeight: 600 }}>
                {soms(inspecting.amount)}
              </div>
            </div>
            <div className="field">
              <span className="field__label">Bonus summa</span>
              <div className="cell-main" style={{ fontSize: 16 }}>
                {inspecting.bonusAmount ? soms(inspecting.bonusAmount) : "0 so'm"}
              </div>
            </div>

            <div className="field">
              <span className="field__label">Provider Prepare ID</span>
              <div className="input mono">{inspecting.prepareId || "—"}</div>
            </div>
            <div className="field">
              <span className="field__label">Provider Tranzaksiya ID</span>
              <div className="input mono">{inspecting.providerTxnId || "—"}</div>
            </div>

            <div className="field">
              <span className="field__label">Fiskal holati</span>
              <div className="cell-main">{inspecting.fiscalStatus || "NONE"}</div>
            </div>
            <div className="field">
              <span className="field__label">Fiskal yuborilgan vaqt</span>
              <div className="cell-main">{dateTime(inspecting.fiscalSentAt)}</div>
            </div>

            <div className="field">
              <span className="field__label">Yaratilgan vaqt</span>
              <div className="cell-main">{dateTime(inspecting.createdAt)}</div>
            </div>
            <div className="field">
              <span className="field__label">To'langan vaqt</span>
              <div className="cell-main">{dateTime(inspecting.paidAt)}</div>
            </div>

            {inspecting.cancelReason ? (
              <div className="field field--wide">
                <span className="field__label" style={{ color: "#EF4444" }}>
                  Bekor qilish sababi
                </span>
                <div className="input" style={{ borderColor: "#FCA5A5", color: "#DC2626" }}>
                  {inspecting.cancelReason}
                </div>
              </div>
            ) : null}

            {inspecting.providerError ? (
              <div className="field field--wide">
                <span className="field__label" style={{ color: "#EF4444" }}>
                  Tizim xatoligi (Provider Error)
                </span>
                <div className="input mono" style={{ borderColor: "#FCA5A5", color: "#DC2626" }}>
                  {inspecting.providerError}
                </div>
              </div>
            ) : null}
          </div>

          {/* Everything the table does not carry, fetched when the modal
              opens: the ledger this payment produced, the provider's own
              timestamps, the fiscal attempt log and the raw callback. */}
          <PaymentExtras id={inspecting.id} />
        </Modal>
      ) : null}
    </>
  );
}

// ─── WALLETS LEDGER ──────────────────────────────────────────────────────────

function WalletsLedger({
  onOpenUser,
  onOpenHistory,
}: {
  onOpenUser: (id: string) => void;
  onOpenHistory: (wallet: AdminWalletRow) => void;
}) {
  const t = useT();
  const queryClient = useQueryClient();
  const { offset, setOffset, limit, setLimit } = usePaging();
  const [adjusting, setAdjusting] = useState<AdminWalletRow | null>(null);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["admin", "wallets", offset, limit],
    queryFn: () => adminApi.wallets({ limit, offset }),
    placeholderData: keepPreviousData,
  });

  return (
    <>
      {isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : (
        <div className="card">
          <div className="card__toolbar">
            <span className="muted">
              {data ? `Jami ${data.total.toLocaleString("ru-RU")} ta hamyon` : " "}
            </span>
          </div>

          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Foydalanuvchi</th>
                  <th>Joriy Balans</th>
                  <th>Oxirgi yangilanish</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {isLoading
                  ? Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i}>
                        {Array.from({ length: 4 }).map((__, c) => (
                          <td key={c}>
                            <Skeleton width="70%" />
                          </td>
                        ))}
                      </tr>
                    ))
                  : data?.items.map((w) => {
                      const userTitle =
                        [w.userName, w.userSurname].filter(Boolean).join(" ") ||
                        w.userPhone ||
                        w.userId.slice(0, 8);
                      const isPositive = Number(w.balance) > 0;

                      return (
                        <tr key={w.userId}>
                          <td>
                            <button
                              className="person-link"
                              onClick={() => onOpenUser(w.userId)}
                            >
                              <div>
                                <div className="cell-main">{userTitle}</div>
                                <div className="muted">{w.userPhone ?? w.userId.slice(0, 8)}</div>
                              </div>
                            </button>
                          </td>
                          <td>
                            <div
                              className="cell-main"
                              style={{
                                fontSize: 15,
                                fontWeight: 700,
                                color: isPositive ? "#10B981" : undefined,
                              }}
                            >
                              {soms(w.balance)}
                            </div>
                          </td>
                          <td className="muted nowrap">{dateTime(w.updatedAt)}</td>
                          <td>
                            <div className="row-actions" style={{ justifyContent: "flex-end" }}>
                              <button
                                className="btn btn--ghost btn--sm"
                                onClick={() => onOpenHistory(w)}
                              >
                                {t("Tarix")}
                              </button>
                              <button
                                className="btn btn--primary btn--sm"
                                onClick={() => setAdjusting(w)}
                              >
                                {t("Balansni o'zgartirish")}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
              </tbody>
            </table>
          </div>

          {!isLoading && !data?.items.length ? (
            <EmptyState title="Hamyonlar mavjud emas" />
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

      {/* Adjust Wallet Modal */}
      {adjusting ? (
        <AdjustWalletModal
          wallet={adjusting}
          onClose={() => setAdjusting(null)}
          onSuccess={() => {
            setAdjusting(null);
            void queryClient.invalidateQueries({ queryKey: ["admin", "wallets"] });
            void queryClient.invalidateQueries({ queryKey: ["admin", "payments"] });
            // The adjustment that just landed belongs at the top of the audit
            // tab, whether or not it is the tab currently on screen.
            void queryClient.invalidateQueries({ queryKey: ["admin", "adjustments"] });
          }}
        />
      ) : null}
    </>
  );
}

// ─── MANUAL ADJUSTMENTS (AUDIT TRAIL) ────────────────────────────────────────

const DIRECTIONS: { id: "" | "credit" | "debit"; label: string }[] = [
  { id: "", label: "Barchasi" },
  { id: "credit", label: "Qo'shilgan" },
  { id: "debit", label: "Yechilgan" },
];

/**
 * Who moved whose balance, by how much, and why.
 *
 * The adjust dialog tells the admin their note is kept for the audit log;
 * this is that log. Rows come from the ledger itself, so what is listed here
 * is exactly what moved the money — there is no second record to drift.
 *
 * The note gets a column of its own rather than a tooltip: a reason nobody
 * can read without hovering is a reason nobody reads.
 */
function AdjustmentsLedger({
  user,
  onClearUser,
  onOpenUser,
}: {
  user: { id: string; label: string } | null;
  onClearUser: () => void;
  onOpenUser: (id: string) => void;
}) {
  const t = useT();
  const [direction, setDirection] = useState<"" | "credit" | "debit">("");
  const { offset, setOffset, limit, setLimit } = usePaging();

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["admin", "adjustments", user?.id ?? "", direction, offset, limit],
    queryFn: () =>
      adminApi.walletAdjustments({
        userId: user?.id,
        direction: direction || undefined,
        limit,
        offset,
      }),
    placeholderData: keepPreviousData,
  });

  if (isError) return <ErrorState error={error} onRetry={() => void refetch()} />;

  return (
    <div className="card">
      <div
        className="card__toolbar"
        style={{ flexWrap: "wrap", gap: 12, justifyContent: "space-between" }}
      >
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          <div className="segmented">
            {DIRECTIONS.map((d) => (
              <button
                key={d.id || "all"}
                className={`segmented__btn${direction === d.id ? " segmented__btn--active" : ""}`}
                onClick={() => {
                  setDirection(d.id);
                  setOffset(0);
                }}
              >
                {t(d.label)}
              </button>
            ))}
          </div>

          {/* Scoped to one wallet, and says so — otherwise an empty table
              here reads as "nobody has ever been adjusted". */}
          {user ? (
            <button
              className="btn btn--ghost btn--sm"
              onClick={() => {
                onClearUser();
                setOffset(0);
              }}
              title={t("Filtrni olib tashlash")}
            >
              {user.label} ×
            </button>
          ) : null}
        </div>

        {data ? (
          <span className="muted">
            {`Jami ${data.total.toLocaleString("ru-RU")} ta amal`}
            {" · "}
            <span style={{ color: "#10B981" }}>+{soms(data.credited)}</span>
            {" · "}
            <span style={{ color: "#EF4444" }}>−{soms(data.debited)}</span>
          </span>
        ) : (
          <span className="muted"> </span>
        )}
      </div>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Foydalanuvchi</th>
              <th>O'zgarish</th>
              <th>Keyingi balans</th>
              <th>Izoh</th>
              <th>Admin</th>
              <th>Sana</th>
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
              : data?.items.map((r) => <AdjustmentRow key={r.id} row={r} onOpenUser={onOpenUser} />)}
          </tbody>
        </table>
      </div>

      {!isLoading && !data?.items.length ? (
        <EmptyState
          title={t(
            user || direction
              ? "Bunday o'zgartirishlar topilmadi"
              : "Hali qo'lda o'zgartirishlar bo'lmagan",
          )}
          hint={t(
            user || direction
              ? "Boshqa filtrlarni tanlab ko'ring."
              : "Hamyon balansi qo'lda o'zgartirilsa, shu yerda qoladi.",
          )}
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
  );
}

function AdjustmentRow({
  row,
  onOpenUser,
}: {
  row: AdminAdjustmentRow;
  onOpenUser: (id: string) => void;
}) {
  const credited = Number(row.amount) > 0;
  const adminTitle =
    [row.adminName, row.adminSurname].filter(Boolean).join(" ") ||
    row.adminPhone ||
    (row.adminId ? row.adminId.slice(0, 8) : null);

  return (
    <tr>
      <td>
        <button className="person-link" onClick={() => onOpenUser(row.userId)}>
          <div>
            <div className="cell-main">{personTitle(row)}</div>
            <div className="muted">{row.userPhone ?? row.userId.slice(0, 8)}</div>
          </div>
        </button>
      </td>
      <td>
        <Badge tone={credited ? "success" : "danger"}>
          {signedSoms(row.amount)}
        </Badge>
      </td>
      <td>
        <div className="cell-main" style={{ fontWeight: 600 }}>
          {soms(row.balanceAfter)}
        </div>
      </td>
      <td style={{ maxWidth: 320, whiteSpace: "normal" }}>
        {row.note ? row.note : <span className="muted">—</span>}
      </td>
      <td>
        {/* Null only for rows written before admin_id existed — saying so is
            better than a blank cell that looks like a bug. */}
        {adminTitle ? (
          <div className="cell-main">{adminTitle}</div>
        ) : (
          <span className="muted">Noma'lum</span>
        )}
      </td>
      <td className="muted nowrap">
        <div>{date(row.createdAt)}</div>
        <div style={{ fontSize: 11.5 }}>{dateTime(row.createdAt)}</div>
      </td>
    </tr>
  );
}

// ─── ADJUST WALLET MODAL ────────────────────────────────────────────────────

function AdjustWalletModal({
  wallet,
  onClose,
  onSuccess,
}: {
  wallet: AdminWalletRow;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const t = useT();
  const [operation, setOperation] = useState<"CREDIT" | "DEBIT">("CREDIT");
  const [amountStr, setAmountStr] = useState("");
  const [note, setNote] = useState("");
  /**
   * One key per open dialog, so every retry of THIS adjustment carries the
   * same one and the money moves once however many times the button is hit
   * or the request is re-sent. A fresh dialog means a fresh key, because
   * crediting the same person twice on purpose must stay possible.
   */
  const [clientId] = useState(() => crypto.randomUUID());

  const userTitle =
    [wallet.userName, wallet.userSurname].filter(Boolean).join(" ") ||
    wallet.userPhone ||
    wallet.userId.slice(0, 8);

  const cleanedAmount = amountStr.replace(/\s/g, "");
  const numAmount = /^\d+$/.test(cleanedAmount) ? Number(cleanedAmount) : 0;
  const currentBalance = Number(wallet.balance || 0);

  const delta = operation === "CREDIT" ? numAmount : -numAmount;
  const nextBalance = currentBalance + delta;

  const validAmount = numAmount > 0 && numAmount <= 10_000_000;
  const validNote = note.trim().length >= 3;
  const canDebit = operation === "CREDIT" || nextBalance >= 0;

  const mutation = useMutation({
    mutationFn: () =>
      adminApi.adjustWallet(wallet.userId, {
        amount: delta,
        note: note.trim(),
        clientId,
      }),
    onSuccess: (result) => {
      // `repeated` means the server already had this key — the first attempt
      // landed after all. Saying "added" again would imply a second credit.
      toast.success(
        result.repeated
          ? t("Bu amal allaqachon bajarilgan")
          : operation === "CREDIT"
            ? `${soms(numAmount)} hisobga qo'shildi`
            : `${soms(numAmount)} hisobdan yechildi`
      );
      onSuccess();
    },
    onError: (e) => toast.error(e),
  });

  return (
    <Modal
      open
      title={`Balansni o'zgartirish: ${userTitle}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn--ghost" onClick={onClose}>
            {t("Bekor qilish")}
          </button>
          <button
            className={`btn ${operation === "CREDIT" ? "btn--primary" : "btn--danger"}`}
            disabled={!validAmount || !validNote || !canDebit || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending
              ? t("Bajarilmoqda...")
              : operation === "CREDIT"
                ? t("Hisobga qo'shish")
                : t("Hisobdan yechish")}
          </button>
        </>
      }
    >
      <div className="form-grid">
        <div className="field field--wide">
          <span className="field__label">Amal turi</span>
          <div className="segmented">
            <button
              type="button"
              className={`segmented__btn${operation === "CREDIT" ? " segmented__btn--active" : ""}`}
              onClick={() => setOperation("CREDIT")}
            >
              + Hisobga qo'shish (Credit)
            </button>
            <button
              type="button"
              className={`segmented__btn${operation === "DEBIT" ? " segmented__btn--active" : ""}`}
              onClick={() => setOperation("DEBIT")}
            >
              − Hisobdan yechish (Debit)
            </button>
          </div>
        </div>

        <div className="field">
          <span className="field__label">Joriy balans</span>
          <div className="cell-main" style={{ fontSize: 16, fontWeight: 700 }}>
            {soms(currentBalance)}
          </div>
        </div>

        <div className="field">
          <span className="field__label">Amaldan keyingi balans</span>
          <div
            className="cell-main"
            style={{
              fontSize: 16,
              fontWeight: 700,
              color: nextBalance < 0 ? "#EF4444" : "#10B981",
            }}
          >
            {soms(nextBalance)}
          </div>
        </div>

        <label className="field field--wide">
          <span className="field__label">Summa (so'm)</span>
          <input
            className="input"
            value={amountStr}
            inputMode="numeric"
            placeholder="10 000"
            onChange={(e) => setAmountStr(e.target.value)}
            autoFocus
          />
          {!canDebit ? (
            <p className="field__error" style={{ color: "#EF4444" }}>
              Hisobda yetarli mablag' mavjud emas (manfiy balans bo'lishi mumkin emas)
            </p>
          ) : null}
        </label>

        <label className="field field--wide">
          <span className="field__label">Izoh / Sabab (majburiy)</span>
          <textarea
            className="input"
            rows={3}
            maxLength={500}
            value={note}
            placeholder="Masalan: Test to'ldirish, Kompensatsiya, Qaytarib berish..."
            onChange={(e) => setNote(e.target.value)}
          />
          <span className="muted" style={{ fontSize: 12 }}>
            Bu izoh audit jurnallarida saqlanadi.
          </span>
        </label>
      </div>
    </Modal>
  );
}

// ─── HELPERS ────────────────────────────────────────────────────────────────

function ProviderBadge({ provider }: { provider: PaymentProvider | string }) {
  const p = PROVIDERS.find((x) => x.id === provider);
  const color = p?.color || "#64748B";

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "3px 8px",
        borderRadius: 6,
        fontSize: 12.5,
        fontWeight: 600,
        backgroundColor: `${color}1A`,
        color,
        border: `1px solid ${color}33`,
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          backgroundColor: color,
        }}
      />
      {p?.label || provider}
    </span>
  );
}
