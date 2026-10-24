import { rm } from "node:fs/promises";
import { join } from "node:path";
import { sha256 } from "@noble/hashes/sha2.js";
import { hexToBytes } from "@noble/curves/utils.js";
import { beforeAll, describe, expect, test } from "vitest";
import { fastSignatureVerify } from "../../src/did.js";
import { Signer } from "../../src/signer.js";
import { client, CONFIG_PATH, NODE_URL } from "./helpers.js";

const signerDid = "bafybmifxxg6xvzbu6cd5gqrtsl4mqizlnjioz6djp45kq6lq6fn7hl3cmq";

const signature = hexToBytes(
  "304402201a656c550f637acf227c4f94d264d9373791bfcacdad5f72818b96f04299849e022003eb085b4d5eecc8df9c651db826ceacb88a48beaf820b23da8fd92bb024afa9",
);

describe("fast signature verification", () => {
  let signer: Signer;

  beforeAll(async () => {
    signer = await Signer.create({
      alias: "jacob",
      rubixClient: client,
      configPath: CONFIG_PATH,
    });
    // Start without a cached public key, so that the first test fetches it from the node
    await rm(join(signer.accountDir, signerDid), { recursive: true, force: true });
  });

  test("accepts a valid signature (public key fetched from the node)", async () => {
    const message = new TextEncoder().encode("Lorem ipsum dolor sit amet, consectetur adipiscing elit.");
    const messageHash = sha256(message);

    const isValid = await fastSignatureVerify({
      rubixNodeBaseUrl: NODE_URL,
      accountDir: signer.accountDir,
      did: signerDid,
      message: messageHash,
      signature,
    });

    expect(isValid).toBe(true);
  });

  test("rejects a signature over a different message (public key loaded from disk)", async () => {
    const message = new TextEncoder().encode("Lorem ipsum dolor sit amet, consectetur adipiscing");
    const messageHash = sha256(message);

    const isValid = await fastSignatureVerify({
      rubixNodeBaseUrl: NODE_URL,
      accountDir: signer.accountDir,
      did: signerDid,
      message: messageHash,
      signature,
    });

    expect(isValid).toBe(false);
  });
});
