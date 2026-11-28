"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { registrarVenta, type VentaInput } from "@/lib/actions/ventas";
import { coincidePaciente } from "@/lib/buscar-paciente";
import { filtrarProductos, marcoPorCodigo, sugerirDetallesMarco, sugerirMarcosPorCodigo } from "@/lib/buscar-producto";
import ElegirCobroMercadoPago from "@/components/elegir-cobro-mercadopago";
import SelectorCristal from "@/components/selector-cristal";
import CampoVoucher from "@/components/campo-voucher";
import { CampoPresupuestoPar, EstadoPresupuestoPar } from "@/components/presupuesto-par";
import { requiereVoucher, validarVoucher } from "@/lib/voucher";
import { encolarVenta, fallidas, pendientes, suscribirVentas, ventaConfirmada } from "@/lib/offline/outbox";
import { useAtencionesParaVenta } from "@/lib/offline/use-atenciones";
import { nivelesMarcoDisponibles, nivelesMarcoInventarioGlobal, nombreNivelMarco, NIVELES_MARCO, type NivelMarco, type RecargosMarcos } from "@/lib/niveles-marco";
import { lineaRecargo, precioListaMarco } from "@/lib/recargos-venta";
import { MAX_PARES } from "@/lib/venta-normalizar";
import { resolverContextoVenta } from "@/lib/contexto-venta";
import { calcularPrecioAcordado, faltaPacienteParaGuardar, quitarHuerfanos, repartirDescuento } from "@/lib/carrito";
import { abonoMinimoDe, tasaDelMedio } from "@/lib/abono-minimo";
import { montoAbono, montosSugeridosAbono } from "@/lib/monto-abono";
import { COSTO_MARCO_POR_PAR } from "@/lib/costo-venta";
import RegistrarConsulta from "../cobros/registrar-consulta";
import type { SugerenciaExtra } from "@/lib/sugerencias";
import { clp } from "@/lib/clp";
import { formatearRut } from "@/lib/rut";
import { formatearMonto, montoANumero } from "@/lib/formato";
import { limitesDeRango, rangoParaPosicion, nombreCristal } from "@/lib/cristales";
import { IVA, type CatalogoLaboratorio, type CostoCristal as CostoReal } from "@/lib/costo-fides";
import { costoRealCristal, ojosParaCristal, origenCristal as origenDelCristal, precioVentaCristal } from "@/lib/precio-venta";
import { fechaLegible, hoyEnChile } from "@/lib/fechas";

type Paciente = { id: string; nombre: string; rut: string | null };
type Producto = { id: string; nombre: string; marca: string | null; precio_venta: number; categoria: string; sku?: string | null; modelo?: string | null; codigo_color?: string | null; material?: string | null; color?: string | null; recargo_marco?: number | null; stock?: number; costo?: number };
// Una fila del catálogo de /precios: el precio al que se vende, más el
// puente hacia la lista del laboratorio para poder calcular el costo real.
type CostoCristal = {
  tipo_lente: string;
  rango_receta: string;
  tratamiento: string;
  costo: number;
  costo_stock: number | null;
  precio_venta: number;
  // Precio a cobrar cuando el cristal sale de stock (ya hecho), separado
  // del precio de laboratorio (precio_venta) — igual que el costo ya
  // estaba separado. null = este rango nunca sale de stock para este
  // tratamiento, se cobra siempre precio_venta.
  precio_venta_stock: number | null;
  exige_tarifa?: boolean;
  material_stock: string | null;
  material_laboratorio: string | null;
  diseno_laboratorio: string | null;
  montaje_material: string | null;
  diseno_laboratorio_proximo: string | null;
  diseno_proximo_desde: string | null;
};

// Lo que necesitamos de la última receta del paciente: esfera/cilindro
// para calcular sola el rango de costo, y la sugerencia que dejó el
// tecnólogo para precargar el cristal sin que la vendedora tenga que
// preguntar ni calcular nada.
type RecetaResumen = {
  id: string;
  tipo: string;
  operativo_id: string | null;
  od_esfera: number | null;
  od_cilindro: number | null;
  od_add: number | null;
  oi_esfera: number | null;
  oi_cilindro: number | null;
  oi_add: number | null;
  sugerencia_tipo_lente: string | null;
  sugerencia_tratamiento: string | null;
  sugerencia_tipo_lente_cerca: string | null;
  sugerencia_tratamiento_cerca: string | null;
  sugerencias_extra?: SugerenciaExtra[] | null;
};

type LineaCarrito = {
  key: string;
  productoId?: string;
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
  // Datos del cristal: con esto la venta crea sola la orden de trabajo.
  cristal?: {
    tipoLente: string;
    rangoReceta: string;
    tratamiento: string;
    // Costo de respaldo, del catálogo de /precios. El costo que de verdad
    // se guarda sale de la lista del laboratorio calculada contra la
    // receta (ver costoRealDeLinea); esto solo cubre el caso de que falte
    // la equivalencia con el catálogo del laboratorio.
    costoLaboratorio: number;
    // Solo se usa para calcular el rango con la adición (ADD) cuando es un
    // Monofocal de cerca — para mostrar en pantalla siempre se habla de
    // "Lente 1"/"Lente 2" (un Bifocal no tiene "lejos" o "cerca").
    posicion?: "lejos" | "cerca";
    sugerido?: boolean;
  };
  // A cuál de los dos lentes corresponde este armazón (1 o 2) — así cada
  // par queda explícitamente emparejado con su lente y no depende del
  // orden en que se hayan ido tocando en pantalla.
  armazonSlot?: number;
  recargoSlot?: number;
  recargoEspecial?: number;
  recargoEditado?: boolean;
  esCortesia?: boolean;
  precioPendiente?: boolean;
  nivelMarco?: NivelMarco;
  // El paciente trajo su propio marco: no hay productoId (no sale de
  // nuestro stock, no se descuenta inventario ni se cuenta el costo de
  // reposición), pero el cupo queda "lleno" igual — sin esto quedaba
  // indistinguible de que a la vendedora se le olvidó registrar el marco.
  marcoPropio?: boolean;
  // Marco descrito en palabras ("acetato rojo"), sin cargarlo al inventario.
  marcoDescrito?: string;
  codigoMarco?: string;
};

// La venta se arma en cuatro pasos, uno por pantalla, en vez de mostrar
// todos los controles a la vez: quien vende en el mesón sigue una sola
// instrucción por vez y no tiene que saber de antemano qué mirar primero.
// Primero los cristales (donde se define el precio) y recién al final el
// armazón, cuya línea determina el recargo por par.
const PASOS = ["Paciente", "Cristales", "Marco", "Pago"] as const;

// Abono mínimo por tipo de lente: números cerrados y fáciles de recordar,
// no el costo exacto del laboratorio (que varía por tratamiento y rango).
// Quedan un poco por sobre el costo real para dejar margen — así el abono
// siempre alcanza para mandar a hacer el cristal sin poner plata propia.
const ABONO_MINIMO_POR_TIPO: Record<string, number> = {
  Monofocal: 10000,
  Bifocal: 40000,
  Multifocal: 80000,
};

const OPCIONES_ABONO = [
  { modo: "total", titulo: "Paga todo" },
  { modo: "mitad", titulo: "Mitad" },
  { modo: "minimo", titulo: "Abono mínimo" },
] as const;

type AbonoElegido = { modo: (typeof OPCIONES_ABONO)[number]["modo"] } | { modo: "manual"; texto: string };

// Un color bien distinto por paso — alto contraste a propósito, para que
// sea fácil seguir en qué parte de la venta se está de un vistazo (pedido
// explícito: quien vende tiene baja visión).
const COLOR_PASO = [
  {
    pill: "bg-blue-800 text-white shadow-sm",
    pillHecho: "bg-blue-50 text-blue-900 hover:bg-blue-100",
    seccion: "border-blue-800/20 bg-white",
    titulo: "text-blue-900",
    aviso: "bg-blue-50 text-blue-900",
  },
  {
    pill: "bg-violet-800 text-white shadow-sm",
    pillHecho: "bg-violet-50 text-violet-900 hover:bg-violet-100",
    seccion: "border-violet-800/20 bg-white",
    titulo: "text-violet-900",
    aviso: "bg-violet-50 text-violet-900",
  },
  {
    pill: "bg-amber-700 text-white shadow-sm",
    pillHecho: "bg-amber-50 text-amber-900 hover:bg-amber-100",
    seccion: "border-amber-700/25 bg-white",
    titulo: "text-amber-900",
    aviso: "bg-amber-50 text-amber-900",
  },
  {
    pill: "bg-emerald-800 text-white shadow-sm",
    pillHecho: "bg-emerald-50 text-emerald-900 hover:bg-emerald-100",
    seccion: "border-emerald-800/20 bg-white",
    titulo: "text-emerald-900",
    aviso: "bg-emerald-50 text-emerald-900",
  },
] as const;

// Precio de lista sugerido por el catálogo (/precios), según de dónde sale
// de verdad el cristal. Es el mismo cálculo que usa el cotizador de la
// receta y la cotización por WhatsApp (lib/precio-venta.ts), para que el
// tecnólogo y la vendedora vean siempre el mismo número.
function precioDeCombo(combo: CostoCristal, factorVenta: number, origen: "stock" | "laboratorio"): number {
  return precioVentaCristal(combo, origen, factorVenta);
}

// Número de par de una línea del carrito ("cristal-3" → 3).
function numeroDePar(key: string): number {
  return Number(key.split("-")[1]);
}

type CambioLente = {
  combo: CostoCristal;
  posicion?: "lejos" | "cerca";
  sugerido?: boolean;
  esCortesia?: boolean;
  precio: number;
  precioPendiente: boolean;
};

function lineaDeCombo(numero: number, { combo, ...opciones }: CambioLente): LineaCarrito {
  return {
    key: `cristal-${numero}`,
    descripcion: `Cristales ${nombreCristal(combo.tipo_lente, combo.tratamiento)}${opciones.esCortesia ? " (cortesía)" : ""}`,
    cantidad: 1,
    precioUnitario: opciones.precio,
    esCortesia: opciones.esCortesia,
    precioPendiente: opciones.precioPendiente,
    cristal: {
      tipoLente: combo.tipo_lente,
      rangoReceta: combo.rango_receta,
      tratamiento: combo.tratamiento,
      costoLaboratorio: combo.costo_stock ?? combo.costo,
      posicion: opciones.posicion,
      sugerido: opciones.sugerido,
    },
  };
}

type PrefillLente = { tipoLente: string; tratamiento: string; posicion?: "lejos" | "cerca"; sugerido: boolean } | null;

