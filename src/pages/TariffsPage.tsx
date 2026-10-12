import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  adminApi,
  isBuiltInAction,
  isTimedAction,
  TARIFF_ACTIONS,
  type AdminBonusTier,
  type AdminTariff,
} from "../lib/api";
import { EmptyState, ErrorState, Modal, PageHeader, Skeleton } from "../components/ui";
import { useT } from "../lib/i18n";
import { toast } from "../lib/toast";
import { confirmDialog } from "../lib/confirm";

// The server's own limits (TOPUP_MIN / TOPUP_MAX) — checked here so the form
// says why, instead of the request coming back refused.
const TIER_MIN = 1_000;
const TIER_MAX = 10_000_000;

const soms = (value: string | number) => `${Number(value).toLocaleString("ru-RU")} so'm`;

/**
 * A switched-off row keeps its switch and buttons at full strength — only the
 * values fade, so "paused" does not read as "broken" or "locked".
 */
const dim = (active: boolean) => (active ? undefined : { opacity: 0.5 });

/** "12 000" typed with spaces is still twelve thousand. */
const toInt = (raw: string) => {
  const cleaned = raw.replace(/\s/g, "");
  return /^\d+$/.test(cleaned) ? Number(cleaned) : NaN;
};

/**
 * What the app charges for, and what a top-up earns on top.
 *
 * Two small tables rather than two pages: they are one decision ("what does
 * money buy here") and each is a handful of rows.
 */
export function TariffsPage() {
  const t = useT();
  return (
    <>
      <PageHeader
        title={t("Tariflar")}
        subtitle={t("Pullik amallar narxi va hisobni to'ldirish bonuslari")}
      />
      <div className="section-gap">
        <Tariffs />
        <BonusTiers />
      </div>
    </>
  );
}

// ---- tariffs ---------------------------------------------------------------

/** The built-in actions, in the admin's words. */
const ACTION_LABEL: Record<string, string> = {
  LISTING_POST: "E'lon joylash",
  STORY_POST: "Hikoya joylash",
  LISTING_PROMOTE: "TOPga chiqarish",
};

/** The select's "none of the above" — the admin types their own code. */
const CUSTOM = "__custom__";
const ACTION_CODE = /^[A-Z][A-Z0-9_]{1,39}$/;

