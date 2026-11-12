# Seguridad y validación de fases 1 a 7

Fecha: 2026-11-12
Proyecto: Optica

## Objetivo
Documentar la validación de seguridad realizada en entornos locales controlados, sin tocar la base de producción ni los datos reales del cliente. El enfoque fue validar el comportamiento real de la aplicación bajo escenarios de autenticación, tenant, pagos, integraciones externas y acciones financieras.

## Plantilla de trabajo y fases

Se trabajó con un plan por fases para no mezclar diagnósticos de infraestructura con correcciones de seguridad de negocio. La secuencia fue:

1. Revisión de arquitectura y supuestos de seguridad
2. Autenticación, sesiones y control de roles
3. Aislamiento multi-tenant
4. Integraciones externas y sincronización de pagos
5. Flujos financieros de caja y costos operativos
6. Reembolsos, documentos e idempotencia de pagos
7. Cierre final y hardening defensivo

---

## Fase 1: aislamiento, sesión y autorización

### Qué se revisó
- uso de tenant_id como contexto de negocio
- validación de sesión y roles
- acceso a páginas y acciones protegidas
- flujo de perfil y autorización centralizada

### Archivos relevantes
- `src/lib/autorizacion.ts`
- `src/lib/actions/configuracion.ts`
- `tests/session-security.test.ts`
- `tests/permisos-rol.test.ts`
- `tests/tenant-isolation.test.ts`

### Resultado verificado
- 3 archivos de test pasados
- 24 tests pasados
- 0 fallos

### Validación práctica
Se confirmó que:
- la sesión no es asumida desde el navegador
- los roles se validan del lado del servidor
- la pertenencia al tenant se exige en las acciones relevantes
- el sistema no deja que un usuario con un rol restringido acceda a recursos ajenos

---

## Fase 2: pagos e integraciones sensibles

### Qué se revisó
- endpoint de sincronización de Mercado Pago
- validación del secreto compartido
- idempotencia de sincronizaciones
- bloqueo de tampering de collector_id
- uso de lease para evitar concurrencia conflictiva
- normalización de pagos y conciliación

### Archivos relevantes
- `src/app/api/integraciones/mercadopago/sync/route.ts`
- `src/lib/mercadopago-sync.ts`
- `tests/mercadopago-sync.test.ts`
- `tests/mercadopago-confirmacion.test.ts`
- `tests/mercadopago-lectura.test.ts`
- `tests/mercadopago-saldo.test.ts`
- `tests/mercadopago-archivo.test.ts`

### Resultado verificado
- 5 archivos de test pasados
- 24 tests pasados
- 0 fallos

### Validación práctica
Se confirmó que:
- el endpoint de sync exige autorización por secreto compartido
- la comparación de secretos usa validación segura y no es vulnerable a comparaciones no constantes
- la sincronización no acepta cambios de collector fuera del tenant correcto
- la lógica de sincronización es idempotente y no duplica estados

---

## Fase 3: hardening financiero y validación de referencias por tenant

### Qué se identificó
Durante la validación financiera se encontró un riesgo real: ciertas acciones del servidor aceptaban referencias por ID sin verificar que pertenecieran al tenant activo. Ese patrón es crítico en sistemas multi-tenant y puede facilitar acciones cruzadas entre ópticas.

### Mejora aplicada
Se reforzó la capa de servidor para comprobar que cada referencia de negocio pertenece a la misma óptica antes de continuar.

#### Cambios relevantes
- `src/lib/actions/ventas.ts`
  - añadida validación `validarReferenciaTenant`
  - validación antes de registrar venta, abono, consulta y entrega
  - validación del paciente, sucursal, operativo, proveedor y receta
- `src/lib/actions/seguros.ts`
  - validación de venta antes de guardar reembolso
  - rechazo de venta anulada o ajena al tenant

### Pruebas agregadas
- cobro de venta ajena al tenant
- consulta asociada a un operativo ajeno al tenant
- reembolso con venta ajena al tenant

### Resultado verificado
- 9 archivos de test pasados
- 70 tests pasados
- 0 fallos

---

## Fase 4: validación detallada de caja y operación

### Qué se revisó
- movimientos de caja
- pagos de costos operativos
- idempotencia de reintentos
- validación de saldo y estados de pago
- evitar que el mismo pago se registre dos veces

### Archivos relevantes
- `src/lib/actions/cierre.ts`
- `src/lib/actions/caja.ts`
- `tests/pago-costo-accion.test.ts`
- `tests/caja.test.ts`
- `tests/caja-fuentes.test.ts`

### Resultado verificado
- batería financiera de caja y cierre pasada
- 0 fallos relevantes en los flujos revisados

---

## Fase 5: validación de vouchers y reintentos

