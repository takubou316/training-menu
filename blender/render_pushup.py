"""
プッシュアップのデモ動画一括生成パイプライン(ナレーション同期版)。
  0. (事前に generate_narration.py を実行しておく: VOICEVOXでナレーションを
     生成し、その尺に合わせた narration/pushup/timeline.json を作る)
  1. Blenderをバックグラウンド起動し、部位ラベルのアンカー座標(anchors)を取得
  2. Blenderをバックグラウンド起動し、全フレームをPNG連番でレンダリング
     (build_pushup.py がtimeline.jsonを読んでポーズの尺を合わせる)
  3. ffmpegで字幕・部位ラベルを焼き込みつつ無音のmp4にエンコード
  4. timeline.json記載の順でナレーションwavを結合し、mp4に音声トラックとして合成
  5. 一時ファイルを削除

使い方: `python render_pushup.py` (このファイルと同じフォルダで実行。
先に `python generate_narration.py` を実行してtimeline.jsonを作っておくこと)
"""

import json
import os
import subprocess

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
BLENDER_EXE = os.path.expandvars(r"%USERPROFILE%\Tools\blender-5.1.2-windows-x64\blender.exe")
FFMPEG_EXE = r"C:\Users\takub\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-8.1.2-full_build\bin\ffmpeg.exe"
FONT = "C:/Windows/Fonts/meiryo.ttc"
BUILD_SCRIPT = os.path.join(SCRIPT_DIR, "build_pushup.py")
OUTPUT_DIR = os.path.join(SCRIPT_DIR, "..", "media", "exercises")
FRAMES_DIR = os.path.join(OUTPUT_DIR, "_frames")
SILENT_FILE = os.path.join(OUTPUT_DIR, "_pushup_silent.mp4")
OUT_FILE = os.path.join(OUTPUT_DIR, "pushup.mp4")
TIMELINE_PATH = os.path.join(SCRIPT_DIR, "narration", "pushup", "timeline.json")

FPS = 24
DOT_COLOR = "0xFFD24C"
PLAIN_NAMES = {"intro", "down", "breathe", "up"}


def run_blender(mode):
    result = subprocess.run(
        [BLENDER_EXE, "--background", "--python", BUILD_SCRIPT, "--", mode],
        capture_output=True, text=True, encoding="utf-8", errors="replace",
    )
    return result.stdout + result.stderr


def get_anchors():
    out = run_blender("anchors")
    for line in out.splitlines():
        if line.startswith("ANCHORS_JSON:"):
            return json.loads(line[len("ANCHORS_JSON:"):])
    raise RuntimeError("anchors JSONが取得できませんでした:\n" + out)


def render_frames():
    out = run_blender("render")
    if "RENDER_WRITTEN" not in out:
        raise RuntimeError("フレームのレンダリングに失敗しました:\n" + out)


def ffmpeg_escape_path(path):
    path = path.replace("\\", "/")
    if len(path) > 1 and path[1] == ":":
        path = path[0] + "\\:" + path[2:]
    return path


def load_timeline():
    if not os.path.exists(TIMELINE_PATH):
        raise RuntimeError(
            f"{TIMELINE_PATH} がありません。先に generate_narration.py を実行してください。"
        )
    with open(TIMELINE_PATH, encoding="utf-8") as f:
        return json.load(f)


def build_filter(timeline, anchors):
    filters = []
    for seg in timeline:
        name = seg["name"]
        start, end = seg["start_sec"], seg["end_sec"]
        text_path = ffmpeg_escape_path(os.path.join(SCRIPT_DIR, "captions", "pushup", f"{name}.txt"))

        if name in PLAIN_NAMES:
            filters.append(
                f"drawtext=fontfile='{ffmpeg_escape_path(FONT)}':textfile='{text_path}':"
                f"fontsize=26:fontcolor=white:box=1:boxcolor=black@0.55:boxborderw=8:"
                f"x=(w-text_w)/2:y=h-72:enable='between(t,{start},{end})'"
            )
            continue

        phase, part = name.split("_", 1)
        ax, ay = anchors[phase][part]
        filters.append(
            f"drawbox=x={ax - 5}:y={ay - 5}:w=10:h=10:color={DOT_COLOR}@0.95:t=fill:"
            f"enable='between(t,{start},{end})'"
        )
        if ax < 320:
            x_expr = f"{ax + 16}"
        else:
            x_expr = f"{ax - 16}-text_w"
        y_expr = f"{ay - 14}"
        filters.append(
            f"drawtext=fontfile='{ffmpeg_escape_path(FONT)}':textfile='{text_path}':"
            f"fontsize=22:fontcolor=0xFFD24C:box=1:boxcolor=black@0.6:boxborderw=6:"
            f"x={x_expr}:y={y_expr}:enable='between(t,{start},{end})'"
        )
    return ",".join(filters)


