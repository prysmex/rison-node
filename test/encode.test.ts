import { describe, expect, test } from 'vitest';
import { decode, encode } from '../src/index.js';

describe('encode: strings', () => {
  test.each([
    ['', "''"],
    ['a', 'a'],
    ['abc', 'abc'],
    ['hello_world', 'hello_world'],
    ['a-b', 'a-b'],
    ['a.b', 'a.b'],
    ['a/b', 'a/b'],
    ['a~b', 'a~b'],
    ['_', '_'],
    ['.5', '.5'],
    ['+1', '+1'],
    ['a1', 'a1'],
    ['true', 'true'],
    ['null', 'null'],
    ['Infinity', 'Infinity'],
    ['NaN', 'NaN'],
    ['a=b&c', 'a=b&c'],
    ['a%b', 'a%b'],
    ['a"b', 'a"b'],
    ['a\\b', 'a\\b'],
    ['a?b#c', 'a?b#c'],
    ['[x]{y}<z>', '[x]{y}<z>'],
    // Unicode is fine in ids.
    ['é', 'é'],
    ['日本語', '日本語'],
    ['😀', '😀'],
    ['a😀b', 'a😀b'],
    // Control characters other than space are fine in ids (as in rison-node).
    ['a\nb', 'a\nb'],
    ['a\tb', 'a\tb'],
    ['\n', '\n'],
  ])('%j -> %s (bare id)', (input, expected) => {
    expect(encode(input)).toBe(expected);
    expect(decode(expected)).toBe(input);
  });

  // Every character in " '!:(),*@$" forces quotes, wherever it appears.
  test.each([...` '!:(),*@$`])('%j forces quotes', (c) => {
    for (const s of [c, `a${c}`, `${c}a`, `a${c}b`]) {
      const out = encode(s);
      expect(out.startsWith("'") && out.endsWith("'")).toBe(true);
      expect(decode(out)).toBe(s);
    }
  });

  // Strings starting with '-' or a digit are quoted so they never look like numbers.
  test.each([...'-0123456789'])('leading %j forces quotes', (c) => {
    expect(encode(c)).toBe(`'${c}'`);
    expect(encode(`${c}abc`)).toBe(`'${c}abc'`);
    // Only the first character matters.
    expect(encode(`a${c}`)).toBe(`a${c}`);
  });

  test.each([
    ['a b', "'a b'"],
    [' ', "' '"],
    ["'", "'!''"],
    ['!', "'!!'"],
    ["it's", "'it!'s'"],
    ['wow!', "'wow!!'"],
    ["!'!'", "'!!!'!!!''"],
    ['!!', "'!!!!'"],
    ["''", "'!'!''"],
    ['1', "'1'"],
    ['-1', "'-1'"],
    ['1.5', "'1.5'"],
    ['1e3', "'1e3'"],
    ['007', "'007'"],
    ['a:b', "'a:b'"],
    ['(a)', "'(a)'"],
    ['x,y', "'x,y'"],
    ['*', "'*'"],
    ['me@example.com', "'me@example.com'"],
    ['$1', "'$1'"],
    ['a b\nc', "'a b\nc'"],
    ['😀 😀', "'😀 😀'"],
  ])('%j -> %s (quoted)', (input, expected) => {
    expect(encode(input)).toBe(expected);
    expect(decode(expected)).toBe(input);
  });

  test('very long strings', () => {
    const id = 'x'.repeat(100_000);
    expect(encode(id)).toBe(id);
    const quoted = "it's! ".repeat(20_000);
    const out = encode(quoted);
    expect(out).toHaveLength(quoted.length + 2 + 2 * 20_000);
    expect(decode(out)).toBe(quoted);
  });

  test('lone surrogates are kept as-is (rison has no escapes for them)', () => {
    expect(encode('\ud800')).toBe('\ud800');
    expect(decode(encode('a\udc00 b'))).toBe('a\udc00 b');
  });

  test('boxed strings are unwrapped like JSON.stringify', () => {
    // rison-node encoded new String('ab') as (0:a,1:b).
    expect(encode(new String('ab'))).toBe('ab');
    expect(encode({ s: new String('a b') })).toBe("(s:'a b')");
  });
});

