#!/usr/bin/env bash
# Pruebas de base de datos con datos ficticios, en un Postgres local:
#   1. rehace la base desde todas las migraciones (tests/db/rehacer.sh),
#   2. pruebas-agenda-whatsapp.sql (inscritos, bandeja, permisos, aislamiento, tope IA),
#   3. dos inscripciones simultáneas de la misma persona: queda una sola.
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
echo "✓ Todas las pruebas de base de datos pasaron"
