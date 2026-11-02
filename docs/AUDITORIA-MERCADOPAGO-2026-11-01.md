# Auditoría de asociación de vouchers y pacientes

Alcance: integración de Mercado Pago de Óptica Global, sus abonos y comprobantes.

## Hallazgos y correcciones

1. **Alto: una asociación calculada podía trasladarse.** Quitar la operación
   de un abono y ponerla en otro con igual importe y medio cambiaba el paciente
   mostrado sin un acto de confirmación. Se sustituye por una asociación
   persistente, única, con identidad cotejada y actor. Se bloquea cambiar o
   borrar el abono confirmado y cambiar el paciente de su compra.
2. **Alto: pago acreditado no equivale a paciente identificado.** El ID de
   operación acredita el pago de la cuenta del comercio; no prueba el paciente
   beneficiario ni la identidad física del titular de la tarjeta. Se elimina
   la confirmación implícita. Los históricos pasan a candidatos pendientes de
   cotejo del original, nombre y RUT, sin modificar caja ni inventar pruebas.
3. **Medio: duplicados eran avisos, no prohibiciones.** La aplicación detectaba
   un número repetido, pero no impedía guardarlo dos veces. Una reserva privada
   con clave única por óptica y operación protege las escrituras concurrentes.
4. **Medio: faltaba cotejar el día del pago y la pantalla mostrada.** La
   confirmación exige misma fecha en Chile y verifica que compra, paciente,
   nombre, RUT, importe, medio y fecha siguen siendo los mostrados al operador.
5. **Medio: una respuesta más antigua podía sustituir estados nuevos.** El
   archivo rechaza cambios de titular y descarta snapshots de versión anterior,
   evitando reactivar por ese camino un pago devuelto.

## Qué se comprobó

- Sin duplicados reales de voucher en Óptica Global al inicio de la auditoría.
- Dos coincidencias de operaciones existentes; no se infiere ni se confirma
  quién pagó físicamente a partir de ellas.
- Pruebas transaccionales con rollback: reutilización, cambio de día,
  confirmación obsoleta, actor ajeno, idempotencia, edición/borrado del abono,
  cambio de paciente, modificación de ficha, devolución, snapshot antiguo,
  ejecuciones simultáneas, aislamiento por óptica y permisos de RPC/tablas.
- Pruebas unitarias de la acción: administrador con suscripción, óptica y actor
  desde sesión, transcripción exacta, cotejo explícito y rechazo de errores.

## Límite que no se presenta como resuelto por software

Ni un voucher ni una coincidencia de importe certifican la identidad de una
persona. La compra puede haber sido pagada por un familiar. Para las
operaciones de la máquina sin referencia de compra enviada desde Lentia,
el cotejo humano del original es necesario. Incluso una confirmación humana
puede ser errónea: estas protecciones evitan reutilización y cambios
silenciosos, pero no prometen riesgo cero ni autenticación del titular.

El siguiente avance para vincular pagos sin ese paso sería originar el cobro
desde una compra seleccionada en Lentia con referencia única, verificando
esa referencia contra la respuesta del proveedor. Eso tampoco sustituye una
verificación de identidad física si el negocio la requiere.
