# Cuentas y boletas

## Mercado Pago: lectura de pagos

El adaptador consulta GET /v1/payments/search sin guardar abonos, iniciar
cobros ni transferir fondos. Se muestra en /configuracion/integraciones,
solo para administradores de la organización asociada al token.

Para activar, el titular debe configurar en Vercel, para el entorno deseado:

- MERCADOPAGO_ACCESS_TOKEN: secreto privado de la aplicación de la cuenta empresa.
- MERCADOPAGO_TENANT_ID: identificador de la óptica en Lentia.

No enviar tokens por chat, no usar NEXT_PUBLIC_, no copiar la credencial
de producción al entorno de prueba. El adaptador distingue pendientes,
errores y conexión válida. Los pagos externos no equivalen al saldo bancario
ni se suman a la caja; falta conciliación con referencias únicas antes de
automatizar abonos. Puede mostrar pagos de otros canales de la misma cuenta.

Documentación: https://www.mercadopago.cl/developers/es/reference

## Banco

Falta identificar banco, tipo de cuenta y titular de la óptica. Fintoc
Connections es una alternativa de lectura de movimientos; verificar
compatibilidad y cotización antes de contratar. No se ha contratado ni
activado ninguna conexión bancaria. No confundir su API de pagos con
Connections. Una alternativa sin suscripción es la revisión de cartolas,
todavía no automatizada aquí.

## Boletas

SimpleAPI DTE publica un plan de prueba de 500 peticiones mensuales por
12 meses. Las peticiones no equivalen a documentos. Requiere API Key,
datos tributarios, certificado digital vigente, folios CAF y habilitación
del contribuyente para operar ante el SII. La certificación y el certificado
pueden tener costos adicionales. El plan publicado después de la prueba
parte en 5 UF + IVA anuales para 10.000 peticiones mensuales.

La conexión al plan se configura en Vercel, solo en producción:

- SIMPLEAPI_API_KEY: clave privada del proveedor, tipo Secret, sin NEXT_PUBLIC_.
- SIMPLEAPI_TENANT_ID: identificador de la óptica propietaria de esa cuenta.

Configuración → Cuentas y boletas permite al administrador comprobar la
conexión y consultar uso y cupo del producto SimpleAPI. Se usa únicamente
GET https://api.simpleapi.cl/api/v1/Suscripcion/status, con Authorization
en el encabezado. La consulta es explícita: abrir la pantalla no llama al
proveedor. No se devuelven claves, respaldos ni el cuerpo completo al cliente.
La sesión determina óptica, rol y suscripción; otra óptica no puede usar
esta credencial. No copiar el secreto de producción a vistas previas.

La emisión aún no está implementada ni activada. Faltan certificado .pfx,
su contraseña, CAF, datos del emisor y verificar habilitación. Antes de
desarrollarla hay que definir reserva de folios y reintentos para evitar
duplicados, distinguir certificación de producción y revisar reglas de
vouchers. La comprobación de conexión no acredita habilitación ante el SII.

REST y esquema de respuesta consultados el 30 de octubre de 2026:
https://documentacion.simpleapi.cl/
https://api.simpleapi.cl/swagger/index.html

Fuentes verificadas el 30 de octubre de 2026:
https://www.simpleapi.cl/Productos/SimpleAPI
https://www.simpleapi.cl/Precios
https://www.fintoc.com/cl/producto/connections
