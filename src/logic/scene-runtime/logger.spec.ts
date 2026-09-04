import { engine } from '@dcl/ecs/dist-cjs'
import * as components from '@dcl/ecs/dist-cjs/components'
import { ReadWriteByteBuffer } from '@dcl/ecs/dist-cjs/serialization/ByteBuffer'
import { PutComponentOperation, AppendValueOperation } from '@dcl/ecs/dist-cjs/serialization/crdt'
import { Entity } from '@dcl/ecs/dist-cjs/engine/entity'
import { serializeCrdtMessages } from './logger'

const Transform = components.Transform(engine)
const GltfContainer = components.GltfContainer(engine)

type PutInput = { kind: 'put'; entityId: number; componentId: number; timestamp: number; data: Uint8Array }
type AppendInput = { kind: 'append'; entityId: number; componentId: number; timestamp: number; data: Uint8Array }
type MessageInput = PutInput | AppendInput

function serializeComponent(component: { schema: { serialize: (value: any, buf: ReadWriteByteBuffer) => void } }, value: any): Uint8Array {
  const buf = new ReadWriteByteBuffer()
  component.schema.serialize(value, buf)
  return buf.toBinary()
}

function buildBuffer(messages: MessageInput[]): Uint8Array {
  const buf = new ReadWriteByteBuffer()
  for (const m of messages) {
    if (m.kind === 'put') {
      PutComponentOperation.write(m.entityId as Entity, m.timestamp, m.componentId, m.data, buf)
    } else {
      AppendValueOperation.write(m.entityId as Entity, m.timestamp, m.componentId, m.data, buf)
    }
  }
  return buf.toBinary()
}

