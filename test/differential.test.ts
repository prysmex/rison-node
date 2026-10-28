// Differential tests against the published rison-node 0.3.1 and 2.1.1.
//
// For values that do not hit one of the documented fixes, encode() must give
// exactly the bytes 2.1.1 gives, and decode() must agree with both old
// decoders on everything they produce. Values that do hit a fix are covered
// explicitly in regressions.test.ts.

import fc from 'fast-check';
import rison03 from 'rison-node-0.3';
import rison2 from 'rison-node-2';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import {
  decode,
  decodeArray,
  decodeObject,
  decodeUri,
  encode,
  encodeArray,
  encodeObject,
  encodeUri,
  quote,
  safeDecode,
} from '../src/index.js';
import { allKeys, hasLoneSurrogate, normalize, objectArb, valueArb } from './arbitraries.js';

const NUM_RUNS = 3000;

// rison-node console.logs its parse errors.
let log: ReturnType<typeof vi.spyOn>;
beforeAll(() => {
  log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
});
afterAll(() => {
  log.mockRestore();
});

/** rison-node 2.x writes a key as a bare number when this is true. */
function bareIn2x(key: string): boolean {
  return !(!isFinite(key as unknown as number) || isNaN(parseInt(key, 10)));
}

/** 3.0 writes a key as a bare number when this is true (see encodeKey). */
function bareIn3(key: string): boolean {
  return /^-?[0-9]/.test(key) && encode({ [key]: 0 }) === `(${key}:0)`;
}

/** The value hits none of the documented fixes, so 2.1.1 must agree. */
function compatibleWith2x(value: unknown): boolean {
  return allKeys(value).every((k) => k !== '__proto__' && bareIn2x(k) === bareIn3(k));
}

function hasCanonicalNumberKey(value: unknown): boolean {
  return allKeys(value).some(bareIn3);
}

const compatibleValues = valueArb.filter(compatibleWith2x);

describe('the filter used below', () => {
  test('agrees on the keys we expect', () => {
    for (const k of ['1', '-1', '1.5', '0', 'a', '', '+a', 'Infinity', '.5', 'NaN']) {
      expect(bareIn2x(k)).toBe(bareIn3(k));
    }
    for (const k of ['01', '1e3', '1.50', '-0', '0x10', ' 1', '+1', '12345678901234567890']) {
      expect(bareIn2x(k)).not.toBe(bareIn3(k));
    }
  });

  test('keeps most generated values', () => {
    const sample = fc.sample(valueArb, { numRuns: 2000, seed: 42 });
    const kept = sample.filter(compatibleWith2x).length;
    expect(kept / sample.length).toBeGreaterThan(0.5);
    // ... and the corpus does contain canonical number keys.
    expect(sample.filter(compatibleWith2x).some(hasCanonicalNumberKey)).toBe(true);
  });
});

