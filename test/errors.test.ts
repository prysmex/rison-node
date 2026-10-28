import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  decode,
  decodeArray,
  decodeObject,
  decodeUri,
  RisonError,
  type RisonValue,
} from '../src/index.js';

function catchError(fn: () => unknown): unknown {
  try {
    fn();
  } catch (error) {
    return error;
  }
  throw new Error('expected the call to throw');
}

function risonError(fn: () => RisonValue): RisonError {
  const error = catchError(fn);
  expect(error).toBeInstanceOf(RisonError);
  return error as RisonError;
}

// The decoder must never write to the console (rison-node console.log'ed
// every parse error).
const consoleSpies: ReturnType<typeof vi.spyOn>[] = [];
beforeEach(() => {
  for (const method of ['log', 'info', 'warn', 'error', 'debug', 'trace'] as const) {
    consoleSpies.push(vi.spyOn(console, method).mockImplementation(() => undefined));
  }
});
afterEach(() => {
  for (const spy of consoleSpies) {
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  }
  consoleSpies.length = 0;
});

describe('RisonError', () => {
  test('is an Error with name, reason, index and a descriptive message', () => {
    const error = risonError(() => decode('(a:1'));
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('RisonError');
    expect(error.reason).toBe("unmatched '('");
    expect(error.index).toBe(4);
    expect(error.message).toBe("rison decoder error: unmatched '(' (at index 4)");
    expect(String(error)).toBe("RisonError: rison decoder error: unmatched '(' (at index 4)");
    expect(error.stack).toContain('RisonError');
  });

  test('can be constructed directly', () => {
    const error = new RisonError('custom', 3);
    expect(error).toBeInstanceOf(RisonError);
    expect(error.index).toBe(3);
    expect(error.reason).toBe('custom');
  });
});

// [input, reason, index]
type Case = [string, string, number];

const cases: Record<string, Case[]> = {
  'empty expression': [['', 'empty expression', 0]],
  "unmatched '('": [
    ['(', "unmatched '('", 1],
    ['(a', "unmatched '('", 2],
    ['(a:', "unmatched '('", 3],
    ['(a:1', "unmatched '('", 4],
    ['(a:1,', "unmatched '('", 5],
    ['(a:(b:1)', "unmatched '('", 8],
    ['!((', "unmatched '('", 3],
  ],
  "unmatched '!('": [
    ['!(', "unmatched '!('", 2],
    ['!(1', "unmatched '!('", 3],
    ['!(1,', "unmatched '!('", 4],
    ['(a:!(', "unmatched '!('", 5],
    ['!(!(1)', "unmatched '!('", 6],
  ],
  "missing ','": [
    ['!(a b)', "missing ','", 3],
    ['(a:1b:2)', "missing ','", 4],
    ['!(1!t)', "missing ','", 3],
    ['!(a(b:1))', "missing ','", 3],
    ["(a:'x'b:1)", "missing ','", 6],
    ['!(!t!f)', "missing ','", 4],
  ],
  "missing ':'": [
    ['(a)', "missing ':'", 2],
    ['(a,b)', "missing ':'", 2],
    ['(a b:1)', "missing ':'", 2],
    ["('a'b:1)", "missing ':'", 4],
    ['(1b:1)', "missing ':'", 2],
    ['(a:1,b)', "missing ':'", 6],
  ],
  "extra ','": [
    ['!(,a)', "extra ','", 2],
    ['(,a:1)', "extra ','", 1],
    ['!(a,)', "extra ','", 3],
    ['(a:1,)', "extra ','", 4],
    ['!(a,,b)', "extra ','", 4],
    ['(a:1,,b:2)', "extra ','", 5],
    ['!(,)', "extra ','", 2],
  ],
  'invalid object key': [
    ['(!t:1)', 'invalid object key', 1],
    ['(!n:1)', 'invalid object key', 1],
    ['(!(a,b):1)', 'invalid object key', 1],
    ['((a:b):1)', 'invalid object key', 1],
    ['(a:1,!f:2)', 'invalid object key', 5],
  ],
  'invalid character': [
    [')', "invalid character: ')'", 0],
    [' a', "invalid character: ' '", 0],
    [':', "invalid character: ':'", 0],
    [',', "invalid character: ','", 0],
    ['*', "invalid character: '*'", 0],
    ['(a: b)', "invalid character: ' '", 3],
    ['( a:1)', "invalid character: ' '", 1],
    ['(a:*)', "invalid character: '*'", 3],
    ['!(@)', "invalid character: '@'", 2],
    ['($:1)', "invalid character: '$'", 1],
    ['(a:,b:1)', "invalid character: ','", 3],
    ['(a:)', "invalid character: ')'", 3],
  ],
  '"!" at end of input': [
    ['!', '"!" at end of input', 1],
    ['!(!', '"!" at end of input', 3],
    ["'abc!", '"!" at end of input', 5],
  ],
  'unknown literal': [
    ['!x', 'unknown literal: "!x"', 0],
    ['!T', 'unknown literal: "!T"', 0],
    ['!(1,!z)', 'unknown literal: "!z"', 4],
    ['!!', 'unknown literal: "!!"', 0],
    ['!😀', 'unknown literal: "!😀"', 0],
  ],
  'invalid string escape': [
    ["'a!b'", 'invalid string escape: "!b"', 2],
    ["'!x'", 'invalid string escape: "!x"', 1],
    ["'! '", 'invalid string escape: "! "', 1],
    ["'!😀'", 'invalid string escape: "!😀"', 1],
  ],
  "unmatched '": [
    ["'", 'unmatched "\'"', 1],
    ["'abc", 'unmatched "\'"', 4],
    ["(a:'b)", 'unmatched "\'"', 6],
    ["'a!'", 'unmatched "\'"', 4],
  ],
  'invalid number': [
    ['-', 'invalid number', 0],
    ['-a', 'invalid number', 0],
    ['-.', 'invalid number', 0],
    ['-.e1', 'invalid number', 0],
    ['1e', 'invalid number', 0],
    ['1e-', 'invalid number', 0],
    ['1e+5', 'invalid number', 0],
    ['1.2.3', 'invalid number', 0],
    ['--1', 'invalid number', 0],
    ['1-2', 'invalid number', 0],
    ['-e5', 'invalid number', 0],
    ['1+', 'invalid number', 0],
    ['(a:1.5.5)', 'invalid number', 3],
    ['!(1,2e)', 'invalid number', 4],
    ['(-:1)', 'invalid number', 1],
    ['(1e:1)', 'invalid number', 1],
  ],
  'trailing characters': [
    ['a b', "unable to parse string as rison: unexpected ' '", 1],
    ['!t!f', "unable to parse string as rison: unexpected '!'", 2],
    ['()()', "unable to parse string as rison: unexpected '('", 2],
    ['abc)', "unable to parse string as rison: unexpected ')'", 3],
    ['1 ', "unable to parse string as rison: unexpected ' '", 1],
    ['(a:1))', "unable to parse string as rison: unexpected ')'", 5],
    ["'a'b", "unable to parse string as rison: unexpected 'b'", 3],
    ['1x', "unable to parse string as rison: unexpected 'x'", 1],
    ["''😀", "unable to parse string as rison: unexpected '😀'", 2],
  ],
};

