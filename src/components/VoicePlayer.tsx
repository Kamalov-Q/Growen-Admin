import { useEffect, useRef, useState } from "react";

/** Fallback shape when a clip carries no waveform — flat bars beat none. */
const FLAT = Array<number>(40).fill(40);

const mmss = (sec: number) => {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/**
 * A voice note, drawn the way the app draws it: a play button, the recorded
 * waveform, and the clock.
 *
 * The bars are the real amplitudes the recorder captured, so a moderator sees
 * the same shape the customer saw — which matters when the question is "did
 * they shout at you", and a filename link answers nothing.
 */
export function VoicePlayer({
  url,
  durationSec,
  waveform,
}: {
  url: string;
  durationSec: number | null;
  waveform?: number[] | null;
}) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  // The clip's own length, once known: older recordings stored 0 and would
  // otherwise read 0:00 forever.
  const [loaded, setLoaded] = useState(durationSec ?? 0);

  useEffect(() => {
    const el = audio.current;
    if (!el) return;

    const onTime = () =>
      setProgress(el.duration ? el.currentTime / el.duration : 0);
    const onMeta = () => {
      if (Number.isFinite(el.duration)) setLoaded(el.duration);
    };
    const onEnd = () => {
      setPlaying(false);
      setProgress(0);
    };

    el.addEventListener("timeupdate", onTime);
    el.addEventListener("loadedmetadata", onMeta);
    el.addEventListener("ended", onEnd);
    return () => {
      el.removeEventListener("timeupdate", onTime);
      el.removeEventListener("loadedmetadata", onMeta);
      el.removeEventListener("ended", onEnd);
    };
  }, []);

  const toggle = () => {
    const el = audio.current;
    if (!el) return;

    if (playing) {
      el.pause();
      setPlaying(false);
      return;
    }
    // Pause every other clip first: two voice notes talking over each other
    // is the one thing worse than neither playing.
    document.querySelectorAll("audio").forEach((other) => {
      if (other !== el) other.pause();
    });
    void el.play();
    setPlaying(true);
  };

  const bars = waveform?.length ? waveform : FLAT;
  const elapsed = loaded * progress;

  return (
    <div className="voice">
      <button
        className="voice__btn"
        onClick={toggle}
        aria-label={playing ? "Pause" : "Play"}
      >
        {playing ? "❚❚" : "▶"}
      </button>

      <div
        className="voice__wave"
        onClick={(e) => {
          // Click to seek: the bar is a timeline, so it should behave like one.
          const el = audio.current;
          if (!el || !Number.isFinite(el.duration)) return;
          const box = e.currentTarget.getBoundingClientRect();
          el.currentTime = ((e.clientX - box.left) / box.width) * el.duration;
        }}
      >
        {bars.map((v, i) => (
          <span
            key={i}
            className={`voice__bar${i / bars.length <= progress ? " voice__bar--played" : ""}`}
            style={{ height: `${Math.max(12, Math.min(100, v))}%` }}
          />
        ))}
      </div>

      <span className="voice__time muted">
        {mmss(playing || progress > 0 ? elapsed : loaded)}
      </span>

      <audio ref={audio} src={url} preload="metadata" />
    </div>
  );
}
