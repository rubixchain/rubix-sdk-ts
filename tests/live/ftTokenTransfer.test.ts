import { describe, expect, test } from "vitest";
import { Querier } from "../../src/querier.js";
import { client, fundedSigner, hasFundedAccount, receiverSigner } from "./helpers.js";

const FT_NAME = "TSSDKFT";

// Based on examples/ftTokenTransfer.ts
describe.skipIf(!hasFundedAccount)("FT token transfer", () => {
  test("creates an FT (once) and transfers it", async () => {
    const signer = await fundedSigner();
    const receiver = await receiverSigner();
    const rubixQuerier = new Querier(client);

    // Mint the FT only if the funded account has run out of it, to avoid locking RBT on every run
    let balances = await rubixQuerier.getFtBalances(signer.did);
    if (!JSON.stringify(balances ?? []).includes(FT_NAME)) {
      const createResponse = await signer.createFt({ name: FT_NAME, supply: 10, rbtLockAmount: 1 });
      expect(createResponse.status, `FT Creation Failed!: ${createResponse.message}`).toBe(true);
      balances = await rubixQuerier.getFtBalances(signer.did);
    }
    console.log("FT balances of the funded account:", JSON.stringify(balances));

    const response = await signer.sendFt({
      receiverDid: receiver.did,
      ftName: FT_NAME,
      ftCount: 1,
      ftCreatorDid: signer.did,
      comment: "Test FT Transfer",
    });

    expect(response.status, `FT Transfer Failed!: ${response.message}`).toBe(true);

    const receiverBalances = await rubixQuerier.getFtBalances(receiver.did);
    expect(JSON.stringify(receiverBalances)).toContain(FT_NAME);
  });
});
