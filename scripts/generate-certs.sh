#!/usr/bin/env bash
set -euo pipefail
export MSYS_NO_PATHCONV=1

# Change to repo root
SCRIPT_DIR=$( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )
cd "$SCRIPT_DIR/.."

# Create certs directory
mkdir -p test/db/certs && cd test/db/certs

# Create throwaway certificate authority, trusted only by the test run
openssl req -x509 -newkey rsa:2048 -nodes -days 3650 \
  -subj "/CN=raser-test-ca" -keyout ca.key -out ca.crt

# Create server certificate for "localhost", signed by that CA
printf "subjectAltName=DNS:localhost,IP:127.0.0.1\nextendedKeyUsage=serverAuth\n" > server.ext
openssl req -newkey rsa:2048 -nodes -subj "/CN=localhost" -keyout server.key -out server.csr
openssl x509 -req -in server.csr -CA ca.crt -CAkey ca.key -CAcreateserial \
  -days 3650 -extfile server.ext -out server.crt

# Keep only what the tests need: ca.crt, server.crt, server.key
rm ca.key ca.srl server.csr server.ext
