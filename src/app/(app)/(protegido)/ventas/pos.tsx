"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { registrarVenta } from "@/lib/actions/ventas";
import { encolar, type CambioSync } from "@/lib/offline/outbox";
import { clp } from "@/lib/clp";
import { formatearRut } from "@/lib/rut";
import { formatearMonto, montoANumero } from "@/lib/formato";
import { rangoParaPosicion, nombreCristal } from "@/lib/cristales";
import { hoyEnChile, sumarDias } from "@/lib/fechas";

type Paciente = { id: string; nombre: string; rut: string | null };
type Producto = { id: string; nombre: string; marca: string | null; precio_venta: number; categoria: string };
type CostoCristal = {
  tipo_lente: string;
  rango_receta: string;
  tratamiento: string;
  costo: number;
  precio_venta: number;
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
  armazonSlot?: 1 | 2;
};

// La venta se arma en cuatro pasos, uno por pantalla, en vez de mostrar
// todos los controles a la vez: quien vende en el mesón sigue una sola
// instrucción por vez y no tiene que saber de antemano qué mirar primero.
// Primero los cristales (donde se define el precio) y recién al final el
// armazón, que es gratis y lo único que queda por elegir.
const PASOS = ["Paciente", "Cristales", "Armazón", "Pago"] as const;

// Abono mínimo por tipo de lente: números cerrados y fáciles de recordar,
// no el costo exacto del laboratorio (que varía por tratamiento y rango).
// Quedan un poco por sobre el costo real para dejar margen — así el abono
// siempre alcanza para mandar a hacer el cristal sin poner plata propia.
const ABONO_MINIMO_POR_TIPO: Record<string, number> = {
  Monofocal: 10000,
  Bifocal: 40000,
  Multifocal: 80000,
};

// Un color bien distinto por paso — alto contraste a propósito, para que
// sea fácil seguir en qué parte de la venta se está de un vistazo (pedido
// explícito: quien vende tiene baja visión).
const COLOR_PASO = [
  {
    pill: "bg-blue-600 text-white",
    pillHecho: "bg-blue-100 text-blue-900 hover:bg-blue-200",
    seccion: "border-blue-300 bg-blue-50",
    titulo: "text-blue-900",
    aviso: "bg-blue-100 text-blue-900",
  },
  {
    pill: "bg-violet-600 text-white",
    pillHecho: "bg-violet-100 text-violet-900 hover:bg-violet-200",
    seccion: "border-violet-300 bg-violet-50",
    titulo: "text-violet-900",
    aviso: "bg-violet-100 text-violet-900",
  },
  {
    pill: "bg-amber-500 text-white",
    pillHecho: "bg-amber-100 text-amber-900 hover:bg-amber-200",
    seccion: "border-amber-300 bg-amber-50",
    titulo: "text-amber-900",
    aviso: "bg-amber-100 text-amber-900",
  },
  {
    pill: "bg-green-600 text-white",
    pillHecho: "bg-green-100 text-green-900 hover:bg-green-200",
    seccion: "border-green-300 bg-green-50",
    titulo: "text-green-900",
    aviso: "bg-green-100 text-green-900",
  },
] as const;

function lineaDeCombo(
  numero: 1 | 2,
  combo: CostoCristal,
  factorVenta: number,
  opciones?: { posicion?: "lejos" | "cerca"; sugerido?: boolean; esRegalo?: boolean }
): LineaCarrito {
  // Precio editable de la óptica (/precios); el factor es solo respaldo.
  // Cortesía (coordinadores sociales y similares que se lo ganan): el
  // cristal se manda a hacer igual, con su costo real, pero se cobra $0 —
  // así reportes/utilidad muestran el costo real de ese regalo, no que "no
  // costó nada".
  const precio = opciones?.esRegalo ? 0 : combo.precio_venta > 0 ? combo.precio_venta : combo.costo * factorVenta;
  return {
    key: `cristal-${numero}`,
    descripcion: `Cristales ${nombreCristal(combo.tipo_lente, combo.tratamiento)}${opciones?.esRegalo ? " (cortesía)" : ""}`,
    cantidad: 1,
    precioUnitario: precio,
    cristal: {
      tipoLente: combo.tipo_lente,
      rangoReceta: combo.rango_receta,
      tratamiento: combo.tratamiento,
      costoLaboratorio: combo.costo,
      posicion: opciones?.posicion,
      sugerido: opciones?.sugerido,
    },
  };
}

