/*
 * Part of prysmex-rison-node, a modified fork of rison-node
 * (https://github.com/w33ble/rison-node), licensed under the Apache License,
 * Version 2.0 (see LICENSE.md, AUTHORS.md and NOTICE).
 *
 * MODIFIED by Prysmex (2026): new file added in the TypeScript rewrite.
 */

/** Any value that rison can represent: exactly the JSON data model. */
export type RisonValue =
  string | number | boolean | null | RisonValue[] | { [key: string]: RisonValue };

/** A rison array, `!(a,b,c)`. */
export type RisonArray = RisonValue[];

/** A rison object, `(key:value,...)`. */
export type RisonObject = Record<string, RisonValue>;
