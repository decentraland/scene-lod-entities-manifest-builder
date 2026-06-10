import { engine, CrdtMessage, CrdtMessageType } from '@dcl/ecs/dist-cjs'
import * as components from '@dcl/ecs/dist-cjs/components'
import { ReadWriteByteBuffer } from '@dcl/ecs/dist-cjs/serialization/ByteBuffer'
import { readMessage } from '@dcl/ecs/dist-cjs/serialization/crdt/message'
import { PutComponentMessage } from '@dcl/ecs/dist-cjs/serialization/crdt/types'

const Transform = components.Transform(engine)
const MeshRenderer = components.MeshRenderer(engine)
const GltfContainer = components.GltfContainer(engine)
const Material = components.Material(engine)
const VisibilityComponent = components.VisibilityComponent(engine)

const allowedComponentIds = new Set<number>([
  Transform.componentId,
  MeshRenderer.componentId,
  GltfContainer.componentId,
  Material.componentId,
  VisibilityComponent.componentId,
])

// Stopgap exclusion list: entities whose final GltfContainer.src is one of these
// paths are dropped from the manifest output (every component on the entity is
// omitted). The sandbox can't faithfully run the async work that decides which
// of these GLBs ends up attached, so whatever it bakes conflicts with the live
// runtime and produces a visible overlap.
//
// This shouldn't live here long-term — see decentraland/lod-generator-unity#43.
const EXCLUDED_GLTF_SRCS = new Set<string>([
  'assets/models/out/models/live_events.glb',
  'assets/models/out/models/next_live_events.glb',
])

export function* serializeCrdtMessages(prefix: string, data: Uint8Array) {
  const buffer = new ReadWriteByteBuffer(data)
  let message: CrdtMessage | null

  // The accumulated CRDT buffer can contain many PUT_COMPONENT messages for the
  // same (entityId, componentId) — main.crdt is folded in on every renderer send,
  // and scene scripts re-emit their components each tick. Apply LWW per the
  // CRDT semantics: keep only the highest-timestamp PUT per (entityId, componentId).
  const latest = new Map<string, PutComponentMessage>()

  while ((message = readMessage(buffer))) {
    if (message.type !== CrdtMessageType.PUT_COMPONENT) continue
    const put = message as PutComponentMessage
    if (!allowedComponentIds.has(put.componentId)) continue

    const key = `${put.entityId}:${put.componentId}`
    const existing = latest.get(key)
    if (!existing || put.timestamp >= existing.timestamp) {
      latest.set(key, put)
    }
  }

  const excludedEntityIds = new Set<number>()
  for (const msg of latest.values()) {
    if (msg.componentId !== GltfContainer.componentId || !msg.data) continue
    try {
      const value = GltfContainer.schema.deserialize(new ReadWriteByteBuffer(msg.data)) as { src?: string }
      if (value?.src && EXCLUDED_GLTF_SRCS.has(value.src)) {
        excludedEntityIds.add(msg.entityId as number)
      }
    } catch (_) {}
  }

  for (const msg of latest.values()) {
    if (excludedEntityIds.has(msg.entityId as number)) continue
    try {
      const c = engine.getComponentOrNull(msg.componentId)
      yield {
        entityId: msg.entityId,
        componentId: c?.componentId,
        componentName: c?.componentName,
        data: msg.data && c ? c.schema.deserialize(new ReadWriteByteBuffer(msg.data)) : null
      }
    } catch (_) {}
  }
}
