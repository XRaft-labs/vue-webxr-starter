import {
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  Quaternion,
  Shape,
  ShapeGeometry,
  Vector3,
  type Scene,
} from 'three'
import type RAPIER from '@dimforge/rapier3d-compat'
import { XR_CONFIG } from './config'
import type { Physics } from './physics'

/**
 * Turns horizontal planes from WebXR plane detection (floor, desks, shelves) into
 * static physics colliders, so objects land on the real desk instead of falling
 * through it to the floor. Each plane is also drawn as a translucent green overlay.
 *
 * Requirements:
 * - The session must have the 'plane-detection' feature (requested in XR_CONFIG.arFeatures).
 *   Without it, frame.detectedPlanes is undefined and this module does nothing.
 * - On Quest 3, the room must be scanned in Settings > Physical space > Space setup,
 *   with the desk registered as a desk. Without a scan, no planes are reported.
 *
 * Shape: the plane polygon itself is extruded into a convex prism. A bounding
 * rectangle would extend past the corners of the desk (or into the wall behind it) and
 * objects would stop in mid-air there.
 */

const ORIENTATION: XRPlaneOrientation = 'horizontal'
/** Never make colliders from these: an invisible lid overhead traps objects */
const SKIP_LABELS = new Set(['ceiling'])
/**
 * Only planes explicitly labelled as floor are treated as the floor.
 * Do not guess "the lowest plane is the floor": when you sit at a desk the floor is
 * often not detected, the desk becomes the lowest plane, and the floor would jump up.
 */
const FLOOR_LABELS = new Set(['floor', 'ground'])

interface Outline {
  points: { x: number; z: number }[]
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}

interface Entry {
  body: RAPIER.RigidBody
  group: Group
  mesh: Mesh
  outline: Outline
  lastChangedTime: number
  label: string
  worldY: number
  /** Pose last written to the collider, or null before the first frame */
  applied: { position: Vector3; quaternion: Quaternion } | null
}

type Point2 = { x: number; z: number }

/** Convex hull of 2D points, counter-clockwise (Andrew's monotone chain) */
function convexHull2(input: Point2[]): Point2[] {
  const pts = [...input].sort((a, b) => a.x - b.x || a.z - b.z)
  if (pts.length < 3) return pts
  const cross = (o: Point2, a: Point2, b: Point2) => (a.x - o.x) * (b.z - o.z) - (a.z - o.z) * (b.x - o.x)
  const lower: Point2[] = []
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop()
    lower.push(p)
  }
  const upper: Point2[] = []
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i]
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop()
    upper.push(p)
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1))
}

/** Distance from p to the line through a and b */
function lineDistance(p: Point2, a: Point2, b: Point2): number {
  const dx = b.x - a.x
  const dz = b.z - a.z
  const len = Math.hypot(dx, dz)
  if (len < 1e-9) return Math.hypot(p.x - a.x, p.z - a.z)
  return Math.abs((p.x - a.x) * dz - (p.z - a.z) * dx) / len
}

/**
 * Turn a reported outline into a clean convex polygon for the collider.
 *
 * Android XR reports desks as 10+ point outlines with points a centimetre apart and
 * points almost on the line between their neighbours. A convex hull collider built from
 * them has tiny, nearly flat faces, and a box resting on it never settles: measured on
 * an XREAL Aura, it sank 1.4 cm into the desk and kept rocking. Quest reports clean
 * rectangles, which this leaves as they are.
 */
function simplifyOutline(points: Point2[]): Point2[] {
  let hull = convexHull2(points)
  const merge = XR_CONFIG.planeOutlineMerge
  // Merge points closer than `merge` to the previous one
  hull = hull.filter((p, i) => {
    if (i === 0) return true
    const prev = hull[i - 1]
    return Math.hypot(p.x - prev.x, p.z - prev.z) >= merge
  })
  if (hull.length > 3) {
    const f = hull[0]
    const l = hull[hull.length - 1]
    if (Math.hypot(f.x - l.x, f.z - l.z) < merge) hull.pop()
  }
  // Drop points that barely bend the outline, one at a time, until none is left
  let removed = true
  while (removed && hull.length > 3) {
    removed = false
    for (let i = 0; i < hull.length; i++) {
      const prev = hull[(i - 1 + hull.length) % hull.length]
      const next = hull[(i + 1) % hull.length]
      if (lineDistance(hull[i], prev, next) < XR_CONFIG.planeOutlineFlatness) {
        hull.splice(i, 1)
        removed = true
        break
      }
    }
  }
  return hull
}

/**
 * Smallest rectangle around a convex polygon. One of its sides lies along an edge of the
 * polygon, so trying every edge direction finds it. `angle` is the direction of the U side
 * in the X-Z plane, measured from +X towards +Z
 */
