import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminApi, type AdminAmenity } from "../lib/api";
import { EmptyState, ErrorState, Modal, PageHeader, Skeleton } from "../components/ui";
import { useT } from "../lib/i18n";
import { toast } from "../lib/toast";

const KEY = /^[A-Z][A-Z0-9_]{1,39}$/;

/**
 * The stored key is derived from the Uzbek name, never typed: "Isitish
 * tizimi" → ISITISH_TIZIMI, "Qo'riqlanadi" → QORIQLANADI. Diacritics and
 * the Uzbek apostrophes are stripped; anything else non-alphanumeric
 * becomes an underscore.
 */
const deriveKey = (name: string) =>
  name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/['‘’ʻʼ`]/g, "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);

interface FormState {
  nameUz: string;
  nameRu: string;
  isActive: boolean;
}

const EMPTY: FormState = { nameUz: "", nameRu: "", isActive: true };

/**
 * The amenity catalogue — the "Qo'shimcha xususiyatlar" chips of the mobile
 * post form, managed the same way categories are.
 */
export function AmenitiesPage() {
  const t = useT();
  const queryClient = useQueryClient();
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["admin", "amenities"],
    queryFn: adminApi.amenities,
  });
  const amenities = data ?? [];
  const [editing, setEditing] = useState<AdminAmenity | "new" | null>(null);
  const [deleting, setDeleting] = useState<AdminAmenity | null>(null);

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ["admin"] });

  const patch = useMutation({
    mutationFn: ({ key, body }: { key: string; body: Partial<AdminAmenity> }) =>
      adminApi.updateAmenity(key, body),
    onSuccess: invalidate,
    onError: (e) => toast.error(e),
  });

  /** Swap display order with the neighbour — two small PATCHes. */
  const move = async (index: number, dir: -1 | 1) => {
    const a = amenities[index];
    const b = amenities[index + dir];
    if (!a || !b) return;
    // Equal orders (older rows) would swap to the same values; spread them.
    const aOrder = a.sortOrder === b.sortOrder ? index : a.sortOrder;
    const bOrder = a.sortOrder === b.sortOrder ? index + dir : b.sortOrder;
    try {
      await adminApi.updateAmenity(a.key, { sortOrder: bOrder });
      await adminApi.updateAmenity(b.key, { sortOrder: aOrder });
    } catch (e) {
      toast.error(e);
    }
    invalidate();
  };

  return (
    <>
      <PageHeader
        title={t("Xususiyatlar")}
        subtitle={t("Qo'shimcha xususiyatlar — ilovada e'lon berishda tanlanadigan belgilar")}
        actions={
          <button className="btn btn--primary" onClick={() => setEditing("new")}>
            + Yangi xususiyat
          </button>
        }
      />

      {isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : (
        <div className="card">
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 70 }}>Tartib</th>
                  <th>Xususiyat</th>
                  <th>Kalit</th>
                  <th>E'lonlar</th>
                  <th>Holati</th>
                  <th />
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
                  : amenities.map((a, i) => (
                      <tr key={a.key} style={a.isActive ? undefined : { opacity: 0.6 }}>
                        <td>
                          <div className="order-btns">
                            <button
                              className="icon-btn"
                              disabled={i === 0}
                              onClick={() => void move(i, -1)}
                              aria-label="Yuqoriga"
                              title="Yuqoriga"
                            >
                              ↑
                            </button>
                            <button
                              className="icon-btn"
                              disabled={i === amenities.length - 1}
                              onClick={() => void move(i, 1)}
                              aria-label="Pastga"
                              title="Pastga"
                            >
                              ↓
                            </button>
                          </div>
                        </td>
                        <td>
                          <div className="cell-main">{a.nameUz}</div>
                          <div className="muted">{a.nameRu}</div>
                        </td>
                        <td>
                          <code className="mono">{a.key}</code>
                        </td>
                        <td className="cell-num">{a.listingCount}</td>
                        <td>
                          <button
                            className={`switch${a.isActive ? " switch--on" : ""}`}
                            role="switch"
                            aria-checked={a.isActive}
                            title={a.isActive ? "Ilovada ko'rinadi" : "Ilovada yashirin"}
                            disabled={patch.isPending}
                            onClick={() =>
                              patch.mutate({ key: a.key, body: { isActive: !a.isActive } })
                            }
                          >
                            <span className="switch__knob" />
                          </button>
                          <span className="muted" style={{ marginLeft: 8 }}>
                            {a.isActive ? "Faol" : "Yashirin"}
                          </span>
                        </td>
                        <td>
                          <div className="row-actions" style={{ justifyContent: "flex-end" }}>
                            <button
                              className="btn btn--ghost btn--sm"
                              onClick={() => setEditing(a)}
                            >
                              Tahrirlash
                            </button>
                            <button
                              className="btn btn--danger-soft btn--sm"
                              onClick={() => setDeleting(a)}
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
          {!isLoading && !amenities.length ? (
            <EmptyState title="Xususiyatlar yo'q" hint="Birinchisini qo'shing." />
          ) : null}
        </div>
      )}

      {editing ? (
        <AmenityForm
          initial={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            invalidate();
          }}
        />
      ) : null}

      {deleting ? (
        <DeleteAmenity
          amenity={deleting}
          onClose={() => setDeleting(null)}
          onDeleted={() => {
            setDeleting(null);
            invalidate();
          }}
        />
      ) : null}
    </>
  );
}

