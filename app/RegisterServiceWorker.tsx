"use client";

import { useEffect } from "react";
import pkg from "../package.json";

/**
 * Registra o service worker (public/sw.js) em produção e em dev.
 * A versão do package.json vira query string (?v=) — é assim que o sw.js sabe
 * qual "geração" de cache criar/limpar (ver comentário no topo de public/sw.js).
 * Componente client isolado e minúsculo de propósito, só side-effect, sem UI.
 */
export default function RegisterServiceWorker() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    const version = (pkg as { version?: string }).version ?? "dev";
    navigator.serviceWorker.register(`/sw.js?v=${encodeURIComponent(version)}`).catch(() => {
      // Falha silenciosa: PWA é um extra, nunca pode impedir o uso normal do site.
    });
  }, []);

  return null;
}
