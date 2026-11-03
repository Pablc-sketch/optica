# Caja unificada

El menú principal usa Caja para todas las finanzas. Vouchers de Mercado Pago, revisión de movimientos, pendientes, reportes y documentos se abren desde ella. Historial de ventas queda dentro de Vender, avisos dentro de Entregas y precios/suscripción/integraciones dentro de Configuración. El inicio se reduce a tareas diarias y próximo operativo.

Caja presenta cuenta bancaria y efectivo por separado. Para la cuenta, el saldo externo confirmado por Mercado Pago conserva su fuente y hora; el saldo registrado se calcula con ingresos de tarjeta y transferencias, salidas netas y comisión estimada. Nunca se suma la lista de vouchers de Mercado Pago a los cobros de Lentia: eso duplicaría ingresos. Si no se puede consultar la cuenta, se indica y permanece visible el detalle contable.

Efectivo muestra entradas menos salidas según caja_global, junto al último conteo físico, su fecha y la diferencia contra el esperado EN ESE MOMENTO. Contar no inventa un gasto ni corrige el libro automáticamente. Los movimientos sin medio histórico se señalan porque la regla vigente los incluye como efectivo.

El historial reúne cobros no anulados, gastos, retiros/aportes/ahorro y las dos caras de un traslado entre efectivo y cuenta. Permite filtrar origen y entradas/salidas, y cargar más filas. Gastos personales se distinguen y no se confunden con salidas del negocio. Entradas en verde, salidas en rojo. La utilidad de operativos se identifica como calculada, incluyendo ventas por cobrar, distinta del saldo disponible.

Sin cambios de esquema ni modificación automática de movimientos reales. Verificación: TypeScript, ESLint, pruebas de navegación, caja y demás lógica; compilación de producción. Falta una revisión visual dentro de una sesión autenticada del usuario.
