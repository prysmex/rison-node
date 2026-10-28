/*
 * Part of prysmex-rison-node, a modified fork of rison-node
 * (https://github.com/w33ble/rison-node), licensed under the Apache License,
 * Version 2.0 (see LICENSE.md, AUTHORS.md and NOTICE).
 *
 * MODIFIED by Prysmex (2026): new file added in the TypeScript rewrite. Replaces
 * the plain `Error('rison decoder error: ...')` thrown by rison-node.
 */

/**
 * Thrown by the decoders when the input is not valid rison.
 *
 * `message` keeps the `rison decoder error: ` prefix used by rison-node, and
 * ends with the position, e.g. `rison decoder error: missing ':' (at index 2)`.
 */
export class RisonError extends Error {
  /**
   * Zero-based position in the input where parsing failed: the first
   * character of the offending token, or `input.length` when the input ended
   * too early. For `decodeObject` / `decodeArray` it is relative to the string
   * you passed (the implied `(` / `!(` wrapper is not counted).
   */
  readonly index: number;

  /** The reason without the prefix and the position, e.g. `missing ':'`. */
  readonly reason: string;

  constructor(reason: string, index: number) {
    super(`rison decoder error: ${reason} (at index ${String(index)})`);
    this.name = 'RisonError';
    this.reason = reason;
    this.index = index;
    // Keep `instanceof` working when the class is transpiled to ES5-style code
    // by a consumer's bundler.
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
