"use client";

import { useEffect } from "react";

/** Enregistre le service worker une fois la page interactive. */
export function ServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") return;
    const register = () => {
      void navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
    };
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }, []);

  return null;
}
