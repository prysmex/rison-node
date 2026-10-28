import { describe, expectTypeOf, test } from 'vitest';
import rison, {
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
  type Rison,
  type RisonArray,
  type RisonObject,
  type RisonValue,
} from '../src/index.js';

describe('types', () => {
  test('RisonValue is the JSON data model', () => {
    /* eslint-disable @typescript-eslint/consistent-indexed-object-style -- the documented form */
    expectTypeOf<RisonValue>().toEqualTypeOf<
      string | number | boolean | null | RisonValue[] | { [key: string]: RisonValue }
    >();
    expectTypeOf<RisonArray>().toEqualTypeOf<RisonValue[]>();
    expectTypeOf<RisonObject>().toEqualTypeOf<{ [key: string]: RisonValue }>();
    /* eslint-enable @typescript-eslint/consistent-indexed-object-style */
    expectTypeOf<RisonObject>().toExtend<RisonValue>();
    expectTypeOf<RisonArray>().toExtend<RisonValue>();
    expectTypeOf<undefined>().not.toExtend<RisonValue>();
    expectTypeOf<Date>().not.toExtend<RisonValue>();
  });

  test('encoders', () => {
    expectTypeOf(encode).toEqualTypeOf<(value: unknown) => string>();
    expectTypeOf(encodeUri).toEqualTypeOf<(value: unknown) => string>();
    expectTypeOf(encodeObject).parameter(0).toEqualTypeOf<object>();
    expectTypeOf(encodeObject).returns.toEqualTypeOf<string>();
    expectTypeOf(encodeArray).parameter(0).toEqualTypeOf<readonly unknown[]>();
    expectTypeOf(encodeArray).returns.toEqualTypeOf<string>();
    expectTypeOf(encodeArray).toBeCallableWith([1, 'a'] as const);
    expectTypeOf(encodeObject).toBeCallableWith({ a: 1 });
    // @ts-expect-error encodeObject needs an object
    encodeObject('a');
    // @ts-expect-error encodeArray needs an array
    encodeArray({});
  });

  test('decoders', () => {
    expectTypeOf(decode).toEqualTypeOf<(input: string) => RisonValue>();
    expectTypeOf(decodeUri).toEqualTypeOf<(input: string) => RisonValue>();
    expectTypeOf(decodeObject).toEqualTypeOf<(input: string) => RisonObject>();
    expectTypeOf(decodeArray).toEqualTypeOf<(input: string) => RisonArray>();
    expectTypeOf(safeDecode).toEqualTypeOf<(input: string) => RisonValue | undefined>();
    // @ts-expect-error decode needs a string
    decode(1);
  });

  test('quote / unquote', () => {
    expectTypeOf(quote).toEqualTypeOf<(value: string) => string>();
    expectTypeOf(unquote).toEqualTypeOf<(value: string) => string>();
  });

  test('RisonError', () => {
    expectTypeOf<RisonError>().toExtend<Error>();
    expectTypeOf<RisonError['index']>().toEqualTypeOf<number>();
    expectTypeOf<RisonError['reason']>().toEqualTypeOf<string>();
    expectTypeOf(RisonError).constructorParameters.toEqualTypeOf<[reason: string, index: number]>();
  });

  test('default export', () => {
    expectTypeOf(rison).toEqualTypeOf<Rison>();
    expectTypeOf(rison.encode).toEqualTypeOf(encode);
    expectTypeOf(rison.encode_uri).toEqualTypeOf(encodeUri);
    expectTypeOf(rison.decode_uri).toEqualTypeOf(decodeUri);
    expectTypeOf(rison.encode_object).toEqualTypeOf(encodeObject);
    expectTypeOf(rison.decode_object).toEqualTypeOf(decodeObject);
    expectTypeOf(rison.encode_array).toEqualTypeOf(encodeArray);
    expectTypeOf(rison.decode_array).toEqualTypeOf(decodeArray);
    expectTypeOf(rison.RisonError).toEqualTypeOf<typeof RisonError>();
  });
});
