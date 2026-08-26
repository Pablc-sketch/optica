"use client";

import { useEffect } from "react";

// Safari en iPhone no aplica :active al tocar la pantalla a menos que haya
// al menos un listener de touchstart en la página — sin esto, los botones
// no se "hundían" al tocarlos en el celular aunque la animación sí se viera
// en desktop con el mouse. Este componente no hace nada más que existir.
export default function ActivarTap() {
  useEffect(() => {
    document.addEventListener("touchstart", () => {}, { passive: true });
  }, []);
  return null;
}