describe.each(Object.entries(cases))('%s', (_name, list) => {
  test.each(list)('%j', (input, reason, index) => {
    const error = risonError(() => decode(input));
    expect(error.reason).toBe(reason);
    expect(error.index).toBe(index);
    expect(error.message).toBe(`rison decoder error: ${reason} (at index ${String(index)})`);
  });
});

describe('stops at the first error', () => {
  test.each<Case>([
    ['!(a b c', "missing ','", 3],
    ['(a:1 b:2', "missing ','", 4],
    ['!(1,,', "extra ','", 4],
  ])('%j', (input, reason, index) => {
    const error = risonError(() => decode(input));
    expect(error.reason).toBe(reason);
    expect(error.index).toBe(index);
  });
});

describe('no whitespace is allowed outside quoted strings', () => {
  test.each([' 1', '1 ', '( a:1)', '(a :1)', '(a: 1)', '(a:1 )', '!( 1)', '!(1 ,2)', '\t!t'])(
    '%j',
    (input) => {
      expect(() => decode(input)).toThrow(RisonError);
    },
  );

  test('but tabs and newlines are part of ids, as in rison-node', () => {
    expect(decode('a\tb')).toBe('a\tb');
    expect(decode('\n')).toBe('\n');
  });
});

describe('O-rison / A-rison error positions are relative to the caller input', () => {
  test.each<[(s: string) => RisonValue, string, string, number]>([
    [decodeObject, 'a', "missing ':'", 1],
    [decodeObject, 'a:1,', "extra ','", 3],
    [decodeObject, 'a:1 b:2', "missing ','", 3],
    [decodeObject, 'a:(', "unmatched '('", 3],
    [decodeObject, 'a:1),(b:2', "unable to parse string as rison: unexpected ','", 4],
    [decodeObject, ',', "extra ','", 0],
    [decodeArray, '1,', "extra ','", 1],
    [decodeArray, '1 2', "missing ','", 1],
    [decodeArray, '!(', "unmatched '!('", 2],
    [decodeArray, 'a),(b', "unable to parse string as rison: unexpected ','", 2],
  ])('%o(%j)', (fn, input, reason, index) => {
    const error = risonError(() => fn(input));
    expect(error.reason).toBe(reason);
    expect(error.index).toBe(index);
  });
});

describe('decodeUri errors', () => {
  test.each<[string, number]>([
    ['%', 0],
    ['%4', 0],
    ['a%zz', 1],
    ['%E0%A4', 0],
    ['(a:%C3)', 3],
    ['%80', 0],
    ['%C0%80', 0],
    ['%ED%A0%80', 0],
    ['%F5%80%80%80', 0],
    ['ok%41%', 5],
    ['%C3%A9%', 6],
    ['%F0%9F%98%80%FF', 12],
  ])('malformed escape %j -> index %d', (input, index) => {
    const error = risonError(() => decodeUri(input));
    expect(error.reason).toBe('malformed URI escape sequence');
    expect(error.index).toBe(index);
  });

  test('rison errors after unquoting point into the unquoted text', () => {
    const error = risonError(() => decodeUri('(a:%27b)'));
    expect(error.reason).toBe('unmatched "\'"');
    expect(error.index).toBe(6);
  });
});

describe('non-string input', () => {
  const inputs: unknown[] = [
    undefined,
    null,
    1,
    true,
    {},
    [],
    ['(a:1)'],
    Symbol('x'),
    1n,
    () => '!t',
  ];

  test.each([
    ['decode', decode],
    ['decodeObject', decodeObject],
    ['decodeArray', decodeArray],
    ['decodeUri', decodeUri],
  ] as const)('%s throws TypeError', (name, fn) => {
    for (const input of inputs) {
      const error = catchError(() => fn(input as string));
      expect(error).toBeInstanceOf(TypeError);
      expect((error as Error).message).toMatch(
        new RegExp(`^rison\\.${name}: decode input must be a string, got \\w+$`),
      );
    }
    expect(() => fn(null as unknown as string)).toThrow('got null');
    expect(() => fn([] as unknown as string)).toThrow('got object');
  });

  test('String objects are not accepted either', () => {
    expect(() => decode(new String('!t') as unknown as string)).toThrow(TypeError);
  });
});
