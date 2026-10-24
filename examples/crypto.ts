import { RubixClient, secp256k1Verify, Signer } from "@rubixchain/rubix-sdk";

export async function signAndVerifyArbitraryData(data: Uint8Array) {
  const client = new RubixClient({ nodeUrl: "<Rubix Node URL>" });

  const signer = await Signer.create({
    rubixClient: client,
    mnemonic: "<Enter 24-word long BIP-39 mnemonic>",
    alias: "nero",
  });

  console.log("Public Key (hex): ", signer.getKeypair().publicKey);
  const keypair = signer.getKeypair();

  const signatureBytes = keypair.sign(data);

  const isValid = secp256k1Verify(Buffer.from(keypair.publicKey, "hex"), data, signatureBytes);
  console.log("Is the signature valid?: ", isValid);
}
