#!/usr/bin/env bash
# Quick health check after deploy.
# Uso: bash scripts/smoke-test.sh <BASE_URL>
# Ejemplo: bash scripts/smoke-test.sh https://restaurante.example.com

BASE_URL="${1:-http://localhost:3000}"
FAILED=0

if [[ "$BASE_URL" == "--help" || "$BASE_URL" == "-h" ]]; then
  echo "Uso: bash scripts/smoke-test.sh <BASE_URL>"
  echo "Ejemplo: bash scripts/smoke-test.sh https://restaurante.example.com"
  exit 0
fi

echo "=== Smoke test → ${BASE_URL}  [$(date -u +%FT%TZ)] ==="
echo ""

check() {
  local name="$1" url="$2" want_pattern="$3" grep_str="${4:-}"
  local t0 elapsed tmpfile body status ok=0

  t0=$(date +%s 2>/dev/null || echo 0)
  tmpfile=$(mktemp)
  status=$(curl -s --max-time 15 -o "${tmpfile}" -w '%{http_code}' "${url}" 2>/dev/null) || status="000"
  body=$(cat "${tmpfile}" 2>/dev/null || true)
  rm -f "${tmpfile}"
  elapsed=$(( $(date +%s 2>/dev/null || echo 0) - t0 ))

  IFS='|' read -ra codes <<< "${want_pattern}"
  for code in "${codes[@]}"; do
    [[ "${status}" == "${code}" ]] && ok=1 && break
  done

  if [[ ${ok} -eq 1 ]]; then
    printf "  ✓  %-40s  HTTP %-3s  (%ds)\n" "${name}" "${status}" "${elapsed}"
  else
    printf "  ✗  %-40s  HTTP %-3s  (esperado: %s, %ds)\n" "${name}" "${status}" "${want_pattern}" "${elapsed}"
    FAILED=1
  fi

  if [[ -n "${grep_str}" && ${ok} -eq 1 ]]; then
    if printf '%s' "${body}" | grep -q "${grep_str}"; then
      printf "       ✓ body contiene '%s'\n" "${grep_str}"
    else
      printf "       ✗ body NO contiene '%s'\n" "${grep_str}"
      FAILED=1
    fi
  fi
}

check "GET /api/health"      "${BASE_URL}/api/health"     "200"     "true"
check "GET /api/menu/today"  "${BASE_URL}/api/menu/today" "200|404"

echo ""
if [[ ${FAILED} -eq 0 ]]; then
  echo "=== ✓ Todos los checks pasaron ==="
  exit 0
else
  echo "=== ✗ Uno o más checks fallaron ==="
  exit 1
fi
