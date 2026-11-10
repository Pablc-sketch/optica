#!/usr/bin/env bash
# Corre todas las pruebas de base de datos con datos ficticios:
#   1. rehace la base local desde las migraciones,
#   2. pruebas-reservas.sql (configuración, reservas, costos, roles, aislamiento),
#   3. dos guardados simultáneos que se disputan a la misma persona.
# Uso: tests/db/probar.sh [puerto] [carpeta-del-socket]
set -euo pipefail
PUERTO="${1:-54329}"; CARPETA="${2:-/var/tmp/pgtest}"
cd "$(dirname "$0")/../.."
P="psql -h $CARPETA -p $PUERTO -U postgres -d lentia_test -q"

tests/db/rehacer.sh "$PUERTO" "$CARPETA" | grep -v NOTICE
salida=$($P -f tests/db/pruebas-reservas.sql 2>&1 | sed 's/^psql:[^:]*:[0-9]*: //')
echo "$salida" | grep -E "OK|FALLO|ERROR" | sed 's/^NOTICE:  //'
if echo "$salida" | grep -qE "FALLO|ERROR"; then echo "✗ Fallaron pruebas de base de datos"; exit 1; fi

# Guardados simultáneos: la sesión 1 reserva y espera 2 s antes de confirmar;
# la sesión 2 intenta lo mismo mientras tanto. Debe quedar uno solo.
guardar() {
  cat <<SQL
begin;
set role authenticated;
select pruebas.como('00000000-0000-0000-0000-0000000000a1');
select public.guardar_operativo_equipo('{"id": "$1", "nombre": "$2", "fecha": "2030-08-01",
  "personas": [{"id": "00000000-0000-0000-0000-0000000001a5", "funcion": "vendedor"}], "kits": ["00000000-0000-0000-0000-0000000003a3"]}');
select pg_sleep($3);
commit;
SQL
}
guardar 00000000-0000-0000-0000-0000000005a1 "Simultáneo 1" 2 | $P > /tmp/lentia-s1.log 2>&1 &
sleep 0.5
guardar 00000000-0000-0000-0000-0000000005a2 "Simultáneo 2" 0 | $P > /tmp/lentia-s2.log 2>&1 || true
wait
n=$($P -At -c "select count(*) from public.operativos where id in ('00000000-0000-0000-0000-0000000005a1','00000000-0000-0000-0000-0000000005a2')")
mensaje=$(grep -o "Vendedora Dos ya está reservado en «Simultáneo 1»[^\"]*" /tmp/lentia-s2.log || true)
if [ "$n" = "1" ] && [ -n "$mensaje" ]; then
  echo "OK  Dos guardados simultáneos: se guardó uno y el otro respondió «$mensaje»"
else
  echo "✗ Guardados simultáneos: quedaron $n operativos"; cat /tmp/lentia-s2.log; exit 1
fi
echo "✓ Todas las pruebas de base de datos pasaron"
