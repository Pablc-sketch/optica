"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { registrarVenta } from "@/lib/actions/ventas";
import { encolar, type CambioSync } from "@/lib/offline/outbox";
import { clp } from "@/lib/clp";
import { formatearRut } from "@/lib/rut";
import { formatearMonto, montoANumero } from "@/lib/formato";
import { nombreCristal, tratamientoAplica } from "@/lib/cristales";
import { hoyEnChile, sumarDias } from "@/lib/fechas";

type Paciente = { id: string; nombre: string; rut: string | null };
type Producto = { id: string; nombre: string; marca: string | null; precio_venta: number };
type CostoCristal = {
  tipo_lente: string;
  rango_receta: string;
  tratamiento: string;
  costo: number;
  precio_venta: number;
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
  ultimaRecetaPorPaciente,
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
  ultimaRecetaPorPaciente: Record<string, string>;
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
  const rangos = useMemo(
    () => [...new Set(costos.filter((c) => c.tipo_lente === tipoLente).map((c) => c.rango_receta))],
    [costos, tipoLente]
  );
  const [rango, setRango] = useState("");
  // Solo los tratamientos que existen para ese tipo de lente: un monofocal
  // no puede llevar un tratamiento "Multifocal ...".
  const tratamientos = useMemo(
    () =>
      costos.filter(
        (c) =>
          c.tipo_lente === tipoLente &&
          c.rango_receta === rango &&
          tratamientoAplica(c.tipo_lente, c.tratamiento)
      ),
    [costos, tipoLente, rango]
  );
  const [tratamiento, setTratamiento] = useState("");
  const [origenCristal, setOrigenCristal] = useState<"laboratorio" | "stock">("laboratorio");

  const total = carrito.reduce((s, l) => s + l.cantidad * l.precioUnitario, 0);
  const abonoNum = Math.max(0, Math.min(montoANumero(abono), total));
  const esAbonoParcial = abonoNum > 0 && abonoNum < total;
  const montoACobrar = esAbonoParcial ? abonoNum : total;
  const lineaCristal = carrito.find((l) => l.cristal);
  const lineaArmazon = carrito.find((l) => l.productoId);
  const creaOT = Boolean(pacienteId && lineaCristal);
  const recetaPacienteId = pacienteId ? ultimaRecetaPorPaciente[pacienteId] : undefined;
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
          precioUnitario: p.precio_venta,
        },
      ];
    });
  }

  function agregarCristal() {
    const combo = tratamientos.find((c) => c.tratamiento === tratamiento);
    if (!combo) return;
    // Precio editable de la óptica (/precios); el factor es solo respaldo.
    const precio = combo.precio_venta > 0 ? combo.precio_venta : combo.costo * factorVenta;
    setCarrito((prev) => [
      ...prev.filter((l) => !l.cristal), // un par de cristales por venta/OT
      {
        key: `cristal-${Date.now()}`,
        descripcion: `Cristales ${nombreCristal(combo.tipo_lente, combo.tratamiento)} ${combo.rango_receta}`,
        cantidad: 1,
        precioUnitario: precio,
        cristal: {
          tipoLente: combo.tipo_lente,
          rangoReceta: combo.rango_receta,
          tratamiento: combo.tratamiento,
          costoLaboratorio: combo.costo,
        },
      },
    ]);
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
    setRango("");
    setTratamiento("");
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
    // mismo lote (el servidor la enlaza cuando vuelve la señal).
    const otId = creaOT ? crypto.randomUUID() : null;
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

    if (otId && lineaCristal?.cristal) {
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
          armazon_producto_id: lineaArmazon?.productoId ?? null,
          tipo_lente: lineaCristal.cristal.tipoLente,
          rango_receta: lineaCristal.cristal.rangoReceta,
          tratamiento: lineaCristal.cristal.tratamiento,
          origen_cristal: origenCristal,
          proveedor_lab_id: origenCristal === "laboratorio" ? laboratorioId || null : null,
          costo_laboratorio: lineaCristal.cristal.costoLaboratorio,
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
          ot_id: l.cristal ? otId : null,
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
        items: carrito.map(({ productoId, descripcion, cantidad, precioUnitario, cristal }) => ({
          productoId,
          descripcion,
          cantidad,
          precioUnitario,
          esCristal: Boolean(cristal),
        })),
        abonoInicial: montoANumero(abono),
        medioPago,
        cristal: creaOT && lineaCristal?.cristal
          ? { ...lineaCristal.cristal, origen: origenCristal }
          : null,
        armazonProductoId: lineaArmazon?.productoId ?? null,
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
                  onClick={() => setPacienteId(p.id)}
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
                  <span className="font-semibold">{clp(p.precio_venta)}</span>
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
              Elige tipo de lente, rango de la receta y tratamiento. Si no lleva cristales,
              continúa sin agregar.
            </p>
          </div>

          <label className="flex flex-col gap-1 text-sm font-medium">
            Tipo de lente
            <select
              value={tipoLente}
              onChange={(e) => {
                setTipoLente(e.target.value);
                setRango("");
                setTratamiento("");
              }}
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

          <label className="flex flex-col gap-1 text-sm font-medium">
            Rango de la receta
            <select
              value={rango}
              onChange={(e) => {
                setRango(e.target.value);
                setTratamiento("");
              }}
              disabled={!tipoLente}
              className={select}
            >
              <option value="">Elegir…</option>
              {rangos.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>

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
            disabled={!tratamiento}
            className={`${boton} bg-brand/15 text-brand-dark hover:bg-brand hover:text-white`}
          >
            Agregar cristales a la venta
          </button>

          <Resumen carrito={carrito} total={total} quitar={quitar} />

          {creaOT && (
            <p className="rounded-lg bg-brand/10 px-3 py-2 text-xs font-medium text-brand-dark">
              Al cobrar se crea la orden de trabajo automáticamente
              {recetaPacienteId
                ? " con la última receta del paciente"
                : " (el paciente aún no tiene receta cargada)"}
              .
            </p>
          )}
          {lineaCristal && !pacienteId && (
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
