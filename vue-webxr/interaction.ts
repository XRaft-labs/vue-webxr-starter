import { Quaternion, Vector3 } from 'three'
import { XR_CONFIG } from './config'
import type { Grabbable, GrabbableRegistry } from './grabbables'

/**
 * Pinch (or trigger) to grab, move and rotate objects; pinch with both hands to scale.
 * Let go gently and the object drops onto the desk or the floor; let go while swinging
 * the hand and it is thrown along the hand's path. In empty space, pinch twice to reset
 * and three times to toggle the reticle.
 *
 * Input: the `selectstart` / `selectend` events of the XRSession. These fire for every
 * kind of input in the same way:
 *   - a controller trigger (Quest 3)
 *   - a hand pinch with hand tracking (Quest 3, Android XR)
 *   - gaze + pinch, the "transient-pointer" that only exists while pinching
 *     (Apple Vision Pro, Android XR)
 * Listen on the session, not on Three.js controllers: transient pointers appear and
 * disappear mid-session and are not reliably bound to a controller index.
 *
 * None of the behaviour below comes from WebXR or Three.js. WebXR only reports where
 * the hands are and when a pinch starts and ends; everything else is implemented here.
 */

interface Hold {
  item: Grabbable
  /** Object position relative to the hand, in the hand's local axes at grab time */
  offset: Vector3
  handQuatAtGrab: Quaternion
  objectQuatAtGrab: Quaternion
}

interface TwoHandHold {
  startDistance: number
  startScale: number
  /** Object position minus the midpoint of the hands at the start */
  startOffset: Vector3
  /** Direction from the first hand to the second at the start */
  startDirection: Vector3
  startQuat: Quaternion
}

/** Recent hand positions, to measure the velocity at release */
interface Trail {
  samples: { time: number; position: Vector3 }[]
}

export interface HandPose {
  position: Vector3
  quaternion: Quaternion
}

const tmpQuat = new Quaternion()
const tmpQuat2 = new Quaternion()

/** Midpoint of the thumb tip and the index tip, or null when the joints are not tracked */
function readPinchPoint(hand: XRHand, frame: XRFrame, refSpace: XRReferenceSpace): Vector3 | null {
  const thumb = hand.get('thumb-tip')
  const index = hand.get('index-finger-tip')
  if (!thumb || !index || !frame.getJointPose) return null
  const a = frame.getJointPose(thumb, refSpace)
  const b = frame.getJointPose(index, refSpace)
  if (!a || !b) return null
  const pa = a.transform.position
  const pb = b.transform.position
  return new Vector3((pa.x + pb.x) / 2, (pa.y + pb.y) / 2, (pa.z + pb.z) / 2)
}

const tmpA = new Vector3()
const tmpB = new Vector3()
const tmpN = new Vector3()

/**
 * How much the palm of a tracked hand faces the eyes: 1 = straight at them, -1 = away,
 * null when the joints are not tracked. Quest opens its system menu when you pinch with
 * the palm turned to your face; such pinches must not count as the app's pinches.
 *
 * The palm normal is the cross product of wrist→index knuckle and wrist→little-finger
 * knuckle. It points out of the palm for a right hand and out of the back for a left one.
 *
 * `eyes` is the head position of the latest animation frame. Do not read it from the
 * event's frame with getViewerPose(): only frames passed to requestAnimationFrame allow
 * it. Quest's browser does not enforce this, Chrome on Android XR throws
 */
function palmTowardEyes(
  source: XRInputSource,
  frame: XRFrame,
  refSpace: XRReferenceSpace,
  eyes: Vector3 | null,
): number | null {
  const hand = source.hand
  if (!hand || !frame.getJointPose) return null
  const wrist = hand.get('wrist')
  const index = hand.get('index-finger-metacarpal')
  const pinky = hand.get('pinky-finger-metacarpal')
  if (!wrist || !index || !pinky) return null
  const w = frame.getJointPose(wrist, refSpace)
  const i = frame.getJointPose(index, refSpace)
  const p = frame.getJointPose(pinky, refSpace)
  if (!w || !i || !p || !eyes) return null
  const wp = w.transform.position
  tmpA.set(i.transform.position.x - wp.x, i.transform.position.y - wp.y, i.transform.position.z - wp.z)
  tmpB.set(p.transform.position.x - wp.x, p.transform.position.y - wp.y, p.transform.position.z - wp.z)
  tmpN.crossVectors(tmpA, tmpB).normalize()
  if (source.handedness === 'left') tmpN.negate()
  tmpA.set(eyes.x - wp.x, eyes.y - wp.y, eyes.z - wp.z).normalize()
  return tmpN.dot(tmpA)
}

