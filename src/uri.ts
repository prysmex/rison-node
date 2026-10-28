/*
 * URI quoting for rison.
 *
 * Derived from js/rison.js of rison-node (https://github.com/w33ble/rison-node,
 * Apache-2.0, see LICENSE.md, AUTHORS.md and NOTICE), itself a fork of
 * https://github.com/Nanonid/rison. Original attribution from that file:
 *
 *   this is like encodeURIComponent() but quotes fewer characters.
 *   encodeURIComponent passes   ~!*()-_.'
 *   rison.quote also passes   ,:@$/
 *     and quotes " " as "+" instead of "%20"
 *
 * MODIFIED by Prysmex (2026) for prysmex-rison-node: rewritten in
 * TypeScript; `quote`/`unquote` keep their behavior, `encodeUri` now honors
 * `toJSON` and throws like `encode`, and `decodeUri` reports malformed
 * %-escapes as a RisonError.
 */

import { assertString, decode } from './decode.js';
import { encode } from './encode.js';
import { RisonError } from './errors.js';
import type { RisonValue } from './types.js';

const URI_OK = /^[-A-Za-z0-9~!*()_.',:@$/]*$/;

/**
 * Like `encodeURIComponent`, but leaves `,:@$/` alone (in addition to
 * `~!*()-_.'`) and writes a space as `+`.
 *
 * @throws {URIError} if the string contains a lone surrogate.
 */
export function quote(value: string): string {
  if (URI_OK.test(value)) return value;
  return encodeURIComponent(value)
    .replace(/%2C/g, ',')
    .replace(/%3A/g, ':')
    .replace(/%40/g, '@')
    .replace(/%24/g, '$')
    .replace(/%2F/g, '/')
    .replace(/%20/g, '+');
}

/**
 * Like `decodeURIComponent`, but also turns `+` into a space. Reverses `quote`.
 *
 * @throws {URIError} on malformed %-escapes.
 */
export function unquote(value: string): string {
  return decodeURIComponent(value.replace(/\+/g, '%20'));
}

const HEX_PAIR = /^[0-9A-Fa-f]{2}$/;

/**
 * Position of the first %-escape that `decodeURIComponent` rejects, or -1.
 * Exported for tests only (not part of the public API).
 */
export function findMalformedEscape(value: string): number {
  for (let i = value.indexOf('%'); i !== -1; i = value.indexOf('%', i + 1)) {
    const hex = value.slice(i + 1, i + 3);
    if (!HEX_PAIR.test(hex)) return i;
    const byte = parseInt(hex, 16);
    // Length of the UTF-8 sequence that starts with this byte (0: invalid lead).
    const length =
      byte < 0x80
        ? 1
        : byte >= 0xc2 && byte < 0xe0
          ? 2
          : byte >= 0xe0 && byte < 0xf0
            ? 3
            : byte >= 0xf0 && byte < 0xf5
              ? 4
              : 0;
    if (length === 0) return i;
    try {
      decodeURIComponent(value.slice(i, i + 3 * length));
    } catch {
      return i;
    }
    i += 3 * length - 1;
  }
  return -1;
}

/**
 * Encode a value as rison and then URI-quote it with `quote`.
 *
 * @throws {TypeError} like `encode`.
 */
export function encodeUri(value: unknown): string {
  return quote(encode(value));
}

/**
 * Reverse `encodeUri`: `unquote` (so `+` is a space), then `decode`.
 *
 * @throws {RisonError} on malformed %-escapes (the index points into the
 *   quoted input) or invalid rison (the index points into the unquoted text).
 * @throws {TypeError} if the input is not a string.
 */
export function decodeUri(value: string): RisonValue {
  assertString(value, 'decodeUri');
  let unquoted: string;
  try {
    unquoted = unquote(value);
  } catch {
    throw new RisonError('malformed URI escape sequence', Math.max(findMalformedEscape(value), 0));
  }
  return decode(unquoted);
}
