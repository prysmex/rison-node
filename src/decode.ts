/*
 * Rison decoder.
 *
 * Derived from js/rison.js of rison-node (https://github.com/w33ble/rison-node,
 * Apache-2.0, see LICENSE.md, AUTHORS.md and NOTICE), itself a fork of
 * https://github.com/Nanonid/rison. Original attribution from that file:
 *
 *   the parser is based on
 *     http://osteele.com/sources/openlaszlo/json
 *
 *   based on openlaszlo-json and hacked by nix for use in uris.
 *
 *   Author: Oliver Steele
 *   Copyright: Copyright 2006 Oliver Steele.  All rights reserved.
 *   Homepage: http://osteele.com/sources/openlaszlo/json
 *   License: MIT License.
 *   Version: 1.0
 *
 * MODIFIED by Prysmex (2026) for prysmex-rison-node: rewritten in
 * TypeScript as an iterative (non-recursive) parser that stops at the first
 * error and throws a RisonError with the error position. Behavior changes
 * (see README "Differences from rison-node"): no console output; ids are
 * matched only at the current position; malformed numbers (`1e`, `--1`, `1-2`)
 * are errors instead of NaN; number keys keep their text as written; object
 * keys must be ids, strings or numbers; `__proto__` becomes an own property;
 * trailing commas and truncated input are proper RisonErrors; nesting depth is
 * limited only by memory.
 */

import { RisonError } from './errors.js';
import type { RisonArray, RisonObject, RisonValue } from './types.js';

/** A bare id: same character classes as the encoder's ID_OK, sticky. */
const ID = /[^-0-9 '!:(),*@$][^ '!:(),*@$]*/y;

/**
 * A number token. Accepts what rison-node accepted and evaluated to a number:
 * optional `-`, digits (leading zeros allowed), optional fraction (`1.` and
 * `-.5` are allowed), optional exponent with `e`/`E` and optional `-` (never
 * `+`). A token always starts with `-` or a digit; `.5` is an id.
 */
const NUMBER = /-?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE]-?[0-9]+)?/y;

/** Characters that may not directly follow a number token. */
const NUMBER_CONTINUATION = /[0-9.eE+-]/;

interface Frame {
  readonly container: RisonArray | RisonObject;
  readonly isArray: boolean;
  key: string;
}

/** Marker returned by readValue when it opened a container. */
const OPEN: unique symbol = Symbol('open');

/** The code point at `i` (callers guarantee `i < s.length`). */
function charAt(s: string, i: number): string {
  // Report whole code points in error messages, not lone surrogate halves.
  return String.fromCodePoint(s.codePointAt(i) as number);
}

class Parser {
  private i = 0;
  private readonly stack: Frame[] = [];

  /**
   * @param s the full text to parse
   * @param offset length of an implied prefix (`(` or `!(`) that the caller
   *   added, subtracted from error positions
   * @param userLength length of the caller's input, the upper bound for error
   *   positions
   */
  constructor(
    private readonly s: string,
    private readonly offset = 0,
    private readonly userLength = s.length,
  ) {}

  private fail(reason: string, index: number): never {
    const position = Math.min(Math.max(index - this.offset, 0), this.userLength);
    throw new RisonError(reason, position);
  }

  private failUnmatched(): never {
    const top = this.stack[this.stack.length - 1] as Frame;
    this.fail(top.isArray ? "unmatched '!('" : "unmatched '('", this.s.length);
  }

  parse(): RisonValue {
    const { s, stack } = this;
    let value: RisonValue | typeof OPEN = this.readValue();

    for (;;) {
      if (value === OPEN) {
        const frame = stack[stack.length - 1] as Frame;
        if (s.charCodeAt(this.i) === 0x29 /* ) */) {
          this.i++;
          stack.pop();
          value = frame.container;
        } else {
          this.beginEntry(frame);
          value = this.readValue();
          continue;
        }
      }

      // `value` is complete.
      const frame = stack[stack.length - 1];
      if (frame === undefined) break;

      if (frame.isArray) {
        (frame.container as RisonArray).push(value);
      } else if (frame.key === '__proto__') {
        // Never let input change the prototype of the decoded object.
        Object.defineProperty(frame.container, '__proto__', {
          value,
          enumerable: true,
          writable: true,
          configurable: true,
        });
      } else {
        (frame.container as RisonObject)[frame.key] = value;
      }

      const c = s.charCodeAt(this.i);
      if (c === 0x2c /* , */) {
        this.i++;
        if (s.charCodeAt(this.i) === 0x29 /* ) */) this.fail("extra ','", this.i - 1);
        this.beginEntry(frame);
        value = this.readValue();
      } else if (c === 0x29 /* ) */) {
        this.i++;
        stack.pop();
        value = frame.container;
      } else if (this.i >= s.length) {
        this.failUnmatched();
      } else {
        this.fail("missing ','", this.i);
      }
    }

    if (this.i < s.length) {
      this.fail(`unable to parse string as rison: unexpected '${charAt(s, this.i)}'`, this.i);
    }
    return value;
  }

  /** Called before each array element / object entry. */
  private beginEntry(frame: Frame): void {
    if (this.s.charCodeAt(this.i) === 0x2c /* , */) this.fail("extra ','", this.i);
    if (frame.isArray) return;
    frame.key = this.readKey();
    if (this.s.charCodeAt(this.i) !== 0x3a /* : */) {
      if (this.i >= this.s.length) this.failUnmatched();
      this.fail("missing ':'", this.i);
    }
    this.i++;
  }

