<script setup lang="ts">
import { useTresContext } from '@tresjs/core'
import { useRapierContext } from '@tresjs/rapier'
import { onBeforeUnmount } from 'vue'
import type { WebGLRenderer } from 'three'
import { createPhysics, type Rapier } from './physics'
import { startXR, stopXR } from './runtime'

/**
 * Sits inside <Physics> and starts the XR runtime with the world @tresjs/rapier created.
 *
 * <Physics> sets the world up asynchronously (it loads Rapier's WASM), which is why it
 * has to be inside <Suspense>. By the time this component runs, the world exists.
 */
const { renderer, scene } = useTresContext()
const rapierContext = useRapierContext()

const world = rapierContext.world.value
const rapier = rapierContext.rapier.value as Rapier | undefined
if (world && rapier) {
  startXR(
    // TresJS types the renderer more loosely than Three.js; it is a WebGLRenderer here
    renderer.instance as unknown as WebGLRenderer,
    scene.value,
    createPhysics({ rapier, world, step: rapierContext.step }),
    // The starter renders, steps physics and copies body poses every frame from its own
    // loop, which also runs inside XR. TresJS's loop is stopped so nothing runs twice
    () => renderer.loop.stop(),
  )
}

onBeforeUnmount(stopXR)
</script>

<template>
  <!-- Renders nothing. Only connects the <Physics> world to the XR runtime -->
</template>
