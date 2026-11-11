# big5-chinese-decoder

Decodes Big5-encoded Traditional Chinese byte sequences into JavaScript strings using a lookup table built from the WHATWG Big5 index.

## Usage

```js
import { decodeBig5, decodeBig5FromBuffer, BIG5_NAME } from 'big5-chinese-decoder';

// From a Uint8Array (the common case)
const text = decodeBig5FromBuffer(new Uint8Array([0xA4, 0x55])); // → '中'

// Or from any ArrayLike<number> (plain Array, Uint8Array, Int8Array)
const same = decodeBig5([0xA4, 0x55]); // → '中'

// Stable decoder name, for callers that want to assert identity
console.log(BIG5_NAME); // 'big5'
```

Exports:
- `decodeBig5(bytes: ArrayLike<number>): string`
- `decodeBig5FromBuffer(buf: Uint8Array): string`
- `BIG5_NAME: string` (constant `'big5'`)

## Why this exists

Big5 is still the dominant legacy encoding for Traditional Chinese files in Taiwan and Hong Kong. The browser-quality decoders bundled with Node (`TextDecoder('big5')`) are correct but opaque — there's no way to inspect or override the mapping, and they silently accept bytes that some downstream tools reject. This library exposes the exact same WHATWG index as a plain JavaScript table so you can audit, patch, or tree-shake it.

The trade-off: the bundled table only covers the standard WHATWG index. The Big5 User-Defined Area (private extensions in the 0x81–0xA3 lead rows that some Taiwan vendors used for custom glyphs) is **not** included. If your files rely on UDA characters, decode the standard range with this library and post-process the UDA rows yourself.

## Edge cases you'll hit

- **Invalid bytes become `U+FFFD`**, never thrown. A lead byte at end-of-input, a lead byte followed by a trail byte outside `0x40–0x7E` or `0xA1–0xFE`, or a stray `0x80` each produce exactly one replacement character. This matches what browsers do.
- **Trail byte `0x7F` is invalid** even though it's ASCII. The low trail range is `0x40–0x7E`, so `0x7F` falls in the gap. After emitting `U+FFFD` for the lead byte, the decoder re-processes `0x7F` as ASCII DEL.
- **`0x00` is preserved as `U+0000`**. The library does not treat null bytes as terminators.
- **`decodeBig5FromBuffer` only accepts `Uint8Array`** — pass plain arrays to `decodeBig5` instead.

## Running the tests

```sh
node --test
```

## Performance

The window keeps a bounded buffer, so `push` is constant time and memory does not
grow with the length of the stream. `peak` and `trough` are linear in the window
size, which is the trade that keeps `push` cheap.

## Design notes

The window stores values eagerly rather than keeping running aggregates. Running
sums drift with floating point over long streams, and recomputing from a small
buffer is cheap enough that the drift is not worth the speed.

