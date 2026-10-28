/*
 * Rison encoder.
 *
 * Derived from js/rison.js of rison-node (https://github.com/w33ble/rison-node,
 * Apache-2.0, see LICENSE.md, AUTHORS.md and NOTICE), itself a fork of
 * https://github.com/Nanonid/rison. Original attribution from that file:
 *
 *   the stringifier is based on
 *     http://json.org/json.js as of 2006-04-28 from json.org
 *
 *   based on json.js 2006-04-28 from json.org
 *   license: http://www.json.org/license.html
 *
 *   hacked by nix for use in uris.
 *
 *   rison-encode a javascript structure
 *    implemementation based on Douglas Crockford's json.js:
 *      http://json.org/json.js as of 2006-04-28 from json.org
 *
 * MODIFIED by Prysmex (2026) for prysmex-rison-node: rewritten in
 * TypeScript as an iterative encoder. Behavior changes (see README
 * "Differences from rison-node"): only own enumerable keys are encoded,
 * number-like keys are written bare only when they are canonical numbers,
 * boxed primitives are unwrapped, circular structures throw a TypeError, and
 * non-encodable top-level values throw a TypeError.
 */

/**
 * Characters that may not appear in a bare id (unquoted string). Everything
 * else, including non-ASCII, is allowed.
 */
const NOT_IDCHAR = " '!:(),*@$";

/** Characters that may not start a bare id, so ids never look like numbers. */
const NOT_IDSTART = '-0123456789';

/** Matches a string that can be written as a bare id. */
export const ID_OK = new RegExp(`^[^${NOT_IDSTART}${NOT_IDCHAR}][^${NOT_IDCHAR}]*$`);

/**
 * A number in its shortest decimal form: no exponent, no leading zeros, no
 * trailing zeros in the fraction.
 */
const CANONICAL_NUMBER = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]*[1-9])?$/;

