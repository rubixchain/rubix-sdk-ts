import { existsSync } from "node:fs";
import { mkdir, readdir } from "node:fs/promises";
import { join } from "node:path";
import { hexToBytes } from "@noble/curves/utils.js";
import {
  secp256k1PrivkeyHexToPem,
  secp256k1PrivkeyPemToHex,
  secp256k1PubkeyHexToPem,
  secp256k1PubkeyPemToHex,
} from "./pem.js";
import { Secp256k1Keypair } from "./secp256k1.js";

/**
 * Abstraction for accounts on Rubix
 */
export interface RubixAccount {
  did: string;
  keypair: Secp256k1Keypair;
}

/** Lists the names of the sub-directories of `dir`. */
async function listSubdirectories(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
}

// TODO: Use RubixAccount type param
/**
 * Saves the Rubix Account keys under `<accountDir>/<alias>/<did>/`.
 *
 * @param accountDir - The accounts directory.
 * @param publicKey - The public key to save.
 * @param privateKey - The private key to save.
 * @param did - The DID associated with the keys.
 * @param alias - The alias of the account.
 * @param passphrase - Passphrase for encrypting the private key. Defaults to "mypassword".
 */
export async function saveAccountToFile(
  accountDir: string,
  publicKey: Uint8Array,
  privateKey: Uint8Array,
  did: string,
  alias: string,
  passphrase: string = "mypassword",
): Promise<void> {
  const aliasDir = join(accountDir, alias);

  if (!existsSync(aliasDir)) {
    await mkdir(aliasDir, { recursive: true });
  } else {
    if (!existsSync(aliasDir)) {
      throw new Error(`alias directory does not exist: ${aliasDir}`);
    }

    const aliasSubdir = await listSubdirectories(aliasDir);

    if (aliasSubdir.length === 1) {
      throw new Error("cannot create a key directory since one key directory already exists");
    }

    if (aliasSubdir.length > 1) {
      throw new Error(
        "unexpected error: there seems to be multiple DID directories under alias_dir," +
          "hence unable to proceed with key creation or import",
      );
    }
  }

  const keyDir = join(aliasDir, did);
  if (!existsSync(keyDir)) {
    await mkdir(keyDir, { recursive: true });
  }

  await saveKeyToFile(keyDir, publicKey, privateKey, passphrase);
}

/**
 * Saves the keypair as `pubKey.pem` and `privKey.pem` in the key directory.
 *
 * @param keyDir - The directory in which the PEM files are written.
 * @param publicKey - The public key to save.
 * @param privateKey - The private key to save.
 * @param passphrase - Passphrase for encrypting the private key. Defaults to "mypassword".
 */
export async function saveKeyToFile(
  keyDir: string,
  publicKey: Uint8Array,
  privateKey: Uint8Array,
  passphrase: string = "mypassword",
): Promise<void> {
  if (publicKey == null || publicKey.length === 0) {
    throw new Error("Public key must not be empty");
  }
  if (privateKey == null || privateKey.length === 0) {
    throw new Error("Private key must not be empty");
  }
  if (keyDir === "") {
    throw new Error("Config path must not be empty");
  }

  await secp256k1PubkeyHexToPem(keyDir, publicKey);
  await secp256k1PrivkeyHexToPem(keyDir, privateKey, passphrase);
}

/**
 * Loads the Rubix Account stored under `<accountDir>/<alias>/`.
 *
 * @param accountDir - The accounts directory.
 * @param alias - The alias of the account.
 * @param passphrase - Passphrase for decrypting the private key. Defaults to "mypassword".
 * @returns The DID and keypair of the account.
 */
export async function loadAccountFromFile(
  accountDir: string,
  alias: string,
  passphrase: string = "mypassword",
): Promise<RubixAccount> {
  const aliasDir = join(accountDir, alias);
  if (!existsSync(aliasDir)) {
    throw new Error(`alias directory does not exist: ${aliasDir}`);
  }

  const aliasSubdir = await listSubdirectories(aliasDir);

  if (aliasSubdir.length !== 1) {
    throw new Error(`Expected one subdirectory in ${aliasDir}, found ${aliasSubdir.length}.`);
  }

  const did = aliasSubdir[0]!;

  const keyDirPath = join(aliasDir, did);
  const keypair = await loadKeyFromFile(keyDirPath, passphrase);

  return {
    did,
    keypair,
  };
}

/**
 * Loads the Secp256k1 keypair from the PEM files in the key directory.
 *
 * @param keyDir - The path to the Keypair files.
 * @param passphrase - Passphrase for decrypting the private key. Defaults to "mypassword".
 * @returns The loaded keypair.
 */
export async function loadKeyFromFile(keyDir: string, passphrase: string = "mypassword"): Promise<Secp256k1Keypair> {
  if (keyDir === "") {
    throw new Error("Config path must not be empty");
  }

  if (!existsSync(keyDir)) {
    throw new Error(`Key directory does not exist: ${keyDir}`);
  }

  const pubKeyPath = join(keyDir, "pubKey.pem");
  const privKeyPath = join(keyDir, "privKey.pem");

  const pubHex = await secp256k1PubkeyPemToHex(pubKeyPath);
  const privHex = await secp256k1PrivkeyPemToHex(privKeyPath, passphrase);

  return new Secp256k1Keypair(privHex, pubHex);
}

/**
 * Loads the public key from its PEM file.
 *
 * @param keyDir - The path to the Keypair files.
 * @returns The loaded public key.
 */
export async function loadPubKeyFromFile(keyDir: string): Promise<Uint8Array> {
  if (keyDir === "") {
    throw new Error("Config path must not be empty");
  }

  if (!existsSync(keyDir)) {
    throw new Error(`Key directory does not exist: ${keyDir}`);
  }

  const pubKeyPath = join(keyDir, "pubKey.pem");

  const pubHex = await secp256k1PubkeyPemToHex(pubKeyPath);

  return hexToBytes(pubHex);
}

/**
 * Saves the public key as `pubKey.pem` in the key directory, creating it if needed.
 *
 * @param keyDir - The directory in which the PEM file is written.
 * @param publicKey - The public key to save.
 */
export async function savePubKeyToFile(keyDir: string, publicKey: Uint8Array): Promise<void> {
  await mkdir(keyDir, { recursive: true });

  if (publicKey == null || publicKey.length === 0) {
    throw new Error("Public key must not be empty");
  }
  if (keyDir === "") {
    throw new Error("Config path must not be empty");
  }

  await secp256k1PubkeyHexToPem(keyDir, publicKey);
}
