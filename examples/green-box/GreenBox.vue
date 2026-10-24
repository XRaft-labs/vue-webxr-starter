<script setup lang="ts">
import { shallowRef } from 'vue'
import { RigidBody } from '@tresjs/rapier'
import { useGrabbable } from 'vue-webxr'

/**
 * One green box.
 *
 * The box is a <RigidBody> from @tresjs/rapier: gravity, its collider (fitted to the mesh)
 * and its material are written as tags and props. Everything that is not specific to this
 * box (XR session, plane detection, grabbing) comes from the vue-webxr library folder.
 * This file only says "here is a box, make it grabbable".
 *
 * Pinch it (or use a controller trigger) to pick it up, twist your wrist to turn it,
 * pinch with your other hand too to scale it, and let go to drop it.
 */
const props = defineProps<{
  /** Starting position (m). Read once: from then on physics owns the pose */
  position: [number, number, number]
  /** Starting turn around the vertical axis (radians) */
  yaw?: number
}>()

// Read once. A new array on every render would make @tresjs/rapier put the body back
const rotation: [number, number, number] = [0, props.yaw ?? 0, 0]

const box = shallowRef()
useGrabbable(box)
</script>

<template>
  <!-- A 10 cm box. The collider is generated from the mesh inside -->
  <RigidBody
    ref="box"
    type="dynamic"
    :position="position"
    :rotation="rotation"
    :mass="0.3"
    :restitution="0.2"
    :friction="0.8"
    :linear-damping="0.1"
    :angular-damping="0.8"
    enable-ccd
  >
    <TresMesh>
      <TresBoxGeometry :args="[0.1, 0.1, 0.1]" />
      <TresMeshStandardMaterial color="#3fae7c" :roughness="0.6" />
    </TresMesh>
  </RigidBody>
</template>
