"use client";

import { useState } from "react";
import { formatearRut } from "@/lib/rut";
import { formatearMonto, formatearTelefono } from "@/lib/formato";

// Campos que corrigen el formato mientras se escribe, para que nadie tenga
// que acordarse de los puntos del RUT ni del +56. El valor que viaja en el
// formulario es el ya formateado; las server actions igual lo normalizan
// por su cuenta, porque un dato puede llegar por otro camino (sync offline).

const BASE =
  "rounded-lg border border-tinta-suave/30 bg-white px-3 py-2.5 text-base outline-none focus:border-brand";

type Props = {
  name: string;
  defaultValue?: string | number | null;
  required?: boolean;
  placeholder?: string;
  className?: string;
};

export function CampoRut({ name, defaultValue, required, placeholder, className }: Props) {
  const [valor, setValor] = useState(formatearRut(String(defaultValue ?? "")));
  return (
    <input
      name={name}
      value={valor}
      onChange={(e) => setValor(formatearRut(e.target.value))}
      required={required}
      inputMode="numeric"
      placeholder={placeholder ?? "12.345.678-9"}
      className={className ?? BASE}
    />
  );
}

export function CampoTelefono({ name, defaultValue, required, placeholder, className }: Props) {
  const [valor, setValor] = useState(formatearTelefono(String(defaultValue ?? "")));
  return (
    <input
      name={name}
      value={valor}
      onChange={(e) => setValor(formatearTelefono(e.target.value))}
      required={required}
      type="tel"
      inputMode="tel"
      placeholder={placeholder ?? "+56 9 1234 5678"}
      className={className ?? BASE}
    />
  );
}

export function CampoMonto({ name, defaultValue, required, placeholder, className }: Props) {
  const [valor, setValor] = useState(formatearMonto(defaultValue));
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-tinta-suave">
        $
      </span>
      <input
        name={name}
        value={valor}
        onChange={(e) => setValor(formatearMonto(e.target.value))}
        required={required}
        inputMode="numeric"
        placeholder={placeholder ?? "0"}
        className={`${className ?? BASE} pl-7 text-right`}
      />
    </div>
  );
}
