#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
VERSION="${1:-v1.0.0}"
APP_NAME="上班鼓励器"
STAGE_DIR="$(mktemp -d)"
DMG_STAGE="$STAGE_DIR/dmg"
APP_BUNDLE="$DMG_STAGE/$APP_NAME.app"
CONTENTS_DIR="$APP_BUNDLE/Contents"
MACOS_DIR="$CONTENTS_DIR/MacOS"
RESOURCES_DIR="$CONTENTS_DIR/Resources"
WEB_DIR="$RESOURCES_DIR/web"
OUT_DIR="$ROOT_DIR/release"

rm -rf "$OUT_DIR"
mkdir -p "$MACOS_DIR" "$WEB_DIR" "$OUT_DIR"

cp "$ROOT_DIR/index.html" "$ROOT_DIR/styles.css" "$ROOT_DIR/app.js" "$ROOT_DIR/earn.js" "$WEB_DIR/"

ICONSET_TMP="$STAGE_DIR/AppIcon.iconset"
swift "$ROOT_DIR/macos/generate-icon.swift" "$ICONSET_TMP"
iconutil -c icns "$ICONSET_TMP" -o "$RESOURCES_DIR/AppIcon.icns"

cat > "$CONTENTS_DIR/Info.plist" <<PLIST
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
  <string>${VERSION#v}</string>
  <key>CFBundleVersion</key>
  <string>1</string>
  <key>LSMinimumSystemVersion</key>
  <string>13.0</string>
  <key>LSUIElement</key>
  <true/>
  <key>NSHighResolutionCapable</key>
  <true/>
</dict>
</plist>
PLIST

swiftc -O -target arm64-apple-macosx13.0 -framework Cocoa -framework WebKit \
  "$ROOT_DIR/macos/MenuBarMain.swift" -o "$STAGE_DIR/WorkEncouragerMenuBar-arm64"
swiftc -O -target x86_64-apple-macosx13.0 -framework Cocoa -framework WebKit \
  "$ROOT_DIR/macos/MenuBarMain.swift" -o "$STAGE_DIR/WorkEncouragerMenuBar-x86_64"

lipo -create \
  "$STAGE_DIR/WorkEncouragerMenuBar-arm64" \
  "$STAGE_DIR/WorkEncouragerMenuBar-x86_64" \
  -output "$MACOS_DIR/WorkEncouragerMenuBar"

codesign --force --deep --sign - "$APP_BUNDLE"

ZIP_PATH="$OUT_DIR/WorkEncourager-macOS-universal-${VERSION}.zip"
DMG_PATH="$OUT_DIR/WorkEncourager-macOS-universal-${VERSION}.dmg"

ditto -c -k --sequesterRsrc --keepParent "$APP_BUNDLE" "$ZIP_PATH"

ln -s /Applications "$DMG_STAGE/Applications"
hdiutil create \
  -volname "$APP_NAME" \
  -srcfolder "$DMG_STAGE" \
  -ov \
  -format UDZO \
  "$DMG_PATH" >/dev/null

rm -rf "$STAGE_DIR"
ls -lh "$OUT_DIR"
