"use client";

import { useMemo, useState } from "react";
import { crearReceta, actualizarReceta } from "@/lib/actions/pacientes";
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
function CampoOptico({
  name,
  label,
  placeholder,
  defaultValue,
}: {
  name: string;
  label: string;
  placeholder?: string;
  defaultValue?: number | null;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs font-medium">
      {label}
      <input
        name={name}
        defaultValue={defaultValue ?? undefined}
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

// Lo que trae una receta ya guardada, para precargar el formulario en modo
// edición. Si no llega (modo creación), el formulario parte en blanco.
type RecetaExistente = {
  id: string;
  tipo: string;
  od_esfera: number | null;
  od_cilindro: number | null;
  od_eje: number | null;
  od_add: number | null;
  oi_esfera: number | null;
  oi_cilindro: number | null;
  oi_eje: number | null;
  oi_add: number | null;
  av_od: string | null;
  av_oi: string | null;
  dp: number | null;
  altura: number | null;
  notas: string | null;
  operativo_id: string | null;
  sugerencia_tipo_lente: string | null;
  sugerencia_tratamiento: string | null;
  sugerencia_tipo_lente_cerca: string | null;
  sugerencia_tratamiento_cerca: string | null;
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
  inicialTipoLente,
  inicialTratamiento,
}: {
  titulo: string;
  costos: CostoCristal[];
  nombreTipo: string;
  nombreTratamiento: string;
  esferas: [number | null, number | null];
  cilindros: [number | null, number | null];
  add: number | null;
  posicionSlot: "lejos" | "cerca";
  inicialTipoLente?: string | null;
  inicialTratamiento?: string | null;
}) {
  const [tipoLente, setTipoLente] = useState(inicialTipoLente ?? "");
  const [tratamiento, setTratamiento] = useState(inicialTratamiento ?? "");

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
  receta,
}: {
  pacienteId: string;
  operativos: { id: string; nombre: string }[];
  costos: CostoCristal[];
  // Si viene, el formulario parte precargado y guarda con actualizarReceta
  // en vez de crear una receta nueva.
  receta?: RecetaExistente;
}) {
  type TipoLente = "lejos" | "cerca" | "lejos_y_cerca";
  const [tipo, setTipo] = useState<TipoLente>((receta?.tipo as TipoLente) ?? "lejos");
  const necesitaCerca = tipo === "lejos_y_cerca";

  // Espejo de los campos ópticos solo para el selector de lente + precio de
  // más abajo — el formulario en sí sigue leyendo por FormData (name), esto
  // no lo toca.
  const [odEsfera, setOdEsfera] = useState<number | null>(receta?.od_esfera ?? null);
  const [odCilindro, setOdCilindro] = useState<number | null>(receta?.od_cilindro ?? null);
  const [oiEsfera, setOiEsfera] = useState<number | null>(receta?.oi_esfera ?? null);
  const [oiCilindro, setOiCilindro] = useState<number | null>(receta?.oi_cilindro ?? null);
  const [add, setAdd] = useState<number | null>(receta?.od_add ?? receta?.oi_add ?? null);

  const contenido = (
    <form action={receta ? actualizarReceta : crearReceta} className="mt-4 flex flex-col gap-4">
      <input type="hidden" name="paciente_id" value={pacienteId} />
      {receta && <input type="hidden" name="receta_id" value={receta.id} />}

      {/* Antes era un <select> con "Lejos y cerca por separado" como tercera
          opción de texto — pasaba fácil desapercibida, así que nunca se
          usaba: todas las recetas quedaban con un solo lente sugerido y, al
          vender, el Lente 2 aparecía vacío sin que quedara claro por qué.
          Ahora es la primera pregunta, bien grande, con la consecuencia
          explicada en cada botón. */}
      <fieldset className="rounded-xl border border-tinta-suave/20 p-3">
        <legend className="px-1 text-sm font-bold">¿Cuántos lentes necesita el paciente?</legend>
        <input type="hidden" name="tipo" value={tipo} />
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {(
            [
              { valor: "lejos", titulo: "Uno, para lejos", detalle: "Un solo par." },
              { valor: "cerca", titulo: "Uno, para cerca", detalle: "Un solo par." },
              {
                valor: "lejos_y_cerca",
                titulo: "Dos lentes separados",
                detalle: "Uno para lejos y otro para cerca — se sugiere y cotiza cada uno por su lado.",
              },
            ] as const
          ).map((op) => (
            <label
              key={op.valor}
              className="flex cursor-pointer flex-col gap-0.5 rounded-lg border-2 border-tinta-suave/25 bg-white px-3 py-2.5 has-checked:border-brand has-checked:bg-brand/5"
            >
              <span className="flex items-center gap-1.5 text-sm font-semibold">
                <input
                  type="radio"
                  checked={tipo === op.valor}
                  onChange={() => setTipo(op.valor)}
                  className="accent-brand"
                />
                {op.titulo}
              </span>
              <span className="pl-5 text-xs text-tinta-suave">{op.detalle}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="rounded-xl border border-tinta-suave/20 p-3">
        <legend className="px-1 text-sm font-bold">OD (ojo derecho)</legend>
        <div className="grid grid-cols-3 gap-2">
          <label className="flex flex-col gap-1 text-xs font-medium">
            Esfera
            <CampoDioptria
              name="od_esfera"
              signo="libre"
              defaultValue={receta?.od_esfera}
              onValueChange={(v) => setOdEsfera(aNumero(v))}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium">
            Cilindro
            <CampoDioptria
              name="od_cilindro"
              signo="-"
              defaultValue={receta?.od_cilindro}
              onValueChange={(v) => setOdCilindro(aNumero(v))}
            />
          </label>
          <CampoOptico name="od_eje" label="Eje °" placeholder="180" defaultValue={receta?.od_eje} />
        </div>
      </fieldset>

      <fieldset className="rounded-xl border border-tinta-suave/20 p-3">
        <legend className="px-1 text-sm font-bold">OI (ojo izquierdo)</legend>
        <div className="grid grid-cols-3 gap-2">
          <label className="flex flex-col gap-1 text-xs font-medium">
            Esfera
            <CampoDioptria
              name="oi_esfera"
              signo="libre"
              defaultValue={receta?.oi_esfera}
              onValueChange={(v) => setOiEsfera(aNumero(v))}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium">
            Cilindro
            <CampoDioptria
              name="oi_cilindro"
              signo="-"
              defaultValue={receta?.oi_cilindro}
              onValueChange={(v) => setOiCilindro(aNumero(v))}
            />
          </label>
          <CampoOptico name="oi_eje" label="Eje °" placeholder="175" defaultValue={receta?.oi_eje} />
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
        <CampoDioptria
          name="add"
          signo="+"
          defaultValue={receta?.od_add ?? receta?.oi_add}
          onValueChange={(v) => setAdd(aNumero(v))}
        />
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
        inicialTipoLente={receta?.sugerencia_tipo_lente}
        inicialTratamiento={receta?.sugerencia_tratamiento}
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
          inicialTipoLente={receta?.sugerencia_tipo_lente_cerca}
          inicialTratamiento={receta?.sugerencia_tratamiento_cerca}
        />
      )}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <CampoOptico name="dp" label="DP (mm)" placeholder="63" defaultValue={receta?.dp} />
        <CampoOptico name="altura" label="Altura (mm)" placeholder="20" defaultValue={receta?.altura} />
        <label className="flex flex-col gap-1 text-xs font-medium">
          AV OD
          <CampoAgudezaVisual name="av_od" defaultValue={receta?.av_od} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium">
          AV OI
          <CampoAgudezaVisual name="av_oi" defaultValue={receta?.av_oi} />
        </label>
      </div>

      {operativos.length > 0 && (
        <label className="flex flex-col gap-1 text-xs font-medium">
          Operativo (si el examen fue en terreno)
          <select
            name="operativo_id"
            defaultValue={receta?.operativo_id ?? ""}
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
        <textarea
          name="notas"
          rows={2}
          defaultValue={receta?.notas ?? ""}
          className="rounded-lg border border-tinta-suave/30 bg-white px-3 py-2 text-base outline-none focus:border-brand"
        />
      </label>

      <div>
        <button className="rounded-lg bg-brand px-4 py-2.5 font-semibold text-white hover:bg-brand-dark">
          {receta ? "Guardar cambios" : "Guardar receta"}
        </button>
      </div>
    </form>
  );

  // En modo edición no hace falta el <details>: ya se llegó a esta pantalla
  // a propósito a corregir la receta, no tiene sentido esconder el form.
  if (receta) return contenido;

  return (
    <details className="rounded-2xl bg-crema-claro p-4 shadow-sm">
      <summary className="cursor-pointer font-semibold text-brand-dark">＋ Nueva receta</summary>
      {contenido}
    </details>
  );
}