type PrefillLente = { tipoLente: string; tratamiento: string; posicion?: "lejos" | "cerca"; sugerido: boolean } | null;

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
  inicial,
  onCambio,
}: {
  numero: 1 | 2;
  costos: CostoCristal[];
  factorVenta: number;
  receta: RecetaResumen | undefined;
  inicial: PrefillLente;
  onCambio: (datos: { combo: CostoCristal; posicion?: "lejos" | "cerca"; sugerido?: boolean; esRegalo?: boolean } | null) => void;
}) {
  const [tipoLente, setTipoLente] = useState(inicial?.tipoLente ?? "");
  const [posicion, setPosicion] = useState<"lejos" | "cerca">(inicial?.posicion === "cerca" ? "cerca" : "lejos");
  const [tratamiento, setTratamiento] = useState(inicial?.tratamiento ?? "");
  const [rangoManual, setRangoManual] = useState("");
  const [sugerido, setSugerido] = useState(inicial?.sugerido ?? false);
  // Para gente que se lo gana (coordinadores sociales y similares): el
  // lente se sigue mandando a hacer normal, pero queda a $0.
  const [esRegalo, setEsRegalo] = useState(false);

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
  const rangos = useMemo(
    () => [...new Set(costos.filter((c) => c.tipo_lente === tipoLente).map((c) => c.rango_receta))],
    [costos, tipoLente]
  );
  const tratamientos = useMemo(
    () => costos.filter((c) => c.tipo_lente === tipoLente && c.rango_receta === rango),
    [costos, tipoLente, rango]
  );
  const combo = tratamientos.find((c) => c.tratamiento === tratamiento);

  // Solo al montar: si venía precargada por la sugerencia del tecnólogo,
  // se suma sola al carrito apenas aparece la fila.
  useEffect(() => {
    if (combo) onCambio({ combo, posicion: tipoLente === "Monofocal" ? posicion : undefined, sugerido, esRegalo });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function elegirTratamiento(valor: string) {
    setTratamiento(valor);
    setSugerido(false);
    const elegido = tratamientos.find((c) => c.tratamiento === valor);
    onCambio(elegido ? { combo: elegido, posicion: tipoLente === "Monofocal" ? posicion : undefined, esRegalo } : null);
  }

  function alternarRegalo(valor: boolean) {
    setEsRegalo(valor);
    if (combo) onCambio({ combo, posicion: tipoLente === "Monofocal" ? posicion : undefined, sugerido, esRegalo: valor });
  }

  const select =
    "w-full rounded-lg border border-tinta-suave/30 bg-white px-2 py-2.5 text-sm outline-none focus:border-violet-500 disabled:opacity-50";

  return (
    <fieldset className="rounded-xl border border-violet-200 bg-white p-3">
      <legend className="px-1 text-sm font-bold text-violet-900">Lente {numero}</legend>
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
              ¿Es para lejos o para cerca? (cerca suma la adición al rango)
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
              Rango calculado automático: <b>{rangoAuto}</b>
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
                Este paciente no tiene receta cargada, hay que elegir el rango a mano.
              </span>
            </label>
          ))}

        {tipoLente && (
          <label className="flex flex-col gap-1 text-xs font-medium">
            Tratamiento
            <select value={tratamiento} onChange={(e) => elegirTratamiento(e.target.value)} disabled={!rango} className={select}>
              <option value="">Elegir…</option>
              {tratamientos.map((c) => (
                <option key={c.tratamiento} value={c.tratamiento}>
                  {nombreCristal(c.tipo_lente, c.tratamiento)} —{" "}
                  {clp(c.precio_venta > 0 ? c.precio_venta : c.costo * factorVenta)}
                </option>
              ))}
            </select>
          </label>
        )}

        {combo && (
          <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-tinta-suave/25 bg-white px-3 py-2 text-xs font-medium has-checked:border-brand has-checked:bg-brand/5">
            <input
              type="checkbox"
              checked={esRegalo}
              onChange={(e) => alternarRegalo(e.target.checked)}
              className="accent-brand"
            />
            🎁 Cortesía / regalo (coordinador social, etc.) — se manda a hacer igual, pero queda en $0
          </label>
        )}

        {combo && (
          <p className="rounded-lg bg-violet-600 px-3 py-2.5 text-center text-base font-bold text-white">
            {esRegalo ? "$0 (cortesía)" : clp(combo.precio_venta > 0 ? combo.precio_venta : combo.costo * factorVenta)}
            {sugerido && !esRegalo && (
              <span className="ml-1.5 text-xs font-semibold text-violet-100">(sugerido en la receta)</span>
            )}
          </p>
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
function SelectorArmazon({
  etiqueta,
  productos,
  elegido,
  onElegir,
}: {
  etiqueta: string;
  productos: Producto[];
  elegido: LineaCarrito | undefined;
  onElegir: (producto: Producto | null) => void;
}) {
  const [busca, setBusca] = useState("");
  const armazones = useMemo(() => productos.filter((p) => p.categoria === "armazon"), [productos]);
  const filtrados = useMemo(() => {
    const t = busca.trim().toLowerCase();
    if (!t) return armazones;
    return armazones.filter((p) => `${p.marca ?? ""} ${p.nombre}`.toLowerCase().includes(t));
  }, [armazones, busca]);

  return (
    <fieldset className="flex-1 rounded-xl border border-amber-300 bg-white p-3">
      <legend className="px-1 text-sm font-bold text-amber-900">Armazón — {etiqueta}</legend>
      {elegido ? (
        <div className="flex items-center justify-between gap-2 rounded-lg bg-amber-100 px-3 py-2.5">
          <span className="text-sm font-semibold text-amber-900">{elegido.descripcion}</span>
          <button
            type="button"
            onClick={() => onElegir(null)}
            className="whitespace-nowrap text-xs font-semibold text-amber-800 underline"
          >
            Cambiar
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <input
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar marca, modelo o código…"
            className="w-full rounded-lg border border-tinta-suave/30 bg-white px-3 py-2 text-sm outline-none focus:border-amber-500"
          />
          <ul className="flex max-h-56 flex-col gap-1 overflow-y-auto">
            {filtrados.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => onElegir(p)}
                  className="flex w-full items-center gap-2 rounded-lg bg-crema-claro px-3 py-2 text-left text-sm transition hover:bg-amber-50"
                >
                  <span className="flex-1 truncate">
                    {p.marca ? `${p.marca} ` : ""}
                    {p.nombre}
                  </span>
                </button>
              </li>
            ))}
            {filtrados.length === 0 && (
              <li className="rounded-lg bg-crema-claro px-3 py-2 text-xs text-tinta-suave">
                {armazones.length === 0 ? "No hay armazones cargados en Inventario." : "Sin coincidencias."}
              </li>
            )}
          </ul>
        </div>
      )}
    </fieldset>
  );
}

