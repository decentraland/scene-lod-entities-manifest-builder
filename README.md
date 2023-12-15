This LODs Manifest Builder was created based on the experimental [scene-state-server](https://github.com/decentraland/scene-state-server).

Original implementation commits history can be found in [the old prototype PR](https://github.com/decentraland/scene-state-server/pull/30).

# IMPORTANT

To be able to use the tool, `node` version `v18.14.2` is mandatory (newer or older versions may not work).
https://nodejs.org/download/release/v18.14.2/

# What this tool does

Based on a target scene, the manifest builder fetches its main file (`game.js`/`index.js`/`main.crdt`), runs it for some frames with a very basic version of the sdk7 core runtime and outputs a manifest JSON file with the rendereable entities information.

Information gathered:
- Transform component data
- GLTFContainer component data
- MeshRenderer component data
- Material component data

# SDK6 Scenes support

This tool supports targetting SDK6 scenes as it uses the [sdk7-adaption-layer](https://github.com/decentraland/sdk7-adaption-layer/tree/main) when a non SDK7 scene is detected. 

# Configuring REMOTE target scene

Create or modify the `.env` file with the var `REMOTE_SCENE_COORDS` specifying the target scene coordiantes. For example:

```
REMOTE_SCENE_COORDS=-129,-77
```

# Configuring LOCAL target scene

Create or modify the `.env` file with the var `LOCAL_SCENE_PATH` specifying the target scene local path. For example:

```
LOCAL_SCENE_PATH=../sdk7-scene-template/bin/index.js
```

# Running the tool locally and manually

Run `npm i` (on first installation/cloning)

Run `npm run build` to build the tool after any modification (or first install)

Run `npm run start` to run the tool

When the manifest builder finishes, the output manifest file will appear in the root folder with the name `rendereable-entities-manifest.json`

The `.env` file can be changed to target a different scene and then `npm run start` is needed again (no need to rebuild if there are no changes to the manifest builder sourcecode)