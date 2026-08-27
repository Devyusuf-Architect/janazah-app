// A QR code, drawn in SVG, with no dependency.
//
// Why this file exists at all: enrolling an authenticator app means scanning a
// QR code, and every off-the-shelf way to produce one is either a third-party
// script tag or a call to a remote image service. A remote service would be
// handed the otpauth:// URI, which contains the TOTP shared secret for
// somebody's account — sending that to anybody is the one thing this feature
// must never do. So the code is generated here, in the browser, and the secret
// never leaves it.
//
// Scope is deliberately narrow: byte mode, error-correction level M, versions
// 1 to 10. That covers otpauth:// URIs with room to spare and leaves out the
// numeric, alphanumeric and kanji modes, ECI, structured append, and micro QR,
// none of which this application will ever need. Correctness is checked in
// tests/qr.test.js against matrices produced by an independent encoder.
//
// Reference: ISO/IEC 18004. Names below follow the spec's vocabulary
// (codewords, blocks, masks, format information) so it can be read alongside.

/** Data codewords available in byte mode at level M, indexed by version. */
const BYTE_CAPACITY_M = [
  0, 14, 26, 42, 62, 84, 106, 122, 152, 180, 213,
];

/**
 * Per version at level M: [total codewords, EC codewords per block,
 * blocks in group 1, data codewords per group-1 block,
 * blocks in group 2, data codewords per group-2 block].
 */
const BLOCKS_M = [
  null,
  [26, 10, 1, 16, 0, 0],
  [44, 16, 1, 28, 0, 0],
  [70, 26, 1, 44, 0, 0],
  [100, 18, 2, 32, 0, 0],
  [134, 24, 2, 43, 0, 0],
  [172, 16, 4, 27, 0, 0],
  [196, 18, 4, 31, 0, 0],
  [242, 22, 2, 38, 2, 39],
  [292, 22, 3, 36, 2, 37],
  [346, 26, 4, 43, 1, 44],
];

/** Row/column centres of the alignment patterns, by version. */
const ALIGNMENT = [
  [], [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34],
  [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50],
];

// ---------------------------------------------------------------- GF(256)

const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i += 1) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    // The QR primitive polynomial, x^8 + x^4 + x^3 + x^2 + 1.
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i += 1) EXP[i] = EXP[i - 255];
})();

const gfMul = (a, b) => (a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]]);

/** The Reed-Solomon generator polynomial for `degree` EC codewords. */
function generatorPoly(degree) {
  let poly = [1];
  for (let i = 0; i < degree; i += 1) {
    const next = new Array(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j += 1) {
      // Coefficients descend, so multiplying by (x + a^i) raises the degree of
      // each term and adds the a^i product one place down.
      next[j] ^= poly[j];
      next[j + 1] ^= gfMul(poly[j], EXP[i]);
    }
    poly = next;
  }
  return poly;
}

/** The EC codewords for one block. */
function errorCorrection(data, ecCount) {
  const gen = generatorPoly(ecCount);
  const remainder = new Uint8Array(ecCount);
  for (const byte of data) {
    const factor = byte ^ remainder[0];
    remainder.copyWithin(0, 1);
    remainder[ecCount - 1] = 0;
    if (factor !== 0) {
      for (let i = 0; i < ecCount; i += 1) {
        remainder[i] ^= gfMul(gen[i + 1], factor);
      }
    }
  }
  return remainder;
}

// ------------------------------------------------------------------- BCH
//
// Computed rather than tabulated: a mistyped digit in a hardcoded format
// string produces a code that scans as the wrong thing rather than failing,
// which is the kind of error nobody finds by looking.

function bch(value, generator, bits) {
  let v = value << bits;
  const genBits = generator.toString(2).length;
  while (v.toString(2).length >= genBits) {
    v ^= generator << (v.toString(2).length - genBits);
  }
  return v;
}

/** 15-bit format information: EC level M (0b00) plus the mask. */
function formatBits(mask) {
  const data = (0b00 << 3) | mask;
  return ((data << 10) | bch(data, 0b10100110111, 10)) ^ 0b101010000010010;
}

/** 18-bit version information, used from version 7 upwards. */
function versionBits(version) {
  return (version << 12) | bch(version, 0b1111100100101, 12);
}

// -------------------------------------------------------------- encoding

