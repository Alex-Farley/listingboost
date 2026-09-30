#!/usr/bin/env bash
# Shared helpers for scripts/sdlc and the git hooks. Sourced, never executed directly.
# Config is parsed as DATA (KEY="value" lines, fixed allowlist), never sourced, so a config file
# cannot run code or set bypass flags. Bypass flags come from the environment only.
# Works with bash 3.2 (macOS default) and later.

SDLC_KEYS="VERIFY_CMD PROTECTED_PATHS VERIFY_ON_COMMIT DEFAULT_BRANCH CLIENT_CODE AI_USE_APPROVAL REQUIRE_SIGNED_APPROVALS SECRETS_IGNORE_PATHS TDD_LOG_OUTPUT"

# Paths that are always protected, whatever the config says. People change these, deliberately.
SDLC_ALWAYS_PROTECTED=".sdlc/ .claude/ .codex/ .gemini/ .agents/ .github/ scripts/sdlc scripts/github-protect.sh scripts/ux-check.mjs CLAUDE.md AGENTS.md REVIEW.md maintain/runbooks/ evals/run.sh"

# git diff that cannot be fooled by .gitattributes (-diff, textconv, external diff drivers).
sdlc_diff() { git -c core.quotePath=false diff --text --no-textconv --no-ext-diff "$@"; }

# sdlc_config_text: print the config to trust.
#   SDLC_CONFIG_FILE set (CI passes the base-branch copy) -> that file
#   otherwise the committed copy (HEAD), falling back to the working tree before the first commit.
# Reading HEAD means editing .sdlc/config in the working tree cannot switch off the checks.
sdlc_config_text() {
  if [ -n "${SDLC_CONFIG_FILE:-}" ]; then cat "$SDLC_CONFIG_FILE" 2>/dev/null; return; fi
  git show HEAD:.sdlc/config 2>/dev/null || cat .sdlc/config 2>/dev/null || true
}

# Locked tests: union of the trusted list and the list being committed, so a test locked earlier
# in the same PR is still protected. Lines are "path" or "path<TAB>blob-sha".
sdlc_locked_text() {
  {
    if [ -n "${SDLC_LOCKED_FILE:-}" ]; then cat "$SDLC_LOCKED_FILE" 2>/dev/null
    else git show HEAD:.sdlc/locked-tests 2>/dev/null || true; fi
    git show :.sdlc/locked-tests 2>/dev/null || true
  } | tr -d '\r' | awk 'NF' | sort -u
}

# shellcheck disable=SC2034  # variables are used by the scripts that source this file
sdlc_load_config() {
  VERIFY_CMD=""; PROTECTED_PATHS=""; VERIFY_ON_COMMIT="0"; DEFAULT_BRANCH="main"
  CLIENT_CODE="0"; AI_USE_APPROVAL=""; REQUIRE_SIGNED_APPROVALS="0"; SECRETS_IGNORE_PATHS=""; TDD_LOG_OUTPUT="tail"
  local line key val
  local tail='[[:space:]]*(#.*)?$'
  local re_dq="^([A-Z_]+)=\"(.*)\"$tail" re_sq="^([A-Z_]+)='(.*)'$tail" re_bare="^([A-Z_]+)=([^[:space:]\"'#]*)$tail"
  while IFS= read -r line || [ -n "$line" ]; do
    line="${line%$'\r'}"
    [[ "$line" =~ ^[[:space:]]*(#.*)?$ ]] && continue
    if [[ "$line" =~ $re_dq ]] || [[ "$line" =~ $re_sq ]] || [[ "$line" =~ $re_bare ]]; then
      key="${BASH_REMATCH[1]}"; val="${BASH_REMATCH[2]}"
      case " $SDLC_KEYS " in *" $key "*) printf -v "$key" '%s' "$val";; *) echo "sdlc: ignoring unknown config key $key" >&2;; esac
    else
      echo "sdlc: ignoring unparseable config line: $line" >&2
    fi
  done <<< "$(sdlc_config_text)"
}

# Is a path protected? (always-protected list, config list, and any .gitattributes at any depth)
# Compared case-insensitively: on macOS and Windows ".SDLC/hooks/x" IS ".sdlc/hooks/x".
# An entry ending in / protects a folder; any other entry protects that exact path, or a folder of
# that name (so "scripts/sdlc" does not also protect "scripts/sdlc-helper.sh").
sdlc_lc() { printf '%s' "$1" | tr '[:upper:]' '[:lower:]'; }
sdlc_is_protected() {
  local path p lp
  path="$(sdlc_lc "$1")"
  case "$path" in .gitattributes|*/.gitattributes) return 0;; esac
  set -f
  for p in $SDLC_ALWAYS_PROTECTED $PROTECTED_PATHS; do
    lp="$(sdlc_lc "$p")"
    case "$lp" in
      */) case "$path" in "$lp"*) set +f; return 0;; esac;;
      *)  case "$path" in "$lp"|"$lp"/*) set +f; return 0;; esac;;
    esac
  done
  set +f
  return 1
}

sdlc_sha256() { if command -v sha256sum >/dev/null; then sha256sum | cut -d' ' -f1; else shasum -a 256 | cut -d' ' -f1; fi; }

# Legacy (v4.0) approval hash: everything after the front matter, line endings normalised.
# Still accepted for approvals that were made before 4.1 and have not changed since.
sdlc_body_hash() { tr -d '\r' | awk 'NR==1&&/^---[[:space:]]*$/{f=1;next} f==1&&/^---[[:space:]]*$/{f=2;next} f==2{print}' | sdlc_sha256; }

# Approval hash (v4.1+): bound to the file's path, and covers the front matter as well as the body
# (all fields except status and approved_sha256 themselves), so an approval cannot be copied, moved
# or symlinked to another work item, and fields such as risk: cannot change after approval.
#   sdlc_approval_hash <repo-relative path>   (content on stdin)
sdlc_approval_hash() {
  { printf 'sdlc-approval-v2\npath: %s\n' "$1"
    tr -d '\r' | awk '
      NR==1&&/^---[[:space:]]*$/{f=1;next}
      f==1&&/^---[[:space:]]*$/{f=2;print "---";next}
      f==1&&/^(status|approved_sha256):/{next}
      {print}'
  } | sdlc_sha256
}

# Read one front matter field. Handles quoted values and trailing comments; strips CR.
sdlc_fm_get() {
  tr -d '\r' < "$1" | awk -v k="$2" '
    NR==1&&/^---/{f=1;next} f&&/^---/{exit}
    f&&index($0,k":")==1 {
      v=substr($0,length(k)+2); sub(/^[ \t]+/,"",v)
      if (v ~ /^"/) { v=substr(v,2); sub(/".*$/,"",v) }
      else if (v ~ /^'"'"'/) { v=substr(v,2); sub(/'"'"'.*$/,"",v) }
      else { sub(/[ \t]+#.*$/,"",v); sub(/[ \t]+$/,"",v) }
      print v; exit }'
}

# Upstream artifact for each gate (the approval of X also pins the hash of its upstream).
sdlc_upstream_of() {
  case "$1" in spec) echo intent;; plan) echo spec;; review) echo plan;; *) echo "";; esac
}
