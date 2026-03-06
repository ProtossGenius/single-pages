#!/usr/bin/env bash
set -euo pipefail

show_help() {
  cat <<EOF
Usage: $0 [options] <src_dir> <target_dir>

Copy all files from <src_dir> to <target_dir>, then minify/obfuscate JS files in <target_dir>.

Options:
  -f, --force    Overwrite non-empty target directory without prompting.
  -h, --help     Show this help message.

Examples:
  $0 aircopy dist
  $0 --force ./aircopy ./dist
EOF
}

FORCE_OVERWRITE=0
POSITIONAL_ARGS=()

while [ "$#" -gt 0 ]; do
  case "$1" in
    -h|--help)
      show_help
      exit 0
      ;;
    -f|--force)
      FORCE_OVERWRITE=1
      shift
      ;;
    --)
      shift
      while [ "$#" -gt 0 ]; do
        POSITIONAL_ARGS+=("$1")
        shift
      done
      ;;
    -*)
      echo "Error: unknown option: $1"
      show_help
      exit 1
      ;;
    *)
      POSITIONAL_ARGS+=("$1")
      shift
      ;;
  esac
done

if [ "${#POSITIONAL_ARGS[@]}" -ne 2 ]; then
  echo "Error: expected exactly 2 directory arguments"
  show_help
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC_INPUT="${POSITIONAL_ARGS[0]}"
TARGET_INPUT="${POSITIONAL_ARGS[1]}"

if [[ "$SRC_INPUT" = /* ]]; then
  SRC_DIR="$SRC_INPUT"
else
  SRC_DIR="$SCRIPT_DIR/$SRC_INPUT"
fi

if [[ "$TARGET_INPUT" = /* ]]; then
  TARGET_DIR="$TARGET_INPUT"
else
  TARGET_DIR="$SCRIPT_DIR/$TARGET_INPUT"
fi

if [ ! -d "$SRC_DIR" ]; then
  echo "Error: source argument is not a directory: $SRC_DIR"
  show_help
  exit 1
fi

if ! command -v terser >/dev/null 2>&1; then
  echo "Error: 'terser' is required but not found in PATH"
  exit 1
fi

if [ -e "$TARGET_DIR" ] && [ ! -d "$TARGET_DIR" ]; then
  echo "Error: target argument is not a directory: $TARGET_DIR"
  show_help
  exit 1
fi

mkdir -p "$TARGET_DIR"

SRC_REAL="$(cd "$SRC_DIR" && pwd)"
TARGET_REAL="$(cd "$TARGET_DIR" && pwd)"
if [ "$SRC_REAL" = "$TARGET_REAL" ]; then
  echo "Error: source and target directories must be different"
  exit 1
fi

if find "$TARGET_DIR" -mindepth 1 -maxdepth 1 -print -quit | grep -q .; then
  if [ "$FORCE_OVERWRITE" -eq 1 ]; then
    find "$TARGET_DIR" -mindepth 1 -maxdepth 1 -exec rm -rf -- {} +
  else
    read -r -p "Target directory is not empty. Overwrite? [y/N] " answer
    case "$answer" in
      y|Y|yes|YES)
        find "$TARGET_DIR" -mindepth 1 -maxdepth 1 -exec rm -rf -- {} +
        ;;
      *)
        echo "Canceled. Use --force to overwrite without prompt."
        exit 1
        ;;
    esac
  fi
fi

cp -a "$SRC_DIR"/. "$TARGET_DIR"/

while IFS= read -r -d '' js_file; do
  if [[ "$js_file" == *.min.js ]]; then
    continue
  fi
  terser "$js_file" --compress --mangle --output "$js_file"
done < <(find "$TARGET_DIR" -type f -name "*.js" -print0)

echo "Build completed: $SRC_DIR -> $TARGET_DIR"
