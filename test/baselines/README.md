# Test baselines

End-to-end baselines for the manifest builder. The CI `e2e` job regenerates each manifest from the live worlds content server and `diff`s it against the committed baseline.

## `crashworld-0,0.json`

Manifest for `crashworld.dcl.eth` at coords `0,0` on the zone worlds content server (`https://worlds-content-server.decentraland.zone`). `crashworld` hosts Genesis Plaza; the deployed scene was built from this source commit:

https://github.com/decentraland-scenes/Genesis-Plaza-2025/commit/30cdaffd752a02bc811dfdbd7e5aaaa4b97f595d

### Refreshing the baseline

If the world is intentionally redeployed and the diff begins to fail:

```sh
npm ci
npm run build
rm -f test/baselines/crashworld-0,0.json
npm run start \
  --catalyst=https://worlds-content-server.decentraland.zone \
  --worldsserver=https://worlds-content-server.decentraland.zone \
  --world=crashworld.dcl.eth \
  --coords=0,0 \
  --overwrite \
  --output=./test/baselines
mv test/baselines/*-lod-manifest.json test/baselines/crashworld-0,0.json
```

Then commit the regenerated file and update this README with the new source commit.
