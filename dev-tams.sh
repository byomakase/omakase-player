#!/usr/bin/env bash
# Runs the TAMS AWS playground at the server root on http://localhost:5173/
# so the OIDC redirect_uri matches the Cognito app client's registered callback.
set -e
cd "$(dirname "$0")"
npx vite --config vite.tams.config.mjs
