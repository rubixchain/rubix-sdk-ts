import { existsSync } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { hexToBytes } from "@noble/curves/utils.js";
import { buildUrl, isTimeoutError, raiseForStatus, RubixHTTPError, type QueryParams } from "./client.js";
import { loadPubKeyFromFile, savePubKeyToFile } from "./crypto/account.js";
import { secp256k1Verify, type Secp256k1Keypair } from "./crypto/secp256k1.js";

/** Raised when DID creation fails. */
export class DIDCreationError extends Error {
  override name = "DIDCreationError";
}

/** Raised when DID registration fails. */
export class DIDRegistrationError extends Error {
  override name = "DIDRegistrationError";
}

/** Raised when signature response fails. */
export class SignatureResponseError extends Error {
  override name = "SignatureResponseError";
}

type ErrorClass = new (message: string, options?: ErrorOptions) => Error;

// The functions in this module talk to the Rubix node directly rather than through RubixClient
const REQUEST_TIMEOUT_MS = 300_000;

/**
 * Sends a request to the Rubix node and returns the raw response, mapping failures to `ErrorType`.
 */
async function send(
  ErrorType: ErrorClass,
  rubixNodeBaseUrl: string,
  endpoint: string,
  init: RequestInit & { params?: QueryParams },
): Promise<Response> {
  try {
    const url = buildUrl(rubixNodeBaseUrl, endpoint, init.params).toString();
    let response: Response;
    try {
      response = await fetch(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    } catch (e) {
      if (isTimeoutError(e)) {
        throw new ErrorType("Request to Rubix node timed out", { cause: e });
      }
      throw new ErrorType(`Failed to connect to Rubix node at ${rubixNodeBaseUrl}`, { cause: e });
    }
    await raiseForStatus(response, url);
    return response;
  } catch (e) {
    if (e instanceof ErrorType) {
      throw e;
    }
    if (e instanceof RubixHTTPError) {
      throw new ErrorType(`HTTP error from Rubix node: ${e.message}`, { cause: e });
    }
    throw new ErrorType(`Request failed: ${(e as Error).message}`, { cause: e });
  }
}

/** Parses the JSON body of the response, mapping failures to `ErrorType`. */
async function parseJson(ErrorType: ErrorClass, response: Response): Promise<any> {
  try {
    return JSON.parse(await response.text());
  } catch (e) {
    throw new ErrorType("Invalid JSON response from Rubix node", { cause: e });
  }
}

/**
 * Creates and registers a DID for the keypair on the Rubix node.
 *
 * TODO: To be deprecated once the creation of DID is implemented on the
 * 0x address scheme is implemented on RubixCore.
 * Creation of DID will become a method of Signer class.
 *
 * @param keypair - The keypair whose public key the DID is created for.
 * @param rubixNodeBaseUrl - Base URL of the Rubix node.
 * @returns The created DID.
 */
export async function createDid(keypair: Secp256k1Keypair, rubixNodeBaseUrl: string): Promise<string> {
  // Create IPFS based DID
  const publicKey = keypair.publicKey;
  if (publicKey == null || publicKey.trim() === "") {
    throw new Error("Public key is required to create DID");
  }

  let response = await send(DIDCreationError, rubixNodeBaseUrl, "rubix/v1/dids/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ public_key: publicKey }),
  });

  let responseBody = await parseJson(DIDCreationError, response);

  if ("status" in responseBody && responseBody.status === false) {
    throw new DIDCreationError(`DID creation failed: ${responseBody.message}`);
  }

  const userDid: string = responseBody.result.did;

  // Register the newly created DID
  response = await send(DIDRegistrationError, rubixNodeBaseUrl, `/rubix/v1/dids/${userDid}/register`, {
    method: "POST",
  });

  responseBody = await parseJson(DIDRegistrationError, response);

  if ("status" in responseBody && responseBody.status === false) {
    throw new DIDRegistrationError(`DID registeration failed: ${responseBody.message}`);
  }

  // Retrieve the message from response and sign
  const message: string | null | undefined = responseBody.result.hash;

  if (message == null || message.trim() === "") {
    throw new DIDRegistrationError("No message to sign for DID registration");
  }

  // Decode and sign the message
  const messageBytes = new Uint8Array(Buffer.from(message, "base64"));

  const signatureBytes = keypair.sign(messageBytes);

  // Send the signature-response request
  const reqId = responseBody.result.id;

  const signatureResponseBody = {
    id: reqId,
    signature: Buffer.from(signatureBytes).toString("base64"),
  };

  response = await send(SignatureResponseError, rubixNodeBaseUrl, "/rubix/v1/signature", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(signatureResponseBody),
  });

  responseBody = await parseJson(SignatureResponseError, response);

  if (responseBody?.status === false) {
    throw new SignatureResponseError(`Signature response failed: ${responseBody.message}`);
  }

  return userDid;
}

