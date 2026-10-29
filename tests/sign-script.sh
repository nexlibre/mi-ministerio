#!/usr/bin/env bash
# Isolated mocks; never touches real signing material or an APK.
set -euo pipefail
root=$(cd "$(dirname "$0")/.." && pwd)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/scripts" "$tmp/private-signing" "$tmp/tools"
cp "$root/scripts/sign-testing-apk.sh" "$tmp/scripts/"
touch "$tmp/private-signing/mi-ministerio-testing.p12" "$tmp/private-signing/testing-password.txt" "$tmp/input.apk"
cat > "$tmp/tools/aapt" <<'MOCK'
#!/usr/bin/env bash
printf "package: name='%s' versionCode='1'\n" "$TEST_PACKAGE"
MOCK
cat > "$tmp/tools/zipalign" <<'MOCK'
#!/usr/bin/env bash
printf invoked >> "$MARKER"
if [[ "$1" == '-f' ]]; then cp "$3" "$4"; fi
MOCK
cat > "$tmp/tools/apksigner" <<'MOCK'
#!/usr/bin/env bash
printf invoked >> "$MARKER"
if [[ "$1" == 'sign' ]]; then
  while [[ $# -gt 0 ]]; do if [[ "$1" == '--out' ]]; then touch "$2"; break; fi; shift; done
fi
MOCK
chmod +x "$tmp/tools/"*
export ANDROID_BUILD_TOOLS="$tmp/tools" MARKER="$tmp/marker"
export TEST_PACKAGE=com.pablormlopez.miministerio
if "$tmp/scripts/sign-testing-apk.sh" "$tmp/input.apk" "$tmp/output.apk" >/dev/null 2>&1; then
  echo 'FAIL: original package was not rejected' >&2; exit 1
fi
[[ ! -e "$MARKER" && ! -e "$tmp/output.apk" ]]
export TEST_PACKAGE=com.pablormlopez.miministerio.testing
touch "$tmp/output.apk"
if "$tmp/scripts/sign-testing-apk.sh" "$tmp/input.apk" "$tmp/output.apk" >/dev/null 2>&1; then
  echo 'FAIL: existing output was not rejected' >&2; exit 1
fi
[[ ! -e "$MARKER" ]]
rm "$tmp/output.apk"
"$tmp/scripts/sign-testing-apk.sh" "$tmp/input.apk" "$tmp/output.apk" >/dev/null
[[ -e "$tmp/output.apk" && -e "$MARKER" ]]
echo 'PASS: signing script refuses original package and existing output; simulated testing flow succeeds.'