describe('encode: numbers', () => {
  test.each([
    [0, '0'],
    [1, '1'],
    [42, '42'],
    [-1, '-1'],
    [-42, '-42'],
    [1.5, '1.5'],
    [-0.25, '-0.25'],
    [0.1, '0.1'],
    [123456789, '123456789'],
    [Number.MAX_SAFE_INTEGER, '9007199254740991'],
    [Number.MIN_SAFE_INTEGER, '-9007199254740991'],
    [1e20, '100000000000000000000'],
    // No '+' in exponents: '+' is not safe in form values.
    [1e21, '1e21'],
    [1.5e300, '1.5e300'],
    [-1e21, '-1e21'],
    [Number.MAX_VALUE, '1.7976931348623157e308'],
    [1e-7, '1e-7'],
    [-1.5e-10, '-1.5e-10'],
    [Number.MIN_VALUE, '5e-324'],
    [Number.EPSILON, '2.220446049250313e-16'],
    // -0 encodes as 0, like JSON.stringify.
    [-0, '0'],
    // Non-finite numbers become null, like JSON.stringify.
    [NaN, '!n'],
    [Infinity, '!n'],
    [-Infinity, '!n'],
  ])('%d -> %s', (input, expected) => {
    expect(encode(input)).toBe(expected);
  });

  test('numbers round-trip', () => {
    for (const n of [0, 1, -1, 1.5, 1e21, 1e-7, Number.MAX_VALUE, Number.MIN_VALUE, 0.1 + 0.2]) {
      expect(decode(encode(n))).toBe(n);
    }
  });

  test('boxed numbers are unwrapped', () => {
    expect(encode(new Number(3))).toBe('3');
    expect(encode([new Number(NaN)])).toBe('!(!n)');
  });
});

describe('encode: booleans and null', () => {
  test.each([
    [true, '!t'],
    [false, '!f'],
    [null, '!n'],
    [new Boolean(false), '!f'],
    [new Boolean(true), '!t'],
  ])('%s -> %s', (input, expected) => {
    expect(encode(input)).toBe(expected);
  });
});

describe('encode: arrays', () => {
  test.each([
    [[], '!()'],
    [[1], '!(1)'],
    [[1, 2, 3], '!(1,2,3)'],
    [['a', 'b c'], "!(a,'b c')"],
    [[true, false, null], '!(!t,!f,!n)'],
    [[[]], '!(!())'],
    [[[], []], '!(!(),!())'],
    [[[[[]]]], '!(!(!(!())))'],
    [[{}], '!(())'],
    [[{ a: 1 }, { b: 2 }], '!((a:1),(b:2))'],
    [[''], "!('')"],
    [['', ''], "!('','')"],
  ])('%j -> %s', (input, expected) => {
    expect(encode(input)).toBe(expected);
    expect(decode(expected)).toEqual(input);
  });

  test('undefined, functions and symbols inside arrays are skipped (not null like JSON)', () => {
    expect(encode([undefined])).toBe('!()');
    expect(encode([1, undefined, 2])).toBe('!(1,2)');
    expect(encode([undefined, 1])).toBe('!(1)');
    expect(encode([() => 1, Symbol('x'), 1n, 2])).toBe('!(2)');
  });

  test('sparse arrays skip their holes', () => {
    // eslint-disable-next-line no-sparse-arrays
    expect(encode([1, , 3])).toBe('!(1,3)');
    expect(encode(new Array(5))).toBe('!()');
  });

  test('extra (non-index) properties of arrays are ignored', () => {
    const a: unknown[] & { extra?: number } = [1];
    a.extra = 2;
    expect(encode(a)).toBe('!(1)');
  });

  test('large arrays', () => {
    const a = Array.from({ length: 100_000 }, (_, i) => i);
    const out = encode(a);
    expect(out.startsWith('!(0,1,2,')).toBe(true);
    expect(decode(out)).toEqual(a);
  });
});

