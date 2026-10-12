import { useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminApi, resolveMediaUrl, type AdminVerificationRequest } from "../lib/api";
import { date, fullName } from "../lib/format";
import { Badge, EmptyState, ErrorState, Modal, Pager, PageHeader, Skeleton } from "../components/ui";
import { useT } from "../lib/i18n";
import { toast } from "../lib/toast";
import { confirmDialog } from "../lib/confirm";
import { usePaging } from "../lib/usePaging";
import { UserDrawer } from "../components/UserDrawer";

const STATUSES = ["PENDING", "APPROVED", "REJECTED", ""] as const;
const STATUS_LABEL: Record<string, string> = {
  "": "Barchasi",
  PENDING: "Kutilmoqda",
  APPROVED: "Tasdiqlangan",
  REJECTED: "Rad etilgan",
};
const STATUS_TONE: Record<string, "danger" | "success" | "neutral"> = {
  PENDING: "danger",
  APPROVED: "success",
  REJECTED: "neutral",
};

/** The three documents, in the order the app asks for them. */
const DOCUMENTS = [
  { key: "passportFrontUrl", label: "Pasport (old)" },
  { key: "passportBackUrl", label: "Pasport (orqa)" },
  { key: "selfieUrl", label: "Selfie" },
] as const;

/**
 * Ready-made rejections. A moderator turning down twenty applications an
 * hour writes "blurry" twenty times or stops explaining at all; these are
 * the sentences they would have written, and every one of them is editable
 * before it goes.
 */
const REASON_TEMPLATES = [
  "Rasm noaniq — pasport raqami va matni o'qilmayapti. Yorug' joyda qayta suratga oling.",
  "Selfida yuzingiz va hujjat birga ko'rinmayapti. Hujjatni yuzingiz yonida ushlab qayta yuboring.",
  "Hujjatning bir qismi kadrga tushmagan. To'liq sahifani suratga oling.",
  "Yuborilgan hujjat shaxsni tasdiqlovchi hujjat emas. Pasport yoki ID karta yuboring.",
];

/**
 * Applications for the verified badge.
 *
 * Decided applications keep their documents, so this page is both the queue
 * and the record: what a moderator checked somebody against is still here
 * after the decision, for a second look or a complaint about the first one.
 * That also makes it a standing archive of people's passports — worth
 * remembering when deciding who gets a dashboard login.
 */
