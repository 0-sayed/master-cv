#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../../.."
mode="${1:-}"
archive=/mnt/storage/master-cv-design-archive/ui-audit/personal-career-benchmark
finalists=openai/gpt-6-luna@none,openai/gpt-6-luna@low,openai/gpt-6.1-terra@medium
checkpoint=0
provider_limits=(--openai-concurrency "${BENCHMARK_OPENAI_CONCURRENCY:-8}" --together-concurrency "${BENCHMARK_TOGETHER_CONCURRENCY:-8}" --max-unverified "${BENCHMARK_MAX_UNVERIFIED:-16}")
common=(--study tasks-v1 --variants "$finalists" --session-concurrency "${BENCHMARK_SESSION_CONCURRENCY:-16}" "${provider_limits[@]}")
case "$mode" in
  dry-run|replay|paid-smoke)
    campaign="$archive/campaign-$(date -u +%Y%m%dT%H%M%SZ)-$mode"
    mkdir -p "$campaign"
    stage=smoke
    ;;
  paid-full|resume)
    campaign=$(realpath "${2:?Supply the existing campaign folder}")
    case "$campaign" in "$archive"/campaign-*) ;; *) echo 'Campaign must remain in the benchmark archive.' >&2; exit 2 ;; esac
    [[ -d "$campaign" ]] || exit 2
    stage=full
    if [[ "$mode" == resume ]]; then stage="${3:?Supply smoke or full}"; fi
    [[ "$stage" == smoke || "$stage" == full ]] || exit 2
    ;;
  *) echo 'Usage: owner-campaign.sh dry-run|replay|paid-smoke APPROVAL|paid-full CAMPAIGN|resume CAMPAIGN smoke|full' >&2; exit 2 ;;
esac
if [[ "$stage" == full ]]; then
  if [[ -f "$campaign/full-variants.txt" ]]; then
    IFS= read -r full_variants < "$campaign/full-variants.txt"
  else
    full_variants="${BENCHMARK_FULL_VARIANTS:-$finalists}"
    printf '%s\n' "$full_variants" > "$campaign/full-variants.txt"
  fi
  common=(--study tasks-v1 --variants "$full_variants" --session-concurrency "${BENCHMARK_SESSION_CONCURRENCY:-16}" "${provider_limits[@]}")
fi
printf 'Campaign artifacts: %s\n' "$campaign"
trap 'printf "Exit %s. Partial results remain in %s\n" "$?" "$campaign" >&2' EXIT
if [[ "$mode" == paid-* || "$mode" == resume ]]; then
  : "${OPENROUTER_BENCHMARK_KEY:?Set the benchmark key in the process}"
  if [[ "$mode" == paid-smoke ]]; then
    approval=$(realpath "${2:?Supply the owner-approved Arabic review}")
    case "$approval" in "$archive"/*.json) ;; *) echo 'Approval must be a JSON file in the benchmark archive.' >&2; exit 2 ;; esac
    printf '%s\n' "$approval" > "$campaign/approval-path.txt"
  else
    IFS= read -r approval < "$campaign/approval-path.txt"
  fi
  common+=(--credential-source process --approval-file "$approval")
elif [[ "$mode" == replay ]]; then common+=(--fake)
else common+=(--dry-run)
fi
run() { pnpm --filter @reactive-resume/tooling exec node --import tsx evaluations/review/cli.ts "${common[@]}" "$@"; }
pointer() {
  node --input-type=module - "$1/session.json" "$mode" <<'NODE'
import { readFileSync } from 'node:fs';
const p = JSON.parse(readFileSync(process.argv[2], 'utf8'));
if (p.mode !== (process.argv[3] === 'replay' ? 'fake' : 'live')) throw new Error('Campaign mode mismatch');
process.stdout.write(p.resultsFile);
NODE
}
if [[ "$stage" == smoke ]]; then
  extra=()
  if [[ "$mode" == resume ]]; then extra=(--resume "$(dirname "$(pointer "$campaign/smoke")")" --recover-systemic); fi
  smoke_router=10; smoke_openai=10
  if [[ "$mode" == replay ]]; then smoke_router=100; smoke_openai=100; fi
  run --stage smoke --runs 1 --budget-usd "$smoke_router" --openai-budget-usd "$smoke_openai" "${extra[@]}" -o "$campaign/smoke" > "$campaign/smoke.log" 2>&1
  if [[ "$mode" == paid-smoke || "$mode" == resume ]]; then
    checkpoint=1
  fi
fi
smoke=()
if [[ "$mode" != dry-run ]]; then smoke=(--smoke-file "$(pointer "$campaign/smoke")"); fi
router_cap="${BENCHMARK_ROUTER_CAP_USD:-40}"
openai_cap="${BENCHMARK_OPENAI_CAP_USD:-15}"
if [[ "$mode" == replay ]]; then router_cap=100; openai_cap=100; fi
run --stage full --runs 3 "${smoke[@]}" --dry-run --budget-usd "$router_cap" --openai-budget-usd "$openai_cap" -o "$campaign/full-forecast" > "$campaign/full-forecast.log" 2>&1
if [[ "$mode" == dry-run ]]; then exit 0; fi
if [[ "$checkpoint" == 1 ]]; then
  echo 'STOP: inspect smoke and full-forecast/forecast.json. Only an explicit paid-full command authorizes full.'
  exit 0
fi
if [[ "$mode" != replay ]]; then
  node --input-type=module - "$campaign/full-forecast/forecast.json" <<'NODE'
import { readFileSync } from 'node:fs';
const f = JSON.parse(readFileSync(process.argv[2], 'utf8'));
if (!f.withinBudget || f.forecastStatus !== 'live-smoke-calibrated') throw new Error('FULL_NOT_AFFORDABLE_OR_UNCALIBRATED');
NODE
fi
extra=()
if [[ "$mode" == resume ]]; then extra=(--resume "$(dirname "$(pointer "$campaign/full")")" --recover-systemic); fi
# Scripted replay prices cannot authorize paid spending.
if [[ "$mode" == replay ]]; then router_cap=100; openai_cap=100; fi
run --stage full --runs 3 "${smoke[@]}" "${extra[@]}" --budget-usd "$router_cap" --openai-budget-usd "$openai_cap" -o "$campaign/full" > "$campaign/full.log" 2>&1