/** "Vip nishon" → VIP_NISHON: the code is derived as the admin types. */
const toCode = (raw: string) =>
  raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['‘’ʻʼ`]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+/, "")
    .slice(0, 40);

function Tariffs() {
  const t = useT();
  const queryClient = useQueryClient();
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["admin", "tariffs"],
    queryFn: adminApi.tariffs,
  });
  const tariffs = data ?? [];
  const [editing, setEditing] = useState<AdminTariff | "new" | null>(null);

  const invalidate = () =>
    void queryClient.invalidateQueries({ queryKey: ["admin", "tariffs"] });

  const toggle = useMutation({
    mutationFn: (tariff: AdminTariff) =>
      adminApi.updateTariff(tariff.id, { isActive: !tariff.isActive }),
    onSuccess: invalidate,
    onError: (e) => toast.error(e),
  });

  const remove = useMutation({
    mutationFn: (id: string) => adminApi.deleteTariff(id),
    onSuccess: () => {
      toast.success(t("Tarif o'chirildi"));
      invalidate();
    },
    onError: (e) => toast.error(e),
  });

  const onDelete = async (tariff: AdminTariff) => {
    const ok = await confirmDialog({
      title: t("Tarifni o'chirasizmi?"),
      message: `${tariff.nameUz} — ${soms(tariff.price)}. ${t(
        isBuiltInAction(tariff.action) && !isTimedAction(tariff.action)
          ? "Bu amal bepul bo'lib qoladi."
          : "Foydalanuvchilar bu tarifni sotib ola olmaydi.",
      )}`,
      confirmLabel: t("O'chirish"),
      destructive: true,
    });
    if (ok) remove.mutate(tariff.id);
  };

  // Posting a listing or a story can only have ONE price, so a built-in
  // one-off that is already priced is edited, not added again. TOP durations
  // and custom tariffs can always be added.
  const taken = new Set(tariffs.map((x) => x.action));
  const freeActions = TARIFF_ACTIONS.filter((a) => isTimedAction(a) || !taken.has(a));

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <h2 className="section-title">{t("Pullik amallar")}</h2>
        <button className="btn btn--primary btn--sm" onClick={() => setEditing("new")}>
          {t("+ Yangi tarif")}
        </button>
      </div>

      {isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : !isLoading && !tariffs.length ? (
        <EmptyState
          title={t("Tariflar yo'q")}
          hint={t("Hozir barcha amallar bepul. Birinchi tarifni qo'shing.")}
        />
      ) : (
        <div className="card">
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{t("Tarif")}</th>
                  <th>{t("Amal")}</th>
                  <th>{t("Narxi")}</th>
                  <th>{t("Muddati")}</th>
                  <th>{t("Holati")}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {isLoading
                  ? Array.from({ length: 3 }).map((_, i) => (
                      <tr key={i}>
                        {Array.from({ length: 6 }).map((__, c) => (
                          <td key={c}>
                            <Skeleton width="70%" />
                          </td>
                        ))}
                      </tr>
                    ))
                  : tariffs.map((tariff) => (
                      <tr key={tariff.id}>
                        <td style={dim(tariff.isActive)}>
                          <div className="cell-main">{tariff.nameUz}</div>
                          <div className="muted">{tariff.nameRu}</div>
                        </td>
                        <td style={dim(tariff.isActive)}>
                          {ACTION_LABEL[tariff.action] ? (
                            t(ACTION_LABEL[tariff.action])
                          ) : (
                            <code className="mono">{tariff.action}</code>
                          )}
                        </td>
                        <td className="cell-num" style={dim(tariff.isActive)}>
                          {soms(tariff.price)}
                        </td>
                        <td className="cell-num" style={dim(tariff.isActive)}>
                          {tariff.durationDays === null
                            ? "—"
                            : `${tariff.durationDays} ${t("kun")}`}
                        </td>
                        <td>
                          <button
                            className={`switch${tariff.isActive ? " switch--on" : ""}`}
                            role="switch"
                            aria-checked={tariff.isActive}
                            aria-label={`${tariff.nameUz}: ${t("Faol")}`}
                            disabled={toggle.isPending && toggle.variables?.id === tariff.id}
                            onClick={() => toggle.mutate(tariff)}
                          >
                            <span className="switch__knob" />
                          </button>
                          <span className="muted" style={{ marginLeft: 8 }}>
                            {tariff.isActive ? t("Faol") : t("O'chirilgan")}
                          </span>
                        </td>
                        <td>
                          <div className="row-actions" style={{ justifyContent: "flex-end" }}>
                            <button
                              className="btn btn--ghost btn--sm"
                              onClick={() => setEditing(tariff)}
                            >
                              {t("Tahrirlash")}
                            </button>
                            <button
                              className="btn btn--danger-soft btn--sm"
                              disabled={remove.isPending}
                              onClick={() => void onDelete(tariff)}
                            >
                              {t("O'chirish")}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {editing ? (
        <TariffForm
          initial={editing === "new" ? null : editing}
          actions={freeActions}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            invalidate();
          }}
        />
      ) : null}
    </>
  );
}

/** Create and edit share one form; the action is chosen only when creating. */
function TariffForm({
  initial,
  actions,
  onClose,
  onSaved,
}: {
  initial: AdminTariff | null;
  /** The built-in actions a NEW tariff may still be created for. */
  actions: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useT();
  const creating = !initial;
  // What the select shows: a built-in action, or CUSTOM with a typed code.
  const [choice, setChoice] = useState<string>(
    initial ? (isBuiltInAction(initial.action) ? initial.action : CUSTOM) : CUSTOM,
  );
  const [code, setCode] = useState(initial && !isBuiltInAction(initial.action) ? initial.action : "");
  const custom = choice === CUSTOM;
  const action = custom ? code : choice;
  const [nameUz, setNameUz] = useState(initial?.nameUz ?? "");
  const [nameRu, setNameRu] = useState(initial?.nameRu ?? "");
  const [price, setPrice] = useState(initial ? String(Number(initial.price)) : "");
  const [days, setDays] = useState(initial?.durationDays != null ? String(initial.durationDays) : "");
  const [isActive, setIsActive] = useState(initial?.isActive ?? true);

  // TOP must have days; a built-in one-off cannot; a custom tariff may.
  const daysRequired = isTimedAction(action);
  const timed = daysRequired || custom;
  const priceValue = toInt(price);
  const daysValue = toInt(days);
  const daysGiven = days.trim().length > 0;

  const errors = {
    nameUz: nameUz.trim().length < 2 ? t("Kamida 2 ta belgi") : undefined,
    nameRu: nameRu.trim().length < 2 ? t("Kamida 2 ta belgi") : undefined,
    price:
      Number.isNaN(priceValue) || priceValue > TIER_MAX
        ? t("0 yoki undan katta butun son")
        : undefined,
    days:
      timed &&
      (daysRequired || daysGiven) &&
      (Number.isNaN(daysValue) || daysValue < 1 || daysValue > 365)
        ? t("1 dan 365 gacha butun son")
        : undefined,
    code:
      creating && custom && !ACTION_CODE.test(code)
        ? t("Lotin harflari, raqam va _ — kamida 2 ta belgi")
        : creating && custom && isBuiltInAction(code)
          ? t("Bu kod band — ro'yxatdan tanlang")
          : undefined,
  };
  const invalid = Object.values(errors).some(Boolean);
  // A red field before anything is typed reads as scolding — the disabled
  // save covers the empty state.
  const shown = (field: keyof typeof errors, raw: string) =>
    raw.length > 0 ? errors[field] : undefined;

  const save = useMutation({
    mutationFn: () => {
      const body = {
        nameUz: nameUz.trim(),
        nameRu: nameRu.trim(),
        price: priceValue,
        isActive,
        // Sent only where it means something: the server refuses a duration
        // on a one-off action.
        ...(timed && daysGiven ? { durationDays: daysValue } : {}),
      };
      return creating
        ? adminApi.createTariff({ ...body, action })
        : adminApi.updateTariff(initial.id, body);
    },
    onSuccess: () => {
      toast.success(creating ? t("Tarif qo'shildi") : t("Saqlandi"));
      onSaved();
    },
    onError: (e) => toast.error(e),
  });

  return (
    <Modal
      open
      title={creating ? t("Yangi tarif") : `${t("Tahrirlash")}: ${initial.nameUz}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn--ghost" onClick={onClose}>
            {t("Bekor qilish")}
          </button>
          <button
            className="btn btn--primary"
            disabled={invalid || save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? t("Saqlanmoqda...") : t("Saqlash")}
          </button>
        </>
      }
    >
      <div className="form-grid">
        <label className="field field--wide">
          <span className="field__label">{t("Qaysi amal uchun")}</span>
          <select
            className="input"
            value={choice}
            disabled={!creating}
            onChange={(e) => setChoice(e.target.value)}
          >
            <option value={CUSTOM}>{t("Boshqa — o'z tarifim")}</option>
            {(creating ? actions : isBuiltInAction(action) ? [action] : []).map((a) => (
              <option key={a} value={a}>
                {t(ACTION_LABEL[a])}
              </option>
            ))}
          </select>
          <span className="muted" style={{ fontSize: 12.5 }}>
            {custom
              ? t("O'z tarifingiz ilovada ro'yxatda ko'rinadi, lekin uni sotadigan funksiya qo'shilmaguncha pul yechilmaydi.")
              : daysRequired
                ? t("Bir nechta tarif bo'lishi mumkin — har xil muddatga, foydalanuvchi o'zi tanlaydi.")
                : t("Bu amal uchun bitta tarif bo'ladi — amal bajarilganda shu narx yechiladi.")}
          </span>
        </label>

        {custom ? (
          <label className="field field--wide">
            <span className="field__label">{t("Tarif kodi")}</span>
            <input
              className={`input mono${shown("code", code) ? " input--error" : ""}`}
              value={code}
              maxLength={40}
              disabled={!creating}
              placeholder="VIP_NISHON"
              onChange={(e) => setCode(toCode(e.target.value))}
            />
            {shown("code", code) ? <p className="field__error">{shown("code", code)}</p> : null}
          </label>
        ) : null}

        <label className="field">
          <span className="field__label">{t("Nomi (o'zbekcha)")}</span>
          <input
            className={`input${shown("nameUz", nameUz) ? " input--error" : ""}`}
            value={nameUz}
            maxLength={120}
            placeholder={daysRequired ? "TOP — 7 kun" : (ACTION_LABEL[action] ?? "VIP nishon")}
            onChange={(e) => setNameUz(e.target.value)}
            autoFocus
          />
          {shown("nameUz", nameUz) ? (
            <p className="field__error">{shown("nameUz", nameUz)}</p>
          ) : null}
        </label>
        <label className="field">
          <span className="field__label">{t("Nomi (ruscha)")}</span>
          <input
            className={`input${shown("nameRu", nameRu) ? " input--error" : ""}`}
            value={nameRu}
            maxLength={120}
            onChange={(e) => setNameRu(e.target.value)}
          />
          {shown("nameRu", nameRu) ? (
            <p className="field__error">{shown("nameRu", nameRu)}</p>
          ) : null}
        </label>

        <label className={`field${timed ? "" : " field--wide"}`}>
          <span className="field__label">{t("Narxi (so'm)")}</span>
          <input
            className={`input${shown("price", price) ? " input--error" : ""}`}
            value={price}
            inputMode="numeric"
            placeholder="5 000"
            onChange={(e) => setPrice(e.target.value)}
          />
          {shown("price", price) ? <p className="field__error">{shown("price", price)}</p> : null}
        </label>
        {timed ? (
          <label className="field">
            <span className="field__label">
              {daysRequired ? t("Muddati (kun)") : t("Muddati (kun, ixtiyoriy)")}
            </span>
            <input
              className={`input${shown("days", days) ? " input--error" : ""}`}
              value={days}
              inputMode="numeric"
              placeholder="7"
              onChange={(e) => setDays(e.target.value)}
            />
            {shown("days", days) ? <p className="field__error">{shown("days", days)}</p> : null}
          </label>
        ) : null}

        <label className="check field--wide">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
          />
          <span>
            <strong>{t("Faol")}</strong>
            <span className="muted">
              {" "}
              —{" "}
              {timed
                ? t("o'chirilsa, bu tarif sotuvdan olinadi")
                : t("o'chirilsa, foydalanuvchilardan pul yechilmaydi")}
            </span>
          </span>
        </label>

        <p className="muted field--wide" style={{ margin: 0 }}>
          {t("Yangi narx va muddat faqat keyingi to'lovlarga ta'sir qiladi.")}
        </p>
      </div>
    </Modal>
  );
}

// ---- top-up bonus tiers ----------------------------------------------------

function BonusTiers() {
  const t = useT();
  const queryClient = useQueryClient();
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["admin", "bonus-tiers"],
    queryFn: adminApi.bonusTiers,
  });
  const tiers = data ?? [];
  const [editing, setEditing] = useState<AdminBonusTier | "new" | null>(null);

  const invalidate = () =>
    void queryClient.invalidateQueries({ queryKey: ["admin", "bonus-tiers"] });

  const toggle = useMutation({
    mutationFn: (tier: AdminBonusTier) =>
      adminApi.updateBonusTier(tier.id, { isActive: !tier.isActive }),
    onSuccess: invalidate,
    onError: (e) => toast.error(e),
  });

  const remove = useMutation({
    mutationFn: (id: string) => adminApi.deleteBonusTier(id),
    onSuccess: () => {
      toast.success(t("Pog'ona o'chirildi"));
      invalidate();
    },
    onError: (e) => toast.error(e),
  });

  const onDelete = async (tier: AdminBonusTier) => {
    const ok = await confirmDialog({
      title: t("Pog'onani o'chirasizmi?"),
      message: `${soms(tier.minAmount)} → +${tier.percent}%. ${t(
        "Shu summadan boshlab to'ldirganlar bonus olmay qo'yadi.",
      )}`,
      confirmLabel: t("O'chirish"),
      destructive: true,
    });
    if (ok) remove.mutate(tier.id);
  };

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <h2 className="section-title">{t("To'ldirish bonuslari")}</h2>
        <button className="btn btn--primary btn--sm" onClick={() => setEditing("new")}>
          {t("+ Yangi pog'ona")}
        </button>
      </div>
      <p className="muted" style={{ margin: 0 }}>
        {t(
          "Foydalanuvchi hisobini to'ldirganda summaga qarab qo'shimcha bonus oladi — eng katta mos pog'ona qo'llanadi.",
        )}
      </p>

      {isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : !isLoading && !tiers.length ? (
        <EmptyState
          title={t("Bonus pog'onalari yo'q")}
          hint={t("To'ldirishlarga bonus berilmaydi. Birinchisini qo'shing.")}
        />
      ) : (
        <div className="card">
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{t("To'ldirish summasi (dan)")}</th>
                  <th>{t("Bonus")}</th>
                  <th>{t("Misol")}</th>
                  <th>{t("Holati")}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {isLoading
                  ? Array.from({ length: 4 }).map((_, i) => (
                      <tr key={i}>
                        {Array.from({ length: 5 }).map((__, c) => (
                          <td key={c}>
                            <Skeleton width="70%" />
                          </td>
                        ))}
                      </tr>
                    ))
                  : tiers.map((tier) => {
                      const min = Number(tier.minAmount);
                      const bonus = Math.floor((min * tier.percent) / 100);
                      return (
                        <tr key={tier.id}>
                          <td className="cell-num" style={dim(tier.isActive)}>
                            {soms(min)}
                          </td>
                          <td className="cell-num" style={dim(tier.isActive)}>
                            +{tier.percent}%
                          </td>
                          <td className="muted" style={dim(tier.isActive)}>
                            {soms(min)} → {soms(min + bonus)}
                          </td>
                          <td>
                            <button
                              className={`switch${tier.isActive ? " switch--on" : ""}`}
                              role="switch"
                              aria-checked={tier.isActive}
                              aria-label={`${soms(min)}: ${t("Bonus beriladi")}`}
                              disabled={toggle.isPending && toggle.variables?.id === tier.id}
                              onClick={() => toggle.mutate(tier)}
                            >
                              <span className="switch__knob" />
                            </button>
                            <span className="muted" style={{ marginLeft: 8 }}>
                              {tier.isActive ? t("Bonus beriladi") : t("Bonus berilmaydi")}
                            </span>
                          </td>
                          <td>
                            <div className="row-actions" style={{ justifyContent: "flex-end" }}>
                              <button
                                className="btn btn--ghost btn--sm"
                                onClick={() => setEditing(tier)}
                              >
                                {t("Tahrirlash")}
                              </button>
                              <button
                                className="btn btn--danger-soft btn--sm"
                                disabled={remove.isPending}
                                onClick={() => void onDelete(tier)}
                              >
                                {t("O'chirish")}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {editing ? (
        <BonusTierForm
          initial={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            invalidate();
          }}
        />
      ) : null}
    </>
  );
}

function BonusTierForm({
  initial,
  onClose,
  onSaved,
}: {
  initial: AdminBonusTier | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useT();
  const creating = !initial;
  const [minAmount, setMinAmount] = useState(initial ? String(Number(initial.minAmount)) : "");
  const [percent, setPercent] = useState(initial ? String(initial.percent) : "");

  const minValue = toInt(minAmount);
  const percentValue = toInt(percent);

  const errors = {
    minAmount:
      Number.isNaN(minValue) || minValue < TIER_MIN || minValue > TIER_MAX
        ? t("1 000 dan 10 000 000 gacha butun son")
        : undefined,
    percent:
      Number.isNaN(percentValue) || percentValue > 100
        ? t("0 dan 100 gacha butun son")
        : undefined,
  };
  const invalid = Object.values(errors).some(Boolean);
  // A red field before anything is typed reads as scolding — the disabled
  // save covers the empty state.
  const shown = (field: "minAmount" | "percent", raw: string) =>
    raw.length > 0 ? errors[field] : undefined;

  const save = useMutation({
    mutationFn: () => {
      const body = { minAmount: minValue, percent: percentValue };
      return creating
        ? adminApi.createBonusTier(body)
        : adminApi.updateBonusTier(initial.id, body);
    },
    onSuccess: () => {
      toast.success(creating ? t("Pog'ona qo'shildi") : t("Saqlandi"));
      onSaved();
    },
    onError: (e) => toast.error(e),
  });

  return (
    <Modal
      open
      title={creating ? t("Yangi pog'ona") : t("Pog'onani tahrirlash")}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn--ghost" onClick={onClose}>
            {t("Bekor qilish")}
          </button>
          <button
            className="btn btn--primary"
            disabled={invalid || save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? t("Saqlanmoqda...") : t("Saqlash")}
          </button>
        </>
      }
    >
      <div className="form-grid">
        <label className="field">
          <span className="field__label">{t("Eng kam summa (so'm)")}</span>
          <input
            className={`input${shown("minAmount", minAmount) ? " input--error" : ""}`}
            value={minAmount}
            inputMode="numeric"
            placeholder="100 000"
            onChange={(e) => setMinAmount(e.target.value)}
            autoFocus
          />
          {shown("minAmount", minAmount) ? (
            <p className="field__error">{shown("minAmount", minAmount)}</p>
          ) : null}
        </label>
        <label className="field">
          <span className="field__label">{t("Bonus (%)")}</span>
          <input
            className={`input${shown("percent", percent) ? " input--error" : ""}`}
            value={percent}
            inputMode="numeric"
            placeholder="10"
            onChange={(e) => setPercent(e.target.value)}
          />
          {shown("percent", percent) ? (
            <p className="field__error">{shown("percent", percent)}</p>
          ) : null}
        </label>

        {!invalid ? (
          <p className="muted field--wide" style={{ margin: 0 }}>
            {t("Misol")}: {soms(minValue)} →{" "}
            <strong>{soms(minValue + Math.floor((minValue * percentValue) / 100))}</strong>
          </p>
        ) : null}
      </div>
    </Modal>
  );
}
