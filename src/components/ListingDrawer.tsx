import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  adminApi,
  type AdminListingDetail,
  type AdminListingPatch,
} from "../lib/api";
import { date, fullName, money } from "../lib/format";
import { PROPERTY_LABEL, PURPOSE_LABEL, PURPOSE_PERIOD, label } from "../lib/labels";
import { useCategories } from "../lib/useCategories";
import { Avatar, Badge, Drawer, ErrorState, Modal, Skeleton } from "./ui";
import { toast } from "../lib/toast";
import { PhotoSwiper } from "./PhotoSwiper";
import { ListingMap } from "./ListingMap";

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: "Faol",
  DRAFT: "Qoralama",
  ARCHIVED: "Arxiv",
};
const STATUS_TONE: Record<string, "success" | "warning" | "neutral"> = {
  ACTIVE: "success",
  DRAFT: "warning",
  ARCHIVED: "neutral",
};

interface Form {
  title: string;
  address: string;
  rooms: string;
  areaM2: string;
  floor: string;
  totalFloors: string;
  contactPhone: string;
}

const toForm = (l: AdminListingDetail): Form => ({
  title: l.title ?? "",
  address: l.address ?? "",
  rooms: l.rooms != null ? String(l.rooms) : "",
  areaM2: l.areaM2 != null ? String(Number(l.areaM2)) : "",
  floor: l.floor != null ? String(l.floor) : "",
  totalFloors: l.totalFloors != null ? String(l.totalFloors) : "",
  contactPhone: l.contactPhone ?? "",
});

/** "" stays undefined so the PATCH only carries what the admin actually set. */
function toPatch(f: Form): AdminListingPatch {
  const num = (s: string) => (s.trim() === "" ? undefined : Number(s));
  return {
    title: f.title.trim() || undefined,
    address: f.address.trim() || undefined,
    contactPhone: f.contactPhone.replace(/[\s-]/g, "") || undefined,
    rooms: num(f.rooms),
    areaM2: num(f.areaM2),
    floor: num(f.floor),
    totalFloors: num(f.totalFloors),
  };
}

/** The server's DTO rules, mirrored so mistakes surface before the request. */
function validate(f: Form): Partial<Record<keyof Form, string>> {
  const e: Partial<Record<keyof Form, string>> = {};
  const intIn = (s: string, min: number, max: number): number | null => {
    if (s.trim() === "") return null;
    const n = Number(s);
    if (!Number.isInteger(n) || n < min || n > max) return NaN as unknown as number;
    return n;
  };

  if (f.title.trim().length > 160) e.title = "Ko'pi bilan 160 ta belgi";
  if (f.address.trim().length > 500) e.address = "Ko'pi bilan 500 ta belgi";

  const rooms = intIn(f.rooms, 0, 1000);
  if (Number.isNaN(rooms)) e.rooms = "0 dan katta butun son";

  if (f.areaM2.trim() !== "") {
    const area = Number(f.areaM2);
    if (!Number.isFinite(area) || area < 0) e.areaM2 = "0 dan katta son";
  }

  const floor = intIn(f.floor, -10, 200);
  if (Number.isNaN(floor)) e.floor = "-10 dan 200 gacha butun son";

  const total = intIn(f.totalFloors, 1, 200);
  if (Number.isNaN(total)) e.totalFloors = "1 dan 200 gacha butun son";

  if (
    typeof floor === "number" &&
    typeof total === "number" &&
    !Number.isNaN(floor) &&
    !Number.isNaN(total) &&
    floor > total
  ) {
    e.floor = "Qavat qavatlar sonidan katta bo'lmasin";
  }

  const phone = f.contactPhone.replace(/[\s-]/g, "");
  if (phone && !/^\+998\d{9}$/.test(phone)) {
    e.contactPhone = "+998 va 9 ta raqam: +998901234567";
  }

  return e;
}

/**
 * Everything about one listing: photos, owner, offers, an edit form, and the
 * moderation switches. CRUD lives here so the table stays a table.
 */
