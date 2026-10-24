import {
  BoxGeometry,
  EdgesGeometry,
  Mesh,
  MeshBasicMaterial,
  Ray,
  TorusGeometry,
  Vector3,
  type Object3D,
  type Scene,
} from 'three'
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js'
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js'
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js'
import { XR_CONFIG } from './config'
import type { Grabbable, GrabbableRegistry } from './grabbables'

/**
 * Head gaze with a reticle, and a pale yellow frame around the object being aimed at.
 *
 * WebXR does not give eye tracking (and Quest 3 has none), so the head's forward
 * direction stands in for the gaze. People look slightly below where their head points,
 * so it is tilted down by XR_CONFIG.gazePitchDownDeg, around the head's own right axis so
 * it stays "down in your view" even with the head tilted.
 *
 * An object counts as aimed at only when the gaze ray actually passes through its collider
 * box (grown by XR_CONFIG.gazeAimMargin). The reticle and the frame are only drawn while
 * the reticle is switched on.
 */
export function createGaze(scene: Scene, registry: GrabbableRegistry) {
  const reticleMaterial = new MeshBasicMaterial({
    color: XR_CONFIG.reticleColor,
    transparent: true,
    opacity: 0.9,
    // Drawn on top of everything, so the reticle never disappears inside an object
    depthTest: false,
  })
  const reticle = new Mesh(new TorusGeometry(0.012, 0.0025, 8, 32), reticleMaterial)
  reticle.renderOrder = 999
  reticle.visible = false
  scene.add(reticle)

  // The edges of a unit box, scaled each frame to the aimed object's bounding box.
  // Edges only: a wireframe box would also draw the diagonal of every face.
  // LineSegments2 rather than LineSegments: WebGL draws plain lines 1 pixel wide whatever
  // width is asked for. The width here is in metres, so it looks the same in the headset
  const frameMaterial = new LineMaterial({
    color: XR_CONFIG.highlightColor,
    transparent: true,
    opacity: XR_CONFIG.highlightOpacity,
    linewidth: XR_CONFIG.highlightLineWidth,
    worldUnits: true,
  })
  const edges = new EdgesGeometry(new BoxGeometry(1, 1, 1))
  const frame = new LineSegments2(new LineSegmentsGeometry().fromEdgesGeometry(edges), frameMaterial)
  edges.dispose()
  frame.visible = false
  scene.add(frame)

  const origin = new Vector3()
  const direction = new Vector3()
  const right = new Vector3()
  const ray = new Ray()
  const pitch = (XR_CONFIG.gazePitchDownDeg * Math.PI) / 180

  let aimed: Grabbable | null = null

  return {
    /** The object the gaze is on, or null. Updated whether or not the reticle is shown */
    get aimed() {
      return aimed
    },
    /** Gaze ray of the current frame: origin at the eyes, normalised direction */
    ray,

    /**
     * @param head    the eyes (camera convention: looks down -Z)
     * @param show    draw the reticle and the frame
     * @param anyHeld true while a hand holds an object. The reticle hides then
     */
    update(head: Object3D, show: boolean, anyHeld: boolean) {
      origin.copy(head.position)
      direction.set(0, 0, -1).applyQuaternion(head.quaternion)
      right.set(1, 0, 0).applyQuaternion(head.quaternion)
      direction.applyAxisAngle(right, -pitch).normalize()
      ray.set(origin, direction)

      // The nearest object the gaze ray passes through
      aimed = null
      let best = Infinity
      for (const item of registry.items.values()) {
        if (!item.options.grabbable || item.held) continue
        const d = registry.rayHitDistance(item, ray, XR_CONFIG.gazeAimMargin)
        if (d !== null && d < best) {
          best = d
          aimed = item
        }
      }

      reticle.visible = show && !anyHeld
      if (reticle.visible) {
        reticle.position.copy(origin).addScaledVector(direction, XR_CONFIG.reticleDistance)
        reticle.lookAt(origin)
        reticleMaterial.color.set(aimed ? XR_CONFIG.highlightColor : XR_CONFIG.reticleColor)
      }

      frame.visible = reticle.visible && !!aimed
      if (frame.visible && aimed) {
        // The collider's size, plus a hair so the lines are not buried in the faces.
        // A visibly larger frame no longer looks like it sits on the desk
        const h = aimed.halfExtents
        const s = aimed.scale * 2
        const gap = XR_CONFIG.highlightGap * 2
        registry.worldCenter(aimed, frame.position)
        frame.quaternion.copy(aimed.object.quaternion)
        frame.scale.set(h.x * s + gap, h.y * s + gap, h.z * s + gap)
      }
    },

    dispose() {
      scene.remove(reticle, frame)
      reticle.geometry.dispose()
      frame.geometry.dispose()
      reticleMaterial.dispose()
      frameMaterial.dispose()
    },
  }
}

export type Gaze = ReturnType<typeof createGaze>
