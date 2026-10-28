// Types for the published rison-node versions used by the differential tests.
// They are installed through npm aliases (see package.json devDependencies).

interface LegacyRison {
  encode(value: unknown): string | undefined;
  decode(input: string): unknown;
  encode_object(value: unknown): string;
  decode_object(input: string): unknown;
  encode_array(value: unknown): string;
  decode_array(input: string): unknown;
  encode_uri(value: unknown): string | undefined;
  decode_uri?: (input: string) => unknown;
  quote(value: string): string;
  unquote?: (value: string) => string;
}

declare module 'rison-node-2' {
  const rison: LegacyRison;
  export = rison;
}

declare module 'rison-node-0.3' {
  const rison: LegacyRison;
  export = rison;
}
