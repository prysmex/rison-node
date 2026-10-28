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
  unquote,
  type RisonValue,
} from '../src/index.js';

const printableAscii = Array.from({ length: 95 }, (_, i) => String.fromCharCode(32 + i)).join('');

describe('O-rison', () => {
  test.each<[Record<string, unknown>, string]>([
    [{}, ''],
    [{ a: 1 }, 'a:1'],
    [{ b: 2, a: 1 }, 'a:1,b:2'],
    [{ q: '*', start: 10, count: 10 }, "count:10,q:'*',start:10"],
    [{ a: { b: [1, 'x y'] } }, "a:(b:!(1,'x y'))"],
    [{ '01': 1, 1: 2 }, "'01':1,1:2"],
  ])('%j <-> %s', (value, orison) => {
    expect(encodeObject(value)).toBe(orison);
    expect(decodeObject(orison)).toEqual(value);
  });

  test('encodeObject honors toJSON and skips undefined like encode', () => {
    expect(encodeObject({ a: undefined, d: new Date(0) })).toBe("d:'1970-01-01T00:00:00.000Z'");
    expect(encodeObject({ toJSON: () => ({ x: 1 }) })).toBe('x:1');
    expect(encodeObject(new Map())).toBe('');
  });

  test.each<[string, unknown]>([
    ['array', []],
    ['null', null],
    ['string', 'a'],
    ['number', 1],
    ['undefined', undefined],
    ['Date (encodes to a string)', new Date(0)],
    ['boxed string', new String('x')],
  ])('encodeObject rejects %s with a TypeError', (_name, value) => {
    expect(() => encodeObject(value as object)).toThrow(TypeError);
    expect(() => encodeObject(value as object)).toThrow(
      'rison.encodeObject expects an object argument',
    );
  });

  test('decodeObject rejects input that would escape the implied parens', () => {
    expect(() => decodeObject('a:1),(b:2')).toThrow();
    expect(() => decodeObject(')')).toThrow();
    expect(() => decodeObject('a:1)')).toThrow();
  });
});

describe('A-rison', () => {
  test.each<[unknown[], string]>([
    [[], ''],
    [[1], '1'],
    [['A', 'B', { supportsObjects: true }], 'A,B,(supportsObjects:!t)'],
    [[[], [1]], '!(),!(1)'],
    [['a b', '', null], "'a b','',!n"],
  ])('%j <-> %s', (value, arison) => {
    expect(encodeArray(value)).toBe(arison);
    expect(decodeArray(arison)).toEqual(value);
  });

  test('encodeArray skips non-encodable items like encode', () => {
    expect(encodeArray([undefined, 1, () => 2])).toBe('1');
  });

  test.each<[string, unknown]>([
    ['object', {}],
    ['null', null],
    ['string', 'a'],
    ['undefined', undefined],
    ['array-like', { length: 0 }],
  ])('encodeArray rejects %s with a TypeError', (_name, value) => {
    expect(() => encodeArray(value as unknown[])).toThrow(TypeError);
    expect(() => encodeArray(value as unknown[])).toThrow(
      'rison.encodeArray expects an array argument',
    );
  });

  test('encodeArray accepts an object whose toJSON returns an array', () => {
    expect(encodeArray({ toJSON: () => [1, 2] } as unknown as unknown[])).toBe('1,2');
  });

  test('decodeArray rejects input that would escape the implied wrapper', () => {
    expect(() => decodeArray('a),(b')).toThrow();
    expect(() => decodeArray(')')).toThrow();
  });
});

