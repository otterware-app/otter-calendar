#!/usr/bin/env bash
set -euo pipefail

scratch="$(mktemp -d)"
mounted=false
cleanup() {
  if [[ "$mounted" == true ]]; then
    hdiutil detach -quiet "$scratch/mount"
  fi
  rm -rf "$scratch"
}
trap cleanup EXIT

if [[ "$#" -eq 0 ]]; then
  echo "Provide at least one desktop DMG or ZIP." >&2
  exit 1
fi

for artifact in "$@"; do
  mkdir -p "$scratch/mount"
  case "$artifact" in
    *.dmg)
      hdiutil attach -readonly -nobrowse -quiet -mountpoint "$scratch/mount" "$artifact"
      mounted=true
      ;;
    *.zip)
      ditto -x -k "$artifact" "$scratch/mount"
      ;;
    *)
      echo "Unsupported desktop artifact: $artifact" >&2
      exit 1
      ;;
  esac

  shopt -s nullglob
  apps=("$scratch/mount/"*.app)
  if [[ "${#apps[@]}" -ne 1 ]]; then
    echo "Expected exactly one app in $artifact." >&2
    exit 1
  fi
  codesign --verify --deep --strict "${apps[0]}"
  echo "Verified desktop signature in $artifact."

  if [[ "$mounted" == true ]]; then
    hdiutil detach -quiet "$scratch/mount"
    mounted=false
  fi
  rm -rf "$scratch/mount"
done
