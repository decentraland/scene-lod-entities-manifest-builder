import { createSceneComponent } from '../adapters/scene'
import { getGameDataFromLocalScene, getGameDataFromRemoteScene } from './sceneFetcher'
import { BaseComponents } from '../types'

export async function loadOrReload({ config, fetch }: BaseComponents, loadingType: string, targetScene: string) {
  let hash: string
  let sourceCode: string
  if (loadingType === 'localScene') {
    sourceCode = await getGameDataFromLocalScene(targetScene)
    hash = 'localScene'
  } else {
    sourceCode = await getGameDataFromRemoteScene(fetch, targetScene)
    hash = 'remoteScene'
  }

  const scene = await createSceneComponent()
  console.log(`${loadingType} source code loaded, starting scene`)

  scene.start(hash, sourceCode).catch(console.error)
}
