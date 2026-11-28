# Auditoría financiera de Lentia — 28-11-2026

**Base revisada:** `master` en `e379430`, que incluye los PR #49 a #53.
**Producción:** solo lectura, con consultas de totales sin datos de pacientes, el 28-11-2026.
**Pruebas:** con datos ficticios, en `tests/auditoria-financiera.test.ts`, `tests/precio-venta.test.ts`, `tests/resumen-chequeo.test.ts` y `tests/costo-marcos-pantallas.test.ts`.

## Resumen
| Área | Estado |
|---|---|
| Ventas, abonos y saldos | Conciliado |
| Mercado Pago: un cobro por voucher | Conciliado |
| Caja real: cuenta | **Descuadrada: faltan ~$576.320 sin registrar** |
| Caja real: efectivo | **Sin verificar** (último conteo: 19-11, $0 contados) |
| Utilidad, costos y gastos | Conciliado, con las correcciones de #52, #53 y este PR |
| Reparto y cierre | Conciliado |
| Cristales Fides | Conciliado |

## Control aritmético
Caso: operativo con $300.000 vendidos y $180.000 cobrados, $60.000 de cristales, $30.000 de marcos y $40.000 de gastos, sin IVA ni comisiones.
- La utilidad antes del reparto es **$170.000** en las cinco vistas: chequeo, Caja, resumen, operativo y cierre.
- Al cobrar los $120.000 restantes, Caja sube $120.000 y Por cobrar baja a $0. La utilidad y el reparto **no cambian**.

Prueba: `control aritmético` en `tests/auditoria-financiera.test.ts`.

## Hallazgos corregidos

### 1. Caja: "Cobrado" se leía como plata disponible (este PR)
- **Pantalla:** Caja y Chequeos, recuadro verde.
- **Causa:** se mostraba "Cobrado hasta ahora" junto al saldo de la cuenta sin explicar la diferencia, y se decía que las transferencias "entran a Mercado Pago".
- **Corrección:** el recuadro pasa a llamarse **"Pagado por los pacientes"** y muestra el cuadre: *Según lo registrado en Lentia* contra *Mercado Pago*, con la línea **"Falta en la cuenta"** o **"Sobra en la cuenta"**.
- **Fórmula:**
  - Registrado = cobros digitales − comisiones − gastos digitales − retiros digitales − devoluciones ± movimientos entre cajas.
  - Diferencia = saldo real − registrado.
- **Antes y después (datos reales):** antes no se veía nada. Ahora: registrado $2.008.807, Mercado Pago $1.432.487, **falta $576.320**.
- **Prueba:** `si la cuenta real no calza…`.

### 2. Gastos: lo pagado, lo por pagar y el IVA aparecían en una sola cifra (este PR)
- **Pantalla:** recuadro rojo.
- **Causa:** "Gastos $1.814.413" sumaba lo pagado, la deuda con Fides y la reserva de IVA. "Falta pagar" incluía el IVA.
- **Corrección:** el recuadro pasa a llamarse **"Costos del chequeo"** y muestra *Ya pagado · Falta pagar · IVA a guardar*. La suma de los tres siempre es igual al total.
- **Prueba:** `separa lo ya pagado…`.

### 3. Productos vendidos que no son marcos no se descontaban del reparto (#53)
- **Ejemplo:** un lente de contacto de $20.000 bajaba la utilidad $20.000 y el reparto $0.
- **Ahora:** baja ambos.

### 4. Marcos distintos según la pantalla (#52 y #53)
- **Antes:** el chequeo usaba el costo real, pero las demás pantallas cobraban $5.000 o $6.000 fijos, también por el marco del paciente.
- **Ahora:** todas usan `desglosarCostos` con el costo de Inventario y omiten el marco del paciente.

### 5. Compras de stock y reintegro a Pablo (#52)
- **Antes:** una compra personal de marcos de $340.000 se descontaba dos veces: como reintegro y como reserva de marcos.
- **Ahora:** primero cubre la reposición de los marcos vendidos, y el resto queda como stock.
- **Prueba:** `una compra de marcos para stock no baja los sueldos`.

