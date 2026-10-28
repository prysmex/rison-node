// Port of the tape tests from rison-node 2.1.1 (tests/01-basic.js ...
// tests/06-roundtrip.js). Every original assertion is kept. Where an
// expectation had to change in 3.0, the comment says so and why.

import { describe, expect, test } from 'vitest';
import rison, { decode, encode } from '../src/index.js';

describe('01-basic', () => {
  test('basic object encoding', () => {
    const decoded = { hello: 'world' };
    const encoded = '(hello:world)';
    expect(rison.encode(decoded)).toBe(encoded);
    expect(rison.decode(encoded)).toEqual(decoded);
  });

  test('object with url unsafe characters', () => {
    const decoded = { hello: 'odd(characters:)' };
    const encoded = "(hello:'odd(characters:)')";
    expect(rison.encode(decoded)).toBe(encoded);
    expect(rison.decode(encoded)).toEqual(decoded);
  });

  test('object with alpha key encoding', () => {
    const decoded = { '1m': 'odd(characters:)' };
    const encoded = "('1m':'odd(characters:)')";
    expect(rison.encode(decoded)).toBe(encoded);
    expect(rison.decode(encoded)).toEqual(decoded);
  });

  test('object with number key encoding', () => {
    const decoded = { 1: 'odd(characters:)' };
    const encoded = "(1:'odd(characters:)')";
    expect(rison.encode(decoded)).toBe(encoded);
    expect(rison.decode(encoded)).toEqual(decoded);
  });

  test('basic number encoding, prop is not quoted', () => {
    const decoded = { 1: 'one' };
    const encoded = '(1:one)';
    expect(rison.encode(decoded)).toBe(encoded);
    expect(rison.decode(encoded)).toEqual(decoded);
    // check that quoted values still work
    expect(rison.decode("('1':one)")).toEqual(decoded);
  });
});

describe('02-undefined', () => {
  test('drops undefined values', () => {
    expect(rison.encode({ hello: 'world', nope: undefined })).toBe('(hello:world)');
  });
});

describe('03-date_values', () => {
  test('encodes date objects, decodes them as strings', () => {
    const val = new Date();
    const expectedVal = val.toJSON();
    const output = rison.encode({ dateval: val });
    expect(output).toBe(`(dateval:'${expectedVal}')`);
    expect(rison.decode(output)).toEqual({ dateval: expectedVal });
  });
});

describe('04-validate_input', () => {
  // Changed in 3.0: non-string input throws a TypeError (rison-node threw a
  // plain Error). The message still contains "must be a string".
  test('should throw given an object', () => {
    expect(() => decode({ one: 1 } as unknown as string)).toThrow(/must be a string/);
    expect(() => decode({ one: 1 } as unknown as string)).toThrow(TypeError);
  });

  test('should throw given an array', () => {
    expect(() => decode([1, 2, 3] as unknown as string)).toThrow(/must be a string/);
  });

  test('should not throw given a string', () => {
    expect(() => decode('(one:1)')).not.toThrow();
  });
});

describe('05-readme', () => {
  test('should do what the README says it does', () => {
    const decoded = { any: 'json', yes: true };
    const encoded = '(any:json,yes:!t)';
    expect(rison.encode(decoded)).toBe(encoded);
    expect(rison.decode(encoded)).toEqual(decoded);
  });

  test('should handle deeply nested objects', () => {
    const decoded = {
      A: { B: { C: { D: 'E', F: 'G' } }, H: { I: { J: 'K', L: 'M' } } },
    };
    const encoded = '(A:(B:(C:(D:E,F:G)),H:(I:(J:K,L:M))))';
    expect(encode(decoded)).toBe(encoded);
    expect(decode(encoded)).toEqual(decoded);
  });

  test('encode_object and decode_object', () => {
    const decoded = { supportsObjects: true, ints: 435 };
    const encoded = 'ints:435,supportsObjects:!t';
    expect(rison.encode_object(decoded)).toBe(encoded);
    expect(rison.decode_object(encoded)).toEqual(decoded);
  });

  test('encode_array and decode_array', () => {
    const decoded = ['A', 'B', { supportsObjects: true }];
    const encoded = 'A,B,(supportsObjects:!t)';
    expect(rison.encode_array(decoded)).toBe(encoded);
    expect(rison.decode_array(encoded)).toEqual(decoded);
  });
});

describe('06-roundtrip', () => {
  test('characters should roundtrip through encode_uri/decode_uri', () => {
    const originalObject = { ' &+~!*()-_.\'",:@$/': ' &+~!*()-_.\'",:@$/' };
    expect(rison.decode_uri(rison.encode_uri(originalObject))).toEqual(originalObject);
  });
});
