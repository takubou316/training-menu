"""
VOICEVOX(ずんだもん)でプッシュアップ解説のナレーション音声を生成する。

方式: 「1レップ(上→下→上)を1つの説明区切り」として、レップを繰り返しながら
注意点を1つずつナレーションする(ポーズを静止させたまま複数の注意点を
まとめて説明する方式はやめ、実際のトレーニング動画のように動き続ける)。

各レップの長さは「自然な最小レップ時間」と「そのレップのナレーション音声の
長さ+余韻」のうち長い方に合わせ、24fpsのフレーム数に切り上げる。

事前にVOICEVOXエンジン(vv-engine/run.exe)を起動しておくこと
(http://localhost:50021 で待ち受け)。

出力:
  blender/narration/pushup/<name>.wav      各レップのナレーション音声(尺に合わせて無音パディング済み)
  blender/narration/pushup/timeline.json   レップ名・テキスト・カメラ・フレーム範囲
"""

import json
import math
import os
import subprocess
import urllib.parse
import urllib.request

FPS = 24
MIN_REP_FRAMES = 72  # 1レップの最短尺(3秒。ナレーションが短くても不自然に速くならないように)
SPEAKER_ID = 3  # ずんだもん(ノーマル)
ENGINE_URL = "http://localhost:50021"

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
NARRATION_DIR = os.path.join(SCRIPT_DIR, "narration", "pushup")
FFMPEG_EXE = r"C:\Users\takub\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-8.1.2-full_build\bin\ffmpeg.exe"
FFPROBE_EXE = r"C:\Users\takub\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-8.1.2-full_build\bin\ffprobe.exe"

# 表示順 = レップの再生順。(name, camera, ナレーション文, 画面表示用テキスト)
# camera: "main" = 横からの3/4アングル(通常のフォームチェック向き)
#         "top"  = 真上から見下ろす(肘の開きなど左右方向の動きを見せる時)
#         "front" = 正面寄りの低いアングル(手幅など左右の広さを見せる時)
#         "foot_close" = 足元に寄ったローアングル(つま先・足首の角度を見せる時)
REPS = [
    ("intro", "front",
     "手は肩幅よりやや広めに置いて、体を一直線に保ったまま上下に動きます",
     "手は肩幅よりやや広めに、体は一直線をキープ"),
    ("top_head", "main",
     "視線はやや前の床を見ます",
     "視線はやや前の床を見る"),
    ("top_neck", "main",
     "首は一直線を保ちます",
     "首は一直線をキープ"),
    ("top_shoulder", "main",
     "肩はすくめないようにします",
     "肩をすくめない"),
    ("bottom_elbow", "top",
     "肘は体から四十五度から六十度外側に開きます",
     "肘は体から45〜60度外側に開く"),
    ("bottom_chest", "main",
     "胸が床につくまでしっかり下ろします",
     "胸が床につくまで下ろす"),
    ("bottom_hip", "main",
     "反り腰や丸まりに注意します",
     "反り腰・丸まりに注意"),
    ("bottom_knee", "main",
     "膝は伸ばしたままにします",
     "膝は伸ばしたまま"),
    ("bottom_foot", "foot_close",
     "つま先を立てて床を押します",
     "つま先を立てて床を押す"),
    ("breathe", "main",
     "呼吸は止めずに、下ろす時に吸って上げる時に吐きます",
     "呼吸は止めない：下ろす時に吸う、上げる時に吐く"),
]


def synthesize(text, out_path):
    q = urllib.parse.quote(text)
    req = urllib.request.Request(f"{ENGINE_URL}/audio_query?text={q}&speaker={SPEAKER_ID}", method="POST")
    with urllib.request.urlopen(req) as resp:
        query = resp.read()

    req2 = urllib.request.Request(
        f"{ENGINE_URL}/synthesis?speaker={SPEAKER_ID}",
        data=query,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req2) as resp:
        audio = resp.read()

    with open(out_path, "wb") as f:
        f.write(audio)


def get_duration(path):
    result = subprocess.run(
        [FFPROBE_EXE, "-v", "error", "-show_entries", "format=duration",
         "-of", "default=noprint_wrappers=1:nokey=1", path],
        capture_output=True, text=True, encoding="utf-8", errors="replace",
    )
    return float(result.stdout.strip())


def pad_to_duration(in_path, out_path, target_duration):
    subprocess.run(
        [FFMPEG_EXE, "-y", "-i", in_path, "-af",
         f"apad=whole_dur={target_duration}", "-t", str(target_duration), out_path],
        capture_output=True, text=True, encoding="utf-8", errors="replace", check=True,
    )


def main():
    os.makedirs(NARRATION_DIR, exist_ok=True)
    timeline = []
    frame_cursor = 1

    for name, camera, narration_text, display_text in REPS:
        raw_path = os.path.join(NARRATION_DIR, f"{name}_raw.wav")
        final_path = os.path.join(NARRATION_DIR, f"{name}.wav")
        print(f"合成中: {name} ({narration_text})")
        synthesize(narration_text, raw_path)
        raw_duration = get_duration(raw_path)

        rep_frames = max(MIN_REP_FRAMES, math.ceil((raw_duration + 0.3) * FPS))
        exact_duration = rep_frames / FPS
        pad_to_duration(raw_path, final_path, exact_duration)
        os.remove(raw_path)

        start_frame = frame_cursor
        end_frame = frame_cursor + rep_frames
        timeline.append({
            "name": name,
            "camera": camera,
            "text": display_text,
            "audio": os.path.relpath(final_path, SCRIPT_DIR).replace("\\", "/"),
            "start_frame": start_frame,
            "end_frame": end_frame,
            "start_sec": round((start_frame - 1) / FPS, 4),
            "end_sec": round((end_frame - 1) / FPS, 4),
        })
        frame_cursor = end_frame

    timeline_path = os.path.join(NARRATION_DIR, "timeline.json")
    with open(timeline_path, "w", encoding="utf-8") as f:
        json.dump(timeline, f, ensure_ascii=False, indent=2)
    print(f"timeline.json を書き出しました: {timeline_path}")
    print(f"総フレーム数: {frame_cursor - 1} ({(frame_cursor - 1) / FPS:.2f}秒, {len(REPS)}レップ)")


if __name__ == "__main__":
    main()
