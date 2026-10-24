import { bytesToHex } from "@noble/curves/utils.js";
import { describe, expect, test } from "vitest";
import { generateBip39Mnemonic, getSeedFromMnemonic } from "../../src/crypto/bip39.js";

describe("bip39", () => {
  test("generates a 24-word BIP39 mnemonic phrase", () => {
    const mnemonic = generateBip39Mnemonic();
    expect(typeof mnemonic).toBe("string");
    expect(mnemonic.split(" ")).toHaveLength(24);
  });

  test("derives the seed from a BIP39 mnemonic phrase", () => {
    const mnemonic =
      "buffalo tumble defy laundry call almost little pig lift party property pool frame erosion mind library sample floor ring enemy word enemy foster ill";
    const expectedSeedHex =
      "1884e5ddc2a5fb783f60803868cffaef1af1ce36e6686357c9c5dd6c80b63d698d78a8db3cab0404ecd3d966a00b9d51e4ac783997f78f64a1b24152e09ec524";

    const seed = getSeedFromMnemonic(mnemonic);
    expect(seed).toBeInstanceOf(Uint8Array);
    expect(seed).toHaveLength(64);

    expect(bytesToHex(seed)).toBe(expectedSeedHex);
  });

  test("rejects empty, invalid and non-24-word mnemonics", () => {
    expect(() => getSeedFromMnemonic("")).toThrow("Mnemonic phrase cannot be empty.");
    expect(() => getSeedFromMnemonic("   ")).toThrow("Mnemonic phrase cannot be empty.");
    expect(() => getSeedFromMnemonic("not a valid mnemonic")).toThrow("Invalid mnemonic phrase: not a valid mnemonic");

    const twelveWords = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
    expect(() => getSeedFromMnemonic(twelveWords)).toThrow("Mnemonic phrase must be 24 words long, got 12.");
  });
});
