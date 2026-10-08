#!/bin/bash
# Trims Gemini TTS clips' silent heads and tails and limits peaks to about -3 dBFS (AAC overshoot clips on iPad speakers).
set -euo pipefail
for f in public/audio/voice/*.m4a; do
  tmp="${f%.m4a}.tmp.m4a"
  ffmpeg -loglevel error -y -i "$f" -af "silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.03,areverse,silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.08,areverse,alimiter=limit=0.7:level=false" -c:a aac -b:a 64k "$tmp"
  mv "$tmp" "$f"
done
