/* abi.ts — the encoder. No ethers, no viem in the page: this is keccak-256, the head/tail calldata
   layout for the handful of signatures the dashboard sends, and the custom-error decoder.
   test/encode.test.mjs diffs every action against `cast calldata`. */

import { ERRORS, SEL, type SelectorName } from "./config";

export type AbiType = "address" | "uint256" | "uint64" | "uint8" | "bytes32" | "bytes";
export type AbiValue = string | number | bigint;

const H = (n: bigint) => n.toString(16);
const word = (hexNo0x: string) => hexNo0x.padStart(64, "0");

export function encUint(v: AbiValue): string {
  const b = BigInt(v);
  if (b < 0n) throw new Error("negative value");
  return word(H(b));
}

export function encAddress(a: string): string {
  const s = String(a).trim();
  if (!/^0x[0-9a-fA-F]{40}$/.test(s)) throw new Error("not an address: " + s);
  return word(s.slice(2).toLowerCase());
}

function stringToBytes(s: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 128) out.push(c);
    else if (c < 2048) out.push(192 | (c >> 6), 128 | (c & 63));
    else out.push(224 | (c >> 12), 128 | ((c >> 6) & 63), 128 | (c & 63));
  }
  return out;
}
const bytesToHex = (bytes: number[]) => bytes.map((b) => ("0" + (b & 255).toString(16)).slice(-2)).join("");

const M = (1n << 64n) - 1n;
const RC = [1n, 32898n, 9223372036854808714n, 9223372039002292224n, 32907n, 2147483649n, 9223372039002292353n,
  9223372036854808585n, 138n, 136n, 2147516425n, 2147483658n, 2147516555n, 9223372036854775947n,
  9223372036854808713n, 9223372036854808579n, 9223372036854808578n, 9223372036854775936n, 32778n, 9223372039002259466n,
  9223372039002292353n, 9223372036854808704n, 2147483649n, 9223372039002292232n];
const R = [[0, 36, 3, 41, 18], [1, 44, 10, 45, 2], [62, 6, 43, 15, 61], [28, 55, 25, 21, 56], [27, 20, 39, 8, 14]];

const rol = (x: bigint, n: number) => (((x << BigInt(n)) | (x >> BigInt(64 - n))) & M);

function keccakF(st: bigint[][]): bigint[][] {
  const b: bigint[][] = Array.from({ length: 5 }, () => [0n, 0n, 0n, 0n, 0n]);
  const c: bigint[] = [0n, 0n, 0n, 0n, 0n];
  const d: bigint[] = [0n, 0n, 0n, 0n, 0n];
  for (let round = 0; round < 24; round++) {
    for (let i = 0; i < 5; i++) c[i] = st[i][0] ^ st[i][1] ^ st[i][2] ^ st[i][3] ^ st[i][4];
    for (let i = 0; i < 5; i++) d[i] = c[(i + 4) % 5] ^ rol(c[(i + 1) % 5], 1);
    for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) st[i][j] ^= d[i];
    for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) b[j][(2 * i + 3 * j) % 5] = rol(st[i][j], R[i][j]);
    for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) st[i][j] = b[i][j] ^ ((~b[(i + 1) % 5][j]) & b[(i + 2) % 5][j]);
    st[0][0] ^= RC[round];
  }
  return st;
}

/** keccak-256, enough for hashing ids and nothing else. */
export function keccak256(bytes: number[]): string {
  const rate = 136;
  const st: bigint[][] = Array.from({ length: 5 }, () => [0n, 0n, 0n, 0n, 0n]);
  const input = bytes.slice();
  input.push(1);
  while (input.length % rate !== 0) input.push(0);
  input[input.length - 1] |= 0x80;
  for (let off = 0; off < input.length; off += rate) {
    for (let i = 0; i < rate / 8; i++) {
      let lane = 0n;
      for (let j = 7; j >= 0; j--) lane = (lane << 8n) | BigInt(input[off + i * 8 + j]);
      st[i % 5][Math.floor(i / 5)] ^= lane;
    }
    keccakF(st);
  }
  const out: number[] = [];
  for (let i = 0; i < 4; i++) {
    const w = st[i % 5][Math.floor(i / 5)];
    for (let j = 0; j < 8; j++) out.push(Number((w >> BigInt(8 * j)) & 255n));
  }
  return "0x" + bytesToHex(out);
}

export function encBytes32(v: string): string {
  const s = String(v).trim();
  if (/^0x[0-9a-fA-F]{64}$/.test(s)) return word(s.slice(2).toLowerCase());
  if (/^[0-9a-fA-F]{64}$/.test(s)) return word(s.toLowerCase());
  // anything else is hashed, so a readable label can be passed where an id is expected
  return keccak256(stringToBytes(s)).slice(2);
}

/** calldata: selector + head words (+ a tail for dynamic bytes). */
export function encode(sig: SelectorName, types: AbiType[], values: AbiValue[]): string {
  let head = "";
  let tail = "";
  let tailBytes = 0;
  for (let i = 0; i < types.length; i++) {
    const t = types[i];
    const v = values[i];
    if (t === "bytes") {
      let hex = typeof v === "string" && /^0x[0-9a-fA-F]*$/.test(v)
        ? v.replace(/^0x/, "")
        : bytesToHex(stringToBytes(String(v)));
      if (hex.length % 2) hex += "0";
      const len = hex.length / 2;
      let padded = hex;
      while (padded.length % 64) padded += "0";
      // offset is measured in bytes from the start of the arguments
      head += word(H(BigInt(32 * (types.length + tailBytes / 32))));
      const chunk = word(H(BigInt(len))) + padded;
      tailBytes += chunk.length / 2;
      tail += chunk;
    } else if (t === "address") head += encAddress(String(v));
    else if (t === "bytes32") head += encBytes32(String(v));
    else head += encUint(v);
  }
  return SEL[sig] + head + tail;
}

/** Turn revert data into `Name(arg, arg)` using the selector table. */
export function decodeError(data: string | null | undefined): string | null {
  if (!data || data.length < 10) return null;
  const sel = data.slice(0, 10).toLowerCase();
  const name = ERRORS[sel];
  if (!name) return null;
  const types = name.slice(name.indexOf("(") + 1, -1).split(",").filter(Boolean);
  const args: string[] = [];
  for (let i = 0; i < types.length; i++) {
    const w = data.slice(10 + i * 64, 10 + (i + 1) * 64);
    if (!w || !/^[0-9a-fA-F]{64}$/.test(w)) break;
    args.push(types[i] === "address" ? "0x" + w.slice(24).toLowerCase() : BigInt("0x" + w).toString());
  }
  return name.slice(0, name.indexOf("(")) + "(" + args.join(", ") + ")";
}
