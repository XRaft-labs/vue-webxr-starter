import { Box3, Quaternion, Ray, Vector3, type Object3D } from 'three'
import type RAPIER from '@dimforge/rapier3d-compat'
import type { Physics } from './physics'

export interface GrabbableOptions {
  /** Mass in kg. Defaults to a value derived from the bounding box size */
  mass?: number
  /** Bounciness, 0 to 1 */
  restitution?: number
  friction?: number
  /** Can it be picked up with the hands? Defaults to true */
  grabbable?: boolean
  /** Can it be scaled with a two-hand pinch? Defaults to true */
  scalable?: boolean
}

/**
 * An Object3D driven by a Rapier rigid body.
 *
 * The collider is a box fitted to the object's bounding box, so any mesh or loaded
 * model gets a reasonable collision shape without writing one by hand.
 */
export interface Grabbable {
  readonly id: number
  readonly object: Object3D
  readonly body: RAPIER.RigidBody
  readonly collider: RAPIER.Collider
  readonly options: Required<GrabbableOptions>
  /** Half size of the bounding box at scale 1, in the object's own axes (m) */
  readonly halfExtents: Vector3
  /** Centre of the bounding box relative to the object origin at scale 1 */
  readonly centerOffset: Vector3
  /** The object's scale when it was registered. User scaling multiplies this */
  readonly baseScale: Vector3
  /** Current user scale (1 = as authored) */
  scale: number
  /** True while at least one hand holds it */
  held: boolean
  /**
   * The body belongs to a <RigidBody> from @tresjs/rapier rather than to the starter.
   * The starter never removes it; the component does when it unmounts
   */
  readonly adopted: boolean
  /**
   * True while it waits in the air after a spawn or reset, until the desks have been
   * detected. Kinematic like a held object, but no hand moves it
   */
  waiting: boolean
  /** Pose written in the scene, used by reset to place it again relative to the head */
  readonly authoredPosition: Vector3
  readonly authoredQuaternion: Quaternion
}

let nextId = 1
const tmpBox = new Box3()
const tmpVec = new Vector3()

/**
 * Measure the bounding box in the object's own axes.
 *
 * Box3.setFromObject() returns a world-aligned box. For a rotated object that box is
 * larger than the object itself, so the rotation is removed while measuring.
 * The object must be a direct child of the scene (no transformed parents).
 */
function measure(object: Object3D): { half: Vector3; center: Vector3 } {
  const position = object.position.clone()
  const quaternion = object.quaternion.clone()
  object.position.set(0, 0, 0)
  object.quaternion.identity()
  object.updateMatrixWorld(true)
  tmpBox.setFromObject(object, true)
  object.position.copy(position)
  object.quaternion.copy(quaternion)
  object.updateMatrixWorld(true)

  if (tmpBox.isEmpty()) {
    // Nothing to measure (an empty group). Fall back to a 10 cm box
    return { half: new Vector3(0.05, 0.05, 0.05), center: new Vector3() }
  }
  const half = tmpBox.getSize(new Vector3()).multiplyScalar(0.5)
  // Very thin objects (a plane) would get a zero-thickness collider and fall through
  half.max(new Vector3(0.005, 0.005, 0.005))
  return { half, center: tmpBox.getCenter(new Vector3()) }
}

