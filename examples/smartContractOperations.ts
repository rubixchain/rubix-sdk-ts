import { join } from "node:path";
import { RubixClient, Signer } from "@rubixchain/rubix-sdk";

export async function smartContractDeployment() {
  const client = new RubixClient({ nodeUrl: "<Rubix Node URL>" });

  const signer = await Signer.create({
    rubixClient: client,
    mnemonic: "<Enter 24-word long BIP-39 mnemonic>",
    alias: "nero",
  });

  console.log("Signer DID: ", signer.did);

  const response = await signer.deploySmartContract({
    wasmFile: join(process.cwd(), "wasm_file.wasm"),
    codeFile: join(process.cwd(), "code_file.rs"),
    contractValue: 0.001,
    smartContractData: "",
  });

  if (response.error !== undefined) {
    console.log("Smart Contract Deployment Failed!: ", response.error);
  } else {
    console.log("Smart Contract Address: ", response.contractAddress);
  }
}

export async function smartContractExecution() {
  const client = new RubixClient({ nodeUrl: "<Rubix Node URL>" });

  const signer = await Signer.create({
    rubixClient: client,
    mnemonic: "<Enter 24-word long BIP-39 mnemonic>",
    alias: "nero",
  });

  console.log("Signer DID: ", signer.did);

  const response = await signer.executeSmartContract({
    contractAddress: "<Smart Contract Address>",
    smartContractData: "test1",
  });

  if (response.status === false) {
    console.log("Smart Contract Execution Failed!: ", response.message ?? "");
  } else {
    console.log("Smart Contract Execution Successful, response: ", response);
  }
}
