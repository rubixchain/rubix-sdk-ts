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

The compatibility vectors in `tests/fixtures/python` are generated from `rubix-py` with `scripts/generate_python_vectors.py`. Setting `RUBIX_PYTHON` to a Python interpreter with `rubix-py` installed also checks that `rubix-py` can load accounts and verify signatures produced by this SDK.


# Releasing

Pushing a `v<version>` tag that matches the `version` in `package.json` (e.g. `v1.0.0-alpha.1`) runs `.github/workflows/release.yml`, which tests and builds the package, publishes it to npm under the `rubixchain` org, and creates a GitHub release with the packed tarball.

Prereleases are published under a dist-tag named after their identifier (`1.0.0-alpha.1` → `alpha`, `1.0.0-rc.1` → `rc`) and marked as pre-releases on GitHub, so `npm install @rubixchain/rubix-sdk` keeps resolving to the latest stable version. Install a prerelease with `npm install @rubixchain/rubix-sdk@alpha`.

Publishing uses [npm trusted publishing](https://docs.npmjs.com/trusted-publishers), so no npm token is stored in the repository. Trusted publishing can only be configured for a package that already exists, so the first release is bootstrapped once:

1. Publish the first version, either from a terminal (`npm login`, then `npm run build && npm publish --tag alpha` for a prerelease, or plain `npm publish` for a stable version) or from CI by adding a short-lived granular access token (read-write on the `rubixchain` org, with "Bypass 2FA" enabled) as the `NPM_TOKEN` repository secret.
2. On npmjs.com, open the package settings and add a trusted publisher: GitHub Actions, owner `rubixchain`, repository `rubix-sdk-ts`, workflow `release.yml`, environment `npm`.
3. Delete the `NPM_TOKEN` secret if one was created. Later releases authenticate through GitHub's OIDC token.