function paresSugeridos(receta?: RecetaResumen): PrefillLente[] {
  if (!receta) return [null, null];
  const sugerido = (tipoLente: string | null, tratamiento: string | null, posicion?: "lejos" | "cerca"): PrefillLente =>
    tipoLente && tratamiento ? { tipoLente, tratamiento, posicion, sugerido: true } : null;
  const pares = [
    sugerido(receta.sugerencia_tipo_lente, receta.sugerencia_tratamiento, receta.tipo === "cerca" ? "cerca" : "lejos"),
    receta.tipo === "lejos_y_cerca" ? sugerido(receta.sugerencia_tipo_lente_cerca, receta.sugerencia_tratamiento_cerca, "cerca") : null,
    ...(receta.sugerencias_extra ?? []).map(e => sugerido(e.tipo_lente, e.tratamiento, e.posicion ?? undefined)),
  ].filter(Boolean);
  while (pares.length < 2) pares.push(null);
  return pares.slice(0, MAX_PARES);
}

// Una fila = un par de lentes. Se pueden llenar las dos filas para vender
// dos pares en la misma venta (ej. uno para lejos y otro para cerca, o
// cualquier combinación) — cada una queda enlazada a su propia orden de
// trabajo. El rango de la receta se calcula solo; si el lente es Monofocal
// y es para cerca, se le suma la adición (ADD) antes de clasificar.
function FilaLente({
  numero,
  costos,
  factorVenta,
  receta,
  catalogoLab,
  inicial,
  guardado,
  onCambio,
}: {
  numero: number;
  costos: CostoCristal[];
  factorVenta: number;
  receta: RecetaResumen | undefined;
  catalogoLab: CatalogoLaboratorio;
  inicial: PrefillLente;
  guardado?: LineaCarrito;
  onCambio: (datos: CambioLente | null) => void;
}) {
  const [tipoLente, setTipoLente] = useState(guardado?.cristal?.tipoLente ?? inicial?.tipoLente ?? "");
  const [posicion, setPosicion] = useState<"lejos" | "cerca">((guardado?.cristal?.posicion ?? inicial?.posicion) === "cerca" ? "cerca" : "lejos");
  const [tratamiento, setTratamiento] = useState(guardado?.cristal?.tratamiento ?? inicial?.tratamiento ?? "");
  const [rangoManual, setRangoManual] = useState(guardado?.cristal?.rangoReceta ?? "");
  const [sugerido, setSugerido] = useState(guardado ? (guardado.cristal?.sugerido ?? false) : (inicial?.sugerido ?? false));
  const [esCortesia, setEsCortesia] = useState(guardado?.esCortesia ?? false);
  // El precio parte igual al de lista, pero se puede rebajar a mano en el
  // momento (descuento puntual a un paciente) sin tener que ir a /precios.
  const [precioTexto, setPrecioTexto] = useState(formatearMonto(guardado?.precioUnitario));

  const tiposLente = useMemo(() => [...new Set(costos.map((c) => c.tipo_lente))], [costos]);
  const posicionParaRango = tipoLente === "Monofocal" ? posicion : "lejos";
  const rangoAuto = receta
    ? rangoParaPosicion(
        [receta.od_esfera, receta.oi_esfera],
        [receta.od_cilindro, receta.oi_cilindro],
        [receta.od_add, receta.oi_add],
        posicionParaRango
      )
    : null;
  const rango = rangoAuto ?? rangoManual;
  const limites = limitesDeRango(rango);
  const fueraDeRango = receta && limites && ojosParaCristal(receta, tipoLente, posicionParaRango).some(
    ojo => Math.abs(ojo.esfera ?? 0) > limites.esfera || Math.abs(ojo.cilindro ?? 0) > limites.cilindro
  );
  const rangos = useMemo(
    () => [...new Set(costos.filter((c) => c.tipo_lente === tipoLente).map((c) => c.rango_receta))],
    [costos, tipoLente]
  );
  const tratamientos = useMemo(
    () => costos.filter((c) => c.tipo_lente === tipoLente && c.rango_receta === rango),
    [costos, tipoLente, rango]
  );
  const combo = tratamientos.find((c) => c.tratamiento === tratamiento);

  // De dónde sale ESTE cristal para la receta de este paciente — mismo
  // motor que usa el resto de la venta (costo-fides.ts) para no adivinar:
  // si el laboratorio ya lo tiene hecho para esta potencia exacta, el
  // precio a cobrar es el de stock, aunque el "casillero" de rango en que
  // cayó la receta también incluya casos que sí van a laboratorio (una
  // esfera baja con cilindro alto cae en el mismo casillero que una
  // esfera Y cilindro altos, pero la primera sale de stock y la segunda
  // no — cobrarles igual sería cobrarle de más a la simple).
  // Sin receta guardada (operativo: se refracta y se vende en el momento)
  // se prueba el peor caso del rango elegido a mano — ver precio-venta.ts.
  function origenReal(fila: CostoCristal): "stock" | "laboratorio" {
    return origenDelCristal(fila, receta, posicionParaRango, catalogoLab, hoyEnChile());
  }

  const opciones = tratamientos.map(fila => {
    const origen = origenReal(fila);
    return {
      id: fila.tratamiento,
      nombre: fila.tratamiento,
      tratamiento: fila.tratamiento,
      origen,
      precio: precioDeCombo(fila, factorVenta, origen),
    };
  });
  const precioLista = opciones.find(opcion => opcion.id === tratamiento)?.precio ?? 0;

  function avisarCambio(fila: CostoCristal, monto: number, lista: number, cortesia: boolean, esSugerido: boolean) {
    onCambio({
      combo: fila,
      posicion: tipoLente === "Monofocal" ? posicion : undefined,
      sugerido: esSugerido,
      esCortesia: cortesia,
      precio: monto,
      // Una cortesía puede ir en $0 aunque el cristal esté por cotizar.
      precioPendiente: !!fila.exige_tarifa && lista <= 0 && monto <= 0 && !cortesia,
    });
  }

  // Solo al montar: si venía precargada por la sugerencia del tecnólogo,
  // se suma sola al carrito apenas aparece la fila.
  useEffect(() => {
    if (combo && !guardado) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- precarga el precio inicial de la fila solo al montar
      setPrecioTexto(precioLista > 0 ? formatearMonto(precioLista) : "");
      avisarCambio(combo, precioLista, precioLista, esCortesia, sugerido);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function elegirTratamiento(valor: string) {
    setTratamiento(valor);
    setSugerido(false);
    const elegido = tratamientos.find((c) => c.tratamiento === valor);
    if (!elegido) {
      onCambio(null);
      return;
    }
    const precioNuevo = opciones.find(opcion => opcion.id === valor)?.precio ?? 0;
    setPrecioTexto(precioNuevo > 0 ? formatearMonto(precioNuevo) : "");
    avisarCambio(elegido, precioNuevo, precioNuevo, esCortesia, false);
  }

  function alternarCortesia(valor: boolean) {
    setEsCortesia(valor);
    if (!combo) return;
    avisarCambio(combo, montoANumero(precioTexto), precioLista, valor, sugerido);
  }

  // Descuento puntual al paciente: se cambia el número acá mismo, sin tener
  // que ir a /precios (eso rebajaría el precio para todo el mundo).
  function cambiarPrecio(texto: string) {
    const formateado = formatearMonto(texto);
    setPrecioTexto(formateado);
    if (combo) avisarCambio(combo, montoANumero(formateado), precioLista, esCortesia, sugerido);
  }

  const select =
    "w-full rounded-lg border border-tinta-suave/30 bg-white px-2 py-2.5 text-sm outline-none focus:border-violet-500 disabled:opacity-50";

  return (
    <fieldset className="rounded-xl border border-violet-200 bg-white p-3">
      <legend className="px-1 text-sm font-bold text-violet-900">Par {numero}</legend>
      <div className="flex flex-col gap-2">
        <label className="flex flex-col gap-1 text-xs font-medium">
          Tipo de lente
          <select
            value={tipoLente}
            onChange={(e) => {
              setTipoLente(e.target.value);
              setRangoManual("");
              setTratamiento("");
              setSugerido(false);
              onCambio(null);
            }}
            className={select}
          >
            <option value="">{numero === 1 ? "Elegir…" : "— No lleva —"}</option>
            {tiposLente.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>

        {tipoLente === "Monofocal" && (
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-tinta-suave">
              ¿Lejos o cerca?
            </span>
            <div className="flex gap-2 text-sm">
              {(["lejos", "cerca"] as const).map((p) => (
                <label
                  key={p}
                  className="flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-tinta-suave/25 bg-white px-2 py-2 capitalize has-checked:border-violet-500 has-checked:bg-violet-50"
                >
                  <input
                    type="radio"
                    checked={posicion === p}
                    onChange={() => {
                      setPosicion(p);
                      setTratamiento("");
                      setSugerido(false);
                      onCambio(null);
                    }}
                    className="accent-violet-600"
                  />
                  {p}
                </label>
              ))}
            </div>
          </div>
        )}

        {tipoLente &&
          (rangoAuto ? (
            <p className="rounded-lg bg-violet-100 px-3 py-2 text-xs font-medium text-violet-900">
              {fueraDeRango
                ? "La receta supera los rangos de venta. Confirma disponibilidad para las potencias y el marco."
                : <>Rango según la receta: <b>{rangoAuto}</b></>}
            </p>
          ) : (
            <label className="flex flex-col gap-1 text-xs font-medium">
              Rango de la receta
              <select
                value={rangoManual}
                onChange={(e) => {
                  setRangoManual(e.target.value);
                  setTratamiento("");
                  setSugerido(false);
                  onCambio(null);
                }}
                className={select}
              >
                <option value="">Elegir…</option>
                {rangos.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
              <span className="text-xs font-normal text-tinta-suave">
                Sin receta cargada: elige el rango a mano.
              </span>
            </label>
          ))}

        {tipoLente && rango && (
          <SelectorCristal
            key={`${tipoLente}-${rango}-${posicionParaRango}`}
            opciones={opciones}
            valor={tratamiento}
            onChange={elegirTratamiento}
          />
        )}

        {combo && (
          <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-tinta-suave/25 bg-white px-3 py-2 text-xs font-medium has-checked:border-brand has-checked:bg-brand/5">
            <input
              type="checkbox"
              checked={esCortesia}
              onChange={(e) => alternarCortesia(e.target.checked)}
              className="accent-brand"
            />
            Lente de cortesía
          </label>
        )}

        {combo && esCortesia && (
          <p className="text-xs text-violet-900">Puedes cobrar una mejora. Para una cortesía completa, escribe $0 en Total acordado al llegar a Pago.</p>
        )}

        {combo && (
          <div className="flex flex-col gap-1">
            <label className="flex flex-col gap-1 text-xs font-medium text-violet-900">
              Precio de los cristales
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/80">$</span>
                <input
                  inputMode="numeric"
                  value={precioTexto}
                  onChange={(e) => cambiarPrecio(e.target.value)}
                  className="w-full rounded-lg bg-violet-800 py-2.5 pl-7 text-center text-base font-bold text-white outline-none focus:ring-2 focus:ring-violet-300"
                />
              </div>
            </label>
            {combo.exige_tarifa && precioLista <= 0 && (
              <p className="text-xs text-amber-900">
                {montoANumero(precioTexto) > 0 ? "Precio ingresado para este par." : "Por cotizar. Confirma el precio e ingrésalo para seguir."}
              </p>
            )}
            {precioLista > 0 && montoANumero(precioTexto) !== precioLista && (
              <p className="text-xs text-tinta-suave">Precio de lista: {clp(precioLista)}</p>
            )}
            {sugerido && <p className="text-xs font-semibold text-violet-700">(sugerido en la receta)</p>}
          </div>
        )}
      </div>
    </fieldset>
  );
}

// Un armazón elegido explícitamente para UN lente (1 o 2) — antes se
// agregaba a una sola lista compartida y se emparejaba con el cristal por
// el orden en que se habían tocado los productos, así que en un operativo
// con apuro era fácil que el marco del Lente 2 quedara guardado como si
// fuera el del Lente 1. Ahora cada lente tiene su propio buscador y su
// propio marco elegido, sin ambigüedad.
// El recargo de la línea se cobra una vez por par. Aumenta la venta
// y se considera también al calcular la comisión y los impuestos.


const TIPOS_MARCO = ["acetato", "metal", "semi al aire", "al aire", "TR90"];
const COLORES_MARCO = ["negro", "café", "carey", "dorado", "plateado", "rojo", "azul", "rosado", "transparente", "gris"];

function EntradaDetalleMarco({ etiqueta, valor, opciones, alCambiar }: {
  etiqueta: string; valor: string; opciones: readonly (string | null | undefined)[]; alCambiar: (valor: string) => void;
}) {
  return <div className="space-y-1.5">
    <label className="grid gap-1 text-sm font-semibold text-amber-900">
      {etiqueta}
      <input value={valor} onChange={event => alCambiar(event.target.value)} placeholder={`Escribe el ${etiqueta.toLowerCase()}`}
        maxLength={40} autoComplete="off" className="rounded-lg border bg-white px-3 py-2 text-sm outline-none focus:border-amber-500" />
    </label>
    <div className="flex flex-wrap gap-1.5">
      {sugerirDetallesMarco(opciones, valor).map(opcion => <button key={opcion} type="button" onClick={() => alCambiar(opcion)}
        className={`rounded-full border px-2.5 py-1.5 text-xs font-semibold ${opcion === valor ? "border-amber-800 bg-amber-800 text-white" : "border-amber-800/25 bg-white text-amber-900"}`}>
        {opcion}
      </button>)}
    </div>
  </div>;
}

function OpcionMarco({ producto: p, alElegir }: { producto: Producto; alElegir: (producto: Producto) => void }) {
  return <button type="button" onClick={() => alElegir(p)}
    className="flex w-full items-center gap-2 rounded-lg bg-crema-claro px-3 py-2 text-left text-sm transition hover:bg-amber-50">
    <span className="min-w-0 flex-1">
      <strong className="block break-words">{p.sku || p.nombre}</strong>
      {(p.marca || p.material || p.color || (p.sku && p.nombre !== p.sku)) && <small className="block text-tinta-suave">
        {[p.marca, p.sku && p.nombre !== p.sku ? p.nombre : null, p.material, p.color].filter(Boolean).join(" · ")}
      </small>}
    </span>
    {p.stock !== undefined && <span className={`shrink-0 text-xs font-semibold ${p.stock > 0 ? "text-emerald-800" : "text-amber-900"}`}>
      {p.stock > 0 ? `Stock ${p.stock}` : p.stock < 0 ? `Saldo ${p.stock}` : "Para encargar"}
    </span>}
  </button>;
}

function SelectorArmazon({
  etiqueta,
  productos,
  elegido,
  onElegir,
  onMarcarPropio,
  onDescribir,
}: {
  etiqueta: string;
  productos: Producto[];
  elegido: LineaCarrito | undefined;
  onElegir: (producto: Producto | null) => void;
  onDescribir: (descripcion: string, codigo?: string) => void;
  // El paciente trae su propio marco: no sale de nuestro stock, así que no
  // hay nada que buscar ni elegir del inventario.
  onMarcarPropio: () => void;
}) {
  const [busca, setBusca] = useState("");
  const [tipoMarco, setTipoMarco] = useState("");
  const [colorMarco, setColorMarco] = useState("");
  const codigoMarco = busca.trim();
  const referencia = codigoMarco ? `cód. ${codigoMarco}` : "";
  const detalle = [tipoMarco.trim(), colorMarco.trim()].filter(Boolean).join(" ");
  const descripcion = [detalle.slice(0, 104 - (referencia ? referencia.length + 3 : 0)).trim(), referencia].filter(Boolean).join(" · ");
  const armazones = useMemo(() => productos.filter(p => p.categoria === "armazon"), [productos]);
  const filtrados = useMemo(() => {
    const sugerencias = sugerirMarcosPorCodigo(armazones, busca);
    return sugerencias.length ? sugerencias : filtrarProductos(armazones, busca);
  }, [armazones, busca]);
  const marcoExacto = marcoPorCodigo(armazones, busca);
  const materiales = [...TIPOS_MARCO, ...armazones.map(p => p.material)];
  const colores = [...COLORES_MARCO, ...armazones.map(p => p.color)];

  return (
    <fieldset className="flex-1 rounded-xl border border-amber-300 bg-white p-3">
      <legend className="px-1 text-base font-bold text-amber-900">Marco {etiqueta === "tu lente" ? "" : `del ${etiqueta}`}</legend>
      {elegido ? (
        <div
          className={`flex items-center justify-between gap-2 rounded-lg px-3 py-2.5 ${elegido.marcoPropio ? "bg-sky-100" : "bg-amber-100"}`}
        >
          <span className={`text-sm font-semibold ${elegido.marcoPropio ? "text-sky-900" : "text-amber-900"}`}>
            {elegido.descripcion}
          </span>
          <button
            type="button"
            onClick={() => onElegir(null)}
            className={`whitespace-nowrap text-xs font-semibold underline ${elegido.marcoPropio ? "text-sky-800" : "text-amber-800"}`}
          >
            Cambiar
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <label className="flex flex-col gap-1 text-sm font-semibold text-amber-900">
            Busca o escanea el código de la etiqueta
            <input
              type="search"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              onKeyDown={e => {
                if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
                e.preventDefault();
                if (marcoExacto) onElegir(marcoExacto);
              }}
              maxLength={80}
              placeholder="Ej. LY-2187L C-2"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              className="w-full rounded-lg border border-tinta-suave/30 bg-white px-3 py-2 text-sm outline-none focus:border-amber-500"
            />
          </label>
          <ul className="flex max-h-56 flex-col gap-1 overflow-y-auto">
            {filtrados.map(p => <li key={p.id}><OpcionMarco producto={p} alElegir={onElegir} /></li>)}
            {filtrados.length === 0 && (
              <li className="rounded-lg bg-crema-claro px-3 py-2 text-xs text-tinta-suave">
                {armazones.length === 0 ? "No hay armazones cargados en Inventario." : "Sin coincidencias."}
              </li>
            )}
          </ul>
          <button
            type="button"
            onClick={onMarcarPropio}
            className="rounded-lg border border-sky-300 bg-sky-50 px-3 py-2 text-left text-sm font-semibold text-sky-900 transition hover:bg-sky-100"
          >
            👓 El paciente trae su propio marco
          </button>
          {!marcoExacto && <>
            <details className="rounded-lg border border-amber-200">
              <summary className="cursor-pointer px-3 py-2 text-sm font-semibold text-amber-900">Escribir material y color</summary>
              <div className="space-y-3 rounded-lg bg-amber-50 p-2.5">
                <EntradaDetalleMarco etiqueta="Material" valor={tipoMarco} opciones={materiales} alCambiar={setTipoMarco} />
                <EntradaDetalleMarco etiqueta="Color" valor={colorMarco} opciones={colores} alCambiar={setColorMarco} />
              </div>
            </details>
            {(codigoMarco || (tipoMarco.trim() && colorMarco.trim())) && <button type="button"
              onClick={() => onDescribir(descripcion, codigoMarco || undefined)}
              className="rounded-lg bg-amber-800 px-3 py-2.5 text-sm font-semibold text-white hover:bg-amber-900">
              {codigoMarco ? `Usar código escrito · ${codigoMarco}` : "Usar descripción"}
            </button>}
          </>}
        </div>
      )}
    </fieldset>
  );
}

export default function PuntoDeVenta({
  pacientes: pacientesCargados,
  productos,
  costos,
  catalogoLab,
  laboratorios,
  factorVenta,
  sucursalId,
  vendedorId,
  recetasPorPaciente: recetasCargadas,
  operativos,
  operativoInicial,
  pacienteInicial,
  sugerirOperativoPorReceta = true,
  recargosMarcos = null,
  opticaGlobal = false,
  mercadoPago = false,
  comisionDebitoPct = 0,
  comisionCreditoPct = 0,
}: {
  pacientes: Paciente[];
  productos: Producto[];
  costos: CostoCristal[];
  catalogoLab: CatalogoLaboratorio;
  laboratorios: { id: string; nombre: string }[];
  factorVenta: number;
  tenantId: string;
  sucursalId: string | null;
  vendedorId: string | null;
  recetasPorPaciente: Record<string, RecetaResumen | undefined>;
  operativos: { id: string; nombre: string; fecha: string; fecha_entrega_estimada: string | null; costo_marco_unitario?: number }[];
  operativoInicial?: string;
  pacienteInicial?: string;
  sugerirOperativoPorReceta?: boolean;
  recargosMarcos?: RecargosMarcos | null;
  opticaGlobal?: boolean;
  mercadoPago?: boolean;
  comisionDebitoPct?: number;
  comisionCreditoPct?: number;
}) {
  const router = useRouter();
  const recetaInicial = pacienteInicial ? recetasCargadas[pacienteInicial] : undefined;
  const operativoRecetaInicial = sugerirOperativoPorReceta && operativos.some(o => o.id === recetaInicial?.operativo_id)
    ? recetaInicial?.operativo_id : null;
  const [paso, setPaso] = useState(pacienteInicial ? 1 : 0);
  // Cada paso puede tener distinto largo — sin esto la pantalla se quedaba
  // scrolleada donde iba antes y había que subir a mano para ver el título
  // del paso nuevo (fácil perderse).
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [paso]);
  const [pacienteId, setPacienteId] = useState<string>(pacienteInicial ?? "");
  const [recetaEnVenta, setRecetaEnVenta] = useState<RecetaResumen | undefined>(recetaInicial);
  const [operativoId, setOperativoId] = useState<string>(operativoInicial ?? operativoRecetaInicial ?? "");
  const { locales, remotas, pendientes: atencionesPendientes } = useAtencionesParaVenta(vendedorId, operativoId);
  const pacientes = useMemo(() => [...new Map([...pacientesCargados, ...locales?.pacientes ?? [], ...remotas?.pacientes ?? []]
    .map(p => [p.id, p])).values()], [pacientesCargados, remotas, locales]);
  const recetasPorPaciente: Record<string, RecetaResumen | undefined> = {
    ...recetasCargadas, ...locales?.recetas, ...remotas?.recetas, ...atencionesPendientes.recetas,
  };
  // Operativo de la jornada, fijado a mano ("hoy estamos en Educa"). Manda
  // sobre el operativo de la receta y se mantiene entre una venta y otra.
  const [operativoSesion, setOperativoSesion] = useState<string>(operativoInicial ?? "");
  const [avisoContexto, setAvisoContexto] = useState<string | null>(null);
  const [buscaPaciente, setBuscaPaciente] = useState("");
  const [buscaProducto, setBuscaProducto] = useState("");
  const [carritoTodo, setCarrito] = useState<LineaCarrito[]>([]);
  // Lo que de verdad se cobra: sin marcos ni premium de pares que ya no
  // tienen cristal (lib/carrito.ts).
  const carrito = useMemo(() => quitarHuerfanos(carritoTodo), [carritoTodo]);
  const [presupuestos, setPresupuestos] = useState<Partial<Record<number, string>>>({});
  const [abono, setAbono] = useState<AbonoElegido>({ modo: "total" });
  const [acuerdo, setAcuerdo] = useState<{ campo: "descuento" | "total"; texto: string }>({ campo: "descuento", texto: "" });
  // Sin valor por defecto: se elige en cada cobro. Antes partía en
  // "efectivo" y quedaba pegado el de la venta anterior, y la caja no
  // calzaba con la máquina (revisión 20-10-2026).
  const [medioPago, setMedioPago] = useState("");
  const [numeroVoucher, setNumeroVoucher] = useState("");
  const [pagoMP, setPagoMP] = useState<{ medio: string; monto: number; id: string } | null>(null);
  const [laboratorioId, setLaboratorioId] = useState<string>(laboratorios[0]?.id ?? "");
  const [guardando, setGuardando] = useState(false);
  // Un id por venta, fijo hasta que se cierra: si se aprieta "Cobrar" dos
  // veces, o se reintenta tras un corte, la base ve el mismo id y no crea
  // una segunda venta (A05).
  const [ventaId, setVentaId] = useState(() => crypto.randomUUID());
  const [mensaje, setMensaje] = useState<string | null>(null);
  // La última venta registrada: para abrir al tiro su comprobante o su
  // certificado Fonasa sin tener que buscarla.
  const [ultimaVenta, setUltimaVenta] = useState<string | null>(null);
  const estadoVenta = useSyncExternalStore(suscribirVentas, () => {
    if (!ultimaVenta || !vendedorId) return "nueva";
    if (pendientes(vendedorId).some(v => v.id === ultimaVenta)) return "pendiente";
    if (fallidas(vendedorId).some(v => v.id === ultimaVenta)) return "revisar";
    return ventaConfirmada(vendedorId, ultimaVenta) ? "confirmada" : "sin-confirmar";
  }, () => "nueva");
  const mensajeMostrado = mensaje?.startsWith("✓ Venta guardada en este equipo")
    ? estadoVenta === "confirmada" ? "✓ Venta registrada" : estadoVenta === "revisar"
      ? "Venta guardada en este equipo. Revisa el aviso de sincronización."
      : estadoVenta === "sin-confirmar" ? "Venta sin confirmación." : mensaje
    : mensaje;

  const receta = recetaEnVenta;
  // Lo que trae precargado cada fila cuando se elige el paciente — cada
  // fila lo usa solo como valor inicial y lo puede cambiar sin problema.
  // Un elemento por par (Par 1, Par 2, …). Parten dos filas; se agregan más
  // con "＋ Agregar otro par".
  const [iniciales, setIniciales] = useState(() => paresSugeridos(recetaInicial));
  const [filasQuitadas, setFilasQuitadas] = useState<Partial<Record<number, number>>>({});

  const subtotal = carrito.reduce((s, l) => s + l.cantidad * l.precioUnitario, 0);
  const { descuento, total, invalido: acuerdoInvalido } = calcularPrecioAcordado(
    subtotal, acuerdo.campo, acuerdo.texto === "" ? null : montoANumero(acuerdo.texto),
  );
  const lineasCobro = repartirDescuento(carrito, descuento);
  // Orden estable Par 1, Par 2, … (por el número de la key),
  // independiente del orden en que se hayan ido completando las filas.
  const lineasCristal = carrito.filter((l) => l.cristal).sort((a, b) => numeroDePar(a.key) - numeroDePar(b.key));
  const hayCristalesPorCotizar = lineasCristal.some(l => l.precioPendiente);

  // De dónde sale cada cristal y cuánto cuesta, calculado contra la lista
  // del laboratorio y la potencia de CADA OJO de esta receta. No se
  // pregunta: si el laboratorio lo tiene hecho se pide hecho, que es lo
  // barato, y se manda a tallar solo cuando no queda otra. Elegirlo a mano
  // es justo donde se cometía el error, y esto se le informa al paciente.
  const costoRealDeLinea = useCallback(
    (linea: LineaCarrito): CostoReal | null => {
      const cristal = linea.cristal;
      if (!cristal) return null;
      const fila = costos.find(
        (c) =>
          c.tipo_lente === cristal.tipoLente &&
          c.tratamiento === cristal.tratamiento &&
          c.rango_receta === cristal.rangoReceta
      );
      if (!fila) return null;
      // Mismo cálculo que FilaLente (precio-venta.ts), para que el origen
      // que QUEDA GUARDADO en la orden de trabajo —el que decide si se pide
      // hecho o se manda a tallar— sea el mismo con que se cotizó. Las
      // promociones del laboratorio vencen: se evalúan contra hoy.
      return costoRealCristal(fila, receta, cristal.posicion, catalogoLab, hoyEnChile());
    },
    [costos, receta, catalogoLab]
  );


  function origenDeLinea(linea: LineaCarrito): "laboratorio" | "stock" {
    return costoRealDeLinea(linea)?.origen ?? "laboratorio";
  }


  // El plazo y el proveedor son de la orden completa: si cualquiera de los
  // dos cristales hay que tallarlo, la orden entera se va al laboratorio.
  const origenCristal: "laboratorio" | "stock" =
    lineasCristal.length > 0 && lineasCristal.every((l) => origenDeLinea(l) === "stock")
      ? "stock"
      : "laboratorio";
  // Puede haber más de un armazón (dos pares separados): cada uno queda
  // explícitamente emparejado con su lente por armazonSlot, no por el orden
  // en que se hayan agregado — así no se puede confundir cuál marco es para
  // el Lente 1 y cuál para el Lente 2.
  const lineasArmazon = carrito
    .filter((l): l is LineaCarrito & { armazonSlot: number } => l.armazonSlot !== undefined)
    .sort((a, b) => a.armazonSlot - b.armazonSlot);
  const creaOT = Boolean(pacienteId && lineasCristal.length > 0);
  // Cotizar sin ficha se puede; guardar cristales sin paciente, no (el
  // servidor lo rechaza). Accesorios solos sí.
  const faltaPaciente = faltaPacienteParaGuardar(carrito, pacienteId);
  // Pares sin marco: antes se podía cobrar igual y la orden salía "sin
  // marco" al laboratorio. Ahora cada par necesita su marco (del
  // inventario, descrito o del paciente) para seguir al pago.
  const paresSinMarco = lineasCristal
    .map((l) => numeroDePar(l.key))
    .filter((n) => !carrito.some((c) => c.key === `armazon-${n}`));
  const usaLineasGlobal = opticaGlobal && recargosMarcos?.especial !== undefined;
  // Abono mínimo: cubre mandar a hacer estos cristales al laboratorio, así
  // no hay que poner plata propia mientras se espera el pago del saldo.
  // Un lente de cortesía (precio $0) no tiene nada que abonar — no tiene
  // sentido pedir un adelanto de algo que no se va a cobrar.
  // Con el costo real de cada par (lib/abono-minimo.ts), no solo un monto
  // fijo por tipo: un fotocromático tallado cuesta bastante más de $10.000.
  const { monto: abonoMinimo, noCubre: abonoNoCubre } = abonoMinimoDe(
    lineasCristal.map((l) => {
      const numero = numeroDePar(l.key);
      const marco = lineasArmazon.find((armazon) => armazon.armazonSlot === numero);
      const costoNetoMarco = usaLineasGlobal && marco?.productoId
        ? productos.find((producto) => producto.id === marco.productoId)?.costo ?? 0
        : 0;
      const cargosDelPar = lineasCobro.filter(linea => linea.key === l.key || linea.recargoSlot === numero);
      return {
        precio: cargosDelPar.reduce((monto, linea) => monto + linea.precioUnitario - linea.descuento, 0),
        costoCristal: costoRealDeLinea(l)?.costo ?? null,
        costoMarco: marco?.marcoPropio ? 0 : costoNetoMarco > 0 ? Math.round(costoNetoMarco * IVA) : undefined,
        minimoFijo: ABONO_MINIMO_POR_TIPO[l.cristal?.tipoLente ?? ""] ?? 0,
      };
    }),
    operativos.find(o=>o.id===operativoId)?.costo_marco_unitario ?? COSTO_MARCO_POR_PAR,
    total,
    // Bruto del medio elegido: con tarjeta hay que cobrar algo más para que
    // después de la comisión llegue el costo.
    tasaDelMedio(medioPago, comisionDebitoPct, comisionCreditoPct)
  );
  // Lo que dice el campo y lo que se cobra: el botón y la venta usan este
  // mismo monto (lib/monto-abono.ts).
  const montosSugeridos = montosSugeridosAbono(total, abonoMinimo);
  const textoAbono = abono.modo === "manual" ? abono.texto : formatearMonto(montosSugeridos[abono.modo]);
  const cobro = montoAbono(textoAbono, total);
  const montoACobrar = cobro.monto;
  const voucherActual = mercadoPago ? pagoMP?.medio === medioPago && pagoMP.monto === montoACobrar ? pagoMP.id : "" : numeroVoucher;
  const recetaPacienteId = receta?.id;
  const paciente = pacientes.find((p) => p.id === pacienteId);

  const pacientesFiltrados = useMemo(() => {
    const t = buscaPaciente.trim().toLowerCase();
    if (!t) return pacientes.slice(0, 6);
    return pacientes
      .filter((p) => coincidePaciente(p,t))
      .slice(0, 30);
  }, [pacientes, buscaPaciente]);

  // Si ya hay al menos un lente en la venta, el armazón de cada uno se
  // elige aparte (SelectorArmazon) — acá solo quedan los demás productos
  // (estuches, lentes de contacto, etc.) para no mostrar los mismos
  // armazones dos veces.
  const tieneCristal = lineasCristal.length > 0;
  const productosFiltrados = useMemo(() => {
    const base = productos.filter(p => p.categoria !== "armazon" || (!tieneCristal && p.precio_venta > 0));
    return filtrarProductos(base, buscaProducto);
  }, [productos, buscaProducto, tieneCristal]);
  const marcoSueltoPorCodigo = marcoPorCodigo(productosFiltrados.filter(p => p.categoria === "armazon"), buscaProducto);

  function elegirArmazon(numero: number, producto: Producto | null) {
    const key = `armazon-${numero}`;
    setCarrito((prev) => {
      const sinMarco = prev.filter(l => l.armazonSlot !== numero && l.recargoSlot !== numero);
      if (!producto) return sinMarco;
      const especial = usaLineasGlobal ? undefined : producto.recargo_marco;
      const cotizado = prev.find(l => l.recargoSlot === numero);
      const nivel = cotizado?.nivelMarco ?? (especial != null ? "especial" : usaLineasGlobal ? nivelesMarcoInventarioGlobal(producto)[0] : "esencial");
      return [
        ...sinMarco,
        {
          key,
          productoId: producto.id,
          descripcion: [producto.marca, producto.nombre, producto.sku?.trim().toUpperCase() === producto.nombre.trim().toUpperCase() ? null : producto.sku].filter(Boolean).join(" · "),
          cantidad: 1,
          precioUnitario: 0,
          armazonSlot: numero,
          recargoEspecial: especial ?? undefined,
        },
        ...(cotizado?.recargoEditado
          ? [cotizado]
          : nivel === "esencial" ? [] : [
              { ...lineaRecargo(numero, nivel, recargosMarcos, false, nivel === "especial" ? especial : undefined), recargoEditado: false },
            ]),
      ];
    });
  }

  // El paciente trae su propio marco: el cupo queda "lleno" sin elegir
  // ningún producto del inventario — no hay productoId, así que no se
  // descuenta stock ni se cuenta el costo de reposición para este lente.
  function marcarMarcoPropio(numero: number) {
    const key = `armazon-${numero}`;
    setCarrito((prev) => [
      // Marco propio: no hay marco nuestro, así que tampoco premium.
      ...prev.filter((l) => l.key !== key && l.key !== `premium-${numero}`),
      {
        key,
        descripcion: "Marco propio del paciente",
        cantidad: 1,
        precioUnitario: 0,
        armazonSlot: numero,
        marcoPropio: true,
      },
    ]);
  }

  function fijarPrecioMarco(numero: number, nivel: NivelMarco, precioManual?: number) {
    setCarrito(prev => {
      const marco = prev.find(l => l.armazonSlot === numero);
      if (marco?.marcoPropio) return prev;
      const sinRecargo = prev.filter(l => l.recargoSlot !== numero);
      if (nivel === "esencial" && precioManual === undefined) return sinRecargo;
      const lista = lineaRecargo(numero, nivel, recargosMarcos, false, nivel === "especial" ? marco?.recargoEspecial : undefined);
      return [...sinRecargo, {
        ...lista,
        precioUnitario: precioManual ?? lista.precioUnitario,
        recargoEditado: precioManual !== undefined,
      }];
    });
  }

  function describirMarco(numero: number, descripcion: string, codigo?: string) {
    setCarrito((prev) => [
      ...prev.filter(l => l.armazonSlot !== numero),
      {
        key: `armazon-${numero}`,
        descripcion: `Marco ${descripcion}`,
        cantidad: 1,
        precioUnitario: 0,
        armazonSlot: numero,
        marcoDescrito: descripcion,
        codigoMarco: codigo,
      },
    ]);
  }

  function editarPrecioProducto(key: string, precio: number) {
    setCarrito(prev => prev.map(l => l.key === key ? { ...l, precioUnitario: precio } : l));
  }

  function agregarProducto(p: Producto) {
    // Producto suelto: usa el precio de Inventario. Los marcos de cada par
    // se asignan arriba; aquí no se agrega otro marco gratuito.
    const precio = p.precio_venta;
    setCarrito((prev) => {
      const existe = prev.find((l) => l.key === `prod-${p.id}`);
      if (existe) {
        return prev.map((l) => (l.key === `prod-${p.id}` ? { ...l, cantidad: l.cantidad + 1 } : l));
      }
      return [
        ...prev,
        {
          key: `prod-${p.id}`,
          productoId: p.id,
          descripcion: `${p.marca ? p.marca + " " : ""}${p.nombre}`,
          cantidad: 1,
          precioUnitario: precio,
        },
      ];
    });
  }

  function manejarCambioLente(
    numero: number,
    datos: CambioLente | null
  ) {
    const key = `cristal-${numero}`;
    setCarrito((prev) => {
      const sinEstaFila = prev.filter((l) => l.key !== key);
      if (!datos) return sinEstaFila.filter(l => l.recargoSlot !== numero && l.armazonSlot !== numero);
      const cristal = lineaDeCombo(numero, datos);
      return prev.some(l => l.key === key)
        ? prev.map(l => l.key === key ? cristal : l)
        : [...prev, cristal];
    });
  }

  // Al elegir el paciente: si su receta más reciente trae una sugerencia
  // del tecnólogo, cada fila la trae precargada sola — la vendedora solo
  // confirma o cambia algo si el paciente decidió otra cosa.
  function elegirPaciente(id: string) {
    if (id === pacienteId) return;
    // Otro comprador: el abono y el medio de pago del anterior no se
    // arrastran (revisión Codex 20-10-2026).
    setAbono({ modo: "total" });
    setPresupuestos({});
    setAcuerdo({ campo: "descuento", texto: "" });
    setMedioPago("");
    setNumeroVoucher("");
    setPagoMP(null);
    setPacienteId(id);
    // Paciente nuevo: fuera cristales, marcos y premium del anterior (sus
    // pares no son de esta persona). Los productos sueltos se mantienen.
    setCarrito((prev) => prev.filter((l) => !l.cristal && !/^(armazon|premium)-/.test(l.key)));
    const r = recetasPorPaciente[id];
    setRecetaEnVenta(r);
    // Si a este paciente lo atendieron en un operativo (ej. un condominio),
    // la venta queda ligada a ese mismo operativo — para que el cierre de
    // "cuánto se vendió en tal operativo" no dependa de que la vendedora se
    // acuerde de elegirlo a mano.
    // F01: el operativo se resuelve de nuevo para CADA paciente; nunca queda
    // pegado el del paciente anterior (ver lib/contexto-venta.ts).
    const operativoDeReceta = sugerirOperativoPorReceta && operativos.some(o => o.id === r?.operativo_id) ? r?.operativo_id : null;
    const contexto = resolverContextoVenta(operativoSesion || null, operativoDeReceta);
    setOperativoId(contexto.operativoId ?? "");
    const otro = contexto.recetaDeOtroOperativo ? operativos.find((o) => o.id === contexto.recetaDeOtroOperativo) : null;
    setAvisoContexto(
      contexto.recetaDeOtroOperativo
        ? `Su receta es de otro operativo (${otro?.nombre ?? "otro"}). La venta queda en el operativo de hoy.`
        : null
    );
    setIniciales(paresSugeridos(r));
  }

  function quitar(key: string) {
    if (key.startsWith("cristal-")) {
      const numero = numeroDePar(key);
      setIniciales(prev => prev.map((inicial, i) => i === numero - 1 ? null : inicial));
      setPresupuestos(prev => ({ ...prev, [numero]: undefined }));
      manejarCambioLente(numero, null);
      setFilasQuitadas(prev => ({ ...prev, [numero]: (prev[numero] ?? 0) + 1 }));
      return;
    }
    setCarrito((prev) => prev.filter((l) => l.key !== key));
  }

  function reiniciar() {
    setVentaId(crypto.randomUUID());
    setCarrito([]);
    setAbono({ modo: "total" });
    setPresupuestos({});
    setAcuerdo({ campo: "descuento", texto: "" });
    setPacienteId("");
    setRecetaEnVenta(undefined);
    setOperativoId(operativoSesion);
    setAvisoContexto(null);
    setBuscaPaciente("");
    setBuscaProducto("");
    setIniciales([null, null]);
    setFilasQuitadas({});
    setMedioPago("");
    setNumeroVoucher("");
    setPagoMP(null);
    setPaso(0);
  }

  // Sin señal (operativo en terreno, spec 8.2): la venta se arma completa
  // en el dispositivo con UUIDs locales y va al outbox; se sincroniza sola
  // al reconectar. Los IDs locales hacen el reintento idempotente.
  // Lo mismo se manda online y offline: la cola offline guarda esta misma
  // carga y la reenvía tal cual al reconectar, así que no hay un segundo
  // camino que olvide campos (A03). Costo, origen y diseño NO viajan: los
  // recalcula el servidor con el catálogo y la receta (A07).
  function armarVenta(): VentaInput {
    return {
      ventaId,
      fecha: new Date().toISOString(),
      pacienteId: pacienteId || null,
      operativoId: operativoId || null,
      recetaId: recetaPacienteId ?? null,
      sucursalId,
      items: lineasCobro.map((l) => ({
        productoId: l.productoId ?? null,
        descripcion: l.descripcion,
        cantidad: l.cantidad,
        precioUnitario: l.precioUnitario,
        descuento: l.descuento,
        // El cupo va explícito, no por posición en una lista (F01).
        cristalSlot: l.cristal ? numeroDePar(l.key) : null,
        marcoSlot: l.recargoSlot ?? null,
        armazonSlot: l.armazonSlot ?? null,
        ...(l.cristal && l.esCortesia ? { esCortesia: true } : {}),
      })),
      cristales: creaOT
        ? lineasCristal.map((l) => ({
            slot: numeroDePar(l.key),
            tipoLente: l.cristal!.tipoLente,
            rangoReceta: l.cristal!.rangoReceta,
            tratamiento: l.cristal!.tratamiento,
            posicion: l.cristal!.posicion ?? null,
          }))
        : [],
      armazones: lineasArmazon.map((l) => {
        const cobroMarco = carrito.find(c => c.recargoSlot === l.armazonSlot);
        return {
          slot: l.armazonSlot,
          productoId: l.productoId ?? null,
          marcoPropio: l.marcoPropio ?? false,
          descripcion: l.marcoDescrito ?? null,
          codigo: l.codigoMarco ?? null,
          nivelMarco: cobroMarco?.nivelMarco ?? "esencial",
          recargoEditado: cobroMarco?.recargoEditado ?? false,
        };
      }),
      abonoInicial: cobro.monto,
      // Sin cobro ahora (cortesía o sin abono) el medio no se usa.
      medioPago: medioPago || "efectivo",
      numeroVoucher: requiereVoucher(medioPago, cobro.monto) ? voucherActual.trim() : null,
      proveedorLabId: origenCristal === "laboratorio" ? laboratorioId || null : null,
    };
  }

  function guardarEnEquipo(venta: VentaInput) {
    try {
      if (!vendedorId) throw new Error("Sesión no disponible");
      encolarVenta(vendedorId, venta);
      reiniciar();
      setUltimaVenta(venta.ventaId);
      setMensaje("✓ Venta guardada en este equipo. Se enviará automáticamente.");
    } catch {
      setMensaje("No se pudo guardar en este equipo. La venta sigue abierta para reintentar.");
    }
  }

  async function cobrar() {
    if (guardando || faltaPaciente || paresSinMarco.length || acuerdoInvalido) return;
    const voucher = validarVoucher(medioPago, cobro.monto, voucherActual);
    if (voucher.error) { setMensaje(mercadoPago ? "Selecciona el cobro aprobado de Mercado Pago." : voucher.error); return; }
    setGuardando(true);
    setMensaje(null);
    const venta = armarVenta();

    if (operativoId || !navigator.onLine) {
      guardarEnEquipo(venta);
      setGuardando(false);
      return;
    }

    try {
      const resultado = await registrarVenta(venta);
      if (resultado.ok) {
        reiniciar();
        setUltimaVenta(resultado.ventaId);
        setMensaje(
          (resultado.otFolios?.length ?? 0) > 1
            ? `✓ Venta registrada · Órdenes de trabajo ${resultado.otFolios!.map((f) => `#${f}`).join(", ")} creadas`
            : resultado.otFolio
              ? `✓ Venta registrada · Orden de trabajo #${resultado.otFolio} creada`
              : "✓ Venta registrada"
        );
        router.refresh();
      } else {
        setMensaje(resultado.error);
      }
    } catch {
      // Se cortó la conexión a mitad: puede que la venta haya alcanzado a
      // guardarse o no. Se encola con el MISMO id — si ya estaba guardada,
      // la base la reconoce y no la duplica.
      guardarEnEquipo(venta);
    } finally {
      setGuardando(false);
    }
  }

  const boton =
    "rounded-xl px-5 py-3.5 text-base font-semibold transition disabled:opacity-50";
  const select =
    "w-full rounded-lg border border-tinta-suave/30 bg-white px-3 py-3 text-base outline-none focus:border-brand disabled:opacity-50";

  return (
    <div className="flex flex-col gap-4">
      {/* Barra de pasos: cada uno con su color. Los pasos ya hechos se
          pueden tocar para volver directo a cualquiera de ellos (no solo
          al anterior) sin perder lo ya cargado — el "‹" y el borde marcado
          avisan que se puede tocar. */}
      <ol aria-label="Pasos de la venta" className="grid grid-cols-2 gap-1.5 min-[440px]:grid-cols-4">
        {PASOS.map((titulo, i) => {
          const actual = i === paso;
          const hecho = i < paso;
          const color = COLOR_PASO[i];
          return (
            <li key={titulo} className="min-w-0">
              <button
                type="button"
                onClick={() => i <= paso && setPaso(i)}
                disabled={i > paso}
                aria-current={actual ? "step" : undefined}
                className={`flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl px-2 py-2 text-xs font-semibold transition sm:text-sm ${
                  actual
                    ? color.pill
                    : hecho
                      ? `${color.pillHecho} border-2 ${color.seccion.split(" ")[0]}`
                      : "border border-tinta/10 bg-white text-tinta-suave"
                }`}
              >
                {hecho && <span aria-hidden>‹</span>}
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-black/15 text-xs tabular-nums">
                  {hecho ? "✓" : i + 1}
                </span>
                {titulo}
              </button>
            </li>
          );
        })}
      </ol>

      {mensajeMostrado && (
        <p
          role="status"
          className={`rounded-lg px-3 py-2.5 text-sm font-medium ${
            mensajeMostrado.startsWith("✓") ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700"
          }`}
        >
          {mensajeMostrado}
          {ultimaVenta && mensajeMostrado.startsWith("✓ Venta registrada") && (
            <span className="mt-2 flex flex-wrap gap-2">
              <a
                href={`/ventas/${ultimaVenta}/certificado-fonasa`}
                className="rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-brand-dark shadow-sm"
              >
                📄 Certificado Fonasa
              </a>
              <a
                href={`/ventas/${ultimaVenta}/comprobante`}
                className="rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-tinta shadow-sm"
              >
                🧾 Comprobante
              </a>
            </span>
          )}
        </p>
      )}

      {/* ---------------------------------------------------------------- */}
      {paso === 0 && (
        <section className={`flex flex-col gap-3 rounded-2xl border ${COLOR_PASO[0].seccion} p-5 shadow-[0_1px_3px_rgba(23,21,15,0.08)]`}>
          <div>
            <h2 className={`text-xl font-bold tracking-tight ${COLOR_PASO[0].titulo}`}>Paciente</h2>
            <p className="text-sm text-tinta-suave">
              Busca al paciente para cargar su receta.
            </p>
          </div>

          {operativos.length > 0 && (
            <label className="flex flex-col gap-1 text-sm font-medium">
              Operativo
              <select
                value={operativoId}
                onChange={(e) => {
                  // Elegirlo a mano lo fija para toda la jornada.
                  setOperativoId(e.target.value);
                  setOperativoSesion(e.target.value);
                  setAvisoContexto(null);
                }}
                className={select}
              >
                <option value="">Sucursal · sin operativo</option>
                {operativos.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.nombre}
                  </option>
                ))}
              </select>
            </label>
          )}
          {operativoSesion && (
            <p className="rounded-lg bg-blue-50 px-3 py-2 text-xs font-medium text-blue-900">
              Aplicado a esta jornada.
            </p>
          )}
          {!operativoSesion && receta?.operativo_id && receta.operativo_id === operativoId && (
            <p className="rounded-lg bg-blue-50 px-3 py-2 text-xs font-medium text-blue-900">
              Operativo de su receta.
            </p>
          )}
          {avisoContexto && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900">{avisoContexto}</p>
          )}

          {/* La consulta ($5.000) se cobra aparte, sin armar una venta de
              lentes: queda en el operativo de hoy y cuadra con la máquina. */}
          <RegistrarConsulta operativoId={operativoId || null} mercadoPago={mercadoPago} usuarioId={vendedorId} />

          <input
            type="search"
            value={buscaPaciente}
            onChange={(e) => {
              const v = e.target.value;
              setBuscaPaciente(v);
            }}
            aria-label="Nombre o RUT del paciente"
            maxLength={80}
            placeholder="Nombre o RUT"
            className={select}
          />

          <ul className="flex max-h-72 flex-col gap-1 overflow-y-auto">
            {pacientesFiltrados.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => elegirPaciente(p.id)}
                  className={`flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm transition ${
                    pacienteId === p.id ? "bg-blue-800 text-white" : "border border-tinta/10 bg-white hover:bg-blue-50"
                  }`}
                >
                  <span className="flex-1 min-w-0 break-words font-medium">{p.nombre}</span>
                  <span className={pacienteId === p.id ? "text-xs" : "text-xs text-tinta-suave"}>
                    {formatearRut(p.rut)}
                  </span>
                </button>
              </li>
            ))}
            {pacientesFiltrados.length === 0 && (
              <li className="rounded-lg bg-white px-3 py-2.5 text-sm text-tinta-suave">
                Sin pacientes que coincidan.
              </li>
            )}
          </ul>

          {paciente && <p role="status" className="rounded-xl bg-white px-3 py-2 text-sm"><b>{paciente.nombre}</b> · {formatearRut(paciente.rut)}</p>}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setPaso(1)}
              className={`${boton} flex-1 bg-blue-800 text-white hover:bg-blue-900`}
            >
              {paciente ? `Continuar con ${paciente.nombre}` : "Continuar sin paciente"}
            </button>
            {pacienteId && (
              <button
                type="button"
                onClick={() => elegirPaciente("")}
                className={`${boton} border border-tinta-suave/30 text-tinta-suave hover:bg-white`}
              >
                Quitar paciente
              </button>
            )}
          </div>
        </section>
      )}

      {/* ---------------------------------------------------------------- */}
      {paso === 1 && (
        <section className={`flex flex-col gap-3 rounded-2xl border ${COLOR_PASO[1].seccion} p-5 shadow-[0_1px_3px_rgba(23,21,15,0.08)]`}>
          <div>
            <h2 className={`text-xl font-bold tracking-tight ${COLOR_PASO[1].titulo}`}>¿Lleva cristales?</h2>
            <p className="text-sm text-tinta-suave">
              Un multifocal es un solo par.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {iniciales.map((inicial, i) => (
              <FilaLente
                key={`par${i + 1}-${pacienteId}-${filasQuitadas[i + 1] ?? 0}`}
                numero={i + 1}
                costos={costos}
                factorVenta={factorVenta}
                receta={receta}
                catalogoLab={catalogoLab}
                inicial={inicial}
                guardado={lineasCristal.find(l => numeroDePar(l.key) === i + 1)}
                onCambio={(d) => manejarCambioLente(i + 1, d)}
              />
            ))}
          </div>
          {iniciales.length < MAX_PARES && (
            <button
              type="button"
              onClick={() => setIniciales((prev) => [...prev, null])}
              className="rounded-lg border-2 border-dashed border-violet-300 bg-white px-4 py-3 text-sm font-semibold text-violet-800 hover:bg-violet-50"
            >
              ＋ Agregar otro par
            </button>
          )}

          {/* Los dos van igual al laboratorio; la diferencia es si el
              cristal ya está hecho (más barato) o hay que tallarlo a
              medida. Eso no se elige a mano: lo decide la receta contra la
              lista del laboratorio, cristal por cristal, y acá solo se
              muestra en qué quedó. Elegirlo a ojo es donde se cometía el
              error, y es un dato que se le informa al paciente. */}
          {lineasCristal.length > 0 && receta && (
            <div className="flex flex-col gap-1.5 rounded-xl border border-tinta-suave/20 bg-white p-3">
              <p className="text-sm font-semibold">Cómo se pide a Fides</p>
              {lineasCristal.map((l) => {
                const real = costoRealDeLinea(l);
                const esStock = real?.origen === "stock";
                return (
                  <div key={l.key} className="flex flex-wrap items-baseline gap-x-2 text-sm">
                    <span className="font-medium">
                      Par {numeroDePar(l.key)}
                      {l.cristal!.posicion ? ` · ${l.cristal!.posicion}` : ""}
                    </span>
                    <span
                      className={`rounded-md px-2 py-0.5 text-xs font-bold ${
                        esStock ? "bg-green-100 text-green-900" : "bg-amber-100 text-amber-900"
                      }`}
                    >
                      {esStock ? "Stock" : "Laboratorio"}
                    </span>
                    <span className="text-xs text-tinta-suave">
                      {real ? `${real.motivo} · costo ${clp(real.costo)}` : "Este cristal no está enlazado al catálogo de Fides (revisa Precios)"}
                    </span>
                    {/* Una promoción del laboratorio con fecha de término.
                        Se avisa acá porque el precio de venta se fija hoy
                        y el costo sube el día que se acaba. */}
                    {real?.promocion && (
                      <span className="w-full text-xs font-medium text-violet-900">
                        Promoción hasta el {fechaLegible(real.promocion.hasta)}. Después cuesta {clp(real.costoSinPromocion)}.
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {lineasCristal.length > 0 && origenCristal === "laboratorio" && laboratorios.length > 0 && (
            <label className="flex flex-col gap-1 text-sm font-medium">
              Laboratorio
              <select value={laboratorioId} onChange={(e) => setLaboratorioId(e.target.value)} className={select}>
                {laboratorios.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.nombre}
                  </option>
                ))}
              </select>
            </label>
          )}

          <Resumen carrito={carrito} total={total} descuento={descuento} quitar={quitar} editarPrecioProducto={editarPrecioProducto} />

          {creaOT && (
            <p className={`rounded-lg px-3 py-2 text-xs font-medium ${COLOR_PASO[1].aviso}`}>
              Al cobrar se crea la orden de trabajo
              {recetaPacienteId ? " con la receta cargada." : ". Ojo: el paciente no tiene receta cargada."}
            </p>
          )}
          {faltaPaciente && (
            <p className="rounded-lg bg-amber-100 px-3 py-2 text-xs font-medium text-amber-800">
              Esto es solo una cotización: elige un paciente para guardar la venta y crear su orden.{" "}
              <button type="button" onClick={() => setPaso(0)} className="font-bold underline">
                Elegir paciente
              </button>
            </p>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setPaso(0)}
              className={`${boton} border border-tinta-suave/30 text-tinta-suave hover:bg-white`}
            >
              Atrás
            </button>
            <button
              type="button"
              onClick={() => setPaso(2)}
              disabled={hayCristalesPorCotizar}
              className={`${boton} flex-1 bg-violet-800 text-white hover:bg-violet-900 disabled:opacity-50`}
            >
              Continuar
            </button>
          </div>
        </section>
      )}

      {/* ---------------------------------------------------------------- */}
      {paso === 2 && (
        <section className={`flex flex-col gap-3 rounded-2xl border ${COLOR_PASO[2].seccion} p-5 shadow-[0_1px_3px_rgba(23,21,15,0.08)]`}>
          <div>
            <h2 className={`text-xl font-bold tracking-tight ${COLOR_PASO[2].titulo}`}>{lineasCristal.length > 0 ? "Agregar marco" : "Agregar productos"}</h2>
            <p className="text-sm text-tinta-suave">
              {lineasCristal.length > 0
                ? "Elige una categoría y registra el marco de cada par."
                : "Toca un producto para agregarlo, o sigue sin agregar nada."}
            </p>
          </div>

          {lineasCristal.length > 0 && (
            // Uno debajo del otro (no lado a lado): en el iPad el segundo
            // quedaba angosto al costado y se pasaba por alto.
            <div className="flex flex-col gap-4">
              {lineasCristal.map((l) => {
                const numero = numeroDePar(l.key);
                const etiqueta =
                  lineasCristal.length > 1
                    ? `Par ${numero}${l.cristal?.posicion ? ` (${l.cristal.posicion})` : ""}`
                    : "tu lente";
                const marco = carrito.find((c) => c.key === `armazon-${numero}`);
                const cobroMarco = carrito.find(c => c.recargoSlot === numero);
                const nivelActual = cobroMarco?.nivelMarco ?? "esencial";
                const tarifasHabilitadas = nivelesMarcoDisponibles(recargosMarcos);
                const categorias = marco?.recargoEspecial == null ? tarifasHabilitadas : NIVELES_MARCO.filter(
                  n => n.id === "especial" || tarifasHabilitadas.includes(n),
                );
                const precioMarco = cobroMarco?.precioUnitario ?? 0;
                const presupuestoTexto = presupuestos[numero] ?? "";
                const presupuesto = presupuestoTexto === "" ? null : montoANumero(presupuestoTexto);
                const precioLista = precioListaMarco(nivelActual, recargosMarcos, marco?.recargoEspecial);
                return (
                  <div key={`armazon-slot-${numero}`} className="flex flex-col gap-2">
                    <SelectorArmazon
                      etiqueta={etiqueta}
                      productos={productos}
                      elegido={marco}
                      onElegir={(p) => elegirArmazon(numero, p)}
                      onMarcarPropio={() => marcarMarcoPropio(numero)}
                      onDescribir={(d, codigo) => describirMarco(numero, d, codigo)}
                    />
                    {marco?.marcoPropio ? (
                      <div className="flex flex-col gap-2 rounded-xl border border-amber-200 p-3">
                        <CampoPresupuestoPar
                          valor={presupuestoTexto}
                          onChange={valor => setPresupuestos(prev => ({ ...prev, [numero]: valor }))}
                        />
                        <p className="text-sm">
                          Cristales con marco propio <strong>{clp(l.precioUnitario)}</strong>
                          <EstadoPresupuestoPar precio={l.precioUnitario} presupuesto={presupuesto} />
                        </p>
                      </div>
                    ) : (
                      <fieldset className="flex flex-col gap-2 rounded-xl border border-amber-200 p-3">
                        <legend className="px-1 text-sm font-bold">Categoría y precio del marco · Par {numero}</legend>
                        <CampoPresupuestoPar
                          valor={presupuestoTexto}
                          onChange={valor => setPresupuestos(prev => ({ ...prev, [numero]: valor }))}
                        />
                        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
                          {categorias.map((n) => {
                            const elegido = nivelActual === n.id;
                            const recargo = elegido ? precioMarco : precioListaMarco(n.id, recargosMarcos, marco?.recargoEspecial);
                            const precioPar = l.precioUnitario + recargo;
                            const dentroDelPresupuesto = presupuesto !== null && precioPar <= presupuesto;
                            return (
                              <button
                                key={n.id}
                                type="button"
                                onClick={() => !elegido && fijarPrecioMarco(numero, n.id)}
                                aria-pressed={elegido}
                                className={`rounded-xl border-2 px-3 py-2 text-left ${
                                  elegido ? "border-amber-900 bg-amber-900 text-white"
                                    : dentroDelPresupuesto ? "border-emerald-700 bg-emerald-50 text-emerald-900"
                                    : "border-tinta/20 bg-white text-tinta"
                                }`}
                              >
                                <span className="block font-bold">{n.nombre}</span>
                                <span className="block text-xs">{recargo === 0 ? "Marco incluido" : `Marco +${clp(recargo)}`}</span>
                                <span className="block text-base font-semibold tabular-nums">{clp(precioPar)} el par</span>
                                <EstadoPresupuestoPar precio={precioPar} presupuesto={presupuesto} />
                              </button>
                            );
                          })}
                        </div>
                        {descuento > 0 && <p className="text-xs text-tinta-suave">Precios por par antes del descuento de la venta.</p>}
                        <div className="flex flex-wrap items-end gap-2">
                          <label className="flex min-w-40 flex-1 flex-col gap-1 text-sm font-semibold">
                            Precio del marco (CLP)
                            <input
                              inputMode="numeric"
                              maxLength={12}
                              placeholder="0"
                              value={precioMarco === 0 && cobroMarco?.recargoEditado ? "" : formatearMonto(precioMarco)}
                              onChange={e => fijarPrecioMarco(numero, nivelActual, montoANumero(e.target.value))}
                              className={select}
                            />
                          </label>
                          <button
                            type="button"
                            onClick={() => fijarPrecioMarco(numero, nivelActual)}
                            className="rounded-lg border border-amber-800/30 bg-white px-3 py-2.5 text-sm font-semibold text-amber-900"
                          >
                            Aplicar precio de lista
                          </button>
                        </div>
                        <p className="text-sm text-tinta-suave">
                          Lista {nombreNivelMarco(nivelActual)} {clp(precioLista)} · Par <strong>{clp(l.precioUnitario + precioMarco)}</strong>
                        </p>
                      </fieldset>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {lineasCristal.length > 0 && <p className="text-xs font-semibold text-tinta-suave">Otros productos</p>}

          <input
            type="search"
            value={buscaProducto}
            onChange={(e) => setBuscaProducto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter" || e.nativeEvent.isComposing || !marcoSueltoPorCodigo) return;
              e.preventDefault();
              agregarProducto(marcoSueltoPorCodigo);
              setBuscaProducto("");
            }}
            aria-label="Buscar productos por código, modelo o marca"
            placeholder="Buscar código, modelo o marca…"
            className={select}
          />

          <ul className="flex max-h-72 flex-col gap-1 overflow-y-auto">
            {productosFiltrados.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => agregarProducto(p)}
                  className="flex w-full items-center gap-2 rounded-lg bg-white px-3 py-2.5 text-left text-sm transition hover:bg-amber-50"
                >
                  <span className="flex-1 truncate">
                    {p.marca ? `${p.marca} ` : ""}
                    {p.nombre}
                    {p.sku && p.sku !== p.nombre && <small className="block font-semibold">{p.sku}</small>}
                  </span>
                  {p.categoria === "armazon" ? (
                    <span className="font-semibold text-amber-700">{clp(p.precio_venta)}</span>
                  ) : (
                    <span className="font-semibold">{clp(p.precio_venta)}</span>
                  )}
                  <span className="rounded-md bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800">
                    ＋
                  </span>
                </button>
              </li>
            ))}
            {productosFiltrados.length === 0 && (
              <li className="rounded-lg bg-white px-3 py-2.5 text-sm text-tinta-suave">
                {productos.length === 0
                  ? "No hay productos. Se agregan en Inventario."
                  : "Sin productos que coincidan."}
              </li>
            )}
          </ul>

          <Resumen carrito={carrito} total={total} descuento={descuento} quitar={quitar} editarPrecioProducto={editarPrecioProducto} />

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setPaso(1)}
              className={`${boton} border border-tinta-suave/30 text-tinta-suave hover:bg-white`}
            >
              Atrás
            </button>
            <button
              type="button"
              onClick={() => setPaso(3)}
              disabled={paresSinMarco.length > 0}
              className={`${boton} flex-1 bg-amber-700 text-white hover:bg-amber-800`}
            >
              {paresSinMarco.length > 0
                ? `Falta el marco del par ${paresSinMarco.join(", ")}`
                : "Continuar al pago"}
            </button>
          </div>
        </section>
      )}

      {/* ---------------------------------------------------------------- */}
      {paso === 3 && (
        <section className={`flex flex-col gap-3 rounded-2xl border ${COLOR_PASO[3].seccion} p-5 shadow-[0_1px_3px_rgba(23,21,15,0.08)]`}>
          <div>
            <h2 className={`text-xl font-bold tracking-tight ${COLOR_PASO[3].titulo}`}>Cobro</h2>
            <p className="text-sm text-tinta-suave">
              {paciente ? `Venta a ${paciente.nombre}.` : "Venta sin paciente."} Revisa antes de cobrar.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm font-medium">
              Total acordado (CLP)
              <input
                inputMode="numeric"
                maxLength={12}
                value={acuerdo.campo === "total" ? acuerdo.texto : formatearMonto(total)}
                onChange={e => setAcuerdo({ campo: "total", texto: formatearMonto(e.target.value) })}
                placeholder={formatearMonto(subtotal)}
                aria-invalid={acuerdoInvalido && acuerdo.campo === "total"}
                aria-describedby={acuerdoInvalido ? "acuerdo-invalido" : undefined}
                className={select}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium">
              Descuento de la venta (CLP)
              <input
                inputMode="numeric"
                maxLength={12}
                value={acuerdo.campo === "descuento" ? acuerdo.texto : formatearMonto(descuento)}
                onChange={e => setAcuerdo({ campo: "descuento", texto: formatearMonto(e.target.value) })}
                placeholder="0"
                aria-invalid={acuerdoInvalido && acuerdo.campo === "descuento"}
                aria-describedby={acuerdoInvalido ? "acuerdo-invalido" : undefined}
                className={select}
              />
            </label>
          </div>
          {acuerdoInvalido && (
            <p id="acuerdo-invalido" role="alert" className="text-sm font-semibold text-red-700">
              {acuerdo.campo === "total" ? "El total acordado" : "El descuento"} supera el subtotal de {clp(subtotal)}.
            </p>
          )}

          <Resumen carrito={carrito} total={total} descuento={descuento} quitar={quitar} editarPrecioProducto={editarPrecioProducto} />

          <label className="flex flex-col gap-1 text-sm font-medium">
            ¿Cuánto paga ahora?
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-tinta-suave">
                $
              </span>
              <input
                inputMode="numeric"
                value={textoAbono}
                onChange={(e) => {
                  setAbono({ modo: "manual", texto: formatearMonto(e.target.value) });
                }}
                placeholder={formatearMonto(total)}
                className={`${select} pl-7 text-right`}
              />
            </div>
            <span className="text-xs font-normal text-tinta-suave">
              Vacío = paga todo · 0 = no paga ahora.
            </span>
          </label>

          {total > 0 && (
            <div className="flex flex-wrap gap-2" role="group" aria-label="Opciones de pago inicial">
              {OPCIONES_ABONO.filter(({ modo }) => modo === "total" || montosSugeridos[modo] < total).map(({ modo, titulo }) => (
                <button
                  key={modo}
                  type="button"
                  aria-pressed={abono.modo === modo}
                  onClick={() => setAbono({ modo })}
                  className={`min-h-11 rounded-lg border px-3.5 py-2 text-left text-sm font-semibold transition ${
                    abono.modo === modo ? "border-emerald-800 bg-emerald-800 text-white" : "border-emerald-800/25 bg-white text-emerald-900 hover:bg-emerald-50"
                  }`}
                >
                  {titulo} <span className="block tabular-nums">{clp(montosSugeridos[modo])}</span>
                </button>
              ))}
            </div>
          )}
          <dl className="grid grid-cols-2 gap-2 rounded-xl bg-emerald-50 p-3 text-emerald-950" aria-live="polite">
            <div>
              <dt className="text-sm font-medium">Paga hoy</dt>
              <dd className="text-xl font-bold tabular-nums">{clp(montoACobrar)}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium">Saldo al entregar</dt>
              <dd className="text-xl font-bold tabular-nums">{clp(total - montoACobrar)}</dd>
            </div>
          </dl>
          {abonoMinimo > 0 && montoACobrar > 0 && montoACobrar < abonoMinimo && (
            <p className="text-sm text-amber-900">El abono mínimo sugerido para este pedido es {clp(abonoMinimo)}.</p>
          )}
          {abonoNoCubre && (
            <p className="rounded-lg bg-amber-100 px-3 py-2 text-sm font-semibold text-amber-900">
              Ojo: este precio no cubre el costo del lente.
            </p>
          )}

          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Medio de pago</span>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {(
                [
                  { valor: "debito", titulo: "Débito en máquina" },
                  { valor: "credito", titulo: "Crédito en máquina" },
                  { valor: "efectivo", titulo: "Efectivo" },
                  { valor: "transferencia", titulo: "Transferencia bancaria" },
                ] as const
              ).map((m) => (
                <button
                  key={m.valor}
                  type="button"
                  aria-pressed={medioPago === m.valor}
                  onClick={() => {
                    if (medioPago === m.valor) return;
                    setMedioPago(m.valor);
                    setNumeroVoucher("");
                    setPagoMP(null);
                    setMensaje(null);
                  }}
                  className={`rounded-xl border-2 px-3 py-3 text-base font-semibold ${
                    medioPago === m.valor ? "border-emerald-800 bg-emerald-800 text-white" : "border-tinta/15 bg-white"
                  }`}
                >
                  {m.titulo}
                </button>
              ))}
            </div>
          </div>

          {medioPago === "transferencia" && montoACobrar > 0 && (
            <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
              Incluye transferencias a la cuenta de Mercado Pago. Verifica el abono de {clp(montoACobrar)} en la cuenta receptora antes de registrarlo. Sin voucher de máquina.
            </p>
          )}
          {requiereVoucher(medioPago, montoACobrar) && (mercadoPago ?
            <ElegirCobroMercadoPago key={`${medioPago}:${montoACobrar}`} medio={medioPago} monto={montoACobrar} value={voucherActual}
              onChange={id => setPagoMP({ medio: medioPago, monto: montoACobrar, id })} disabled={guardando} />
            : <CampoVoucher value={numeroVoucher} onChange={setNumeroVoucher} disabled={guardando} />)}
          {faltaPaciente && (
            <p className="rounded-lg bg-amber-100 px-3 py-2 text-sm font-semibold text-amber-900">
              Elige un paciente para guardar la venta y crear su orden.{" "}
              <button type="button" onClick={() => setPaso(0)} className="underline">
                Ir a Paciente
              </button>
            </p>
          )}
          {cobro.tipo === "sin_abono" && total > 0 && (
            <p className="rounded-lg bg-amber-100 px-3 py-2 text-sm font-semibold text-amber-900">
              No paga nada ahora: queda debiendo {clp(total)}.
            </p>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setPaso(2)}
              className={`${boton} border border-tinta-suave/30 text-tinta-suave hover:bg-white`}
            >
              Atrás
            </button>
            <button
              type="button"
              onClick={cobrar}
              disabled={guardando || carrito.length === 0 || faltaPaciente || paresSinMarco.length > 0 || acuerdoInvalido || (montoACobrar > 0 && !medioPago) || Boolean(validarVoucher(medioPago, montoACobrar, voucherActual).error)}
              className={`${boton} flex-1 bg-emerald-800 text-white hover:bg-emerald-900`}
            >
              {guardando
                ? "Registrando…"
                : faltaPaciente
                  ? "Falta elegir al paciente"
                  : montoACobrar > 0 && !medioPago
                  ? "Elige cómo paga"
                  : validarVoucher(medioPago, montoACobrar, voucherActual).error
                    ? mercadoPago ? "Selecciona el cobro aprobado" : "Completa el número de voucher"
                  : montoACobrar === 0
                    ? total > 0
                      ? "Registrar sin abono"
                      : "Registrar cortesía"
                    : medioPago === "transferencia"
                      ? `Registrar transferencia de ${clp(montoACobrar)}`
                      : mercadoPago && requiereVoucher(medioPago, montoACobrar) ? `Registrar pago de ${clp(montoACobrar)}` : `Cobrar ${clp(montoACobrar)}`}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}

// Detalle de lo que lleva la venta hasta ahora. Se repite en cada paso
// desde el segundo para no obligar a recordar lo ya agregado. Los cristales
// se identifican como "Lente 1"/"Lente 2" (no "lejos"/"cerca": un Bifocal no
// tiene esa distinción).
function Resumen({
  carrito,
  total,
  descuento,
  quitar,
  editarPrecioProducto,
}: {
  carrito: LineaCarrito[];
  total: number;
  descuento: number;
  quitar: (key: string) => void;
  editarPrecioProducto: (key: string, precio: number) => void;
}) {
  if (carrito.length === 0) {
    return (
      <p className="rounded-lg bg-white px-3 py-2.5 text-sm text-tinta-suave">
        Todavía no hay nada en la venta.
      </p>
    );
  }

  return (
    <div className="rounded-lg bg-white p-3">
      <ul className="flex flex-col gap-1.5">
        {carrito.map((l) => (
          <li key={l.key} className="flex items-center gap-2 text-sm">
            <span className="flex-1 truncate">
              {l.cantidad > 1 ? `${l.cantidad}× ` : ""}
              {l.descripcion}
              {l.cristal && (
                <span className="ml-1.5 rounded-full bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold text-violet-800">
                  Par {numeroDePar(l.key)}
                  {l.cristal.posicion ? ` · ${l.cristal.posicion}` : ""}
                </span>
              )}
              {l.armazonSlot && (
                <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
                  Par {l.armazonSlot}
                </span>
              )}
              {l.cristal?.sugerido && (
                <span className="ml-1.5 rounded-full bg-brand/10 px-1.5 py-0.5 text-[10px] font-semibold text-brand-dark">
                  Sugerido en la receta
                </span>
              )}
            </span>
            {l.key.startsWith("prod-") ? (
              <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                <input
                  aria-label={`Precio unitario de ${l.descripcion}`}
                  inputMode="numeric"
                  maxLength={12}
                  value={l.precioUnitario === 0 ? "" : formatearMonto(l.precioUnitario)}
                  placeholder="0"
                  onChange={e => editarPrecioProducto(l.key, montoANumero(e.target.value))}
                  className="w-24 rounded-md border border-tinta/20 px-2 py-1 text-right font-semibold tabular-nums"
                />
                {l.cantidad > 1 && <span className="font-semibold">{clp(l.cantidad * l.precioUnitario)}</span>}
              </div>
            ) : <span className="font-semibold">{l.precioPendiente ? "Por cotizar" : clp(l.cantidad * l.precioUnitario)}</span>}
            {l.armazonSlot === undefined && l.recargoSlot === undefined && (
              <button
                type="button"
                onClick={() => quitar(l.key)}
                className="text-tinta-suave transition hover:text-red-600"
                aria-label={`Quitar ${l.descripcion}`}
              >
                ✕
              </button>
            )}
          </li>
        ))}
      </ul>
      {descuento > 0 && (
        <div className="mt-2 space-y-1 border-t border-tinta-suave/15 pt-2 text-sm">
          <p className="flex justify-between"><span>Subtotal</span><span>{clp(total + descuento)}</span></p>
          <p className="flex justify-between font-semibold text-emerald-800"><span>Descuento</span><span>−{clp(descuento)}</span></p>
        </div>
      )}
      <div className="mt-2 flex items-center justify-between border-t border-tinta-suave/15 pt-2">
        <span className="font-bold">Total</span>
        <span className="text-xl font-bold">{clp(total)}</span>
      </div>
    </div>
  );
}
