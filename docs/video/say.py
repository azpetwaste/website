import sys, json, soundfile as sf
from kokoro_onnx import Kokoro
k = Kokoro('/tmp/tts/kokoro-v1.0.onnx', '/tmp/tts/voices-v1.0.bin')
lines = json.load(open(sys.argv[1]))
for i, t in enumerate(lines):
    a, sr = k.create(t, voice='am_michael', speed=0.98, lang='en-us')
    sf.write(f'/tmp/vidv2/a{i:02d}.wav', a, sr)
    print(i, round(len(a)/sr, 1))
