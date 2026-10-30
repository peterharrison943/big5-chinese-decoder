/**
 * Big5 → Unicode decoder.
 *
 * Big5 encodes Traditional Chinese in a two-byte scheme:
 *   Lead byte range: 0x81–0xFE
 *   Trail byte range: 0x40–0x7E  or  0xA1–0xFE
 *
 * Only single-byte ASCII (0x00–0x7F) passes through untouched. Bytes outside
 * the ASCII range that do not form a valid trail/lead pair are replaced with
 * U+FFFD REPLACEMENT CHARACTER, matching WHATWG decoder error policy.
 *
 * DESIGN DECISIONS
 * ----------------
 * - The lookup table is generated from the canonical WHATWG Big5 index
 *   (https://encoding.spec.whatwg.org/index-big5.txt) using the SAME pointer
 *   arithmetic the spec defines. This keeps behaviour identical to browsers
 *   for the ~13,700 entries that exist.
 * - We intentionally omit the User-Defined-Area (0x8140–0xA3FE / 0xA440–0xC8FE
 *   private extensions). Many files in the wild do not use them, and the
 *   WHATWG index already covers the 0x81 row via 0xA3 row. If you need UDA,
 *   pre-process bytes before calling decode().
 * - Replacement on invalid bytes is a hard trade-off: throwing would be
 *   defensible, but "produce a best-effort string" is what every browser does
 *   and what callers expect from a decoder called `decode`.
 */

import { BIG5_TABLE, POINTER_BASE } from './table.js';

/**
 * Stable, user-facing decoder name. Exported so callers can assert identity.
 */
export const BIG5_NAME = 'big5';

/**
 * Decode a sequence of Big5-encoded bytes into a Unicode string.
 *
 * @param {ArrayLike<number>} bytes — byte values 0–255; type ArrayLike so a
 *   plain Array, Uint8Array, or Int8Array all work without copies.
 * @returns {string} decoded text; invalid byte sequences become U+FFFD.
 */
export function decodeBig5(bytes) {
  if (bytes === null || bytes === undefined) {
    throw new TypeError('decodeBig5: bytes must be a non-null ArrayLike<number>');
  }
  const len = bytes.length;
  let out = '';
  let i = 0;

  while (i < len) {
    const b = bytes[i] >>> 0;
    if (b < 0x80) {
      // ASCII fast-path — 0x00–0x7F is identical to Unicode code points.
      out += String.fromCharCode(b);
      i += 1;
      continue;
    }

    // Potential lead byte. Big5 lead bytes are 0x81–0xFE.
    if (b >= 0x81 && b <= 0xFE) {
      if (i + 1 < len) {
        const t = bytes[i + 1] >>> 0;
        if ((t >= 0x40 && t <= 0x7E) || (t >= 0xA1 && t <= 0xFE)) {
          // Spec pointer arithmetic — keeps table layout identical to WHATWG.
          const pointer =
            (b - POINTER_BASE.LEAD) * POINTER_BASE.TRAIL_RANGE +
            (t - POINTER_BASE.TRAIL_LOW) +
            (t > 0x7F ? POINTER_BASE.HIGH_GAP : 0);
          const cp = pointer < BIG5_TABLE.length ? BIG5_TABLE[pointer] : undefined;
          if (cp !== undefined) {
            out += String.fromCharCode(cp);
          } else {
            out += '\uFFFD';
          }
          i += 2;
          continue;
        }
      }
      // Lead byte at end of input or trail out of range → one replacement
      // and advance by one so we can resync on the next byte.
      out += '\uFFFD';
      i += 1;
      continue;
    }

    // 0x80 is undefined in Big5 (unlike Shift_JIS which maps it to ¥).
    out += '\uFFFD';
    i += 1;
  }

  return out;
}

/**
 * Convenience wrapper for the overwhelmingly common case: callers already
 * have a Uint8Array (from fetch().arrayBuffer(), fs.readFileSync, etc.).
 *
 * @param {Uint8Array} buf
 * @returns {string}
 */
export function decodeBig5FromBuffer(buf) {
  if (!(buf instanceof Uint8Array)) {
    throw new TypeError('decodeBig5FromBuffer: expected a Uint8Array');
  }
  return decodeBig5(buf);
}
