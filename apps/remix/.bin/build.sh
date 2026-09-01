#!/usr/bin/env bash

# Exit on error.
set -e

SCRIPT_DIR="$(readlink -f "$(dirname "$0")")"
WEB_APP_DIR="$SCRIPT_DIR/.."

# Store the original directory
ORIGINAL_DIR=$(pwd)

# Set up trap to ensure we return to original directory
trap 'cd "$ORIGINAL_DIR"' EXIT

cd "$WEB_APP_DIR"

start_time=$(date +%s)

node --input-type=module -e 'import os from "node:os"; console.log(`[Build]: Node ${process.version}, arch ${process.arch}, CPUs ${os.cpus().length}, memory ${Math.round(os.totalmem() / 1024 / 1024)} MiB`)'

run_build_step() {
  local label="$1"
  shift
  local step_start_time
  local step_end_time

  step_start_time=$(date +%s)
  echo "[Build]: ${label}"
  "$@"
  step_end_time=$(date +%s)
  echo "[Build]: ${label} done in $((step_end_time - step_start_time)) seconds"
}

run_build_step "Extracting and compiling translations" npm run translate --prefix ../../

run_build_step "Building app" npm run build:app

run_build_step "Building server" npm run build:server

# Copy over the entry point for the server.
cp server/main.js build/server/main.js

# Copy over all web.js translations
cp -r ../../packages/lib/translations build/server/hono/packages/lib/translations

# Time taken
end_time=$(date +%s)

echo "[Build]: Done in $((end_time - start_time)) seconds"
