#!/usr/bin/env bash
# Rehace la base local de pruebas desde cero: imitación de Supabase + todas
# las migraciones del repositorio. Uso: tests/db/rehacer.sh [puerto] [carpeta]
set -euo pipefail
PUERTO="${1:-54329}"; CARPETA="${2:-/var/tmp/pgtest}"
P="psql -h $CARPETA -p $PUERTO -U postgres -q -v ON_ERROR_STOP=1"
cd "$(dirname "$0")/../.."
$P -c "drop database if exists lentia_test" -c "create database lentia_test"
$P -d lentia_test -f tests/db/supabase-shim.sql
for f in supabase/migrations/*.sql; do
  case "$f" in
    *000044_*) $P -d lentia_test -f tests/db/seed-optica-global.sql ;;
    # Solo programa la sincronización con pg_cron/pg_net/Vault, que existen
    # en Supabase y no en un Postgres local. No crea tablas ni funciones.
    *_mercadopago_sincronizacion_programada.sql) echo "Omitida (pg_cron): $f"; continue ;;
  esac
  if ! $P -d lentia_test -f "$f" > /tmp/lentia-migracion.log 2>&1; then
    echo "Falló $f"; tail -5 /tmp/lentia-migracion.log; exit 1
  fi
done
echo "Base lentia_test lista ($(ls supabase/migrations/*.sql | wc -l) migraciones)"
