#!/usr/bin/env bash
# Runs the UI suite repeatedly under CPU pressure similar to a CI runner, and fails if any run fails.
# Usage: bash work/005-flaky-ui-waits/repro.sh [runs] [cpus]
# Pressure: the suite is pinned to a few CPUs, and the integration suite runs alongside it on the
# same CPUs, as on a 4-vCPU runner where other work competes for time.
set -u
runs="${1:-30}"; cpus="${2:-0,1}"; failed=0
for i in $(seq 1 "$runs"); do
  taskset -c "$cpus" bun run test:integration > /dev/null 2>&1 &
  load=$!
  # Through the package script, as CI and the deploy run it.
  out="$(taskset -c "$cpus" bun run test:ui 2>&1)"
  kill "$load" 2> /dev/null; wait "$load" 2> /dev/null
  summary="$(printf '%s\n' "$out" | grep -E '^ *[0-9]+ fail' | tr -d ' ')"
  if [ "$summary" != "0fail" ]; then
    failed=$((failed + 1))
    printf 'run %s: %s\n' "$i" "$(printf '%s\n' "$out" | grep -E '^\(fail\)' | sed 's/ \[.*//' | sort -u | tr '\n' ';')"
  fi
done
echo "UI suite under load: $failed of $runs runs failed"
[ "$failed" -eq 0 ]
