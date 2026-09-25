// src/lib/toast.ts
// Toast messages, in their own module: a file that exports both components and
// values breaks Vite's fast refresh, and <Toaster/> lives in ui.tsx.
// Module-scope store: any mutation can announce its outcome without threading
// callbacks through the tree. The Toaster in Layout renders whatever is live.

interface ToastItem {
  id: number;
  text: string;
  tone: "success" | "danger";
}

let items: ToastItem[] = [];
export const toastSubs = new Set<() => void>();
/** Current toasts; a getter so subscribers always read the latest array. */
export const toastItems = () => items;
let toastSeq = 0;

function pushToast(text: string, tone: ToastItem["tone"]) {
  const item = { id: ++toastSeq, text, tone };
  items = [...items, item];
  toastSubs.forEach((fn) => fn());
  setTimeout(() => {
    items = items.filter((t) => t.id !== item.id);
    toastSubs.forEach((fn) => fn());
  }, 3800);
}

export const toast = {
  success: (text: string) => pushToast(text, "success"),
  error: (err: unknown) =>
    pushToast(err instanceof Error ? err.message : String(err ?? "Xatolik"), "danger"),
};

