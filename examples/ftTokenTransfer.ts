import { Querier, RubixClient, Signer } from "@rubixchain/rubix-sdk";

export async function performFtTokenTransfer() {
  const client = new RubixClient({ nodeUrl: "<Rubix Node URL>" });

  const signer = await Signer.create({
    rubixClient: client,
    mnemonic: "<Enter 24-word long BIP-39 mnemonic>",
    alias: "nero",
  });

  console.log("Signer DID: ", signer.did);

  const response = await signer.sendFt({
    receiverDid: "<Enter recipient DID>",
    ftName: "ABC",
    ftCount: 5,
    ftCreatorDid: "<Enter FT Creator DID>",
    comment: "Test FT Transfer",
  });

  if (response.status === true) {
    console.log("FT Transfer Successful!");
  } else {
    console.log("FT Transfer Failed!: ", response.message ?? "");
  }
}

export async function checkFtBalances() {
  const client = new RubixClient({ nodeUrl: "<Rubix Node URL>" });

  const rubixQuerier = new Querier(client);
  const balances = await rubixQuerier.getFtBalances("bafybmicbopex4ydytrtremmculwpo7e5p2uvbkuw2ds775xmkcsc5lglai");

  if (balances.length === 0) {
    console.log("No FT Balances Found.");
  } else {
    console.log("FT Balances: ", balances);
  }
}