def write_caption_files(timeline):
    cap_dir = os.path.join(SCRIPT_DIR, "captions", "pushup")
    os.makedirs(cap_dir, exist_ok=True)
    for seg in timeline:
        with open(os.path.join(cap_dir, f"{seg['name']}.txt"), "w", encoding="utf-8") as f:
            f.write(seg["text"])


def encode_silent(filter_str):
    cmd = [
        FFMPEG_EXE, "-y",
        "-framerate", str(FPS),
        "-i", os.path.join(FRAMES_DIR, "f_%04d.png"),
        "-vf", filter_str,
        "-c:v", "libx264", "-pix_fmt", "yuv420p",
        SILENT_FILE,
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace")
    if result.returncode != 0:
        raise RuntimeError("ffmpeg(映像)エンコードに失敗しました:\n" + result.stderr[-3000:])


def mux_narration(timeline):
    concat_list_path = os.path.join(SCRIPT_DIR, "narration", "pushup", "_concat.txt")
    with open(concat_list_path, "w", encoding="utf-8") as f:
        for seg in timeline:
            wav_path = os.path.join(SCRIPT_DIR, seg["audio"]).replace("\\", "/")
            f.write(f"file '{wav_path}'\n")

    audio_path = os.path.join(SCRIPT_DIR, "narration", "pushup", "_narration.wav")
    cmd_concat = [
        FFMPEG_EXE, "-y", "-f", "concat", "-safe", "0",
        "-i", concat_list_path, "-c", "copy", audio_path,
    ]
    result = subprocess.run(cmd_concat, capture_output=True, text=True, encoding="utf-8", errors="replace")
    if result.returncode != 0:
        raise RuntimeError("ナレーションの結合に失敗しました:\n" + result.stderr[-3000:])

    cmd_mux = [
        FFMPEG_EXE, "-y",
        "-i", SILENT_FILE, "-i", audio_path,
        "-c:v", "copy", "-c:a", "aac", "-shortest", "-movflags", "+faststart",
        OUT_FILE,
    ]
    result = subprocess.run(cmd_mux, capture_output=True, text=True, encoding="utf-8", errors="replace")
    if result.returncode != 0:
        raise RuntimeError("音声・映像の合成に失敗しました:\n" + result.stderr[-3000:])

    os.remove(concat_list_path)
    os.remove(audio_path)


def cleanup():
    import shutil
    import time
    for path in (FRAMES_DIR,):
        if not os.path.isdir(path):
            continue
        for attempt in range(5):
            try:
                shutil.rmtree(path)
                break
            except PermissionError:
                time.sleep(2)
        else:
            print(f"警告: {path} の削除に失敗しました。手動で削除してください。")
    if os.path.exists(SILENT_FILE):
        os.remove(SILENT_FILE)


def main():
    timeline = load_timeline()
    print(f"1/5 タイムライン読み込み完了 (総尺 {timeline[-1]['end_sec']:.1f}秒, {len(timeline)}セグメント)")
    write_caption_files(timeline)
    print("2/5 アンカー座標を取得中...")
    anchors = get_anchors()
    print("3/5 フレームをレンダリング中...")
    render_frames()
    print("4/5 字幕・ラベルを焼き込みつつエンコード中...")
    filter_str = build_filter(timeline, anchors)
    encode_silent(filter_str)
    print("5/5 ナレーションを合成中...")
    mux_narration(timeline)
    cleanup()
    print(f"完了: {OUT_FILE}")


if __name__ == "__main__":
    main()
