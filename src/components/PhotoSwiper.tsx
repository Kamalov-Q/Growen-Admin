import { useRef, useState } from "react";
import { resolveMediaUrl } from "../lib/api";

export interface SwiperImage {
  id: string;
  url: string;
  thumbUrl: string | null;
  isPrimary?: boolean;
}

/**
 * One photo at a time, swiped or stepped through — the listing as its viewers
 * see it, instead of a wall of thumbnails.
 *
 * Native scroll with snap points rather than a carousel library: it gets
 * touchpad and touch swiping, keyboard scrolling and momentum for free, and
 * the arrows just scroll it.
 */
export function PhotoSwiper({ images }: { images: SwiperImage[] }) {
  const strip = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);

  if (!images.length) return null;

  const go = (next: number) => {
    const el = strip.current;
    if (!el) return;
    const clamped = Math.max(0, Math.min(images.length - 1, next));
    el.scrollTo({ left: clamped * el.clientWidth, behavior: "smooth" });
    setIndex(clamped);
  };

  return (
    <div className="swiper">
      <div
        ref={strip}
        className="swiper__strip"
        // The scroll position IS the state; rounding keeps the counter honest
        // mid-swipe without fighting the browser's momentum.
        onScroll={(e) => {
          const el = e.currentTarget;
          const at = Math.round(el.scrollLeft / el.clientWidth);
          if (at !== index) setIndex(at);
        }}
      >
        {images.map((img) => (
          <a
            key={img.id}
            className="swiper__slide"
            href={resolveMediaUrl(img.url)}
            target="_blank"
            rel="noreferrer"
            title="To'liq hajmda ochish"
          >
            <img src={resolveMediaUrl(img.url)} alt="" loading="lazy" />
          </a>
        ))}
      </div>

      {images.length > 1 ? (
        <>
          <button
            className="swiper__nav swiper__nav--prev"
            onClick={() => go(index - 1)}
            disabled={index === 0}
            aria-label="Oldingi rasm"
          >
            ‹
          </button>
          <button
            className="swiper__nav swiper__nav--next"
            onClick={() => go(index + 1)}
            disabled={index === images.length - 1}
            aria-label="Keyingi rasm"
          >
            ›
          </button>
          <span className="swiper__count">
            {index + 1} / {images.length}
          </span>
          <div className="swiper__dots">
            {images.map((img, i) => (
              <button
                key={img.id}
                className={`swiper__dot${i === index ? " swiper__dot--active" : ""}`}
                onClick={() => go(i)}
                aria-label={`${i + 1}-rasm`}
              />
            ))}
          </div>
        </>
      ) : null}

      {images[index]?.isPrimary ? <span className="swiper__badge">Asosiy</span> : null}
    </div>
  );
}
