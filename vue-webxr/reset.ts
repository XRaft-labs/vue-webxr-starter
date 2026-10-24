import { Quaternion, Vector3, type Object3D, type Ray } from 'three'
import { XR_CONFIG } from './config'
import type { GrabbableRegistry } from './grabbables'
import type { Physics } from './physics'
import type { Planes } from './planes'
import type { Floor } from './floor'

/**
 * Put every grabbable object where the viewer is looking, and let it fall only once the
 * real desks are known.
 *
 * Placement: the gaze ray is cast against the desks and the floor. Objects are set down
 * just above the first surface it meets (within XR_CONFIG.resetMaxDistance). Looking into
 * the air, they appear XR_CONFIG.resetFallbackDistance along the gaze and fall from there.
 * With several objects, the first is placed at that point and the others keep their
 * authored offsets from it, turned to face the viewer.
 *
 * Waiting: right after a session starts, plane detection needs a moment before the desk
 * collider exists. An object released immediately falls through where the desk will be
 * and lands on the floor. So objects wait in the air until planes have arrived and
 * settled (or a timeout passes, for rooms without a scan or devices without the feature).
 */
export function createReset(
  registry: GrabbableRegistry,
  planes: Planes,
  physics: Physics,
  floor: Floor,
) {
  /** A reset was asked for and will run on the next frame with a valid head pose */
  let requested = false
  /** When the current wait started, or null when nothing is waiting */
  let waitingSince: number | null = null
  /** When planes were first seen during the current wait */
  let planesSince: number | null = null

  const forward = new Vector3()
  const yaw = new Quaternion()
  const up = new Vector3(0, 1, 0)
  const offset = new Vector3()
  const position = new Vector3()
  const quaternion = new Quaternion()

  /** Heading of the head around the vertical axis */
  function headYaw(head: Object3D): Quaternion {
    forward.set(0, 0, -1).applyQuaternion(head.quaternion)
    forward.y = 0
    // Looking straight up or down leaves no horizontal direction. Use the top of the head
    // instead: when you look down, it points the way you are facing
    if (forward.lengthSq() < 1e-4) {
      forward.set(0, 1, 0).applyQuaternion(head.quaternion)
      forward.y = 0
    }
    if (forward.lengthSq() < 1e-4) forward.set(0, 0, -1)
    forward.normalize()
    return yaw.setFromAxisAngle(up, Math.atan2(-forward.x, -forward.z))
  }

  const target = new Vector3()

  /**
   * Where the gaze meets a desk or the floor, or null. Grabbable objects are ignored,
   * so looking at the box itself still finds the surface behind it.
   *
   * The floor is ignored until its height is measured. Right after a session starts it
   * sits at y = 0, which on Quest is eye level, so the gaze would meet it at once and the
   * objects would appear at the camera. A surface closer than resetMinDistance is
   * ignored for the same reason
   */
  function gazeHit(ray: Ray): Vector3 | null {
    const { rapier, world } = physics
    const own = new Set<number>()
    for (const item of registry.items.values()) own.add(item.collider.handle)
    if (!floor.resolved) own.add(floor.collider.handle)
    const o = ray.origin
    const d = ray.direction
    const hit = world.castRay(
      new rapier.Ray({ x: o.x, y: o.y, z: o.z }, { x: d.x, y: d.y, z: d.z }),
      XR_CONFIG.resetMaxDistance,
      true,
      undefined,
      undefined,
      undefined,
      undefined,
      (collider) => !own.has(collider.handle),
    )
    if (!hit || hit.timeOfImpact < XR_CONFIG.resetMinDistance) return null
    return ray.at(hit.timeOfImpact, new Vector3())
  }

  function place(head: Object3D, ray: Ray, now: number) {
    const turn = headYaw(head)
    const items = Array.from(registry.items.values()).filter((item) => !item.held)
    if (items.length === 0) return
    const first = items[0]
    // Lowest point of the first object's box below its origin, so it is set down on top
    // of the surface rather than half inside it
    const firstBottom = first.halfExtents.y - first.centerOffset.y

    const hit = gazeHit(ray)
    if (hit) {
      target.copy(hit)
      target.y += firstBottom + XR_CONFIG.resetDropGap
    } else {
      target.copy(ray.origin).addScaledVector(ray.direction, XR_CONFIG.resetFallbackDistance)
    }

    for (const item of items) {
      // Offset from the first object as authored, turned to face the viewer
      offset.copy(item.authoredPosition).sub(first.authoredPosition).applyQuaternion(turn)
      position.copy(target).add(offset)
      quaternion.copy(turn).multiply(item.authoredQuaternion)
      registry.setScale(item, 1)
      registry.placeAndWait(item, position, quaternion)
    }
    waitingSince = now
    planesSince = null
  }

  function releaseAll() {
    for (const item of registry.items.values()) registry.release(item)
    waitingSince = null
    planesSince = null
  }

  return {
    /** Ask for a reset. It runs on the next frame, where the head pose is current */
    request() {
      requested = true
    },

    /**
     * Call every frame after the head pose is known.
     * @param head          the viewer pose (or the preview camera outside XR)
     * @param gazeRay       the gaze of this frame (see gaze.ts)
     * @param headValid     false until the headset has reported a pose
     * @param waitForPlanes true when plane detection is running and worth waiting for
     */
    update(head: Object3D, gazeRay: Ray, headValid: boolean, waitForPlanes: boolean) {
      const now = performance.now()
      if (requested && headValid) {
        requested = false
        place(head, gazeRay, now)
      }
      if (waitingSince === null) return
      if (!waitForPlanes) {
        releaseAll()
        return
      }
      if (planes.detected && planesSince === null) planesSince = now
      const settled = planesSince !== null && now - planesSince >= XR_CONFIG.planesSettleMs
      const timedOut = now - waitingSince >= XR_CONFIG.planesWaitMs
      if (settled || timedOut) releaseAll()
    },

    /** Objects are hanging in the air, waiting for planes */
    get waiting() {
      return waitingSince !== null
    },
  }
}

export type Reset = ReturnType<typeof createReset>
