// Odd One accuracy: a turned or mirrored shape must look clearly different from the others.
// Draws each shape exactly as the puzzle does (turned about its centre / mirrored) and measures the pixel difference.
const { chromium } = require('playwright');
const fs = require('fs');
const src = fs.readFileSync(__dirname + '/../../src/tasks/ui.tsx', 'utf8');
const P = {}; for (const m of src.matchAll(/^\s+(\w+): '([^']+)',$/gm)) P[m[1]] = m[2];
const gen = fs.readFileSync(__dirname + '/../../src/tasks/gen.ts', 'utf8');
const list = (name) => JSON.parse(gen.match(new RegExp(`export const ${name}[^=]*= (\\[[^\\]]*\\])`))[1].replace(/'/g, '"'));
const TURNABLE = list('TURNABLE'), CHIRAL = list('CHIRAL');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage();
  await p.setContent('<canvas id=c width=96 height=96></canvas>');
  const diff = (path, a, b2) => p.evaluate(([path, a, b2]) => {
    const c = document.getElementById('c'), x = c.getContext('2d', { willReadFrequently: true });
    const draw = ({ rot, flip }) => { x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, 96, 96); x.translate(48, 48); x.rotate(rot * Math.PI / 180); x.scale(flip ? -4 : 4, 4); x.translate(-12, -12); x.fill(new Path2D(path)); return x.getImageData(0, 0, 96, 96).data; };
    const A = draw(a), B = draw(b2); let on = 0, d = 0;
    for (let i = 3; i < A.length; i += 4) { const pa = A[i] > 127, pb = B[i] > 127; if (pa || pb) on++; if (pa !== pb) d++; }
    return d / on;
  }, [path, a, b2]);
  let bad = 0;
  for (const g of TURNABLE) for (const t of [90, -90, 180, 35, -35]) {
    const v = await diff(P[g], { rot: 0 }, { rot: t });
    if (v < 0.12) { bad++; console.log(`TOO SIMILAR  turn ${g} by ${t}°: ${(v * 100).toFixed(1)}% of the shape differs`); }
  }
  for (const g of CHIRAL) {
    const v = await diff(P[g], { rot: 0 }, { rot: 0, flip: true });
    if (v < 0.12) { bad++; console.log(`TOO SIMILAR  mirror ${g}: ${(v * 100).toFixed(1)}% differs`); }
  }
  console.log(bad ? `${bad} problem(s)` : 'all turned and mirrored shapes are clearly different');
  await b.close(); process.exit(bad ? 1 : 0);
})();
