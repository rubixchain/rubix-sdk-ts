import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { RubixClient } from "../../src/client.js";
import { Signer } from "../../src/signer.js";

/**
 * Live tests run against a real Rubix node and need:
 *
 * - `RUBIX_TEST_MNEMONIC`: 24-word mnemonic of a funded account (tests needing it are skipped otherwise)
 * - `RUBIX_TEST_DID`: optional, the DID expected for that mnemonic
 * - `RUBIX_TEST_RECEIVER_DID`: optional, the DID that receives transfers. Defaults to a "receiver"
 *   account created once in the test config directory
 * - `RUBIX_NODE_URL`: optional, defaults to the dev node
 */
export const NODE_URL = process.env.RUBIX_NODE_URL ?? "https://chain-connector-2-dev.rubix.net";
export const FUNDED_MNEMONIC = process.env.RUBIX_TEST_MNEMONIC ?? "";
export const FUNDED_DID = process.env.RUBIX_TEST_DID ?? "";
export const RECEIVER_DID = process.env.RUBIX_TEST_RECEIVER_DID ?? "";
export const hasFundedAccount = FUNDED_MNEMONIC !== "";

// Accounts created by the live tests are kept here (instead of ~/.rubix_sdk) and reused across runs
export const CONFIG_PATH = join(dirname(fileURLToPath(import.meta.url)), "..", "..", ".rubix_sdk_test");

export const client = new RubixClient({ nodeUrl: NODE_URL });

export function fundedSigner(): Promise<Signer> {
  return Signer.create({ rubixClient: client, alias: "funded", mnemonic: FUNDED_MNEMONIC, configPath: CONFIG_PATH });
}

/**
 * The DID that receives transfers: `RUBIX_TEST_RECEIVER_DID`, or else an account with a newly
 * generated mnemonic, created once and then reused.
 */
export async function receiverDid(): Promise<string> {
  if (RECEIVER_DID !== "") {
    return RECEIVER_DID;
  }
  return (await Signer.create({ rubixClient: client, alias: "receiver", configPath: CONFIG_PATH })).did;
}

/** A unique value, so that every run deploys assets with fresh addresses. */
export function nonce(): string {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/** Writes a minimal valid WASM module (with the nonce in a custom section) and a matching source file. */
export async function makeContractFiles(): Promise<{ wasmFile: string; codeFile: string }> {
  const dir = await mkdtemp(join(tmpdir(), "rubix-sdk-ts-contract-"));
  const name = new TextEncoder().encode("nonce");
  const payload = new TextEncoder().encode(nonce());
  const section = [name.length, ...name, ...payload];
  const wasm = new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, 0x00, section.length, ...section]);

  const wasmFile = join(dir, "contract.wasm");
  const codeFile = join(dir, "contract.rs");
  await writeFile(wasmFile, wasm);
  await writeFile(codeFile, `// rubix-sdk-ts live test contract ${nonce()}\nfn main() {}\n`);
  return { wasmFile, codeFile };
}

/** Writes a small artifact and metadata file for an NFT. */
export async function makeNftFiles(): Promise<{ artifactFile: string; metadataFile: string }> {
  const dir = join(await mkdtemp(join(tmpdir(), "rubix-sdk-ts-nft-")), "nft");
  await mkdir(dir);
  const artifactFile = join(dir, "artifact.txt");
  const metadataFile = join(dir, "metadata.json");
  await writeFile(artifactFile, `rubix-sdk-ts live test artifact ${nonce()}\n`);
  await writeFile(metadataFile, JSON.stringify({ name: "rubix-sdk-ts live test", nonce: nonce() }));
  return { artifactFile, metadataFile };
}
