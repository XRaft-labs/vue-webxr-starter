import { ref } from 'vue'
import type RAPIER from '@dimforge/rapier3d-compat'
import { XR_CONFIG } from './config'
import type { Physics } from './physics'

/**
 * A large static floor collider, and the logic that decides how high the floor is.
 *
 * Why this is not simply y = 0:
 * With the 'local-floor' reference space, y = 0 should be the real floor. In practice
 * some runtimes place the origin at eye level even when 'local-floor' is granted, and
 * then objects stop in mid-air at eye height. So the height is measured instead:
 *
 * 1. If the head is ever seen well above y = 0, the origin is on the floor.
 * 2. If the head stays near y = 0 for a while, the origin is at eye level, so the floor
 *    is placed XR_CONFIG.floorFallbackBelowEye below the eyes.
 * 3. A detected plane labelled "floor" overrides both, because it is measured directly.
 *
 * Do not decide on the first frame: the head pose takes a few frames to arrive and
 * reads y = 0 until then, which always looks like case 2.
 */
export function createFloor(physics: Physics) {
  const { rapier, world } = physics
  const half = XR_CONFIG.floorThickness / 2

  /** World height of the top of the floor (m) */
  const floorY = ref(0)
  /** Why floorY has its current value. Handy on a debug panel */
  const source = ref('not measured yet')

  const body: RAPIER.RigidBody = world.createRigidBody(
    rapier.RigidBodyDesc.fixed().setTranslation(0, -half, 0),
  )
  const collider = world.createCollider(
    rapier.ColliderDesc.cuboid(50, half, 50)
      .setFriction(XR_CONFIG.surfaceFriction)
      .setRestitution(XR_CONFIG.surfaceRestitution)
      .setRestitutionCombineRule(rapier.CoefficientCombineRule.Min),
    body,
  )

  let resolved = false
  let waitedFrames = 0
  let maxCameraY = 0

  function setFloor(y: number, why: string) {
    floorY.value = y
    source.value = why
    // Keep the top face at floorY
    body.setTranslation({ x: 0, y: y - half, z: 0 }, true)
  }

  return {
    floorY,
    source,
    /** The floor's collider */
    collider,
    /**
     * The floor height has been measured in this session. Until then the collider sits at
     * y = 0, which on some runtimes is eye level
     */
    get resolved() {
      return resolved
    },

    /** Start measuring again. Call when a session starts: the reference space may differ */
    reset() {
      resolved = false
      waitedFrames = 0
      maxCameraY = 0
      setFloor(0, 'measuring')
    },

    /** Call every XR frame with the camera height until the floor is known */
    update(cameraY: number) {
      if (resolved) return
      waitedFrames++
      maxCameraY = Math.max(maxCameraY, cameraY)
      if (maxCameraY > XR_CONFIG.floorEyeMin) {
        setFloor(0, 'reference space origin is on the floor')
      } else if (waitedFrames >= XR_CONFIG.floorWaitFrames) {
        setFloor(cameraY - XR_CONFIG.floorFallbackBelowEye, 'origin at eye level, floor estimated')
      } else {
        return
      }
      resolved = true
    },

    /** Call with the height of a plane labelled "floor" */
    applyDetectedFloor(y: number, cameraY: number) {
      // A "floor" right below the eyes is a desk. Using it would raise the floor everywhere
      if (cameraY - y < XR_CONFIG.floorMinBelowEye) return
      // Ignore jitter; moving the collider every frame would disturb resting objects
      if (resolved && Math.abs(y - floorY.value) < 0.02) return
      setFloor(y, 'detected floor plane')
      resolved = true
    },
  }
}

export type Floor = ReturnType<typeof createFloor>
