import { describe, expect, test } from 'vitest';
import { decode, decodeObject, decodeUri, encode, RisonError } from '../src/index.js';

function expectNoGlobalPollution(): void {
  const probe: Record<string, unknown> = {};
  expect(probe['polluted']).toBeUndefined();
  expect(({} as Record<string, unknown>)['polluted']).toBeUndefined();
  expect((Object.prototype as unknown as Record<string, unknown>)['polluted']).toBeUndefined();
  expect((Array.prototype as unknown as Record<string, unknown>)['polluted']).toBeUndefined();
}

describe('prototype pollution', () => {
  test('__proto__ becomes an own enumerable key; the prototype is unchanged', () => {
    const result = decode('(__proto__:(polluted:!t))') as Record<string, unknown>;
    expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
    expect(Object.keys(result)).toEqual(['__proto__']);
    expect(Object.getOwnPropertyDescriptor(result, '__proto__')).toEqual({
      value: { polluted: true },
      enumerable: true,
      writable: true,
      configurable: true,
    });
    expect(result['polluted']).toBeUndefined();
    expectNoGlobalPollution();
  });

  test('quoted __proto__ key, O-rison and URI forms', () => {
    for (const result of [
      decode("('__proto__':(polluted:!t))"),
      decodeObject('__proto__:(polluted:!t)'),
      decodeUri('(__proto__:(polluted:!t))'),
    ] as Record<string, unknown>[]) {
      expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
      expect(Object.keys(result)).toEqual(['__proto__']);
      expect(result['polluted']).toBeUndefined();
    }
    expectNoGlobalPollution();
  });

  test('__proto__ with a non-object value, nested, and in arrays', () => {
    const a = decode('(__proto__:!n)') as Record<string, unknown>;
    expect(Object.getPrototypeOf(a)).toBe(Object.prototype);
    expect(Object.getOwnPropertyDescriptor(a, '__proto__')?.value).toBeNull();

    const nested = decode('(a:!((__proto__:(polluted:!t))))') as { a: Record<string, unknown>[] };
    const inner = nested.a[0] as Record<string, unknown>;
    expect(Object.getPrototypeOf(inner)).toBe(Object.prototype);
    expect(inner['polluted']).toBeUndefined();
    expectNoGlobalPollution();
  });

  test('duplicate __proto__ keys: the last one wins', () => {
    const result = decode('(__proto__:1,__proto__:2)') as Record<string, unknown>;
    expect(Object.getOwnPropertyDescriptor(result, '__proto__')?.value).toBe(2);
    expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
  });

  test('constructor and prototype keys are plain own properties', () => {
    const result = decode(
      '(constructor:(prototype:(polluted:!t)),prototype:(polluted:!t))',
    ) as Record<string, unknown>;
    expect(Object.keys(result).sort()).toEqual(['constructor', 'prototype']);
    expect(Object.getOwnPropertyDescriptor(result, 'constructor')?.value).toEqual({
      prototype: { polluted: true },
    });
    expect(Object.getOwnPropertyDescriptor(result, 'prototype')?.value).toEqual({ polluted: true });
    expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
    expectNoGlobalPollution();
  });

  test('other Object.prototype names are plain own properties', () => {
    const names = ['hasOwnProperty', 'toString', 'valueOf', 'isPrototypeOf', '__defineGetter__'];
    const result = decode(`(${names.map((n) => `${n}:x`).join(',')})`) as Record<string, unknown>;
    for (const n of names) expect(Object.getOwnPropertyDescriptor(result, n)?.value).toBe('x');
    expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
  });

  test('a decoded __proto__ key round-trips through encode', () => {
    const input = '(__proto__:(polluted:!t),a:1)';
    expect(encode(decode(input))).toBe(input);
    // and JSON.parse-produced own __proto__ keys encode too
    expect(encode(JSON.parse('{"__proto__":{"x":1}}'))).toBe('(__proto__:(x:1))');
  });
});

describe('deep nesting', () => {
  // Decision: the parser is iterative, so nesting depth is limited only by
  // memory. Deep input never throws a RangeError (rison-node recursed and
  // overflowed the stack; `decode('(')` even recursed forever).
  test.each([1_000, 10_000, 100_000])('%d nested arrays', (depth) => {
    const input = '!('.repeat(depth) + ')'.repeat(depth);
    let value = decode(input);
    let levels = 0;
    while (Array.isArray(value) && value.length > 0) {
      value = value[0] as typeof value;
      levels++;
    }
    expect(levels).toBe(depth - 1);
    expect(encode(decode(input))).toBe(input);
  });

  test.each([1_000, 10_000, 100_000])('%d nested objects', (depth) => {
    const input = '(a:'.repeat(depth) + '!n' + ')'.repeat(depth);
    expect(encode(decode(input))).toBe(input);
  });

  test('unterminated deep nesting is a RisonError, not a RangeError', () => {
    expect(() => decode('!('.repeat(100_000))).toThrow(RisonError);
    expect(() => decode('(a:'.repeat(100_000))).toThrow(RisonError);
    expect(() => decode('('.repeat(100_000))).toThrow(RisonError);
  });

  test('deep nesting with a mismatched closer reports the right position', () => {
    const depth = 50_000;
    const input = '!('.repeat(depth) + ')'.repeat(depth - 1) + ',';
    try {
      decode(input);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(RisonError);
      expect((error as RisonError).index).toBe(input.length);
    }
  });
});

describe('id matching is anchored at the current position', () => {
  // rison-node's id regex was global and unanchored: `exec` could skip
  // invalid characters and match an id further along the string.
  test.each(['( a:1)', '(a: b)', '!( a)', '!(*a)', '( 1:1)', ' a'])('%j is rejected', (input) => {
    expect(() => decode(input)).toThrow(RisonError);
  });
});
