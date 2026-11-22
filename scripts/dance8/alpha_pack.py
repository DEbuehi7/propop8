"""Mattes a take for an edit list (docs/DANCE8_OCULAR_DIRECTOR.md, "Edit lists").

Writes the take packed side by side, so the picture and its matte can never
drift apart: the left half is the picture, the right half the matte (white =
the performer). The u2net_human_seg model runs on every --every-th frame and
the frames between take the mean of their neighbours' mattes. Offline: the
model is a local file and nothing is uploaded or paid for.

Needs Python 3 with numpy, opencv-python and onnxruntime, ffmpeg on the path,
and the u2net_human_seg.onnx model from the rembg project (danielgatis/rembg on
GitHub), sha256 01eb6a29a5c4d8edb30b56adad9bb3a2a0535338e480724a213e0acfd2d1c73c.

usage: python3 -I scripts/dance8/alpha_pack.py <take.mp4> <packed.mp4> <u2net_human_seg.onnx> --size WxH [--fps 24] [--every 2] [--threads 1]
"""
import sys, subprocess, time, numpy as np, onnxruntime as ort, cv2
src, out, model = sys.argv[1:4]
opt = dict(zip(sys.argv[4::2], sys.argv[5::2]))
fps, every, th = int(opt.get("--fps", "24")), int(opt.get("--every", "2")), int(opt.get("--threads", "1"))
W, H = map(int, opt["--size"].split("x"))
dec = subprocess.Popen(["ffmpeg", "-v", "error", "-i", src, "-vf", f"fps={fps},scale={W}:{H}:flags=lanczos", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], stdout=subprocess.PIPE)
enc = subprocess.Popen(["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{2*W}x{H}", "-r", str(fps), "-i", "-",
                        "-an", "-c:v", "libx264", "-crf", "16", "-preset", "medium", "-pix_fmt", "yuv420p", "-movflags", "+faststart", out], stdin=subprocess.PIPE)
so = ort.SessionOptions(); so.intra_op_num_threads = th; so.inter_op_num_threads = 1
sess = ort.InferenceSession(model, so, providers=["CPUExecutionProvider"]); name = sess.get_inputs()[0].name
mean, std = np.array([0.485, 0.456, 0.406], np.float32), np.array([0.229, 0.224, 0.225], np.float32)
def infer(f):
    x = cv2.resize(f, (320, 320), interpolation=cv2.INTER_AREA).astype(np.float32) / 255.0
    x = ((x / max(x.max(), 1e-6)) - mean) / std
    m = sess.run(None, {name: x.transpose(2, 0, 1)[None]})[0][0, 0]
    m = (m - m.min()) / max(m.max() - m.min(), 1e-6)
    m = cv2.resize(m, (W, H), interpolation=cv2.INTER_LINEAR)
    return np.clip((m - 0.35) / 0.3, 0, 1)
def write(f, m):
    g = (m * 255).astype(np.uint8)
    enc.stdin.write(np.concatenate([f, np.repeat(g[..., None], 3, 2)], 1).tobytes())
t0 = time.time(); pend = []; last = None; k = 0; smooth = None
while True:
    b = dec.stdout.read(W * H * 3)
    if len(b) < W * H * 3: break
    f = np.frombuffer(b, np.uint8).reshape(H, W, 3)
    if k % every == 0:
        m = infer(f)
        smooth = m if smooth is None else 0.8 * m + 0.2 * smooth
        for j, pf in enumerate(pend):                      # frames since the last inference
            a = (j + 1) / (len(pend) + 1)
            write(pf, (1 - a) * last + a * smooth)
        pend = []; last = smooth; write(f, smooth)
    else:
        pend.append(f.copy())
    k += 1
    if k % 240 == 0: print(f"{out}: {k} frames, {time.time() - t0:.0f} s", flush=True)
for pf in pend: write(pf, last)
enc.stdin.close(); enc.wait()
print(f"{out}: done, {k} frames, {time.time() - t0:.0f} s", flush=True)
