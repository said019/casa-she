/// <reference types="vite/client" />

declare global {
  interface Window {
    /**
     * El ServiceWorker nuevo que quedó en estado 'waiting' tras un deploy.
     * Lo setea el registro del SW en main.tsx; el botón "Recargar" de
     * <UpdatePrompt /> le manda SKIP_WAITING para que tome control.
     */
    __bmbWaitingSW?: ServiceWorker;
  }
}

export {};
