#!/bin/bash
# usage: gen.sh <name> "<scene>"
S=~/src/skills/ai-art-assets/scripts
P="Stylized 3D game screenshot in the hand-painted fantasy MMO tradition: chunky low-poly geometry with soft bevels, oversized rounded trees and rocks, hand-painted diffuse textures with visible brush strokes and painted-in highlights, minimal specular, soft baked lighting, big readable shapes and saturated warm-cool colour, simple enough for a web game. Cozy, inviting, safe for small children. In-engine look, not a movie render, 16:9 widescreen. No text, no letters, no logos, no UI, no watermark, full bleed, no border."
node $S/codex.mjs run --prompt "$P Scene: $2" --out concept/art/$1.png
