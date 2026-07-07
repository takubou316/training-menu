"""
プッシュアップのデモ動画一括生成パイプライン(レップ反復・ナレーション同期版)。
  0. (事前に generate_narration.py を実行しておく: VOICEVOXでレップごとの
     ナレーションを生成し、その尺に合わせた narration/pushup/timeline.json を作る)
  1. Blenderをバックグラウンド起動し、レップごとに繰り返す上下動をレンダリング
     (肘のレップだけ自動で見下ろしカメラに切り替わる)
  2. ffmpegでレップごとの字幕を焼き込みつつ無音のmp4にエンコード
  3. timeline.json記載の順でナレーションwavを結合し、mp4に音声トラックとして合成
  4. 一時ファイルを削除

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


def run_blender(mode):
    result = subprocess.run(
        [BLENDER_EXE, "--background", "--python", BUILD_SCRIPT, "--", mode],
        capture_output=True, text=True, encoding="utf-8", errors="replace",
    )
    return result.stdout + result.stderr


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


def write_caption_files(timeline):
    cap_dir = os.path.join(SCRIPT_DIR, "captions", "pushup")
    os.makedirs(cap_dir, exist_ok=True)
    keep = set()
    for seg in timeline:
        fname = f"{seg['name']}.txt"
        keep.add(fname)
        with open(os.path.join(cap_dir, fname), "w", encoding="utf-8") as f:
            f.write(seg["text"])
    # 過去バージョンの不要なキャプションファイルを掃除
    for fname in os.listdir(cap_dir):
        if fname not in keep:
            os.remove(os.path.join(cap_dir, fname))


def build_filter(timeline):
    filters = []
    for seg in timeline:
        text_path = ffmpeg_escape_path(
            os.path.join(SCRIPT_DIR, "captions", "pushup", f"{seg['name']}.txt")
        )
        filters.append(
            f"drawtext=fontfile='{ffmpeg_escape_path(FONT)}':textfile='{text_path}':"
            f"fontsize=26:fontcolor=white:box=1:boxcolor=black@0.55:boxborderw=8:"
            f"x=(w-text_w)/2:y=h-72:enable='between(t,{seg['start_sec']},{seg['end_sec']})'"
        )
    return ",".join(filters)


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
    print(f"1/4 タイムライン読み込み完了 (総尺 {timeline[-1]['end_sec']:.1f}秒, {len(timeline)}レップ)")
    write_caption_files(timeline)
    print("2/4 フレームをレンダリング中(レップごとにカメラ切替)...")
    render_frames()
    print("3/4 字幕を焼き込みつつエンコード中...")
    filter_str = build_filter(timeline)
    encode_silent(filter_str)
    print("4/4 ナレーションを合成中...")
    mux_narration(timeline)
    cleanup()
    print(f"完了: {OUT_FILE}")


if __name__ == "__main__":
    main()
