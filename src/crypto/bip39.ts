import { generateMnemonic, mnemonicToSeedSync, validateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";

/**
 * Generate a 24-word BIP39 mnemonic phrase.
 *
 * @returns The generated BIP39 24-word mnemonic phrase.
 */
export function generateBip39Mnemonic(): string {
  return generateMnemonic(wordlist, 256);
}

/**
 * Derive a seed from a BIP39 mnemonic phrase.
 *
 * @param mnemonicPhrase - The BIP39 mnemonic phrase.
 * @param passphrase - An optional passphrase to enhance security. Default is an empty string.
 * @returns The derived 64-byte seed.
 */
export function getSeedFromMnemonic(mnemonicPhrase: string, passphrase: string = ""): Uint8Array {
  if (mnemonicPhrase == null || mnemonicPhrase.trim() === "") {
    throw new Error("Mnemonic phrase cannot be empty.");
  }

  if (!validateMnemonic(mnemonicPhrase, wordlist)) {
    throw new Error(`Invalid mnemonic phrase: ${mnemonicPhrase}`);
  }

  const wordCount = mnemonicPhrase.trim().split(/\s+/).length;
  if (wordCount !== 24) {
    throw new Error(`Mnemonic phrase must be 24 words long, got ${wordCount}.`);
  }

  return mnemonicToSeedSync(mnemonicPhrase, passphrase);
}