/** UTF-8 bytes. otpauth URIs are ASCII, but a label may not be. */
function toBytes(text) {
  return new TextEncoder().encode(String(text));
}

function smallestVersion(byteLength) {
  for (let version = 1; version <= 10; version += 1) {
    if (byteLength <= BYTE_CAPACITY_M[version]) return version;
  }
  return null;
}

/** Mode indicator, character count, payload, terminator and padding. */
function dataCodewords(bytes, version) {
  const [total, ecPerBlock, g1, d1, g2, d2] = BLOCKS_M[version];
  const dataCount = total - ecPerBlock * (g1 + g2);
  // Byte mode's character-count field is 8 bits below version 10 and 16 from
  // version 10 up.
  const countBits = version < 10 ? 8 : 16;

  const bits = [];
  const push = (value, length) => {
    for (let i = length - 1; i >= 0; i -= 1) bits.push((value >> i) & 1);
  };

  push(0b0100, 4);
  push(bytes.length, countBits);
  for (const byte of bytes) push(byte, 8);

  // Terminator, up to four zero bits, then pad to a whole codeword.
  const capacity = dataCount * 8;
  for (let i = 0; i < 4 && bits.length < capacity; i += 1) bits.push(0);
  while (bits.length % 8 !== 0) bits.push(0);

  const codewords = [];
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j += 1) byte = (byte << 1) | bits[i + j];
    codewords.push(byte);
  }
  // The spec's pad codewords, alternating, until the block is full.
  const PADS = [0xec, 0x11];
  while (codewords.length < dataCount) {
    codewords.push(PADS[(codewords.length - bits.length / 8) % 2]);
  }
  return { codewords, ecPerBlock, groups: [[g1, d1], [g2, d2]] };
}

/** Split into blocks, add EC, and interleave as the spec requires. */
function interleave({ codewords, ecPerBlock, groups }) {
  const blocks = [];
  let at = 0;
  for (const [count, size] of groups) {
    for (let i = 0; i < count; i += 1) {
      const data = codewords.slice(at, at + size);
      at += size;
      blocks.push({ data, ec: errorCorrection(data, ecPerBlock) });
    }
  }

  const out = [];
  const longest = Math.max(...blocks.map((b) => b.data.length));
  for (let i = 0; i < longest; i += 1) {
    for (const block of blocks) {
      if (i < block.data.length) out.push(block.data[i]);
    }
  }
  for (let i = 0; i < ecPerBlock; i += 1) {
    for (const block of blocks) out.push(block.ec[i]);
  }
  return out;
}

// -------------------------------------------------------------- placement

function blankMatrix(size) {
  return {
    size,
    // -1 means "no module placed yet", so an unfinished matrix is a visible
    // fault rather than a silently white square.
    cells: Array.from({ length: size }, () => new Int8Array(size).fill(-1)),
    reserved: Array.from({ length: size }, () => new Uint8Array(size)),
  };
}

function place(m, row, col, value, reserve = true) {
  m.cells[row][col] = value;
  if (reserve) m.reserved[row][col] = 1;
}

function finder(m, row, col) {
  for (let r = -1; r <= 7; r += 1) {
    for (let c = -1; c <= 7; c += 1) {
      const rr = row + r;
      const cc = col + c;
      if (rr < 0 || cc < 0 || rr >= m.size || cc >= m.size) continue;
      const inRing = (r >= 0 && r <= 6 && (c === 0 || c === 6))
        || (c >= 0 && c <= 6 && (r === 0 || r === 6));
      const inCore = r >= 2 && r <= 4 && c >= 2 && c <= 4;
      place(m, rr, cc, inRing || inCore ? 1 : 0);
    }
  }
}

function alignment(m, version) {
  const centres = ALIGNMENT[version];
  const first = centres[0];
  const last = centres[centres.length - 1];
  for (const row of centres) {
    for (const col of centres) {
      // Exactly three combinations are omitted: the ones the finder patterns
      // already occupy. Testing "is this module reserved" instead would also
      // drop the alignment patterns that legitimately sit on the timing rows,
      // which shifts every data module after them and produces a symbol that
      // is structurally a QR code and decodes to nothing.
      const onFinder = (row === first && col === first)
        || (row === first && col === last)
        || (row === last && col === first);
      if (onFinder) continue;
      for (let r = -2; r <= 2; r += 1) {
        for (let c = -2; c <= 2; c += 1) {
          const dark = Math.max(Math.abs(r), Math.abs(c)) !== 1;
          place(m, row + r, col + c, dark ? 1 : 0);
        }
      }
    }
  }
}

