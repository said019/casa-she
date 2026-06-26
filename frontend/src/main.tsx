import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);

// Service worker registration:
// - Caches static hashed assets so the app loads fast and works briefly offline.
// - Never caches /api/* so reservas and clases siempre vienen frescas del backend.
// - When a new version of the SW is waiting, we DON'T auto-reload: instead we
//   expose that state (window.__bmbWaitingSW + a 'bmb:update-available' event)
//   so <UpdatePrompt /> can show a small "nueva versión disponible" banner. The
//   banner's button posts SKIP_WAITING; once the new SW takes control, the
//   controllerchange listener below does the actual reload.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    // A new SW is installed and waiting to take over (there IS a controller,
    // so this is a replacement, not the first-ever install). Expose it for the
    // update banner; the banner button decides when to activate + reload.
    const announceWaiting = (newSW: ServiceWorker) => {
      window.__bmbWaitingSW = newSW;
      window.dispatchEvent(new CustomEvent('bmb:update-available'));
    };

    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then((reg) => {
        // Periodic update check (every 5 min while the tab is open)
        setInterval(() => reg.update().catch(() => {}), 5 * 60 * 1000);

        const handleNew = (newSW: ServiceWorker | null) => {
          if (!newSW) return;
          newSW.addEventListener('statechange', () => {
            if (
              newSW.state === 'installed' &&
              navigator.serviceWorker.controller
            ) {
              // A new SW finished installing while the tab was open — announce it
              announceWaiting(newSW);
            }
          });
        };

        // A SW was already waiting when this tab loaded (deploy happened before
        // the tab opened). It's already 'installed' and won't fire another
        // statechange, so announce it directly instead of waiting.
        if (reg.waiting && navigator.serviceWorker.controller) {
          announceWaiting(reg.waiting);
        }
        reg.addEventListener('updatefound', () => handleNew(reg.installing));
      })
      .catch(() => {
        // Silent fail — SW is best-effort, app still works without it.
      });

    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    });
  });
}
