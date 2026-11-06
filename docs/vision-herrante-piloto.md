# Piloto Visión Herrante

- **Inicio → En sucursal** abre el punto de venta sin heredar operativos anteriores.
- **Inicio → En terreno → Agenda** muestra el mes y permite filtrar por persona o kit.
- **Personal y kits** permite reemplazar los nombres iniciales y completar el detalle de cada kit. Las fichas de recursos no son cuentas de acceso.
- **Agendar operativo** reserva una vendedora, un tecnólogo, un coordinador y un kit. El kit reserva juntos la maleta, el autorrefractómetro y el lensómetro. Un rango de varios días mantiene el equipo reservado durante todo el tramo.
- Dos jornadas pueden coincidir con recursos diferentes. La base bloquea solapamientos, también ante guardados concurrentes. Cancelar libera la reserva; reabrir comprueba el cruce nuevamente.
- El presupuesto muestra un costo estimado por chequeo previsto. Los gastos registrados en el operativo se dividen por pacientes distintos con receta en esa jornada. Hospedaje está separado en el presupuesto y se registra junto con otros gastos en el cierre operativo del piloto.
- El piloto conserva los registros de demostración que ya existían. La agenda de disponibilidad y el calendario habitual de Óptica Global se mantienen separados.

Validación: `tests/agenda-terreno.test.ts` y `tests/agenda-terreno-database.sql` (el segundo dentro de BEGIN/ROLLBACK). La regla de exclusión sigue el [patrón de rangos de PostgreSQL](https://www.postgresql.org/docs/current/rangetypes.html#RANGETYPES-CONSTRAINT).
