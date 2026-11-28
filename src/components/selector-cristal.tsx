"use client";

import { useId, useState, type ReactNode } from "react";
import { clp } from "@/lib/clp";

type OpcionCristal = {
  id: string;
  nombre: string;
  tratamiento: string;
  origen?: "stock" | "laboratorio";
  precio: number;
  detalle?: ReactNode;
};

const familias = ["Antirreflejo", "Filtro azul", "Fotocromático", "Polarizado", "Otros"] as const;
const limiteInicial = 4;

function normalizar(texto: string) {
  return texto.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/,/g, ".");
}

function familiaDe(tratamiento: string): (typeof familias)[number] {
  const texto = normalizar(tratamiento);
  if (texto.includes("fotocrom")) return "Fotocromático";
  if (texto.includes("polariz")) return "Polarizado";
  if (texto.includes("filtro azul")) return "Filtro azul";
  if (texto.includes("antirreflejo")) return "Antirreflejo";
  return "Otros";
}

export default function SelectorCristal({
  opciones,
  valor,
  onChange,
}: {
  opciones: OpcionCristal[];
  valor: string;
  onChange: (id: string) => void;
}) {
  const id = useId();
  const [editando, setEditando] = useState(false);
  const [familia, setFamilia] = useState<(typeof familias)[number] | "Todos">("Todos");
  const [busqueda, setBusqueda] = useState("");
  const [verTodas, setVerTodas] = useState(false);
  const elegida = opciones.find((opcion) => opcion.id === valor);
  const familiasDisponibles = familias.filter((grupo) => opciones.some((opcion) => familiaDe(opcion.tratamiento) === grupo));
  const terminos = normalizar(busqueda).trim().split(/\s+/).filter(Boolean);
  const filtradas = opciones
    .filter((opcion) => {
      if (terminos.length) {
        const texto = normalizar(`${opcion.nombre} ${familiaDe(opcion.tratamiento)}`);
        return terminos.every((termino) => texto.includes(termino));
      }
      return familia === "Todos" || familiaDe(opcion.tratamiento) === familia;
    })
    .sort((a, b) => Number(b.precio > 0) - Number(a.precio > 0));
  const visibles = verTodas ? filtradas : filtradas.slice(0, limiteInicial);

  function etiqueta(opcion: OpcionCristal, compacta = false) {
    return (
      <>
        <span className="min-w-0 text-left">
          <span className="block text-sm font-medium text-tinta">{opcion.nombre}</span>
          {opcion.origen && (
            <span className={opcion.origen === "stock" ? "text-xs text-emerald-800" : "text-xs text-tinta-suave"}>
              {opcion.origen === "stock" ? "Stock" : "Tallado"}
            </span>
          )}
        </span>
        <span className={`shrink-0 text-right text-sm font-semibold tabular-nums ${opcion.precio > 0 ? "text-violet-900" : "text-amber-900"}`}>
          {opcion.precio > 0 ? (compacta ? clp(opcion.precio) : opcion.detalle ?? clp(opcion.precio)) : "Por cotizar"}
        </span>
      </>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {elegida && !editando ? (
        <button
          type="button"
          onClick={() => {
            setEditando(true);
            setBusqueda("");
            setVerTodas(false);
          }}
          className="flex w-full items-center justify-between gap-2 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2.5"
          aria-label={`Cambiar cristal, ${elegida.nombre}`}
        >
          {etiqueta(elegida, true)}
          <span className="shrink-0 text-xs font-medium text-violet-900 underline">Cambiar</span>
        </button>
      ) : (
        <>
          <label htmlFor={id} className="text-xs font-semibold">Buscar cristal</label>
          <input
            id={id}
            type="search"
            value={busqueda}
            onChange={(evento) => {
              setBusqueda(evento.target.value);
              setVerTodas(false);
            }}
            placeholder="Ej. 1.67 fotocromático"
            className="w-full rounded-lg border border-tinta-suave/30 bg-white px-3 py-2 text-sm outline-none focus:border-violet-500"
          />
          {terminos.length === 0 && familiasDisponibles.length > 1 && (
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Tratamiento">
              {(["Todos", ...familiasDisponibles] as const).map((grupo) => (
                <button
                  key={grupo}
                  type="button"
                  aria-pressed={familia === grupo}
                  onClick={() => {
                    setFamilia(grupo);
                    setVerTodas(false);
                  }}
                  className="rounded-full border border-violet-200 bg-white px-2.5 py-1.5 text-xs font-medium text-violet-900 aria-pressed:border-violet-800 aria-pressed:bg-violet-800 aria-pressed:text-white"
                >
                  {grupo}
                </button>
              ))}
            </div>
          )}
          <ul className="flex flex-col gap-1.5">
            {visibles.map((opcion) => (
              <li key={opcion.id}>
                <button
                  type="button"
                  aria-pressed={opcion.id === valor}
                  onClick={() => {
                    onChange(opcion.id);
                    setEditando(false);
                  }}
                  className="flex w-full items-center justify-between gap-2 rounded-lg border border-tinta-suave/20 bg-white px-3 py-2 hover:border-violet-400 aria-pressed:border-violet-600"
                >
                  {etiqueta(opcion)}
                </button>
              </li>
            ))}
          </ul>
          {filtradas.length === 0 && <p className="text-xs text-tinta-suave">Sin cristales para este filtro.</p>}
          {filtradas.length > limiteInicial && (
            <button type="button" onClick={() => setVerTodas(!verTodas)} className="self-start text-xs font-semibold text-violet-900 underline">
              {verTodas ? "Ver menos" : `Ver las ${filtradas.length} opciones`}
            </button>
          )}
        </>
      )}
    </div>
  );
}
