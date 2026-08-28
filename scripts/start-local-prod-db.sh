#!/usr/bin/env bash

set -euo pipefail

DOCUMENSO_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
MERCURY_ROOT="${MERCURY_ROOT:-$DOCUMENSO_ROOT/../mercury}"

if [[ ! -f "$MERCURY_ROOT/scripts/local-documenso-env.sh" ]]; then
  echo "Mercury checkout was not found at: $MERCURY_ROOT" >&2
  echo "Set MERCURY_ROOT if Mercury is stored somewhere else." >&2
  exit 1
fi

source "$MERCURY_ROOT/scripts/local-documenso-env.sh"
cd "$MERCURY_ROOT"
require_docker
require_command aws-secrets

aws-secrets pull mercury dev

DEV_SECRETS_FILE="$MERCURY_ROOT/kubernetes-kustomize/overlays/dev/dev-secrets"

if [[ ! -f "$DEV_SECRETS_FILE" ]]; then
  echo "Local Documenso secrets were not created: $DEV_SECRETS_FILE" >&2
  exit 1
fi

read_secret_value() {
  sed -n "s/^$1=//p" "$DEV_SECRETS_FILE" | sed 's/^"//; s/"$//'
}

database_url="$(read_secret_value NEXT_PRIVATE_DATABASE_URL)"
direct_database_url="$(read_secret_value NEXT_PRIVATE_DIRECT_DATABASE_URL)"

if [[ -z "$database_url" || -z "$direct_database_url" ]]; then
  echo "Documenso database URLs are missing from $DEV_SECRETS_FILE" >&2
  exit 1
fi

prod_database_url="${database_url%/documenso}/documenso-prod"
prod_direct_database_url="${direct_database_url%/documenso}/documenso-prod"

if [[ "$prod_database_url" == "$database_url" || "$prod_direct_database_url" == "$direct_database_url" ]]; then
  echo "Could not change the Documenso database name to documenso-prod" >&2
  exit 1
fi

export DOCUMENSO_SOURCE_DIR="$DOCUMENSO_ROOT"
export LOCAL_DOCUMENSO_DATABASE_URL="$prod_database_url"
export LOCAL_DOCUMENSO_DIRECT_DATABASE_URL="$prod_direct_database_url"

exec docker compose \
  -f "$MERCURY_ROOT/docker-compose.yml" \
  -f "$MERCURY_ROOT/docker-compose.documenso-dev.yml" \
  -f "$DOCUMENSO_ROOT/docker/local-prod-db.override.yml" \
  up --no-build "$@"
