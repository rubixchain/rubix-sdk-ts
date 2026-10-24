# Rubix Client SDK for TypeScript

`@rubixchain/rubix-sdk` is a lightweight client for the Rubix Blockchain Node, providing complete node interaction with minimal overhead. It is the TypeScript counterpart of [`rubix-py`](https://github.com/rubixchain/rubix-sdk-py).

> [!WARNING]
> This project is currently under **active development**. API changes and method signature updates may occur between releases. Please review the **Release Notes** before upgrading.

## Installation

Requires Node.js 22.12 or later.

```shell
npm install @rubixchain/rubix-sdk
```

The package ships both ES modules and CommonJS, with type declarations.

## Architecture

The architecture of `@rubixchain/rubix-sdk` is pretty straightforward. It consists of the following classes:

- `RubixClient`: Responsible for connection to Rubix Blockchain Node
- `Signer`: Signs and performs Blockchain transactions and manages user's crypto keys.
- `Querier`: Queries information such as Token Balances, Smart Contract and NFT token chains, etc.

`RubixClient` has a set of internal methods to make API requests to the node. Both `Signer` and `Querier` consume an instance of `RubixClient`, which helps them achieve their respective operations with the Blockchain node.

Let's have a look at a simple example of fetching RBT balance and transferring them:

```ts
import { Querier, RubixClient, Signer } from "@rubixchain/rubix-sdk";

// Define the RubixClient by specifying the target Rubix node address
// and optionally providing timeout in milliseconds
const client = new RubixClient({ nodeUrl: "http://localhost:20000", timeout: 300_000 });

// Define the Signer
// Signer.create takes two mandatory inputs:
// - rubixClient: Rubix Client instance
// - alias: Alias given to the account holding the cryptographic keypair. It can therefore
// be used every time the user wants to refer to the same keypair present in SDK config. If the
// keypair files are not present, they will be created. The keypair values will then depend on
// whether the user passes a mnemonic or not
//
// Optional Arguments:
// - mnemonic: Account can be recovered by passing a 24-word BIP-39 mnemonic. If not passed,
// a random mnemonic is generated.
// - configPath: Directory where files associated with SDK such as keypairs will be stored.
// Defaults to ~/.rubix_sdk
// - passphrase: Passphrase used to encrypt the private key on disk. It is HIGHLY RECOMMENDED
// to provide one
const signer = await Signer.create({
  rubixClient: client,
  alias: "nick",
  mnemonic: "<Enter 24-word long BIP-39 mnemonic>",
  configPath: "<Config Path for SDK dir>",
});

// Internally, a call is made to Rubix Node to create and register your DID
const userDid = signer.did;

// Retrieve the keypair which can be used for signing arbitrary message
const keypair = signer.getKeypair();

// Retrieve the mnemonic
const mnemonic = signer.getMnemonic();

// Define the Querier
const queryClient = new Querier(client);

// Check RBT balance
const balanceInfo = await queryClient.getRbtBalance(userDid);
const balance = balanceInfo.balance;

// Perform RBT Transfer
const txResponse = await signer.sendRbtTokens({
  receiverDid: "<Enter recipient DID>",
  rbtAmount: 0.001,
  memo: "Test RBT Transfer",
});

if (txResponse.status === true) {
  console.log("RBT Transfer Successful!");
} else {
  console.log("RBT Transfer Failed!: ", txResponse.message);
}
```

## Compatibility with `rubix-py`

Accounts are stored in the same layout and format as `rubix-py`
(`<configPath>/account/<alias>/<did>/pubKey.pem` and `privKey.pem`), so an account created by either SDK can be loaded by the other with the same alias and passphrase. Keys derived from a mnemonic, signatures and DIDs are identical across both SDKs.

## Usage

Refer [examples](./examples) for more use cases.

## Development

```shell
npm install
npm run typecheck
npm run build
npm run test:offline   # unit and compatibility tests, no network access
npm run test:live      # tests against a live Rubix node (see below)
```

The live tests run against `https://chain-connector-2-dev.rubix.net` by default and perform real transactions. They are configured through environment variables:

| Variable | Description |
| --- | --- |
| `RUBIX_NODE_URL` | Rubix node to test against |
| `RUBIX_TEST_MNEMONIC` | 24-word mnemonic of a funded account. Transaction tests are skipped without it |
| `RUBIX_TEST_DID` | DID expected for that mnemonic (optional) |

Accounts created by the live tests are kept in `.rubix_sdk_test/`.

### Releasing

Pushing a `v<version>` tag that matches the `version` in `package.json` (e.g. `v1.0.0-alpha.1`) runs `.github/workflows/release.yml`, which tests and builds the package, publishes it to npm under the `rubixchain` org, and creates a GitHub release with the packed tarball.

Prereleases are published under a dist-tag named after their identifier (`1.0.0-alpha.1` → `alpha`, `1.0.0-rc.1` → `rc`) and marked as pre-releases on GitHub, so `npm install @rubixchain/rubix-sdk` keeps resolving to the latest stable version. Install a prerelease with `npm install @rubixchain/rubix-sdk@alpha`.

Publishing uses [npm trusted publishing](https://docs.npmjs.com/trusted-publishers), so no npm token is stored in the repository. Trusted publishing can only be configured for a package that already exists, so the first release is bootstrapped once:

1. Publish the first version, either from a terminal (`npm login`, then `npm run build && npm publish --tag alpha` for a prerelease, or plain `npm publish` for a stable version) or from CI by adding a short-lived granular access token (read-write on the `rubixchain` org, with "Bypass 2FA" enabled) as the `NPM_TOKEN` repository secret.
2. On npmjs.com, open the package settings and add a trusted publisher: GitHub Actions, owner `rubixchain`, repository `rubix-sdk-ts`, workflow `release.yml`, environment `npm`.
3. Delete the `NPM_TOKEN` secret if one was created. Later releases authenticate through GitHub's OIDC token.

The compatibility vectors in `tests/fixtures/python` are generated from `rubix-py` with `scripts/generate_python_vectors.py`. Setting `RUBIX_PYTHON` to a Python interpreter with `rubix-py` installed also checks that `rubix-py` can load accounts and verify signatures produced by this SDK.
