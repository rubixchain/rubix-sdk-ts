import { join } from "node:path";
import { Querier, RubixClient, Signer } from "@rubixchain/rubix-sdk";

export async function performNftDeployment() {
  const client = new RubixClient({ nodeUrl: "<Rubix Node URL>" });

  const signer = await Signer.create({
    rubixClient: client,
    mnemonic: "<Enter 24-word long BIP-39 mnemonic>",
    alias: "nero",
  });

  console.log("Signer DID: ", signer.did);

  const response = await signer.deployNft({
    artifactFile: join(process.cwd(), "artifact_file"),
    metadataFile: join(process.cwd(), "metadata_file"),
    nftValue: 0.001,
    nftData: "init data",
  });

  if (response.error !== undefined) {
    console.log("NFT Deployment Failed!: ", response.error);
  } else {
    console.log("NFT Address: ", response.nftAddress);
  }
}

export async function performNftExecution() {
  const client = new RubixClient({ nodeUrl: "<Rubix Node URL>" });

  const signer = await Signer.create({
    rubixClient: client,
    mnemonic: "<Enter 24-word long BIP-39 mnemonic>",
    alias: "nero",
  });

  console.log("Signer DID: ", signer.did);

  const response = await signer.executeNft({
    nftAddress: "<NFT Address>",
    nftData: "test execution data",
  });

  if (response.status === false) {
    console.log("NFT Execution Failed!: ", response.message ?? "");
  } else {
    console.log("NFT Execution Successful, response: ", response);
  }
}

export async function getNftTokenChain() {
  const client = new RubixClient({ nodeUrl: "<Rubix Node URL>" });

  const rubixQuerier = new Querier(client);
  const states = await rubixQuerier.getNftStates("<NFT Address>", {
    onlyLatestState: false, // Set true, if only the latest state is needed
  });

  console.log("Total NFT States Retrieved: ", states);
}

export async function getListOfNfts() {
  const client = new RubixClient({ nodeUrl: "<Rubix Node URL>" });

  const rubixQuerier = new Querier(client);
  const nftList = await rubixQuerier.getAllNft();

  console.log("Total NFTs Retrieved: ", nftList);
}

export async function getNftsByOwnerDid() {
  const client = new RubixClient({ nodeUrl: "<Rubix Node URL>" });

  const rubixQuerier = new Querier(client);
  const nfts = await rubixQuerier.getNftsByOwner("<Owner DID>");

  console.log("Total NFTs Retrieved: ", nfts);
}
