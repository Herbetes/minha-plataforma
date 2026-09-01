#!/usr/bin/env bash
# Regenera supabase/schema-completo.sql a partir dos arquivos individuais.
# A ordem abaixo é a ordem de dependência — não mude sem motivo.
set -euo pipefail
cd "$(dirname "$0")/.."

ARQUIVOS=(schema.sql schema-cofre.sql schema-pastas.sql schema-vh.sql schema-vh-contas.sql schema-vh-fechamento.sql schema-radar.sql)

{
  cat <<'CABECALHO'
-- ============================================================================
-- minha-plataforma · SCHEMA COMPLETO
--
-- ESTE É O ÚNICO ARQUIVO QUE VOCÊ PRECISA RODAR.
--
-- Cole tudo no SQL Editor do Supabase e execute. É idempotente: rodar de novo
-- não apaga nada nem quebra nada — pode rodar sempre que eu publicar novidade.
--
-- Gerado a partir dos arquivos individuais, na ordem em que dependem uns dos
-- outros. Não edite este arquivo à mão: edite o original e gere de novo com
--     npm run schema
-- ============================================================================

CABECALHO
  for f in "${ARQUIVOS[@]}"; do
    echo ""
    echo "-- ============================================================================"
    echo "-- origem: supabase/$f"
    echo "-- ============================================================================"
    echo ""
    cat "supabase/$f"
    echo ""
  done
} > supabase/schema-completo.sql

echo "supabase/schema-completo.sql gerado ($(wc -l < supabase/schema-completo.sql) linhas)"
