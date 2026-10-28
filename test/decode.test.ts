import { describe, expect, test } from 'vitest';
import { decode, safeDecode, type RisonValue } from '../src/index.js';

describe('decode: scalars', () => {
  test.each<[string, RisonValue]>([
    ['!t', true],
    ['!f', false],
    ['!n', null],
    ["''", ''],
    ['a', 'a'],
    ['abc', 'abc'],
    ['true', 'true'],
    ['null', 'null'],
    ['.5', '.5'],
    ['+1', '+1'],
    ['a-b.c/d~e_f', 'a-b.c/d~e_f'],
    ['日本語', '日本語'],
    ['😀', '😀'],
    ['a\nb', 'a\nb'],
    ["'a b'", 'a b'],
    ["'!!'", '!'],
    ["'!''", "'"],
    ["'it!'s'", "it's"],
    ["'a!!b!'c'", "a!b'c"],
    ["'!!!!!'!''", "!!''"],
    ["'(a:b,c)'", '(a:b,c)'],
    ["'*@$'", '*@$'],
    ["'1'", '1'],
    ["'-1'", '-1'],
    ["'abc'", 'abc'],
    ["' '", ' '],
    ["'\n\t'", '\n\t'],
    ["'😀 😀'", '😀 😀'],
  ])('%s -> %j', (input, expected) => {
    expect(decode(input)).toBe(expected);
  });
});

describe('decode: numbers', () => {
  test.each<[string, number]>([
    ['0', 0],
    ['1', 1],
    ['42', 42],
    ['-1', -1],
    ['1.5', 1.5],
    ['-0.25', -0.25],
    ['1e21', 1e21],
    ['1e-7', 1e-7],
    ['-1.5e-10', -1.5e-10],
    ['1.5e300', 1.5e300],
    ['9007199254740991', Number.MAX_SAFE_INTEGER],
    // Accepted for compatibility with rison-node (never produced by encode):
    ['1E5', 1e5],
    ['1.e5', 1e5],
    ['1.', 1],
    ['007', 7],
    ['-0', -0],
    ['00.5', 0.5],
    ['-.5', -0.5],
    ['-.5e1', -5],
    // Out of range numbers become Infinity, as with JSON.parse.
    ['1e400', Infinity],
    ['-1e400', -Infinity],
    ['1e-400', 0],
  ])('%s -> %d', (input, expected) => {
    expect(decode(input)).toBe(expected);
  });

  test('-0 is preserved', () => {
    expect(Object.is(decode('-0'), -0)).toBe(true);
  });
});

describe('decode: arrays', () => {
  test.each<[string, RisonValue]>([
    ['!()', []],
    ['!(1)', [1]],
    ['!(1,2,3)', [1, 2, 3]],
    ["!(a,'b c',!t,!f,!n,'')", ['a', 'b c', true, false, null, '']],
    ['!(!())', [[]]],
    ['!(!(),!())', [[], []]],
    ['!(!(!(!())))', [[[[]]]]],
    ['!(())', [{}]],
    ['!((a:1),(b:2))', [{ a: 1 }, { b: 2 }]],
    ['!(-1,1.5,1e3)', [-1, 1.5, 1000]],
  ])('%s -> %j', (input, expected) => {
    expect(decode(input)).toEqual(expected);
  });
});

