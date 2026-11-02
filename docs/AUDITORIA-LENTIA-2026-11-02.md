# Auditoría de Lentia — 2 de noviembre de 2026

Se revisaron los flujos diarios de Óptica Global, sus permisos, los cálculos y el archivo de Mercado Pago. La conexión de Mercado Pago sigue limitada a la óptica configurada en el servidor. No se modificaron importes, pacientes ni pagos reales para probar el sistema.

## Cambios realizados

| Hallazgo | Corrección |
| --- | --- |
| Mercado Pago estaba escondido en configuración | Acceso **Caja MP** en el menú y en Inicio. |
| Pagos y saldo podían confundirse | Cobros del período separados del saldo bancario. Saldo visible solo con respuesta válida del proveedor; acceso a la cuenta original cuando no está habilitado. |
| Actualización poco clara | Botón **Actualizar ahora**, hora de última sincronización y refresco opcional de pantalla cada 60 segundos. El archivo sigue consultándose cada 5 minutos con Lentia cerrada. |
| Datos limitados a lo visible | Resumen de cobros calculado en la base; operaciones paginadas, con filtros por fecha y operación. |
| Una compra con varias órdenes podía duplicar deuda en el tablero | Se cuenta el saldo una vez por compra. |
| Listas de cobros, órdenes y stock podían truncarse | Lectura paginada con orden estable; consultas de órdenes agrupadas para evitar direcciones demasiado grandes. |
| Pacientes mostraba solo 50 resultados sin navegación | Páginas anterior/siguiente y búsqueda por RUT con o sin puntos. |
| El buscador de venta reformateaba el RUT a mitad de escritura | Búsqueda literal normalizada; acepta RUT parcial y nombres sin tildes. Selección visible con nombre completo y RUT. |
| Exceso de texto y formularios repetidos | Menú compacto en celular, instrucciones breves, ajustes de stock y proveedores desplegables, textos de reportes y boletas reducidos. |
| Campos sin nombre accesible | Etiquetas para búsqueda, precios, stock, movimientos, roles y vouchers. |
| Botones de guardado sin respuesta de espera | Botones bloqueados mientras guardan; controles de abono bloqueados durante el envío. |
| Un fallo de carga podía parecer una lista vacía | Mensajes de error diferenciados, pantalla de reintento y página de enlace no disponible. |
| Recibos y otras pantallas podían conservar datos anteriores | Invalidación explícita de comprobantes, caja, cobros, entregas e historial después de modificar una venta. |
| Suscripción sin respuesta podía permitir acciones | Se exige una confirmación positiva. Una óptica sin suscripción ve el acceso a planes. |
| Día chileno calculado con el desfase del mediodía | Límites correctos durante los cambios de hora de abril y septiembre; se incluye el último segundo completo en reportes. |
| Consulta de soporte no comprobaba cuenta activa | El panel de ópticas exige soporte activo en la base, incluso ante una llamada directa. |
| Funciones auxiliares disponibles sin sesión | Se retiró acceso anónimo al identificador de óptica y acceso directo al trigger que protege al último administrador. |

## Comprobaciones

- 366 pruebas automáticas aprobadas en 51 archivos. Después de los últimos ajustes administrativos se repitieron las 74 comprobaciones relacionadas: todas aprobadas.
- Compilación de producción y TypeScript correctos. Lint sin errores; permanece un aviso anterior por la imagen usada en la tarjeta pública de marca.
- Pruebas transaccionales de Mercado Pago: duplicados, actor, identidad, cambios de fecha, modificaciones de abonos confirmados, aislamiento entre ópticas y permisos. Todas revertidas mediante ROLLBACK.
- Prueba de resumen: resultados iguales al archivo completo, acceso limitado a la óptica autenticada y bloqueo sin perfil/suscripción.
- Prueba del panel de soporte con usuario activo e inactivo, dentro de una transacción revertida.
- En producción se comprobó **Actualizar ahora** y la búsqueda exacta del voucher de $8.000. Se conservan dos operaciones por $27.000, sin duplicación.
- Se comprobó el menú móvil, la búsqueda de paciente con RUT sin puntos y parcial, y la carga de la receta al avanzar en la venta.
- Se recorrieron Inicio, Pacientes, Venta, Cobros, Entregas, Órdenes, Operativos, Reportes, Inventario, Precios, Boletas, Configuración, Avisos, Pagos y Laboratorio.
- Se descargó un expediente real de reembolso: tres páginas A4, inspeccionadas visualmente. Certificado y comprobante mantienen la fecha guardada; la receta mantiene su fecha clínica.
- La consulta de errores de la nueva publicación no mostró errores en la ventana reciente examinada.

## Límites y pendientes conocidos

**Saldo de la cuenta:** la consulta de saldo no está habilitada en esta conexión. Lentia muestra esta condición y permite abrir Mercado Pago. Los $27.000 son cobros archivados, no dinero disponible. El sistema no importa todavía el extracto completo de transferencias, retiros, rendimientos y gastos de esa cuenta. La actualización de pagos es periódica, no una transmisión instantánea.

**Identidad del voucher:** los dos pagos históricos siguen pendientes de cotejo del original por el administrador. No se confirmó ningún paciente en su nombre. Una coincidencia de operación, importe, fecha y medio propone un abono; no demuestra quién es el beneficiario. Las referencias históricas cortas, como “11”, no identifican por sí solas una operación oficial de Mercado Pago.

**Archivos de reembolso:** fecha y destino quedan guardados en Lentia. Los archivos adjuntados para armar el PDF continúan en la sesión de esa pantalla; se deben descargar antes de cerrarla.

**Pruebas de integración:** seis suites que requieren credenciales específicas de la base de pruebas no se ejecutaron: session-security, tenant-isolation, flujo-completo, sync-offline, onboarding y permisos-rol. Se complementó con las pruebas transaccionales de permisos indicadas; no se descargaron credenciales de producción para ejecutar suites de alta de cuentas.

**Avisos de la plataforma:** permanecen funciones internas autenticadas que requieren permisos elevados y ya validan su finalidad. La tabla privada de referencias tiene acceso denegado a clientes, por lo que su aviso de RLS sin política es intencional. Sigue desactivada la comprobación de contraseñas filtradas de Supabase; también hay recomendaciones de índices y optimización de políticas que no alteran los resultados revisados. No se cambiaron planes de pago ni configuraciones de autenticación ajenas a estas correcciones.

Referencias de mantenimiento: [permisos de funciones](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable), [protección de contraseñas](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection), [rendimiento de políticas](https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select).

Esta es una revisión funcional y de seguridad del alcance descrito; no es una certificación de ausencia de errores ni una prueba de penetración de toda la infraestructura.
