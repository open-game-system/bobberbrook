#!/bin/bash
# Trims Gemini TTS clips' silent heads and tails and limits peaks to about -3 dBFS. MP3, not AAC: the OGS
# cloud renderer's Chrome is not verified to decode AAC, and a clip that fails to decode is silently skipped.
set -euo pipefail
for f in public/audio/voice/*.mp3; do
  tmp="${f%.mp3}.tmp.mp3"
  ffmpeg -loglevel error -y -i "$f" -af "silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.03,areverse,silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.08,areverse,alimiter=limit=0.7:level=false" -codec:a libmp3lame -b:a 96k -ac 1 "$tmp"
  mv "$tmp" "$f"
done
