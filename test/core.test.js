import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import { decodeBig5, decodeBig5FromBuffer, BIG5_NAME } from '../src/index.js';

/**
 * Helper: turn a list of byte values into a fresh Uint8Array.
 * @param {...number} bytes
 * @returns {Uint8Array}
 */
function u8(...bytes) {
  return new Uint8Array(bytes);
}

/**
 * Big5 bytes for 「中」 (lead 0xA4, trail 0x55) → U+4E2D.
 */
const ZHONG_BYTES = [0xA4, 0x55];
const ZHONG_STR = '\u4E2D';

/**
 * Big5 bytes for 「文」 (lead 0xAB, trail 0x5C) → U+6587.
 */
const WEN_BYTES = [0xAB, 0x5C];
const WEN_STR = '\u6587';

test('BIG5_NAME is the stable string "big5"', () => {
  assert.equal(BIG5_NAME, 'big5');
});

test('ASCII fast-path: plain ASCII bytes round-trip exactly', () => {
  assert.equal(decodeBig5(u8(0x48, 0x65, 0x6C, 0x6C, 0x6F)), 'Hello');
});

test('ASCII control characters are preserved (0x00–0x1F are valid ASCII)', () => {
  assert.equal(decodeBig5(u8(0x09, 0x0A, 0x0D)), '\t\n\r');
});

test('Null byte is preserved as U+0000 (not skipped)', () => {
  assert.equal(decodeBig5(u8(0x41, 0x00, 0x42)), 'A\u0000B');
});

test('Single Traditional Chinese character 「中」 decodes correctly', () => {
  assert.equal(decodeBig5(u8(...ZHONG_BYTES)), ZHONG_STR);
});

test('Mixed ASCII and Big5 characters decode in sequence', () => {
  const bytes = u8(0x48, 0x69, 0x3A, ...ZHONG_BYTES); // "Hi:中"
  assert.equal(decodeBig5(bytes), 'Hi:' + ZHONG_STR);
});

test('Two Han characters in a row decode without overlap', () => {
  // 「中文」 in Big5: 中=A4 55, 文=AB 5C
  const bytes = u8(...ZHONG_BYTES, ...WEN_BYTES);
  assert.equal(decodeBig5(bytes), ZHONG_STR + WEN_STR);
});

test('Lead byte at end of input with no trail → one U+FFFD', () => {
  // 0xA4 is a valid lead byte but has no trail byte to consume.
  assert.equal(decodeBig5(u8(0xA4)), '\uFFFD');
});

test('Lead byte followed by invalid trail byte → U+FFFD, then resync', () => {
  // 0xA4 is lead; 0x80 is NOT a valid trail byte (gap between low/high ranges).
  // Decoder should emit one replacement for the lead, then re-process 0x80
  // (which is itself undefined in Big5 → another U+FFFD), then 0x41 as ASCII 'A'.
  assert.equal(decodeBig5(u8(0xA4, 0x80, 0x41)), '\uFFFD\uFFFDA');
});

test('0x80 alone (undefined in Big5) → U+FFFD', () => {
  assert.equal(decodeBig5(u8(0x80)), '\uFFFD');
});

test('High trail byte range (0xA1–0xFE) is accepted', () => {
  // 「一」 in Big5 is 0xA4 0x40 — low trail range.
  // Construct a high-trail byte pair by using 0xA4 0xA1; if unmapped we still
  // expect exactly one U+FFFD (because the pair is syntactically valid).
  const out = decodeBig5(u8(0xA4, 0xA1));
  assert.equal(out.length, 1);
  assert.equal(out, '\uFFFD');
});

test('Trail byte 0x7F is explicitly rejected (not in either valid range)', () => {
  // 0x7F is ASCII DEL but as a *trail* byte after a Big5 lead it is invalid
  // because the low range is 0x40–0x7E. The decoder should emit U+FFFD for
  // the lead and then re-process 0x7F as ASCII.
  assert.equal(decodeBig5(u8(0xA4, 0x7F)), '\uFFFD\u007F');
});

test('decodeBig5FromBuffer wraps decodeBig5 for Uint8Array input', () => {
  const buf = u8(...ZHONG_BYTES);
  assert.equal(decodeBig5FromBuffer(buf), ZHONG_STR);
});

test('decodeBig5FromBuffer rejects non-Uint8Array input with TypeError', () => {
  assert.throws(() => decodeBig5FromBuffer([0xA4, 0x55]), TypeError);
  assert.throws(() => decodeBig5FromBuffer('hello'), TypeError);
  assert.throws(() => decodeBig5FromBuffer(null), TypeError);
});

test('decodeBig5 rejects null/undefined input with TypeError', () => {
  assert.throws(() => decodeBig5(null), TypeError);
  assert.throws(() => decodeBig5(undefined), TypeError);
});

test('Empty input yields empty string', () => {
  assert.equal(decodeBig5(u8()), '');
  assert.equal(decodeBig5(new Uint8Array(0)), '');
});

test('Plain Array<number> works (ArrayLike contract)', () => {
  assert.equal(decodeBig5([0x48, 0x69]), 'Hi');
});

test('Multiple invalid bytes each produce one U+FFFD (no merging)', () => {
  // Three 0x80 bytes in a row → three replacement characters.
  assert.equal(decodeBig5(u8(0x80, 0x80, 0x80)), '\uFFFD\uFFFD\uFFFD');
});

test('Valid pair immediately after an invalid lead byte resyncs correctly', () => {
  // 0xFF is out of lead-byte range (0x81–0xFE); should become one U+FFFD,
  // then the valid 0xA4 0x55 pair should decode to 「中」.
  assert.equal(decodeBig5(u8(0xFF, ...ZHONG_BYTES)), '\uFFFD' + ZHONG_STR);
});
