# Chequeo de pagos y gastos

Disponible para administradores en `/pagos/revisar`, desde Caja y Por pagar.

- Filtra registros históricos por operativo, persona/ahorro/gastos y confirmación.
- Compara reparto calculado contra retiros registrados. Un pago extra se destaca sin crear deuda negativa. No cambia automáticamente la regla de comisión ni el reparto.
- Permite confirmar, corregir monto/fecha/origen/persona/operativo y agregar movimientos omitidos. Los abonos de costos conservan concepto y operativo para no perder su asociación.
- “No aparté ahorro” requiere elegir operativo. Si ya hay un registro abre su corrección a cero; si hay varios pide revisar cada uno. Un ahorro calculado pendiente sigue siendo una previsión, aunque el registro real sea cero.
- Un registro que no ocurrió se corrige a cero, explicando el motivo. No se elimina su historia. Los aportes de personas admiten valores negativos.
- Guardar reemplaza el movimiento: no realiza transferencias ni cambia el saldo externo de Mercado Pago. Caja contable y pendientes se recalculan.

Las migraciones agregan confirmación y versión a gastos/retiros, una bitácora inmutable para usuarios autenticados y una RPC con permisos de administrador, suscripción, aislamiento por óptica y bloqueo de fila. Una edición concurrente con versión antigua se rechaza. Los triggers también registran cambios y eliminaciones desde pantallas antiguas e invalidan confirmaciones al cambiar datos.

Los registros anteriores empiezan por confirmar. La bitácora cubre cambios desde la instalación, sin inventar un historial anterior. La interfaz muestra los últimos 100 eventos; la base conserva todos. Los gastos personales con reintegros conservan las restricciones existentes de edición. Esta revisión cubre gastos, sueldos, aportes y ahorro; los cobros a pacientes y traslados bancarios mantienen sus flujos actuales.

Validación: pruebas unitarias, TypeScript y ESLint. Verificación SQL transaccional con ROL authenticated y rollback: alta, pago extra, conservación del historial, conflicto de versión, invalidación al editar y rechazo de un usuario sin permisos. No se confirman ni corrigen movimientos reales durante las pruebas.