/**
 * Verifies a signature using Rubix node's online verification service.
 *
 * @param params.rubixNodeBaseUrl - Base URL of the Rubix node.
 * @param params.did - The DID of the signer.
 * @param params.message - The original message that was signed. Must be valid UTF-8.
 * @param params.signature - The signature to verify.
 * @returns True if signature is valid, False otherwise.
 */
export async function onlineSignatureVerify(params: {
  rubixNodeBaseUrl: string;
  did: string;
  message: Uint8Array;
  signature: Uint8Array;
}): Promise<boolean> {
  const { rubixNodeBaseUrl, did, message, signature } = params;

  const verifySignatureBody = {
    signer_did: did,
    signed_msg: new TextDecoder("utf-8", { fatal: true }).decode(message),
    signature: Buffer.from(signature).toString("base64"),
  };

  const response = await send(SignatureResponseError, rubixNodeBaseUrl, "/rubix/v1/signature/verify", {
    method: "GET",
    params: verifySignatureBody,
  });

  let responseBody: any;
  try {
    responseBody = JSON.parse(await response.text());
  } catch (e) {
    throw new SignatureResponseError(`Request failed: ${(e as Error).message}`, { cause: e });
  }
  return responseBody?.status ?? false;
}

/**
 * Retrieves the public key associated with a given DID from the Rubix node.
 *
 * @param did - The DID for which to retrieve the public key.
 * @param rubixNodeBaseUrl - Base URL of the Rubix node.
 * @returns The public key associated with the DID.
 */
export async function getPublicKeyForDid(did: string, rubixNodeBaseUrl: string): Promise<Uint8Array> {
  const response = await send(DIDCreationError, rubixNodeBaseUrl, `/rubix/v1/dids/${did}/public_key`, {
    method: "GET",
  });

  const responseBody = await parseJson(DIDCreationError, response);

  if ("status" in responseBody && responseBody.status === false) {
    throw new DIDCreationError(`Failed to retrieve public key: ${responseBody.message}`);
  }

  const pubKeyHex: string | null | undefined = responseBody.result.public_key;
  if (pubKeyHex == null || pubKeyHex.trim() === "") {
    throw new DIDCreationError("No public key found for the given DID");
  }

  return hexToBytes(pubKeyHex);
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Verifies a signature using the public key associated with the DID.
 * If the DID is not found in the local configuration, it fetches the
 * public key from the Rubix node and saves it for future use.
 *
 * The DID value is considered as the alias while creating the directory
 * under accounts directory
 *
 * @param params.rubixNodeBaseUrl - Base URL of the Rubix node.
 * @param params.accountDir - Directory where DID-related configuration is stored.
 * @param params.did - The DID of the signer.
 * @param params.message - The original message that was signed.
 * @param params.signature - The signature to verify.
 * @returns True if signature is valid, False otherwise.
 */
export async function fastSignatureVerify(params: {
  rubixNodeBaseUrl: string;
  accountDir: string;
  did: string;
  message: Uint8Array;
  signature: Uint8Array;
}): Promise<boolean> {
  const { rubixNodeBaseUrl, accountDir, did, message, signature } = params;

  // Within accounts dir, scan each alias named folder to see if we find our did
  let didFound = false;
  let didPath = "";

  for (const aliasFolder of await readdir(accountDir)) {
    const aliasFolderPath = join(accountDir, aliasFolder);
    if (await isDirectory(aliasFolderPath)) {
      const didFolderPath = join(aliasFolderPath, did);
      if (await isDirectory(didFolderPath)) {
        didFound = true;
        didPath = didFolderPath;
        break;
      }
    }
  }

  let publicKey: Uint8Array;
  if (didFound) {
    if (!existsSync(didPath)) {
      throw new Error(`Public key file not found for DID ${did} at ${didPath}`);
    }
    publicKey = await loadPubKeyFromFile(didPath);
  } else {
    didPath = join(accountDir, did, did);

    // Fetch public key from Rubix node
    publicKey = await getPublicKeyForDid(did, rubixNodeBaseUrl);

    await savePubKeyToFile(didPath, publicKey);
  }

  return secp256k1Verify(publicKey, message, signature);
}
