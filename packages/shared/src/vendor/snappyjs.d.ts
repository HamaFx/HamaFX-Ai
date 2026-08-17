/**
 * Minimal type declaration for `snappyjs` (pure-JS Snappy codec, no deps).
 * The package ships no types; only the two functions used by the metrics
 * exporter are declared here.
 */
declare module 'snappyjs' {
  export function compress(input: Uint8Array | Buffer): Buffer;
  export function uncompress(input: Uint8Array | Buffer): Buffer;
}