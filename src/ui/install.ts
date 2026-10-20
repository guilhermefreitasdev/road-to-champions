/**
 * "Instalar app": keeps the browser's `beforeinstallprompt` event (Chromium only) so the menu can offer the install
 * at the user's request instead of the browser's mini-infobar. The listener is added when this module loads (from
 * main.tsx, before React mounts), since the event can fire before the menu exists.
 */
import { useSyncExternalStore } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    notify();
  });
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Shows the browser's install dialog; the prompt can be used once, so it is dropped afterwards. */
async function install(): Promise<void> {
  const e = deferred;
  if (!e) return;
  deferred = null;
  notify();
  try {
    await e.prompt();
    await e.userChoice;
  } catch {
    // The browser refused (e.g. already shown): nothing else to do.
  }
}

/** The install action while the browser offers one, else null. */
export function useInstallPrompt(): (() => Promise<void>) | null {
  const available = useSyncExternalStore(subscribe, () => deferred !== null, () => false);
  return available ? install : null;
}