export default function PuntoDeVenta({
  pacientes,
  productos,
  costos,
  laboratorios,
  factorVenta,
  tenantId,
  sucursalId,
  vendedorId,
  recetasPorPaciente,
  operativos,
}: {
  pacientes: Paciente[];
  productos: Producto[];
  costos: CostoCristal[];
  laboratorios: { id: string; nombre: string }[];
  factorVenta: number;
  tenantId: string;
  sucursalId: string | null;
  vendedorId: string | null;
  recetasPorPaciente: Record<string, RecetaResumen | undefined>;
  operativos: { id: string; nombre: string; fecha: string }[];
}) {
  const router = useRouter();
  const [paso, setPaso] = useState(0);
  // Cada paso puede tener distinto largo — sin esto la pantalla se quedaba
  // scrolleada donde iba antes y había que subir a mano para ver el título
  // del paso nuevo (fácil perderse).
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [paso]);
  const [pacienteId, setPacienteId] = useState<string>("");
  const [operativoId, setOperativoId] = useState<string>("");
  const [buscaPaciente, setBuscaPaciente] = useState("");
  const [buscaProducto, setBuscaProducto] = useState("");
  const [carrito, setCarrito] = useState<LineaCarrito[]>([]);
  const [abono, setAbono] = useState<string>("");
  const [medioPago, setMedioPago] = useState("efectivo");
  const [laboratorioId, setLaboratorioId] = useState<string>(laboratorios[0]?.id ?? "");
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [origenCristal, setOrigenCristal] = useState<"laboratorio" | "stock">("laboratorio");

  const receta = pacienteId ? recetasPorPaciente[pacienteId] : undefined;
  // Lo que trae precargado cada fila cuando se elige el paciente — cada
  // fila lo usa solo como valor inicial y lo puede cambiar sin problema.
  const [inicialLente1, setInicialLente1] = useState<PrefillLente>(null);
  const [inicialLente2, setInicialLente2] = useState<PrefillLente>(null);

  const total = carrito.reduce((s, l) => s + l.cantidad * l.precioUnitario, 0);
  const abonoNum = Math.max(0, Math.min(montoANumero(abono), total));
  const esAbonoParcial = abonoNum > 0 && abonoNum < total;
  const montoACobrar = esAbonoParcial ? abonoNum : total;
  // Orden estable "Lente 1" antes que "Lente 2" (la key lo garantiza),
  // independiente del orden en que se hayan ido completando las filas.
  const lineasCristal = carrito.filter((l) => l.cristal).sort((a, b) => a.key.localeCompare(b.key));
  // Puede haber más de un armazón (dos pares separados): cada uno queda
  // explícitamente emparejado con su lente por armazonSlot, no por el orden
  // en que se hayan agregado — así no se puede confundir cuál marco es para
  // el Lente 1 y cuál para el Lente 2.
  const lineasArmazon = carrito
    .filter((l): l is LineaCarrito & { armazonSlot: 1 | 2 } => l.armazonSlot !== undefined)
    .sort((a, b) => a.armazonSlot - b.armazonSlot);
  const creaOT = Boolean(pacienteId && lineasCristal.length > 0);
  // Abono mínimo: cubre mandar a hacer estos cristales al laboratorio, así
  // no hay que poner plata propia mientras se espera el pago del saldo.
  // Un lente de cortesía (precio $0) no tiene nada que abonar — no tiene
  // sentido pedir un adelanto de algo que no se va a cobrar.
  const abonoMinimo = lineasCristal
    .filter((l) => l.precioUnitario > 0)
    .reduce((s, l) => s + (ABONO_MINIMO_POR_TIPO[l.cristal?.tipoLente ?? ""] ?? 0), 0);
  const recetaPacienteId = receta?.id;
  const paciente = pacientes.find((p) => p.id === pacienteId);

  const pacientesFiltrados = useMemo(() => {
    const t = buscaPaciente.trim().toLowerCase();
    if (!t) return pacientes.slice(0, 30);
    return pacientes
      .filter((p) => `${p.nombre} ${p.rut ?? ""}`.toLowerCase().includes(t))
      .slice(0, 30);
  }, [pacientes, buscaPaciente]);

  // Si ya hay al menos un lente en la venta, el armazón de cada uno se
  // elige aparte (SelectorArmazon) — acá solo quedan los demás productos
  // (estuches, lentes de contacto, etc.) para no mostrar los mismos
  // armazones dos veces.
  const tieneCristal = lineasCristal.length > 0;
  const productosFiltrados = useMemo(() => {
    const base = tieneCristal ? productos.filter((p) => p.categoria !== "armazon") : productos;
    const t = buscaProducto.trim().toLowerCase();
    if (!t) return base;
    return base.filter((p) => `${p.marca ?? ""} ${p.nombre}`.toLowerCase().includes(t));
  }, [productos, buscaProducto, tieneCristal]);

  function elegirArmazon(numero: 1 | 2, producto: Producto | null) {
    const key = `armazon-${numero}`;
    setCarrito((prev) => {
      const sinEsteSlot = prev.filter((l) => l.key !== key);
      if (!producto) return sinEsteSlot;
      return [
        ...sinEsteSlot,
        {
          key,
          productoId: producto.id,
          descripcion: `${producto.marca ? producto.marca + " " : ""}${producto.nombre}`,
          cantidad: 1,
          precioUnitario: 0,
          armazonSlot: numero,
        },
      ];
    });
  }

  function agregarProducto(p: Producto) {
    // Los armazones se regalan (el costo ya está absorbido en el precio del
    // cristal): siempre entran al carrito en $0, sin importar lo que diga
    // su precio_venta en Inventario.
    const precio = p.categoria === "armazon" ? 0 : p.precio_venta;
    setCarrito((prev) => {
      const existe = prev.find((l) => l.productoId === p.id);
      if (existe) {
        return prev.map((l) => (l.productoId === p.id ? { ...l, cantidad: l.cantidad + 1 } : l));
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
    numero: 1 | 2,
    datos: { combo: CostoCristal; posicion?: "lejos" | "cerca"; sugerido?: boolean; esRegalo?: boolean } | null
  ) {
    const key = `cristal-${numero}`;
    setCarrito((prev) => {
      const sinEstaFila = prev.filter((l) => l.key !== key);
      if (!datos) return sinEstaFila;
      return [
        ...sinEstaFila,
        lineaDeCombo(numero, datos.combo, factorVenta, {
          posicion: datos.posicion,
          sugerido: datos.sugerido,
          esRegalo: datos.esRegalo,
        }),
      ];
    });
  }

  // Al elegir el paciente: si su receta más reciente trae una sugerencia
  // del tecnólogo, cada fila la trae precargada sola — la vendedora solo
  // confirma o cambia algo si el paciente decidió otra cosa.
  function elegirPaciente(id: string) {
    setPacienteId(id);
    setCarrito((prev) => prev.filter((l) => !l.cristal));
    const r = recetasPorPaciente[id];
    // Si a este paciente lo atendieron en un operativo (ej. un condominio),
    // la venta queda ligada a ese mismo operativo — para que el cierre de
    // "cuánto se vendió en tal operativo" no dependa de que la vendedora se
    // acuerde de elegirlo a mano.
    if (r?.operativo_id) setOperativoId(r.operativo_id);
    if (!r) {
      setInicialLente1(null);
      setInicialLente2(null);
      return;
    }
    if (r.tipo === "lejos_y_cerca") {
      setInicialLente1(
        r.sugerencia_tipo_lente && r.sugerencia_tratamiento
          ? { tipoLente: r.sugerencia_tipo_lente, tratamiento: r.sugerencia_tratamiento, posicion: "lejos", sugerido: true }
          : null
      );
      setInicialLente2(
        r.sugerencia_tipo_lente_cerca && r.sugerencia_tratamiento_cerca
          ? { tipoLente: r.sugerencia_tipo_lente_cerca, tratamiento: r.sugerencia_tratamiento_cerca, posicion: "cerca", sugerido: true }
          : null
      );
    } else {
      setInicialLente1(
        r.sugerencia_tipo_lente && r.sugerencia_tratamiento
          ? {
              tipoLente: r.sugerencia_tipo_lente,
              tratamiento: r.sugerencia_tratamiento,
              posicion: r.tipo === "cerca" ? "cerca" : undefined,
              sugerido: true,
            }
          : null
      );
      setInicialLente2(null);
    }
  }

  function quitar(key: string) {
    setCarrito((prev) => prev.filter((l) => l.key !== key));
  }

  function reiniciar() {
    setCarrito([]);
    setAbono("");
    setPacienteId("");
    setOperativoId("");
    setBuscaPaciente("");
    setBuscaProducto("");
    setInicialLente1(null);
    setInicialLente2(null);
    setPaso(0);
  }

  // Sin señal (operativo en terreno, spec 8.2): la venta se arma completa
  // en el dispositivo con UUIDs locales y va al outbox; se sincroniza sola
  // al reconectar. Los IDs locales hacen el reintento idempotente.
  function cobrarOffline() {
    const abonoReal = Math.max(0, Math.min(montoANumero(abono), total));
    const estadoPago = abonoReal >= total ? "pagada" : abonoReal > 0 ? "abono_parcial" : "pendiente";
    const ventaId = crypto.randomUUID();
    const ahora = new Date().toISOString();

    // Misma regla que online: con paciente y cristales, la OT viaja en el
    // mismo lote (el servidor la enlaza cuando vuelve la señal). Lejos y
    // cerca por separado comparten UNA sola OT (un cupo cada uno), no dos
    // OT distintas — así vuelve del laboratorio como un solo paquete.
    const otId = pacienteId && lineasCristal.length > 0 ? crypto.randomUUID() : null;
    // hoyEnChile() en vez del reloj/huso del dispositivo, para que la
    // estimación no dependa de que el celular tenga bien puesta la zona
    // horaria (frecuente justo en el escenario para el que existe este modo:
    // vendiendo en terreno).
    const entregaISO = sumarDias(hoyEnChile(), 7);

    const cambios: CambioSync[] = [
      {
        tabla: "ventas",
        op: "insert",
        id: ventaId,
        datos: {
          tenant_id: tenantId,
          paciente_id: pacienteId || null,
          sucursal_id: sucursalId,
          operativo_id: operativoId || null,
          vendedor_id: vendedorId,
          fecha: ahora,
          total,
          estado_pago: estadoPago,
        },
      },
    ];

    if (otId) {
      const [primero, segundo] = lineasCristal;
      cambios.push({
        tabla: "ordenes_trabajo",
        op: "insert",
        id: otId,
        datos: {
          tenant_id: tenantId,
          paciente_id: pacienteId,
          receta_id: recetaPacienteId ?? null,
          sucursal_id: sucursalId,
          operativo_id: operativoId || null,
          estado: "recepcion",
          armazon_producto_id: lineasArmazon[0]?.productoId ?? null,
          tipo_lente: primero.cristal!.tipoLente,
          rango_receta: primero.cristal!.rangoReceta,
          tratamiento: primero.cristal!.tratamiento,
          origen_cristal: origenCristal,
          proveedor_lab_id: origenCristal === "laboratorio" ? laboratorioId || null : null,
          costo_laboratorio: primero.cristal!.costoLaboratorio,
          fecha_ingreso: ahora,
          fecha_entrega_estimada: entregaISO,
          armazon_producto_id_2: segundo ? (lineasArmazon[1]?.productoId ?? null) : null,
          tipo_lente_2: segundo?.cristal?.tipoLente ?? null,
          rango_receta_2: segundo?.cristal?.rangoReceta ?? null,
          tratamiento_2: segundo?.cristal?.tratamiento ?? null,
          costo_laboratorio_2: segundo?.cristal?.costoLaboratorio ?? null,
        },
      });
    }

    cambios.push(
      ...carrito.map((l) => ({
        tabla: "venta_items",
        op: "insert" as const,
        id: crypto.randomUUID(),
        datos: {
          tenant_id: tenantId,
          venta_id: ventaId,
          producto_id: l.productoId ?? null,
          ot_id: l.cristal ? otId : null,
          cristal_slot: l.key === "cristal-1" ? 1 : l.key === "cristal-2" ? 2 : null,
          descripcion: l.descripcion,
          cantidad: l.cantidad,
          precio_unitario: l.precioUnitario,
          descuento: 0,
        },
      }))
    );

    if (abonoReal > 0) {
      cambios.push({
        tabla: "pagos_abonos",
        op: "insert",
        id: crypto.randomUUID(),
        datos: {
          tenant_id: tenantId,
          venta_id: ventaId,
          monto: abonoReal,
          medio_pago: medioPago,
          fecha: ahora,
        },
      });
    }

    if (sucursalId) {
      for (const l of carrito) {
        if (!l.productoId) continue;
        cambios.push({
          tabla: "movimientos_inventario",
          op: "insert",
          id: crypto.randomUUID(),
          datos: {
            tenant_id: tenantId,
            producto_id: l.productoId,
            sucursal_id: sucursalId,
            tipo: "salida",
            cantidad: l.cantidad,
            referencia: `venta:${ventaId}`,
            fecha: ahora,
          },
        });
      }
    }

    encolar(cambios);
    reiniciar();
    setMensaje("✓ Venta guardada sin conexión — se sincronizará sola al volver la señal");
  }

  async function cobrar() {
    setGuardando(true);
    setMensaje(null);

    if (!navigator.onLine) {
      cobrarOffline();
      setGuardando(false);
      return;
    }

    try {
      const resultado = await registrarVenta({
        pacienteId: pacienteId || null,
        items: carrito.map((l) => ({
          productoId: l.productoId,
          descripcion: l.descripcion,
          cantidad: l.cantidad,
          precioUnitario: l.precioUnitario,
          // A cuál de los dos cupos de cristal de la OT corresponde (lejos
          // y cerca por separado comparten UNA sola OT, no una cada uno).
          cristalSlot: l.key === "cristal-1" ? 1 : l.key === "cristal-2" ? 2 : undefined,
        })),
        abonoInicial: montoANumero(abono),
        medioPago,
        cristales: creaOT
          ? lineasCristal.map((l) => ({ ...l.cristal!, origen: origenCristal }))
          : [],
        // Un armazón por cristal, en el mismo orden — dos pares separados
        // llevan cada uno su propio marco.
        armazonProductoIds: lineasArmazon.map((l) => l.productoId ?? null),
        proveedorLabId: origenCristal === "laboratorio" ? laboratorioId || null : null,
        operativoId: operativoId || null,
      });
      if (resultado.ok) {
        reiniciar();
        setMensaje(
          resultado.otFolio
            ? `✓ Venta registrada · Orden de trabajo #${resultado.otFolio} creada`
            : "✓ Venta registrada"
        );
        router.refresh();
      } else {
        setMensaje(resultado.error ?? "No se pudo registrar la venta.");
      }
    } catch {
      setMensaje("Error al registrar la venta.");
    } finally {
      setGuardando(false);
    }
  }

  const boton =
    "rounded-lg px-4 py-3 text-base font-semibold transition disabled:opacity-50";
  const select =
    "w-full rounded-lg border border-tinta-suave/30 bg-white px-3 py-3 text-base outline-none focus:border-brand disabled:opacity-50";

  return (
    <div className="flex flex-col gap-4">
      {/* Barra de pasos: cada uno con su color. Los pasos ya hechos se
          pueden tocar para volver directo a cualquiera de ellos (no solo
          al anterior) sin perder lo ya cargado — el "‹" y el borde marcado
          avisan que se puede tocar. */}
      <ol className="flex items-center gap-1 overflow-x-auto">
        {PASOS.map((titulo, i) => {
          const actual = i === paso;
          const hecho = i < paso;
          const color = COLOR_PASO[i];
          return (
            <li key={titulo} className="flex flex-1 items-center gap-1">
              <button
                type="button"
                onClick={() => i <= paso && setPaso(i)}
                disabled={i > paso}
                className={`flex w-full items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-2 py-2.5 text-sm font-semibold transition ${
                  actual
                    ? color.pill
                    : hecho
                      ? `${color.pillHecho} border-2 ${color.seccion.split(" ")[0]}`
                      : "bg-crema-claro text-tinta-suave"
                }`}
              >
                {hecho && <span aria-hidden>‹</span>}
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-black/10 text-xs">
                  {hecho ? "✓" : i + 1}
                </span>
                {titulo}
              </button>
            </li>
          );
        })}
      </ol>
      <p className="-mt-2 text-xs text-tinta-suave">
        Toca cualquier paso ya hecho arriba (el que tiene ‹) para volver directo a él.
      </p>

      {mensaje && (
        <p
          role="status"
          className={`rounded-lg px-3 py-2.5 text-sm font-medium ${
            mensaje.startsWith("✓") ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700"
          }`}
        >
          {mensaje}
        </p>
      )}

      {/* ---------------------------------------------------------------- */}
      {paso === 0 && (
        <section className={`flex flex-col gap-3 rounded-2xl border-2 ${COLOR_PASO[0].seccion} p-4 shadow-sm`}>
          <div>
            <h2 className={`font-bold ${COLOR_PASO[0].titulo}`}>¿Para quién es la venta?</h2>
            <p className="text-sm text-tinta-suave">
              Elige el paciente para que la orden de trabajo se cree sola con su receta. Si es una
              venta de mesón sin ficha, puedes continuar sin paciente.
            </p>
          </div>

          {operativos.length > 0 && (
            <label className="flex flex-col gap-1 text-sm font-medium">
              Operativo (si esta venta es en terreno)
              <select value={operativoId} onChange={(e) => setOperativoId(e.target.value)} className={select}>
                <option value="">— Sin especificar —</option>
                {operativos.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.nombre}
                  </option>
                ))}
              </select>
            </label>
          )}
          {receta?.operativo_id && receta.operativo_id === operativoId && (
            <p className="rounded-lg bg-blue-100 px-3 py-2 text-xs font-medium text-blue-900">
              Ligada sola al operativo donde se le tomó el examen a este paciente.
            </p>
          )}

          <input
            type="search"
            value={buscaPaciente}
            onChange={(e) => {
              const v = e.target.value;
              // Si empieza con un número se asume que está escribiendo el
              // RUT y se le pone el punto al tiro (así calza con cómo
              // queda guardado); si empieza con letra, sigue siendo
              // búsqueda libre por nombre.
              setBuscaPaciente(/^\d/.test(v.trim()) ? formatearRut(v) : v);
            }}
            placeholder="Buscar por nombre o RUT…"
            className={select}
          />

          <ul className="flex max-h-72 flex-col gap-1 overflow-y-auto">
            {pacientesFiltrados.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => elegirPaciente(p.id)}
                  className={`flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm transition ${
                    pacienteId === p.id ? "bg-blue-600 text-white" : "bg-white hover:bg-blue-50"
                  }`}
                >
                  <span className="flex-1 truncate font-medium">{p.nombre}</span>
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

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setPaso(1)}
              className={`${boton} flex-1 bg-blue-600 text-white hover:bg-blue-700`}
            >
              {paciente ? `Continuar con ${paciente.nombre.split(" ")[0]}` : "Continuar"}
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
        <section className={`flex flex-col gap-3 rounded-2xl border-2 ${COLOR_PASO[1].seccion} p-4 shadow-sm`}>
          <div>
            <h2 className={`font-bold ${COLOR_PASO[1].titulo}`}>¿Lleva cristales?</h2>
            <p className="text-sm text-tinta-suave">
              Lente 1 es el primer par. Si el paciente lleva dos pares separados (por ejemplo uno
              para lejos y otro para cerca), complétalos también en Lente 2.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="flex-1">
              <FilaLente
                key={`slot1-${pacienteId}`}
                numero={1}
                costos={costos}
                factorVenta={factorVenta}
                receta={receta}
                inicial={inicialLente1}
                onCambio={(d) => manejarCambioLente(1, d)}
              />
            </div>
            <div className="flex-1">
              <FilaLente
                key={`slot2-${pacienteId}`}
                numero={2}
                costos={costos}
                factorVenta={factorVenta}
                receta={receta}
                inicial={inicialLente2}
                onCambio={(d) => manejarCambioLente(2, d)}
              />
            </div>
          </div>

          {/* El Lente 2 solo se precarga si la receta se cargó con "Dos
              lentes separados" — si al paciente le hicieron receta de un
              solo tipo (lejos o cerca), acá no hay nada que precargar y no
              es un error. Esto evita el "¿por qué no me llena el cristal 2?"
              cuando en realidad la receta nunca tuvo una sugerencia de
              cerca. */}
          {receta && receta.tipo !== "lejos_y_cerca" && (
            <p className="rounded-lg bg-violet-100 px-3 py-2 text-xs font-medium text-violet-900">
              La receta de este paciente es de un solo lente ({receta.tipo === "cerca" ? "cerca" : "lejos"}), por
              eso Lente 2 no trae nada precargado. Si necesita dos pares separados, entra a su ficha y
              cambia la receta a &quot;Dos lentes separados&quot;.
            </p>
          )}

          {lineasCristal.length > 0 && (
            <div className="flex gap-2 text-sm">
              {(["laboratorio", "stock"] as const).map((op) => (
                <label
                  key={op}
                  className="flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-tinta-suave/25 bg-white px-2 py-2.5 has-checked:border-violet-500 has-checked:bg-violet-50"
                >
                  <input
                    type="radio"
                    name="origen_cristal"
                    checked={origenCristal === op}
                    onChange={() => setOrigenCristal(op)}
                    className="accent-violet-600"
                  />
                  {op === "laboratorio" ? "Pedir al laboratorio" : "De stock"}
                </label>
              ))}
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

          <Resumen carrito={carrito} total={total} quitar={quitar} />

          {creaOT && (
            <p className={`rounded-lg px-3 py-2 text-xs font-medium ${COLOR_PASO[1].aviso}`}>
              Al cobrar se crea{lineasCristal.length > 1 ? "n" : ""} la
              {lineasCristal.length > 1 ? "s órdenes" : " orden"} de trabajo automáticamente
              {recetaPacienteId
                ? " con la última receta del paciente"
                : " (el paciente aún no tiene receta cargada)"}
              .
            </p>
          )}
          {lineasCristal.length > 0 && !pacienteId && (
            <p className="rounded-lg bg-amber-100 px-3 py-2 text-xs font-medium text-amber-800">
              Sin paciente no se puede crear la orden de trabajo. Vuelve al paso 1 si corresponde.
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
              className={`${boton} flex-1 bg-violet-600 text-white hover:bg-violet-700`}
            >
              Continuar
            </button>
          </div>
        </section>
      )}

      {/* ---------------------------------------------------------------- */}
      {paso === 2 && (
        <section className={`flex flex-col gap-3 rounded-2xl border-2 ${COLOR_PASO[2].seccion} p-4 shadow-sm`}>
          <div>
            <h2 className={`font-bold ${COLOR_PASO[2].titulo}`}>¿Lleva armazón u otro producto?</h2>
            <p className="text-sm text-tinta-suave">
              {lineasCristal.length > 0
                ? "Elige el marco de cada lente por separado — quedan enlazados sin confusión."
                : "Toca los productos para agregarlos. Si solo lleva cristales, continúa sin agregar nada."}
            </p>
          </div>

          {lineasCristal.length > 0 && (
            <div className="flex flex-col gap-3 sm:flex-row">
              {lineasCristal.map((l) => {
                const numero = (l.key === "cristal-1" ? 1 : 2) as 1 | 2;
                const etiqueta =
                  lineasCristal.length === 2
                    ? `Lente ${numero}${l.cristal?.posicion ? ` (${l.cristal.posicion})` : ""}`
                    : "tu lente";
                return (
                  <SelectorArmazon
                    key={`armazon-slot-${numero}`}
                    etiqueta={etiqueta}
                    productos={productos}
                    elegido={carrito.find((c) => c.key === `armazon-${numero}`)}
                    onElegir={(p) => elegirArmazon(numero, p)}
                  />
                );
              })}
            </div>
          )}

          {lineasCristal.length > 0 && <p className="text-xs font-semibold text-tinta-suave">Otros productos</p>}

          <input
            type="search"
            value={buscaProducto}
            onChange={(e) => setBuscaProducto(e.target.value)}
            placeholder="Buscar marca o modelo…"
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
                  </span>
                  {p.categoria === "armazon" ? (
                    <span className="font-semibold text-amber-700">Gratis</span>
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
                  ? "Todavía no hay productos cargados. Puedes agregarlos en Inventario."
                  : "Sin productos que coincidan."}
              </li>
            )}
          </ul>

          <Resumen carrito={carrito} total={total} quitar={quitar} />

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
              className={`${boton} flex-1 bg-amber-500 text-white hover:bg-amber-600`}
            >
              Continuar al pago
            </button>
          </div>
        </section>
      )}

      {/* ---------------------------------------------------------------- */}
      {paso === 3 && (
        <section className={`flex flex-col gap-3 rounded-2xl border-2 ${COLOR_PASO[3].seccion} p-4 shadow-sm`}>
          <div>
            <h2 className={`font-bold ${COLOR_PASO[3].titulo}`}>Cobro</h2>
            <p className="text-sm text-tinta-suave">
              {paciente ? `Venta a ${paciente.nombre}.` : "Venta sin paciente."} Revisa el detalle
              antes de cobrar.
            </p>
          </div>

          <Resumen carrito={carrito} total={total} quitar={quitar} />

          <label className="flex flex-col gap-1 text-sm font-medium">
            ¿Cuánto paga ahora?
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-tinta-suave">
                $
              </span>
              <input
                inputMode="numeric"
                value={abono}
                onChange={(e) => setAbono(formatearMonto(e.target.value))}
                placeholder={formatearMonto(total)}
                className={`${select} pl-7 text-right`}
              />
            </div>
            <span className="text-xs font-normal text-tinta-suave">
              Déjalo vacío si paga el total ahora. Si abona una parte, el saldo queda registrado
              para cobrarlo al entregar.
            </span>
          </label>

          <div className="flex flex-wrap gap-1.5">
            {[total, Math.round(total / 2)].map((monto, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setAbono(formatearMonto(monto))}
                className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-green-800 transition hover:bg-green-600 hover:text-white"
              >
                {i === 0 ? `Paga todo (${clp(total)})` : `Mitad (${clp(monto)})`}
              </button>
            ))}
            {abonoMinimo > 0 && abonoMinimo < total && (
              <button
                type="button"
                onClick={() => setAbono(formatearMonto(abonoMinimo))}
                className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-green-800 transition hover:bg-green-600 hover:text-white"
              >
                Abono mínimo ({clp(abonoMinimo)})
              </button>
            )}
          </div>

          <label className="flex flex-col gap-1 text-sm font-medium">
            Medio de pago
            <select value={medioPago} onChange={(e) => setMedioPago(e.target.value)} className={select}>
              <option value="efectivo">Efectivo</option>
              <option value="debito">Débito</option>
              <option value="credito">Crédito</option>
              <option value="transferencia">Transferencia</option>
            </select>
          </label>

          {esAbonoParcial && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900">
              Se cobra el abono de {clp(abonoNum)} ahora. Queda un saldo de {clp(total - abonoNum)}{" "}
              por cobrar cuando se entreguen los lentes.
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
              disabled={guardando || carrito.length === 0}
              className={`${boton} flex-1 bg-green-600 text-white hover:bg-green-700`}
            >
              {guardando ? "Registrando…" : `Cobrar ${clp(montoACobrar)}`}
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
  quitar,
}: {
  carrito: LineaCarrito[];
  total: number;
  quitar: (key: string) => void;
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
                  {l.key === "cristal-1" ? "Lente 1" : "Lente 2"}
                </span>
              )}
              {l.armazonSlot && (
                <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
                  Lente {l.armazonSlot}
                </span>
              )}
              {l.cristal?.sugerido && (
                <span className="ml-1.5 rounded-full bg-brand/10 px-1.5 py-0.5 text-[10px] font-semibold text-brand-dark">
                  Sugerido en la receta
                </span>
              )}
            </span>
            <span className="font-semibold">{clp(l.cantidad * l.precioUnitario)}</span>
            <button
              type="button"
              onClick={() => quitar(l.key)}
              className="text-tinta-suave transition hover:text-red-600"
              aria-label={`Quitar ${l.descripcion}`}
            >
              ✕
            </button>
          </li>
        ))}
      </ul>
      <div className="mt-2 flex items-center justify-between border-t border-tinta-suave/15 pt-2">
        <span className="font-bold">Total</span>
        <span className="text-xl font-bold">{clp(total)}</span>
      </div>
    </div>
  );
}
