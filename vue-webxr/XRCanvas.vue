<script setup lang="ts">
import { TresCanvas } from '@tresjs/core'
import { Physics } from '@tresjs/rapier'
import { XR_CONFIG } from './config'
import XRPhysicsBridge from './XRPhysicsBridge.vue'

/**
 * Drop-in replacement for <TresCanvas> that adds WebXR: the AR / VR buttons, physics,
 * plane detection and grabbing with hands or controllers. Put your scene in the default slot.
 *
 * Physics is @tresjs/rapier's <Physics>, so <RigidBody> and the collider tags can be used
 * in the slot. <Physics> loads Rapier asynchronously and must sit inside <Suspense>.
 */
const gravity: [number, number, number] = [0, XR_CONFIG.gravity, 0]
const timeStep = 1 / XR_CONFIG.physicsHz
</script>

<template>
  <!-- render-mode="manual": the starter renders every frame itself (also inside XR, where
       TresJS's loop does not run). TresJS's loop, when it runs, only fires its hooks -->
  <TresCanvas window-size :alpha="true" :antialias="true" clear-color="#0b0f17" render-mode="manual">
    <Suspense>
      <Physics :gravity="gravity" :time-step="timeStep">
        <XRPhysicsBridge />
        <slot />
      </Physics>
    </Suspense>
  </TresCanvas>
</template>
