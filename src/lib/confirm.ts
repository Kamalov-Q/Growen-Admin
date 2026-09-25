// Confirmation dialogs, in their own module for the same reason toasts are:
// a file exporting both components and values breaks Vite's fast refresh, and
// <ConfirmHost/> lives in ui.tsx.
//
// Module-scope store, so any handler can ask a question without threading
// dialog state through the tree — and so `confirm()` the browser built-in,
// which blocks the whole tab and cannot be styled or translated, is never
// needed.

export interface ConfirmRequest {
  title: string;
  /** The consequence, in a sentence. Optional for the obvious cases. */
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Renders the affirmative button in the danger palette. */
  destructive?: boolean;
}

interface LiveRequest extends ConfirmRequest {
  resolve: (ok: boolean) => void;
}

let current: LiveRequest | null = null;
export const confirmSubs = new Set<() => void>();
export const currentConfirm = () => current;

function announce() {
  confirmSubs.forEach((fn) => fn());
}

/**
 * Ask, and wait for the answer.
 *
 * A promise rather than a callback: every caller is already inside an async
 * handler, and `if (!(await confirmDialog(...))) return;` reads exactly like
 * the `if (!confirm(...)) return;` it replaces.
 */
export function confirmDialog(request: ConfirmRequest): Promise<boolean> {
  // A second question while one is open would silently drop the first
  // caller's promise; answering no is the safe resolution.
  current?.resolve(false);

  return new Promise<boolean>((resolve) => {
    current = { ...request, resolve };
    announce();
  });
}

/** Called by the host when the person answers. */
export function settleConfirm(ok: boolean) {
  current?.resolve(ok);
  current = null;
  announce();
}
