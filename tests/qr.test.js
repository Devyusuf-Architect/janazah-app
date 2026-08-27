// The QR code drawn for two-factor enrolment.
//
// Why this is tested seriously rather than eyeballed: a QR code that is
// slightly wrong still looks exactly like a QR code. There is no visual
// failure mode. The person points their phone at it, the camera finds
// nothing, and they conclude two-factor authentication is broken — or worse,
// it decodes to a corrupted secret and they enrol an authenticator that will
// never produce an accepted code, locking themselves out of an account that
// can publish funeral notices in a masjid's name.
//
// The fixtures below were produced by an independent encoder (the Python
// `qrcode` package, which implements ISO/IEC 18004) and are compared module
// for module. They are not this implementation's own output recorded as
// gospel; they were generated elsewhere and this had to match them.
//
//   pip install qrcode
//   python3 -c "
//   from qrcode import QRCode; from qrcode.constants import ERROR_CORRECT_M
//   from qrcode.util import QRData, MODE_8BIT_BYTE
//   q = QRCode(error_correction=ERROR_CORRECT_M, border=0, box_size=1)
//   q.add_data(QRData(b'...', mode=MODE_8BIT_BYTE)); q.make(fit=True)
//   print('\n'.join(''.join('1' if v else '0' for v in r) for r in q.get_matrix()))"

import { test, describe } from 'node:test';
import { strict as assert } from 'node:assert';
import { createHash } from 'node:crypto';
import { encode } from '../public/js/qr.js';

const render = (result) =>
  result.modules.map((row) => row.map((v) => (v ? '1' : '0')).join(''));

const digest = (rows) => createHash('sha256').update(rows.join('\n')).digest('hex').slice(0, 16);

// Version 1, level M, mask 4, byte mode. Small enough to read, so a failure
// here shows which region went wrong rather than only that something did.
const HELLO = [
  '111111101101001111111',
  '100000100110101000001',
  '101110100111101011101',
  '101110101001001011101',
  '101110101000101011101',
  '100000101011001000001',
  '111111101010101111111',
  '000000001111100000000',
  '100010111111011111001',
  '000111001011100101111',
  '101100101011001110010',
  '111001000100011010000',
  '001011100100111000110',
  '000000001110111001011',
  '111111101100110001010',
  '100000100001100100010',
  '101110101001001110101',
  '101110100001100001011',
  '101110100111001111000',
  '100000100100011000000',
  '111111101000111110101',
];

describe('the encoded symbol matches an independent encoder', () => {
  test('version 1, module for module', () => {
    assert.deepEqual(render(encode('HELLO')), HELLO);
  });

  test('a real otpauth URI, at the versions one actually produces', () => {
    // These are the payloads this feature exists for. The last is a long
    // address with every optional TOTP parameter present, which is what
    // pushes a symbol into version 9 and brings the version-information
    // blocks into play.
    const cases = [
      ['https://taziyah.example/n/abc123', 3, '1865c5b6fb166d57'],
      ["otpauth://totp/Ta'ziyah:imam@example.com?secret=JBSWY3DPEHPK3PXP&issuer=Ta'ziyah",
        5, '5b99a01000e66132'],
      ['A'.repeat(100), 6, 'd4240e8b8f4b89cc'],
      ['otpauth://totp/Ta%27ziyah:a.very.long.email.address@some-masjid-domain'
        + '.example.ca?secret=NB2W45DFOIZA4TZANBQXG43XN5ZGI3TB&issuer=Ta%27ziyah'
        + '&algorithm=SHA1&digits=6&period=30', 9, '46bb9b84ccc39f71'],
    ];
    for (const [text, version, hash] of cases) {
      const result = encode(text);
      assert.equal(result.version, version, `wrong version for ${text.slice(0, 40)}`);
      assert.equal(digest(render(result)), hash,
        `matrix differs from the reference encoder for ${text.slice(0, 40)}`);
    }
  });
});

describe('structure', () => {
  const symbol = encode("otpauth://totp/Ta'ziyah:a@b.c?secret=JBSWY3DPEHPK3PXP");

  test('the three finder patterns are present and correctly formed', () => {
    // A camera locates a symbol by these before it reads anything.
    const corners = [[0, 0], [0, symbol.size - 7], [symbol.size - 7, 0]];
    for (const [top, left] of corners) {
      for (let r = 0; r < 7; r += 1) {
        for (let c = 0; c < 7; c += 1) {
          const ring = r === 0 || r === 6 || c === 0 || c === 6;
          const core = r >= 2 && r <= 4 && c >= 2 && c <= 4;
          assert.equal(symbol.modules[top + r][left + c], ring || core,
            `finder at ${top},${left} is wrong at ${r},${c}`);
        }
      }
    }
  });

  test('the timing patterns alternate', () => {
    for (let i = 8; i < symbol.size - 8; i += 1) {
      assert.equal(symbol.modules[6][i], i % 2 === 0, `row timing wrong at ${i}`);
      assert.equal(symbol.modules[i][6], i % 2 === 0, `column timing wrong at ${i}`);
    }
  });

  test('the dark module is set', () => {
    // Always 1, in every symbol at every version. A reliable canary for the
    // format-information region having been written over it.
    assert.equal(symbol.modules[symbol.size - 8][8], true);
  });

  test('the size follows the version', () => {
    assert.equal(symbol.size, 17 + symbol.version * 4);
    assert.equal(symbol.modules.length, symbol.size);
    for (const row of symbol.modules) assert.equal(row.length, symbol.size);
  });

  test('the chosen mask is one of the eight', () => {
    assert.ok(symbol.mask >= 0 && symbol.mask <= 7);
  });
});

describe('capacity', () => {
  test('the version grows with the payload', () => {
    const versions = [10, 40, 90, 150, 200].map((n) => encode('x'.repeat(n)).version);
    for (let i = 1; i < versions.length; i += 1) {
      assert.ok(versions[i] >= versions[i - 1], 'versions must not shrink as data grows');
    }
    assert.equal(encode('x'.repeat(10)).version, 1);
  });

  test('a payload too long to encode throws rather than truncating', () => {
    // Silently dropping the end of an otpauth URI would produce a scannable
    // code carrying a corrupted secret, which is worse than an error.
    assert.throws(() => encode('x'.repeat(500)), /too long/);
  });

  test('non-ASCII is counted in bytes, not characters', () => {
    // The label in an otpauth URI can carry a masjid's name.
    const text = 'ة'.repeat(100);
    assert.ok(new TextEncoder().encode(text).length > 100);
    assert.doesNotThrow(() => encode(text));
  });
});
