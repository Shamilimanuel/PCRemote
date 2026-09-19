/**
 * Draws a QR code in the terminal, in Reveille's colours.
 *
 * Two half-blocks per character cell. A terminal cell is about twice as tall as
 * it is wide, so packing two QR rows into one line leaves each module roughly
 * square -- which is what a scanner needs. One character, U+2580 UPPER HALF
 * BLOCK, carries both: its foreground paints the top module and its background
 * the bottom one.
 *
 * The colours are the app's own dusk palette: a pale blue field with deep navy
 * modules, so the code belongs to the app rather than looking like every other
 * QR code. Polarity is the ordinary way round -- dark modules on a light field
 * -- because a scanner that refuses inverted codes is a scanner somebody owns.
 * The pair measures 10.8:1, which is comfortable for a phone camera across a
 * desk.
 *
 * The quiet zone stays at the full four modules the specification asks for.
 * Trimming it is the obvious way to save four more lines and a tempting one,
 * but a light field that differs from the terminal's own background provides no
 * quiet zone of its own, and an intermittently unscannable code is a worse bug
 * than a tall one.
 */

const UPPER_HALF = '▀';
const RESET = '[0m';

// Dusk, from THEMES in front-end/src/theme/clay.ts.
const DARK = [0x12, 0x1a, 0x33];   // deep navy, the modules
const LIGHT = [0xb9, 0xcc, 0xff];  // pale blue, the field

/** Four modules, per the QR specification. */
const QUIET_ZONE = 4;

function fg([r, g, b]) {
  return `[38;2;${r};${g};${b}m`;
}

function bg([r, g, b]) {
  return `[48;2;${r};${g};${b}m`;
}

/** How wide the drawn code is, in characters, for laying out around it. */
function widthOf(qr) {
  return qr.modules.size + QUIET_ZONE * 2;
}

/**
 * @param {{ modules: { size: number, data: Uint8Array } }} qr from QRCode.create
 * @param {{ colour?: boolean, indent?: string, dark?: number[], light?: number[] }} options
 * @returns {string}
 */
function render(qr, { colour = true, indent = '', dark = DARK, light = LIGHT } = {}) {
  const size = qr.modules.size;
  const data = qr.modules.data;
  const full = size + QUIET_ZONE * 2;

  // true = dark module. Anything in the quiet zone is light.
  const isDark = (row, col) => {
    const r = row - QUIET_ZONE;
    const c = col - QUIET_ZONE;
    if (r < 0 || c < 0 || r >= size || c >= size) return false;
    return Boolean(data[r * size + c]);
  };

  const lines = [];
  for (let row = 0; row < full; row += 2) {
    let line = indent;
    let painted = null;

    for (let col = 0; col < full; col++) {
      const top = isDark(row, col);
      // An odd number of rows leaves the last line with no bottom half. Light
      // is right: it continues the quiet zone rather than inventing a module.
      const bottom = row + 1 < full ? isDark(row + 1, col) : false;

      if (!colour) {
        // No escape codes anywhere: a terminal that would print them as
        // rubbish gets block characters that still read as a QR code.
        line += top && bottom ? '█' : top ? UPPER_HALF : bottom ? '▄' : ' ';
        continue;
      }

      const want = (top ? 'D' : 'L') + (bottom ? 'D' : 'L');
      if (want !== painted) {
        // Only re-emit the escapes when the pair actually changes. A 45-wide
        // code would otherwise carry about 1,800 escape sequences per line.
        line += fg(top ? dark : light) + bg(bottom ? dark : light);
        painted = want;
      }
      line += UPPER_HALF;
    }

    lines.push(colour ? line + RESET : line);
  }

  return lines.join('\n');
}

module.exports = { render, widthOf, DARK, LIGHT, QUIET_ZONE };
