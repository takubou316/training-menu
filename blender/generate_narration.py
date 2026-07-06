"""
VOICEVOX(ずんだもん)でプッシュアップ解説のナレーション音声を生成し、
各セリフの長さ(24fpsのフレーム数に切り上げ)をtimeline.jsonにまとめる。

事前にVOICEVOXエンジン(vv-engine/run.exe)を起動しておくこと
(http://localhost:50021 で待ち受け)。

出力:
  blender/narration/pushup/<name>.wav      各セリフの音声(尺に合わせて無音パディング済み)
  blender/narration/pushup/timeline.json   セグメント名・テキスト・フレーム数・累積フレーム位置

このtimeline.jsonをbuild_pushup.py(ポーズのタイミング)とrender_pushup.py
(字幕・音声の合成タイミング)の両方が読み込むことで、ナレーションの長さと
映像の静止時間を自動的に一致させる。
"""

import json
import math
import os
import subprocess
import urllib.parse
import urllib.request

FPS = 24
SPEAKER_ID = 3  # ずんだもん(ノーマル)
ENGINE_URL = "http://localhost:50021"

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
NARRATION_DIR = os.path.join(SCRIPT_DIR, "narration", "pushup")
FFMPEG_EXE = r"C:\Users\takub\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-8.1.2-full_build\bin\ffmpeg.exe"
FFPROBE_EXE = r"C:\Users\takub\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-8.1.2-full_build\bin\ffprobe.exe"

# 表示順(この順番がそのままタイムラインの再生順になる)
# (name, phase, text)
# phase: "top_hold" / "descend" / "bottom_hold" / "ascend"
SEGMENTS = [
    ("intro", "top_hold", "体は頭からかかとまで一直線をキープ"),
    ("top_head", "top_hold", "視線はやや前の床"),
    ("top_neck", "top_hold", "首は一直線"),
    ("top_shoulder", "top_hold", "肩をすくめない"),
    ("top_hand", "top_hold", "手は肩幅よりやや広め"),
    ("down", "descend", "吸う、胸が床につくまで下ろす"),
    ("bottom_elbow", "bottom_hold", "肘は体から四十五度から六十度外側"),
    ("bottom_chest", "bottom_hold", "胸が床につくまで下ろす"),
    ("bottom_hip", "bottom_hold", "反り腰、丸まりに注意"),
    ("bottom_knee", "bottom_hold", "膝は伸ばしたまま"),
    ("bottom_foot", "bottom_hold", "つま先を立てて床を押す"),
    ("breathe", "bottom_hold", "呼吸を止めない"),
    ("up", "ascend", "吐く、元の姿勢まで上げる"),
]

# 画面表示用のテキスト(ナレーションの数字の読みと表記を分けたい箇所だけ上書き)
DISPLAY_TEXT_OVERRIDES = {
    "bottom_elbow": "肘は体から45〜60度外側",
    "bottom_hip": "反り腰・丸まりに注意",
    "down": "吸う：胸が床につくまで下ろす",
    "up": "吐く：元の姿勢まで上げる",
}


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
        capture_output=True, text=True,
    )
    return float(result.stdout.strip())


def pad_to_duration(in_path, out_path, target_duration):
    subprocess.run(
        [FFMPEG_EXE, "-y", "-i", in_path, "-af",
         f"apad=whole_dur={target_duration}", "-t", str(target_duration), out_path],
        capture_output=True, text=True, check=True,
    )


def main():
    os.makedirs(NARRATION_DIR, exist_ok=True)
    timeline = []
    frame_cursor = 1

    for name, phase, text in SEGMENTS:
        raw_path = os.path.join(NARRATION_DIR, f"{name}_raw.wav")
        final_path = os.path.join(NARRATION_DIR, f"{name}.wav")
        print(f"合成中: {name} ({text})")
        synthesize(text, raw_path)
        raw_duration = get_duration(raw_path)
        # 読み上げ後に少し間を持たせる(0.35秒)
        padded_duration = raw_duration + 0.35
        frame_count = max(1, math.ceil(padded_duration * FPS))
        exact_duration = frame_count / FPS
        pad_to_duration(raw_path, final_path, exact_duration)
        os.remove(raw_path)

        start_frame = frame_cursor
        end_frame = frame_cursor + frame_count
        timeline.append({
            "name": name,
            "phase": phase,
            "text": DISPLAY_TEXT_OVERRIDES.get(name, text),
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
    print(f"総フレーム数: {frame_cursor - 1} ({(frame_cursor - 1) / FPS:.2f}秒)")


if __name__ == "__main__":
    main()
