# プッシュアップのデモ動画を「Blenderでレンダリング → ffmpegでmp4化 → 字幕焼き込み」まで
# 一気に行うパイプライン。他の種目を追加する時もこのスクリプトをコピーして使い回せる。
#
# 使い方: このファイルをPowerShellで実行するだけ。
#   powershell -File render_pushup.ps1
#
# 事前に必要なもの:
#   - Blender本体 (BLENDER_EXE)
#   - ffmpeg本体 (FFMPEG_EXE)
#   - build_pushup.py と同じフォルダにあるcaptions/pushup/*.txt (字幕テキスト)

$ErrorActionPreference = "Stop"

$BLENDER_EXE = "$env:USERPROFILE\Tools\blender-5.1.2-windows-x64\blender.exe"
$FFMPEG_EXE = "C:\Users\takub\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-8.1.2-full_build\bin\ffmpeg.exe"
$FONT = "C\:/Windows/Fonts/meiryo.ttc"

$scriptDir = $PSScriptRoot
$buildScript = Join-Path $scriptDir "build_pushup.py"
$capDir = (Join-Path $scriptDir "captions\pushup") -replace '\\', '/' -replace '^([A-Za-z]):', '$1\:'
$outputDir = Join-Path $scriptDir "..\media\exercises"
$framesDir = Join-Path $outputDir "_frames"
$outFile = Join-Path $outputDir "pushup.mp4"

# 1. Blenderで連番PNGをレンダリング
& $BLENDER_EXE --background --python $buildScript -- render

# 2. ffmpegでmp4化 + 字幕焼き込み (下降0〜1.875秒 / 上昇1.875〜3.75秒 = frame1-45-90 @ 24fps)
$filter = "drawtext=fontfile='$FONT':textfile='$capDir/top.txt':fontsize=24:fontcolor=white:box=1:boxcolor=black@0.55:boxborderw=8:x=(w-text_w)/2:y=18," + `
"drawtext=fontfile='$FONT':textfile='$capDir/elbow.txt':fontsize=22:fontcolor=0xFFD24C:box=1:boxcolor=black@0.55:boxborderw=8:x=(w-text_w)/2:y=h-150:enable='between(t,1.3,2.45)'," + `
"drawtext=fontfile='$FONT':textfile='$capDir/down.txt':fontsize=26:fontcolor=white:box=1:boxcolor=black@0.55:boxborderw=8:x=(w-text_w)/2:y=h-72:enable='between(t,0,1.875)'," + `
"drawtext=fontfile='$FONT':textfile='$capDir/up.txt':fontsize=26:fontcolor=white:box=1:boxcolor=black@0.55:boxborderw=8:x=(w-text_w)/2:y=h-72:enable='between(t,1.875,3.75)'"

& $FFMPEG_EXE -y -framerate 24 -i "$framesDir\f_%04d.png" -vf $filter -c:v libx264 -pix_fmt yuv420p -movflags +faststart $outFile

# 3. 一時PNG連番を削除
Remove-Item -Recurse -Force $framesDir

Write-Host "書き出し完了: $outFile"
