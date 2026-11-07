#!/bin/sh
set -eu
SOURCE_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
OUTPUT_DIR=${1:?Provide an output directory}
APP="$OUTPUT_DIR/声场反应堆接入器.app"
mkdir -p "$APP/Contents/MacOS" "$OUTPUT_DIR/swift-cache"
python3 - "$SOURCE_DIR" "$OUTPUT_DIR" "$APP" <<'PYBUILD'
import json, pathlib, subprocess, sys
source, output, app = map(pathlib.Path, sys.argv[1:])
compiler = pathlib.Path(subprocess.check_output(['xcrun', '--find', 'swiftc'], text=True).strip())
include = (compiler.parent / '../include/swift').resolve()
extra = []
# Some Command Line Tools upgrades leave two declarations of the same module.
# Hide only the obsolete declaration for this build; never edit the installed tools.
old_map, new_map = include/'module.modulemap', include/'bridging.modulemap'
if old_map.exists() and new_map.exists() and 'module SwiftBridging' in old_map.read_text() and 'module SwiftBridging' in new_map.read_text():
    empty = output/'empty.modulemap'; empty.write_text('')
    overlay = output/'toolchain-overlay.json'
    overlay.write_text(json.dumps({'version':0, 'roots':[{'type':'file','name':str(old_map),'external-contents':str(empty)}]}))
    extra = ['-vfsoverlay', str(overlay), '-Xcc', '-ivfsoverlay', '-Xcc', str(overlay)]
subprocess.run(['xcrun','swiftc','-O','-target','arm64-apple-macosx14.2','-module-cache-path',str(output/'swift-cache'),*extra,str(source/'ReactorAudio.swift'),'-o',str(app/'Contents/MacOS/ReactorAudio'),'-framework','AppKit','-framework','CoreAudio','-framework','Network'], check=True)
PYBUILD
cat > "$APP/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleExecutable</key><string>ReactorAudio</string>
<key>CFBundleIdentifier</key><string>io.github.0923katouc.ReactorAudio</string>
<key>CFBundleName</key><string>声场反应堆接入器</string>
<key>CFBundleDisplayName</key><string>声场反应堆接入器</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleVersion</key><string>1</string>
<key>CFBundleShortVersionString</key><string>1.0</string>
<key>LSMinimumSystemVersion</key><string>14.2</string>
<key>LSUIElement</key><true/>
<key>NSAudioCaptureUsageDescription</key><string>读取整台电脑正在播放的声音，在你的声场反应堆网页中显示动效。仅在本机处理，不录音、不上传。</string>
</dict></plist>
PLIST
/usr/bin/codesign --force --sign - "$APP"
"$APP/Contents/MacOS/ReactorAudio" --self-test
printf '%s\n' "$APP"
