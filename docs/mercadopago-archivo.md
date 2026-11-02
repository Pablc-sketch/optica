# Archivo interno de Mercado Pago

## Uso

Configuración → Cuentas y boletas → desplegar «Archivo interno de vouchers».
El archivo permite buscar el número de operación completo, consultar todas las
páginas y abrir la compra relacionada. Solo aparece en la óptica configurada.
La comprobación de pagos también queda en el comprobante de compra y pagos,
por abono. Se respeta la opción existente de ocultar vouchers.

Registrar o corregir `numero_voucher` en un abono propone una operación ya
importada, si hay exactamente un abono con ese número, importe, medio de
tarjeta y día en Chile, y una venta vigente. Una coincidencia no confirma al
paciente. El administrador debe cotejar el original, nombre y RUT, y escribir
la operación completa en «Cotejar y confirmar paciente». No se vuelve a sumar
dinero a caja. Los pagos sin referencia de compra generada desde Lentia no
pueden demostrar automáticamente qué paciente fue beneficiario del pago.
Los números cortos de ticket no equivalen al ID de operación de Mercado Pago.
Sin ID completo, no se asocia automáticamente. No se buscan pacientes por
datos del pagador: una persona puede pagar los lentes de otra.

Un voucher completo no puede usarse en dos abonos, también si llegan dos
escrituras simultáneas: una referencia privada única lo reserva. Un vínculo
confirmado queda registrado con óptica, operación, abono, compra, paciente,
nombre y RUT cotejados, importe, medio, fecha y administrador que confirmó.
No se puede trasladar, borrar ni editar el abono confirmado ni cambiar el
paciente de la compra. Cualquier corrección de una confirmación requiere una
revisión específica del original; no hay reasignación automática ni un botón
para sobreescribir el historial. Si cambia el nombre o RUT de la ficha,
se suspende la marca del comprobante y se pide revisar la identidad.

Las devoluciones o contracargos dejan de figurar como pago cotejado. Se
muestra el pendiente en el archivo para revisar el abono y la caja; no se
destruye el respaldo ni se devuelve dinero automáticamente.

## Datos y permisos

- `mercadopago_pagos`: una fila por `(tenant_id, pago_id)`, con datos mínimos.
- `mercadopago_conciliacion`: vista `security_invoker` de candidatos, estados
  y asociaciones confirmadas; distingue pago acreditado de paciente cotejado.
- `mercadopago_vinculos`: registro de confirmación con identidad y actor.
  Los clientes no pueden insertar, modificar ni borrar confirmaciones.
- `mercadopago_privado.referencias`: reserva única de voucher por abono en
  las ópticas conectadas, fuera del esquema expuesto por la API.
- `mercadopago_sync`: titular verificado en `/users/me`, checkpoint y lease.
- Los clientes autenticados solo tienen SELECT sujeto a RLS comercial; no
  pueden insertar operaciones falsas ni ejecutar las funciones de sincronía.
- Los procesos del servidor verifican que la óptica coincide exactamente con
  `MERCADOPAGO_TENANT_ID`. Ningún identificador recibido del cliente decide
  qué óptica usa la credencial. Preview no recibe los secretos de producción.

## Sincronización

Se invoca `POST https://lentiaapp.cl/api/integraciones/mercadopago/sync` con
`Authorization: Bearer <MERCADOPAGO_SYNC_SECRET>`. El secreto no es el token de
Mercado Pago y solo permite iniciar una consulta, sin devolver datos de pacientes.
El endpoint verifica la autorización y no depende de una sesión del navegador.
Un lease de cinco minutos evita ejecuciones simultáneas. Se pagina con límite
100 y rango fijo sobre `date_last_updated`, con solapamiento de un día. La
marca de avance solo cambia después de guardar todas las páginas. Los errores
no borran datos ni adelantan el checkpoint; la siguiente ejecución reintenta.
El límite defensivo de 10.000 resultados por ejecución falla explícitamente
sin avanzar si se supera: en ese caso ampliar a ventanas menores antes de
seguir importando. El Access Token se envía solo al host fijo oficial, sin redirects.

La primera carga recupera hasta 364 días. La API limita búsquedas a los últimos
doce meses; no se promete recuperar tickets anteriores que no ofrezca Mercado
Pago. El archivo conserva lo importado sin borrar al salir de esa ventana.

Producción usa Supabase Cron cada cinco minutos; Vercel Hobby limita sus cron
a una vez al día. Se habilitan `pg_cron` y `pg_net` con la migración correspondiente.
Después de publicar se guarda un secreto aleatorio idéntico en Vercel (tipo
Secret, solo Production) y Vault (`lentia_mercadopago_sync_secret`). No versionar
valores secretos. La programación, ejecutada por postgres, es:

```sql
select cron.schedule('lentia-mercadopago-sync', '*/5 * * * *', $job$
  select net.http_post(
    url := 'https://lentiaapp.cl/api/integraciones/mercadopago/sync',
    headers := jsonb_build_object('Content-Type','application/json',
      'Authorization','Bearer ' || (select decrypted_secret from vault.decrypted_secrets
        where name='lentia_mercadopago_sync_secret')),
    body := '{}'::jsonb, timeout_milliseconds := 240000);
$job$);
```

El secreto queda cifrado en Vault. Se revoca acceso a `net` y a la vista de
secretos para roles públicos/autenticados; las solicitudes en cola no están
disponibles para los clientes de la aplicación. Revisar `mercadopago_sync` y
los estados HTTP de `net._http_response` si la última consulta falla. No registrar
encabezados de autenticación ni el cuerpo completo de respuestas del proveedor.

## Validación

Pruebas unitarias: `mercadopago-archivo.test.ts`, `mercadopago-sync.test.ts`,
`mercadopago-confirmacion.test.ts`.
Pruebas transaccionales: ejecutar `tests/mercadopago-database.sql` dentro de
BEGIN/ROLLBACK. Usa filas existentes solo como referencia y no deja cambios.
Comprueba cotejo previo, fecha del pago, pantallas obsoletas, actor, duplicados,
protección de importe/voucher/paciente/borrado, cambios de identidad, devolución,
respuestas antiguas, leases, RLS y denegación de escrituras/funciones al cliente.

Fuentes consultadas el 1 de noviembre de 2026:
- https://www.mercadopago.cl/developers/es/reference/online-payments/checkout-api-payments/search-payments/get
- https://supabase.com/docs/guides/functions/schedule-functions
- https://supabase.com/docs/guides/database/postgres/row-level-security
- https://vercel.com/docs/cron-jobs/usage-and-pricing
