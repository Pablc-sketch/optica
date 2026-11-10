# Lentia: edición comercial

Esta rama separa el modelo comercial por tenant. Óptica Global y los tenants existentes mantienen `personalizado`. Las nuevas altas tienen catálogo, personal, kits y precio de consulta vacíos. La primera copia local fue bloqueada antes de subirse; esta entrega reconstruye los cambios registrados en la conversación y vuelve a comprobarlos.

## Alcance

- Precio de consulta configurable; cero representa consulta sin cobro.
- Marcos: costo y venta desde inventario, sin marco regalado ni premium fijo. El costo se guarda al vender y no cambia al modificar el catálogo después.
- Cristales: laboratorio propio, tarifa por unidad/par, montaje e impuesto a agregar, sin presumir IVA. Precio final por par y rangos de receta propios; fuera de cobertura no se cotiza con el último rango.
- Por ahora se admite una tarifa por tipo, rango y tratamiento con un proveedor. Una venta con cristales de proveedores distintos se registra por separado para evitar una orden al laboratorio equivocado.
- Personal de terreno sin exigir cuentas de acceso. Administración selecciona al emisor; un clínico solo emite con su propio perfil o registro asociado.
- La receta conserva nombre, RUT, título y registro del emisor. Imprimir, PDF y correo usan el mismo origen de datos. Corregir el emisor registra actor y ambos timbres.
- Las recetas previas toman el autor ya registrado y sus datos disponibles al migrar. No puede reconstruirse una versión de su perfil que nunca se guardó. Sin autor conocido no se atribuye la receta a quien la imprime.
- Kits desde inventario físico: autorefractómetro, lensómetro y maleta, con identificación individual y estado. Cada unidad pertenece a un kit a la vez.
- Operativos con fecha/rango, lugar, personal y kit. Sin horas reservan jornadas completas; varios días incluyen las noches. La pantalla señala cruces; PostgreSQL bloquea reservas duplicadas de personas, kits y componentes.
- Edición y cancelación actualizan reservas. Para retirar un equipo o cambiar componentes de un kit reservado hay que reasignar primero los operativos futuros.
- Presupuesto separado de gasto real, incluido hospedaje. Guardar el costo no registra un pago: se confirma por caja con claves idempotentes. No se hereda comisión, ahorro ni reparto familiar.

## Verificación

```
npm ci
npm run test:unit
npm run test:database
npm run build
```

La prueba de base de datos usa PGlite/PostgreSQL con GiST, roles y RLS, y aplica las migraciones en una base efímera ficticia. Se omite la instalación de pg_cron/pg_net, servicios externos ajenos a estas pruebas. Auth y Storage tienen esquemas mínimos: esto no sustituye un piloto con Supabase completo, navegador, archivos, correo ni integraciones.

Los seis archivos de integración de `npm test` requieren un Supabase de pruebas y variables en `.env.test.local`. Los tests del flujo personalizado declaran su edición; el alta comercial espera catálogo vacío.

## Antes de producción

1. Aplicar las dos migraciones en un entorno aislado y revisar avisos de seguridad del proveedor.
2. Probar dos ópticas, cinco tecnólogos, dos kits y dos usuarios imprimiendo recetas. Validar autenticación, aislamiento por API/documentos, reintentos, pagos, entrega y caja en navegador móvil.
3. Probar recuperación de un respaldo y definir reversión sin borrar historial nuevo.
4. Revisar las integraciones y suscripciones por cliente antes de ofrecerlas como operativas.

No se fusiona ni despliega esta rama; no se cambia el modelo de un tenant existente para probar, ni se utilizan pacientes reales. La revisión de Claude debe trabajar sobre esta rama y conservar esa separación.
