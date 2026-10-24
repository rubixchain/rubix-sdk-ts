import { hexToBytes } from "@noble/curves/utils.js";
import { describe, expect, test } from "vitest";
import { Secp256k1Keypair, secp256k1Verify } from "../../src/crypto/secp256k1.js";

const encoder = new TextEncoder();

describe("secp256k1", () => {
  test("generates a keypair from a private key", () => {
    const privateKeyHex = "1e99423a4edf5c3d2e8f6b8c3f4e5d6c7b8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c";
    const privateKeyBytes = hexToBytes(privateKeyHex);

    const keypair = Secp256k1Keypair.fromPrivateKey(privateKeyBytes);

    expect(keypair).toBeInstanceOf(Secp256k1Keypair);
    expect(typeof keypair.publicKey).toBe("string");
    expect(keypair.publicKey, "expected uncompressed public key length of 130 hex characters").toHaveLength(130);
  });

  test("generates a keypair from a mnemonic seed", () => {
    const mnemonicSeedHex =
      "1884e5ddc2a5fb783f60803868cffaef1af1ce36e6686357c9c5dd6c80b63d698d78a8db3cab0404ecd3d966a00b9d51e4ac783997f78f64a1b24152e09ec524";
    const mnemonicSeedBytes = hexToBytes(mnemonicSeedHex);

    const keypair = Secp256k1Keypair.fromMnemonicSeed(mnemonicSeedBytes);

    expect(keypair).toBeInstanceOf(Secp256k1Keypair);
    expect(typeof keypair.publicKey).toBe("string");
    expect(keypair.publicKey, "expected uncompressed public key length of 130 hex characters").toHaveLength(130);
  });

  test("verifies a signature over the same message", () => {
    const privateKeyBytes = hexToBytes("1e99423a4edf5c3d2e8f6b8c3f4e5d6c7b8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c");
    const message = encoder.encode("Test message for signing");

    const keypair = Secp256k1Keypair.fromPrivateKey(privateKeyBytes);
    const signature = keypair.sign(message);
    expect(signature).toBeInstanceOf(Uint8Array);

    // Verify the signature
    expect(secp256k1Verify(hexToBytes(keypair.publicKey), message, signature)).toBe(true);
  });

  test("rejects a signature over a different message", () => {
    const privateKeyBytes = hexToBytes("1e99423a4edf5c3d2e8f6b8c3f4e5d6c7b8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c");
    const message1 = encoder.encode("Test message for signing");
    const message2 = encoder.encode("Test message for signing ");

    const keypair = Secp256k1Keypair.fromPrivateKey(privateKeyBytes);
    const signature = keypair.sign(message1);
    expect(signature).toBeInstanceOf(Uint8Array);

    expect(secp256k1Verify(hexToBytes(keypair.publicKey), message2, signature)).toBe(false);
  });

  test("accepts compressed public keys and rejects other lengths", () => {
    const keypair = Secp256k1Keypair.fromPrivateKey(
      hexToBytes("1e99423a4edf5c3d2e8f6b8c3f4e5d6c7b8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c"),
    );
    const message = encoder.encode("Test message for signing");
    const signature = keypair.sign(message);

    const uncompressed = hexToBytes(keypair.publicKey);
    const compressed = new Uint8Array([uncompressed[64]! % 2 === 0 ? 0x02 : 0x03, ...uncompressed.slice(1, 33)]);
    expect(secp256k1Verify(compressed, message, signature)).toBe(true);

    expect(() => secp256k1Verify(uncompressed.slice(0, 64), message, signature)).toThrow(
      "Invalid public key of length 64.",
    );
  });
});
