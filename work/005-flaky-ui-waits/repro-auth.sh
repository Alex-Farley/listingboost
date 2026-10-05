#!/usr/bin/env bash
# Faster reproduction: the sign-in UI tests on one CPU shared with the integration suite.
# Before the fix they failed 10 of 10 times. Usage: bash work/005-flaky-ui-waits/repro-auth.sh [runs]
set -u
runs="${1:-10}"; failed=0
for i in $(seq 1 "$runs"); do
  taskset -c 0 bun run test:integration > /dev/null 2>&1 &
  load=$!
  out="$(taskset -c 0 bun test --timeout 30000 tests/ui/auth.test.tsx 2>&1)"
  kill "$load" 2> /dev/null; wait "$load" 2> /dev/null
  if printf '%s\n' "$out" | grep -q '^(fail)'; then
    failed=$((failed + 1))
    printf 'run %s: %s\n' "$i" "$(printf '%s\n' "$out" | grep -E '^\(fail\)' | sed 's/ \[.*//' | tr '\n' ';')"
  fi
done
echo "sign-in UI tests under load on one CPU: $failed of $runs runs failed"
[ "$failed" -eq 0 ]
