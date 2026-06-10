import { Lifecycle } from '@well-known-components/interfaces'
import { BaseComponents } from './types'
import { loadOrReload } from './logic/sceneLoader'
import { setManifestFileDir } from './logic/scene-runtime/apis'
import { setExcludedGltfSrcs } from './logic/scene-runtime/logger'

// this function wires the business logic (adapters & controllers) with the components (ports)
export async function main(program: Lifecycle.EntryPointParameters<BaseComponents>) {
  const { components, startComponents } = program

  // start ports: db, listeners, synchronizations, etc
  await startComponents()

  // Configure output manifest directory
  const outputDir = process.env.npm_config_output ?? await components.config.getString('OUTPUT_MANIFEST_DIR')
  if (outputDir) {
    setManifestFileDir(outputDir)
  }

  // Configure GltfContainer.src exclusion list. Comma-separated list of GLB paths
  // whose owning entities should be omitted from the manifest. This is a stopgap
  // for entities whose final state depends on async work the sandbox can't run
  // faithfully (e.g. network-driven content swaps).
  const excludedSrcsRaw =
    process.env.npm_config_excluded_srcs ?? await components.config.getString('EXCLUDED_GLTF_SRCS')
  if (excludedSrcsRaw) {
    setExcludedGltfSrcs(excludedSrcsRaw.split(','))
  }
  
  const localPath = process.env.npm_config_path ?? await components.config.getString('LOCAL_SCENE_PATH')
  if (localPath) {
    await loadOrReload(components, 'localScene', localPath, false)
  } else {
    const worldName = process.env.npm_config_world
    if (worldName) {
      const remoteSceneCoords = process.env.npm_config_coords ?? await components.config.getString('REMOTE_SCENE_COORDS')
      if (!remoteSceneCoords) {
        throw new Error('--coords is required when using --world')
      }
      await loadOrReload(components, 'worldScene', `${worldName}|${remoteSceneCoords}`, false)
    } else {
      const sceneID = process.env.npm_config_sceneid
      if (sceneID) {
        await loadOrReload(components, 'remoteScene', sceneID, true)
      } else {
        const remoteSceneCoords = process.env.npm_config_coords ?? await components.config.getString('REMOTE_SCENE_COORDS')
        if (remoteSceneCoords) {
          await loadOrReload(components, 'remoteScene', remoteSceneCoords, false)
        }
      }
    }
  }
}
