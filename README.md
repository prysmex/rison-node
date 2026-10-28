# prysmex-rison-node

[![Apache License](https://img.shields.io/badge/license-apache_2.0-a9215a.svg)](./LICENSE.md)
[![npm](https://img.shields.io/npm/v/prysmex-rison-node.svg)](https://www.npmjs.com/package/prysmex-rison-node)

> **This is a fork.** `prysmex-rison-node` is a modified fork of
> [rison-node](https://github.com/w33ble/rison-node) by Joe Fleming and
> contributors ([AUTHORS.md](./AUTHORS.md)), which is itself the npm packaging of
> [Rison](https://github.com/Nanonid/rison), a mirror of the original Rison page
> and implementation from the now offline mjtemplate.org.
>
> The Rison format, its documentation and the original implementation are
> theirs. As credited in rison-node's `js/rison.js`, the encoder is based on
> [Douglas Crockford](http://json.org)'s [json.js](http://json.org/json.js), the
> decoder is based on [Oliver Steele](http://osteele.com)'s
> [JSON for OpenLaszlo](http://osteele.com/sources/openlaszlo/json/), and both
> were "hacked by nix for use in uris".
>
> This fork adds TypeScript types, an ES module + CommonJS build, bug fixes and
> tests. See [Differences from rison-node](#differences-from-rison-node),
> [NOTICE](./NOTICE) and [CHANGELOG.md](./CHANGELOG.md). It is licensed under the
> Apache License 2.0, like rison-node ([LICENSE.md](./LICENSE.md)).

Rison is a compact, URI-friendly variation of JSON:
`{"any": "json", "yes": true}` becomes `(any:json,yes:!t)`.

## Install

```sh
npm install prysmex-rison-node
```

Node.js 18 or newer, or any bundler. No runtime dependencies.

## Usage

```js
import { encode, decode } from 'prysmex-rison-node';

encode({ any: 'json', yes: true });
// '(any:json,yes:!t)'

decode('(any:json,yes:!t)');
// { any: 'json', yes: true }
```

The default export has every function, including the snake_case names of
rison-node, so existing rison-node code keeps working after changing the import:

```js
import rison from 'prysmex-rison-node';
// or: const rison = require('prysmex-rison-node');

// Rison
rison.encode({ any: 'json', yes: true });
// '(any:json,yes:!t)'

// O-Rison
rison.encode_object({ supportsObjects: true, ints: 435 });
// 'ints:435,supportsObjects:!t'

// A-Rison
rison.encode_array(['A', 'B', { supportsObjects: true }]);
// 'A,B,(supportsObjects:!t)'

// URI-quoted
rison.encode_uri({ q: 'hello world' });
// "(q:'hello+world')"

rison.decode('(any:json,yes:!t)');
rison.decode_object('ints:435,supportsObjects:!t');
rison.decode_array('A,B,(supportsObjects:!t)');
rison.decode_uri("(q:'hello+world')");
```

## API

All functions are named exports of both the ES module and the CommonJS build,
and properties of the default export.

| Function                                                                                     | Description                                                                                                                                                                                                                                                                                                                                                   |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `encode(value: unknown): string`                                                             | Encode a value as Rison. Like `JSON.stringify`: calls `toJSON`, skips `undefined`, functions and symbols inside objects and arrays, encodes `NaN`/`Infinity` as `!n`. Object keys are the value's own enumerable string keys, sorted. Throws a `TypeError` if the value itself can't be encoded (`undefined`, a function, a symbol, a bigint) or is circular. |
| `decode(input: string): RisonValue`                                                          | Parse a Rison string. Throws a `RisonError` if the input is not valid Rison, a `TypeError` if it is not a string.                                                                                                                                                                                                                                             |
| `safeDecode(input: string): RisonValue \| undefined`                                         | Like `decode`, but returns `undefined` instead of throwing.                                                                                                                                                                                                                                                                                                   |
| `encodeObject(value: object): string`                                                        | Encode an object as O-Rison (without the surrounding `()`). Throws a `TypeError` if the value doesn't encode to an object.                                                                                                                                                                                                                                    |
| `decodeObject(input: string): RisonObject`                                                   | Parse O-Rison.                                                                                                                                                                                                                                                                                                                                                |
| `encodeArray(value: readonly unknown[]): string`                                             | Encode an array as A-Rison (without the surrounding `!()`). Throws a `TypeError` if the value doesn't encode to an array.                                                                                                                                                                                                                                     |
| `decodeArray(input: string): RisonArray`                                                     | Parse A-Rison.                                                                                                                                                                                                                                                                                                                                                |
| `encodeUri(value: unknown): string`                                                          | `quote(encode(value))`.                                                                                                                                                                                                                                                                                                                                       |
| `decodeUri(input: string): RisonValue`                                                       | `decode(unquote(input))`. Malformed `%` escapes are a `RisonError`.                                                                                                                                                                                                                                                                                           |
| `quote(value: string): string`                                                               | Like `encodeURIComponent`, but leaves `,:@$/` unescaped and writes a space as `+`.                                                                                                                                                                                                                                                                            |
| `unquote(value: string): string`                                                             | Reverse of `quote`: `decodeURIComponent` that also turns `+` into a space.                                                                                                                                                                                                                                                                                    |
| `encode_object`, `decode_object`, `encode_array`, `decode_array`, `encode_uri`, `decode_uri` | The rison-node names, the same functions as their camelCase counterparts.                                                                                                                                                                                                                                                                                     |

`RisonError extends Error` is thrown by every decoder. It has:

- `index`: the zero-based position in the input where parsing failed (for
  `decodeObject`/`decodeArray`, in the string you passed; for `decodeUri`, in
  the unquoted string, or in the quoted string for a malformed `%` escape),
- `reason`: the message without prefix and position, e.g. `missing ':'`,
- `message`: `rison decoder error: <reason> (at index <index>)`.

```ts
import { decode, RisonError } from 'prysmex-rison-node';

try {
  decode('(a:1,b)');
} catch (error) {
  if (error instanceof RisonError) console.log(error.reason, error.index); // "missing ':'" 6
}
```

Types: `RisonValue` (`string | number | boolean | null | RisonValue[] | { [key: string]: RisonValue }`), `RisonObject` and `RisonArray`.

Nesting depth is limited only by memory: the encoder and the decoder are
iterative, so deeply nested input never overflows the call stack.

## Differences from rison-node

The format is unchanged: everything rison-node 2.1.1 or 0.3.1 encodes decodes
to the same value here, except for the bugs in "Encoding" below where the old
output was already wrong. The test suite checks this against both published
versions.

### Compared to rison-node 2.1.1

Encoding:

- **Number-like object keys** are written bare only when they are canonical
  numbers (`1`, `-2`, `1.5`); other keys are quoted. 2.1.1 wrote any key that
  `parseInt` accepted as a number, so `{'01': v}` became `(01:v)` and decoded
  as `{'1': v}` (also `'007'` → `'7'`, `'1e3'` → `'1000'`, `'1.50'` → `'1.5'`,
  `'+1'` → `'1'`, `'-0'` → `'0'`, large integers lost digits), and keys like
  `'0x10'` or `' 1'` produced Rison that could not be decoded at all. Now
  `{'01': v}` is `('01':v)`.
- **Only own enumerable keys** are encoded. 2.1.1 used `for...in`, which also
  encoded inherited enumerable properties.
- **Boxed primitives** (`new String('ab')`, `new Number(5)`, `new Boolean(true)`)
  encode as the primitive, like `JSON.stringify`. 2.1.1 encoded them as objects
  (`(0:a,1:b)`, `()`).
- **`toJSON`** is called with the key as argument, like `JSON.stringify`.
- **Values that can't be encoded** at the top level (`undefined`, functions,
  symbols, bigints) throw a `TypeError` from `encode` and `encodeUri`. 2.1.1
  returned `undefined`. Inside objects and arrays they are still skipped.
- **Circular structures** throw a `TypeError`. 2.1.1 overflowed the stack.
- **`encodeObject` / `encodeArray`** throw a `TypeError` (was `Error`) when the
  argument doesn't encode to an object / array; this is checked after `toJSON`,
  so `encode_object(new Date())` now throws instead of returning `''`.
- The undocumented `__prototype__.encode_rison` hook is gone.

Decoding:

- **Errors are `RisonError`s** with `index` and `reason`, and the message ends
  with ` (at index N)`. Non-string input throws a `TypeError` (was `Error`).
- **Malformed input always throws a `RisonError`.** 2.1.1 threw
  `TypeError: Cannot read properties of null` on input such as `(a: b)`,
  `(a:b,)`, `)` or `(a:`, and a `RangeError` (stack overflow) on `(`.
- **Parsing stops at the first error.** 2.1.1 kept going after `missing ','`, so
  it could report a later error.
- **Ids are matched only at the current position.** 2.1.1 searched for the next
  id anywhere later in the string.
- **Malformed numbers are errors.** 2.1.1 returned `NaN` for `1e`, `--1` or
  `1-2`.
- **Number keys keep their text**: `(01:v)` decodes as `{'01': v}`, `(1.50:v)`
  as `{'1.50': v}`. 2.1.1 converted them through `Number` (`'1'`, `'1.5'`). This
  also makes old links written by 2.1.1 for such keys decode to the key that was
  meant.
- **Object keys must be ids, quoted strings or numbers.** 2.1.1 accepted any
  value as a key and stringified it (`(!t:1)` → `{true: 1}`,
  `(!(a,b):1)` → `{'a,b': 1}`).
- **`__proto__` is an ordinary own key.** 2.1.1 let `(__proto__:(...))` replace
  the prototype of the decoded object.
- **No console output.** 2.1.1 `console.log`ged every parse error.
- **`decodeUri`** reports malformed `%` escapes as a `RisonError` (was
  `URIError`).

Packaging:

- ES module and CommonJS builds with TypeScript declarations; no UMD wrapper,
  AMD support or `rison` browser global. Use a bundler or an ES module import
  in the browser.
- `rison.parser` (and its `WHITESPACE` and `setOptions`), and the internal
  tables `uri_ok`, `not_idchar`, `not_idstart`, `id_ok` and `next_id` are not
  exported.
- New: camelCase names, `safeDecode`, `RisonError`, types.

### Compared to rison-node 0.3.1

Everything above, and:

- **Canonical number keys are not quoted**: `{1: v}` encodes as `(1:v)`, where
  0.3.1 wrote `('1':v)`. This is the rison-node 2.0.0 change; both forms decode
  to the same value in every version.
- `decode_uri` and `unquote` exist (added in rison-node 2.1.0).
- The 0.3.1 build no longer applies (it assigned `window.rison` in browsers).

### Migrating

1. Replace the dependency and the import:
   `import rison from 'rison-node'` → `import rison from 'prysmex-rison-node'`
   (or `require`). All rison-node functions keep their names.
2. If you relied on `encode`/`encode_uri` returning `undefined` for `undefined`
   input, check the value first or catch the `TypeError`.
3. If you matched error messages exactly, match `error.reason` or use
   `instanceof RisonError` instead; messages now end with ` (at index N)`.
4. If you used `rison.parser` or the internal tables, they are gone.
5. Links you already published keep working. If you encoded objects with
   number-like keys that are not canonical numbers (`'01'`, `'1e3'`, ...), new
   links quote them, and old links now decode to the key you meant.

## Development

```sh
pnpm install
pnpm lint            # eslint + prettier
pnpm typecheck
pnpm test            # vitest, includes type tests and differential tests against rison-node 0.3.1 and 2.1.1
pnpm build           # tsup: dist/index.js (ESM), dist/index.cjs (CJS), .d.ts/.d.cts
pnpm check:package   # publint + are-the-types-wrong
pnpm test:package    # installs the packed tarball in a temp dir and loads it from CJS and ESM
```

The `python/` directory is the Python Rison parser (python-rison by Stijn
Debrouwere, MIT, see `python/LICENSE`) mirrored in the original Rison
repository. It is kept for reference and is not part of the npm package.

## License

Apache License 2.0, see [LICENSE.md](./LICENSE.md) (unchanged from rison-node)
and [NOTICE](./NOTICE).

---

_The rest of this README is the Rison documentation as found in rison-node's
README (a mirror of the original mjtemplate.org page). Changes: rison-node's
"Quick Start" is replaced by [Usage](#usage) above, the `rison.js` link points to
rison-node's repository, and the example table template at the end, which only
rendered on the original page, is left out._

# Rison - Compact Data in URIs

Rison mirror of now dead site (http://mjtemplate.org/examples/rison.html)

This page describes _Rison_, a data serialization format optimized for
compactness in URIs. Rison is a slight variation of JSON that looks vastly
superior after URI encoding. Rison still expresses exactly the same set of
data structures as JSON, so data can be translated back and forth without loss
or guesswork.

You can skip straight to some examples, or read on for more background.

Downloads:

- [rison.js](https://github.com/w33ble/rison-node/blob/v2.1.1/js/rison.js) includes a Javascript Rison encoder (based on [Douglas Crockford](http://json.org)'s [json.js](http://json.org/json.js)) and decoder (based on [Oliver Steele](http://osteele.com)'s [JSON for OpenLaszlo](http://osteele.com/sources/openlaszlo/json/)).
- [rison.py](http://freebase-python.googlecode.com/svn/trunk/freebase/rison.py) contains a decoder in Python.
- [Tim Fletcher](http://tfletcher.com/dev/) has implemented [Rison in Ruby](http://rison.rubyforge.org/) including both encoder and decoder.

### Why another data serialization format?

Rison is intended to meet the following goals, in roughly this order:

1. Comply with [URI specifications](http://gbiv.com/protocols/uri/rfc/rfc3986.html) and usage
2. Express **nested** data structures
3. Be **human-readable**
4. Be **compact**
   Rison is necessary because the obvious alternatives fail to meet these goals:

- URI-encoded XML and JSON are illegible and inefficient.
- [HTML Form encoding](http://www.w3.org/TR/html4/interact/forms.html#form-content-type) rules the web but can only represent a flat list of string pairs.
- Ian Bicking's [FormEncode](http://formencode.org/) package includes the [variabledecode](http://formencode.org/Validator.html#id16) parser, an interesting convention for form encoding that allows nested lists and dictionaries. However, it becomes inefficient with deeper nesting, and allows no terminal datatypes except strings.

Note that these goals are shaped almost entirely by the constraints of URIs,
though Rison has turned out to be useful in command-line tools as well. In the
_body_ of an HTTP request or response, length is less critical and URI
encoding can be avoided, so JSON would usually be preferred to Rison.

Given that a new syntax is needed, Rison tries to innovate as little as
possible:

- It uses the same data model as, and a very similar syntax to [JSON](http://json.org). The Rison grammar is only a slight alteration of the JSON grammar.
- It introduces very little additional quoting, since we assume that URI encoding will be applied on top of the Rison encoding.

### Differences from JSON syntax

- no whitespace is permitted except inside quoted strings.
- almost all character escaping is left to the uri encoder.
- single-quotes are used for quoting, but quotes can and should be left off strings when the strings are simple identifiers.
- the `e+` exponent format is forbidden, since `+` is not safe in form values and the plain `e` format is equivalent.
- the `E`, `E+`, and `E` exponent formats are removed.
- object keys should be lexically sorted when encoding. the intent is to improve url cacheability.
- uri-safe tokens are used in place of the standard json tokens:

rison token json token meaning

- `'` `"` string quote
- `!` `\` string escape
- `(...)` `{...}` object
- `!(...)` `[...]` array

- the JSON literals that look like identifiers (`true`, `false` and `null`) are represented as `!` sequences:

rison token json token

- `!t` true
- `!f` false
- `!n` null

The `!` character plays two similar but different roles, as an escape
character within strings, and as a marker for special values. This may be
confusing.

Notice that services can distinguish Rison-encoded strings from JSON-encoded
strings by checking the first character. Rison structures start with `(` or
`!(`. JSON structures start with `[` or `{`. This means that a service which
expects a JSON encoded object or array can accept Rison-encoded objects
without loss of compatibility.

### Interaction with URI %-encoding

Rison syntax is designed to produce strings that be legible after being [form-
encoded](http://www.w3.org/TR/html4/interact/forms.html#form-content-type) for
the [query](http://gbiv.com/protocols/uri/rfc/rfc3986.html#query) section of a
URI. None of the characters in the Rison syntax need to be URI encoded in that
context, though the data itself may require URI encoding. Rison tries to be
orthogonal to the %-encoding process - it just defines a string format that
should survive %-encoding with very little bloat. Rison quoting is only
applied when necessary to quote characters that might otherwise be interpreted
as special syntax.

Note that most URI encoding libraries are very conservative, percent-encoding
many characters that are legal according to [RFC
3986](http://gbiv.com/protocols/uri/rfc/rfc3986.html). For example,
Javascript's builtin `encodeURIComponent()` function will still make Rison
strings difficult to read. The rison.js library includes a more tolerant URI
encoder.

Rison uses its own quoting for strings, using the single quote (`**'**`) as a
string delimiter and the exclamation point (`**!**`) as the string escape
character. Both of these characters are legal in uris. Rison quoting is
largely inspired by Unix shell command line parsing.

All Unicode characters other than `**'**` and `**!**` are legal inside quoted
strings. This includes newlines and control characters. Quoting all such
characters is left to the %-encoding process.

### Interaction with IRIs

This still needs to be addressed. Advice from an IRI expert would be very
welcome.

Particular attention should be paid to Unicode characters that may be
interpreted as Rison syntax characters.

The _idchars_ set is hard to define well. The goal is to include foreign
language alphanumeric characters and some punctuation that is common in
identifiers ("`_`", "`-`", "`.`", "`/`", and others). However, whitespace and
most punctuation characters should require quoting.

### Emailing URIs

Most text emailers are conservative about what they turn into a hyperlink, and
they will assume that characters like '(' mean the end of the URI. This
results in broken, truncated links.

This is actually a problem with URI encoding rather than with Rison, but it
comes up a lot in practice. You could use Rison with a more aggressive URI
encoder to generate emailable URIs. You can also wrap your emailed URIs in
angle brackets: `<http://...>` which some mail readers have better luck with.

### Further Rationale

**Passing data in URIs** is necessary in many situations. Many web services rely on the HTTP GET method, which can take advantage of an extensive deployed caching infrastructure. Browsers also have different capabilities for GET, including the crucial ability to make cross-site requests. It is also very convenient to store the state of a small browser application in the URI.

**Human readability** makes everything go faster. Primarily this means avoiding URI encoding whenever possible. This requires careful choice of characters for the syntax, and a tolerant URI encoder that only encodes characters when absolutely necessary.

**Compactness** is important because of implementation limits on URI length. Internet Explorer is once again the weakest link at 2K. One could certainly invent a more compact representation by dropping the human-readable constraint and using a compression algorithm.

### Variations

There are several variations on Rison which are useful or at least thought-
provoking.

#### O-Rison

When you know the parameter being encoded will always be an object, always
wrapping it in a containing `()` is unnecessary and hard to explain. Until
you've dealt with nested structures, the need for parentheses is hard to
explain. In this case you may wish to declare that the argument is encoded in
_O-Rison_, which can be translated to Rison by wrapping it in parentheses.

Here's a URI with a single query argument which is a nested structure:
`http://example.com/service?query=(q:'*',start:10,count:10)`

This is more legible if you specify that the argument is O-Rison instead of
Rison, and leave the containing `()` as implied:
`http://example.com/service?query=q:'*',start:10,count:10`

This seems to be useful in enough situations that it is worth defining the
term _O-Rison_.

#### A-Rison

Similarly, sometimes you know the value will always be an array. Instead of
specifying a Rison argument: `.../?items=!(item1,item2,item3)` you can specify
the far more legible A-Rison argument: `.../?items=item1,item2,item3`

#### Accepting other delimiters

Notice that O-Rison looks almost like a drop-in replacement for [ URL form
encoding](http://www.w3.org/TR/html4/interact/forms.html#form-content-type),
with two substitutions:

- "`:`" for "`=`"
- "`,`" for "`&`"

We could expand the Rison parser to treat all of "`,`", "`&`", and "`;`" as
valid item separators and both "`:`" and "`=`" as key-value separators. In
this case the vast majority of URI queries would form a flat subset of
O-Rison. The exceptions are services that depend on ordering of query
parameters or allow duplicate parameter names.

This extension doesn't change the parsing of standard Rison strings because
"`&`", "`=`", and "`;`" are already illegal in Rison identifiers.

### Examples

These examples compare Rison and JSON representations of identical values. The
table is generated in the browser using [mjt](http://mjtemplate.org/).

The compression ratio column shows `(1&nbsp_place_holder;-&nbsp_place_holder;e
ncoded_rison_size)&nbsp_place_holder;/&nbsp_place_holder;encoded_json_size.`

On a log of Freebase mqlread service URIs, the queries were from 35% to 45%
smaller when encoded with Rison.

URI encoding is done with a custom URI encoder which is less aggressive than
Javascript's built-in `encodeURIComponent()`.