describe('serializeCrdtMessages (LWW dedup)', () => {
  it('collapses same-value duplicates for the same (entity, component)', () => {
    const data = serializeComponent(GltfContainer, { src: 'cube.glb' })
    const buf = buildBuffer([
      { kind: 'put', entityId: 512, componentId: GltfContainer.componentId, timestamp: 1, data },
      { kind: 'put', entityId: 512, componentId: GltfContainer.componentId, timestamp: 2, data },
    ])

    const out = [...serializeCrdtMessages('', buf)]

    expect(out).toHaveLength(1)
    expect(out[0].entityId).toBe(512)
    expect(out[0].componentName).toBe('core::GltfContainer')
    expect(out[0].data).toMatchObject({ src: 'cube.glb' })
  })

  it('keeps the highest-timestamp PUT (LWW) when values differ', () => {
    const cube = serializeComponent(GltfContainer, { src: 'cube.glb' })
    const sphere = serializeComponent(GltfContainer, { src: 'sphere.glb' })
    const buf = buildBuffer([
      { kind: 'put', entityId: 512, componentId: GltfContainer.componentId, timestamp: 1, data: cube },
      { kind: 'put', entityId: 512, componentId: GltfContainer.componentId, timestamp: 2, data: sphere },
    ])

    const out = [...serializeCrdtMessages('', buf)]

    expect(out).toHaveLength(1)
    expect(out[0].data).toMatchObject({ src: 'sphere.glb' })
  })

  it('uses timestamp ordering, not arrival order', () => {
    const cube = serializeComponent(GltfContainer, { src: 'cube.glb' })
    const sphere = serializeComponent(GltfContainer, { src: 'sphere.glb' })
    // sphere has the higher timestamp but arrives first in the buffer
    const buf = buildBuffer([
      { kind: 'put', entityId: 512, componentId: GltfContainer.componentId, timestamp: 2, data: sphere },
      { kind: 'put', entityId: 512, componentId: GltfContainer.componentId, timestamp: 1, data: cube },
    ])

    const out = [...serializeCrdtMessages('', buf)]

    expect(out).toHaveLength(1)
    expect(out[0].data).toMatchObject({ src: 'sphere.glb' })
  })

  it('keeps distinct entities separate', () => {
    const data = serializeComponent(GltfContainer, { src: 'cube.glb' })
    const buf = buildBuffer([
      { kind: 'put', entityId: 1, componentId: GltfContainer.componentId, timestamp: 1, data },
      { kind: 'put', entityId: 2, componentId: GltfContainer.componentId, timestamp: 1, data },
    ])

    const out = [...serializeCrdtMessages('', buf)]

    expect(out).toHaveLength(2)
    expect(out.map((o) => o.entityId).sort()).toEqual([1, 2])
  })

  it('keeps distinct components on the same entity separate', () => {
    const gltf = serializeComponent(GltfContainer, { src: 'cube.glb' })
    const transform = serializeComponent(Transform, {
      position: { x: 1, y: 2, z: 3 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      scale: { x: 1, y: 1, z: 1 },
      parent: 0 as Entity,
    })
    const buf = buildBuffer([
      { kind: 'put', entityId: 7, componentId: GltfContainer.componentId, timestamp: 1, data: gltf },
      { kind: 'put', entityId: 7, componentId: Transform.componentId, timestamp: 1, data: transform },
    ])

    const out = [...serializeCrdtMessages('', buf)]

    expect(out).toHaveLength(2)
    const names = out.map((o) => o.componentName).sort()
    expect(names).toEqual(['core::GltfContainer', 'core::Transform'])
  })

  it('filters out components outside the allowlist', () => {
    const data = serializeComponent(GltfContainer, { src: 'cube.glb' })
    // 99999999 is intentionally not registered with any allowlisted component
    const buf = buildBuffer([
      { kind: 'put', entityId: 1, componentId: 99999999, timestamp: 1, data },
    ])

    const out = [...serializeCrdtMessages('', buf)]

    expect(out).toHaveLength(0)
  })

  it('does not emit APPEND_VALUE messages even for allowlisted components', () => {
    const data = serializeComponent(GltfContainer, { src: 'cube.glb' })
    const buf = buildBuffer([
      { kind: 'append', entityId: 1, componentId: GltfContainer.componentId, timestamp: 1, data },
    ])

    const out = [...serializeCrdtMessages('', buf)]

    expect(out).toHaveLength(0)
  })
})

describe('serializeCrdtMessages (hardcoded GltfContainer.src exclusion)', () => {
  it('drops every component for entities whose final GltfContainer.src matches the hardcoded list', () => {
    const excludedSrc = serializeComponent(GltfContainer, { src: 'assets/models/out/models/next_live_events.glb' })
    const otherExcluded = serializeComponent(GltfContainer, { src: 'assets/models/out/models/live_events.glb' })
    const kept = serializeComponent(GltfContainer, { src: 'assets/models/out/models/something_else.glb' })
    const transform = serializeComponent(Transform, {
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      scale: { x: 1, y: 1, z: 1 },
      parent: 0 as Entity,
    })
    const buf = buildBuffer([
      { kind: 'put', entityId: 10, componentId: GltfContainer.componentId, timestamp: 1, data: excludedSrc },
      { kind: 'put', entityId: 10, componentId: Transform.componentId, timestamp: 1, data: transform },
      { kind: 'put', entityId: 11, componentId: GltfContainer.componentId, timestamp: 1, data: otherExcluded },
      { kind: 'put', entityId: 11, componentId: Transform.componentId, timestamp: 1, data: transform },
      { kind: 'put', entityId: 20, componentId: GltfContainer.componentId, timestamp: 1, data: kept },
      { kind: 'put', entityId: 20, componentId: Transform.componentId, timestamp: 1, data: transform },
    ])

    const out = [...serializeCrdtMessages('', buf)]

    expect(out.map((o) => o.entityId).sort()).toEqual([20, 20])
  })

  it('exclusion respects LWW: only the final src is checked against the hardcoded list', () => {
    const excludedSrc = serializeComponent(GltfContainer, { src: 'assets/models/out/models/next_live_events.glb' })
    const kept = serializeComponent(GltfContainer, { src: 'assets/models/out/models/something_else.glb' })
    const buf = buildBuffer([
      // entity 30 ends with a non-excluded src -> should remain
      { kind: 'put', entityId: 30, componentId: GltfContainer.componentId, timestamp: 1, data: excludedSrc },
      { kind: 'put', entityId: 30, componentId: GltfContainer.componentId, timestamp: 2, data: kept },
      // entity 40 ends with an excluded src -> should be dropped
      { kind: 'put', entityId: 40, componentId: GltfContainer.componentId, timestamp: 1, data: kept },
      { kind: 'put', entityId: 40, componentId: GltfContainer.componentId, timestamp: 2, data: excludedSrc },
    ])

    const out = [...serializeCrdtMessages('', buf)]

    expect(out).toHaveLength(1)
    expect(out[0].entityId).toBe(30)
  })
})
