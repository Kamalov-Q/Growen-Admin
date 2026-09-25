import { useCallback, useRef, useState } from "react";

/**
 * Voice recording in the browser.
 *
 * MediaRecorder picks its own container — webm/opus on Chrome, mp4 on
 * Safari — and the server probes whatever arrives with ffmpeg, so there is
 * nothing to negotiate here beyond handing over the blob.
 */
export function useRecorder() {
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const startedAt = useRef(0);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const start = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mr = new MediaRecorder(stream);

    chunks.current = [];
    mr.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
    mr.start();

    recorder.current = mr;
    startedAt.current = Date.now();
    setRecording(true);
    setSeconds(0);
    timer.current = setInterval(
      () => setSeconds(Math.floor((Date.now() - startedAt.current) / 1000)),
      500,
    );
  }, []);

  /** Resolves with the clip, or null when the recording was thrown away. */
  const stop = useCallback((keep: boolean): Promise<Blob | null> => {
    const mr = recorder.current;
    if (!mr) return Promise.resolve(null);

    return new Promise((resolve) => {
      mr.onstop = () => {
        // Release the microphone: a tab holding it shows a recording dot in
        // the browser chrome long after the desk has finished talking.
        mr.stream.getTracks().forEach((t) => t.stop());
        if (timer.current) clearInterval(timer.current);
        recorder.current = null;
        setRecording(false);
        resolve(keep ? new Blob(chunks.current, { type: mr.mimeType }) : null);
      };
      mr.stop();
    });
  }, []);

  return { recording, seconds, start, stop };
}
