"""
プッシュアップのデモ動画一括生成パイプライン。
  1. Blenderをバックグラウンド起動し、部位ラベルのアンカー座標(anchors)を取得
  2. Blenderをバックグラウンド起動し、全フレームをPNG連番でレンダリング
  3. ffmpegで字幕・部位ラベルを焼き込みつつmp4にエンコード
  4. 一時ファイルを削除

使い方: `python render_pushup.py` (このファイルと同じフォルダで実行)
他の種目を追加する時もこのファイルをコピーして、LABELS/CAPTIONSの内容と
build_xxx.pyのファイル名を差し替えれば使い回せる。
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
OUT_FILE = os.path.join(OUTPUT_DIR, "pushup.mp4")
CAP_DIR = os.path.join(SCRIPT_DIR, "captions", "pushup")

FPS = 24

# 常時/区間表示のシンプルなテロップ(ドット無し、中央寄せ)
PLAIN_CAPTIONS = [
    (0.0, 1.0, "intro", "体は頭からかかとまで一直線をキープ"),
    (5.0, 6.5, "down", "吸う：胸が床につくまで下ろす"),
    (11.5, 12.5, "breathe", "呼吸を止めない"),
    (12.5, 14.0, "up", "吐く：元の姿勢まで上げる"),
]

# 部位ごとのラベル(アンカー座標にドット+隣接テキスト)。phaseはanchors JSONの'top'/'bottom'に対応。
PART_LABELS = [
    (1.0, 2.0, "top", "head", "視線はやや前の床"),
    (2.0, 3.0, "top", "neck", "首は一直線"),
    (3.0, 4.0, "top", "shoulder", "肩をすくめない"),
    (4.0, 5.0, "top", "hand", "手は肩幅よりやや広め"),
    (6.5, 7.5, "bottom", "elbow", "肘は45〜60度外側"),
    (7.5, 8.5, "bottom", "chest", "胸が床につくまで下ろす"),
    (8.5, 9.5, "bottom", "hip", "反り腰・丸まりに注意"),
    (9.5, 10.5, "bottom", "knee", "膝は伸ばしたまま"),
    (10.5, 11.5, "bottom", "foot", "つま先を立てて床を押す"),
]

DOT_COLOR = "0xFFD24C"


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


def write_caption_files():
    os.makedirs(CAP_DIR, exist_ok=True)
    paths = {}
    for _, _, key, text in PLAIN_CAPTIONS:
        p = os.path.join(CAP_DIR, f"{key}.txt")
        with open(p, "w", encoding="utf-8") as f:
            f.write(text)
        paths[("plain", key)] = p
    for _, _, phase, part, text in PART_LABELS:
        p = os.path.join(CAP_DIR, f"{phase}_{part}.txt")
        with open(p, "w", encoding="utf-8") as f:
            f.write(text)
        paths[("part", phase, part)] = p
    return paths


def build_filter(anchors, caption_paths):
    filters = []

    for start, end, key, _text in PLAIN_CAPTIONS:
        path = ffmpeg_escape_path(caption_paths[("plain", key)])
        filters.append(
            f"drawtext=fontfile='{ffmpeg_escape_path(FONT)}':textfile='{path}':"
            f"fontsize=26:fontcolor=white:box=1:boxcolor=black@0.55:boxborderw=8:"
            f"x=(w-text_w)/2:y=h-72:enable='between(t,{start},{end})'"
        )

    for start, end, phase, part, _text in PART_LABELS:
        ax, ay = anchors[phase][part]
        path = ffmpeg_escape_path(caption_paths[("part", phase, part)])
        # ドット(部位そのものを指すマーカー)
        filters.append(
            f"drawbox=x={ax - 5}:y={ay - 5}:w=10:h=10:color={DOT_COLOR}@0.95:t=fill:"
            f"enable='between(t,{start},{end})'"
        )
        # ラベルは画面中央側(x<320なら右、それ以外は左)に隣接配置し、ドットと視覚的に繋がって見えるようにする
        if ax < 320:
            x_expr = f"{ax + 16}"
        else:
            x_expr = f"{ax - 16}-text_w"
        y_expr = f"{ay - 14}"
        filters.append(
            f"drawtext=fontfile='{ffmpeg_escape_path(FONT)}':textfile='{path}':"
            f"fontsize=22:fontcolor=0xFFD24C:box=1:boxcolor=black@0.6:boxborderw=6:"
            f"x={x_expr}:y={y_expr}:enable='between(t,{start},{end})'"
        )

    return ",".join(filters)


def encode(filter_str):
    cmd = [
        FFMPEG_EXE, "-y",
        "-framerate", str(FPS),
        "-i", os.path.join(FRAMES_DIR, "f_%04d.png"),
        "-vf", filter_str,
        "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart",
        OUT_FILE,
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace")
    if result.returncode != 0:
        raise RuntimeError("ffmpegエンコードに失敗しました:\n" + result.stderr[-3000:])


def cleanup():
    import shutil
    import time
    if not os.path.isdir(FRAMES_DIR):
        return
    # OneDriveの同期が一時的にファイルをロックしていることがあるので、少し待って再試行する
    for attempt in range(5):
        try:
            shutil.rmtree(FRAMES_DIR)
            return
        except PermissionError:
            time.sleep(2)
    print(f"警告: {FRAMES_DIR} の削除に失敗しました。手動で削除してください。")


def main():
    print("1/4 アンカー座標を取得中...")
    anchors = get_anchors()
    print("2/4 フレームをレンダリング中...")
    render_frames()
    print("3/4 字幕・ラベルを生成してエンコード中...")
    caption_paths = write_caption_files()
    filter_str = build_filter(anchors, caption_paths)
    encode(filter_str)
    print("4/4 一時ファイルを削除中...")
    cleanup()
    print(f"完了: {OUT_FILE}")


if __name__ == "__main__":
    main()
