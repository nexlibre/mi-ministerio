#!/usr/bin/env bash
# Sign an already-built testing package. Never signs the original package ID.
set -euo pipefail
if [[ $# != 2 ]]; then echo "Uso: $0 APK-SIN-FIRMAR APK-FIRMADA" >&2; exit 2; fi
root=$(cd "$(dirname "$0")/.." && pwd)
unsigned=$(realpath "$1")
output=$2
build_tools=${ANDROID_BUILD_TOOLS:-${ANDROID_HOME:-}/build-tools/35.0.0}
keystore="$root/private-signing/mi-ministerio-testing.p12"
password="$root/private-signing/testing-password.txt"
for file in "$unsigned" "$keystore" "$password" "$build_tools/aapt" "$build_tools/zipalign" "$build_tools/apksigner"; do
  [[ -f "$file" ]] || { echo "Falta un archivo necesario: $file" >&2; exit 1; }
done
[[ ! -e "$output" ]] || { echo "No se sobrescribe el archivo de salida." >&2; exit 1; }
package=$("$build_tools/aapt" dump badging "$unsigned" | sed -n "s/^package: name='\([^']*\)'.*/\1/p" | head -1)
[[ "$package" == 'com.pablormlopez.miministerio.testing' ]] || { echo "Paquete no autorizado para esta clave: $package" >&2; exit 1; }
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
"$build_tools/zipalign" -f 4 "$unsigned" "$tmp/aligned.apk"
"$build_tools/apksigner" sign --ks "$keystore" --ks-type PKCS12 --ks-key-alias ministerio-testing \
  --ks-pass "file:$password" --out "$tmp/signed.apk" "$tmp/aligned.apk"
"$build_tools/apksigner" verify --verbose --print-certs "$tmp/signed.apk"
"$build_tools/zipalign" -c 4 "$tmp/signed.apk"
cp "$tmp/signed.apk" "$output"
echo "APK firmada de pruebas creada: $output"
