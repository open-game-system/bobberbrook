"""Audio evidence a critic can read without hearing it: per story section (between marks), loudness,
low-band (<250 Hz) and treble (>3 kHz) share, tonal onsets per minute (music-box notes and soft sound
effects) and broadband onsets per minute (clicks/thumps)."""
import json, subprocess, sys
import numpy as np

out = sys.argv[1]
raw = f"{out}/raw"
SR = 16000
pcm = subprocess.run(["ffmpeg", "-v", "error", "-i", f"{raw}/tv-audio.webm", "-ac", "1", "-ar", str(SR), "-f", "f32le", "-"], capture_output=True).stdout
x = np.frombuffer(pcm, dtype=np.float32)
marks = json.load(open(f"{raw}/marks.json"))["marks"]
# Audio started ~ when the TV "lobby" mark was made; align marks to the audio start.
t0 = marks[0]["t"] if marks else 0
bounds = [(m["label"], m["t"] - t0) for m in marks]
N = 1024
frames = len(x) // N
spec = np.abs(np.fft.rfft(x[: frames * N].reshape(frames, N) * np.hanning(N), axis=1))
freqs = np.fft.rfftfreq(N, 1 / SR)
energy = (spec ** 2).sum(axis=1) + 1e-12
low = (spec[:, freqs < 250] ** 2).sum(axis=1) / energy
high = (spec[:, freqs > 3000] ** 2).sum(axis=1) / energy
flux = np.maximum(0, np.diff(spec, axis=0)).sum(axis=1)
thresh = np.median(flux) * 6
onsets = np.where((flux[1:-1] > thresh) & (flux[1:-1] > flux[:-2]) & (flux[1:-1] >= flux[2:]))[0] + 1
fps = SR / N
rows = []
for i, (label, start) in enumerate(bounds):
    end = bounds[i + 1][1] if i + 1 < len(bounds) else len(x) / SR
    a, b = int(start * fps), int(end * fps)
    if b - a < 4:
        continue
    seg = x[int(start * SR): int(end * SR)]
    rms = 20 * np.log10(np.sqrt(np.mean(seg ** 2)) + 1e-9)
    seg_on = onsets[(onsets >= a) & (onsets < b)]
    # A click/thump is an onset whose frame is broadband (lots of energy >3 kHz or <120 Hz jump);
    # a music-box note is a tonal onset. Report them separately.
    clicks = int(sum(1 for o in seg_on if high[o] > 0.05 or (spec[o, freqs < 120] ** 2).sum() / energy[o] > 0.5))
    notes = len(seg_on) - clicks
    rows.append({"section": label, "seconds": round(end - start, 1), "rmsDbfs": round(float(rms), 1),
                 "lowShare<250Hz": round(float(low[a:b].mean()), 3), "trebleShare>3k": round(float(high[a:b].mean()), 4),
                 "tonalOnsetsPerMin (notes, sfx)": round(notes / max(1e-6, (end - start) / 60), 1),
                 "harshClicksOrThumpsPerMin (want ~0; soft paper foley is not counted here)": round(clicks / max(1e-6, (end - start) / 60), 1)})
json.dump(rows, open(f"{out}/audio-report.json", "w"), indent=1)
for r in rows: print(r)