/** Create and edit share one form; the key is only editable when creating. */
function AmenityForm({
  initial,
  onClose,
  onSaved,
}: {
  initial: AdminAmenity | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const creating = !initial;
  const [form, setForm] = useState<FormState>(
    initial
      ? {
          nameUz: initial.nameUz,
          nameRu: initial.nameRu,
          isActive: initial.isActive,
        }
      : EMPTY,
  );
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const derivedKey = creating ? deriveKey(form.nameUz) : initial.key;

  const errors: Partial<Record<keyof FormState, string>> = {};
  if (form.nameUz.trim().length < 2) errors.nameUz = "Kamida 2 ta belgi";
  else if (creating && !KEY.test(derivedKey))
    errors.nameUz = "Nomni lotin harflarida yozing";
  if (form.nameRu.trim().length < 2) errors.nameRu = "Kamida 2 ta belgi";
  const invalid = Object.keys(errors).length > 0;

  // A red field before anything is typed reads as scolding — errors appear
  // once there is input; the disabled save covers the empty state.
  const shown = (field: "nameUz" | "nameRu") =>
    form[field].length > 0 ? errors[field] : undefined;

  const save = useMutation({
    mutationFn: () => {
      const body = {
        nameUz: form.nameUz.trim(),
        nameRu: form.nameRu.trim(),
        isActive: form.isActive,
      };
      return creating
        ? adminApi.createAmenity({ ...body, key: derivedKey })
        : adminApi.updateAmenity(initial.key, body);
    },
    onSuccess: () => {
      toast.success(creating ? "Xususiyat qo'shildi" : "Saqlandi");
      onSaved();
    },
    onError: (e) => toast.error(e),
  });

  return (
    <Modal
      open
      title={creating ? "Yangi xususiyat" : `Tahrirlash: ${initial.nameUz}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn--ghost" onClick={onClose}>
            Bekor qilish
          </button>
          <button
            className="btn btn--primary"
            disabled={invalid || save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? "Saqlanmoqda..." : "Saqlash"}
          </button>
        </>
      }
    >
      <div className="form-grid">
        <label className="field">
          <span className="field__label">Nomi (o'zbekcha)</span>
          <input
            className={`input${shown("nameUz") ? " input--error" : ""}`}
            value={form.nameUz}
            maxLength={60}
            placeholder="Kamin"
            onChange={(e) => set("nameUz", e.target.value)}
            autoFocus
          />
          {shown("nameUz") ? <p className="field__error">{shown("nameUz")}</p> : null}
        </label>
        <label className="field">
          <span className="field__label">Nomi (ruscha)</span>
          <input
            className={`input${shown("nameRu") ? " input--error" : ""}`}
            value={form.nameRu}
            maxLength={60}
            placeholder="Камин"
            onChange={(e) => set("nameRu", e.target.value)}
          />
          {shown("nameRu") ? <p className="field__error">{shown("nameRu")}</p> : null}
        </label>

        {/* The key is derived, never typed — shown so the admin knows what
            listings will store, since it can't change afterwards. */}
        <p className="muted field--wide" style={{ margin: 0 }}>
          Kalit: <code className="mono">{derivedKey || "—"}</code>
          {creating
            ? " · nomdan avtomatik yaratiladi, keyin o'zgarmaydi"
            : " · e'lonlar shu kalitni saqlaydi, shuning uchun o'zgarmaydi"}
        </p>

        <label className="check field--wide">
          <input
            type="checkbox"
            checked={form.isActive}
            onChange={(e) => set("isActive", e.target.checked)}
          />
          <span>
            <strong>Ilovada ko'rsatish</strong>
            <span className="muted">
              {" "}
              — yashirilsa yangi e'lonlarda taklif qilinmaydi; tanlab bo'lganlar qoladi
            </span>
          </span>
        </label>
      </div>
    </Modal>
  );
}

/**
 * Unlike categories there is nothing to refile: deleting simply strips the
 * key from the listings that picked it — the dialog says from how many.
 */
function DeleteAmenity({
  amenity,
  onClose,
  onDeleted,
}: {
  amenity: AdminAmenity;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const remove = useMutation({
    mutationFn: () => adminApi.deleteAmenity(amenity.key),
    onSuccess: (r) => {
      toast.success(
        r.strippedFrom
          ? `O'chirildi · ${r.strippedFrom} ta e'londan olib tashlandi`
          : "Xususiyat o'chirildi",
      );
      onDeleted();
    },
    onError: (e) => toast.error(e),
  });

  return (
    <Modal
      open
      title={`O'chirish: ${amenity.nameUz}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn--ghost" onClick={onClose}>
            Bekor qilish
          </button>
          <button
            className="btn btn--danger"
            disabled={remove.isPending}
            onClick={() => remove.mutate()}
          >
            {remove.isPending ? "..." : "O'chirish"}
          </button>
        </>
      }
    >
      {amenity.listingCount > 0 ? (
        <p style={{ margin: 0 }}>
          Bu xususiyatni <strong>{amenity.listingCount} ta e'lon</strong> tanlagan — o'chirilsa
          o'sha e'lonlardan ham olib tashlanadi. Davom etasizmi?
        </p>
      ) : (
        <p style={{ margin: 0 }}>
          Bu xususiyatni hech qaysi e'lon tanlamagan. Uni o'chirishni tasdiqlaysizmi?
        </p>
      )}
    </Modal>
  );
}