export function VerificationPage() {
  const t = useT();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<string>("PENDING");
  const { offset, setOffset, limit, setLimit } = usePaging();
  const [openUser, setOpenUser] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<AdminVerificationRequest | null>(null);
  const [reason, setReason] = useState("");
  const [preview, setPreview] = useState<{ url: string; label: string } | null>(null);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["admin", "verification", status, offset, limit],
    queryFn: () =>
      adminApi.verificationRequests({ status: status || undefined, limit, offset }),
    placeholderData: keepPreviousData,
  });

  const approve = useMutation({
    mutationFn: (id: string) => adminApi.approveVerification(id),
    onSuccess: () => {
      toast.success("Profil tasdiqlandi");
      void queryClient.invalidateQueries({ queryKey: ["admin"] });
    },
    onError: (e) => toast.error(e),
  });

  const reject = useMutation({
    mutationFn: ({ id, text }: { id: string; text: string }) =>
      adminApi.rejectVerification(id, text),
    onSuccess: () => {
      toast.success("Rad etildi — xabar foydalanuvchiga yuborildi");
      setRejecting(null);
      setReason("");
      void queryClient.invalidateQueries({ queryKey: ["admin"] });
    },
    onError: (e) => toast.error(e),
  });

  const reopen = useMutation({
    mutationFn: (id: string) => adminApi.reopenVerification(id),
    onSuccess: () => {
      toast.success("Qayta ochildi — so'rov navbatga qaytdi");
      void queryClient.invalidateQueries({ queryKey: ["admin"] });
    },
    onError: (e) => toast.error(e),
  });

  const confirmApprove = async (r: AdminVerificationRequest) => {
    const ok = await confirmDialog({
      title: "Profilni tasdiqlaysizmi?",
      message:
        "Foydalanuvchi ismi yonida ko'k belgi paydo bo'ladi.",
      confirmLabel: "Tasdiqlash",
    });
    if (ok) approve.mutate(r.id);
  };

  // Reopening an approval takes the badge back, so it asks — and says so.
  const confirmReopen = async (r: AdminVerificationRequest) => {
    const ok = await confirmDialog({
      title: "Qayta ko'rib chiqasizmi?",
      message:
        r.status === "APPROVED"
          ? "So'rov navbatga qaytadi va foydalanuvchidan ko'k belgi olinadi."
          : "So'rov navbatga qaytadi.",
      confirmLabel: "Qayta ochish",
      destructive: r.status === "APPROVED",
    });
    if (ok) reopen.mutate(r.id);
  };

  const busy = approve.isPending || reject.isPending || reopen.isPending;

  return (
    <>
      <PageHeader
        title={t("Profil tasdiqlash so'rovlari")}
        subtitle={t("Hujjatlar qarordan keyin ham shu yerda saqlanadi")}
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
                  <th>Foydalanuvchi</th>
                  <th>Hujjatlar</th>
                  <th>Yuborilgan</th>
                  <th>Holati</th>
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
                  : data?.items.map((r) => (
                      <tr key={r.id}>
                        <td>
                          <button
                            className="person-link"
                            onClick={() => r.user && setOpenUser(r.user.id)}
                            disabled={!r.user}
                          >
                            <div>
                              <div className="cell-main">
                                {r.user ? fullName(r.user) || "—" : "—"}
                              </div>
                              <div className="muted">
                                {r.user?.phoneNumber ?? ""}
                              </div>
                            </div>
                          </button>
                        </td>
                        <td>
                          <Documents request={r} onOpen={setPreview} />
                        </td>
                        <td className="muted nowrap">{date(r.createdAt)}</td>
                        <td>
                          <Badge tone={STATUS_TONE[r.status] ?? "neutral"}>
                            <span className="badge--dot" />
                            {STATUS_LABEL[r.status] ?? r.status}
                          </Badge>
                          {r.rejectionReason ? (
                            <div className="muted report-comment">
                              “{r.rejectionReason}”
                            </div>
                          ) : null}
                        </td>
                        <td>
                          <div className="row-actions" style={{ justifyContent: "flex-end" }}>
                            {r.status === "PENDING" ? (
                              <>
                                <button
                                  className="btn btn--primary btn--sm"
                                  disabled={busy}
                                  onClick={() => void confirmApprove(r)}
                                >
                                  Tasdiqlash
                                </button>
                                <button
                                  className="btn btn--danger btn--sm"
                                  disabled={busy}
                                  onClick={() => {
                                    setRejecting(r);
                                    setReason("");
                                  }}
                                >
                                  Rad etish
                                </button>
                              </>
                            ) : (
                              <>
                                <span className="muted nowrap">
                                  {r.reviewedAt ? date(r.reviewedAt) : "—"}
                                </span>
                                <button
                                  className="btn btn--ghost btn--sm"
                                  disabled={busy}
                                  onClick={() => void confirmReopen(r)}
                                >
                                  Qayta ochish
                                </button>
                              </>
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
              title={status === "PENDING" ? "Yangi so'rov yo'q" : "So'rov yo'q"}
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

      {/* Full size, because the whole question is whether the small print is
          readable — a 60px thumbnail cannot answer it. */}
      <Modal
        open={!!preview}
        title={preview?.label ?? ""}
        onClose={() => setPreview(null)}
      >
        {preview ? (
          <img className="kyc-full" src={preview.url} alt={preview.label} />
        ) : null}
      </Modal>

      <Modal
        open={!!rejecting}
        title="Rad etish sababi"
        onClose={() => setRejecting(null)}
        footer={
          <>
            <button className="btn btn--ghost" onClick={() => setRejecting(null)}>
              Bekor qilish
            </button>
            <button
              className="btn btn--danger"
              disabled={reason.trim().length < 3 || reject.isPending}
              onClick={() =>
                rejecting && reject.mutate({ id: rejecting.id, text: reason.trim() })
              }
            >
              Rad etish va yuborish
            </button>
          </>
        }
      >
        <div className="kyc-reason">
          <p className="muted">
            Bu matn foydalanuvchiga Yordam markazi orqali o'zgarishsiz
            yuboriladi. Nima noto'g'ri bo'lganini va nima qilish kerakligini
            yozing.
          </p>

          <div className="chips">
            {REASON_TEMPLATES.map((template) => (
              <button
                key={template}
                type="button"
                className="chip-btn"
                onClick={() => setReason(template)}
              >
                {template.slice(0, 40)}…
              </button>
            ))}
          </div>

          <textarea
            className="input"
            rows={5}
            maxLength={1000}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Masalan: rasm noaniq, pasport raqami o'qilmayapti."
          />
        </div>
      </Modal>

      <UserDrawer id={openUser} onClose={() => setOpenUser(null)} />
    </>
  );
}

/** The three pages, or a line saying they are gone. */
function Documents({
  request: r,
  onOpen,
}: {
  request: AdminVerificationRequest;
  onOpen: (p: { url: string; label: string }) => void;
}) {
  const shots: { label: string; url: string }[] = DOCUMENTS.flatMap((d) => {
    const url = resolveMediaUrl(r[d.key]);
    return url ? [{ label: d.label as string, url }] : [];
  });

  if (!shots.length) {
    // Applications decided before documents were retained.
    return <span className="muted">Hujjatlar saqlanmagan</span>;
  }

  return (
    <div className="kyc-shots">
      {shots.map((shot) => (
        <button
          key={shot.label}
          type="button"
          className="kyc-shot"
          title={shot.label}
          onClick={() => onOpen(shot)}
        >
          <img src={shot.url} alt={shot.label} />
        </button>
      ))}
    </div>
  );
}
