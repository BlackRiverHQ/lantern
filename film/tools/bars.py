import sys, numpy as np, librosa
p=sys.argv[1]; bpm=float(sys.argv[2]); b0=float(sys.argv[3])
y,sr=librosa.load(p,sr=22050,mono=True,duration=100)
bar=4*60/bpm
S=np.abs(librosa.stft(y,n_fft=2048,hop_length=512)); f=librosa.fft_frequencies(sr=sr,n_fft=2048); t=librosa.frames_to_time(np.arange(S.shape[1]),sr=sr,hop_length=512)
for i in range(int((len(y)/sr-b0)/bar)):
  m=(t>=b0+i*bar)&(t<b0+(i+1)*bar)
  e=lambda lo,hi: 10*np.log10((S[(f>lo)&(f<hi)][:,m]**2).mean()+1e-12)
  print(f"bar{i:02d} t={b0+i*bar:6.2f} sub={e(30,150):5.1f} mid={e(150,2000):5.1f} hi={e(2000,9000):5.1f}")