### 6. Equipos registrados para todo el chequeo (#53)
- Hay una opción nueva, "Arriendo de equipos", que se suma en la fila Equipos, no en Viáticos.

### 7. Cristal por cotizar no se podía regalar (#53)
- **Ahora:** una cortesía en $0 se acepta en el punto de venta y en el servidor (`faltaPrecioCotizado`).

## Verificado sin cambios
- **Una venta de tres pares con dos órdenes de trabajo** se cuenta una vez: vendido $270.000, 3 pares, costo de cada ojo por separado.
- **Mercado Pago:**
  - un voucher no se puede usar en dos abonos (trigger `mercadopago_proteger_abono` con clave única);
  - un pago con tarjeta exige que Mercado Pago confirme la operación real (`exigir_tarjeta_verificada`);
  - de los abonos cruzados con Mercado Pago, 0 tienen un monto distinto.
- **Reintentos:** la venta, el abono y el pago de sueldo se registran una sola vez por su identificador (`registrar_venta`, `operacion_id`, `registrar_pago_reparto`).
  - Dos pagos de sueldo simultáneos: uno se guarda y el otro sale con "La caja cambió" (probado en Postgres local).
  - Repetir `finalizar_sueldos_operativo` vuelve a marcar el cierre, pero no crea egresos.
  - No existe la opción de reabrir el cierre.
- **Cambio de tarifa del proveedor:** la orden de trabajo guarda `costo_laboratorio` al momento de la venta; cambiar la lista no altera las ventas anteriores.
- **Cristales Fides en celular:**
  - 1.67 Filtro Azul en −14,00: stock "Por cotizar".
  - Tallado a $150.000.
  - El precio manual llega a la venta y la orden de trabajo se crea con su costo.
  - 1.67 Fotocromático Gris: por cotizar en stock y en tallado (prueba en `tests/precio-venta.test.ts`).
- **Datos de producción:**
  - 0 ventas cuyo total difiere de sus ítems;
  - 0 estados de pago inconsistentes;
  - 0 ventas pagadas de más;
  - 0 cristales sin orden de trabajo;
  - 0 abonos duplicados.

## Pendientes por falta de evidencia
- **IVA:** se reserva el 19/119 de las ventas, sin crédito fiscal mientras no se cargue el F29. Es una reserva prudente; la nota indica cuánto bajaría con las facturas de Fides.
- **Comisión de tarjetas:** se usan los porcentajes configurados (2,13 % débito y 2,96 % crédito). No se contrastaron con las liquidaciones reales de Mercado Pago.
- **Destino de las transferencias** ($1.114.965 en total): hay que confirmar si llegan a Mercado Pago o a otra cuenta. Si llegan a otra cuenta, el cuadre debe separarlas.

## Registros históricos que requieren corrección aparte (no se tocaron)
Propuesta verificable. Cada punto lo hace un administrador desde la app, sin cambios en la base de datos.

1. **~$576.320 que faltan en la cuenta.**
   - Registrar la compra de marcos de ~$380.000 como gasto de Inventario pagado desde la cuenta.
   - Buscar el resto (~$196.000) en los movimientos de Mercado Pago.
2. **Arriendo de equipos del Chequeo 1** ($260.000): registrarlo como gasto del chequeo.
3. **Efectivo:** hacer un conteo real hoy. El del 19-11 registró $0 cuando se esperaban $403.736.
4. **16 pagos aprobados en Mercado Pago sin abono asociado** ($822.965). Seis no traen medio de pago (posibles transferencias recibidas). Hay que asociarlos a su abono o registrarlos.
5. **9 abonos con tarjeta** cuyo voucher no está en el archivo de Mercado Pago, que parte el 30-10.
6. **20 ventas anuladas antiguas** con $877.400 en abonos, sin conciliar.
7. **Otros:** $35.000 en devoluciones pendientes, 2 órdenes de trabajo vivas sin venta viva, 33 productos vendidos con costo $0 en Inventario y 6 ventas de noviembre sin operativo ($38.000).
