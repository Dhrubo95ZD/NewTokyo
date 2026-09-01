#!/usr/bin/env bash
set -euo pipefail

KEY_ALIAS="moretti-upload"
KEYSTORE_FILE="$PWD/moretti-upload.p12"
BASE64_FILE="$PWD/moretti-upload-base64.txt"

command -v keytool >/dev/null || { echo "Java keytool is missing."; exit 1; }
command -v base64 >/dev/null || { echo "The base64 command is missing."; exit 1; }

if [ -e "$KEYSTORE_FILE" ]; then
  echo "A PKCS12 upload key already exists: $KEYSTORE_FILE"
  echo "It was not overwritten. Preserve it, or rename it before trying again."
  exit 1
fi

echo "This creates a clean Google Play upload key."
echo "Use letters, numbers, dots, underscores, or hyphens only."
read -rsp "Choose a NEW password with at least 12 characters: " KEY_PASSWORD
echo
read -rsp "Enter the same NEW password again: " KEY_PASSWORD_CONFIRM
echo

if [ "$KEY_PASSWORD" != "$KEY_PASSWORD_CONFIRM" ]; then
  echo "Passwords did not match. Run the script again."
  exit 1
fi
if [ "${#KEY_PASSWORD}" -lt 12 ]; then
  echo "Password must contain at least 12 characters. Run the script again."
  exit 1
fi
if [[ ! "$KEY_PASSWORD" =~ ^[A-Za-z0-9._-]+$ ]]; then
  echo "Use letters, numbers, dots, underscores, or hyphens only."
  exit 1
fi

keytool -genkeypair -v \
  -keystore "$KEYSTORE_FILE" \
  -storetype PKCS12 \
  -storepass "$KEY_PASSWORD" \
  -keypass "$KEY_PASSWORD" \
  -alias "$KEY_ALIAS" \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000 \
  -dname "CN=Moretti Upload, OU=Blackwood City, O=Moretti, C=GB"

keytool -list \
  -keystore "$KEYSTORE_FILE" \
  -storetype PKCS12 \
  -storepass "$KEY_PASSWORD" \
  -alias "$KEY_ALIAS" >/dev/null

base64 -w0 "$KEYSTORE_FILE" > "$BASE64_FILE"
unset KEY_PASSWORD KEY_PASSWORD_CONFIRM

echo
echo "SUCCESS: a compatible PKCS12 upload key was created."
echo "1. Download moretti-upload.p12 and keep it safe."
echo "2. Open moretti-upload-base64.txt and copy its entire single line."
echo "3. Update GitHub secret MORETTI_KEYSTORE_BASE64 with that line."
echo "4. Update GitHub secret MORETTI_KEYSTORE_PASSWORD with the NEW password."
echo "MORETTI_KEY_ALIAS stays: moretti-upload"
echo "MORETTI_KEY_PASSWORD is no longer used by the build."
