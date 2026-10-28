// Regression tests for every bug fixed in 3.0. Each test first pins down the
// buggy behavior of the published rison-node 2.1.1 (so the same assertion
// against upstream would fail), then asserts the fixed behavior.

import { runInNewContext } from 'node:vm';
import rison2 from 'rison-node-2';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { decode, decodeUri, encode, encodeUri, RisonError } from '../src/index.js';

let log: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  // rison-node 2.1.1 console.logs parse errors; keep the test output clean.
  log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
});
afterEach(() => {
  log.mockRestore();
});

function upstreamDecode(input: string): unknown {
  try {
    return rison2.decode(input);
  } catch (error) {
    return error;
  }
}

describe('1. number-like keys are written bare only when canonical', () => {
  test.each([
    ['01', '(01:v)', { 1: 'v' }, "('01':v)"],
    ['007', '(007:v)', { 7: 'v' }, "('007':v)"],
    ['1e3', '(1e3:v)', { 1000: 'v' }, "('1e3':v)"],
    ['1.50', '(1.50:v)', { '1.5': 'v' }, "('1.50':v)"],
    ['-0', '(-0:v)', { 0: 'v' }, "('-0':v)"],
    ['1.', '(1.:v)', { 1: 'v' }, "('1.':v)"],
    ['+1', '(1:v)', { 1: 'v' }, '(+1:v)'],
    [
      '12345678901234567890',
      '(12345678901234567890:v)',
      { '12345678901234567000': 'v' },
      "('12345678901234567890':v)",
    ],
  ])('key %j', (key, upstreamEncoded, upstreamDecoded, fixed) => {
    expect(rison2.encode({ [key]: 'v' })).toBe(upstreamEncoded);
    expect(rison2.decode(upstreamEncoded)).toEqual(upstreamDecoded);

    expect(encode({ [key]: 'v' })).toBe(fixed);
    expect(decode(fixed)).toEqual({ [key]: 'v' });
  });

  test.each(['0x10', ' 1', '1 ', '\t1 '])(
    'key %j: upstream output does not decode at all',
    (key) => {
      const upstreamEncoded = rison2.encode({ [key]: 'v' }) as string;
      expect(upstreamDecode(upstreamEncoded)).toBeInstanceOf(Error);

      expect(decode(encode({ [key]: 'v' }))).toEqual({ [key]: 'v' });
    },
  );

  test('canonical number keys are still bare, like 2.x', () => {
    for (const key of ['0', '1', '-1', '1.5', '42']) {
      expect(encode({ [key]: 'v' })).toBe(rison2.encode({ [key]: 'v' }));
      expect(encode({ [key]: 'v' })).toBe(`(${key}:v)`);
    }
  });
});

describe('2. decoding a number key keeps its text', () => {
  test.each([
    ['(01:v)', '01', '1'],
    ['(007:v)', '007', '7'],
    ['(1.50:v)', '1.50', '1.5'],
    ['(1e3:v)', '1e3', '1000'],
    ['(-0:v)', '-0', '0'],
    ['(1:v)', '1', '1'],
  ])('%s', (input, fixedKey, upstreamKey) => {
    expect(Object.keys(rison2.decode(input) as object)).toEqual([upstreamKey]);
    expect(Object.keys(decode(input) as object)).toEqual([fixedKey]);
  });

  test('links written by 2.x decode to the key that was intended', () => {
    const value = { '01': 'a', '1.50': 'b', '1e3': 'c' };
    const link = rison2.encode(value) as string;
    expect(link).toBe('(01:a,1.50:b,1e3:c)');
    expect(rison2.decode(link)).not.toEqual(value);
    expect(decode(link)).toEqual(value);
  });
});

describe('3. __proto__ in the input cannot change the prototype', () => {
  test('(__proto__:(polluted:!t))', () => {
    const upstream = rison2.decode('(__proto__:(polluted:!t))') as Record<string, unknown>;
    expect(Object.keys(upstream)).toEqual([]);
    expect(upstream['polluted']).toBe(true);
    expect(Object.getPrototypeOf(upstream)).not.toBe(Object.prototype);

    const fixed = decode('(__proto__:(polluted:!t))') as Record<string, unknown>;
    expect(Object.keys(fixed)).toEqual(['__proto__']);
    expect(fixed['polluted']).toBeUndefined();
    expect(Object.getPrototypeOf(fixed)).toBe(Object.prototype);
    expect(({} as Record<string, unknown>)['polluted']).toBeUndefined();
  });
});

describe('4. no console output', () => {
  test('parse errors are not logged', () => {
    upstreamDecode('(a');
    expect(log).toHaveBeenCalledWith('rison parser error: ', expect.any(String));
    log.mockClear();

    expect(() => decode('(a')).toThrow(RisonError);
    expect(() => decode('!x')).toThrow(RisonError);
    expect(() => decode('1.2.3')).toThrow(RisonError);
    expect(log).not.toHaveBeenCalled();
  });
});

