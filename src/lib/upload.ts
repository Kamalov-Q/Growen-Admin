import { API_URL } from "./api";
import { sessionStore } from "./session";

export type AttachmentKind = "IMAGE" | "VIDEO" | "VOICE" | "FILE";

/** What `POST /media/chat/upload` gives back — ready to send as a message. */
export interface UploadedAttachment {
  url: string;
  thumbUrl: string | null;
  fileName: string;
  fileSize: number;
  mimeType: string;
  durationSec: number | null;
  width: number | null;
  height: number | null;
  /** Computed server-side with ffmpeg, so the browser sends raw audio. */
  waveform: number[] | null;
}

/**
 * Uploads one file for a support reply.
 *
 * The same endpoint the app uses: the server re-encodes images, probes video
 * and builds the voice waveform, so whatever a browser hands over arrives in
 * the shape the thread already knows how to render.
 */
export async function uploadAttachment(
  file: Blob,
  kind: AttachmentKind,
  fileName: string,
): Promise<UploadedAttachment> {
  const form = new FormData();
  form.append("file", file, fileName);

  const res = await fetch(`${API_URL}/media/chat/upload?kind=${kind}`, {
    method: "POST",
    // No Content-Type: only the runtime knows the multipart boundary.
    headers: { Authorization: `Bearer ${sessionStore.getAccessToken()}` },
    body: form,
  });

  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(err.message ?? "Yuklashda xatolik");
  }
  return (await res.json()) as UploadedAttachment;
}
