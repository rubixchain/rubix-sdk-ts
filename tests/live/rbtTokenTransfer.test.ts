import { describe, expect, test } from "vitest";
import { Querier } from "../../src/querier.js";
import { client, fundedSigner, hasFundedAccount, receiverSigner } from "./helpers.js";

// Based on examples/rbtTokenTransfer.ts
describe.skipIf(!hasFundedAccount)("RBT token transfer", () => {
  test("transfers RBT tokens and updates the receiver balance", async () => {
    const signer = await fundedSigner();
    const receiver = await receiverSigner();
    const rubixQuerier = new Querier(client);

    const before = await rubixQuerier.getRbtBalance(receiver.did);

    const response = await signer.sendRbtTokens({
      receiverDid: receiver.did,
      rbtAmount: 0.001,
      memo: "Test RBT Transfer",
    });

    expect(response.status, `RBT Transfer Failed!: ${response.message}`).toBe(true);
    expect(response.result).toMatchObject({ transactionID: expect.any(String) });

    const after = await rubixQuerier.getRbtBalance(receiver.did);
    expect(after.balance).toBeCloseTo(before.balance + 0.001, 6);
  });
});
