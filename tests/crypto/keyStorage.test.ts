import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { hexToBytes } from "@noble/curves/utils.js";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { loadAccountFromFile, saveAccountToFile } from "../../src/crypto/account.js";

// Sample keys and DID
const publicKey = hexToBytes(
  "04b8edb32c69e16b8d30de87b48aedc4fa09f1643fbaa3e85dbb1932498ea94b0a7fd48c325a591a08e350b8b1ddfb7416ff72f7d61dad9a33b46658ef77ca6625",
);
const privateKey = hexToBytes("e32a09e939376358c37c8780beb632f5cf2fa12c8a53bc77984e60964fd59c78");
const did = "bafybmicbopex4ydytrtremmculwpo7e5p2uvbkuw2ds775xmkcsc5lglai";
const passphrase = "testpassphrase";

describe("key storage", () => {
  let tmppath: string;

  beforeEach(async () => {
    tmppath = await mkdtemp(join(tmpdir(), "rubix-sdk-ts-"));
  });

  afterEach(async () => {
    await rm(tmppath, { recursive: true, force: true });
  });

  test("saves and loads keys", async () => {
    // Save keys to temporary directory
    await saveAccountToFile(tmppath, publicKey, privateKey, did, "nero", passphrase);

    // Load keys back
    const account = await loadAccountFromFile(tmppath, "nero", passphrase);

    // Verify loaded keys
    expect(account.did).toBe(did);
    expect(account.keypair.publicKey).toBe(Buffer.from(publicKey).toString("hex"));
    expect(account.keypair.privateKey).toBe(Buffer.from(privateKey).toString("hex"));

    await expect(loadAccountFromFile(tmppath, "nero", "wrongpassphrase")).rejects.toThrow(
      "Failed to decrypt private key (wrong passphrase or corrupted data).",
    );
  });

  test("refuses to save a second DID under the same alias", async () => {
    // Save keys to temporary directory
    await saveAccountToFile(tmppath, publicKey, privateKey, did, "nero", passphrase);

    await expect(
      saveAccountToFile(
        tmppath,
        publicKey,
        privateKey,
        "bafybmiffsqtxnrinhp4c7sa3y3pju5whxdcf3ndzjxqdbeglgw3yzcnkkm",
        "nero",
        passphrase,
      ),
    ).rejects.toThrow("cannot create a key directory since one key directory already exists");
  });
});
