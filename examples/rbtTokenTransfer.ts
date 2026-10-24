import { Querier, RubixClient, Signer } from "@rubixchain/rubix-sdk";

export async function transferRbtTokens() {
  const client = new RubixClient({ nodeUrl: "<Rubix Node URL>" });

  const signer = await Signer.create({
    rubixClient: client,
    mnemonic: "<Enter 24-word long BIP-39 mnemonic>",
    alias: "nero",
  });

  console.log("Signer DID: ", signer.did);

  const response = await signer.sendRbtTokens({
    receiverDid: "<Enter recipient DID>",
    rbtAmount: 0.001,
    memo: "Test RBT Transfer",
  });

  if (response.status === true) {
    console.log("RBT Transfer Successful!");
  } else {
    console.log("RBT Transfer Failed!: ", response.message ?? "");
  }
}

export async function checkRbtBalance() {
  const client = new RubixClient({ nodeUrl: "<Rubix Node URL>" });

  const rubixQuerier = new Querier(client);
  const balance = await rubixQuerier.getRbtBalance("bafybmicbopex4ydytrtremmculwpo7e5p2uvbkuw2ds775xmkcsc5lglai");

  console.log(`RBT Balance: ${balance.balance}`);
}
