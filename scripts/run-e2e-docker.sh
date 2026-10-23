#!/usr/bin/env bash

set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="$ROOT_DIR/docker/development/compose.yml"
E2E_COMPOSE_FILE="$ROOT_DIR/docker/development/compose.e2e.yml"
COMPOSE_PROJECT="${DOCUMENSO_E2E_COMPOSE_PROJECT:-documenso-e2e}"
RUNNER_NAME="${DOCUMENSO_E2E_RUNNER_NAME:-documenso-e2e-runner}"
PLAYWRIGHT_IMAGE="${DOCUMENSO_E2E_PLAYWRIGHT_IMAGE:-mcr.microsoft.com/playwright:v1.56.1-noble}"
NODE_MODULES_VOLUME="${COMPOSE_PROJECT}-node-modules"
WORKSPACE_VOLUME="${COMPOSE_PROJECT}-workspace"
ARTIFACTS_DIR="${DOCUMENSO_E2E_ARTIFACTS_DIR:-}"
REUSE=false

case "${1:-}" in
  -h|--help)
    cat <<'EOF'
Usage: ./scripts/run-e2e-docker.sh [--reuse] [Playwright options or test paths]

Default: install dependencies, reset the isolated test database, and build the app.
Local and GitHub runs use 2 workers, 1 retry, and stop after the first failed test.
Explicit Playwright options override these defaults.
--reuse: rerun tests using the previous dependencies, database, and app build.
         Run without --reuse after app, dependency, or database schema changes.

Examples:
  ./scripts/run-e2e-docker.sh
  ./scripts/run-e2e-docker.sh --reuse --last-failed
  ./scripts/run-e2e-docker.sh --reuse --grep @smoke
  ./scripts/run-e2e-docker.sh --reuse e2e/envelope-editor-v2/envelope-actions.spec.ts

Services are removed afterward. Test data, dependencies, and build output are
kept for reuse. Source is copied to an isolated Docker volume; generated files
and builds never write into the development checkout. Only reports are copied back.
The development database is never used.
EOF
    exit 0
    ;;
  --reuse)
    REUSE=true
    shift
    ;;
esac

if ! command -v docker >/dev/null 2>&1; then
  echo 'Docker is required to run the E2E suite.' >&2
  exit 1
fi

cd "$ROOT_DIR"

# Refuse an overlapping run before installing cleanup that owns these resources.
if docker container inspect "$RUNNER_NAME" >/dev/null 2>&1 ||
  [[ -n "$(docker ps -aq --filter "label=com.docker.compose.project=$COMPOSE_PROJECT")" ]]; then
  echo "An E2E run already owns '$COMPOSE_PROJECT' or '$RUNNER_NAME'. Wait for it to finish." >&2
  exit 1
fi

# The development compose healthcheck interpolates this value from the shell.
export POSTGRES_USER=documenso

if [[ ! -f .env ]]; then
  cp .env.example .env
fi

cleanup() {
  # Capture diagnostics before removing services, including on setup/test failure.
  if [[ -n "$ARTIFACTS_DIR" ]]; then
    mkdir -p "$ARTIFACTS_DIR"
    docker logs "$RUNNER_NAME" > "$ARTIFACTS_DIR/app-and-tests.log" 2>&1 || true
    docker compose \
      --project-name "$COMPOSE_PROJECT" \
      --file "$COMPOSE_FILE" \
      --file "$E2E_COMPOSE_FILE" \
      logs --no-color > "$ARTIFACTS_DIR/services.log" 2>&1 || true
  fi
  # Export only test reports; never copy generated source, configuration or databases.
  for report in playwright-report test-results; do
    local report_tmp
    report_tmp="$(mktemp -d)"
    if docker cp "$RUNNER_NAME:/app/packages/app-tests/$report" "$report_tmp/" >/dev/null 2>&1; then
      # Replace complete reports so screenshots from older runs cannot linger.
      rm -rf -- "$ROOT_DIR/packages/app-tests/$report"
      mv "$report_tmp/$report" "$ROOT_DIR/packages/app-tests/$report"
    fi
    rm -rf -- "$report_tmp"
  done
  docker rm -f "$RUNNER_NAME" >/dev/null 2>&1 || true
  docker compose \
    --project-name "$COMPOSE_PROJECT" \
    --file "$COMPOSE_FILE" \
    --file "$E2E_COMPOSE_FILE" \
    down --remove-orphans >/dev/null 2>&1 || true
}

if [[ "$REUSE" == true ]]; then
  if ! docker volume inspect "$NODE_MODULES_VOLUME" "$WORKSPACE_VOLUME" "${COMPOSE_PROJECT}_documenso_database" >/dev/null 2>&1; then
    echo 'No reusable E2E setup found. Run without --reuse first.' >&2
    exit 1
  fi
else
  # A normal run always starts with fresh isolated data and dependencies.
  docker compose --project-name "$COMPOSE_PROJECT" --file "$COMPOSE_FILE" --file "$E2E_COMPOSE_FILE" down --volumes --remove-orphans
  docker volume rm "$NODE_MODULES_VOLUME" "$WORKSPACE_VOLUME" >/dev/null 2>&1 || true
fi

trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

build_option=--build
if [[ "$REUSE" == true ]]; then
  build_option=--no-build
fi

