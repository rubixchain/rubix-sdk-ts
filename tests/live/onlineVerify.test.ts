import { expect, test } from "vitest";
import { onlineSignatureVerify } from "../../src/did.js";
import { Signer } from "../../src/signer.js";
import { client, CONFIG_PATH, NODE_URL } from "./helpers.js";

test("verifies a valid signature using the online verification service", async () => {
  const signer = await Signer.create({
    rubixClient: client,
    alias: "martin",
    mnemonic:
      "buffalo tumble defy laundry call almost little pig lift party property pool frame erosion mind library sample floor ring enemy word enemy foster ill",
    configPath: CONFIG_PATH,
  });

  const signerDid = signer.did;

  const message = new TextEncoder().encode("Lorem ipsum dolor sit amet, consectetur adipiscing elit.");

  const signature = signer.getKeypair().sign(message);

  const isValid = await onlineSignatureVerify({
    rubixNodeBaseUrl: NODE_URL,
    did: signerDid,
    message,
    signature,
  });
  expect(isValid).toBe(true);
});