describe('decode: objects', () => {
  test.each<[string, RisonValue]>([
    ['()', {}],
    ['(a:1)', { a: 1 }],
    ['(a:b)', { a: 'b' }],
    ["(a:'')", { a: '' }],
    ["('':a)", { '': 'a' }],
    ["('a b':'c d')", { 'a b': 'c d' }],
    ["('it!'s':'!!')", { "it's": '!' }],
    ['(a:(b:(c:())))', { a: { b: { c: {} } } }],
    ['(a:!(1,(b:!())))', { a: [1, { b: [] }] }],
    ['(a:!n,b:!t,c:!f)', { a: null, b: true, c: false }],
    ['(é:1,😀:2)', { é: 1, '😀': 2 }],
    // Keys do not have to be sorted.
    ['(b:1,a:2)', { a: 2, b: 1 }],
    // Duplicate keys: the last one wins (like JSON.parse).
    ['(a:1,a:2)', { a: 2 }],
  ])('%s -> %j', (input, expected) => {
    expect(decode(input)).toEqual(expected);
  });

  test('decoded objects are plain objects', () => {
    const o = decode('(a:(b:1))') as Record<string, unknown>;
    expect(Object.getPrototypeOf(o)).toBe(Object.prototype);
    expect(Object.getPrototypeOf(o['a'])).toBe(Object.prototype);
    expect(Array.isArray(decode('!()'))).toBe(true);
  });
});

describe('decode: number keys keep their text', () => {
  test.each<[string, string]>([
    // As written by rison-node 2.x (bare) ...
    ['(1:v)', '1'],
    ['(0:v)', '0'],
    ['(-1:v)', '-1'],
    ['(1.5:v)', '1.5'],
    ['(01:v)', '01'],
    ['(007:v)', '007'],
    ['(1.50:v)', '1.50'],
    ['(1e3:v)', '1e3'],
    ['(1E3:v)', '1E3'],
    ['(-0:v)', '-0'],
    ['(1.:v)', '1.'],
    ['(12345678901234567890:v)', '12345678901234567890'],
    // ... and as written by rison-node 0.3 (quoted).
    ["('1':v)", '1'],
    ["('01':v)", '01'],
    ["('1.50':v)", '1.50'],
    ["('1e3':v)", '1e3'],
    ["('-0':v)", '-0'],
    ["('0x10':v)", '0x10'],
    ["(' 1':v)", ' 1'],
  ])('%s -> key %j', (input, key) => {
    const result = decode(input) as Record<string, unknown>;
    expect(Object.keys(result)).toEqual([key]);
    expect(result[key]).toBe('v');
  });

  test('number keys mixed with other keys', () => {
    expect(decode("(01:a,1:b,'1':c,x:!(1,01))")).toEqual({ '01': 'a', '1': 'c', x: [1, 1] });
  });
});

describe('safeDecode', () => {
  test('returns the value for valid input', () => {
    expect(safeDecode('(a:!(1,2))')).toEqual({ a: [1, 2] });
    expect(safeDecode('!n')).toBeNull();
  });

  test('returns undefined for invalid rison', () => {
    expect(safeDecode('(a')).toBeUndefined();
    expect(safeDecode('')).toBeUndefined();
    expect(safeDecode('(a: b)')).toBeUndefined();
  });

  test('returns undefined for non-string input', () => {
    expect(safeDecode(undefined as unknown as string)).toBeUndefined();
    expect(safeDecode(1 as unknown as string)).toBeUndefined();
    expect(safeDecode(null as unknown as string)).toBeUndefined();
  });
});

describe('decode: large inputs', () => {
  test('1 MB string with escapes decodes in linear time', () => {
    const body = "ab!!cd!'".repeat(131_072);
    const start = performance.now();
    const out = decode(`'${body}'`);
    expect(out).toBe("ab!cd'".repeat(131_072));
    expect(performance.now() - start).toBeLessThan(2000);
  });

  test('array with 200k elements', () => {
    const input = `!(${Array.from({ length: 200_000 }, (_, i) => String(i)).join(',')})`;
    const start = performance.now();
    const out = decode(input) as number[];
    expect(out).toHaveLength(200_000);
    expect(out[199_999]).toBe(199_999);
    expect(performance.now() - start).toBeLessThan(2000);
  });

  test('object with 100k keys', () => {
    const input = `(${Array.from({ length: 100_000 }, (_, i) => `k${String(i)}:${String(i)}`).join(',')})`;
    const out = decode(input) as Record<string, number>;
    expect(Object.keys(out)).toHaveLength(100_000);
    expect(out['k99999']).toBe(99_999);
  });
});