function smallestRectangle(points: Point2[]) {
  let best = { area: Infinity, angle: 0, centerX: 0, centerZ: 0, halfU: 0, halfV: 0 }
  for (let i = 0; i < points.length; i++) {
    const a = points[i]
    const b = points[(i + 1) % points.length]
    const angle = Math.atan2(b.z - a.z, b.x - a.x)
    const c = Math.cos(angle)
    const s = Math.sin(angle)
    let minU = Infinity
    let maxU = -Infinity
    let minV = Infinity
    let maxV = -Infinity
    for (const p of points) {
      const u = p.x * c + p.z * s
      const v = -p.x * s + p.z * c
      minU = Math.min(minU, u)
      maxU = Math.max(maxU, u)
      minV = Math.min(minV, v)
      maxV = Math.max(maxV, v)
    }
    const area = (maxU - minU) * (maxV - minV)
    if (area >= best.area) continue
    const cu = (minU + maxU) / 2
    const cv = (minV + maxV) / 2
    best = {
      area,
      angle,
      centerX: cu * c - cv * s,
      centerZ: cu * s + cv * c,
      halfU: (maxU - minU) / 2,
      halfV: (maxV - minV) / 2,
    }
  }
  return best
}

/** Read the polygon (X-Z plane of planeSpace). Returns null for degenerate shapes */
function readOutline(polygon: DOMPointReadOnly[]): Outline | null {
  if (!polygon || polygon.length < 3) return null
  const points = simplifyOutline(polygon.map((p) => ({ x: p.x, z: p.z })))
  if (points.length < 3) return null
  const xs = points.map((p) => p.x)
  const zs = points.map((p) => p.z)
  const outline = {
    points,
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minZ: Math.min(...zs),
    maxZ: Math.max(...zs),
  }
  // Skip slivers
  if (outline.maxX - outline.minX < 0.02 || outline.maxZ - outline.minZ < 0.02) return null
  return outline
}

/** True when the outline's bounds moved by more than XR_CONFIG.planeRebuildThreshold */
function outlineChanged(a: Outline, b: Outline): boolean {
  const t = XR_CONFIG.planeRebuildThreshold
  return (
    Math.abs(a.minX - b.minX) > t ||
    Math.abs(a.maxX - b.maxX) > t ||
    Math.abs(a.minZ - b.minZ) > t ||
    Math.abs(a.maxZ - b.maxZ) > t
  )
}

const up = new Vector3()
const poseQuat = new Quaternion()
const turnCos = Math.cos(((XR_CONFIG.planeTurnThresholdDeg / 2) * Math.PI) / 180)

