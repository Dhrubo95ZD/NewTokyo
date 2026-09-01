#!/usr/bin/env bash
set -euo pipefail

REPOSITORY="Dhrubo95ZD/NewTokyo"
KEYSTORE_FILE="$PWD/moretti-upload.jks"
KEY_ALIAS="moretti-upload"

command -v gh >/dev/null || { echo "GitHub CLI is missing."; exit 1; }
command -v keytool >/dev/null || { echo "Java keytool is missing."; exit 1; }
gh auth status

if [ -e "$KEYSTORE_FILE" ]; then
  echo "A keystore already exists: $KEYSTORE_FILE"
  echo "It was not overwritten. Download and preserve it."
  exit 1
fi

read -rsp "Choose a password with at least 12 characters: " KEY_PASSWORD
echo
read -rsp "Enter the same password again: " KEY_PASSWORD_CONFIRM
echo

if [ "$KEY_PASSWORD" != "$KEY_PASSWORD_CONFIRM" ]; then
  echo "Passwords did not match. Run the script again."
  exit 1
fi
if [ "${#KEY_PASSWORD}" -lt 12 ]; then
  echo "Password must contain at least 12 characters. Run the script again."
  exit 1
fi

keytool -genkeypair -v \
  -keystore "$KEYSTORE_FILE" \
  -storetype JKS \
  -storepass "$KEY_PASSWORD" \
  -keypass "$KEY_PASSWORD" \
  -alias "$KEY_ALIAS" \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000 \
  -dname "CN=Moretti Upload, OU=Blackwood City, O=Moretti, C=GB"

base64 -w0 "$KEYSTORE_FILE" | gh secret set MORETTI_KEYSTORE_BASE64 --repo "$REPOSITORY"
printf '%s' "$KEY_PASSWORD" | gh secret set MORETTI_KEYSTORE_PASSWORD --repo "$REPOSITORY"
printf '%s' "$KEY_ALIAS" | gh secret set MORETTI_KEY_ALIAS --repo "$REPOSITORY"
printf '%s' "$KEY_PASSWORD" | gh secret set MORETTI_KEY_PASSWORD --repo "$REPOSITORY"
unset KEY_PASSWORD KEY_PASSWORD_CONFIRM

echo
echo "SUCCESS: GitHub signing secrets are configured."
echo "IMPORTANT: In the left file explorer, right-click moretti-upload.jks and download it."
echo "Keep the file and its password safe."