/**
 * Where a hand or controller is.
 * Rotation: the grip pose (or the pointing ray when there is no grip).
 * Position: for a tracked hand, the pinch point between the fingertips, which is where
 * the object is actually held. The grip of a tracked hand is the middle of the palm.
 * For a controller, the grip pose
 */
function readHand(source: XRInputSource, frame: XRFrame, refSpace: XRReferenceSpace): HandPose | null {
  const pose = frame.getPose(source.gripSpace ?? source.targetRaySpace, refSpace)
  if (!pose) return null
  const p = pose.transform.position
  const o = pose.transform.orientation
  const pinch = source.hand ? readPinchPoint(source.hand, frame, refSpace) : null
  return {
    position: pinch ?? new Vector3(p.x, p.y, p.z),
    quaternion: new Quaternion(o.x, o.y, o.z, o.w),
  }
}

export interface InteractionOptions {
  /**
   * Called after pinches in empty space, with how many came in quick succession
   * (1 or more). See XR_CONFIG.multiPinchMs
   */
  onEmptyPinch?: (count: number) => void
  /** Head position of the latest frame, or null before the headset reports a pose */
  headPosition?: () => Vector3 | null
}

export function createInteraction(registry: GrabbableRegistry, options: InteractionOptions = {}) {
  const holds = new Map<XRInputSource, Hold>()
  const twoHands = new Map<Grabbable, TwoHandHold>()
  const trails = new Map<XRInputSource, Trail>()
  /** Quick pinches in empty space so far, and the timer that settles the count */
  let emptyPinches = 0
  let emptyPinchTimer: ReturnType<typeof setTimeout> | undefined

  function countEmptyPinch() {
    emptyPinches++
    clearTimeout(emptyPinchTimer)
    // Act only once no further pinch follows, so a triple pinch is not also a double
    emptyPinchTimer = setTimeout(() => {
      const count = emptyPinches
      emptyPinches = 0
      if (count >= 1) options.onEmptyPinch?.(count)
    }, XR_CONFIG.multiPinchMs)
  }

  /**
   * Hand velocity over the last XR_CONFIG.throwWindowMs, or null without enough samples.
   * Measured over a window rather than between the last two frames: the grip point
   * jumps a little as the fingers open, and a single frame would pick that up
   */
  function releaseVelocity(source: XRInputSource): Vector3 | null {
    const samples = trails.get(source)?.samples
    if (!samples || samples.length < 2) return null
    const last = samples[samples.length - 1]
    const first = samples.find((s) => last.time - s.time <= XR_CONFIG.throwWindowMs) ?? samples[0]
    const seconds = (last.time - first.time) / 1000
    if (seconds <= 0) return null
    return last.position.clone().sub(first.position).divideScalar(seconds)
  }

  function sourcesHolding(item: Grabbable): XRInputSource[] {
    const result: XRInputSource[] = []
    for (const [source, hold] of holds) if (hold.item === item) result.push(source)
    return result
  }

  function holdWithOneHand(source: XRInputSource, item: Grabbable, hand: HandPose) {
    // Store the offset in the hand's local axes. Re-applying the current hand rotation
    // every frame makes the object turn with the wrist, as if it were really held
    const inverse = tmpQuat.copy(hand.quaternion).invert()
    holds.set(source, {
      item,
      offset: item.object.position.clone().sub(hand.position).applyQuaternion(inverse),
      handQuatAtGrab: hand.quaternion.clone(),
      objectQuatAtGrab: item.object.quaternion.clone(),
    })
  }


  function onSelectStart(event: XRInputSourceEvent, refSpace: XRReferenceSpace) {
    const source = event.inputSource
    if (holds.has(source)) return
    const hand = readHand(source, event.frame, refSpace)
    if (!hand) return

    // A second hand pinches next to an object that is already held: start scaling.
    // Only when that hand is on the object (XR_CONFIG.twoHandJoinRadius)
    for (const [otherSource, hold] of holds) {
      const item = hold.item
      if (!item.options.scalable || twoHands.has(item)) continue
      if (registry.surfaceDistance(item, hand.position) > XR_CONFIG.twoHandJoinDistance) continue
      const other = readHand(otherSource, event.frame, refSpace)
      if (!other) continue
      const direction = hand.position.clone().sub(other.position)
      const distance = direction.length()
      twoHands.set(item, {
        startDistance: Math.max(distance, 0.01),
        startScale: item.scale,
        startOffset: item.object.position
          .clone()
          .sub(other.position.clone().add(hand.position).multiplyScalar(0.5)),
        startDirection: distance > 1e-4 ? direction.normalize() : new Vector3(1, 0, 0),
        startQuat: item.object.quaternion.clone(),
      })
      holds.set(source, { ...hold, offset: new Vector3() })
      // This hand may be the last to let go, so it needs a path too
      trails.set(source, { samples: [{ time: performance.now(), position: hand.position.clone() }] })
      return
    }

    // Grab the nearest free object within reach of the hand. An object another hand holds
    // is skipped: two hands moving it separately would make it jump back and forth
    const reach = source.hand ? XR_CONFIG.pinchGrabDistance : XR_CONFIG.controllerGrabDistance
    const item = registry.nearestTo(hand.position, reach, (candidate) => !candidate.held)
    if (!item) {
      // A pinch with the palm turned to the face opens the Quest menu: not for the app
      const palm = palmTowardEyes(source, event.frame, refSpace, options.headPosition?.() ?? null)
      if (palm !== null && palm > XR_CONFIG.menuPalmFacing) return
      // Nothing in reach. Counted: 1 is for the app, quick repeats are commands (reset, reticle)
      countEmptyPinch()
      return
    }
    // Kinematic while held: gravity stops and the object follows the hand exactly
    registry.setHeld(item, true)
    holdWithOneHand(source, item, hand)
    trails.set(source, { samples: [{ time: performance.now(), position: hand.position.clone() }] })
  }

  /** Let go with one hand. The object falls once no hand holds it any more */
  function release(source: XRInputSource, frame: XRFrame | null, refSpace: XRReferenceSpace | null) {
    const hold = holds.get(source)
    if (!hold) return
    holds.delete(source)
    const item = hold.item
    const remaining = sourcesHolding(item)

    if (twoHands.has(item)) {
      twoHands.delete(item)
      // Back to one hand: re-attach to the remaining hand where the object is now,
      // otherwise it would jump back to the old offset
      const [other] = remaining
      const otherHand = other && frame && refSpace ? readHand(other, frame, refSpace) : null
      if (otherHand) holdWithOneHand(other, item, otherHand)
    }

    // No hand left: back to a dynamic body
    if (remaining.length === 0) {
      const velocity = releaseVelocity(source)
      registry.setHeld(item, false)
      // Thrown only above XR_CONFIG.throwMinSpeed. The hand is never perfectly still when
      // the fingers open; passing that small velocity on makes a gently placed object
      // slide across the desk, so below the threshold it drops straight down
      const speed = velocity ? velocity.length() : 0
      if (velocity && speed >= XR_CONFIG.throwMinSpeed) {
        velocity.multiplyScalar(XR_CONFIG.throwVelocityScale).clampLength(0, XR_CONFIG.throwMaxSpeed)
        item.body.setLinvel({ x: velocity.x, y: velocity.y, z: velocity.z }, true)
      }
      if (import.meta.env.DEV) {
        console.info(`[grab] released at ${speed.toFixed(2)} m/s: ${speed >= XR_CONFIG.throwMinSpeed ? 'thrown' : 'dropped'}`)
      }
    }
    trails.delete(source)
  }

  function onSelectEnd(event: XRInputSourceEvent, refSpace: XRReferenceSpace) {
    release(event.inputSource, event.frame, refSpace)
  }

  /**
   * A hand or controller went away (tracking lost, controller put down) without a
   * selectend. Without this, the object would stay frozen in the air where it was held
   */
  function onSourcesRemoved(removed: readonly XRInputSource[]) {
    for (const source of removed) release(source, null, null)
  }

  /**
   * Move held objects to follow the hands. Call every XR frame BEFORE stepping physics:
   * kinematic targets set here are reached during the next step.
   * The mesh is moved too, so it follows the hand even on frames with no physics step.
   */
  function update(frame: XRFrame, refSpace: XRReferenceSpace) {
    // Record the path of every holding hand, for the release velocity
    const now = performance.now()
    for (const [source, trail] of trails) {
      const hand = readHand(source, frame, refSpace)
      if (!hand) continue
      trail.samples.push({ time: now, position: hand.position })
      // Keep a little more than the window
      while (trail.samples.length > 2 && now - trail.samples[0].time > XR_CONFIG.throwWindowMs * 2) {
        trail.samples.shift()
      }
    }

    const done = new Set<Grabbable>()
    for (const [source, hold] of holds) {
      const item = hold.item
      if (done.has(item)) continue
      done.add(item)
      // The object was removed while held (forget() was not called). Its body may be
      // freed already, and moving a freed body makes Rapier abort with "unreachable"
      if (registry.items.get(item.id) !== item) {
        console.warn(`[grab] dropped a hold on a removed object (${source.handedness})`)
        forget(item)
        continue
      }

      const two = twoHands.get(item)
      const sources = sourcesHolding(item)
      let position: Vector3
      let quaternion: Quaternion

      if (two && sources.length >= 2) {
        const a = readHand(sources[0], frame, refSpace)
        const b = readHand(sources[1], frame, refSpace)
        if (!a || !b) continue
        const direction = b.position.clone().sub(a.position)
        const distance = direction.length()
        // Scale by the change in distance between the hands
        const ratio = distance / two.startDistance
        const scale = Math.min(XR_CONFIG.maxScale, Math.max(XR_CONFIG.minScale, two.startScale * ratio))
        registry.setScale(item, scale)
        // Rotate by the change in direction between the hands
        const turn = tmpQuat.setFromUnitVectors(
          two.startDirection,
          distance > 1e-4 ? direction.normalize() : two.startDirection,
        )
        quaternion = turn.clone().multiply(two.startQuat)
        // The offset from the midpoint turns and grows with the object
        const offset = two.startOffset.clone().applyQuaternion(turn).multiplyScalar(scale / two.startScale)
        position = a.position.clone().add(b.position).multiplyScalar(0.5).add(offset)
      } else {
        const hand = readHand(source, frame, refSpace)
        if (!hand) continue
        // Rotation since the grab, applied to the object's rotation at the grab
        const turn = tmpQuat.copy(hand.quaternion).multiply(tmpQuat2.copy(hold.handQuatAtGrab).invert())
        quaternion = turn.clone().multiply(hold.objectQuatAtGrab)
        position = hold.offset.clone().applyQuaternion(hand.quaternion).add(hand.position)
      }

      // A NaN pose also makes Rapier abort with "unreachable". Skip the frame instead
      if (
        ![position.x, position.y, position.z, quaternion.x, quaternion.y, quaternion.z, quaternion.w].every(
          Number.isFinite,
        )
      ) {
        console.warn(`[grab] skipped a frame with a non-finite pose (${source.handedness})`)
        continue
      }
      item.body.setNextKinematicTranslation({ x: position.x, y: position.y, z: position.z })
      item.body.setNextKinematicRotation({
        x: quaternion.x,
        y: quaternion.y,
        z: quaternion.z,
        w: quaternion.w,
      })
      item.object.position.copy(position)
      item.object.quaternion.copy(quaternion)
    }
  }

  /**
   * Stop holding an object without releasing it into the world. Call before the object is
   * removed: its body is about to be freed, and moving it afterwards aborts Rapier
   */
  function forget(item: Grabbable) {
    for (const [source, hold] of holds) {
      if (hold.item !== item) continue
      holds.delete(source)
      trails.delete(source)
    }
    twoHands.delete(item)
  }

  return {
    onSelectStart,
    onSelectEnd,
    onSourcesRemoved,
    update,
    forget,
    get anyHeld() {
      return holds.size > 0
    },
    /**
     * Forget pinches that have not been acted on yet. Call when the session loses focus:
     * the pinch that opened the system menu must not add a box or reset the scene
     */
    cancelEmptyPinches() {
      clearTimeout(emptyPinchTimer)
      emptyPinches = 0
    },
    /** Drop everything. Call when the session ends */
    reset() {
      for (const hold of holds.values()) registry.setHeld(hold.item, false)
      holds.clear()
      twoHands.clear()
      trails.clear()
      clearTimeout(emptyPinchTimer)
      emptyPinches = 0
    },
  }
}

export type Interaction = ReturnType<typeof createInteraction>
