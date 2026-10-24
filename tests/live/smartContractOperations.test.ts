import { beforeAll, describe, expect, test } from "vitest";
import { Querier } from "../../src/querier.js";
import type { Signer } from "../../src/signer.js";
import { client, fundedSigner, hasFundedAccount, makeContractFiles } from "./helpers.js";

// Based on examples/smartContractOperations.ts. The tests depend on each other and run in order.
describe.skipIf(!hasFundedAccount)("smart contract operations", () => {
  const rubixQuerier = new Querier(client);
  let signer: Signer;
  let contractAddress: string;

  beforeAll(async () => {
    signer = await fundedSigner();
  });

  test("deploys a smart contract", async () => {
    const { wasmFile, codeFile } = await makeContractFiles();

    const response = await signer.deploySmartContract({
      wasmFile,
      codeFile,
      contractValue: 0.001,
      smartContractData: "",
    });

    expect(response.error, `Smart Contract Deployment Failed!: ${response.error}`).toBeUndefined();
    contractAddress = response.contractAddress!;
    expect(contractAddress).toMatch(/^Qm/);
  });

  test("executes the smart contract", async () => {
    const response = await signer.executeSmartContract({
      contractAddress,
      smartContractData: "test1",
    });

    expect(response.status, `Smart Contract Execution Failed!: ${response.message}`).toBe(true);

    const states = await rubixQuerier.getSmartContractStates(contractAddress);
    expect(states.length).toBeGreaterThan(1);
    expect(states.at(-1)).toEqual({
      transactionId: expect.any(String),
      initiator: signer.did,
      epoch: expect.any(Number),
      data: "test1",
    });

    expect(await rubixQuerier.getSmartContractStates(contractAddress, { onlyLatestState: true })).toEqual([states.at(-1)]);
  });
});