### Qué se revisó
- exigir voucher cuando el medio de pago lo requiere
- proteger el mismo cobro de doble envío o reintento
- no aceptar efectivo como tarjeta ni viceversa
- persistir el número de voucher mientras el flujo espera confirmación

### Archivos relevantes
- `src/lib/voucher.ts`
- `src/lib/actions/ventas.ts`
- `tests/voucher-acciones.test.ts`
- `tests/voucher.test.ts`

### Resultado verificado
- validación del voucher en servidor funcionando
- idempotencia por operación mantenida
- 0 fallos en la batería de voucher

---

## Fase 6: reembolsos, documentos y idempotencia

### Qué se revisó
- control de la venta asociada al reembolso
- validación de entidad de reembolso
- fecha del documento de reembolso
- lectura del expediente y no mezcla de datos ajenos al tenant

### Archivos relevantes
- `src/lib/actions/seguros.ts`
- `src/lib/fecha-documentos.ts`
- `tests/seguros.test.ts`
- `tests/reembolso-fecha.test.ts`
- `tests/reembolso.test.ts`

### Resultado verificado
- 2 archivos de test pasados
- 29 tests pasados
- 0 fallos

### Hallazgo importante
Se confirmó que el riesgo real era la validación de pertenencia de la venta, no el mecanismo de fecha o entidad en sí. Una vez bloqueada la venta ajena al tenant, el flujo de reembolso quedó consistente y seguro.

---

## Fase 7: cierre final de seguridad

### Entorno de validación utilizado
Se levantó una instancia local equivalente de Supabase para ejecutar pruebas reales sobre la lógica del sistema, sin contacto con la base productiva.

### Archivos y configuración de entorno
- `.env.test.local`
- `supabase/config.toml`
- `npm run supabase:start`

### Batería ejecutada y verificada
```bash
cd /home/alxdrf/Escritorio/optica/optica && npx vitest run tests/session-security.test.ts tests/tenant-isolation.test.ts tests/permisos-rol.test.ts tests/mercadopago-sync.test.ts tests/mercadopago-lectura.test.ts tests/mercadopago-archivo.test.ts tests/mercadopago-confirmacion.test.ts tests/mercadopago-saldo.test.ts tests/pago-costo-accion.test.ts tests/voucher-acciones.test.ts tests/seguros.test.ts tests/reembolso-fecha.test.ts
```

### Resultado verificado
- 12 archivos de test pasados
- 92 tests pasados
- 0 fallos

### Conclusión final
No se encontró una violación crítica residual en los flujos revisados. El riesgo material más importante detectado fue la falta de validación de pertenencia del tenant en acciones financieras, y ese punto quedó corregido con hardening específico y validado por pruebas ejecutadas.

---

## Hallazgos de seguridad y riesgos mitigados

### Riesgos mitigados
- cross-tenant en ventas y abonos
- cross-tenant en consultas asociadas a operativos
- cross-tenant en reembolsos
- duplicación de pagos por reintento o doble envío
- manipulación de referencias por IDs ajenos al tenant
- sincronización insegura de pagos externos
- acceso a acciones protegidas sin autorización o con roles equivocados

### Riesgo residual
El riesgo residual más probable ya no es de seguridad “crítica” del tipo de acceso cruzado o manipulación de fondos, sino de continuidad operacional y validación de procesos manuales del negocio. En otras palabras: la aplicación quedó en una posición mucho más segura para los peligros clásicos de este tipo de sistema, pero siempre queda recomendable seguir revisando cambios de negocio y controles de auditoría en producción.

---

## Principios aplicados durante todo el proceso
- no se tocaron datos reales ni la base productiva
- las pruebas se ejecutaron contra una base local equivalente
- la validación fue basada en comportamiento real, no en suposiciones
- se priorizaron flujos con impacto financiero y multi-tenant
- se reforzó la capa de servidor con validación explícita de pertenencia
- se dio prioridad a la corrección de fallas reales y verificables antes que a una revisión superficial

---

## Recomendación final de versionado
Se recomienda dejar este documento como parte del historial del repositorio y hacer commit con un mensaje claro, por ejemplo:

- `security: reforzar tenant validation y validar flujos críticos`
- `security: cerrar fase de validación y hardening financiero`

No deben incluirse secretos, tokens, URLs reales del entorno productivo ni datos sensibles en el historial del repositorio.

## Estado general
La base de seguridad del proyecto quedó validada en las capas críticas de:
- sesión y autorización
- permisos por rol
- aislamiento multi-tenant
- sincronización de pagos
- caja y costos operativos
- reembolsos y vouchers

Esto deja un estado de seguridad apropiado para continuar con la siguiente etapa del proyecto, con la confianza de que los riesgos principales revisados fueron corregidos y verificados.
