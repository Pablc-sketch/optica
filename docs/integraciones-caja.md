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

No hay emisión implementada ni activada: falta cuenta y configuración del
emisor. El enlace en la aplicación lleva a requisitos del proveedor, no
emite documentos. Antes de desarrollar emisión, confirmar documentación
REST, folios, reglas para vouchers y no duplicar documentos tributarios.

Fuentes verificadas el 30 de octubre de 2026:
https://www.simpleapi.cl/Productos/SimpleAPI
https://www.simpleapi.cl/Precios
https://www.fintoc.com/cl/producto/connections
