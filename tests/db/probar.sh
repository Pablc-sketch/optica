#!/usr/bin/env bash
# Pruebas de base de datos con datos ficticios, en un Postgres local:
#   1. rehace la base desde todas las migraciones (tests/db/rehacer.sh),
#   2. pruebas-agenda-whatsapp.sql (cupos, permisos, aislamiento, tope IA),
#   3. dos personas toman al mismo tiempo el último cupo: queda una sola.
# Uso: tests/db/probar.sh [puerto] [carpeta-del-socket]
set -euo pipefail
PUERTO="${1:-54329}"; CARPETA="${2:-/var/tmp/pgtest}"
cd "$(dirname "$0")/../.."
P="psql -h $CARPETA -p $PUERTO -U postgres -d lentia_test -q"

tests/db/rehacer.sh "$PUERTO" "$CARPETA" | grep -v NOTICE
salida=$($P -f tests/db/pruebas-agenda-whatsapp.sql 2>&1 | sed 's/^psql:[^:]*:[0-9]*: //')
echo "$salida" | grep -E "OK|FALLO|ERROR" | sed 's/^NOTICE:  //'
if echo "$salida" | grep -qE "FALLO|ERROR"; then echo "✗ Fallaron pruebas de base de datos"; exit 1; fi

# El operativo «Simultáneo A» tiene un solo bloque con un solo cupo.
agendar() {
  cat <<SQL
begin;
select public.agendar_cita_whatsapp('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000001a6', '2030-05-15', '10:00', '$1', '$2');
select pg_sleep($3);
commit;
SQL
}
agendar "Primera Persona" 56900000101 2 | $P -At > /tmp/lentia-w1.log 2>&1 &
sleep 0.5
agendar "Segunda Persona" 56900000102 0 | $P -At > /tmp/lentia-w2.log 2>&1
wait
n=$($P -At -c "select count(*) from public.citas_operativo where operativo_id = '00000000-0000-0000-0000-0000000001a6' and estado = 'agendada'")
if [ "$n" = "1" ] && grep -q '"ok": true' /tmp/lentia-w1.log && grep -q '"sin_cupo"' /tmp/lentia-w2.log; then
  echo "OK  Dos personas a la vez por el último cupo: una quedó agendada y a la otra se le avisó que se llenó"
else
  echo "✗ Simultáneo: quedaron $n citas"; cat /tmp/lentia-w1.log /tmp/lentia-w2.log; exit 1
fi
echo "✓ Todas las pruebas de base de datos pasaron"
