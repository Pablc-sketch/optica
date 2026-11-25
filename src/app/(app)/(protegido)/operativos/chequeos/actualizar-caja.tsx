"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function ActualizarCaja() {
  const router = useRouter();
  useEffect(() => {
    const actualizar = () => {
      if (document.visibilityState === "visible" && navigator.onLine && !document.activeElement?.closest("form")) {
        router.refresh();
      }
    };
    const tiempo = window.setInterval(actualizar, 45_000);
    window.addEventListener("online", actualizar);
    return () => {
      window.clearInterval(tiempo);
      window.removeEventListener("online", actualizar);
    };
  }, [router]);

  return null;
}
