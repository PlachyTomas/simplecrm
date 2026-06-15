#!/usr/bin/env bash
#
# count_loc.sh — count lines of code across the whole repo.
#
# Source of truth is `git ls-files`, so anything gitignored (logs/,
# node_modules/, build artifacts, caches, .env files) is excluded for
# free. On top of that we skip binary assets (images, fonts) and
# machine-generated lock files, then group the remainder by language.
#
# Usage:
#   scripts/count_loc.sh            # grouped table + grand total
#   scripts/count_loc.sh --files    # also list every counted file with its line count
#
set -euo pipefail

# Run from the repo root regardless of where the script is invoked from.
cd "$(git rev-parse --show-toplevel)"

show_files=0
[[ "${1:-}" == "--files" ]] && show_files=1

# Extensions / exact filenames we treat as code or human-authored config.
# Everything else (png, ttf, woff, lock files, ...) is ignored.
code_extensions="py ts tsx js jsx mjs cjs css scss sass html htm vue svelte \
  sh bash zsh sql dbml yml yaml toml ini cfg env-example mako j2 jinja2 \
  dockerfile xml"
code_filenames="Dockerfile Makefile"

# Lock / generated files to always skip even if their extension matches.
skip_globs="*.lock pnpm-lock.yaml package-lock.json uv.lock poetry.lock"

is_skipped() {
  local f="$1"
  for g in $skip_globs; do
    # shellcheck disable=SC2053
    [[ "$(basename "$f")" == $g ]] && return 0
  done
  return 1
}

lang_of() {
  local f="$1" base ext
  base="$(basename "$f")"
  case "$base" in
    Dockerfile*) echo "Dockerfile"; return ;;
    Makefile)    echo "Makefile";   return ;;
  esac
  ext="${base##*.}"
  case "$ext" in
    py)                 echo "Python" ;;
    ts)                 echo "TypeScript" ;;
    tsx)                echo "TypeScript (TSX)" ;;
    js|mjs|cjs|jsx)     echo "JavaScript" ;;
    vue|svelte)         echo "Vue/Svelte" ;;
    css|scss|sass)      echo "CSS" ;;
    html|htm)           echo "HTML" ;;
    sh|bash|zsh)        echo "Shell" ;;
    sql|dbml)           echo "SQL/DBML" ;;
    yml|yaml)           echo "YAML" ;;
    toml|ini|cfg)       echo "Config (toml/ini)" ;;
    mako|j2|jinja2)     echo "Templates" ;;
    xml)                echo "XML" ;;
    *)                  echo "Other" ;;
  esac
}

# Build a quick lookup of accepted extensions/names.
matches_code() {
  local f="$1" base ext
  base="$(basename "$f")"
  for n in $code_filenames; do
    [[ "$base" == "$n"* ]] && return 0
  done
  ext="${base##*.}"
  [[ "$base" == "$ext" ]] && return 1   # no extension and not a known filename
  for e in $code_extensions; do
    [[ "$ext" == "$e" ]] && return 0
  done
  return 1
}

declare -A lang_lines
declare -A lang_files
total_lines=0
total_files=0

# -z + read -d '' handles paths with spaces/newlines safely.
while IFS= read -r -d '' f; do
  [[ -f "$f" ]] || continue
  matches_code "$f" || continue
  is_skipped "$f" && continue

  lines=$(wc -l < "$f")
  lang="$(lang_of "$f")"
  lang_lines["$lang"]=$(( ${lang_lines["$lang"]:-0} + lines ))
  lang_files["$lang"]=$(( ${lang_files["$lang"]:-0} + 1 ))
  total_lines=$(( total_lines + lines ))
  total_files=$(( total_files + 1 ))

  [[ $show_files -eq 1 ]] && printf '%8d  %s\n' "$lines" "$f"
done < <(git ls-files -z)

[[ $show_files -eq 1 ]] && echo

printf '%-22s %8s %10s\n' "Language" "Files" "Lines"
printf '%-22s %8s %10s\n' "----------------------" "--------" "----------"

# Sort languages by line count, descending.
for lang in "${!lang_lines[@]}"; do
  printf '%s\t%d\t%d\n' "$lang" "${lang_files[$lang]}" "${lang_lines[$lang]}"
done | sort -t$'\t' -k3 -rn | while IFS=$'\t' read -r lang files lines; do
  printf '%-22s %8d %10d\n' "$lang" "$files" "$lines"
done

printf '%-22s %8s %10s\n' "----------------------" "--------" "----------"
printf '%-22s %8d %10d\n' "TOTAL" "$total_files" "$total_lines"