describe('encode: objects', () => {
  test.each([
    [{}, '()'],
    [{ a: 1 }, '(a:1)'],
    [{ a: 'b' }, '(a:b)'],
    [{ a: '' }, "(a:'')"],
    [{ '': 'a' }, "('':a)"],
    [{ 'a b': 'c d' }, "('a b':'c d')"],
    [{ "it's": '!' }, "('it!'s':'!!')"],
    [{ a: { b: { c: {} } } }, '(a:(b:(c:())))'],
    [{ a: [1, { b: [] }] }, '(a:!(1,(b:!())))'],
    [{ a: null, b: true, c: false }, '(a:!n,b:!t,c:!f)'],
    [{ é: 1, '😀': 2 }, '(é:1,😀:2)'],
  ])('%j -> %s', (input, expected) => {
    expect(encode(input)).toBe(expected);
    expect(decode(expected)).toEqual(input);
  });

  test('keys are sorted by UTF-16 code units, regardless of insertion order', () => {
    expect(encode({ b: 1, a: 2, c: 3 })).toBe('(a:2,b:1,c:3)');
    expect(encode({ b: 1, B: 2, a: 3, A: 4 })).toBe('(A:4,B:2,a:3,b:1)');
    expect(encode({ z: 1, '😀': 2, ｚ: 3 })).toBe('(z:1,😀:2,ｚ:3)');
    // Integer-like keys are compared as strings too: '10' < '9'.
    expect(encode({ 9: 'a', 10: 'b', x: 'c' })).toBe('(10:b,9:a,x:c)');
  });

  test('undefined, functions, symbols and bigints are skipped like JSON', () => {
    expect(encode({ a: undefined })).toBe('()');
    expect(encode({ a: 1, b: undefined, c: 2 })).toBe('(a:1,c:2)');
    expect(encode({ a: undefined, b: 1 })).toBe('(b:1)');
    expect(encode({ f: () => 1, s: Symbol('x'), n: 10n, ok: 1 })).toBe('(ok:1)');
  });

  test('symbol keys are ignored', () => {
    expect(encode({ [Symbol('x')]: 1, a: 2 })).toBe('(a:2)');
  });

  test('non-enumerable properties are ignored', () => {
    const o = { a: 1 };
    Object.defineProperty(o, 'hidden', { value: 2, enumerable: false });
    expect(encode(o)).toBe('(a:1)');
  });

  test('getters are read once', () => {
    let reads = 0;
    const o = {
      get a() {
        reads++;
        return 'x';
      },
    };
    expect(encode(o)).toBe('(a:x)');
    expect(reads).toBe(1);
  });

  test('only own enumerable keys, never inherited ones', () => {
    function P(this: { own: number }) {
      this.own = 1;
    }
    (P.prototype as { inherited: number }).inherited = 2;
    const p: unknown = new (P as unknown as new () => object)();
    expect(encode(p)).toBe('(own:1)');
  });

  test('class instances encode their own enumerable fields', () => {
    class Point {
      constructor(
        public x: number,
        public y: number,
      ) {}
      get length() {
        return Math.hypot(this.x, this.y);
      }
      method() {
        return this.x;
      }
    }
    expect(encode(new Point(1, 2))).toBe('(x:1,y:2)');
  });

  test('null-prototype objects', () => {
    const o = Object.create(null) as Record<string, unknown>;
    o['b'] = 1;
    o['a'] = 'x';
    expect(encode(o)).toBe('(a:x,b:1)');
    expect(encode(Object.create(null))).toBe('()');
  });

  test("objects with a property named 'toJSON' that is not a function", () => {
    expect(encode({ toJSON: 1 })).toBe('(toJSON:1)');
  });

  test('many keys', () => {
    const o: Record<string, number> = {};
    for (let i = 0; i < 10_000; i++) o[`k${String(i)}`] = i;
    expect(decode(encode(o))).toEqual(o);
  });
});

describe('encode: number-like object keys', () => {
  // Canonical numbers are written bare (as rison-node 2.x did) ...
  test.each([
    [{ 0: 'a' }, '(0:a)'],
    [{ 1: 'a' }, '(1:a)'],
    [{ 42: 'a' }, '(42:a)'],
    [{ '-1': 'a' }, '(-1:a)'],
    [{ '1.5': 'a' }, '(1.5:a)'],
    [{ '-0.25': 'a' }, '(-0.25:a)'],
    [{ '9007199254740991': 'a' }, '(9007199254740991:a)'],
  ])('%j -> %s', (input, expected) => {
    expect(encode(input)).toBe(expected);
    expect(decode(expected)).toEqual(input);
  });

  // ... everything else that merely looks numeric is quoted (as rison-node 0.3 did).
  test.each([
    ['01', "('01':a)"],
    ['007', "('007':a)"],
    ['00', "('00':a)"],
    ['-0', "('-0':a)"],
    ['1.50', "('1.50':a)"],
    ['1.0', "('1.0':a)"],
    ['1.', "('1.':a)"],
    ['1e3', "('1e3':a)"],
    ['1E3', "('1E3':a)"],
    ['1e+21', "('1e+21':a)"],
    ['0x10', "('0x10':a)"],
    ['0b1', "('0b1':a)"],
    [' 1', "(' 1':a)"],
    ['1 ', "('1 ':a)"],
    ['1_000', "('1_000':a)"],
    ['1a', "('1a':a)"],
    ['-', "('-':a)"],
    ['--1', "('--1':a)"],
    ['0.10', "('0.10':a)"],
    // Would lose digits in a decoder that parses keys as numbers.
    ['12345678901234567890', "('12345678901234567890':a)"],
    ['9007199254740993', "('9007199254740993':a)"],
    ['0.1000000000000000055511151231257827', "('0.1000000000000000055511151231257827':a)"],
    // Not quoted: these are valid ids.
    ['+1', '(+1:a)'],
    ['.5', '(.5:a)'],
    ['Infinity', '(Infinity:a)'],
    ['\t1', '(\t1:a)'],
  ])('key %j -> %s', (key, expected) => {
    expect(encode({ [key]: 'a' })).toBe(expected);
    expect(decode(expected)).toEqual({ [key]: 'a' });
  });
});

