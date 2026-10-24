import { createCipheriv, createDecipheriv, pbkdf2, randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { bytesToHex, hexToBytes } from "@noble/curves/utils.js";

const pbkdf2Async = promisify(pbkdf2);

const PUBLIC_KEY_FILE = "pubKey.pem";
const PRIVATE_KEY_FILE = "privKey.pem";

const SALT_LENGTH = 16; // bytes salt for PBKDF2
const NONCE_LENGTH = 12; // bytes nonce for AES-GCM
const TAG_LENGTH = 16; // bytes GCM authentication tag

/** Base64 encodes the bytes and wraps the output at 64 characters per line. */
function wrapBase64(data: Uint8Array): string {
  const b64 = Buffer.from(data).toString("base64");
  return (b64.match(/.{1,64}/g) ?? []).join("\n");
}

/**
 * Decodes base64 the way Python's `base64.b64decode` does by default:
 * characters outside the base64 alphabet are discarded, and incorrect padding is an error.
 */
function decodeBase64(b64: string): Uint8Array {
  const cleaned = b64.replace(/[^A-Za-z0-9+/=]/g, "");
  if (cleaned.length % 4 !== 0 || /=[^=]/.test(cleaned)) {
    throw new Error("Incorrect padding");
  }
  return new Uint8Array(Buffer.from(cleaned, "base64"));
}

/** Returns the text between the `start` and `end` markers with all whitespace removed. */
function pemBody(pem: string, start: string, end: string): string {
  const body = pem.split(start)[1]!.split(end)[0]!.trim();
  return body.split(/\s+/).join(""); // remove whitespace
}

/**
 * Writes the secp256k1 public key to a `pubKey.pem` file in the given directory.
 *
 * @param filePath - The directory in which the PEM file is written.
 * @param publicKeyBytes - The secp256k1 public key to write.
 */
export async function secp256k1PubkeyHexToPem(filePath: string, publicKeyBytes: Uint8Array): Promise<void> {
  if (filePath === "") {
    throw new Error("File path must not be empty");
  }
  if (publicKeyBytes == null) {
    throw new Error("Public key must not be None");
  }

  const pemText = "-----BEGIN PUBLIC KEY-----\n" + `${wrapBase64(publicKeyBytes)}\n` + "-----END PUBLIC KEY-----\n";

  const completeKeyPath = join(filePath, PUBLIC_KEY_FILE);
  try {
    await writeFile(completeKeyPath, pemText, { encoding: "utf-8" });
  } catch (e) {
    throw new Error(`Failed to write public key to a PEM file: ${e}`, { cause: e });
  }
}

/**
 * Extract the secp256k1 public key hex from the PEM file.
 *
 * @param filename - The path to the PEM file.
 * @returns The uncompressed secp256k1 public key in hexadecimal format.
 */
export async function secp256k1PubkeyPemToHex(filename: string): Promise<string> {
  const pem = (await readFile(filename, { encoding: "utf-8" })).trim();

  const start = "-----BEGIN PUBLIC KEY-----";
  const end = "-----END PUBLIC KEY-----";

  if (!pem.includes(start) || !pem.includes(end)) {
    throw new Error("Not a valid PUBLIC KEY PEM.");
  }

  const body = pemBody(pem, start, end);

  let pubBytes: Uint8Array;
  try {
    pubBytes = decodeBase64(body);
  } catch {
    throw new Error("Invalid base64 inside PEM.");
  }

  if (pubBytes.length !== 65) {
    throw new Error(`Decoded key is not a uncompressed secp256k1 key. Length: ${pubBytes.length}`);
  }

  return bytesToHex(pubBytes);
}

/**
 * Derive a 32-byte key from passphrase + salt using PBKDF2-HMAC-SHA256.
 */
async function deriveKey(passphrase: string | Uint8Array, salt: Uint8Array, iterations: number = 200_000): Promise<Buffer> {
  if (typeof passphrase !== "string" && !(passphrase instanceof Uint8Array)) {
    throw new TypeError("passphrase must be bytes or str");
  }
  const passphraseBytes = typeof passphrase === "string" ? Buffer.from(passphrase, "utf-8") : passphrase;
  return pbkdf2Async(passphraseBytes, salt, iterations, 32, "sha256");
}

/**
 * Encrypt the 32-byte private key and write it inside a ENCRYPTED PRIVATE KEY PEM-like block.
 *
 * The block holds `salt (16) || nonce (12) || ciphertext || GCM tag (16)`, encrypted with
 * AES-256-GCM under a PBKDF2-HMAC-SHA256 (200,000 iterations) key.
 *
 * @param privKeyDir - Directory path to write `privKey.pem` in.
 * @param privHexBytes - Private Key in bytes.
 * @param passphrase - Passphrase to encrypt with (default "mypassword").
 */
export async function secp256k1PrivkeyHexToPem(
  privKeyDir: string,
  privHexBytes: Uint8Array,
  passphrase: string = "mypassword",
): Promise<void> {
  if (!(privHexBytes instanceof Uint8Array)) {
    throw new TypeError("priv_hex must be bytes or str");
  }

  const privHex = bytesToHex(privHexBytes).trim().toLowerCase();
  if (privHex.length !== 64) {
    throw new Error("Private key hex must be exactly 64 hex characters (32 bytes).");
  }

  let privBytes: Uint8Array;
  try {
    privBytes = hexToBytes(privHex);
  } catch (e) {
    throw new Error("Invalid private key hex.", { cause: e });
  }

  if (privBytes.length !== 32) {
    throw new Error("Private key must be 32 bytes.");
  }

  // Generate salt and nonce
  const salt = randomBytes(SALT_LENGTH);
  const nonce = randomBytes(NONCE_LENGTH);

  // Derive 32-byte key
  const key = await deriveKey(passphrase, salt);

  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  const ciphertext = Buffer.concat([cipher.update(privBytes), cipher.final(), cipher.getAuthTag()]);
  // Store: salt || nonce || ciphertext
  const stored = Buffer.concat([salt, nonce, ciphertext]);

  const pemText =
    "-----BEGIN ENCRYPTED PRIVATE KEY-----\n" + `${wrapBase64(stored)}\n` + "-----END ENCRYPTED PRIVATE KEY-----\n";

  const completePrivKeyDir = join(privKeyDir, PRIVATE_KEY_FILE);
  await writeFile(completePrivKeyDir, pemText, { encoding: "utf-8" });
}

/**
 * Read the PEM written by {@link secp256k1PrivkeyHexToPem}, decrypt it with the passphrase,
 * and return the private key hex.
 *
 * @param filename - The path to the PEM file.
 * @param passphrase - The passphrase used for decryption (default "mypassword").
 * @returns The decrypted private key in hexadecimal format.
 */
export async function secp256k1PrivkeyPemToHex(filename: string, passphrase: string = "mypassword"): Promise<string> {
  const pem = await readFile(filename, { encoding: "utf-8" });
  const start = "-----BEGIN ENCRYPTED PRIVATE KEY-----";
  const end = "-----END ENCRYPTED PRIVATE KEY-----";

  if (!pem.includes(start) || !pem.includes(end)) {
    throw new Error("PEM does not contain expected ENCRYPTED PRIVATE KEY headers.");
  }

  const b64 = pemBody(pem, start, end);

  let stored: Uint8Array;
  try {
    stored = decodeBase64(b64);
  } catch (e) {
    throw new Error("PEM body is not valid base64.", { cause: e });
  }

  // Extract salt(16), nonce(12), ciphertext(rest)
  if (stored.length < SALT_LENGTH + NONCE_LENGTH + TAG_LENGTH) {
    // must be at least salt+nonce+tag (tag is 16 bytes for GCM) even if empty ciphertext
    throw new Error("Stored data is too short to be valid.");
  }

  const salt = stored.subarray(0, SALT_LENGTH);
  const nonce = stored.subarray(SALT_LENGTH, SALT_LENGTH + NONCE_LENGTH);
  const ciphertext = stored.subarray(SALT_LENGTH + NONCE_LENGTH, stored.length - TAG_LENGTH);
  const tag = stored.subarray(stored.length - TAG_LENGTH);

  const key = await deriveKey(passphrase, salt);
  let privBytes: Buffer;
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, nonce);
    decipher.setAuthTag(tag);
    privBytes = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch (e) {
    throw new Error("Failed to decrypt private key (wrong passphrase or corrupted data).", { cause: e });
  }

  if (privBytes.length !== 32) {
    throw new Error("Decrypted data is not a 32-byte private key.");
  }

  return bytesToHex(privBytes);
}
