/*
 * prysmex-rison-node: a modified fork of rison-node
 * (https://github.com/w33ble/rison-node) by Joe Fleming and contributors, the
 * Node packaging of Rison (https://github.com/Nanonid/rison). Licensed under
 * the Apache License, Version 2.0 (see LICENSE.md, AUTHORS.md and NOTICE).
 *
 * MODIFIED by Prysmex (2026): new entry point for the TypeScript rewrite,
 * replacing the UMD wrapper of js/rison.js.
 */

import { decode, decodeArray, decodeObject, safeDecode } from './decode.js';
import { encode, encodeArray, encodeObject } from './encode.js';
import { RisonError } from './errors.js';
import { decodeUri, encodeUri, quote, unquote } from './uri.js';

export type { RisonArray, RisonObject, RisonValue } from './types.js';
export {
  decode,
  decodeArray,
  decodeObject,
  decodeUri,
  encode,
  encodeArray,
  encodeObject,
  encodeUri,
  quote,
  RisonError,
  safeDecode,
  unquote,
};

// The snake_case names of rison-node are also named exports, so CommonJS code
// written for rison-node (`const rison = require(...); rison.encode_uri(v)`)
// works without `.default`.
export {
  decodeArray as decode_array,
  decodeObject as decode_object,
  decodeUri as decode_uri,
  encodeArray as encode_array,
  encodeObject as encode_object,
  encodeUri as encode_uri,
};

/** Shape of the default export. */
export interface Rison {
  readonly encode: typeof encode;
  readonly decode: typeof decode;
  readonly safeDecode: typeof safeDecode;
  readonly encodeObject: typeof encodeObject;
  readonly decodeObject: typeof decodeObject;
  readonly encodeArray: typeof encodeArray;
  readonly decodeArray: typeof decodeArray;
  readonly encodeUri: typeof encodeUri;
  readonly decodeUri: typeof decodeUri;
  readonly quote: typeof quote;
  readonly unquote: typeof unquote;
  readonly RisonError: typeof RisonError;
  /** rison-node name, same as `encodeObject`. */
  readonly encode_object: typeof encodeObject;
  /** rison-node name, same as `decodeObject`. */
  readonly decode_object: typeof decodeObject;
  /** rison-node name, same as `encodeArray`. */
  readonly encode_array: typeof encodeArray;
  /** rison-node name, same as `decodeArray`. */
  readonly decode_array: typeof decodeArray;
  /** rison-node name, same as `encodeUri`. */
  readonly encode_uri: typeof encodeUri;
  /** rison-node name, same as `decodeUri`. */
  readonly decode_uri: typeof decodeUri;
}

/**
 * Everything above in one object, including the snake_case names of
 * rison-node, so `import rison from 'prysmex-rison-node';
 * rison.encode_uri(v)` works.
 */
const rison: Rison = {
  encode,
  decode,
  safeDecode,
  encodeObject,
  decodeObject,
  encodeArray,
  decodeArray,
  encodeUri,
  decodeUri,
  quote,
  unquote,
  RisonError,
  encode_object: encodeObject,
  decode_object: decodeObject,
  encode_array: encodeArray,
  decode_array: decodeArray,
  encode_uri: encodeUri,
  decode_uri: decodeUri,
};

export default rison;
