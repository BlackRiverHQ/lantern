import sys, json, numpy as np, librosa
out = {}
for p in sys.argv[1:]:
    y, sr = librosa.load(p, sr=22050, mono=True, duration=90)
    tempo, fr = librosa.beat.beat_track(y=y, sr=sr)
    beats = librosa.frames_to_time(fr, sr=sr)
    rms = librosa.feature.rms(y=y, hop_length=sr)[0]
    db = (20*np.log10(rms+1e-9)).round(1)
    full = librosa.get_duration(path=p)
    out[p] = dict(bpm=float(np.atleast_1d(tempo)[0]), first_beat=float(beats[0]) if len(beats) else None,
                  dur=round(full,1), rms_per_s=db[:45].tolist())
    print(p, round(out[p]['bpm'],1), 'first', round(out[p]['first_beat'],2), 'dur', out[p]['dur'])
    print('  rms/s', db[:45].tolist())
json.dump(out, open('research/music-survey.json','w'), indent=1)