describe('encode: toJSON', () => {
  test('Date uses toJSON (ISO string)', () => {
    const d = new Date(Date.UTC(2020, 0, 2, 3, 4, 5, 6));
    expect(encode(d)).toBe("'2020-01-02T03:04:05.006Z'");
    expect(encode({ d })).toBe("(d:'2020-01-02T03:04:05.006Z')");
    expect(encode([d])).toBe("!('2020-01-02T03:04:05.006Z')");
  });

  test('invalid Date becomes null (Date#toJSON returns null)', () => {
    expect(encode(new Date(NaN))).toBe('!n');
  });

  test('custom toJSON, called with the key like JSON.stringify', () => {
    const keys: string[] = [];
    const v = {
      toJSON(key: string) {
        keys.push(key);
        return { replaced: true };
      },
    };
    expect(encode(v)).toBe('(replaced:!t)');
    expect(encode({ a: v })).toBe('(a:(replaced:!t))');
    expect(encode([v, v])).toBe('!((replaced:!t),(replaced:!t))');
    expect(keys).toEqual(['', 'a', '0', '1']);
  });

  test('toJSON returning undefined skips the entry', () => {
    const v = { toJSON: () => undefined };
    expect(encode({ a: v, b: 1 })).toBe('(b:1)');
    expect(() => encode(v)).toThrow(TypeError);
  });

  test('toJSON on a function is honored, like JSON.stringify and rison-node', () => {
    const fn = Object.assign(() => 1, { toJSON: () => 'F' });
    expect(encode(fn)).toBe('F');
    expect(encode({ fn, x: () => 1 })).toBe('(fn:F)');
    expect(JSON.stringify({ fn })).toBe('{"fn":"F"}');
  });

  test('toJSON on a bigint is honored', () => {
    const proto = BigInt.prototype as { toJSON?: () => string };
    proto.toJSON = function (this: bigint) {
      return this.toString();
    };
    try {
      expect(encode(10n)).toBe("'10'");
      expect(encode({ n: 10n })).toBe("(n:'10')");
    } finally {
      delete proto.toJSON;
    }
  });
});

describe('encode: other built-ins', () => {
  test('Map and Set have no own enumerable keys, so they encode as () (like JSON {})', () => {
    expect(encode(new Map([['a', 1]]))).toBe('()');
    expect(encode(new Set([1, 2]))).toBe('()');
  });

  test('RegExp and Error encode as () like JSON {}', () => {
    expect(encode(/x/)).toBe('()');
    expect(encode(new Error('x'))).toBe('()');
  });

  test('typed arrays encode as objects keyed by index, like JSON', () => {
    expect(encode(new Uint8Array([1, 2]))).toBe('(0:1,1:2)');
  });

  test('functions with own properties are still skipped', () => {
    const f = Object.assign(() => 1, { a: 1 });
    expect(encode({ f })).toBe('()');
  });
});

describe('encode: values that cannot be encoded', () => {
  test.each([
    ['undefined', undefined],
    ['function', () => 1],
    ['symbol', Symbol('x')],
    ['bigint', 1n],
  ])('top-level %s throws TypeError', (type, value) => {
    expect(() => encode(value)).toThrow(TypeError);
    expect(() => encode(value)).toThrow(`cannot encode a value of type ${type}`);
  });

  test('circular structures throw TypeError instead of overflowing the stack', () => {
    const o: Record<string, unknown> = {};
    o['self'] = o;
    expect(() => encode(o)).toThrow(TypeError);
    expect(() => encode(o)).toThrow(/circular/);
    const a: unknown[] = [];
    a.push([a]);
    expect(() => encode(a)).toThrow(/circular/);
  });

  test('repeated (non-circular) references are fine', () => {
    const shared = { x: 1 };
    expect(encode({ a: shared, b: shared, c: [shared, shared] })).toBe(
      '(a:(x:1),b:(x:1),c:!((x:1),(x:1)))',
    );
  });

  test('errors thrown by getters or toJSON propagate', () => {
    const boom = new Error('boom');
    const o = {
      get a(): never {
        throw boom;
      },
    };
    expect(() => encode(o)).toThrow(boom);
    expect(() =>
      encode({
        toJSON() {
          throw boom;
        },
      }),
    ).toThrow(boom);
  });
});

describe('encode: deep nesting', () => {
  test('100k levels of arrays and objects do not overflow the stack', () => {
    const depth = 100_000;
    let a: unknown = [];
    for (let i = 0; i < depth; i++) a = [a];
    const out = encode(a);
    expect(out).toBe('!('.repeat(depth + 1) + ')'.repeat(depth + 1));

    let o: unknown = {};
    for (let i = 0; i < depth; i++) o = { a: o };
    expect(encode(o)).toBe('(a:'.repeat(depth) + '()' + ')'.repeat(depth));
  });
});
