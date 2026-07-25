"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { registrarVenta } from "@/lib/actions/ventas";
import { encolar, type CambioSync } from "@/lib/offline/outbox";
import { clp } from "@/lib/clp";

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

export default function PuntoDeVenta({
  pacientes,
  productos,
  costos,
  factorVenta,
  tenantId,
  sucursalId,
  vendedorId,
  ultimaRecetaPorPaciente,
}: {
  pacientes: Paciente[];
  productos: Producto[];
  costos: CostoCristal[];
  factorVenta: number;
  tenantId: string;
  sucursalId: string | null;
  vendedorId: string | null;
  ultimaRecetaPorPaciente: Record<string, string>;
}) {
  const router = useRouter();
  const [pacienteId, setPacienteId] = useState<string>("");
  const [carrito, setCarrito] = useState<LineaCarrito[]>([]);
  const [abono, setAbono] = useState<string>("");
  const [medioPago, setMedioPago] = useState("efectivo");
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
  const tratamientos = useMemo(
    () =>
      costos.filter((c) => c.tipo_lente === tipoLente && c.rango_receta === rango),
    [costos, tipoLente, rango]
  );
  const [tratamiento, setTratamiento] = useState("");
  const [origenCristal, setOrigenCristal] = useState<"laboratorio" | "stock">("laboratorio");

  const total = carrito.reduce((s, l) => s + l.cantidad * l.precioUnitario, 0);
  const lineaCristal = carrito.find((l) => l.cristal);
  const lineaArmazon = carrito.find((l) => l.productoId);
  const creaOT = Boolean(pacienteId && lineaCristal);
  const recetaPacienteId = pacienteId ? ultimaRecetaPorPaciente[pacienteId] : undefined;

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
        descripcion: `Cristales ${combo.tipo_lente} ${combo.tratamiento} ${combo.rango_receta}`,
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

  // Sin señal (operativo en terreno, spec 8.2): la venta se arma completa
  // en el dispositivo con UUIDs locales y va al outbox; se sincroniza sola
  // al reconectar. Los IDs locales hacen el reintento idempotente.
  function cobrarOffline() {
    const abonoMonto = Math.round(Number(abono.replace(/\./g, "")) || 0);
    const abonoReal = Math.max(0, Math.min(abonoMonto, total));
    const estadoPago = abonoReal >= total ? "pagada" : abonoReal > 0 ? "abono_parcial" : "pendiente";
    const ventaId = crypto.randomUUID();
    const ahora = new Date().toISOString();

    // Misma regla que online: con paciente y cristales, la OT viaja en el
    // mismo lote (el servidor la enlaza cuando vuelve la señal).
    const otId = creaOT ? crypto.randomUUID() : null;
    const entrega = new Date();
    entrega.setDate(entrega.getDate() + 7);

    const cambios: CambioSync[] = [
      {
        tabla: "ventas",
        op: "insert",
        id: ventaId,
        datos: {
          tenant_id: tenantId,
          paciente_id: pacienteId || null,
          sucursal_id: sucursalId,
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
          estado: "recepcion",
          armazon_producto_id: lineaArmazon?.productoId ?? null,
          tipo_lente: lineaCristal.cristal.tipoLente,
          rango_receta: lineaCristal.cristal.rangoReceta,
          tratamiento: lineaCristal.cristal.tratamiento,
          origen_cristal: origenCristal,
          costo_laboratorio: lineaCristal.cristal.costoLaboratorio,
          fecha_ingreso: ahora,
          fecha_entrega_estimada: entrega.toISOString().slice(0, 10),
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
    setCarrito([]);
    setAbono("");
    setPacienteId("");
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
        abonoInicial: Math.round(Number(abono.replace(/\./g, "")) || 0),
        medioPago,
        cristal: creaOT && lineaCristal?.cristal
          ? { ...lineaCristal.cristal, origen: origenCristal }
          : null,
        armazonProductoId: lineaArmazon?.productoId ?? null,
      });
      if (resultado.ok) {
        setCarrito([]);
        setAbono("");
        setPacienteId("");
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

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <div className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm font-medium">
          Paciente (opcional)
          <select
            value={pacienteId}
            onChange={(e) => setPacienteId(e.target.value)}
            className="rounded-lg border border-tinta-suave/30 bg-white px-3 py-2.5 text-base outline-none focus:border-brand"
          >
            <option value="">— Venta sin paciente —</option>
            {pacientes.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}{p.rut ? ` (${p.rut})` : ""}
              </option>
            ))}
          </select>
        </label>

        <section className="rounded-2xl bg-crema-claro p-4 shadow-sm">
          <h2 className="mb-2 text-sm font-bold">Armazones y productos</h2>
          <ul className="flex max-h-56 flex-col gap-1 overflow-y-auto">
            {productos.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => agregarProducto(p)}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm transition hover:bg-white"
                >
                  <span className="flex-1 truncate">{p.marca ? `${p.marca} ` : ""}{p.nombre}</span>
                  <span className="font-semibold">{clp(p.precio_venta)}</span>
                  <span className="rounded-md bg-brand/10 px-2 py-0.5 text-xs font-bold text-brand-dark">＋</span>
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-2xl bg-crema-claro p-4 shadow-sm">
          <h2 className="mb-2 text-sm font-bold">Cristales</h2>
          <div className="flex flex-col gap-2">
            <select value={tipoLente} onChange={(e) => { setTipoLente(e.target.value); setRango(""); setTratamiento(""); }} className="rounded-lg border border-tinta-suave/30 bg-white px-3 py-2 text-sm outline-none focus:border-brand">
              <option value="">Tipo de lente…</option>
              {tiposLente.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <select value={rango} onChange={(e) => { setRango(e.target.value); setTratamiento(""); }} disabled={!tipoLente} className="rounded-lg border border-tinta-suave/30 bg-white px-3 py-2 text-sm outline-none focus:border-brand disabled:opacity-50">
              <option value="">Rango de receta…</option>
              {rangos.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
            <select value={tratamiento} onChange={(e) => setTratamiento(e.target.value)} disabled={!rango} className="rounded-lg border border-tinta-suave/30 bg-white px-3 py-2 text-sm outline-none focus:border-brand disabled:opacity-50">
              <option value="">Tratamiento…</option>
              {tratamientos.map((c) => (
                <option key={c.tratamiento} value={c.tratamiento}>
                  {c.tratamiento} — {clp(c.precio_venta > 0 ? c.precio_venta : c.costo * factorVenta)}
                </option>
              ))}
            </select>
            <div className="flex gap-2 text-sm">
              {(["laboratorio", "stock"] as const).map((op) => (
                <label key={op} className="flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-tinta-suave/25 bg-white px-2 py-1.5 has-checked:border-brand has-checked:bg-brand/10">
                  <input
                    type="radio"
                    name="origen_cristal"
                    checked={origenCristal === op}
                    onChange={() => setOrigenCristal(op)}
                    className="accent-brand"
                  />
                  {op === "laboratorio" ? "Pedir al lab" : "De stock"}
                </label>
              ))}
            </div>
            <button
              type="button"
              onClick={agregarCristal}
              disabled={!tratamiento}
              className="rounded-lg bg-brand/10 px-3 py-2 text-sm font-semibold text-brand-dark transition hover:bg-brand hover:text-white disabled:opacity-50"
            >
              Agregar cristales
            </button>
          </div>
        </section>
      </div>

      <div className="flex flex-col gap-4">
        <section className="flex-1 rounded-2xl bg-crema-claro p-4 shadow-sm">
          <h2 className="mb-2 text-sm font-bold">Carrito</h2>
          {carrito.length === 0 ? (
            <p className="text-sm text-tinta-suave">Agregá productos o cristales.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {carrito.map((l) => (
                <li key={l.key} className="flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-sm">
                  <span className="flex-1 truncate">{l.cantidad > 1 ? `${l.cantidad}× ` : ""}{l.descripcion}</span>
                  <span className="font-semibold">{clp(l.cantidad * l.precioUnitario)}</span>
                  <button type="button" onClick={() => quitar(l.key)} className="text-tinta-suave hover:text-red-600" aria-label="Quitar">
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-3 flex items-center justify-between border-t border-tinta-suave/15 pt-3">
            <span className="font-bold">Total</span>
            <span className="text-xl font-bold">{clp(total)}</span>
          </div>

          {creaOT && (
            <p className="mt-2 rounded-lg bg-brand/10 px-3 py-2 text-xs font-medium text-brand-dark">
              Al cobrar se crea la orden de trabajo automáticamente
              {recetaPacienteId ? " con la última receta del paciente" : " (el paciente aún no tiene receta cargada)"}.
            </p>
          )}
          {!creaOT && lineaCristal && !pacienteId && (
            <p className="mt-2 rounded-lg bg-amber-100 px-3 py-2 text-xs font-medium text-amber-800">
              Elegí un paciente para que se cree la orden de trabajo.
            </p>
          )}
        </section>

        <section className="rounded-2xl bg-crema-claro p-4 shadow-sm">
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-sm font-medium">
              Abono inicial (CLP)
              <input
                inputMode="numeric"
                value={abono}
                onChange={(e) => setAbono(e.target.value)}
                placeholder="0"
                className="rounded-lg border border-tinta-suave/30 bg-white px-3 py-2.5 text-base outline-none focus:border-brand"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium">
              Medio de pago
              <select value={medioPago} onChange={(e) => setMedioPago(e.target.value)} className="rounded-lg border border-tinta-suave/30 bg-white px-3 py-2.5 text-base outline-none focus:border-brand">
                <option value="efectivo">Efectivo</option>
                <option value="debito">Débito</option>
                <option value="credito">Crédito</option>
                <option value="transferencia">Transferencia</option>
              </select>
            </label>
          </div>
          {mensaje && (
            <p className={`mt-2 text-sm font-medium ${mensaje.startsWith("✓") ? "text-green-700" : "text-red-700"}`}>
              {mensaje}
            </p>
          )}
          <button
            type="button"
            onClick={cobrar}
            disabled={guardando || carrito.length === 0}
            className="mt-3 w-full rounded-lg bg-brand px-4 py-3 text-base font-semibold text-white transition hover:bg-brand-dark disabled:opacity-50"
          >
            {guardando ? "Registrando…" : `Cobrar ${clp(total)}`}
          </button>
        </section>
      </div>
    </div>
  );
}
