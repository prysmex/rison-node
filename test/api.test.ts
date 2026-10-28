import { describe, expect, test } from 'vitest';
import * as api from '../src/index.js';
import rison from '../src/index.js';

describe('public API', () => {
  test('named exports', () => {
    expect(Object.keys(api).sort()).toEqual(
      [
        'RisonError',
        'decode',
        'decodeArray',
        'decodeObject',
        'decodeUri',
        'decode_array',
        'decode_object',
        'decode_uri',
        'default',
        'encode_array',
        'encode_object',
        'encode_uri',
        'encode',
        'encodeArray',
        'encodeObject',
        'encodeUri',
        'quote',
        'safeDecode',
        'unquote',
      ].sort(),
    );
  });

  test('default export has the named functions and the rison-node snake_case aliases', () => {
    expect(Object.keys(rison).sort()).toEqual(
      [
        'RisonError',
        'decode',
        'decodeArray',
        'decodeObject',
        'decodeUri',
        'encode',
        'encodeArray',
        'encodeObject',
        'encodeUri',
        'quote',
        'safeDecode',
        'unquote',
        'encode_object',
        'decode_object',
        'encode_array',
        'decode_array',
        'encode_uri',
        'decode_uri',
      ].sort(),
    );
    expect(rison.encode).toBe(api.encode);
    expect(rison.decode).toBe(api.decode);
    expect(rison.safeDecode).toBe(api.safeDecode);
    expect(rison.encode_object).toBe(api.encodeObject);
    expect(rison.decode_object).toBe(api.decodeObject);
    expect(rison.encode_array).toBe(api.encodeArray);
    expect(rison.decode_array).toBe(api.decodeArray);
    expect(rison.encode_uri).toBe(api.encodeUri);
    expect(rison.decode_uri).toBe(api.decodeUri);
    expect(rison.quote).toBe(api.quote);
    expect(rison.unquote).toBe(api.unquote);
    expect(rison.RisonError).toBe(api.RisonError);
  });

  test('the snake_case aliases are also named exports (for require())', () => {
    expect(api.encode_object).toBe(api.encodeObject);
    expect(api.decode_object).toBe(api.decodeObject);
    expect(api.encode_array).toBe(api.encodeArray);
    expect(api.decode_array).toBe(api.decodeArray);
    expect(api.encode_uri).toBe(api.encodeUri);
    expect(api.decode_uri).toBe(api.decodeUri);
  });

  test('rison-node style usage through the default export', () => {
    expect(rison.encode_uri({ a: 'x y' })).toBe("(a:'x+y')");
    expect(rison.decode_uri("(a:'x+y')")).toEqual({ a: 'x y' });
    expect(rison.encode_object({ a: 1 })).toBe('a:1');
    expect(rison.decode_object('a:1')).toEqual({ a: 1 });
    expect(rison.encode_array([1])).toBe('1');
    expect(rison.decode_array('1')).toEqual([1]);
  });

  test('rison.parser and the internal tables of rison-node are not exported', () => {
    for (const name of ['parser', 'uri_ok', 'not_idchar', 'not_idstart', 'id_ok', 'next_id']) {
      expect(name in rison).toBe(false);
      expect(name in api).toBe(false);
    }
  });
});
