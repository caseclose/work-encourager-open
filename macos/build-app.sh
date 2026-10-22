#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
APP_NAME="上班鼓励器"
INSTALL_DIR="$HOME/Applications"
APP_BUNDLE="$INSTALL_DIR/$APP_NAME.app"
CONTENTS_DIR="$APP_BUNDLE/Contents"
MACOS_DIR="$CONTENTS_DIR/MacOS"
RESOURCES_DIR="$CONTENTS_DIR/Resources"
WEB_DIR="$RESOURCES_DIR/web"
LSREGISTER="/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister"

# Remove old duplicate in dist/ so Spotlight only indexes one app
if [ -d "$ROOT_DIR/dist/$APP_NAME.app" ]; then
  "$LSREGISTER" -u "$ROOT_DIR/dist/$APP_NAME.app" >/dev/null 2>&1 || true
  rm -rf "$ROOT_DIR/dist"
fi

rm -rf "$APP_BUNDLE"
mkdir -p "$MACOS_DIR" "$WEB_DIR"

cp "$ROOT_DIR/index.html" "$ROOT_DIR/styles.css" "$ROOT_DIR/app.js" "$ROOT_DIR/earn.js" "$WEB_DIR/"

ICONSET_TMP="$(mktemp -d)/AppIcon.iconset"
swift "$ROOT_DIR/macos/generate-icon.swift" "$ICONSET_TMP"
iconutil -c icns "$ICONSET_TMP" -o "$RESOURCES_DIR/AppIcon.icns"
rm -rf "$(dirname "$ICONSET_TMP")"

cat > "$CONTENTS_DIR/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDisplayName</key>
  <string>上班鼓励器</string>
  <key>CFBundleExecutable</key>
  <string>WorkEncouragerMenuBar</string>
  <key>CFBundleIconFile</key>
  <string>AppIcon</string>
  <key>CFBundleIconName</key>
  <string>AppIcon</string>
  <key>CFBundleIdentifier</key>
  <string>com.caseclose.work-encourager</string>
  <key>CFBundleInfoDictionaryVersion</key>
  <string>6.0</string>
  <key>CFBundleName</key>
  <string>上班鼓励器</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>1.1.0</string>
  <key>CFBundleVersion</key>
  <string>2</string>
  <key>LSMinimumSystemVersion</key>
  <string>13.0</string>
  <key>LSUIElement</key>
  <true/>
  <key>NSHighResolutionCapable</key>
  <true/>
</dict>
</plist>
PLIST

swiftc \
  -O \
  -framework Cocoa \
  -framework WebKit \
  "$ROOT_DIR/macos/MenuBarMain.swift" \
  -o "$MACOS_DIR/WorkEncouragerMenuBar"

touch "$APP_BUNDLE"
"$LSREGISTER" -f "$APP_BUNDLE" >/dev/null 2>&1 || true

echo "Built and installed $APP_BUNDLE"