describe('5. malformed input is always a RisonError', () => {
  test.each([
    ['(a: b)', "invalid character: ' '", 3],
    ['(a:b,)', "extra ','", 4],
    [')', "invalid character: ')'", 0],
    ['!(a,)', "extra ','", 3],
    ['(a:1b:2)', "missing ','", 4],
    ['', 'empty expression', 0],
    ['(a:', "unmatched '('", 3],
    ['(a:1', "unmatched '('", 4],
  ])('%j: upstream crashes with a TypeError', (input, reason, index) => {
    const upstream = upstreamDecode(input);
    expect(upstream).toBeInstanceOf(TypeError);
    expect((upstream as Error).message).toMatch(/Cannot read properties of null/);

    const error = (() => {
      try {
        decode(input);
      } catch (e) {
        return e;
      }
      return undefined;
    })() as RisonError;
    expect(error).toBeInstanceOf(RisonError);
    expect(error.reason).toBe(reason);
    expect(error.index).toBe(index);
  });

  test("'(' made upstream recurse until the stack overflowed", () => {
    expect(upstreamDecode('(')).toBeInstanceOf(RangeError);
    expect(() => decode('(')).toThrow(RisonError);
  });

  test('the id regex is anchored at the current position', () => {
    // Upstream's unanchored global regex skipped the space and matched `a`,
    // producing a misleading "missing ':'".
    expect((upstreamDecode('( a:1)') as Error).message).toMatch(/missing ':'/);
    expect(() => decode('( a:1)')).toThrow("invalid character: ' ' (at index 1)");
  });

  test('parsing stops at the first error', () => {
    // Upstream kept going after "missing ','" and reported a later error.
    expect((upstreamDecode('!(1,2!(3))') as Error).message).toMatch(/missing ':'/);
    expect(() => decode('!(1,2!(3))')).toThrow("missing ',' (at index 5)");
  });
});

describe('6. only own enumerable keys are encoded', () => {
  test('inherited enumerable properties', () => {
    function P(this: { own: number }) {
      this.own = 1;
    }
    (P.prototype as { inherited: number }).inherited = 2;
    const p: unknown = new (P as unknown as new () => object)();
    expect(rison2.encode(p)).toBe('(inherited:2,own:1)');
    expect(encode(p)).toBe('(own:1)');
  });

  test('objects created with Object.create(proto)', () => {
    const o: unknown = Object.create({ inherited: 1 }, { own: { value: 2, enumerable: true } });
    expect(rison2.encode(o)).toBe('(inherited:1,own:2)');
    expect(encode(o)).toBe('(own:2)');
  });
});

describe('other fixes found while reviewing the parser and encoder', () => {
  test.each(['1e', '--1', '1-2', '1e-', '-e5', '1-'])(
    'number %j decoded to NaN upstream',
    (input) => {
      expect(rison2.decode(input)).toBeNaN();
      expect(() => decode(input)).toThrow('invalid number');
    },
  );

  test('non-string object keys were stringified upstream', () => {
    expect(rison2.decode('(!t:1)')).toEqual({ true: 1 });
    expect(rison2.decode('((a:b):1)')).toEqual({ '[object Object]': 1 });
    expect(() => decode('(!t:1)')).toThrow('invalid object key');
  });

  test('a "!" at the end of a quoted string reported an unmatched quote', () => {
    expect((upstreamDecode("'abc!") as Error).message).toMatch(/unmatched/);
    expect(() => decode("'abc!")).toThrow('"!" at end of input (at index 5)');
  });

  test('encode_uri ignored toJSON and returned undefined for undefined', () => {
    expect(rison2.encode_uri(new Date(0))).toBe('()');
    expect(encodeUri(new Date(0))).toBe("'1970-01-01T00:00:00.000Z'");
    expect(rison2.encode_uri(undefined)).toBeUndefined();
    expect(() => encodeUri(undefined)).toThrow(TypeError);
  });

  test('top-level undefined returned undefined instead of throwing', () => {
    expect(rison2.encode(undefined)).toBeUndefined();
    expect(() => encode(undefined)).toThrow(TypeError);
  });

  test('boxed primitives were encoded as objects', () => {
    expect(rison2.encode(new String('ab'))).toBe('(0:a,1:b)');
    expect(rison2.encode(new Number(1))).toBe('()');
    expect(encode(new String('ab'))).toBe('ab');
    expect(encode(new Number(1))).toBe('1');
  });

  test('arrays from another realm were encoded as objects', () => {
    const foreign = runInNewContext('[1, 2]') as unknown;
    expect(rison2.encode(foreign)).toBe('(0:1,1:2)');
    expect(encode(foreign)).toBe('!(1,2)');
  });

  test('circular structures overflowed the stack', () => {
    const o: Record<string, unknown> = {};
    o['o'] = o;
    expect(() => rison2.encode(o)).toThrow(RangeError);
    expect(() => encode(o)).toThrow(TypeError);
  });

  test('deeply nested input overflowed the stack', () => {
    const input = '!('.repeat(20_000) + ')'.repeat(20_000);
    expect(upstreamDecode(input)).toBeInstanceOf(RangeError);
    expect(encode(decode(input))).toBe(input);
  });

  test('decode_uri let URIError escape', () => {
    expect(() => rison2.decode_uri?.('%')).toThrow(URIError);
    expect(() => decodeUri('%')).toThrow(RisonError);
  });
});
