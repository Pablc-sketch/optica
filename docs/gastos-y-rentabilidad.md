# Gastos y rentabilidad

`/gastos` reúne los pendientes de marcos, cristales, equipos, sede, transporte, viáticos, hospedaje, comida, peajes, personal y otros. Hay acceso desde el menú, inicio, Caja, Pagos y el cierre de cada operativo. Se puede filtrar una sede o un rango de fechas para una salida completa.

- Saldar o abonar registra el importe realmente pagado y permite su fecha histórica.
- Si el gasto ya existe, se vincula parte o todo a un concepto y operativo. No se crea otra salida de caja. Una compra de stock puede distribuirse entre varias sedes.
- Las vinculaciones se pueden anular conservando la historia. El servidor limita la suma al gasto original y bloquea reducir el gasto por debajo de lo vinculado. RLS limita lectura y escritura a la administración de cada óptica. Caja y Por pagar reconocen también estas vinculaciones.
- Los registros pagados quedan en la pestaña Pagados. No se dan por pagados automáticamente los históricos ni se eliminan movimientos.
- El costo de un marco vendido se fija por operativo. Los históricos siguen a $5.000; la salida de Óptica Global del 23 al 28 de noviembre de 2026 usa $6.000 por instrucción de Pablo. La compra de stock afecta caja, su consumo afecta utilidad.
- Los costos de hospedaje, comida y peajes están separados. Los viáticos antiguos se conservan. No cargar el mismo importe en ambas categorías.

El resumen muestra utilidad operativa antes de impuestos, ahorro y reparto, e incluye ventas aún no cobradas. Los gastos generales de inventario no se vuelven a descontar de utilidad; los otros gastos generales sin asignar se muestran aparte. Las sedes muestran costo y utilidad por paciente único atendido.

## Simulación temporal (no modifica gastos ni precios)

El presupuesto inicial de $1.100.000 incluye equipos $300.000 informados por Pablo; combustible $128.000 (800 km / 10 km/l × $1.600); peajes $50.000; alojamiento $180.000 (3 noches × $60.000 por grupo); comida $216.000 (3 personas × 6 días × $12.000); sedes $80.000 sin cotización; entrega, desgaste e imprevistos $146.000. Todo salvo equipos es supuesto editable. No es una cotización de viaje ni una ruta calculada puerta a puerta; falta comuna de José Beliz y confirmar pernoctaciones.

Por anteojo: marco $6.000, laboratorio $8.000 (mezcla principalmente de monofocales de stock), estuche $1.000; comisión venta 10%, tarjeta 3%. Reserva todo el débito IVA (19/119 de ventas), sin presumir crédito fiscal. La base se verificó con SII; no aplica automáticamente créditos a combustible del auto. No incluye ingresos por consultas ni sueldo fijo de dueños. Reparto ilustrativo: ahorro 20%, resto mitad para cada dueño, antes de impuesto a la renta. Entradas del simulador son temporales y no se guardan como gasto real.

Con precio promedio $55.000: equilibrio 46 anteojos; 60 dejan ~$344.109; 80 ~$825.479; 100 ~$1.306.849, sujeto a esos supuestos y cobrar todo.

Referencias consultadas 18-11-2026:
- https://www.autopase.cl/resources/descargas/aconcagua-01-01-2026.pdf
- https://concesiones.mop.gob.cl/uploads/sites/4/2026/01/RUTA-78.pdf
- https://www.sii.cl/preguntas_frecuentes/impuestos_mensuales/001_130_0572.htm
- https://www.sii.cl/preguntas_frecuentes/impuestos_mensuales/001_130_0622.htm

## Validación

436 pruebas de lógica, tipos, lint y compilación. Las 6 suites de integración que requieren una base local no están configuradas en esta sesión. Verificación adicional SQL con rol authenticated y rollback: vinculación parcial, caja sin nueva salida, límite acumulado, protección del importe, historia inmutable, reversión y rechazo de operativo inexistente. Ningún pago real fue marcado durante las pruebas.
