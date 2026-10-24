import { bytesToHex } from "@noble/curves/utils.js";
import { describe, expect, test } from "vitest";
import { getPublicKeyForDid } from "../../src/did.js";
import { FUNDED_DID, fundedSigner, hasFundedAccount, NODE_URL } from "./helpers.js";

describe.skipIf(!hasFundedAccount)("DID of the funded account", () => {
  test("is the DID registered on the node for its mnemonic", async () => {
    const signer = await fundedSigner();

    if (FUNDED_DID !== "") {
      expect(signer.did).toBe(FUNDED_DID);
    }

    const publicKey = await getPublicKeyForDid(signer.did, NODE_URL);
    expect(bytesToHex(publicKey)).toBe(signer.getKeypair().publicKey);
  });
});
