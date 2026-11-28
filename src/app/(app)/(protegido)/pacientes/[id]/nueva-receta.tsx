"use client";

import { nivelesMarcoDisponibles, precioParConMarco, type RecargosMarcos } from "@/lib/niveles-marco";
import { useRef, useState, useTransition, type FormEvent } from "react";
import Link from "next/link";
import { rutaVentaReceta } from "@/lib/contexto-venta";
import { crearReceta, actualizarReceta } from "@/lib/actions/pacientes";
import { encolarAtencion } from "@/lib/offline/atenciones";
import { useAtenciones } from "@/lib/offline/use-atenciones";
import { CampoAgudezaVisual, CampoDioptria } from "@/components/campos";
import SelectorCristal from "@/components/selector-cristal";
import { CampoPresupuestoPar, EstadoPresupuestoPar } from "@/components/presupuesto-par";
import { rangoParaPosicion, nombreCristal } from "@/lib/cristales";
import { clp } from "@/lib/clp";
import { montoANumero } from "@/lib/formato";
import { hoyEnChile } from "@/lib/fechas";
import { motivoFueraDeCajaMultifocal, type CatalogoLaboratorio } from "@/lib/costo-fides";
import { leerSugerenciasExtra, type SugerenciaExtra } from "@/lib/sugerencias";
import { ojosParaCristal, origenCristal, precioVentaCristal, type FilaCristal } from "@/lib/precio-venta";

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

type CostoCristal = FilaCristal;

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
  sugerencias_extra?: SugerenciaExtra[] | null;
};