docker compose \
  --env-file .env \
  --project-name "$COMPOSE_PROJECT" \
  --file "$COMPOSE_FILE" \
  --file "$E2E_COMPOSE_FILE" \
  up --detach "$build_option" --wait database inbucket redis gotenberg

# Keep local and GitHub execution identical. Explicit options come last so callers
# can override defaults when debugging a specific test.
E2E_TEST_PATH="--workers=2 --max-failures=1 --retries=1 ${E2E_TEST_PATH:-$*}"

# Copy source, including uncommitted edits, without local configuration, secrets,
# dependencies or generated outputs. E2E never writes to the live dev source tree.
docker run --rm \
  --volume "$ROOT_DIR:/source:ro" \
  --volume "$WORKSPACE_VOLUME:/app" \
  --entrypoint bash \
  "$PLAYWRIGHT_IMAGE" -lc '
    set -euo pipefail
    tar -C /source \
      --exclude=.git --exclude=node_modules --exclude=.env --exclude=".env.*" \
      --exclude=dev-env --exclude=dev-secrets --exclude=".aws" \
      --exclude=".documenso-license*.json" --exclude="*.pem" \
      --exclude=build --exclude=.turbo --exclude=.react-router --exclude=generated \
      --exclude=playwright-report --exclude=test-results --exclude=.e2e-artifacts \
      -cf - . | tar -C /app -xf -
    cp /source/.env.example /app/.env
  '

docker run \
  --name "$RUNNER_NAME" \
  --network "${COMPOSE_PROJECT}_default" \
  --volume "$WORKSPACE_VOLUME:/app" \
  --volume "$NODE_MODULES_VOLUME:/app/node_modules" \
  --workdir /app \
  --env CI=true \
  --env PLAYWRIGHT_HTML_OPEN=never \
  --env TURBO_TELEMETRY_DISABLED=1 \
  --env NEXT_TELEMETRY_DISABLED=1 \
  --env NEXT_PRIVATE_ROLLBAR_ACCESS_TOKEN= \
  --env NEXT_PUBLIC_ROLLBAR_ACCESS_TOKEN= \
  --env NODE_ENV=test \
  --env NODE_OPTIONS=--max-old-space-size=4096 \
  --env NEXT_PUBLIC_WEBAPP_URL=http://localhost:3000 \
  --env NEXT_PRIVATE_INTERNAL_WEBAPP_URL=http://localhost:3000 \
  --env NEXT_PRIVATE_DATABASE_URL=postgres://documenso:password@database:5432/documenso \
  --env NEXT_PRIVATE_DATABASE_REPLICA_URLS= \
  --env NEXT_PRIVATE_DIRECT_DATABASE_URL=postgres://documenso:password@database:5432/documenso \
  --env NEXT_PRIVATE_REDIS_URL=redis://redis:6379 \
  --env NEXT_PRIVATE_SMTP_HOST=inbucket \
  --env NEXT_PRIVATE_SMTP_PORT=2500 \
  --env NEXT_PRIVATE_SMTP_TRANSPORT=smtp-auth \
  --env NEXT_PRIVATE_SMTP_SERVICE= \
  --env NEXT_PRIVATE_SMTP_USERNAME=documenso \
  --env NEXT_PRIVATE_SMTP_PASSWORD=password \
  --env NEXT_PRIVATE_SMTP_SECURE=false \
  --env NEXT_PUBLIC_UPLOAD_TRANSPORT=database \
  --env NEXT_PRIVATE_DOCUMENT_CONVERSION_URL=http://gotenberg:3000 \
  --env NEXT_PRIVATE_DOCUMENT_CONVERSION_USERNAME=documenso \
  --env NEXT_PRIVATE_DOCUMENT_CONVERSION_PASSWORD=password \
  --env NEXT_PRIVATE_SIGNING_LOCAL_FILE_PATH=./example/cert.p12 \
  --env DANGEROUS_BYPASS_RATE_LIMITS=true \
  --env "E2E_REUSE=$REUSE" \
  --env "E2E_PLAYWRIGHT_IMAGE=$PLAYWRIGHT_IMAGE" \
  --env "E2E_TEST_PATH=$E2E_TEST_PATH" \
  "$PLAYWRIGHT_IMAGE" \
  bash -lc '
    set -Eeuo pipefail

    cache_key="$(sha256sum package.json package-lock.json)
$E2E_PLAYWRIGHT_IMAGE"
    ready_file=node_modules/.e2e-ready

    if [[ "$E2E_REUSE" == true ]]; then
      if [[ ! -f "$ready_file" || "$(cat "$ready_file")" != "$cache_key" || ! -f apps/remix/build/server/main.js ]]; then
        echo "E2E setup is missing or dependencies changed. Run without --reuse first." >&2
        exit 1
      fi
      echo "Reusing E2E dependencies, test database, and app build. Test-file edits are loaded directly."
    else
      npm install --global "$(node -p "require(\"./package.json\").packageManager")" --no-audit --no-fund
      node --version
      npm --version
      npm ci --no-audit
      npm run prisma:generate
      # Browser binaries and system dependencies are included in the Playwright image.
      npm run prisma:migrate-dev
      npm run prisma:seed
      ./node_modules/.bin/turbo run build --filter=@documenso/remix
      printf "%s\n" "$cache_key" > "$ready_file"
    fi

    # Bypass Turbo build dependencies when reusing the prepared app.
    npm run test:e2e -w @documenso/app-tests
  '