export function createPlanes(scene: Scene, physics: Physics) {
  const { rapier, world } = physics
  const entries = new Map<XRPlane, Entry>()
  /** True once any plane has been reported in this session */
  let everDetected = false

  function destroy(plane: XRPlane, entry: Entry) {
    world.removeRigidBody(entry.body)
    scene.remove(entry.group)
    entry.mesh.geometry.dispose()
    ;(entry.mesh.material as MeshBasicMaterial).dispose()
    entries.delete(plane)
  }

  /**
   * @param flipped The plane's local +Y points down in the world. Quest 3 reports desks
   *   and floors this way. The prism must then grow along +Y: grown along -Y it would
   *   stand on top of the surface, and objects would rest 10 cm above the real desk
   */
  function create(plane: XRPlane, outline: Outline, flipped: boolean): Entry | null {
    const label = plane.semanticLabel ?? 'unlabeled'

    // A box: top face at y = 0 of planeSpace, extruded away from the room by planeThickness,
    // covering the smallest rectangle around the outline.
    // ★Not a convex hull of the outline. On an XREAL Aura (Android XR) a 2.3 x 1.2 m desk
    //   came as a hull, and boxes set down away from its middle sank 1.3 cm into it and
    //   kept rocking, while the same boxes settled on the floor (a box collider). Box on
    //   box contact is the most stable Rapier has. Quest reports rectangles anyway
    const depth = flipped ? XR_CONFIG.planeThickness : -XR_CONFIG.planeThickness
    const rect = smallestRectangle(outline.points)
    const desc = rapier.ColliderDesc.cuboid(rect.halfU, XR_CONFIG.planeThickness / 2, rect.halfV)
      .setTranslation(rect.centerX, depth / 2, rect.centerZ)
      // Turn the box's X axis onto the rectangle's long side (about +Y, by -angle)
      .setRotation({ x: 0, y: Math.sin(-rect.angle / 2), z: 0, w: Math.cos(-rect.angle / 2) })

    const body = world.createRigidBody(rapier.RigidBodyDesc.fixed())
    world.createCollider(
      desc
        .setFriction(XR_CONFIG.surfaceFriction)
        .setRestitution(XR_CONFIG.surfaceRestitution)
        .setRestitutionCombineRule(rapier.CoefficientCombineRule.Min),
      body,
    )

    // Translucent overlay so you can see in the headset which surfaces were recognised.
    // ShapeGeometry is built in the XY plane and then rotated -90 degrees about X,
    // which maps (u, v) to (u, 0, -v), so z goes in negated
    const shape = new Shape()
    shape.moveTo(outline.points[0].x, -outline.points[0].z)
    for (const p of outline.points.slice(1)) shape.lineTo(p.x, -p.z)
    shape.closePath()
    const mesh = new Mesh(
      new ShapeGeometry(shape),
      new MeshBasicMaterial({
        color: XR_CONFIG.planeColor,
        transparent: true,
        opacity: XR_CONFIG.planeOpacity,
        side: DoubleSide,
        depthWrite: false,
      }),
    )
    mesh.rotation.x = -Math.PI / 2
    mesh.visible = XR_CONFIG.showPlanes
    const group = new Group()
    group.add(mesh)
    scene.add(group)

    return {
      body,
      group,
      mesh,
      outline,
      lastChangedTime: plane.lastChangedTime,
      label,
      worldY: 0,
      applied: null,
    }
  }

  return {
    /** Call every XR frame, before stepping physics */
    update(frame: XRFrame, refSpace: XRReferenceSpace) {
      // undefined when the feature was not granted, and always in VR sessions
      const detected = frame.detectedPlanes
      if (!detected) return
      // An empty set right after the headset is put back on means "not tracked yet",
      // not "the desk is gone". Removing the colliders then dropped every object resting
      // on the desk to the floor. Only forget planes when others are being reported
      if (detected.size === 0) return
      everDetected = true

      for (const [plane, entry] of entries) {
        if (!detected.has(plane)) destroy(plane, entry)
      }

      for (const plane of detected) {
        if (plane.orientation !== ORIENTATION) continue
        if (SKIP_LABELS.has(plane.semanticLabel ?? '')) continue
        const pose = frame.getPose(plane.planeSpace, refSpace)
        if (!pose) continue
        const p = pose.transform.position
        const o = pose.transform.orientation

        let entry = entries.get(plane)
        if (entry && entry.lastChangedTime !== plane.lastChangedTime) {
          const outline = readOutline(plane.polygon)
          if (outline && !outlineChanged(entry.outline, outline)) {
            // Only the timestamp moved. Keep the collider so nothing resting on it drops
            entry.lastChangedTime = plane.lastChangedTime
          } else {
            destroy(plane, entry)
            entry = undefined
          }
        }
        if (!entry) {
          const outline = readOutline(plane.polygon)
          up.set(0, 1, 0).applyQuaternion(poseQuat.set(o.x, o.y, o.z, o.w))
          const created = outline && create(plane, outline, up.y < 0)
          if (!created) continue
          entries.set(plane, created)
          entry = created
        }

        // Follow tracking corrections, but not the per-frame jitter (see XR_CONFIG)
        const prev = entry.applied
        if (prev) {
          const moved = Math.hypot(p.x - prev.position.x, p.y - prev.position.y, p.z - prev.position.z)
          const q = prev.quaternion
          const dot = Math.abs(o.x * q.x + o.y * q.y + o.z * q.z + o.w * q.w)
          if (moved <= XR_CONFIG.planeMoveThreshold && dot >= turnCos) continue
        }
        entry.body.setTranslation({ x: p.x, y: p.y, z: p.z }, true)
        entry.body.setRotation({ x: o.x, y: o.y, z: o.z, w: o.w }, true)
        entry.group.position.set(p.x, p.y, p.z)
        entry.group.quaternion.set(o.x, o.y, o.z, o.w)
        entry.worldY = p.y
        entry.applied = {
          position: new Vector3(p.x, p.y, p.z),
          quaternion: new Quaternion(o.x, o.y, o.z, o.w),
        }
      }
    },

    clear() {
      for (const [plane, entry] of Array.from(entries)) destroy(plane, entry)
      everDetected = false
    },

    /** True once any plane has been reported since the last clear() */
    get detected() {
      return everDetected
    },

    get count() {
      return entries.size
    },

    get labels() {
      return Array.from(entries.values(), (e) => e.label)
    },

    /** Height of the lowest plane labelled as floor, or null */
    get floorY(): number | null {
      let y: number | null = null
      for (const e of entries.values()) {
        if (FLOOR_LABELS.has(e.label) && (y === null || e.worldY < y)) y = e.worldY
      }
      return y
    },
  }
}

export type Planes = ReturnType<typeof createPlanes>