describe('quote / unquote', () => {
  test.each([
    ['', ''],
    ['abc', 'abc'],
    ["-_.~!*'()", "-_.~!*'()"],
    [',:@$/', ',:@$/'],
    ['a b', 'a+b'],
    ['+', '%2B'],
    ['&', '%26'],
    ['=', '%3D'],
    ['?', '%3F'],
    ['#', '%23'],
    ['%', '%25'],
    ['"', '%22'],
    [';', '%3B'],
    ['é', '%C3%A9'],
    ['😀', '%F0%9F%98%80'],
    ['\n', '%0A'],
    ["(a:'b c',d:!(1,2))", "(a:'b+c',d:!(1,2))"],
  ])('quote(%j) = %s', (input, expected) => {
    expect(quote(input)).toBe(expected);
    expect(unquote(expected)).toBe(input);
  });

  test('every printable ASCII character', () => {
    for (const c of printableAscii) {
      expect(unquote(quote(c))).toBe(c);
      if (/[-A-Za-z0-9~!*()_.',:@$/]/.test(c)) expect(quote(c)).toBe(c);
    }
  });

  test('unquote turns + into space and decodes %20 too', () => {
    expect(unquote('a+b%20c')).toBe('a b c');
    expect(unquote('%2B')).toBe('+');
  });

  test('quote throws URIError on lone surrogates, unquote on malformed escapes', () => {
    expect(() => quote('\ud800')).toThrow(URIError);
    expect(() => unquote('%')).toThrow(URIError);
  });
});

describe('encodeUri / decodeUri', () => {
  test.each<[unknown, string]>([
    [{ any: 'json', yes: true }, '(any:json,yes:!t)'],
    [{ a: 'x y' }, "(a:'x+y')"],
    [{ a: 'x+y' }, '(a:x%2By)'],
    [{ q: 'a&b=c' }, '(q:a%26b%3Dc)'],
    ['é', '%C3%A9'],
    [[1, 'a b'], "!(1,'a+b')"],
    [new Date(0), "'1970-01-01T00:00:00.000Z'"],
  ])('%j -> %s', (value, uri) => {
    expect(encodeUri(value)).toBe(uri);
    expect(decodeUri(uri)).toEqual(JSON.parse(JSON.stringify(value)));
  });

  test('throws TypeError for non-encodable top-level values', () => {
    expect(() => encodeUri(undefined)).toThrow(TypeError);
    expect(() => encodeUri(() => 1)).toThrow(TypeError);
  });

  test('every printable ASCII character in keys and values round-trips', () => {
    const value: Record<string, string> = {};
    for (const c of printableAscii) {
      value[c] = c;
      value[`k${c}k`] = `v${c}v`;
      value[`${c}${c}`] = `${c}${c}`;
    }
    value[printableAscii] = printableAscii;
    const uri = encodeUri(value);
    // Only URI-safe characters remain (plus % escapes and + for spaces).
    expect(uri).toMatch(/^[-A-Za-z0-9~!*()_.',:@$/%+]*$/);
    expect(decodeUri(uri)).toEqual(value);
    expect(decode(unquote(uri))).toEqual(value);
  });

  test('+ handling: a literal + survives, a + in the URI means space', () => {
    expect(decodeUri(encodeUri({ a: '1+1 = 2' }))).toEqual({ a: '1+1 = 2' });
    expect(decodeUri("(a:'x+y')")).toEqual({ a: 'x y' });
    expect(decodeUri('(a:x%2By)')).toEqual({ a: 'x+y' });
    expect(decodeUri("(a:'x%20y')")).toEqual({ a: 'x y' });
  });

  test('spaces in keys and values', () => {
    const value = { 'a b': ' c ', ' ': '  ' };
    expect(encodeUri(value)).toBe("('+':'++','a+b':'+c+')");
    expect(decodeUri(encodeUri(value))).toEqual(value);
  });

  test('unicode round-trips', () => {
    const value: RisonValue = { 日本: ['😀', 'é è', 'Ω'] };
    expect(decodeUri(encodeUri(value))).toEqual(value);
  });

  test('decodeUri accepts plain (unquoted) rison as long as it has no + or %', () => {
    expect(decodeUri('(a:!(1,2))')).toEqual(decode('(a:!(1,2))'));
  });

  test('encode output is URI-safe for simple values (quote is a no-op)', () => {
    const s = encode({ a: [1, 'b'], c: { d: true } });
    expect(quote(s)).toBe(s);
  });
});

describe('findMalformedEscape (internal helper of decodeUri)', () => {
  test.each<[string, number]>([
    ['', -1],
    ['abc', -1],
    ['%41%C3%A9%F0%9F%98%80+', -1],
    ['%', 0],
    ['a%G0', 1],
    ['%41%C3', 3],
    ['%E0%80%80', 0],
  ])('%j -> %d', async (input, expected) => {
    const { findMalformedEscape } = await import('../src/uri.js');
    expect(findMalformedEscape(input)).toBe(expected);
  });
});