// El cotizador del tecnólogo. Muestra TODAS las opciones que le sirven a
// esta receta, separadas en las que el laboratorio tiene hechas (stock:
// llegan antes y cuestan menos) y las que hay que mandar a tallar. Así se
// puede aconsejar al paciente una opción de stock sin saberse de memoria la
// lista de Fides. Lo que se elige acá queda guardado como sugerencia y se
// precarga en el punto de venta.
function SelectorLenteConPrecio({
  titulo,
  tiposPermitidos,
  costos,
  catalogoLab,
  recargosMarcos = null,
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
  tiposPermitidos: string[];
  costos: CostoCristal[];
  catalogoLab: CatalogoLaboratorio;
  recargosMarcos?: RecargosMarcos | null;
  nombreTipo: string;
  nombreTratamiento: string;
  esferas: [number | null, number | null];
  cilindros: [number | null, number | null];
  add: number | null;
  posicionSlot: "lejos" | "cerca";
  inicialTipoLente?: string | null;
  inicialTratamiento?: string | null;
}) {
  const inicial =
    inicialTipoLente && inicialTratamiento && tiposPermitidos.includes(inicialTipoLente)
      ? `${inicialTipoLente}|${inicialTratamiento}`
      : "";
  const [elegido, setElegido] = useState(inicial);
  const [presupuestoTexto, setPresupuestoTexto] = useState("");
  const presupuesto = presupuestoTexto === "" ? null : montoANumero(presupuestoTexto);
  const categorias = recargosMarcos ? nivelesMarcoDisponibles(recargosMarcos) : [];
  const [tipoLente, tratamiento] = elegido ? elegido.split("|") : ["", ""];

  const potencias = {
    od_esfera: esferas[0],
    od_cilindro: cilindros[0],
    od_add: add,
    oi_esfera: esferas[1],
    oi_cilindro: cilindros[1],
    oi_add: add,
  };
  const hayReceta = esferas.some((e) => e !== null) || cilindros.some((c) => c !== null) || add !== null;

  // Cada opción con su precio y de dónde sale, para ESTA receta. Solo el
  // Monofocal de cerca suma la ADD al rango; bifocal y multifocal la traen
  // en el diseño del cristal.
  const hoy = hoyEnChile();
  const opciones = tiposPermitidos.flatMap((tipo) => {
      const posicion = tipo === "Monofocal" ? posicionSlot : "lejos";
      const rango = rangoParaPosicion(esferas, cilindros, [add, add], posicion);
      return costos
        .filter((c) => c.tipo_lente === tipo && c.rango_receta === rango)
        .map((fila) => {
          const origen = origenCristal(fila, hayReceta ? potencias : null, posicion, catalogoLab, hoy);
          return {
            fila,
            origen,
            precio: precioVentaCristal(fila, origen),
            precioLaboratorio: precioVentaCristal(fila, "laboratorio"),
          };
        });
  });

  const deStock = opciones.filter((o) => o.origen === "stock");
  const esBifMulti = tiposPermitidos.some((t) => t !== "Monofocal");
  const motivoSinStock =
    esBifMulti && hayReceta && deStock.length === 0
      ? motivoFueraDeCajaMultifocal(ojosParaCristal(potencias, "Multifocal", "lejos"))
      : null;

  const opcionesSelector = opciones.map(o => ({
    id: `${o.fila.tipo_lente}|${o.fila.tratamiento}`,
    nombre: nombreCristal(o.fila.tipo_lente, o.fila.tratamiento),
    tratamiento: o.fila.tratamiento,
    origen: hayReceta ? o.origen : undefined,
    precio: o.precio,
    detalle: <>{categorias.length > 0 ? categorias.map(nivel => {
      const precio = precioParConMarco(o.precio, nivel.id, recargosMarcos);
      return (
        <span key={nivel.id} className={nivel.id === "esencial" ? "block" : "block text-xs font-medium"}>
          {nivel.nombre} {clp(precio)}
          <EstadoPresupuestoPar precio={precio} presupuesto={presupuesto} />
        </span>
      );
    }) : <>{clp(o.precio)}<EstadoPresupuestoPar precio={o.precio} presupuesto={presupuesto} /></>}
      {/* Un lente de stock también se puede mandar a tallar: si el precio
          cambia, se muestra también el de laboratorio. */}
      {hayReceta && o.origen === "stock" && o.precioLaboratorio > 0 && o.precioLaboratorio !== o.precio && (
        <span className="block text-[11px] font-normal text-tinta-suave">tallado {clp(o.precioLaboratorio)}</span>
      )}</>,
  }));

  return (
    <fieldset className="rounded-xl border border-brand/25 bg-brand/5 p-3">
      <legend className="px-1 text-sm font-bold text-brand-dark">{titulo}</legend>

      {!hayReceta && (
        <p className="mb-2 text-xs text-tinta-suave">
          Escribe la receta arriba y te digo qué opciones salen de stock.
        </p>
      )}

      {opciones.some(o => o.precio > 0) && (
        <div className="mb-3">
          <CampoPresupuestoPar valor={presupuestoTexto} onChange={setPresupuestoTexto} />
        </div>
      )}

      {hayReceta && deStock.length === 0 && (
        <p className="mb-2 rounded-lg bg-white px-3 py-2 text-xs text-tinta-suave">
          Para esta receta las opciones son talladas
          {motivoSinStock ? `: ${motivoSinStock}.` : "."}
        </p>
      )}

      <SelectorCristal opciones={opcionesSelector} valor={elegido} onChange={setElegido} />

      {(() => {
        const sel = opciones.find((o) => `${o.fila.tipo_lente}|${o.fila.tratamiento}` === elegido);
        if (!sel) return null;
        return (
          <div className="mt-3 rounded-xl bg-white px-4 py-3 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-wider text-tinta-suave">Elegido para este paciente</p>
            <p className="mt-0.5 font-semibold">{nombreCristal(sel.fila.tipo_lente, sel.fila.tratamiento)}</p>
            <p className="text-2xl font-bold tracking-tight text-brand-dark tabular-nums">
              {sel.precio > 0 ? clp(sel.precio) : "Por cotizar"}
            </p>
            {sel.precio > 0 && recargosMarcos && (
              <p className="my-2 text-sm">
                {categorias.map(n => `${n.nombre} ${clp(precioParConMarco(sel.precio, n.id, recargosMarcos))}`).join(" · ")}
                <br />Precio por par, IVA incluido.
              </p>
            )}
            <p className="text-sm text-tinta-suave">
              {!hayReceta
                ? "Escribe la receta para saber si sale de stock."
                : sel.origen === "stock"
                  ? sel.precioLaboratorio > 0 && sel.precioLaboratorio !== sel.precio
                    ? `Figura en stock de Fides. Precio de referencia para tallado: ${clp(sel.precioLaboratorio)}.`
                    : "Figura en stock de Fides."
                  : "Se cotiza tallado a medida."}
            </p>
          </div>
        );
      })()}

      {elegido && (
        <button
          type="button"
          onClick={() => setElegido("")}
          className="mt-2 text-xs text-tinta-suave underline"
        >
          Quitar la sugerencia
        </button>
      )}

      {/* Lo que viaja en el formulario: la misma elección que se cotizó. */}
      <input type="hidden" name={nombreTipo} value={tipoLente} />
      <input type="hidden" name={nombreTratamiento} value={tratamiento} />
    </fieldset>
  );
}

