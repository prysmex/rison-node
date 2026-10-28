import fc from 'fast-check';
import { describe, expect, test } from 'vitest';
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
  RisonError,
  safeDecode,
  unquote,
} from '../src/index.js';
import {
  hasLoneSurrogate,
  normalize,
  objectArb,
  reverseKeyOrder,
  risonishString,
  valueArb,
} from './arbitraries.js';

const NUM_RUNS = 1000;
const params = { numRuns: NUM_RUNS };

const stringUnits = ['grapheme', 'grapheme-composite', 'binary', 'binary-ascii'] as const;

describe('round trip: decode(encode(v)) equals v', () => {
  test.each(stringUnits)('fc.jsonValue with %s strings', (stringUnit) => {
    fc.assert(
      fc.property(fc.jsonValue({ stringUnit }), (v) => {
        expect(decode(encode(v))).toEqual(normalize(v));
      }),
      params,
    );
  });

  test('values biased towards rison syntax and number-like keys', () => {
    fc.assert(
      fc.property(valueArb, (v) => {
        expect(decode(encode(v))).toEqual(normalize(v));
      }),
      params,
    );
  });

  test('JSON.parse(JSON.stringify(v)) is what decode(encode(v)) gives for any input', () => {
    // Includes NaN/Infinity (-> null), boxed primitives (unwrapped), Dates
    // (-> ISO strings) and null-prototype objects. (Arrays with undefined
    // items are the one intended difference: JSON writes null, rison skips.)
    const anyish = fc.anything({
      withDate: true,
      withBoxedValues: true,
      withNullPrototype: true,
      withSparseArray: false,
      values: [fc.double(), fc.string(), fc.boolean(), fc.constant(null), fc.integer()],
    });
    fc.assert(
      fc.property(anyish, (v) => {
        const json = JSON.stringify(v) as string | undefined;
        if (json === undefined) {
          expect(() => encode(v)).toThrow(TypeError);
          return;
        }
        expect(decode(encode(v))).toEqual(normalize(JSON.parse(json)));
      }),
      params,
    );
  });
});

describe('canonical form', () => {
  test('encode(decode(encode(v))) === encode(v)', () => {
    fc.assert(
      fc.property(valueArb, (v) => {
        const s = encode(v);
        expect(encode(decode(s))).toBe(s);
      }),
      params,
    );
  });

  test('encode is deterministic and independent of key insertion order', () => {
    fc.assert(
      fc.property(valueArb, (v) => {
        expect(encode(v)).toBe(encode(v));
        expect(encode(reverseKeyOrder(v))).toBe(encode(v));
      }),
      params,
    );
  });

  test('object keys are written in sorted order', () => {
    fc.assert(
      fc.property(objectArb, (o) => {
        const entries = Object.keys(o)
          .sort()
          .map((k) => encode({ [k]: o[k] }).slice(1, -1));
        expect(encode(o)).toBe(`(${entries.join(',')})`);
      }),
      params,
    );
  });

  test('decode -> encode is idempotent for any decodable string', () => {
    const risonText = fc.string({
      unit: fc.constantFrom(...`()!,:'tfn-01.5eabc `),
      maxLength: 20,
    });
    fc.assert(
      fc.property(risonText, (s) => {
        const value = safeDecode(s);
        if (value === undefined) return;
        expect(decode(encode(value))).toEqual(normalize(value));
      }),
      { numRuns: 5000 },
    );
  });
});

describe('O-rison and A-rison round trips', () => {
  test('decodeObject(encodeObject(o))', () => {
    fc.assert(
      fc.property(objectArb, (o) => {
        expect(decodeObject(encodeObject(o))).toEqual(normalize(o));
        expect(`(${encodeObject(o)})`).toBe(encode(o));
      }),
      params,
    );
  });

  test('decodeArray(encodeArray(a))', () => {
    fc.assert(
      fc.property(fc.array(valueArb, { maxLength: 6 }), (a) => {
        expect(decodeArray(encodeArray(a))).toEqual(normalize(a));
        expect(`!(${encodeArray(a)})`).toBe(encode(a));
      }),
      params,
    );
  });
});

describe('URI round trips', () => {
  test('decodeUri(encodeUri(v))', () => {
    fc.assert(
      fc.property(
        valueArb.filter((v) => !hasLoneSurrogate(v)),
        (v) => {
          const uri = encodeUri(v);
          expect(uri).toMatch(/^[-A-Za-z0-9~!*()_.',:@$/%+]*$/);
          expect(decodeUri(uri)).toEqual(normalize(v));
        },
      ),
      params,
    );
  });

  test('unquote(quote(s)) === s', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.string({ unit: 'grapheme' }),
          fc.string({ unit: 'binary-ascii' }),
          risonishString,
        ),
        (s) => {
          expect(unquote(quote(s))).toBe(s);
        },
      ),
      params,
    );
  });
});

describe('robustness', () => {
  test('decode only ever throws RisonError', () => {
    const input = fc.oneof(
      fc.string(),
      fc.string({ unit: fc.constantFrom(...`()!,:'tfn-0123456789.eE+ab$*@ `), maxLength: 30 }),
      valueArb.map((v) => encode(v)).chain((s) => fc.nat(s.length).map((cut) => s.slice(0, cut))),
    );
    fc.assert(
      fc.property(input, (s) => {
        try {
          decode(s);
        } catch (error) {
          expect(error).toBeInstanceOf(RisonError);
          const { index } = error as RisonError;
          expect(Number.isInteger(index)).toBe(true);
          expect(index).toBeGreaterThanOrEqual(0);
          expect(index).toBeLessThanOrEqual(s.length);
        }
      }),
      { numRuns: 5000 },
    );
  });

  test('every proper prefix of an encoded container is invalid', () => {
    fc.assert(
      fc.property(fc.oneof(objectArb, fc.array(valueArb, { maxLength: 4 })), (v) => {
        const s = encode(v);
        for (let cut = 0; cut < s.length; cut++) {
          expect(safeDecode(s.slice(0, cut))).toBeUndefined();
        }
      }),
      { numRuns: 300 },
    );
  });

  test('decodeUri only ever throws RisonError', () => {
    fc.assert(
      fc.property(fc.string({ unit: fc.constantFrom(...`%0123456789ABCDEFabcdef+(a:!)`) }), (s) => {
        try {
          decodeUri(s);
        } catch (error) {
          expect(error).toBeInstanceOf(RisonError);
          expect((error as RisonError).index).toBeLessThanOrEqual(s.length);
        }
      }),
      { numRuns: 3000 },
    );
  });
});
