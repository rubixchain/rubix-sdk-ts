import { secp256k1 } from "@noble/curves/secp256k1.js";
import { bytesToHex, hexToBytes } from "@noble/curves/utils.js";
import { HDKey } from "@scure/bip32";

/**
 * Signs a message using secp256k1 private key.
 *
 * The message is used as-is (it is not hashed), and if it is longer than 32 bytes
 * only its leftmost 256 bits are considered, matching the Python SDK (ECPy).
 *
 * @param privateKey - Secp256k1 private key.
 * @param message - The message to sign.
 * @returns The DER encoded signature.
 */
export function secp256k1Sign(privateKey: Uint8Array, message: Uint8Array): Uint8Array {
  const sig = secp256k1.sign(message, privateKey, { prehash: false, format: "der" });
  if (sig == null) {
    throw new Error("Failed to sign the message.");
  }

  return sig;
}

/**
 * Verifies secp256k1 signature.
 *
 * @param publicKey - Compressed (33 bytes) or uncompressed (65 bytes) public key.
 * @param message - The original message that was signed.
 * @param signature - The DER encoded signature to verify.
 * @returns True if signature is valid, False otherwise.
 */
export function secp256k1Verify(publicKey: Uint8Array, message: Uint8Array, signature: Uint8Array): boolean {
  // check if the public key is in compressed format
  let uncompressedPublicKey: Uint8Array;

  if (publicKey.length === 33) {
    uncompressedPublicKey = secp256k1.Point.fromBytes(publicKey).toBytes(false);
  } else if (publicKey.length === 65) {
    // Validates that the point lies on the curve
    secp256k1.Point.fromBytes(publicKey);
    uncompressedPublicKey = publicKey;
  } else {
    throw new Error(`Invalid public key of length ${publicKey.length}.`);
  }

  // Signatures produced by the Python SDK are not normalised to low-S, so high-S must be accepted
  return secp256k1.verify(signature, message, uncompressedPublicKey, {
    prehash: false,
    format: "der",
    lowS: false,
  });
}

export class Secp256k1Keypair {
  readonly #privateKey: string;
  readonly #publicKey: string;

  /**
   * @param privateKey - Private key in hexadecimal format.
   * @param publicKey - Uncompressed public key in hexadecimal format.
   */
  constructor(privateKey: string, publicKey: string) {
    this.#privateKey = privateKey;
    this.#publicKey = publicKey;
  }

  /**
   * Generates a Secp256k1Keypair from a mnemonic seed.
   *
   * The key is the BIP32 child at index 0 of the master key (path `m/0`).
   *
   * @param mnemonicSeed - The mnemonic seed used to derive the keypair.
   * @returns The generated Secp256k1 keypair.
   */
  static fromMnemonicSeed(mnemonicSeed: Uint8Array): Secp256k1Keypair {
    const bip32RootKey = HDKey.fromMasterSeed(mnemonicSeed);
    const bip32ChildKey = bip32RootKey.deriveChild(0);

    const privateKey = bip32ChildKey.privateKey;
    if (!privateKey) {
      throw new Error("Failed to derive child key from mnemonic seed.");
    }

    return Secp256k1Keypair.fromPrivateKey(privateKey);
  }

  /**
   * Generates a Secp256k1Keypair from a private key.
   *
   * @param privateKey - The private key used to derive the keypair.
   * @returns The generated Secp256k1 keypair.
   */
  static fromPrivateKey(privateKey: Uint8Array): Secp256k1Keypair {
    const privateKeyHex = bytesToHex(privateKey);

    const publicKey = secp256k1.getPublicKey(privateKey, false);
    if (!publicKey) {
      throw new Error("Failed to derive public key from private key.");
    }

    const publicKeyHex = bytesToHex(publicKey);

    return new Secp256k1Keypair(privateKeyHex, publicKeyHex);
  }

  /** Returns the public key in hexadecimal format. */
  get publicKey(): string {
    return this.#publicKey;
  }

  /** Returns the private key in hexadecimal format. */
  get privateKey(): string {
    return this.#privateKey;
  }

  /**
   * Signs a message using secp256k1 private key.
   *
   * @param message - The message to sign.
   * @returns The DER encoded signature.
   */
  sign(message: Uint8Array): Uint8Array {
    return secp256k1Sign(hexToBytes(this.#privateKey), message);
  }
}
