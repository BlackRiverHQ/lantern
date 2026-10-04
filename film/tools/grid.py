import sys, json, numpy as np, librosa
p = sys.argv[1]; start = float(sys.argv[2]) if len(sys.argv) > 2 else 0
y, sr = librosa.load(p, sr=44100, mono=True, offset=start, duration=40)
tempo, fr = librosa.beat.beat_track(y=y, sr=sr, tightness=400)
b = librosa.frames_to_time(fr, sr=sr)
d = np.diff(b)
print('bpm', float(np.atleast_1d(tempo)[0]), 'n', len(b), 'ibi mean', d.mean().round(4), 'std', d.std().round(4))
print('beats', b[:20].round(3).tolist())
# low-band onset (kick) times
S = np.abs(librosa.stft(y, n_fft=2048, hop_length=256))
f = librosa.fft_frequencies(sr=sr, n_fft=2048)
low = S[(f > 30) & (f < 150)].sum(0)
on = librosa.onset.onset_detect(onset_envelope=librosa.onset.onset_strength(S=librosa.amplitude_to_db(S[(f>30)&(f<150)]), sr=sr, hop_length=256), sr=sr, hop_length=256, units='time')
print('kicks', on[:24].round(3).tolist())
# band energy per bar
for name, lo, hi in [('sub', 30, 150), ('mid', 150, 2000), ('hi', 2000, 10000)]:
    e = S[(f > lo) & (f < hi)].sum(0); t = librosa.frames_to_time(np.arange(len(e)), sr=sr, hop_length=256)
    per = [20*np.log10(e[(t >= i) & (t < i+1)].mean()+1e-9) for i in range(32)]
    print(name, np.round(per, 0).astype(int).tolist())
json.dump(dict(bpm=float(np.atleast_1d(tempo)[0]), beats=b.round(4).tolist(), kicks=on.round(4).tolist()), open(sys.argv[3] if len(sys.argv) > 3 else '/dev/null', 'w'))
