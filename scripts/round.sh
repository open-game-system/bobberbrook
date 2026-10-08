#!/bin/zsh
# scripts/round.sh NN — evidence for one AAA critic round. Needs the dev server on 8841.
set -uo pipefail
cd "${0:A:h}/.."
N=${1:?round}
OUT=critic/rounds/$N; mkdir -p $OUT
export BB_URL=${BB_URL:-http://127.0.0.1:8841}
RIG=~/src/skills/game-rig/bin/game-rig.mjs
pnpm -s build:client > /dev/null
# 1. TV scene contact sheet (every hero moment × time of day) + metrics (programs, p95 frame ms).
node scripts/shoot-scene.mjs --round r$N --base $BB_URL > $OUT/scene.log 2>&1
rm -rf $OUT/scene && cp -R critic/scene/r$N $OUT/scene && rm -rf critic/scene/r$N
# 2. Every screen × viewport (TV, Dad's phone, Juneau's iPad) with automatic checks.
$RIG check --out $OUT/check > $OUT/check.log 2>&1 || true
# 2b. Every controller state on the iPad and the phone, at CSS scale.
npx tsx scripts/phones.mts $OUT/phones > $OUT/phones.log 2>&1 || true
# 3. The recorded session: TV | Dad's phone | Juneau's iPad with real TV audio, av-verdict.
$RIG record --no-open --out $OUT/session.mp4 > $OUT/session.log 2>&1 || true
mkdir -p recordings/progress && cp $OUT/session.mp4 recordings/progress/round-$N.mp4
cp $OUT/raw/marks.json $OUT/marks.json 2>/dev/null || true
ffmpeg -v error -y -i $OUT/session.mp4 -vf "fps=1/5,scale=640:-1,tile=4x6" -frames:v 1 $OUT/session-tiles.png
ffmpeg -v error -y -i $OUT/raw/tv-audio.webm -lavfi showspectrumpic=s=1600x400:legend=1 $OUT/tv-audio-spectrogram.png
python3 scripts/audio-report.py $OUT > /dev/null
ls $OUT
