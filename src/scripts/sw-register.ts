// Registers the service worker in production builds only.
// The worker itself lives in public/sw.js and is served from the origin root.
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Registration failures (unsupported browsers, private mode) are non-fatal.
    });
  });
}