describe('encode output matches rison-node', () => {
  test('identical to 2.1.1 for every value outside the documented fixes', () => {
    fc.assert(
      fc.property(compatibleValues, (v) => {
        expect(encode(v)).toBe(rison2.encode(v));
      }),
      { numRuns: NUM_RUNS },
    );
  });

  test('identical to 0.3.1 when no key is a canonical number', () => {
    fc.assert(
      fc.property(
        valueArb.filter((v) => !hasCanonicalNumberKey(v)),
        (v) => {
          expect(encode(v)).toBe(rison03.encode(v));
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  test('with canonical number keys, 0.3.1 quotes them and we do not; both decode the same', () => {
    expect(rison03.encode({ 1: 'a' })).toBe("('1':a)");
    expect(encode({ 1: 'a' })).toBe('(1:a)');
    fc.assert(
      fc.property(valueArb.filter(hasCanonicalNumberKey), (v) => {
        expect(decode(rison03.encode(v) as string)).toEqual(decode(encode(v)));
      }),
      { numRuns: NUM_RUNS },
    );
  });

  test('O-rison and A-rison match 2.1.1', () => {
    fc.assert(
      fc.property(objectArb.filter(compatibleWith2x), (o) => {
        expect(encodeObject(o)).toBe(rison2.encode_object(o));
      }),
      { numRuns: NUM_RUNS },
    );
    fc.assert(
      fc.property(fc.array(compatibleValues, { maxLength: 5 }), (a) => {
        expect(encodeArray(a)).toBe(rison2.encode_array(a));
      }),
      { numRuns: NUM_RUNS },
    );
  });

  test('encodeUri and quote match 2.1.1', () => {
    fc.assert(
      fc.property(
        compatibleValues.filter((v) => !hasLoneSurrogate(v)),
        (v) => {
          expect(encodeUri(v)).toBe(rison2.encode_uri(v));
        },
      ),
      { numRuns: NUM_RUNS },
    );
    fc.assert(
      fc.property(fc.string({ unit: 'grapheme' }), (s) => {
        expect(quote(s)).toBe(rison2.quote(s));
        expect(quote(s)).toBe(rison03.quote(s));
      }),
      { numRuns: NUM_RUNS },
    );
  });
});

describe('decode agrees with rison-node on everything rison-node produces', () => {
  test('2.1.1 output, decoded by 2.1.1 and by us', () => {
    fc.assert(
      fc.property(compatibleValues, (v) => {
        const s = rison2.encode(v) as string;
        expect(decode(s)).toEqual(rison2.decode(s));
        expect(decodeUri(rison2.encode_uri(v) as string)).toEqual(
          rison2.decode_uri?.(rison2.encode_uri(v) as string),
        );
      }),
      { numRuns: NUM_RUNS },
    );
  });

  test('0.3.1 output, decoded by 0.3.1 and by us', () => {
    fc.assert(
      fc.property(compatibleValues, (v) => {
        const s = rison03.encode(v) as string;
        expect(decode(s)).toEqual(rison03.decode(s));
      }),
      { numRuns: NUM_RUNS },
    );
  });

  test('we decode every 0.3.1 output to the original value, fixes included', () => {
    // 0.3.1 quoted all number-like keys, so its output is unambiguous.
    fc.assert(
      fc.property(valueArb, (v) => {
        expect(decode(rison03.encode(v) as string)).toEqual(normalize(v));
      }),
      { numRuns: NUM_RUNS },
    );
  });

  test('2.1.1 output that we can decode at all decodes to the original value', () => {
    // 2.1.1 wrote keys like '01' or '1e3' bare; we keep the key text, so those
    // links decode to what was intended. Only keys where 2.1.1 dropped a '+'
    // ('+1' -> 1) lost information. Some 2.1.1 output (keys '0x10', ' 1') is
    // not valid rison at all; we reject it (2.1.1 itself sometimes returned
    // garbage for it, because its id regex was not anchored).
    let decodable = 0;
    let total = 0;
    fc.assert(
      fc.property(
        valueArb.filter((v) => !allKeys(v).some((k) => bareIn2x(k) && k.includes('+'))),
        (v) => {
          total++;
          const s = rison2.encode(v) as string;
          const ours = safeDecode(s);
          if (ours === undefined) return;
          decodable++;
          expect(ours).toEqual(normalize(v));
        },
      ),
      { numRuns: NUM_RUNS },
    );
    expect(decodable / total).toBeGreaterThan(0.9);
  });

  test('O-rison and A-rison output of 2.1.1', () => {
    fc.assert(
      fc.property(objectArb.filter(compatibleWith2x), (o) => {
        const s = rison2.encode_object(o);
        expect(decodeObject(s)).toEqual(rison2.decode_object(s));
      }),
      { numRuns: NUM_RUNS },
    );
    fc.assert(
      fc.property(fc.array(compatibleValues, { maxLength: 5 }), (a) => {
        const s = rison2.encode_array(a);
        expect(decodeArray(s)).toEqual(rison2.decode_array(s));
      }),
      { numRuns: NUM_RUNS },
    );
  });
});

describe('rison-node decodes our output the same way we do', () => {
  test('2.1.1 and 0.3.1 decode encode(v) to the same value (outside the fixes)', () => {
    fc.assert(
      fc.property(compatibleValues, (v) => {
        const s = encode(v);
        expect(rison2.decode(s)).toEqual(decode(s));
        expect(rison03.decode(s)).toEqual(decode(s));
      }),
      { numRuns: NUM_RUNS },
    );
  });

  test('keys we quote that 2.x wrote bare are decoded correctly by old decoders too', () => {
    // This is why quoting is the safe choice: every decoder agrees.
    for (const key of [
      '01',
      '007',
      '1e3',
      '1.50',
      '-0',
      '0x10',
      ' 1',
      '+1',
      '12345678901234567890',
    ]) {
      const s = encode({ [key]: 'v' });
      expect(rison2.decode(s)).toEqual({ [key]: 'v' });
      expect(rison03.decode(s)).toEqual({ [key]: 'v' });
    }
  });
});

describe('error behavior agrees with rison-node on what is invalid', () => {
  // Inputs that both rison-node versions reject (with an Error, a TypeError
  // or a stack overflow) are rejected by us with a RisonError; inputs they
  // accept are accepted by us with the same result, unless they hit a fix.
  const corpus = fc.string({ unit: fc.constantFrom(...`()!,:'tfn-0123456789.ab `), maxLength: 12 });

  function upstream(s: string): { ok: true; value: unknown } | { ok: false } {
    try {
      const value = rison2.decode(s);
      return { ok: true, value };
    } catch {
      return { ok: false };
    }
  }

  function hitsFix(s: string, value: unknown): boolean {
    // NaN results (1e, --1), keys stringified from non-strings, number keys
    // whose text 2.x normalized.
    return (
      JSON.stringify(value, (_k, x: unknown) =>
        typeof x === 'number' && Number.isNaN(x) ? 'NaN!' : x,
      ).includes('NaN!') || /[(,](!|\(|-?[0-9])/.test(s)
    );
  }

  test('random rison-like strings', () => {
    fc.assert(
      fc.property(corpus, (s) => {
        const theirs = upstream(s);
        const ours = safeDecode(s);
        if (!theirs.ok) {
          expect(ours).toBeUndefined();
        } else if (!hitsFix(s, theirs.value)) {
          expect(ours).toEqual(theirs.value);
        }
      }),
      { numRuns: 20_000 },
    );
  });
});
