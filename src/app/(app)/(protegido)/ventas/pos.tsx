"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { registrarVenta } from "@/lib/actions/ventas";
import { encolar, type CambioSync } from "@/lib/offline/outbox";
import { clp } from "@/lib/clp";
import { formatearRut } from "@/lib/rut";
import { formatearMonto, montoANumero } from "@/lib/formato";
import { clasificarRango, nombreCristal } from "@/lib/cristales";
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
  od_esfera: number | null;
  od_cilindro: number | null;
  oi_esfera: number | null;
  oi_cilindro: number | null;
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
    // Solo tiene sentido con dos Monofocal en la misma venta (lejos + cerca
    // por separado); para Bifocal/Multifocal no aplica.
    posicion?: "lejos" | "cerca";
    sugerido?: boolean;
  };
};

// La venta se arma en cuatro pasos, uno por pantalla, en vez de mostrar
// todos los controles a la vez: quien vende en el mesón sigue una sola
// instrucción por vez y no tiene que saber de antemano qué mirar primero.
const PASOS = ["Paciente", "Armazón", "Cristales", "Pago"] as const;

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

  // Selección de cristal desde la matriz de costos
  const tiposLente = useMemo(() => [...new Set(costos.map((c) => c.tipo_lente))], [costos]);
  const [tipoLente, setTipoLente] = useState("");
  const receta = pacienteId ? recetasPorPaciente[pacienteId] : undefined;
  // El rango se calcula solo de la receta real (esfera/cilindro más
  // exigentes entre los dos ojos) — la vendedora no elige nada acá. Si el
  // paciente no tiene receta cargada todavía, se cae al selector manual
  // para no dejarla sin poder vender.
  const rangoAuto = receta
    ? clasificarRango(
        [receta.od_esfera, receta.oi_esfera],
        [receta.od_cilindro, receta.oi_cilindro]
      )
    : null;
  const [rangoManual, setRangoManual] = useState("");
  const rango = rangoAuto ?? rangoManual;
  const rangos = useMemo(
    () => [...new Set(costos.filter((c) => c.tipo_lente === tipoLente).map((c) => c.rango_receta))],
    [costos, tipoLente]
  );
  const tratamientos = useMemo(
    () => costos.filter((c) => c.tipo_lente === tipoLente && c.rango_receta === rango),
    [costos, tipoLente, rango]
  );
  const [tratamiento, setTratamiento] = useState("");
  const [posicionCristal, setPosicionCristal] = useState<"lejos" | "cerca">("lejos");
  const [origenCristal, setOrigenCristal] = useState<"laboratorio" | "stock">("laboratorio");

  const total = carrito.reduce((s, l) => s + l.cantidad * l.precioUnitario, 0);
  const abonoNum = Math.max(0, Math.min(montoANumero(abono), total));
  const esAbonoParcial = abonoNum > 0 && abonoNum < total;
  const montoACobrar = esAbonoParcial ? abonoNum : total;
  const lineasCristal = carrito.filter((l) => l.cristal);
  const lineaArmazon = carrito.find((l) => l.productoId);
  const creaOT = Boolean(pacienteId && lineasCristal.length > 0);
  const recetaPacienteId = receta?.id;
  // Como máximo dos cristales por venta: un Monofocal de lejos y uno de
  // cerca por separado. Bifocal/Multifocal ya cubren ambos en un lente.
  const puedeAgregarOtroCristal = lineasCristal.length === 0 || (tipoLente === "Monofocal" && lineasCristal.length < 2);
  const paciente = pacientes.find((p) => p.id === pacienteId);

  const pacientesFiltrados = useMemo(() => {
    const t = buscaPaciente.trim().toLowerCase();
    if (!t) return pacientes.slice(0, 30);
    return pacientes
      .filter((p) => `${p.nombre} ${p.rut ?? ""}`.toLowerCase().includes(t))
      .slice(0, 30);
  }, [pacientes, buscaPaciente]);

  const productosFiltrados = useMemo(() => {
    const t = buscaProducto.trim().toLowerCase();
    if (!t) return productos;
    return productos.filter((p) => `${p.marca ?? ""} ${p.nombre}`.toLowerCase().includes(t));
  }, [productos, buscaProducto]);

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

  function lineaDeCombo(
    combo: CostoCristal,
    opciones?: { posicion?: "lejos" | "cerca"; sugerido?: boolean }
  ): LineaCarrito {
    // Precio editable de la óptica (/precios); el factor es solo respaldo.
    const precio = combo.precio_venta > 0 ? combo.precio_venta : combo.costo * factorVenta;
    const etiquetaPosicion =
      opciones?.posicion === "lejos" ? " (lejos)" : opciones?.posicion === "cerca" ? " (cerca)" : "";
    return {
      key: `cristal-${opciones?.posicion ?? "unico"}-${crypto.randomUUID()}`,
      descripcion: `Cristales ${nombreCristal(combo.tipo_lente, combo.tratamiento)}${etiquetaPosicion}`,
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

  function agregarCristal() {
    const combo = tratamientos.find((c) => c.tratamiento === tratamiento);
    if (!combo || !puedeAgregarOtroCristal) return;
    const posicion = lineasCristal.length > 0 ? posicionCristal : undefined;
    setCarrito((prev) => [
      // Reemplaza solo el cristal de la misma posición (lejos/cerca), no el otro.
      ...prev.filter((l) => !l.cristal || (posicion !== undefined && l.cristal.posicion !== posicion)),
      lineaDeCombo(combo, { posicion }),
    ]);
  }

  // Al elegir el paciente: si su receta más reciente trae una sugerencia
  // del tecnólogo, se arma sola la venta con el rango ya calculado — la
  // vendedora solo confirma o cambia algo si el paciente decidió otra cosa.
  function elegirPaciente(id: string) {
    setPacienteId(id);
    const r = recetasPorPaciente[id];
    if (!r) return;
    const rangoDeReceta = clasificarRango([r.od_esfera, r.oi_esfera], [r.od_cilindro, r.oi_cilindro]);

    const sugeridas: { tipoLente: string | null; tratamiento: string | null; posicion?: "lejos" | "cerca" }[] =
      r.tipo === "lejos_y_cerca"
        ? [
            { tipoLente: r.sugerencia_tipo_lente, tratamiento: r.sugerencia_tratamiento, posicion: "lejos" },
            {
              tipoLente: r.sugerencia_tipo_lente_cerca,
              tratamiento: r.sugerencia_tratamiento_cerca,
              posicion: "cerca",
            },
          ]
        : [{ tipoLente: r.sugerencia_tipo_lente, tratamiento: r.sugerencia_tratamiento }];

    const nuevasLineas: LineaCarrito[] = [];
    for (const s of sugeridas) {
      if (!s.tipoLente || !s.tratamiento) continue;
      const combo = costos.find(
        (c) => c.tipo_lente === s.tipoLente && c.rango_receta === rangoDeReceta && c.tratamiento === s.tratamiento
      );
      if (combo) nuevasLineas.push(lineaDeCombo(combo, { posicion: s.posicion, sugerido: true }));
    }
    if (nuevasLineas.length > 0) {
      setCarrito((prev) => [...prev.filter((l) => !l.cristal), ...nuevasLineas]);
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
    setTipoLente("");
    setRangoManual("");
    setTratamiento("");
    setPosicionCristal("lejos");
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
    // mismo lote (el servidor la enlaza cuando vuelve la señal). Una OT por
    // cada cristal (lejos y cerca por separado quedan como dos trabajos).
    const otIdPorLinea = new Map<string, string>();
    if (pacienteId) {
      for (const l of lineasCristal) otIdPorLinea.set(l.key, crypto.randomUUID());
    }
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

    for (const l of lineasCristal) {
      const otId = otIdPorLinea.get(l.key);
      if (!otId || !l.cristal) continue;
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
          // El armazón va con la primera OT (es el único marco de la venta).
          armazon_producto_id: l === lineasCristal[0] ? (lineaArmazon?.productoId ?? null) : null,
          tipo_lente: l.cristal.tipoLente,
          rango_receta: l.cristal.rangoReceta,
          tratamiento: l.cristal.tratamiento,
          origen_cristal: origenCristal,
          proveedor_lab_id: origenCristal === "laboratorio" ? laboratorioId || null : null,
          costo_laboratorio: l.cristal.costoLaboratorio,
          fecha_ingreso: ahora,
          fecha_entrega_estimada: entregaISO,
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
          ot_id: l.cristal ? (otIdPorLinea.get(l.key) ?? null) : null,
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
          // Índice dentro de "cristales" — así cada ítem queda ligado a SU
          // orden de trabajo cuando hay dos (lejos + cerca), no una sola
          // compartida.
          cristalIndex: l.cristal ? lineasCristal.findIndex((c) => c.key === l.key) : undefined,
        })),
        abonoInicial: montoANumero(abono),
        medioPago,
        cristales: creaOT
          ? lineasCristal.map((l) => ({ ...l.cristal!, origen: origenCristal }))
          : [],
        armazonProductoId: lineaArmazon?.productoId ?? null,
        proveedorLabId: origenCristal === "laboratorio" ? laboratorioId || null : null,
        operativoId: operativoId || null,
      });
      if (resultado.ok) {
        reiniciar();
        setMensaje(
          resultado.otFolios && resultado.otFolios.length > 0
            ? `✓ Venta registrada · Orden${resultado.otFolios.length > 1 ? "es" : ""} de trabajo #${resultado.otFolios.join(", #")} creada${resultado.otFolios.length > 1 ? "s" : ""}`
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
      {/* Barra de pasos: además de orientar, permite volver a corregir algo
          sin perder lo ya cargado. */}
      <ol className="flex items-center gap-1 overflow-x-auto">
        {PASOS.map((titulo, i) => {
          const actual = i === paso;
          const hecho = i < paso;
          return (
            <li key={titulo} className="flex flex-1 items-center gap-1">
              <button
                type="button"
                onClick={() => i <= paso && setPaso(i)}
                disabled={i > paso}
                className={`flex w-full items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-2 py-2 text-sm font-semibold transition ${
                  actual
                    ? "bg-brand text-white"
                    : hecho
                      ? "bg-brand/15 text-brand-dark hover:bg-brand/25"
                      : "bg-crema-claro text-tinta-suave"
                }`}
              >
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-black/10 text-xs">
                  {hecho ? "✓" : i + 1}
                </span>
                {titulo}
              </button>
            </li>
          );
        })}
      </ol>

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
        <section className="flex flex-col gap-3 rounded-2xl bg-crema-claro p-4 shadow-sm">
          <div>
            <h2 className="font-bold">¿Para quién es la venta?</h2>
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

          <input
            type="search"
            value={buscaPaciente}
            onChange={(e) => setBuscaPaciente(e.target.value)}
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
                    pacienteId === p.id ? "bg-brand text-white" : "bg-white hover:bg-brand/10"
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
              className={`${boton} flex-1 bg-brand text-white hover:bg-brand-dark`}
            >
              {paciente ? `Continuar con ${paciente.nombre.split(" ")[0]}` : "Continuar"}
            </button>
            {pacienteId && (
              <button
                type="button"
                onClick={() => setPacienteId("")}
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
        <section className="flex flex-col gap-3 rounded-2xl bg-crema-claro p-4 shadow-sm">
          <div>
            <h2 className="font-bold">¿Lleva armazón u otro producto?</h2>
            <p className="text-sm text-tinta-suave">
              Toca los productos para agregarlos. Si solo lleva cristales, continúa sin agregar
              nada.
            </p>
          </div>

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
                  className="flex w-full items-center gap-2 rounded-lg bg-white px-3 py-2.5 text-left text-sm transition hover:bg-brand/10"
                >
                  <span className="flex-1 truncate">
                    {p.marca ? `${p.marca} ` : ""}
                    {p.nombre}
                  </span>
                  {p.categoria === "armazon" ? (
                    <span className="font-semibold text-brand-dark">Gratis</span>
                  ) : (
                    <span className="font-semibold">{clp(p.precio_venta)}</span>
                  )}
                  <span className="rounded-md bg-brand/10 px-2 py-0.5 text-xs font-bold text-brand-dark">
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
              onClick={() => setPaso(0)}
              className={`${boton} border border-tinta-suave/30 text-tinta-suave hover:bg-white`}
            >
              Atrás
            </button>
            <button
              type="button"
              onClick={() => setPaso(2)}
              className={`${boton} flex-1 bg-brand text-white hover:bg-brand-dark`}
            >
              Continuar
            </button>
          </div>
        </section>
      )}

      {/* ---------------------------------------------------------------- */}
      {paso === 2 && (
        <section className="flex flex-col gap-3 rounded-2xl bg-crema-claro p-4 shadow-sm">
          <div>
            <h2 className="font-bold">¿Lleva cristales?</h2>
            <p className="text-sm text-tinta-suave">
              Elige tipo de lente y tratamiento. Si no lleva cristales, continúa sin agregar.
            </p>
          </div>

          {!puedeAgregarOtroCristal && (
            <p className="rounded-lg bg-brand/10 px-3 py-2 text-xs font-medium text-brand-dark">
              Ya lleva {lineasCristal.length === 2 ? "dos cristales (lejos y cerca)" : "un cristal"}{" "}
              en esta venta.
            </p>
          )}

          <label className="flex flex-col gap-1 text-sm font-medium">
            Tipo de lente
            <select
              value={tipoLente}
              onChange={(e) => {
                setTipoLente(e.target.value);
                setRangoManual("");
                setTratamiento("");
              }}
              disabled={!puedeAgregarOtroCristal}
              className={select}
            >
              <option value="">Elegir…</option>
              {tiposLente.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>

          {tipoLente === "Monofocal" && lineasCristal.length > 0 && (
            <div className="flex gap-2 text-sm">
              {(["lejos", "cerca"] as const).map((p) => (
                <label
                  key={p}
                  className="flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-tinta-suave/25 bg-white px-2 py-2.5 capitalize has-checked:border-brand has-checked:bg-brand/10"
                >
                  <input
                    type="radio"
                    name="posicion_cristal"
                    checked={posicionCristal === p}
                    onChange={() => setPosicionCristal(p)}
                    className="accent-brand"
                  />
                  {p}
                </label>
              ))}
            </div>
          )}

          {rangoAuto ? (
            <p className="rounded-lg bg-brand/10 px-3 py-2 text-xs font-medium text-brand-dark">
              Rango de la receta calculado automático: <b>{rangoAuto}</b>
            </p>
          ) : (
            tipoLente && (
              <label className="flex flex-col gap-1 text-sm font-medium">
                Rango de la receta
                <select
                  value={rangoManual}
                  onChange={(e) => {
                    setRangoManual(e.target.value);
                    setTratamiento("");
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
                  Este paciente no tiene receta cargada, así que hay que elegir el rango a mano.
                </span>
              </label>
            )
          )}

          <label className="flex flex-col gap-1 text-sm font-medium">
            Tratamiento
            <select
              value={tratamiento}
              onChange={(e) => setTratamiento(e.target.value)}
              disabled={!rango}
              className={select}
            >
              <option value="">Elegir…</option>
              {tratamientos.map((c) => (
                <option key={c.tratamiento} value={c.tratamiento}>
                  {nombreCristal(c.tipo_lente, c.tratamiento)} —{" "}
                  {clp(c.precio_venta > 0 ? c.precio_venta : c.costo * factorVenta)}
                </option>
              ))}
            </select>
          </label>

          <div className="flex gap-2 text-sm">
            {(["laboratorio", "stock"] as const).map((op) => (
              <label
                key={op}
                className="flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-tinta-suave/25 bg-white px-2 py-2.5 has-checked:border-brand has-checked:bg-brand/10"
              >
                <input
                  type="radio"
                  name="origen_cristal"
                  checked={origenCristal === op}
                  onChange={() => setOrigenCristal(op)}
                  className="accent-brand"
                />
                {op === "laboratorio" ? "Pedir al laboratorio" : "De stock"}
              </label>
            ))}
          </div>

          {origenCristal === "laboratorio" && laboratorios.length > 0 && (
            <label className="flex flex-col gap-1 text-sm font-medium">
              Laboratorio
              <select
                value={laboratorioId}
                onChange={(e) => setLaboratorioId(e.target.value)}
                className={select}
              >
                {laboratorios.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.nombre}
                  </option>
                ))}
              </select>
            </label>
          )}

          <button
            type="button"
            onClick={agregarCristal}
            disabled={!tratamiento || !puedeAgregarOtroCristal}
            className={`${boton} bg-brand/15 text-brand-dark hover:bg-brand hover:text-white`}
          >
            Agregar cristales a la venta
          </button>

          <Resumen carrito={carrito} total={total} quitar={quitar} />

          {creaOT && (
            <p className="rounded-lg bg-brand/10 px-3 py-2 text-xs font-medium text-brand-dark">
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
              onClick={() => setPaso(1)}
              className={`${boton} border border-tinta-suave/30 text-tinta-suave hover:bg-white`}
            >
              Atrás
            </button>
            <button
              type="button"
              onClick={() => setPaso(3)}
              disabled={carrito.length === 0}
              className={`${boton} flex-1 bg-brand text-white hover:bg-brand-dark`}
            >
              {carrito.length === 0 ? "Agrega algo para continuar" : "Continuar al pago"}
            </button>
          </div>
        </section>
      )}

      {/* ---------------------------------------------------------------- */}
      {paso === 3 && (
        <section className="flex flex-col gap-3 rounded-2xl bg-crema-claro p-4 shadow-sm">
          <div>
            <h2 className="font-bold">Cobro</h2>
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
                className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-brand-dark transition hover:bg-brand hover:text-white"
              >
                {i === 0 ? `Paga todo (${clp(total)})` : `Mitad (${clp(monto)})`}
              </button>
            ))}
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
              className={`${boton} flex-1 bg-brand text-white hover:bg-brand-dark`}
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
// desde el segundo para no obligar a recordar lo ya agregado.
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
