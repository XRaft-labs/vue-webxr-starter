#!/usr/bin/env bash
#
# Open the dev server on a headset connected over USB. No typing URLs in the headset.
#
#   1. Start the dev server in plain HTTP mode:   pnpm dev:usb
#   2. Connect the headset with a USB cable and allow USB debugging inside the headset
#   3. Run:                                       pnpm device
#
# Options:
#   ./scripts/open-on-device.sh               Meta Quest (Quest Browser), port 5173
#   ./scripts/open-on-device.sh --chrome      Android XR (Chrome)
#   ./scripts/open-on-device.sh 5174          another port
#
# How it works:
#   `adb reverse` forwards the headset's localhost:PORT to this computer's localhost:PORT.
#   The headset then opens http://localhost:PORT. localhost counts as a secure context,
#   so WebXR works over plain HTTP, with no certificate and no shared Wi-Fi needed.
set -euo pipefail

PORT=5173
PACKAGE=com.oculus.browser
for arg in "$@"; do
  case "$arg" in
    --chrome) PACKAGE=com.android.chrome ;;
    --quest) PACKAGE=com.oculus.browser ;;
    *[!0-9]*) echo "Unknown option: $arg" >&2; exit 1 ;;
    *) PORT="$arg" ;;
  esac
done
URL="http://localhost:${PORT}/"

if ! command -v adb >/dev/null 2>&1; then
  echo "adb not found. Install Android platform-tools:" >&2
  echo "  macOS:   brew install --cask android-platform-tools" >&2
  echo "  Windows: winget install Google.PlatformTools" >&2
  exit 1
fi

if [ "$(adb devices | awk 'NR>1 && $2=="device"' | wc -l | tr -d ' ')" -eq 0 ]; then
  echo "No headset found. Connect it over USB and accept the USB debugging prompt inside the headset." >&2
  echo "(If 'adb devices' shows 'unauthorized', put the headset on and accept the prompt.)" >&2
  exit 1
fi

if ! curl -s -o /dev/null --max-time 3 "$URL"; then
  echo "Warning: nothing answers at ${URL}. Start the dev server with: pnpm dev:usb" >&2
fi

adb reverse "tcp:${PORT}" "tcp:${PORT}" >/dev/null
echo "Forwarded the headset's localhost:${PORT} to this computer"

adb shell am start -a android.intent.action.VIEW -d "$URL" "$PACKAGE" >/dev/null
echo "Opened ${URL} in ${PACKAGE}"
echo
echo "Put on the headset and press START AR."
echo "Console logs: open chrome://inspect in Chrome on this computer."