  private readKey(): string {
    const { s, i } = this;
    const c = s.charAt(i);
    if (c === "'") return this.readString();
    if (c === '-' || (c >= '0' && c <= '9')) {
      // Keep the key text as written: `(01:a)` -> { '01': 'a' }.
      return this.readNumberToken();
    }
    const id = this.readId();
    if (id !== undefined) return id;
    if (i >= s.length) this.failUnmatched();
    if (c === '!' || c === '(') this.fail('invalid object key', i);
    return this.fail(`invalid character: '${charAt(s, i)}'`, i);
  }

  private readValue(): RisonValue | typeof OPEN {
    const { s, i } = this;
    if (i >= s.length) {
      if (this.stack.length > 0) this.failUnmatched();
      this.fail('empty expression', i);
    }
    const c = s.charAt(i);
    switch (c) {
      case '!': {
        if (i + 1 >= s.length) this.fail('"!" at end of input', s.length);
        const literal = s.charAt(i + 1);
        this.i = i + 2;
        switch (literal) {
          case 't':
            return true;
          case 'f':
            return false;
          case 'n':
            return null;
          case '(':
            this.stack.push({ container: [], isArray: true, key: '' });
            return OPEN;
          default:
            return this.fail(`unknown literal: "!${charAt(s, i + 1)}"`, i);
        }
      }
      case '(':
        this.i = i + 1;
        this.stack.push({ container: {}, isArray: false, key: '' });
        return OPEN;
      case "'":
        return this.readString();
      default: {
        if (c === '-' || (c >= '0' && c <= '9')) return Number(this.readNumberToken());
        const id = this.readId();
        if (id !== undefined) return id;
        return this.fail(`invalid character: '${charAt(s, i)}'`, i);
      }
    }
  }

  private readId(): string | undefined {
    ID.lastIndex = this.i;
    const match = ID.exec(this.s);
    if (match === null) return undefined;
    this.i += match[0].length;
    return match[0];
  }

  private readNumberToken(): string {
    const { s, i } = this;
    NUMBER.lastIndex = i;
    const match = NUMBER.exec(s);
    if (match === null) return this.fail('invalid number', i);
    const end = i + match[0].length;
    if (NUMBER_CONTINUATION.test(s.charAt(end))) this.fail('invalid number', i);
    this.i = end;
    return match[0];
  }

  /** Reads a quoted string; `this.i` is at the opening quote. */
  private readString(): string {
    const { s } = this;
    const quoteIndex = this.i;
    const segments: string[] = [];
    let start = quoteIndex + 1;
    let i = start;
    for (;;) {
      const c = s.charCodeAt(i);
      if (c === 0x27 /* ' */) break;
      if (c === 0x21 /* ! */) {
        const escaped = s.charAt(i + 1);
        if (escaped === '') this.fail('"!" at end of input', s.length);
        if (escaped !== '!' && escaped !== "'") {
          this.fail(`invalid string escape: "!${charAt(s, i + 1)}"`, i);
        }
        if (start < i) segments.push(s.slice(start, i));
        segments.push(escaped);
        i += 2;
        start = i;
      } else if (i >= s.length) {
        this.fail('unmatched "\'"', s.length);
      } else {
        i++;
      }
    }
    this.i = i + 1;
    if (segments.length === 0) return s.slice(start, i);
    if (start < i) segments.push(s.slice(start, i));
    return segments.join('');
  }
}

/** Throws a TypeError unless `input` is a string. */
export function assertString(input: unknown, fn: string): asserts input is string {
  if (typeof input !== 'string') {
    const type = input === null ? 'null' : typeof input;
    throw new TypeError(`rison.${fn}: decode input must be a string, got ${type}`);
  }
}

/**
 * Parse a rison string.
 *
 * @throws {RisonError} if the input is not valid rison.
 * @throws {TypeError} if the input is not a string.
 */
export function decode(input: string): RisonValue {
  assertString(input, 'decode');
  return new Parser(input).parse();
}

/**
 * Parse an O-rison string (an object without the surrounding `( )`).
 *
 * @throws {RisonError} if the input is not valid O-rison.
 * @throws {TypeError} if the input is not a string.
 */
export function decodeObject(input: string): RisonObject {
  assertString(input, 'decodeObject');
  return new Parser(`(${input})`, 1, input.length).parse() as RisonObject;
}

/**
 * Parse an A-rison string (an array without the surrounding `!( )`).
 *
 * @throws {RisonError} if the input is not valid A-rison.
 * @throws {TypeError} if the input is not a string.
 */
export function decodeArray(input: string): RisonArray {
  assertString(input, 'decodeArray');
  return new Parser(`!(${input})`, 2, input.length).parse() as RisonArray;
}

/**
 * Like `decode`, but returns `undefined` instead of throwing when the input is
 * not a string or not valid rison. Never throws.
 */
export function safeDecode(input: string): RisonValue | undefined {
  if (typeof input !== 'string') return undefined;
  try {
    return decode(input);
  } catch {
    // decode only throws RisonError once the input is known to be a string.
    return undefined;
  }
}
