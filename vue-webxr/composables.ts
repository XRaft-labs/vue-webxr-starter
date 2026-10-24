import { onBeforeUnmount, shallowRef, unref, watch, type Ref } from 'vue'
import type { Object3D } from 'three'
import type RAPIER from '@dimforge/rapier3d-compat'
import type { Grabbable, GrabbableOptions } from './grabbables'
import {
  onEmptyPinch,
  onFrame,
  onSceneReset,
  registerGrabbable,
  registerRigidBody,
  unregisterGrabbable,
  type EmptyPinchCallback,
  type FrameCallback,
} from './runtime'

/** What a template ref on @tresjs/rapier's <RigidBody> gives (its exposed fields) */
interface RigidBodyRef {
  instance: RAPIER.RigidBody | Ref<RAPIER.RigidBody | undefined> | undefined
  group: Object3D | Ref<Object3D | undefined> | undefined
}

function isRigidBodyRef(value: unknown): value is RigidBodyRef {
  return !!value && typeof value === 'object' && 'instance' in value && 'group' in value
}

/**
 * Wait until a <RigidBody> has created its body and its first collider.
 * Neither is reactive in the way a watch can see (the collider is made by a child
 * component, a tick later), so poll for a short while
 */
function whenRigidBodyReady(target: RigidBodyRef): Promise<{ group: Object3D; body: RAPIER.RigidBody }> {
  return new Promise((resolve, reject) => {
    const started = performance.now()
    const check = () => {
      const body = unref(target.instance)
      const group = unref(target.group)
      if (body && group && body.numColliders() > 0) return resolve({ group, body })
      if (performance.now() - started > 5000) return reject(new Error('<RigidBody> never got a collider'))
      setTimeout(check, 16)
    }
    check()
  })
}

/**
 * Make an object fall with gravity, collide with the floor and real desks, and be
 * grabbable with the hands. Use it with a template ref, either on a <RigidBody> from
 * @tresjs/rapier (the body and collider come from the tag):
 *
 * ```vue
 * <script setup lang="ts">
 * const box = shallowRef()
 * useGrabbable(box)
 * </script>
 * <template>
 *   <RigidBody ref="box" :position="[0, 1.2, -0.6]">
 *     <TresMesh>...</TresMesh>
 *   </RigidBody>
 * </template>
 * ```
 *
 * or directly on a mesh, in which case the starter creates a body and a box collider:
 *
 * ```vue
 * <script setup lang="ts">
 * const box = shallowRef<Mesh>()
 * useGrabbable(box, { mass: 0.3 })
 * </script>
 * <template>
 *   <TresMesh ref="box" :position="[0, 1.2, -0.6]">...</TresMesh>
 * </template>
 * ```
 *
 * Notes:
 * - The collider is a box fitted to the object's bounding box at the moment it is registered.
 * - From then on, physics owns the position and rotation. Set the starting pose with
 *   constant values; do not bind reactive state to :position / :rotation, or Vue will
 *   overwrite the physics pose whenever it re-renders.
 * - The object must be a direct child of the scene (not nested in a transformed group).
 */
export function useGrabbable(
  target: Ref<Object3D | RigidBodyRef | undefined | null>,
  options: GrabbableOptions = {},
) {
  const grabbable = shallowRef<Grabbable | null>(null)
  let disposed = false

  const stop = watch(
    target,
    async (object) => {
      if (!object || grabbable.value) return
      const item = isRigidBodyRef(object)
        ? await whenRigidBodyReady(object).then(({ group, body }) => registerRigidBody(group, body, options))
        : await registerGrabbable(object, options)
      if (disposed) {
        unregisterGrabbable(item)
        return
      }
      grabbable.value = item
    },
    { immediate: true },
  )

  onBeforeUnmount(() => {
    disposed = true
    stop()
    if (grabbable.value) unregisterGrabbable(grabbable.value)
    grabbable.value = null
  })

  return grabbable
}

/**
 * Run a callback every frame, in and out of XR. Removed automatically on unmount.
 *
 * Use this instead of TresJS's useLoop(): the starter drives rendering with
 * renderer.setAnimationLoop() so it also runs inside immersive sessions.
 */
export function useXRFrame(callback: FrameCallback) {
  const off = onFrame(callback)
  onBeforeUnmount(off)
}

/**
 * Run a callback after a single pinch (or trigger pull) in empty space, inside XR, with
 * the head pose. Removed automatically on unmount.
 *
 * "Empty" means no grabbable object was within reach of the fingertips. The callback
 * fires XR_CONFIG.multiPinchMs after the pinch, once it is clear that no second pinch
 * follows (two pinches reset the scene, three toggle the reticle).
 */
export function useEmptyPinch(callback: EmptyPinchCallback) {
  const off = onEmptyPinch(callback)
  onBeforeUnmount(off)
}

/**
 * Run a callback when the scene is reset (double pinch, A / X, resetScene(), and every
 * time a session starts), before the objects are put back in front of the viewer.
 * Use it to remove objects the app added. Removed automatically on unmount.
 */
export function useSceneReset(callback: () => void) {
  const off = onSceneReset(callback)
  onBeforeUnmount(off)
}
