# SII mensual

`/impuestos`, accesible desde el menú, Gastos, Caja y Pagos. Muestra cada período tributario con total mensual, pago registrado, saldo y acumulado. El acumulado suma saldos originales una sola vez: no crea una nueva deuda del mismo importe en meses siguientes.

Separa monto declarado por pagar, reserva estimada no declarada y declarado vencido. El vencimiento se ingresa desde el documento correspondiente; no se asume un día universal. Sin monto F29 confirmado, se calcula una reserva editable de IVA sobre ventas registradas (19/119 del bruto), menos crédito utilizable confirmado, más PPM, retenciones y recargos ingresados. No se adivinan tasas de PPM, remanentes fiscales ni clasificación de consultas exentas. La fecha de boleta se usa cuando existe; sin ella se usa fecha de venta en Chile y se identifica como estimación.

El total declarado sustituye la estimación e incluye los recargos, evitando sumarlos dos veces. No hay conexión con el SII ni presentación de F29 ni cálculo automático de intereses/reajustes/multas. Un pago parcial anotado no acredita declaración aceptada. Si hay recargos oficiales actualizados se ingresa el total vigente y su nota/folio.

Los pagos se registran junto con su gasto de caja, en una transacción idempotente, o se vinculan a un gasto general existente sin otra salida. No se puede reutilizar el mismo gasto activo como pago de otro período o de costos de operativos. Desvincular conserva la historia y el gasto, que se puede corregir desde la revisión financiera. Los importes declarados conservan versiones e historial de cambios. RLS y permisos limitan acceso a administradores de cada óptica.

Caja e Inicio descuentan del disponible el impuesto declarado que sigue pendiente; las reservas estimadas se muestran por separado en el control SII. El gasto tributario pagado afecta caja, pero no se vuelve a restar de la utilidad operativa antes de impuestos.

Validación: pruebas de cálculo mensual, créditos, F29, acumulados, pagos extra, fechas y reserva de Caja; prueba SQL authenticated con rollback para versiones, historial, idempotencia, gasto existente, separación de costos y aislamiento. No se crearon declaraciones ni pagos reales.

Fuentes oficiales revisadas el 18-11-2026:
- https://www.sii.cl/pagina/iva/guia_f29.htm
- https://www.sii.cl/preguntas_frecuentes/impuestos_mensuales/001_130_1901.htm
- https://www.sii.cl/destacados/ley_cumplimiento_obligaciones_tributarias/principales_cambios.html
- https://www.sii.cl/preguntas_frecuentes/impuestos_mensuales/001_130_2264.htm
