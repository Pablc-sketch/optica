# Finanzas: revisión y rediseño del 4 de noviembre de 2026

## Problema y resultado
Caja, Por pagar, Revisión y Reportes tenían entradas de registro distintas. Un sueldo creado desde Reportes quedaba sin operativo, mientras los pendientes se calculaban por operativo: podía verse pagado en un lugar y pendiente en otro. El historial también presentaba cada traslado como dos filas, aumentando artificialmente entradas y salidas al mirar ambas cuentas.

Finanzas reúne Resumen, Movimientos, Por pagar y Revisar y corregir, con un acceso visible en el menú. Un formulario guiado registra gastos, sueldos, adelantos, aportes, ahorro, traslados, devoluciones personales y conteos. El origen es explícito, la vista previa explica su efecto y los pagos y aportes requieren operativo. Reportes conserva el análisis y conduce al registro central.

## Referencias consultadas
- Holded: tesorería, cuentas y conciliación separadas de documentos y pendientes: https://help.holded.com/es/articles/6926601-que-puedes-hacer-en-la-seccion-de-tesoreria
- Holded: préstamos y movimientos entre cuentas: https://help.holded.com/es/articles/11320674-conciliar-prestamos-movimientos-entre-cuentas-e-ingresos-en-efectivo
- Softop: finanzas específicas para ópticas, compras, proveedores y caja/bancos: https://softop.la/modulo-finanzas/
- e-Optics: anticipos, parcialidades y gastos por sucursal: https://www.eoptics.mx/caracteristicas-sistema-de-administracion-para-opticas.aspx
Se toman patrones de organización; no se copian identidad, pantallas ni promesas comerciales.

## Reglas conservadas y comprobaciones
- El saldo bancario solo se llama verificado si Mercado Pago lo devuelve y coincide la identidad/currency. La estimación tiene etiqueta propia; no se sustituye por un cero ante un fallo.
- Todos los gastos personales quedan fuera de las salidas de caja. El reintegro reduce la caja elegida y no vuelve a sumar el gasto.
- Un traslado aparece una vez. El total del negocio no cambia; cada cuenta sí refleja su entrada/salida.
- Las escrituras requieren administrador activo y suscripción. La óptica sale de la sesión/base, nunca del formulario. Se reutiliza la RPC auditada con invoker y comprobación del operativo del tenant.
- Guardados con UUID estable y reintentos idénticos: no duplican. Una colisión con valores diferentes muestra error. Conteos y traslados también verifican el registro persistido en un reintento.
- No se editan movimientos históricos automáticamente ni se realizan transferencias bancarias. Corregir exige motivo y conserva el historial.
- Se avisa sobre retiros sin asignar, registros no confirmados, cobros sin medio y cobros de ventas anuladas. No se afirma que una devolución ocurrió por existir una anulación.
- Historial con filtros de mes, cuenta, tipo y texto; exportación CSV con protección contra fórmulas de Excel. El neto del período no se presenta como saldo bancario.

## Validación
Pruebas de lógica y acciones con proveedores simulados: conservación del dinero, signo de aportes, separación personal, fechas de Chile, validaciones, permisos y reintentos. Tipos y lint. Revisión visual local con datos ficticios, escritorio y móvil; sin guardar fixtures en producción. La vista temporal se elimina antes de publicar.

## Límites
Las correcciones históricas requieren comprobar extractos, efectivo y respaldos. Una nueva interfaz no concilia por sí sola lo que no se registró. Las comisiones de la estimación continúan siendo estimadas. La disponibilidad de saldo real depende del permiso de Mercado Pago. No se alteran las reglas de reparto, precios ni costos históricos.

Verificación local: 401 pruebas aprobadas (396 de la suite general y 5 adicionales de autorización/reintento); tipos sin errores; lint conserva solo un aviso previo de imagen en la página pública. La compilación local de Turbopack en Windows falló al iniciar un proceso; la compilación de vista previa de Vercel sí terminó READY.
