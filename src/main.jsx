import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'


// Recover from stale Vite dynamic-import chunks after a deployment. The per-route
// cooldown prevents an automatic reload loop when the underlying failure persists.
const KHAAVIO_PRELOAD_RETRY_PREFIX = "khaavio:preload-retry:";
if (typeof window !== "undefined") {
  window.addEventListener("vite:preloadError", (event) => {
    const retryKey = `${KHAAVIO_PRELOAD_RETRY_PREFIX}${window.location.pathname}`;
    const now = Date.now();
    let shouldReload = true;

    try {
      const lastAttempt = Number(window.sessionStorage.getItem(retryKey) || 0);
      if (lastAttempt && now - lastAttempt < 30_000) {
        shouldReload = false;
      } else {
        window.sessionStorage.setItem(retryKey, String(now));
      }
    } catch {
      // Storage may be blocked; one reload is still preferable to a stuck page.
    }

    if (shouldReload) {
      event.preventDefault();
      window.location.reload();
    } else {
      console.error("[Khaavio] A route chunk could not be loaded. Please retry once the connection is stable.", event.payload);
    }
  });
}
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
