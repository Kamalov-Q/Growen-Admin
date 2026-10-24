import { API_URL, errorFromResponse, sendWithAuthRetry } from "./api";
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
  // Rebuilt per attempt: a FormData body cannot be replayed after the 401,
  // and the token is read each time so the retry carries the refreshed one.
  const send = () => {
    const form = new FormData();
    form.append("file", file, fileName);

    return fetch(`${API_URL}/media/chat/upload?kind=${kind}`, {
      method: "POST",
      // No Content-Type: only the runtime knows the multipart boundary.
      headers: { Authorization: `Bearer ${sessionStore.getAccessToken()}` },
      body: form,
    });
  };

  const res = await sendWithAuthRetry(send);
  if (!res.ok) throw await errorFromResponse(res, "Yuklashda xatolik");

  return (await res.json()) as UploadedAttachment;
}

/** What `POST /media/upload` gives back per photo: resized, with a thumbnail. */
export interface UploadedPhoto {
  url: string;
  thumbUrl: string;
  width: number;
  height: number;
}

/**
 * Uploads listing photos — the endpoint the app's post form uses, so the
 * server resizes them to 1600px with a 400px thumbnail either way. Returns
 * the photos that made it and the indexes that failed.
 */
export async function uploadListingPhotos(
  files: File[],
): Promise<{ images: UploadedPhoto[]; failed: number[] }> {
  const send = () => {
    const form = new FormData();
    for (const file of files) form.append("files", file, file.name);
    return fetch(`${API_URL}/media/upload`, {
      method: "POST",
      headers: { Authorization: `Bearer ${sessionStore.getAccessToken()}` },
      body: form,
    });
  };

  const res = await sendWithAuthRetry(send);
  if (!res.ok) throw await errorFromResponse(res, "Rasmlarni yuklab bo'lmadi");
  return (await res.json()) as { images: UploadedPhoto[]; failed: number[] };
}
