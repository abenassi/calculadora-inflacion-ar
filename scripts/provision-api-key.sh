#!/usr/bin/env bash
#
# Aprovisiona la API key dedicada de este sitio contra Argentina Data MCP.
#
# Idempotente: si el archivo de secreto ya existe, no hace nada.
# La key nunca se imprime por stdout ni se escribe en el repo.
#
#   - Se genera local (adm_ + 48 hex, mismo formato que generateApiKey()).
#   - Se guarda en ~/.secrets/calculadora-inflacion.env con permisos 600.
#   - Se inserta en la tabla `users` de argentina_data como usuario de sistema,
#     para que quede filtrable de las métricas de usuarios reales
#     (provider='system'), igual que la cuenta de tests automatizados.
#   - release_channel='stable': el sitio solo puede depender de tools estables.
#
set -euo pipefail

KEYFILE="${HOME}/.secrets/calculadora-inflacion.env"
EMAIL='calculadora@argentinadata.mymcps.dev'

if [ -f "$KEYFILE" ]; then
  echo "Ya existe ${KEYFILE} — no se pisa. Nada que hacer."
  exit 0
fi

umask 077
KEY="adm_$(python -c 'import secrets; print(secrets.token_hex(24))')"
printf 'ARGENTINA_DATA_API_KEY=%s\n' "$KEY" > "$KEYFILE"
chmod 600 "$KEYFILE"

cd /tmp
"${HOME}/bin/argdata-db" "
INSERT INTO users (email, name, provider, provider_id, api_key, tier, release_channel)
VALUES ('${EMAIL}', 'Calculadora de Inflacion (sitio publico)', 'system',
        'calculadora-inflacion-ar', '${KEY}', 'unlimited', 'stable')
ON CONFLICT (email) DO UPDATE
  SET api_key = EXCLUDED.api_key,
      tier = EXCLUDED.tier,
      release_channel = EXCLUDED.release_channel
RETURNING email, name, tier, release_channel;"

echo "Key guardada en ${KEYFILE}"
