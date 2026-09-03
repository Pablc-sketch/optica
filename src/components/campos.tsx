"use client";

import { useEffect, useState } from "react";
import { formatearRut } from "@/lib/rut";
import {
  formatearAgudezaVisual,
  formatearDioptria,
  formatearFechaCorta,
  formatearMonto,
  formatearTelefono,
  isoAFechaCorta,
} from "@/lib/formato";

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
  // useState solo lee defaultValue una vez, al montar. Si el dato cambia en
  // el servidor (guardar, recalcular, etc.) sin que el componente se vuelva
  // a montar, el input se quedaba mostrando el valor viejo mientras el
  // resto de la pantalla ya mostraba el nuevo — se resincroniza acá.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resincroniza con el valor del servidor, no estado derivado de un evento
    setValor(formatearRut(String(defaultValue ?? "")));
  }, [defaultValue]);
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
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resincroniza con el valor del servidor, no estado derivado de un evento
    setValor(formatearTelefono(String(defaultValue ?? "")));
  }, [defaultValue]);
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

// Dioptria: esfera va con signo libre (miopía o hipermetropía, lo decide
// quien toma la receta), cilindro siempre negativo, adición siempre
// positiva. El signo se ve en pantalla desde el primer dígito.
export function CampoDioptria({
  name,
  signo,
  placeholder,
  onValueChange,
}: Pick<Props, "name" | "placeholder"> & {
  signo: "+" | "-" | "libre";
  // Para reflejar el valor en algo aparte del formulario (ej. la
  // calculadora de precios de la receta), sin volverlo un input controlado.
  onValueChange?: (valor: string) => void;
}) {
  const [valor, setValor] = useState("");
  return (
    <input
      name={name}
      value={valor}
      onChange={(e) => {
        const formateado = formatearDioptria(e.target.value, signo);
        setValor(formateado);
        onValueChange?.(formateado);
      }}
      inputMode="decimal"
      placeholder={placeholder ?? (signo === "-" ? "-0.50" : signo === "+" ? "+1.50" : "±1.75")}
      className="w-full rounded-lg border border-tinta-suave/30 bg-white px-2 py-2 text-center text-base outline-none focus:border-brand"
    />
  );
}

export function CampoAgudezaVisual({ name }: Pick<Props, "name">) {
  const [valor, setValor] = useState("");
  return (
    <input
      name={name}
      value={valor}
      onChange={(e) => setValor(formatearAgudezaVisual(e.target.value))}
      inputMode="numeric"
      placeholder="20/20"
      className="w-full rounded-lg border border-tinta-suave/30 bg-white px-2 py-2 text-center text-base outline-none focus:border-brand"
    />
  );
}

export function CampoFechaNacimiento({ name, defaultValue }: Pick<Props, "name" | "defaultValue">) {
  const [valor, setValor] = useState(isoAFechaCorta(String(defaultValue ?? "")));
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resincroniza con el valor del servidor, no estado derivado de un evento
    setValor(isoAFechaCorta(String(defaultValue ?? "")));
  }, [defaultValue]);
  return (
    <input
      name={name}
      value={valor}
      onChange={(e) => setValor(formatearFechaCorta(e.target.value))}
      inputMode="numeric"
      placeholder="15/08/1990"
      className={BASE}
    />
  );
}

export function CampoMonto({ name, defaultValue, required, placeholder, className }: Props) {
  const [valor, setValor] = useState(formatearMonto(defaultValue));
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resincroniza con el valor del servidor, no estado derivado de un evento
    setValor(formatearMonto(defaultValue));
  }, [defaultValue]);
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