const STRING_ESCAPE = /['!]/g;

export function encodeString(value: string): string {
  if (value === '') return "''";
  if (ID_OK.test(value)) return value;
  return `'${value.replace(STRING_ESCAPE, '!$&')}'`;
}

export function encodeNumber(value: number): string {
  if (!Number.isFinite(value)) return '!n';
  // Strip '+' from the exponent ('1e+21' -> '1e21'); '-' is fine.
  return String(value).replace('+', '');
}

/**
 * Object keys that are canonical numbers (`1`, `-2`, `1.5`) are written bare,
 * as rison-node 2.x did. Every other key goes through the string rules, so
 * `'01'`, `'1e3'`, `'1.50'`, `'-0'` or `'0x10'` are quoted and survive a round
 * trip through any rison decoder. The `String(Number(key)) === key` check also
 * quotes keys that a number-parsing decoder would change (more than ~16
 * significant digits, e.g. `'12345678901234567890'`).
 */
export function encodeKey(key: string): string {
  if (CANONICAL_NUMBER.test(key) && String(Number(key)) === key) return key;
  return encodeString(key);
}

interface ArrayFrame {
  readonly isArray: true;
  readonly source: object;
  readonly items: readonly unknown[];
  index: number;
  empty: boolean;
}

interface ObjectFrame {
  readonly isArray: false;
  readonly source: object;
  readonly record: Readonly<Record<string, unknown>>;
  readonly keys: readonly string[];
  index: number;
  empty: boolean;
}

type Frame = ArrayFrame | ObjectFrame;

function applyToJSON(value: unknown, key: string | number): unknown {
  // Like JSON.stringify (and rison-node), functions with a toJSON method count.
  if (
    (typeof value === 'object' && value !== null) ||
    typeof value === 'function' ||
    typeof value === 'bigint'
  ) {
    const toJSON = (value as { toJSON?: unknown }).toJSON;
    if (typeof toJSON === 'function') {
      return (toJSON as (this: unknown, key: string) => unknown).call(value, String(key));
    }
  }
  return value;
}

/**
 * Encode `input` to rison. Returns `undefined` when the value itself is not
 * encodable (undefined, a function, a symbol, a bigint), mirroring
 * `JSON.stringify`.
 *
 * The encoder walks the structure with an explicit stack instead of recursion,
 * so arbitrarily deep values cannot overflow the call stack, and it collects
 * output chunks in an array that is joined once at the end.
 */
export function encodeValue(input: unknown): string | undefined {
  const out: string[] = [];
  const stack: Frame[] = [];
  // Objects on the current path from the root, for cycle detection.
  const ancestors = new Set<object>();

  // Returns the token for a scalar, or the opening token of a container (after
  // pushing its frame), or undefined if the value must be skipped.
  const begin = (raw: unknown, key: string | number): string | undefined => {
    const value = applyToJSON(raw, key);
    switch (typeof value) {
      case 'string':
        return encodeString(value);
      case 'number':
        return encodeNumber(value);
      case 'boolean':
        return value ? '!t' : '!f';
      case 'object': {
        if (value === null) return '!n';
        // Unwrap boxed primitives like JSON.stringify does.
        if (value instanceof Number) return encodeNumber(Number(value));
        if (value instanceof String) return encodeString(String(value));
        if (value instanceof Boolean) return value.valueOf() ? '!t' : '!f';
        if (ancestors.has(value)) {
          throw new TypeError('rison.encode: cannot encode a circular structure');
        }
        ancestors.add(value);
        if (Array.isArray(value)) {
          stack.push({ isArray: true, source: value, items: value, index: 0, empty: true });
          return '!(';
        }
        const record = value as Readonly<Record<string, unknown>>;
        // Default sort compares UTF-16 code units, exactly like rison-node.
        const keys = Object.keys(record).sort();
        stack.push({ isArray: false, source: value, record, keys, index: 0, empty: true });
        return '(';
      }
      default:
        // undefined, function, symbol, bigint: skipped like JSON skips them.
        return undefined;
    }
  };

  const root = begin(input, '');
  if (root === undefined) return undefined;
  out.push(root);

  while (stack.length > 0) {
    const frame = stack[stack.length - 1] as Frame;
    if (frame.isArray) {
      if (frame.index >= frame.items.length) {
        out.push(')');
        stack.pop();
        ancestors.delete(frame.source);
        continue;
      }
      const index = frame.index++;
      const token = begin(frame.items[index], index);
      if (token === undefined) continue;
      if (frame.empty) frame.empty = false;
      else out.push(',');
      out.push(token);
    } else {
      if (frame.index >= frame.keys.length) {
        out.push(')');
        stack.pop();
        ancestors.delete(frame.source);
        continue;
      }
      const key = frame.keys[frame.index++] as string;
      const token = begin(frame.record[key], key);
      if (token === undefined) continue;
      if (frame.empty) frame.empty = false;
      else out.push(',');
      out.push(encodeKey(key), ':', token);
    }
  }

  return out.join('');
}

/**
 * Encode any JSON-compatible value as rison.
 *
 * @throws {TypeError} if the value (after `toJSON`) is `undefined`, a function,
 *   a symbol or a bigint, or if it contains a circular reference.
 */
export function encode(value: unknown): string {
  const result = encodeValue(value);
  if (result === undefined) {
    throw new TypeError(`rison.encode: cannot encode a value of type ${typeof value}`);
  }
  return result;
}

/**
 * Encode an object as O-rison: rison without the surrounding `( )`.
 *
 * @throws {TypeError} if the value does not encode to a rison object.
 */
export function encodeObject(value: object): string {
  const result = encodeValue(value);
  if (result?.startsWith('(') !== true) {
    throw new TypeError('rison.encodeObject expects an object argument');
  }
  return result.slice(1, -1);
}

/**
 * Encode an array as A-rison: rison without the surrounding `!( )`.
 *
 * @throws {TypeError} if the value does not encode to a rison array.
 */
export function encodeArray(value: readonly unknown[]): string {
  const result = encodeValue(value);
  if (result?.startsWith('!(') !== true) {
    throw new TypeError('rison.encodeArray expects an array argument');
  }
  return result.slice(2, -1);
}