export function createGrabbableRegistry(physics: Physics) {
  const items = new Map<number, Grabbable>()
  const { rapier, world } = physics

  function add(object: Object3D, opts: GrabbableOptions = {}): Grabbable {
    const { half, center } = measure(object)
    const volume = half.x * half.y * half.z * 8
    const options: Required<GrabbableOptions> = {
      // Default density of about 500 kg/m^3 (wood). Too light and a hand nudge sends it flying
      mass: opts.mass ?? Math.max(0.05, volume * 500),
      restitution: opts.restitution ?? 0.2,
      friction: opts.friction ?? 0.8,
      grabbable: opts.grabbable ?? true,
      scalable: opts.scalable ?? true,
    }

    const p = object.position
    const q = object.quaternion
    const body = world.createRigidBody(
      rapier.RigidBodyDesc.dynamic()
        .setTranslation(p.x, p.y, p.z)
        .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w })
        .setLinearDamping(0.1)
        // A little more than Rapier's default, so a dropped box settles instead of
        // tumbling on across the floor
        .setAngularDamping(0.8)
        // Continuous collision detection: a dropped object cannot pass through a thin desk
        .setCcdEnabled(true),
    )
    const collider = world.createCollider(
      rapier.ColliderDesc.cuboid(half.x, half.y, half.z)
        .setTranslation(center.x, center.y, center.z)
        .setMass(options.mass)
        .setRestitution(options.restitution)
        .setFriction(options.friction),
      body,
    )

    const item: Grabbable = {
      id: nextId++,
      object,
      body,
      collider,
      options,
      halfExtents: half,
      centerOffset: center,
      baseScale: object.scale.clone(),
      scale: 1,
      held: false,
      adopted: false,
      waiting: false,
      authoredPosition: object.position.clone(),
      authoredQuaternion: object.quaternion.clone(),
    }
    items.set(item.id, item)
    return item
  }

  /**
   * Make an existing body grabbable: the one a <RigidBody> created, with its collider.
   * `group` is the component's group, the object whose pose follows the body
   */
  function adopt(group: Object3D, body: RAPIER.RigidBody, opts: GrabbableOptions = {}): Grabbable {
    const collider = body.collider(0)
    const { half, center } = measure(group)
    const item: Grabbable = {
      id: nextId++,
      object: group,
      body,
      collider,
      options: {
        // Mass, bounciness and friction are props of the <RigidBody>; these are unused
        mass: 0,
        restitution: 0,
        friction: 0,
        grabbable: opts.grabbable ?? true,
        scalable: opts.scalable ?? true,
      },
      halfExtents: half,
      centerOffset: center,
      baseScale: group.scale.clone(),
      scale: 1,
      held: false,
      adopted: true,
      waiting: false,
      authoredPosition: group.position.clone(),
      authoredQuaternion: group.quaternion.clone(),
    }
    items.set(item.id, item)
    return item
  }

  function remove(item: Grabbable) {
    if (!items.delete(item.id)) return
    if (!item.adopted) world.removeRigidBody(item.body)
  }

  /** Kinematic (no gravity, moved by code) or dynamic (falls and collides) */
  function setKinematic(item: Grabbable, kinematic: boolean) {
    item.body.setBodyType(
      kinematic ? rapier.RigidBodyType.KinematicPositionBased : rapier.RigidBodyType.Dynamic,
      true,
    )
    if (!kinematic) {
      item.body.setLinvel({ x: 0, y: 0, z: 0 }, true)
      item.body.setAngvel({ x: 0, y: 0, z: 0 }, true)
    }
  }

  /** Switch between "held by a hand" (kinematic, no gravity) and "free" (dynamic) */
  function setHeld(item: Grabbable, held: boolean) {
    item.held = held
    item.waiting = false
    setKinematic(item, held)
  }

  /**
   * Put the object at a pose and keep it there, in the air, until `release()` is called.
   * Used by reset: objects wait for the desks to be detected before they fall
   */
  function placeAndWait(item: Grabbable, position: Vector3, quaternion: Quaternion) {
    item.held = false
    item.waiting = true
    setKinematic(item, true)
    item.body.setTranslation({ x: position.x, y: position.y, z: position.z }, true)
    item.body.setRotation({ x: quaternion.x, y: quaternion.y, z: quaternion.z, w: quaternion.w }, true)
    item.object.position.copy(position)
    item.object.quaternion.copy(quaternion)
  }

  /** Let a waiting object fall */
  function release(item: Grabbable) {
    if (!item.waiting) return
    item.waiting = false
    setKinematic(item, false)
  }

  /** Apply a user scale to the mesh and to the collider together */
  function setScale(item: Grabbable, scale: number) {
    if (scale === item.scale) return
    item.scale = scale
    const h = item.halfExtents
    const c = item.centerOffset
    item.collider.setHalfExtents({ x: h.x * scale, y: h.y * scale, z: h.z * scale })
    item.collider.setTranslationWrtParent({ x: c.x * scale, y: c.y * scale, z: c.z * scale })
    item.object.scale.copy(item.baseScale).multiplyScalar(scale)
  }

  /** Handles of the bodies this registry keeps in sync (see syncFromPhysics) */
  function bodyHandles(): Set<number> {
    const handles = new Set<number>()
    for (const item of items.values()) handles.add(item.body.handle)
    return handles
  }

  /**
   * Copy body poses to the meshes. Call once per frame after stepping.
   * Held objects are skipped: the hand code moves their meshes directly, so they keep
   * following the hand even on frames where no physics step ran.
   *
   * <RigidBody> groups are copied here too. @tresjs/rapier copies them itself, but only
   * from TresJS's useLoop(), which runs on window.requestAnimationFrame and stops inside
   * an immersive session
   */
  function syncFromPhysics() {
    for (const item of items.values()) {
      if (item.held) continue
      const t = item.body.translation()
      const r = item.body.rotation()
      item.object.position.set(t.x, t.y, t.z)
      item.object.quaternion.set(r.x, r.y, r.z, r.w)
    }
  }

  /** World position of the bounding box centre */
  function worldCenter(item: Grabbable, out: Vector3): Vector3 {
    return out
      .copy(item.centerOffset)
      .multiplyScalar(item.scale)
      .applyQuaternion(item.object.quaternion)
      .add(item.object.position)
  }

  /** Rough radius: the longest half extent. Used to measure distance to the surface */
  function radius(item: Grabbable): number {
    const h = item.halfExtents
    return Math.max(h.x, h.y, h.z) * item.scale
  }

  const localPoint = new Vector3()
  const localRay = new Ray()
  const inverseRotation = new Quaternion()
  const localBox = new Box3()
  const hitPoint = new Vector3()

  /** The collider box in the object's own axes, centred on the origin of `toLocal` */
  function setLocalBox(item: Grabbable, margin: number) {
    const h = item.halfExtents
    const s = item.scale
    localBox.min.set(-h.x * s - margin, -h.y * s - margin, -h.z * s - margin)
    localBox.max.set(h.x * s + margin, h.y * s + margin, h.z * s + margin)
  }

  /** A world point in the collider box's own axes, relative to the box centre */
  function toLocal(item: Grabbable, point: Vector3, out: Vector3): Vector3 {
    inverseRotation.copy(item.object.quaternion).invert()
    return out.copy(point).sub(worldCenter(item, tmpVec)).applyQuaternion(inverseRotation)
  }

  /**
   * Distance from a point to the surface of the object's collider box (0 inside it).
   * Measured against the real box, not a bounding sphere: a sphere wide enough to cover the
   * corners reaches far past the faces, and objects could be grabbed from 30 cm away
   */
  function surfaceDistance(item: Grabbable, point: Vector3): number {
    setLocalBox(item, 0)
    return localBox.distanceToPoint(toLocal(item, point, localPoint))
  }

  /**
   * Distance along the ray to where it enters the collider box (grown by `margin`),
   * or null when the ray misses it
   */
  function rayHitDistance(item: Grabbable, ray: Ray, margin = 0): number | null {
    setLocalBox(item, margin)
    toLocal(item, ray.origin, localRay.origin)
    inverseRotation.copy(item.object.quaternion).invert()
    localRay.direction.copy(ray.direction).applyQuaternion(inverseRotation)
    const hit = localRay.intersectBox(localBox, hitPoint)
    return hit ? hit.distanceTo(localRay.origin) : null
  }

  /**
   * Nearest grabbable whose surface is within maxDistance of a point, or null.
   * `accept` can rule candidates out (for example objects that are already held)
   */
  function nearestTo(
    point: Vector3,
    maxDistance: number,
    accept: (item: Grabbable) => boolean = () => true,
  ): Grabbable | null {
    let best: Grabbable | null = null
    let bestDistance = maxDistance
    for (const item of items.values()) {
      if (!item.options.grabbable || !accept(item)) continue
      const d = surfaceDistance(item, point)
      if (d <= bestDistance) {
        best = item
        bestDistance = d
      }
    }
    return best
  }

  function clear() {
    for (const item of Array.from(items.values())) remove(item)
  }

  return {
    items,
    add,
    remove,
    adopt,
    setHeld,
    placeAndWait,
    release,
    setScale,
    syncFromPhysics,
    bodyHandles,
    worldCenter,
    radius,
    surfaceDistance,
    rayHitDistance,
    nearestTo,
    clear,
  }
}

export type GrabbableRegistry = ReturnType<typeof createGrabbableRegistry>
