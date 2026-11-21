#!/usr/bin/env bash
# Pruebas de base de datos con datos ficticios, en un Postgres local:
#   1. rehace la base desde todas las migraciones (tests/db/rehacer.sh),
#   2. pruebas-agenda-whatsapp.sql (inscritos, bandeja, permisos, aislamiento, tope IA),
#   3. dos inscripciones simultáneas de la misma persona: queda una sola,
#   4. pruebas-whatsapp-sugerencias.sql y dos mensajes simultáneos (una sugerencia).
# Uso: tests/db/probar.sh [puerto] [carpeta-del-socket]
set -euo pipefail
PUERTO="${1:-54329}"; CARPETA="${2:-/var/tmp/pgtest}"
cd "$(dirname "$0")/../.."
P="psql -h $CARPETA -p $PUERTO -U postgres -d lentia_test -q"

tests/db/rehacer.sh "$PUERTO" "$CARPETA" | grep -v NOTICE
salida=$($P -f tests/db/pruebas-agenda-whatsapp.sql 2>&1 | sed 's/^psql:[^:]*:[0-9]*: //')
echo "$salida" | grep -E "OK|FALLO|ERROR" | sed 's/^NOTICE:  //'
if echo "$salida" | grep -qE "FALLO|ERROR"; then echo "✗ Fallaron pruebas de base de datos"; exit 1; fi

# Dos personas inscriben a la vez a la misma persona (mismo nombre y
# teléfono) en el mismo operativo: debe quedar una sola inscripción.
inscribir() {
  cat <<SQL
begin;
insert into public.inscritos_operativo (tenant_id, operativo_id, nombre, telefono) values
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000001a1', '$1', '56900000777');
select pg_sleep($2);
commit;
SQL
}
inscribir "Persona Repetida" 2 | $P > /tmp/lentia-w1.log 2>&1 &
sleep 0.5
inscribir "persona repetida" 0 | $P > /tmp/lentia-w2.log 2>&1 || true
wait
n=$($P -At -c "select count(*) from public.inscritos_operativo where telefono = '56900000777' and estado <> 'cancelado'")
if [ "$n" = "1" ] && grep -q "duplicate key" /tmp/lentia-w2.log; then
  echo "OK  Dos inscripciones simultáneas de la misma persona: quedó una sola"
else
  echo "✗ Simultáneo: quedaron $n inscripciones"; cat /tmp/lentia-w1.log /tmp/lentia-w2.log; exit 1
fi
# Sugerencias de WhatsApp (coexistencia).
salida=$($P -f tests/db/pruebas-whatsapp-sugerencias.sql 2>&1 | sed 's/^psql:[^:]*:[0-9]*: //')
echo "$salida" | grep -E "OK|FALLO|ERROR" | sed 's/^NOTICE:  //'
if echo "$salida" | grep -qE "FALLO|ERROR"; then echo "✗ Fallaron pruebas de sugerencias"; exit 1; fi

# Dos mensajes distintos del mismo teléfono para la misma sede llegan a la
# vez (Meta puede entregar en paralelo): debe quedar UNA sugerencia.
llega() {
  cat <<SQL
begin;
select public.registrar_mensaje_whatsapp('7000000001', '56933330001', null, '$1', 'entrante', 'Labrador', now(),
  '{"operativo_id": "00000000-0000-0000-0000-0000000002c1", "nombre": "Simultánea", "nombre_origen": "perfil"}');
select pg_sleep($2);
commit;
SQL
}
llega wamid.sim1 2 | $P -At > /tmp/lentia-s1.log 2>&1 &
sleep 0.5
llega wamid.sim2 0 | $P -At > /tmp/lentia-s2.log 2>&1
wait
n=$($P -At -c "select count(*) from public.whatsapp_sugerencias where telefono = '56933330001' and estado = 'pendiente'")
m=$($P -At -c "select count(*) from public.whatsapp_mensajes where telefono = '56933330001'")
if [ "$n" = "1" ] && [ "$m" = "2" ]; then
  echo "OK  Dos mensajes simultáneos del mismo teléfono y sede: dos mensajes guardados, una sola sugerencia"
else
  echo "✗ Simultáneo: $n sugerencias, $m mensajes"; cat /tmp/lentia-s1.log /tmp/lentia-s2.log; exit 1
fi
echo "✓ Todas las pruebas de base de datos pasaron"
