<script setup lang="ts">
import { ref } from 'vue'
import { Vector3 } from 'three'
import { useEmptyPinch, useSceneReset } from 'vue-webxr'
import GreenBox from './GreenBox.vue'

/**
 * The scene of the example: lights and a list of green boxes.
 *
 * Pinch once in empty space (or pull a trigger away from any box) to drop a new box in
 * front of your eyes. Resetting the scene (pinch twice, A / X) removes the added boxes.
 */

/** How far in front of the eyes a new box appears (m) */
const SPAWN_DISTANCE = 0.4
/** Added boxes beyond this number replace the oldest one */
const MAX_ADDED = 20

interface Box {
  id: number
  position: [number, number, number]
  yaw: number
}

/** The first box, placed by the scene. Reset brings it back in front of the viewer */
const FIRST: Box = { id: 0, position: [0, 1.2, -0.6], yaw: 0 }

const boxes = ref<Box[]>([FIRST])
let nextId = 1

const forward = new Vector3()
useEmptyPinch(({ head }) => {
  // Straight ahead at eye height: the gaze direction with the up and down part removed,
  // so looking at the floor still puts the box in front of the eyes, not at your feet
  forward.set(0, 0, -1).applyQuaternion(head.quaternion)
  forward.y = 0
  if (forward.lengthSq() < 1e-6) forward.set(0, 0, -1)
  forward.normalize()
  const p = head.position
  boxes.value.push({
    id: nextId++,
    position: [p.x + forward.x * SPAWN_DISTANCE, p.y, p.z + forward.z * SPAWN_DISTANCE],
    // Turned to face the viewer
    yaw: Math.atan2(-forward.x, -forward.z),
  })
  if (boxes.value.length > MAX_ADDED + 1) boxes.value.splice(1, 1)
})

useSceneReset(() => {
  boxes.value = [FIRST]
})
</script>

<template>
  <!-- Lights: an ambient fill so no face is black, and a directional "sun" for shading -->
  <TresAmbientLight :intensity="0.8" />
  <TresDirectionalLight :position="[1, 3, 2]" :intensity="2" />

  <GreenBox v-for="box in boxes" :key="box.id" :position="box.position" :yaw="box.yaw" />
</template>
