# Auditoría externa del 08-10-2026 — estado de cada hallazgo

Fuente: `Lentia-auditoria.md` y `Lentia-para-Claude.md` (ChatGPT/Codex), commit auditado 718e903.

| Id | Hallazgo | Estado | Dónde |
|---|---|---|---|
| F01 | Operativo del paciente anterior quedaba pegado en la venta | Corregido | `src/lib/contexto-venta.ts` (+ tests), `ventas/pos.tsx` |
| F02 | Fecha de entrega con dos editores | Corregido: solo `actualizarEntregaOperativo`; `actualizarOperativo` ya no escribe la fecha | `operativos/[id]/page.tsx`, `lib/actions/operativos.ts` |
| F03 | Herencia fecha operativo → OT | Pendiente (fase 2: plan de entrega con modo heredado/individual). No hacer UPDATE masivo de las 9 diferencias | — |
| F04 | "Están listos" a quien no tiene OT lista | Corregido: elegibilidad por estado real de OT, parcial, agrupado por paciente, saldo una vez | `src/lib/avisos.ts` (+ tests) |
| F05 | WhatsApp sin historial persistente | Pendiente (tabla `comunicaciones`, estados abierto/enviado manual) | — |
| F06 | Mensaje con cambios sin guardar | Corregido: el mensaje usa solo lo guardado y bloquea el envío si hay cambios o faltan datos; el guardado verifica filas afectadas | `recordar-entrega.tsx`, `enviar-whatsapp.tsx` |
| F07 | Sedes y dirigentes no reutilizables | Pendiente (fase 2, migración aditiva) | — |
| F08 | Falta "atención" que una receta y venta en la jornada | Pendiente (fase 2) | — |
| F09 | Crear operativo + contacto no es atómico | Pendiente (RPC idempotente) | — |
| F10 | Errores mostrados como listas vacías | Parcial: avisos muestran error de lectura. Resto de pantallas pendiente | `avisos/page.tsx` |
| F11 | RLS de escritura sin rol en operativos/gastos/retiros | Pendiente (matriz de permisos, probar por rol) | — |
| F12 | RPC `registrar_venta` acepta costos del JSON | Pendiente (mover invariantes a la base o restringir EXECUTE) | — |
| F13 | Receta y costos sin versión histórica | Pendiente | — |
| F14 | Estados de OT sin historial de eventos | Pendiente | — |
| F15 | Offline solo cubre ventas | Pendiente (IndexedDB) | — |
| F16 | Inventario negativo sin conciliación | Pendiente (17 filas; no normalizar a cero) | — |
| F17 | Faltan pruebas E2E/integración y esquema reproducible | Pendiente | — |

Reglas que no se tocan: comisión Isadora 10%, ahorro 20%, reparto 50/50, costo marco absorbido $3.248, folios, cobrado y deuda.

## Revisión nocturna 19→20-10-2026 (Claude publica, Codex verifica)

| Commit | Cambio | Verificación |
|---|---|---|
| aefa135 | Marcos/premium huérfanos fuera del cobro; abono mínimo con costo real; cierre sin doble pago secuencial, deshacer acotado, efectivo/transferencia | Codex en navegador: quitar cristal deja carrito vacío y "Cobrar $0" deshabilitado |
| 4da0b0c | Abono mínimo bruto de la comisión del medio; aviso si el precio no cubre producción; ticket solo de lentes | Codex en navegador: polarizado $70.000 → efectivo $35.000, débito $36.000, crédito $37.000 (sin guardar) |
| 3c8c5b1 | Regla de consulta de Pablo: incluida si compra lentes; $5.000 solo al que no compra; consulta ya cobrada se descuenta a mano una vez | Codex: aviso leído, formulario cancelado sin registrar |
| 5ea1be0 | Cobros "Todos" y links globales del Inicio | Codex: READY + CI run 39364440702; Por cobrar abre Todos con $72.000 / 3 personas |
| 18cbb1c | Medio de pago obligatorio en cada cobro (sin defecto ni arrastre) en Vender, Cobros y Consulta | CI verde; pendiente prueba en navegador |

Pendientes conocidos (no se tocan sin decisión):
- Cierre: sin protección atómica en BD ante dos pagos simultáneos. Operar con un solo encargado del cierre.
- 17 filas de inventario negativo: conciliación física, sin normalizar a cero.
- Consulta ya cobrada a quien después compra: descuento manual una sola vez, sin abono extra.
- No se corrigieron datos históricos en esta revisión.
