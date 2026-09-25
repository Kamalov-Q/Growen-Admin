import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  adminApi,
  CATEGORY_ICON_KEYS,
  type AdminCategory,
  type CategoryIconKey,
} from "../lib/api";
import { useCategories } from "../lib/useCategories";
import { CategoryIcon } from "../components/CategoryIcon";
import { Badge, EmptyState, ErrorState, Modal, PageHeader, Skeleton } from "../components/ui";
import { useT } from "../lib/i18n";
import { toast } from "../lib/toast";

const SLUG = /^[A-Z][A-Z0-9_]{1,39}$/;
/** Same normalisation the server applies, so the preview matches what's stored. */
const toSlug = (s: string) => s.trim().toUpperCase().replace(/[\s-]+/g, "_");

interface FormState {
  slug: string;
  nameUz: string;
  nameRu: string;
  icon: CategoryIconKey;
  isActive: boolean;
  floorCapable: boolean;
}

const EMPTY: FormState = {
  slug: "",
  nameUz: "",
  nameRu: "",
  icon: "grid",
  isActive: true,
  floorCapable: false,
};

export function CategoriesPage() {
  const t = useT();
  const queryClient = useQueryClient();
  const { categories, isLoading, isError, error, refetch } = useCategories();
  const [editing, setEditing] = useState<AdminCategory | "new" | null>(null);
  const [deleting, setDeleting] = useState<AdminCategory | null>(null);

  // Listings, the overview and the drawer all read categories — refresh all.
  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ["admin"] });

  const patch = useMutation({
    mutationFn: ({ slug, body }: { slug: string; body: Partial<AdminCategory> }) =>
      adminApi.updateCategory(slug, body),
    onSuccess: invalidate,
    onError: (e) => toast.error(e),
  });

  /** Swap display order with the neighbour — two small PATCHes. */
  const move = async (index: number, dir: -1 | 1) => {
    const a = categories[index];
    const b = categories[index + dir];
    if (!a || !b) return;
    // Equal orders (older rows) would swap to the same values; spread them.
    const aOrder = a.sortOrder === b.sortOrder ? index : a.sortOrder;
    const bOrder = a.sortOrder === b.sortOrder ? index + dir : b.sortOrder;
    try {
      await adminApi.updateCategory(a.slug, { sortOrder: bOrder });
      await adminApi.updateCategory(b.slug, { sortOrder: aOrder });
    } catch (e) {
      toast.error(e);
    }
    invalidate();
  };

  return (
    <>
      <PageHeader
        title={t("Kategoriyalar")}
        subtitle={t("Ko'chmas mulk turlari — ilovada e'lon berish va filtrlarda ko'rinadi")}
        actions={
          <button className="btn btn--primary" onClick={() => setEditing("new")}>
            + Yangi kategoriya
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
                  <th>Kategoriya</th>
                  <th>Kalit</th>
                  <th>E'lonlar</th>
                  <th>Qavatlar</th>
                  <th>Holati</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {isLoading
                  ? Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i}>
                        {Array.from({ length: 7 }).map((__, c) => (
                          <td key={c}>
                            <Skeleton width="70%" />
                          </td>
                        ))}
                      </tr>
                    ))
                  : categories.map((c, i) => (
                      <tr key={c.slug} style={c.isActive ? undefined : { opacity: 0.6 }}>
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
                              disabled={i === categories.length - 1}
                              onClick={() => void move(i, 1)}
                              aria-label="Pastga"
                              title="Pastga"
                            >
                              ↓
                            </button>
                          </div>
                        </td>
                        <td>
                          <div className="cat-cell">
                            <span className="cat-bars__icon">
                              <CategoryIcon icon={c.icon} />
                            </span>
                            <div>
                              <div className="cell-main">{c.nameUz}</div>
                              <div className="muted">{c.nameRu}</div>
                            </div>
                          </div>
                        </td>
                        <td>
                          <code className="mono">{c.slug}</code>
                        </td>
                        <td className="cell-num">{c.listingCount}</td>
                        <td>{c.floorCapable ? <Badge tone="accent">Bor</Badge> : <Badge>Yo'q</Badge>}</td>
                        <td>
                          <button
                            className={`switch${c.isActive ? " switch--on" : ""}`}
                            role="switch"
                            aria-checked={c.isActive}
                            title={c.isActive ? "Ilovada ko'rinadi" : "Ilovada yashirin"}
                            disabled={patch.isPending}
                            onClick={() =>
                              patch.mutate({ slug: c.slug, body: { isActive: !c.isActive } })
                            }
                          >
                            <span className="switch__knob" />
                          </button>
                          <span className="muted" style={{ marginLeft: 8 }}>
                            {c.isActive ? "Faol" : "Yashirin"}
                          </span>
                        </td>
                        <td>
                          <div className="row-actions" style={{ justifyContent: "flex-end" }}>
                            <button className="btn btn--ghost btn--sm" onClick={() => setEditing(c)}>
                              Tahrirlash
                            </button>
                            <button
                              className="btn btn--danger-soft btn--sm"
                              onClick={() => setDeleting(c)}
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
          {!isLoading && !categories.length ? (
            <EmptyState title="Kategoriyalar yo'q" hint="Birinchisini qo'shing." />
          ) : null}
        </div>
      )}

      {editing ? (
        <CategoryForm
          initial={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            invalidate();
          }}
        />
      ) : null}

      {deleting ? (
        <DeleteCategory
          category={deleting}
          others={categories.filter((c) => c.slug !== deleting.slug)}
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

/** Create and edit share one form; the slug is only editable when creating. */
function CategoryForm({
  initial,
  onClose,
  onSaved,
}: {
  initial: AdminCategory | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const creating = !initial;
  const [form, setForm] = useState<FormState>(
    initial
      ? {
          slug: initial.slug,
          nameUz: initial.nameUz,
          nameRu: initial.nameRu,
          icon: (CATEGORY_ICON_KEYS as readonly string[]).includes(initial.icon)
            ? initial.icon
            : "grid",
          isActive: initial.isActive,
          floorCapable: initial.floorCapable,
        }
      : EMPTY,
  );
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const errors: Partial<Record<keyof FormState, string>> = {};
  if (creating && !SLUG.test(toSlug(form.slug)))
    errors.slug = "Lotin harflari, raqam va _ (masalan OFFICE)";
  if (form.nameUz.trim().length < 2) errors.nameUz = "Kamida 2 ta belgi";
  if (form.nameRu.trim().length < 2) errors.nameRu = "Kamida 2 ta belgi";
  const invalid = Object.keys(errors).length > 0;

  const save = useMutation({
    mutationFn: () => {
      const body = {
        nameUz: form.nameUz.trim(),
        nameRu: form.nameRu.trim(),
        icon: form.icon,
        isActive: form.isActive,
        floorCapable: form.floorCapable,
      };
      return creating
        ? adminApi.createCategory({ ...body, slug: toSlug(form.slug) })
        : adminApi.updateCategory(initial.slug, body);
    },
    onSuccess: () => {
      toast.success(creating ? "Kategoriya qo'shildi" : "Saqlandi");
      onSaved();
    },
    onError: (e) => toast.error(e),
  });

  const turningFloorsOff =
    !creating && initial.floorCapable && !form.floorCapable && initial.listingCount > 0;

  return (
    <Modal
      open
      title={creating ? "Yangi kategoriya" : `Tahrirlash: ${initial.nameUz}`}
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
            className={`input${errors.nameUz ? " input--error" : ""}`}
            value={form.nameUz}
            maxLength={60}
            placeholder="Ofis"
            onChange={(e) => set("nameUz", e.target.value)}
            autoFocus
          />
          {errors.nameUz ? <p className="field__error">{errors.nameUz}</p> : null}
        </label>
        <label className="field">
          <span className="field__label">Nomi (ruscha)</span>
          <input
            className={`input${errors.nameRu ? " input--error" : ""}`}
            value={form.nameRu}
            maxLength={60}
            placeholder="Офис"
            onChange={(e) => set("nameRu", e.target.value)}
          />
          {errors.nameRu ? <p className="field__error">{errors.nameRu}</p> : null}
        </label>

        <label className="field field--wide">
          <span className="field__label">Kalit (slug)</span>
          <input
            className={`input mono${errors.slug ? " input--error" : ""}`}
            value={creating ? form.slug : initial.slug}
            disabled={!creating}
            maxLength={40}
            placeholder="OFFICE"
            onChange={(e) => set("slug", e.target.value)}
          />
          {errors.slug ? (
            <p className="field__error">{errors.slug}</p>
          ) : (
            <p className="muted">
              {creating
                ? `Saqlanadi: ${toSlug(form.slug) || "—"} · keyin o'zgartirib bo'lmaydi`
                : "E'lonlar shu kalitni saqlaydi, shuning uchun o'zgarmaydi"}
            </p>
          )}
        </label>

        <div className="field field--wide">
          <span className="field__label">Belgi</span>
          <div className="icon-picker" role="radiogroup" aria-label="Belgi">
            {CATEGORY_ICON_KEYS.map((key) => (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={form.icon === key}
                title={key}
                className={`icon-picker__item${form.icon === key ? " icon-picker__item--active" : ""}`}
                onClick={() => set("icon", key)}
              >
                <CategoryIcon icon={key} size={20} />
              </button>
            ))}
          </div>
        </div>

        <label className="check field--wide">
          <input
            type="checkbox"
            checked={form.floorCapable}
            onChange={(e) => set("floorCapable", e.target.checked)}
          />
          <span>
            <strong>Qavat bor</strong>
            <span className="muted"> — e'londa "4 / 9 qavat" so'raladi (kvartira, ofis)</span>
          </span>
        </label>
        {turningFloorsOff ? (
          <p className="alert field--wide">
            Diqqat: bu kategoriyadagi {initial.listingCount} ta e'londagi qavat ma'lumotlari
            o'chiriladi.
          </p>
        ) : null}

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
              — yashirilsa yangi e'lon va filtrlarda chiqmaydi; mavjud e'lonlar qoladi
            </span>
          </span>
        </label>
      </div>
    </Modal>
  );
}

/**
 * A category listings use can't just vanish, so deleting one asks where those
 * listings should go; the server moves them and deletes in one transaction.
 */
function DeleteCategory({
  category,
  others,
  onClose,
  onDeleted,
}: {
  category: AdminCategory;
  others: AdminCategory[];
  onClose: () => void;
  onDeleted: () => void;
}) {
  const inUse = category.listingCount > 0;
  const [moveTo, setMoveTo] = useState(others[0]?.slug ?? "");

  const remove = useMutation({
    mutationFn: () => adminApi.deleteCategory(category.slug, inUse ? moveTo : undefined),
    onSuccess: (r) => {
      toast.success(
        r.moved ? `O'chirildi · ${r.moved} ta e'lon ko'chirildi` : "Kategoriya o'chirildi",
      );
      onDeleted();
    },
    onError: (e) => toast.error(e),
  });

  const lastOne = others.length === 0;

  return (
    <Modal
      open
      title={`O'chirish: ${category.nameUz}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn--ghost" onClick={onClose}>
            Bekor qilish
          </button>
          <button
            className="btn btn--danger"
            disabled={remove.isPending || lastOne || (inUse && !moveTo)}
            onClick={() => remove.mutate()}
          >
            {remove.isPending ? "..." : inUse ? "Ko'chirish va o'chirish" : "O'chirish"}
          </button>
        </>
      }
    >
      {lastOne ? (
        <p style={{ margin: 0 }}>Oxirgi kategoriyani o'chirib bo'lmaydi.</p>
      ) : inUse ? (
        <div className="field">
          <p style={{ margin: "0 0 10px" }}>
            Bu kategoriyada <strong>{category.listingCount} ta e'lon</strong> bor. O'chirishdan
            oldin ular qaysi kategoriyaga o'tkazilsin?
          </p>
          <select className="input" value={moveTo} onChange={(e) => setMoveTo(e.target.value)}>
            {others.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.nameUz} ({c.slug}){c.isActive ? "" : " — yashirin"}
              </option>
            ))}
          </select>
          {others.find((c) => c.slug === moveTo && !c.floorCapable) &&
          category.floorCapable ? (
            <p className="muted" style={{ marginTop: 8 }}>
              Tanlangan kategoriyada qavat yo'q — ko'chirilgan e'lonlarning qavat ma'lumoti
              o'chiriladi.
            </p>
          ) : null}
        </div>
      ) : (
        <p style={{ margin: 0 }}>
          Bu kategoriyada e'lon yo'q. Uni butunlay o'chirishni tasdiqlaysizmi?
        </p>
      )}
    </Modal>
  );
}