export function ListingDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<Form | null>(null);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const { nameOf } = useCategories();

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["admin", "listing", id],
    queryFn: () => adminApi.listing(id!),
    enabled: !!id,
  });

  // Re-seed the form whenever a new copy of the listing arrives (another
  // listing opened, or a refetch after saving). Done during render — React's
  // pattern for resetting state from props — rather than in an effect, which
  // would render once with the stale form and then again.
  const [seededFrom, setSeededFrom] = useState<AdminListingDetail | null>(null);
  if (data && data !== seededFrom) {
    setSeededFrom(data);
    setForm(toForm(data));
  }

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["admin"] });
  };

  const save = useMutation({
    mutationFn: () => adminApi.updateListing(id!, toPatch(form!)),
    onSuccess: () => {
      toast.success("Saqlandi");
      invalidate();
    },
    onError: (e) => toast.error(e),
  });

  const setStatus = useMutation({
    mutationFn: (status: "ACTIVE" | "ARCHIVED") => adminApi.setListingStatus(id!, status),
    onSuccess: (_d, status) => {
      toast.success(status === "ARCHIVED" ? "E'lon arxivlandi" : "E'lon faollashtirildi");
      setConfirmArchive(false);
      invalidate();
    },
    onError: (e) => toast.error(e),
  });

  const set = (key: keyof Form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => (f ? { ...f, [key]: e.target.value } : f));

  const errors = form ? validate(form) : {};
  const hasErrors = Object.keys(errors).length > 0;

  const activeOffers = data?.offers?.filter((o) => o.isActive) ?? [];
  // Primary photo first, then the owner's order — the order the app shows.
  const photos = [...(data?.images ?? [])].sort(
    (a, b) =>
      Number(b.isPrimary ?? false) - Number(a.isPrimary ?? false) ||
      (a.position ?? 0) - (b.position ?? 0),
  );
  // GeoJSON is [lng, lat]; a map link wants lat,lng.
  const point = data?.centroid?.coordinates;
  const description = data?.descriptionText?.trim();

  return (
    <Drawer
      open={!!id}
      title={data?.title ?? "E'lon"}
      subtitle={
        data ? [nameOf(data.category), date(data.createdAt)].join(" · ") : undefined
      }
      onClose={onClose}
      footer={
        data && form ? (
          <>
            <button
              className="btn btn--primary"
              disabled={save.isPending || hasErrors}
              onClick={() => save.mutate()}
            >
              {save.isPending ? "Saqlanmoqda..." : "Saqlash"}
            </button>
            {data.status === "ARCHIVED" ? (
              <button
                className="btn btn--ghost"
                disabled={setStatus.isPending}
                onClick={() => setStatus.mutate("ACTIVE")}
              >
                Faollashtirish
              </button>
            ) : (
              <button className="btn btn--danger-soft" onClick={() => setConfirmArchive(true)}>
                Arxivlash
              </button>
            )}
          </>
        ) : undefined
      }
    >
      {isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : isLoading || !data || !form ? (
        <>
          <Skeleton width="100%" height={120} />
          <Skeleton width="60%" />
          <Skeleton width="80%" />
        </>
      ) : (
        <>
          <div className="row-actions">
            <Badge tone={STATUS_TONE[data.status] ?? "neutral"}>
              {STATUS_LABEL[data.status] ?? data.status}
            </Badge>
            <Badge>{nameOf(data.category)}</Badge>
            {activeOffers.map((o) => (
              <Badge key={o.id} tone="accent">
                {money(o.price, o.currency)}
                {PURPOSE_PERIOD[o.purpose] ?? ""}
              </Badge>
            ))}
          </div>

          <p className="section-title">Rasmlar · {photos.length}</p>
          {photos.length ? (
            <PhotoSwiper images={photos} />
          ) : (
            <div className="empty-inline">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="5" width="18" height="14" rx="2" />
                <circle cx="9" cy="10" r="1.6" />
                <path d="m5 19 5.5-5.5L14 17l3-3 4 4" />
              </svg>
              Rasmlar yo'q
            </div>
          )}

          <div className="panel">
            <p className="section-title">Egasi</p>
            <div className="person">
              <Avatar
                name={data.owner?.name ?? null}
                surname={data.owner?.surname ?? null}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="cell-main">
                  {data.owner ? fullName(data.owner) || "—" : "—"}
                </div>
                {data.owner?.phoneNumber ? (
                  <a className="link muted" href={`tel:${data.owner.phoneNumber}`}>
                    {data.owner.phoneNumber}
                  </a>
                ) : (
                  <span className="muted">Telefon yo'q</span>
                )}
              </div>
              <span className="muted" style={{ textAlign: "right" }}>
                E'lon qilingan
                <br />
                {date(data.publishedAt ?? data.createdAt)}
              </span>
            </div>
          </div>

          <div className="panel">
            <p className="section-title">Ma'lumotlar</p>
            <dl className="kv">
              <dt>ID</dt>
              <dd>
                <code className="mono">{data.id}</code>{" "}
                <button
                  className="btn btn--ghost btn--sm"
                  onClick={() =>
                    void navigator.clipboard
                      .writeText(data.id)
                      .then(() => toast.success("ID nusxalandi"))
                  }
                >
                  Nusxalash
                </button>
              </dd>
              <dt>Holati</dt>
              <dd>{STATUS_LABEL[data.status] ?? data.status}</dd>
              <dt>Turi</dt>
              <dd>{nameOf(data.category)}</dd>
              <dt>Joylashuv</dt>
              <dd>
                {data.geom ? "Chizilgan chegara" : point ? "Nuqta" : "Belgilanmagan"}
                {point ? (
                  <>
                    {" · "}
                    <a
                      className="link"
                      href={`https://www.google.com/maps?q=${point[1]},${point[0]}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {point[1].toFixed(5)}, {point[0].toFixed(5)} ↗
                    </a>
                  </>
                ) : null}
              </dd>
              <dt>Baho</dt>
              <dd>
                {data.ratingCount ? (
                  <>
                    <span className="rating-cell">
                      <span className="rating-cell__star">★</span>
                      <b>{data.ratingAvg?.toFixed(1)}</b>
                      <span className="muted">/5</span>
                    </span>{" "}
                    <span className="muted">· {data.ratingCount} ta sharh</span>
                  </>
                ) : (
                  <span className="muted">Sharhlar yo'q</span>
                )}
              </dd>
              <dt>Ko'rishlar</dt>
              <dd>
                {(data.viewCount ?? 0).toLocaleString("ru-RU")}{" "}
                <span className="muted">· noyob foydalanuvchi</span>
              </dd>
              <dt>Manzil</dt>
              <dd>{data.address || "—"}</dd>
              <dt>Maydon</dt>
              <dd>{data.areaM2 != null ? `${Number(data.areaM2)} m²` : "—"}</dd>
              <dt>Xonalar</dt>
              <dd>{data.rooms ?? "—"}</dd>
              <dt>Qavat</dt>
              <dd>
                {data.floor != null
                  ? data.totalFloors != null
                    ? `${data.floor} / ${data.totalFloors}`
                    : data.floor
                  : "—"}
              </dd>
              <dt>Aloqa telefoni</dt>
              <dd>
                {data.contactPhone ? (
                  <a className="link" href={`tel:${data.contactPhone}`}>
                    {data.contactPhone}
                  </a>
                ) : (
                  "—"
                )}
              </dd>
              <dt>E'lon qilingan</dt>
              <dd>{date(data.publishedAt)}</dd>
              <dt>Yaratilgan</dt>
              <dd>{date(data.createdAt)}</dd>
              <dt>Yangilangan</dt>
              <dd>{date(data.updatedAt ?? null)}</dd>
            </dl>
          </div>

          <div className="panel">
            <p className="section-title">Joylashuv</p>
            {/* The outline or the pin, on satellite imagery — and the
                moderator's own position, for "is this really there?" */}
            <ListingMap geom={data.geom} centroid={data.centroid} />
          </div>

          <div className="panel">
            <p className="section-title">Narxlar</p>
            {data.offers?.length ? (
              <dl className="kv">
                {data.offers.map((o) => (
                  <div key={o.id} style={{ display: "contents" }}>
                    <dt>{label(PURPOSE_LABEL, o.purpose)}</dt>
                    <dd style={o.isActive ? undefined : { opacity: 0.55 }}>
                      {money(o.price, o.currency)}
                      {PURPOSE_PERIOD[o.purpose] ?? ""}
                      {o.isActive ? null : (
                        <>
                          {" "}
                          <Badge>nofaol</Badge>
                        </>
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="muted">Narx ko'rsatilmagan</p>
            )}
          </div>

          <div className="panel">
            <p className="section-title">Tavsif</p>
            {description ? (
              <p className="description">{description}</p>
            ) : (
              <p className="muted">Tavsif yo'q</p>
            )}
          </div>

          <div className="panel">
            <p className="section-title">Qulayliklar</p>
            {data.properties?.length ? (
              <div className="row-actions">
                {data.properties.map((key) => (
                  <Badge key={key}>{label(PROPERTY_LABEL, key)}</Badge>
                ))}
              </div>
            ) : (
              <p className="muted">Belgilanmagan</p>
            )}
          </div>

          <div className="panel">
            <p className="section-title">Tahrirlash</p>
            <div className="form-grid">
              <label className="field field--wide">
                <span className="field__label">Sarlavha</span>
                <input
                  className={`input${errors.title ? " input--error" : ""}`}
                  value={form.title}
                  maxLength={160}
                  placeholder="3 xonali kvartira, Chorsu yaqinida"
                  onChange={set("title")}
                />
                {errors.title ? <p className="field__error">{errors.title}</p> : null}
              </label>
              <label className="field field--wide">
                <span className="field__label">Manzil</span>
                <input
                  className={`input${errors.address ? " input--error" : ""}`}
                  value={form.address}
                  maxLength={500}
                  placeholder="Toshkent, Shayxontohur tumani, Navoiy ko'chasi 12"
                  onChange={set("address")}
                />
                {errors.address ? <p className="field__error">{errors.address}</p> : null}
              </label>
              <label className="field">
                <span className="field__label">Xonalar</span>
                <input
                  className={`input${errors.rooms ? " input--error" : ""}`}
                  type="number"
                  min={0}
                  step={1}
                  value={form.rooms}
                  placeholder="3"
                  onChange={set("rooms")}
                />
                {errors.rooms ? <p className="field__error">{errors.rooms}</p> : null}
              </label>
              <label className="field">
                <span className="field__label">Maydon, m²</span>
                <input
                  className={`input${errors.areaM2 ? " input--error" : ""}`}
                  type="number"
                  min={0}
                  value={form.areaM2}
                  placeholder="78.5"
                  onChange={set("areaM2")}
                />
                {errors.areaM2 ? <p className="field__error">{errors.areaM2}</p> : null}
              </label>
              <label className="field">
                <span className="field__label">Qavat</span>
                <input
                  className={`input${errors.floor ? " input--error" : ""}`}
                  type="number"
                  min={-10}
                  max={200}
                  step={1}
                  value={form.floor}
                  placeholder="4"
                  onChange={set("floor")}
                />
                {errors.floor ? <p className="field__error">{errors.floor}</p> : null}
              </label>
              <label className="field">
                <span className="field__label">Qavatlar soni</span>
                <input
                  className={`input${errors.totalFloors ? " input--error" : ""}`}
                  type="number"
                  min={1}
                  max={200}
                  step={1}
                  value={form.totalFloors}
                  placeholder="9"
                  onChange={set("totalFloors")}
                />
                {errors.totalFloors ? (
                  <p className="field__error">{errors.totalFloors}</p>
                ) : null}
              </label>
              <label className="field field--wide">
                <span className="field__label">Aloqa telefoni</span>
                <input
                  className={`input${errors.contactPhone ? " input--error" : ""}`}
                  type="tel"
                  value={form.contactPhone}
                  placeholder="+998 90 123 45 67"
                  onChange={set("contactPhone")}
                />
                {errors.contactPhone ? (
                  <p className="field__error">{errors.contactPhone}</p>
                ) : null}
              </label>
            </div>
          </div>

          <Modal
            open={confirmArchive}
            title="E'lonni arxivlash"
            onClose={() => setConfirmArchive(false)}
            footer={
              <>
                <button className="btn btn--ghost" onClick={() => setConfirmArchive(false)}>
                  Bekor qilish
                </button>
                <button
                  className="btn btn--danger"
                  disabled={setStatus.isPending}
                  onClick={() => setStatus.mutate("ARCHIVED")}
                >
                  {setStatus.isPending ? "..." : "Arxivlash"}
                </button>
              </>
            }
          >
            <p style={{ margin: 0 }}>
              E'lon xaritadan va lentadan olib tashlanadi, rasm fayllari o'chiriladi. Yozuv
              saqlanib qoladi va keyinroq faollashtirish mumkin (rasmlarni egasi qayta yuklashi
              kerak bo'ladi).
            </p>
          </Modal>
        </>
      )}
    </Drawer>
  );
}
