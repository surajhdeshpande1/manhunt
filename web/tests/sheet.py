import sys
from PIL import Image
# usage: sheet.py out.png scale maxh img1 img2 ...
out, scale, maxh = sys.argv[1], float(sys.argv[2]), int(sys.argv[3])
ims = [Image.open(f).convert('RGB') for f in sys.argv[4:]]
ims = [i.crop((0, 0, i.width, min(i.height, maxh))) for i in ims]
w = sum(i.width for i in ims) + 12 * (len(ims) - 1); h = max(i.height for i in ims)
o = Image.new('RGB', (w, h), (255, 255, 255)); x = 0
for i in ims: o.paste(i, (x, 0)); x += i.width + 12
o.resize((int(w * scale), int(h * scale)), Image.LANCZOS).save(out)
