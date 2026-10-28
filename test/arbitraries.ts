// Shared fast-check arbitraries for the property-based and differential tests.

import fc from 'fast-check';
import type { RisonValue } from '../src/index.js';

/** Characters that matter to rison: syntax, quoting, numbers, URI quoting. */
const SPECIAL_CHARS = [
  ...` '!:(),*@$-+.%&=?#/~_"\\`,
  ...'0123456789eExabz',
  '\n',
  '\t',
  ' ',
  'é',
  '日',
  '😀',
];

/** Strings made mostly of characters that are significant in rison. */
export const risonishString = fc.string({ unit: fc.constantFrom(...SPECIAL_CHARS), maxLength: 12 });

/** Keys that look like numbers in all the ways rison-node 2.x got wrong. */
export const numberLikeKey = fc.oneof(
  fc.integer().map(String),
  fc.integer({ min: -1000, max: 1000 }).map(String),
  fc.double({ noNaN: true, noDefaultInfinity: true }).map(String),
  fc.nat(999).map((n) => `0${String(n)}`),
  fc.tuple(fc.nat(99), fc.nat(99)).map(([a, b]) => `${String(a)}.${String(b)}0`),
  fc.tuple(fc.nat(9), fc.nat(20)).map(([a, b]) => `${String(a)}e${String(b)}`),
  fc.bigInt({ min: 10n ** 15n, max: 10n ** 25n }).map(String),
  fc.constantFrom(
    '01',
    '007',
    '1e3',
    '1E3',
    '1.50',
    '-0',
    '0x10',
    ' 1',
    '1 ',
    '+1',
    '1.',
    '.5',
    '-.5',
    '1e+3',
    'Infinity',
    '-Infinity',
    'NaN',
    '\n1',
    ' 1',
  ),
);

/** Object keys, with a bias towards the interesting ones. */
export const keyArb = fc.oneof(
  { arbitrary: fc.string({ maxLength: 8 }), weight: 3 },
  { arbitrary: fc.string({ unit: 'grapheme', maxLength: 6 }), weight: 1 },
  { arbitrary: risonishString, weight: 3 },
  { arbitrary: numberLikeKey, weight: 3 },
  { arbitrary: fc.constantFrom('__proto__', 'constructor', 'prototype', 'toString'), weight: 1 },
);

/** Finite numbers, including -0 and extreme exponents. */
export const numberArb = fc.oneof(
  fc.integer(),
  fc.double({ noNaN: true, noDefaultInfinity: true }),
  fc.constantFrom(0, -0, 1e21, 1e-7, Number.MAX_VALUE, Number.MIN_VALUE, Number.MAX_SAFE_INTEGER),
);

export const stringArb = fc.oneof(
  fc.string(),
  fc.string({ unit: 'grapheme' }),
  fc.string({ unit: 'binary' }),
  risonishString,
);

/** Builds an object with defineProperty so `__proto__` keys stay own keys. */
function toObject(entries: [string, RisonValue][]): Record<string, RisonValue> {
  const object: Record<string, RisonValue> = {};
  for (const [key, value] of entries) {
    Object.defineProperty(object, key, {
      value,
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }
  return object;
}

/** JSON-compatible values exercising every rison feature. */
export const valueArb: fc.Arbitrary<RisonValue> = fc.letrec<{ value: RisonValue }>((tie) => ({
  value: fc.oneof(
    { depthSize: 'small', withCrossShrink: true },
    stringArb,
    numberArb,
    fc.boolean(),
    fc.constant(null),
    fc.array(tie('value'), { maxLength: 5 }),
    fc.array(fc.tuple(keyArb, tie('value')), { maxLength: 5 }).map(toObject),
  ),
})).value;

export const objectArb = fc.array(fc.tuple(keyArb, valueArb), { maxLength: 6 }).map(toObject);

/** Replaces -0 with 0, which is what encode writes for -0 (like JSON). */
export function normalize(value: unknown): unknown {
  if (typeof value === 'number') return Object.is(value, -0) ? 0 : value;
  if (Array.isArray(value)) return value.map(normalize);
  if (value !== null && typeof value === 'object') {
    return toObject(
      Object.entries(value).map(
        ([k, v]) => [k, normalize(v) as RisonValue] as [string, RisonValue],
      ),
    );
  }
  return value;
}

/** All own keys of all objects in a value. */
export function allKeys(value: unknown, out: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const item of value) allKeys(item, out);
  } else if (value !== null && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      out.push(key);
      allKeys(item, out);
    }
  }
  return out;
}

/** Lone surrogates cannot be URI-encoded. */
export function hasLoneSurrogate(value: unknown): boolean {
  const re = /[\uD800-\uDFFF]/u;
  return allStrings(value).some((s) => re.test(s));
}

function allStrings(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) for (const item of value) allStrings(item, out);
  else if (value !== null && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      out.push(key);
      allStrings(item, out);
    }
  }
  return out;
}

/** Same value with every object's keys inserted in reverse order. */
export function reverseKeyOrder(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(reverseKeyOrder);
  if (value !== null && typeof value === 'object') {
    return toObject(
      Object.entries(value)
        .reverse()
        .map(([k, v]) => [k, reverseKeyOrder(v) as RisonValue] as [string, RisonValue]),
    );
  }
  return value;
}
