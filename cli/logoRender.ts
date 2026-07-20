const DOT_BITS = [
  [0x01, 0x08],
  [0x02, 0x10],
  [0x04, 0x20],
  [0x40, 0x80],
];

function toBinaryGrid(source: string): boolean[][] {
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  const width = Math.max(0, ...lines.map((line) => line.length));
  return lines.map((line) => {
    const padded = line.padEnd(width, ' ');
    return [...padded].map((ch) => ch !== ' ');
  });
}

export function renderLogo(source: string, targetCols: number): string {
  const grid = toBinaryGrid(source);
  const srcH = grid.length;
  const srcW = grid[0]?.length ?? 0;
  if (srcW === 0 || srcH === 0 || targetCols <= 0) return '';

  const targetBmpW = targetCols * 2;
  const rawBmpH = Math.max(4, Math.round(targetBmpW * (srcH / srcW)));
  const finalBmpH = rawBmpH - (rawBmpH % 4) || 4;
  const targetRows = finalBmpH / 4;

  function anyPixelOn(px0: number, px1: number, py0: number, py1: number): boolean {
    for (let y = py0; y < py1; y++) {
      for (let x = px0; x < px1; x++) {
        if (grid[y]?.[x]) return true;
      }
    }
    return false;
  }

  function sampleDot(tx: number, ty: number): boolean {
    const x0 = Math.floor((tx / targetBmpW) * srcW);
    const x1 = Math.max(x0 + 1, Math.floor(((tx + 1) / targetBmpW) * srcW));
    const y0 = Math.floor((ty / finalBmpH) * srcH);
    const y1 = Math.max(y0 + 1, Math.floor(((ty + 1) / finalBmpH) * srcH));
    return anyPixelOn(x0, x1, y0, y1);
  }

  const lines: string[] = [];
  for (let r = 0; r < targetRows; r++) {
    let line = '';
    for (let c = 0; c < targetCols; c++) {
      let code = 0;
      for (let dy = 0; dy < 4; dy++) {
        for (let dx = 0; dx < 2; dx++) {
          if (sampleDot(c * 2 + dx, r * 4 + dy)) code |= DOT_BITS[dy][dx];
        }
      }
      line += String.fromCodePoint(0x2800 + code);
    }
    lines.push(line);
  }
  return lines.join('\n');
}
