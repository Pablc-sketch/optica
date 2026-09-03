"use client";

import { useMemo, useState } from "react";
import { crearReceta } from "@/lib/actions/pacientes";
import { CampoAgudezaVisual, CampoDioptria } from "@/components/campos";
import { rangoParaPosicion, nombreCristal } from "@/lib/cristales";
import { clp } from "@/lib/clp";

// Mismo criterio que en formatearDioptria: coma o punto, vacío o suelto ("+"
// mientras se escribe) es "todavía no hay número".
function aNumero(v: string): number | null {
  const t = v.replace(",", ".").trim();
  if (t === "" || t === "+" || t === "-") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

// Campo óptico numérico simple (eje en grados, DP, altura): sin signo, solo
// teclado decimal para cargar rápido.
function CampoOptico({ name, label, placeholder }: { name: string; label: string; placeholder?: string }) {
  return (
    <label className="flex flex-col gap-1 text-xs font-medium">
      {label}
      <input
        name={name}
        inputMode="decimal"
        placeholder={placeholder ?? "0.00"}
        className="w-full rounded-lg border border-tinta-suave/30 bg-white px-2 py-2 text-center text-base outline-none focus:border-brand"
      />
    </label>
  );
}

type CostoCristal = {
  tipo_lente: string;
  rango_receta: string;
  tratamiento: string;
  costo: number;
  precio_venta: number;
};

// Un solo control que hace las dos cosas a la vez: acá el tecnólogo elige
// qué lente le conviene al paciente (y de paso ve el precio para cotizarle
// en el momento) — y esa MISMA elección es la que se guarda como sugerencia
// de venta. Antes eran dos controles separados (uno para cotizar, otro para
// guardar la sugerencia) y había que elegir dos veces lo mismo; ahora es
// uno solo, así que el rut trae precargado exactamente lo que se conversó.
function SelectorLenteConPrecio({
  titulo,
  costos,
  nombreTipo,
  nombreTratamiento,
  esferas,
  cilindros,
  add,
  posicionSlot,
}: {
  titulo: string;
  costos: CostoCristal[];
  nombreTipo: string;
  nombreTratamiento: string;
  esferas: [number | null, number | null];
  cilindros: [number | null, number | null];
  add: number | null;
  posicionSlot: "lejos" | "cerca";
}) {
  const [tipoLente, setTipoLente] = useState("");
  const [tratamiento, setTratamiento] = useState("");

  const tiposLente = useMemo(() => [...new Set(costos.map((c) => c.tipo_lente))], [costos]);
  // Solo Monofocal de cerca suma la adición al rango — Bifocal/Multifocal
  // ya la traen incorporada al diseño del lente.
  const posicionParaRango = tipoLente === "Monofocal" ? posicionSlot : "lejos";
  const rango = rangoParaPosicion(esferas, cilindros, [add, add], posicionParaRango);
  const tratamientos = useMemo(
    () => costos.filter((c) => c.tipo_lente === tipoLente && c.rango_receta === rango),
    [costos, tipoLente, rango]
  );
  const combo = tratamientos.find((c) => c.tratamiento === tratamiento);

  return (
    <fieldset className="rounded-xl border border-brand/25 bg-brand/5 p-3">
      <legend className="px-1 text-sm font-bold text-brand-dark">{titulo}</legend>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs font-medium">
          Tipo de lente
          <select
            value={tipoLente}
            onChange={(e) => {
              setTipoLente(e.target.value);
              setTratamiento("");
            }}
            className="rounded-lg border border-tinta-suave/30 bg-white px-2 py-2 text-base outline-none focus:border-brand"
          >
            <option value="">— Sin sugerir —</option>
            {tiposLente.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium">
          Tratamiento
          <select
            value={tratamiento}
            onChange={(e) => setTratamiento(e.target.value)}
            disabled={!tipoLente}
            className="rounded-lg border border-tinta-suave/30 bg-white px-2 py-2 text-base outline-none focus:border-brand disabled:opacity-50"
          >
            <option value="">— Sin sugerir —</option>
            {tratamientos.map((t) => (
              <option key={t.tratamiento} value={t.tratamiento}>
                {nombreCristal(t.tipo_lente, t.tratamiento)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {tipoLente && (
        <p className="mt-2 text-xs text-tinta-suave">
          Rango de la receta calculado: <b>{rango}</b>
        </p>
      )}

      {combo && (
        <p className="mt-2 rounded-lg bg-white px-3 py-2.5 text-center text-base font-bold text-brand-dark">
          {combo.precio_venta > 0 ? clp(combo.precio_venta) : "Precio no configurado — revisa /precios"}
        </p>
      )}

      {/* Los selects de arriba no llevan name: son solo para mostrar el
          precio. Lo que de verdad viaja en el formulario son estos dos
          ocultos, para que la sugerencia guardada sea exactamente la misma
          elección que se usó para cotizar. */}
      <input type="hidden" name={nombreTipo} value={tipoLente} />
      <input type="hidden" name={nombreTratamiento} value={tratamiento} />
    </fieldset>
  );
}

export default function NuevaReceta({
  pacienteId,
  operativos,
  costos,
}: {
  pacienteId: string;
  operativos: { id: string; nombre: string }[];
  costos: CostoCristal[];
}) {
  const [tipo, setTipo] = useState<"lejos" | "cerca" | "lejos_y_cerca">("lejos");
  const necesitaCerca = tipo === "lejos_y_cerca";

  // Espejo de los campos ópticos solo para el selector de lente + precio de
  // más abajo — el formulario en sí sigue leyendo por FormData (name), esto
  // no lo toca.
  const [odEsfera, setOdEsfera] = useState<number | null>(null);
  const [odCilindro, setOdCilindro] = useState<number | null>(null);
  const [oiEsfera, setOiEsfera] = useState<number | null>(null);
  const [oiCilindro, setOiCilindro] = useState<number | null>(null);
  const [add, setAdd] = useState<number | null>(null);

  return (
    <details className="rounded-2xl bg-crema-claro p-4 shadow-sm">
      <summary className="cursor-pointer font-semibold text-brand-dark">＋ Nueva receta</summary>
      <form action={crearReceta} className="mt-4 flex flex-col gap-4">
        <input type="hidden" name="paciente_id" value={pacienteId} />

        <label className="flex flex-col gap-1 text-sm font-medium">
          Tipo de lente
          <select
            name="tipo"
            value={tipo}
            onChange={(e) => setTipo(e.target.value as typeof tipo)}
            className="rounded-lg border border-tinta-suave/30 bg-white px-2 py-2.5 text-base outline-none focus:border-brand"
          >
            <option value="lejos">Lejos</option>
            <option value="cerca">Cerca</option>
            <option value="lejos_y_cerca">Lejos y cerca por separado</option>
          </select>
        </label>

        <fieldset className="rounded-xl border border-tinta-suave/20 p-3">
          <legend className="px-1 text-sm font-bold">OD (ojo derecho)</legend>
          <div className="grid grid-cols-3 gap-2">
            <label className="flex flex-col gap-1 text-xs font-medium">
              Esfera
              <CampoDioptria name="od_esfera" signo="libre" onValueChange={(v) => setOdEsfera(aNumero(v))} />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium">
              Cilindro
              <CampoDioptria name="od_cilindro" signo="-" onValueChange={(v) => setOdCilindro(aNumero(v))} />
            </label>
            <CampoOptico name="od_eje" label="Eje °" placeholder="180" />
          </div>
        </fieldset>

        <fieldset className="rounded-xl border border-tinta-suave/20 p-3">
          <legend className="px-1 text-sm font-bold">OI (ojo izquierdo)</legend>
          <div className="grid grid-cols-3 gap-2">
            <label className="flex flex-col gap-1 text-xs font-medium">
              Esfera
              <CampoDioptria name="oi_esfera" signo="libre" onValueChange={(v) => setOiEsfera(aNumero(v))} />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium">
              Cilindro
              <CampoDioptria name="oi_cilindro" signo="-" onValueChange={(v) => setOiCilindro(aNumero(v))} />
            </label>
            <CampoOptico name="oi_eje" label="Eje °" placeholder="175" />
          </div>
        </fieldset>

        {/* Recuadro propio para el ADD: si se examinó lejos y cerca por
            separado, este valor es justo el que define el lente de cerca —
            que quede aparte de esfera/cilindro evita que se confunda con la
            receta de lejos. */}
        <fieldset className="w-40 rounded-xl border border-tinta-suave/20 p-3">
          <legend className="px-1 text-sm font-bold">
            Adición (ADD){necesitaCerca ? " — cerca" : ""}
          </legend>
          <CampoDioptria name="add" signo="+" onValueChange={(v) => setAdd(aNumero(v))} />
        </fieldset>

        {/* Lo que se conversó con el paciente: se cotiza acá mismo y esa
            elección se precarga sola en el punto de venta cuando lo busquen
            por RUT — a la vendedora solo le queda elegir el marco. */}
        <SelectorLenteConPrecio
          titulo={necesitaCerca ? "Lente — lejos" : "Lente sugerido"}
          costos={costos}
          nombreTipo="sugerencia_tipo_lente"
          nombreTratamiento="sugerencia_tratamiento"
          esferas={[odEsfera, oiEsfera]}
          cilindros={[odCilindro, oiCilindro]}
          add={add}
          posicionSlot={tipo === "cerca" ? "cerca" : "lejos"}
        />
        {necesitaCerca && (
          <SelectorLenteConPrecio
            titulo="Lente — cerca"
            costos={costos}
            nombreTipo="sugerencia_tipo_lente_cerca"
            nombreTratamiento="sugerencia_tratamiento_cerca"
            esferas={[odEsfera, oiEsfera]}
            cilindros={[odCilindro, oiCilindro]}
            add={add}
            posicionSlot="cerca"
          />
        )}

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <CampoOptico name="dp" label="DP (mm)" placeholder="63" />
          <CampoOptico name="altura" label="Altura (mm)" placeholder="20" />
          <label className="flex flex-col gap-1 text-xs font-medium">
            AV OD
            <CampoAgudezaVisual name="av_od" />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium">
            AV OI
            <CampoAgudezaVisual name="av_oi" />
          </label>
        </div>

        {operativos.length > 0 && (
          <label className="flex flex-col gap-1 text-xs font-medium">
            Operativo (si el examen fue en terreno)
            <select
              name="operativo_id"
              defaultValue=""
              className="rounded-lg border border-tinta-suave/30 bg-white px-2 py-2 text-base outline-none focus:border-brand"
            >
              <option value="">— Sin especificar —</option>
              {operativos.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.nombre}
                </option>
              ))}
            </select>
          </label>
        )}

        <label className="flex flex-col gap-1 text-xs font-medium">
          Notas
          <textarea name="notas" rows={2} className="rounded-lg border border-tinta-suave/30 bg-white px-3 py-2 text-base outline-none focus:border-brand" />
        </label>

        <div>
          <button className="rounded-lg bg-brand px-4 py-2.5 font-semibold text-white hover:bg-brand-dark">
            Guardar receta
          </button>
        </div>
      </form>
    </details>
  );
}