function functionPatterns(m, version) {
  finder(m, 0, 0);
  finder(m, 0, m.size - 7);
  finder(m, m.size - 7, 0);

  for (let i = 8; i < m.size - 8; i += 1) {
    const dark = i % 2 === 0 ? 1 : 0;
    place(m, 6, i, dark);
    place(m, i, 6, dark);
  }

  alignment(m, version);

  // The dark module, which is always set.
  place(m, m.size - 8, 8, 1);

  // Format information areas: reserved now, written after the mask is chosen.
  for (let i = 0; i < 9; i += 1) {
    if (!m.reserved[8][i]) place(m, 8, i, 0);
    if (!m.reserved[i][8]) place(m, i, 8, 0);
  }
  for (let i = 0; i < 8; i += 1) {
    if (!m.reserved[8][m.size - 1 - i]) place(m, 8, m.size - 1 - i, 0);
    if (!m.reserved[m.size - 1 - i][8]) place(m, m.size - 1 - i, 8, 0);
  }

  if (version >= 7) {
    const bits = versionBits(version);
    for (let i = 0; i < 18; i += 1) {
      const bit = (bits >> i) & 1;
      const row = Math.floor(i / 3);
      const col = i % 3;
      place(m, row, m.size - 11 + col, bit);
      place(m, m.size - 11 + col, row, bit);
    }
  }
}

/** The two-column zigzag, bottom-right upwards, skipping the timing column. */
function placeData(m, codewords) {
  let bit = 0;
  const next = () => {
    const index = bit >> 3;
    if (index >= codewords.length) return 0;
    const value = (codewords[index] >> (7 - (bit & 7))) & 1;
    bit += 1;
    return value;
  };

  let upward = true;
  for (let right = m.size - 1; right > 0; right -= 2) {
    if (right === 6) right = 5; // The vertical timing pattern is not data.
    for (let step = 0; step < m.size; step += 1) {
      const row = upward ? m.size - 1 - step : step;
      for (const col of [right, right - 1]) {
        if (m.reserved[row][col]) continue;
        m.cells[row][col] = next();
      }
    }
    upward = !upward;
  }
}

