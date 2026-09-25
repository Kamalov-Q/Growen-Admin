import { useEffect } from "react";

/**
 * A full-view image, over the page.
 *
 * Opening a photo in a new tab loses the thread behind it and lands the
 * moderator on a bare CDN URL with no way back except the browser's. The
 * image belongs on top of what they were reading.
 */
export function Lightbox({
  url,
  onClose,
}: {
  url: string | null;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!url) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [url, onClose]);

  if (!url) return null;

  return (
    <div
      className="lightbox"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
      role="dialog"
      aria-modal="true"
    >
      <img className="lightbox__img" src={url} alt="" />

      <div className="lightbox__bar">
        {/* Still offered, for the times a moderator does want the file
            itself — just no longer the only way to look at it. */}
        <a
          className="btn btn--ghost btn--sm"
          href={url}
          target="_blank"
          rel="noreferrer"
        >
          ↗
        </a>
        <button className="btn btn--ghost btn--sm" onClick={onClose}>
          ✕
        </button>
      </div>
    </div>
  );
}