export default function NuevaReceta({
  pacienteId,
  operativos,
  costos,
  catalogoLab,
  recargosMarcos = null,
  receta,
  operativoInicial,
  puedeVender = false,
  usuarioId,
  abierto = false,
}: {
  pacienteId: string;
  operativos: { id: string; nombre: string }[];
  costos: CostoCristal[];
  catalogoLab: CatalogoLaboratorio;
  recargosMarcos?: RecargosMarcos | null;
  // Si viene, el formulario parte precargado y guarda con actualizarReceta
  // en vez de crear una receta nueva.
  receta?: RecetaExistente;
  operativoInicial?: string;
  puedeVender?: boolean;
  usuarioId?: string;
  abierto?: boolean;
}) {
  // Qué se le va a hacer al paciente. "Multifocal" es UN lente que sirve
  // para lejos y cerca; "dos pares" son dos lentes monofocales distintos.
  // En la base se guarda como el tipo de receta de siempre (lejos, cerca o
  // lejos_y_cerca): un bifocal/multifocal es una receta de lejos y cerca.
  type Modo = "lejos" | "cerca" | "multifocal" | "dos_pares";
  const esBifMulti = (t: string | null | undefined) => t === "Bifocal" || t === "Multifocal";
  const modoInicial: Modo = !receta
    ? "lejos"
    : receta.tipo === "cerca"
      ? "cerca"
      : esBifMulti(receta.sugerencia_tipo_lente) && !receta.sugerencia_tipo_lente_cerca
        ? "multifocal"
        : receta.tipo === "lejos_y_cerca"
          ? "dos_pares"
          : "lejos";
  const [modo, setModo] = useState<Modo>(modoInicial);

  // Pares extra (además del lente principal): por ejemplo un polarizado de
  // sol y un monofocal de cerca para alguien que se lleva varios.
  type ModoExtra = "lejos" | "cerca" | "multifocal";
  const extrasIniciales = leerSugerenciasExtra(receta?.sugerencias_extra);
  const [extras, setExtras] = useState<{ id: number; modo: ModoExtra; inicial?: SugerenciaExtra }[]>(
    extrasIniciales.map((e, i) => ({
      id: i,
      modo: esBifMulti(e.tipo_lente) ? "multifocal" : e.posicion === "cerca" ? "cerca" : "lejos",
      inicial: e,
    }))
  );
  const siguienteExtra = useRef(extrasIniciales.length);
  const tipo = modo === "lejos" ? "lejos" : modo === "cerca" ? "cerca" : "lejos_y_cerca";
  const necesitaCerca = modo !== "lejos";

  // Espejo de los campos ópticos solo para el selector de lente + precio de
  // más abajo — el formulario en sí sigue leyendo por FormData (name), esto
  // no lo toca.
  const [odEsfera, setOdEsfera] = useState<number | null>(receta?.od_esfera ?? null);
  const [odCilindro, setOdCilindro] = useState<number | null>(receta?.od_cilindro ?? null);
  const [oiEsfera, setOiEsfera] = useState<number | null>(receta?.oi_esfera ?? null);
  const [oiCilindro, setOiCilindro] = useState<number | null>(receta?.oi_cilindro ?? null);
  const [add, setAdd] = useState<number | null>(receta?.od_add ?? receta?.oi_add ?? null);

  // Una receta nueva lleva su propio id desde el formulario: aunque se
  // toque "Guardar" dos veces, queda una sola. Se crea al enviar (no al
  // dibujar la página) y se renueva al empezar otra receta.
  const idNuevo = useRef("");
  const [guardada, setGuardada] = useState<{ id: string; operativoId: string } | null>(null);
  const atenciones = useAtenciones(usuarioId, guardada?.id);
  const [guardando, iniciar] = useTransition();
  const [errorGuardado, setErrorGuardado] = useState<string | null>(null);
  const [cambiosGuardados, setCambiosGuardados] = useState(false);
  const [vuelta, setVuelta] = useState(0);

  function guardar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (guardando) return;
    const formData = new FormData(evento.currentTarget);
    setErrorGuardado(null);
    setCambiosGuardados(false);
    iniciar(async () => {
      try {
        if (receta) {
          await actualizarReceta(formData);
          setCambiosGuardados(true);
          return;
        }
        if (!idNuevo.current) idNuevo.current = crypto.randomUUID();
        formData.set("receta_id_nuevo", idNuevo.current);
        if (usuarioId) await encolarAtencion(usuarioId, "receta", formData, idNuevo.current);
        else await crearReceta(formData);
        setGuardada({ id: idNuevo.current, operativoId: String(formData.get("operativo_id") ?? "") });
      } catch {
        setErrorGuardado("No se pudo confirmar el guardado. Tus datos siguen en pantalla. Revisa la conexión y vuelve a intentar.");
      }
    });
  }

  if (guardada) {
    const registro = atenciones?.find(a => a.id === guardada.id);
    const pendiente = usuarioId && (!atenciones || registro);
    return (
      <div className="flex flex-col items-start gap-3 rounded-2xl bg-emerald-50 p-4 text-emerald-900 shadow-sm">
        <p className="font-semibold">{registro?.error ? "Receta guardada en este equipo. Revisa el aviso de sincronización." : pendiente ? "✓ Receta guardada en este equipo. Se enviará automáticamente." : "✓ Receta guardada."}</p>
        {!pendiente && <div className="flex flex-wrap gap-3 text-sm font-semibold">
          <Link className="underline" href={`/pacientes/${pacienteId}/receta/${guardada.id}`}>Ver receta</Link>
          {puedeVender && <Link className="underline" href={rutaVentaReceta(guardada.id, guardada.operativoId)}>Abrir esta receta en caja</Link>}
        </div>}
        <button
          type="button"
          onClick={() => {
            idNuevo.current = "";
            setOdEsfera(null);
            setOdCilindro(null);
            setOiEsfera(null);
            setOiCilindro(null);
            setAdd(null);
            setModo("lejos");
            setExtras([]);
            setGuardada(null);
            setVuelta((v) => v + 1);
          }}
          className="rounded-lg border border-emerald-700/30 bg-white px-4 py-2 text-sm font-semibold"
        >
          ＋ Otra receta
        </button>
      </div>
    );
  }

  const contenido = (
    <form key={vuelta} onSubmit={guardar} className="mt-4 flex flex-col gap-4">
      <input type="hidden" name="paciente_id" value={pacienteId} />
      {receta && <input type="hidden" name="receta_id" value={receta.id} />}

      <fieldset className="rounded-xl border border-tinta-suave/20 p-3">
        <legend className="px-1 text-sm font-bold">¿Qué lente necesita?</legend>
        <input type="hidden" name="tipo" value={tipo} />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {(
            [
              { valor: "lejos", titulo: "Lejos", detalle: "Monofocal" },
              { valor: "cerca", titulo: "Cerca", detalle: "Monofocal de lectura" },
              { valor: "multifocal", titulo: "Bifocal o multifocal", detalle: "Un lente para lejos y cerca" },
              { valor: "dos_pares", titulo: "Dos pares", detalle: "Uno de lejos y otro de cerca" },
            ] as const
          ).map((op) => (
            <label
              key={op.valor}
              className="flex cursor-pointer flex-col gap-0.5 rounded-lg border-2 border-tinta-suave/25 bg-white px-3 py-2.5 has-checked:border-brand has-checked:bg-brand/5"
            >
              <span className="flex items-center gap-1.5 text-sm font-semibold">
                <input
                  type="radio"
                  checked={modo === op.valor}
                  onChange={() => setModo(op.valor)}
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

      <fieldset className="w-40 rounded-xl border border-tinta-suave/20 p-3">
        <legend className="px-1 text-sm font-bold">
          ADD{necesitaCerca ? "" : " (si tiene)"}
        </legend>
        <CampoDioptria
          name="add"
          signo="+"
          defaultValue={receta?.od_add ?? receta?.oi_add}
          onValueChange={(v) => setAdd(aNumero(v))}
        />
      </fieldset>

      {/* key={modo}: al cambiar de opción arriba, la elección de abajo
          parte de nuevo con las opciones que corresponden. */}
      <SelectorLenteConPrecio
        key={modo}
        titulo={modo === "dos_pares" ? "Lente de lejos" : modo === "multifocal" ? "Bifocal o multifocal" : "Lente"}
        tiposPermitidos={modo === "multifocal" ? ["Bifocal", "Multifocal"] : ["Monofocal"]}
        costos={costos}
        catalogoLab={catalogoLab} recargosMarcos={recargosMarcos}
        nombreTipo="sugerencia_tipo_lente"
        nombreTratamiento="sugerencia_tratamiento"
        esferas={[odEsfera, oiEsfera]}
        cilindros={[odCilindro, oiCilindro]}
        add={add}
        posicionSlot={modo === "cerca" ? "cerca" : "lejos"}
        inicialTipoLente={receta?.sugerencia_tipo_lente}
        inicialTratamiento={receta?.sugerencia_tratamiento}
      />
      {modo === "dos_pares" && (
        <SelectorLenteConPrecio
          titulo="Lente de cerca"
          tiposPermitidos={["Monofocal"]}
          costos={costos}
          catalogoLab={catalogoLab} recargosMarcos={recargosMarcos}
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

      <input type="hidden" name="extras_cantidad" value={extras.length} />
      <input type="hidden" name="extras_habia" value={extrasIniciales.length} />
      {extras.map((extra, i) => (
        <div key={extra.id} className="flex flex-col gap-2 rounded-xl border border-dashed border-brand/40 p-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-bold text-brand-dark">Otro par</span>
            {(
              [
                { valor: "lejos", titulo: "Lejos" },
                { valor: "cerca", titulo: "Cerca" },
                { valor: "multifocal", titulo: "Bifocal o multifocal" },
              ] as const
            ).map((op) => (
              <label
                key={op.valor}
                className="flex cursor-pointer items-center gap-1 rounded-lg border border-tinta-suave/25 bg-white px-2 py-1 text-xs font-semibold has-checked:border-brand has-checked:bg-brand/5"
              >
                <input
                  type="radio"
                  checked={extra.modo === op.valor}
                  onChange={() =>
                    setExtras((prev) => prev.map((x) => (x.id === extra.id ? { ...x, modo: op.valor, inicial: undefined } : x)))
                  }
                  className="accent-brand"
                />
                {op.titulo}
              </label>
            ))}
            <button
              type="button"
              onClick={() => setExtras((prev) => prev.filter((x) => x.id !== extra.id))}
              className="ml-auto text-xs text-red-700 underline"
            >
              Quitar este par
            </button>
          </div>
          <input type="hidden" name={`extra_posicion_${i}`} value={extra.modo === "cerca" ? "cerca" : extra.modo === "lejos" ? "lejos" : ""} />
          <SelectorLenteConPrecio
            key={`${extra.id}-${extra.modo}`}
            titulo={extra.modo === "multifocal" ? "Bifocal o multifocal" : extra.modo === "cerca" ? "Lente de cerca" : "Lente de lejos"}
            tiposPermitidos={extra.modo === "multifocal" ? ["Bifocal", "Multifocal"] : ["Monofocal"]}
            costos={costos}
            catalogoLab={catalogoLab} recargosMarcos={recargosMarcos}
            nombreTipo={`extra_tipo_${i}`}
            nombreTratamiento={`extra_tratamiento_${i}`}
            esferas={[odEsfera, oiEsfera]}
            cilindros={[odCilindro, oiCilindro]}
            add={add}
            posicionSlot={extra.modo === "cerca" ? "cerca" : "lejos"}
            inicialTipoLente={extra.inicial?.tipo_lente}
            inicialTratamiento={extra.inicial?.tratamiento}
          />
        </div>
      ))}
      {extras.length < 4 && (
        <button
          type="button"
          onClick={() => setExtras((prev) => [...prev, { id: siguienteExtra.current++, modo: "lejos" }])}
          className="rounded-lg border-2 border-dashed border-brand/40 bg-white px-4 py-3 text-sm font-semibold text-brand-dark hover:bg-brand/5"
        >
          ＋ Agregar otro par (por ejemplo, lentes de sol o de cerca)
        </button>
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
          Operativo (si fue en terreno)
          <select
            name="operativo_id"
            defaultValue={receta?.operativo_id ?? operativoInicial ?? ""}
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

      {errorGuardado && <p role="alert" className="rounded-lg bg-red-100 p-3 text-sm font-semibold text-red-900">{errorGuardado}</p>}
      {cambiosGuardados && <p role="status" className="text-sm font-semibold text-emerald-900">Cambios guardados.</p>}
      <div>
        <button type="submit" disabled={guardando} className="rounded-lg bg-brand px-5 py-3 font-semibold text-white hover:bg-brand-dark disabled:opacity-60">
          {guardando ? "Guardando…" : receta ? "Guardar cambios" : "Guardar receta"}
        </button>
      </div>
    </form>
  );

  // En modo edición no hace falta el <details>: ya se llegó a esta pantalla
  // a propósito a corregir la receta, no tiene sentido esconder el form.
  if (receta) return contenido;

  return (
    <details open={abierto || operativoInicial ? true : undefined} className="rounded-2xl bg-crema-claro p-4 shadow-sm">
      <summary className="cursor-pointer font-semibold text-brand-dark">＋ Nueva receta</summary>
      {contenido}
    </details>
  );
}