const MASKS = [
  (r, c) => (r + c) % 2 === 0,
  (r) => r % 2 === 0,
  (r, c) => c % 3 === 0,
  (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
  (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
  (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
];

function applyMask(m, mask) {
  const fn = MASKS[mask];
  const out = {
    size: m.size,
    cells: m.cells.map((row) => Int8Array.from(row)),
    reserved: m.reserved,
  };
  for (let r = 0; r < m.size; r += 1) {
    for (let c = 0; c < m.size; c += 1) {
      if (m.reserved[r][c]) continue;
      if (fn(r, c)) out.cells[r][c] ^= 1;
    }
  }
  return out;
}

/** The spec's four penalty rules; the lowest total wins. */
function penalty(m) {
  const { size, cells } = m;
  let score = 0;

  const runPenalty = (line) => {
    let total = 0;
    let run = 1;
    for (let i = 1; i < line.length; i += 1) {
      if (line[i] === line[i - 1]) {
        run += 1;
      } else {
        if (run >= 5) total += 3 + (run - 5);
        run = 1;
      }
    }
    if (run >= 5) total += 3 + (run - 5);
    return total;
  };

  for (let r = 0; r < size; r += 1) {
    score += runPenalty(Array.from(cells[r]));
    score += runPenalty(Array.from({ length: size }, (_, c) => cells[c][r]));
  }

  for (let r = 0; r < size - 1; r += 1) {
    for (let c = 0; c < size - 1; c += 1) {
      const v = cells[r][c];
      if (v === cells[r][c + 1] && v === cells[r + 1][c] && v === cells[r + 1][c + 1]) {
        score += 3;
      }
    }
  }

  const PATTERN = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0];
  const REVERSE = [0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1];
  const matches = (line, at, pattern) =>
    pattern.every((want, i) => line[at + i] === want);
  for (let r = 0; r < size; r += 1) {
    const row = Array.from(cells[r]);
    const col = Array.from({ length: size }, (_, i) => cells[i][r]);
    for (let i = 0; i + 11 <= size; i += 1) {
      if (matches(row, i, PATTERN) || matches(row, i, REVERSE)) score += 40;
      if (matches(col, i, PATTERN) || matches(col, i, REVERSE)) score += 40;
    }
  }

  let dark = 0;
  for (let r = 0; r < size; r += 1) {
    for (let c = 0; c < size; c += 1) if (cells[r][c] === 1) dark += 1;
  }
  const percent = (dark * 100) / (size * size);
  score += Math.floor(Math.abs(percent - 50) / 5) * 10;

  return score;
}

function writeFormat(m, mask) {
  const bits = formatBits(mask);
  // Most significant bit first: position 0 in the sequence below holds bit 14.
  // Reversing these is not a visible fault — the symbol still looks like a QR
  // code — it simply scans as the wrong error-correction level and mask, and
  // then fails to decode.
  const bitAt = (i) => (bits >> (14 - i)) & 1;

  // Copy one: around the top-left finder.
  for (let i = 0; i <= 5; i += 1) m.cells[8][i] = bitAt(i);
  m.cells[8][7] = bitAt(6);
  m.cells[8][8] = bitAt(7);
  m.cells[7][8] = bitAt(8);
  for (let i = 9; i <= 14; i += 1) m.cells[14 - i][8] = bitAt(i);

  // Copy two: seven bits up the left of the bottom-left finder, then eight
  // along the top of the bottom-right one. The vertical run stops one short of
  // row size-8, which belongs to the dark module and is not format data.
  for (let i = 0; i <= 6; i += 1) m.cells[m.size - 1 - i][8] = bitAt(i);
  for (let i = 7; i <= 14; i += 1) m.cells[8][m.size - 15 + i] = bitAt(i);
}

/**
 * Encode text as a QR matrix.
 *
 * @param {string} text
 * @returns {{size: number, modules: boolean[][], version: number, mask: number}}
 * @throws if the text is longer than a version-10 byte-mode symbol holds.
 */
export function encode(text) {
  const bytes = toBytes(text);
  const version = smallestVersion(bytes.length);
  if (!version) {
    throw new Error(`QR payload too long: ${bytes.length} bytes`);
  }

  const size = 17 + version * 4;
  const base = blankMatrix(size);
  functionPatterns(base, version);
  placeData(base, interleave(dataCodewords(bytes, version)));

  let best = null;
  for (let mask = 0; mask < 8; mask += 1) {
    const candidate = applyMask(base, mask);
    writeFormat(candidate, mask);
    const score = penalty(candidate);
    if (!best || score < best.score) best = { score, mask, matrix: candidate };
  }

  return {
    size,
    version,
    mask: best.mask,
    modules: best.matrix.cells.map((row) => Array.from(row, (v) => v === 1)),
  };
}

/**
 * The same code as an SVG element, ready to append.
 *
 * One path for every dark module rather than one rect each: a version-6 symbol
 * is over a thousand modules, and a thousand elements is a visibly slow paint
 * on a phone.
 */
export function qrSvg(text, { size = 200, label = 'QR code' } = {}) {
  const { size: count, modules } = encode(text);
  const quiet = 4;
  const span = count + quiet * 2;

  let path = '';
  for (let r = 0; r < count; r += 1) {
    for (let c = 0; c < count; c += 1) {
      if (modules[r][c]) path += `M${c + quiet} ${r + quiet}h1v1h-1z`;
    }
  }

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${span} ${span}`);
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', label);
  svg.classList.add('qr');
  // shape-rendering keeps the module edges hard at any scale; an anti-aliased
  // QR is harder for a phone camera to read.
  svg.setAttribute('shape-rendering', 'crispEdges');

  const background = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  background.setAttribute('width', String(span));
  background.setAttribute('height', String(span));
  background.setAttribute('fill', '#ffffff');
  svg.append(background);

  const dark = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  dark.setAttribute('d', path);
  // Always black on white, whatever the page theme. A themed QR code is a QR
  // code some scanners refuse.
  dark.setAttribute('fill', '#000000');
  svg.append(dark);

  return svg;
}
