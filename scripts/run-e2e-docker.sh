#!/usr/bin/env bash

set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="$ROOT_DIR/docker/development/compose.yml"
E2E_COMPOSE_FILE="$ROOT_DIR/docker/development/compose.e2e.yml"
COMPOSE_PROJECT="${DOCUMENSO_E2E_COMPOSE_PROJECT:-documenso-e2e}"
RUNNER_NAME="${DOCUMENSO_E2E_RUNNER_NAME:-documenso-e2e-runner}"
PLAYWRIGHT_IMAGE="${DOCUMENSO_E2E_PLAYWRIGHT_IMAGE:-mcr.microsoft.com/playwright:v1.56.1-noble}"
NODE_MODULES_VOLUME="${COMPOSE_PROJECT}-node-modules"

if ! command -v docker >/dev/null 2>&1; then
  echo 'Docker is required to run the E2E suite.' >&2
  exit 1
fi

cd "$ROOT_DIR"

# The development compose healthcheck interpolates this value from the shell.
export POSTGRES_USER=documenso

if [[ ! -f .env ]]; then
  cp .env.example .env
fi

cleanup() {
  docker rm -f "$RUNNER_NAME" >/dev/null 2>&1 || true
  docker compose \
    --project-name "$COMPOSE_PROJECT" \
    --file "$COMPOSE_FILE" \
    --file "$E2E_COMPOSE_FILE" \
    down --volumes --remove-orphans >/dev/null 2>&1 || true
  docker volume rm "$NODE_MODULES_VOLUME" >/dev/null 2>&1 || true
}

trap cleanup EXIT INT TERM

docker compose \
  --env-file .env \
  --project-name "$COMPOSE_PROJECT" \
  --file "$COMPOSE_FILE" \
  --file "$E2E_COMPOSE_FILE" \
  up --detach

E2E_TEST_PATH="${E2E_TEST_PATH:-$*}"

docker run \
  --name "$RUNNER_NAME" \
  --network "${COMPOSE_PROJECT}_default" \
  --volume "$ROOT_DIR:/app" \
  --volume "$NODE_MODULES_VOLUME:/app/node_modules" \
  --workdir /app \
  --env CI=true \
  --env NODE_ENV=test \
  --env NEXT_PUBLIC_WEBAPP_URL=http://localhost:3000 \
  --env NEXT_PRIVATE_INTERNAL_WEBAPP_URL=http://localhost:3000 \
  --env NEXT_PRIVATE_DATABASE_URL=postgres://documenso:password@database:5432/documenso \
  --env NEXT_PRIVATE_DIRECT_DATABASE_URL=postgres://documenso:password@database:5432/documenso \
  --env NEXT_PRIVATE_REDIS_URL=redis://redis:6379 \
  --env NEXT_PRIVATE_SMTP_HOST=inbucket \
  --env NEXT_PRIVATE_SMTP_PORT=2500 \
  --env NEXT_PRIVATE_UPLOAD_ENDPOINT=http://minio:9002 \
  --env NEXT_PRIVATE_DOCUMENT_CONVERSION_URL=http://gotenberg:3000 \
  --env NEXT_PRIVATE_DOCUMENT_CONVERSION_USERNAME=documenso \
  --env NEXT_PRIVATE_DOCUMENT_CONVERSION_PASSWORD=password \
  --env NEXT_PRIVATE_SIGNING_LOCAL_FILE_PATH=./example/cert.p12 \
  --env DANGEROUS_BYPASS_RATE_LIMITS=true \
  --env "E2E_TEST_PATH=$E2E_TEST_PATH" \
  "$PLAYWRIGHT_IMAGE" \
  bash -lc '
    set -Eeuo pipefail

    npm ci --no-audit
    npm run prisma:generate
    npx playwright install --with-deps
    npm run prisma:migrate-dev
    npm run prisma:seed
    npm run ci
  '
