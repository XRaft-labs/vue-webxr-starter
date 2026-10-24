import { reactive, watch } from 'vue'
import type RAPIER from '@dimforge/rapier3d-compat'
import {
  Object3D,
  PerspectiveCamera,
  type Scene,
  type WebGLRenderer,
  type WebXRManager,
} from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { XRControllerModelFactory } from 'three/examples/jsm/webxr/XRControllerModelFactory.js'
import { XRHandModelFactory } from 'three/examples/jsm/webxr/XRHandModelFactory.js'
import type { Physics } from './physics'
import {
  createGrabbableRegistry,
  type Grabbable,
  type GrabbableOptions,
  type GrabbableRegistry,
} from './grabbables'
import { createFloor } from './floor'
import { createRigidBodySync } from './rigidBodies'
import { createPlanes } from './planes'
import { createInteraction } from './interaction'
import { createReset } from './reset'
import { createGaze } from './gaze'
import { createInputModels, type InputModelStyle } from './inputModels'
import { createXRButtons, guardSessionLifetime, removeXRButtons } from './session'
import { XR_CONFIG } from './config'

/** Reactive status, for UI and debug panels */
export const xrState = reactive({
  /** 'ar' = passthrough, 'vr' = fully virtual, 'none' = not in a session */
  mode: 'none' as 'none' | 'ar' | 'vr',
  /** Physics is initialised and objects can be registered */
  ready: false,
  /** 'hands', 'controllers', 'hands + controllers' or 'none' */
  input: 'none',
  /** Features the device granted, e.g. ['local-floor', 'hand-tracking', 'plane-detection'] */
  features: [] as string[],
  /** Number of detected surfaces turned into colliders */
  planes: 0,
  floorY: 0,
  floorSource: '',
  /**
   * How hand and controller models are drawn in AR. Set it before entering AR, or any time.
   * 'occlusion' shows your real hands through the passthrough and hides what is behind
   * them; 'visible' draws the models. VR always draws them
   */
  inputModels: 'occlusion' as InputModelStyle,
  /** Objects are hanging in the air after a reset, waiting for the desks to be detected */
  waitingForPlanes: false,
  /**
   * Show the gaze reticle, and a pale yellow frame around the object it is on.
   * Inside AR, toggle it with three quick pinches in empty space, or B / Y on a controller
   */
  reticle: true,
})

export interface FrameInfo {
  /** Seconds since the previous frame */
  delta: number
  /** Present only while in an immersive session */
  frame?: XRFrame
  /** Head pose: in XR the viewer pose, otherwise the preview camera */
  head: Object3D
}
export type FrameCallback = (info: FrameInfo) => void

const frameCallbacks = new Set<FrameCallback>()
const emptyPinchCallbacks = new Set<EmptyPinchCallback>()
const resetCallbacks = new Set<() => void>()
/** Registrations made before the runtime started. They run as soon as it does */
const pending: Array<{
  register: (registry: GrabbableRegistry) => Grabbable
  resolve: (item: Grabbable) => void
}> = []

function whenReady(register: (registry: GrabbableRegistry) => Grabbable): Promise<Grabbable> {
  if (runtime) return Promise.resolve(register(runtime.registry))
  return new Promise((resolve) => pending.push({ register, resolve }))
}

type Runtime = ReturnType<typeof createRuntime>
let runtime: Runtime | null = null

/**
 * Register an object as a physics-driven, grabbable object.
 * Safe to call before XR is started: the request waits until physics is ready.
 * Prefer the `useGrabbable()` composable inside components.
 */
export function registerGrabbable(object: Object3D, options: GrabbableOptions = {}): Promise<Grabbable> {
  return whenReady((registry) => registry.add(object, options))
}

/**
 * Make a <RigidBody> from @tresjs/rapier grabbable. The body and its collider stay owned
 * by the component; the starter only moves them while held and copies their pose to the
 * group every frame (see syncFromPhysics in grabbables.ts for why).
 * Prefer the `useGrabbable()` composable inside components.
 */
export function registerRigidBody(
  group: Object3D,
  body: RAPIER.RigidBody,
  options: GrabbableOptions = {},
): Promise<Grabbable> {
  return whenReady((registry) => registry.adopt(group, body, options))
}

export function unregisterGrabbable(item: Grabbable) {
  // Let go first: a hand still holding it would move its body after it is freed
  runtime?.interaction.forget(item)
  runtime?.registry.remove(item)
}

/**
 * Put every grabbable object back in front of the viewer, as authored, and let it fall
 * onto the desk below (or the floor). Also runs automatically when a session starts.
 * Inside XR: pinch twice in empty space, or press A / X on a controller
 */
export function resetScene() {
  runtime?.requestReset()
}

/** Called with the head pose after a single pinch (or trigger pull) in empty space */
export type EmptyPinchCallback = (info: { head: Object3D }) => void

/**
 * Run code after a single pinch in empty space, inside XR. Returns a function that
 * unsubscribes. Double and triple pinches are commands (reset, reticle) and do not call it
 */
export function onEmptyPinch(callback: EmptyPinchCallback): () => void {
  emptyPinchCallbacks.add(callback)
  return () => emptyPinchCallbacks.delete(callback)
}

/**
 * Run code when the scene is reset (double pinch, A / X, resetScene(), session start),
 * before the objects are put back. Returns a function that unsubscribes
 */
export function onSceneReset(callback: () => void): () => void {
  resetCallbacks.add(callback)
  return () => resetCallbacks.delete(callback)
}

/** Run code every frame (after physics, before rendering). Returns a function that unsubscribes */
export function onFrame(callback: FrameCallback): () => void {
  frameCallbacks.add(callback)
  return () => frameCallbacks.delete(callback)
}

/**
 * Start everything. Called by <XRCanvas> once TresJS has created the renderer.
 *
 * The render loop is driven by `renderer.setAnimationLoop()`, because that is the only
 * loop that keeps running inside an immersive session (window.requestAnimationFrame is
 * paused there) and the only one that receives the XRFrame. TresJS's own loop is
 * stopped so the scene is not rendered twice outside XR.
 */
export function startXR(
  renderer: WebGLRenderer,
  scene: Scene,
  physics: Physics,
  stopTresLoop: () => void,
) {
  stopXR()
  const created = createRuntime(renderer, scene, physics, stopTresLoop)
  runtime = created
  xrState.ready = true
  for (const request of pending.splice(0)) request.resolve(request.register(created.registry))
}

export function stopXR() {
  if (!runtime) return
  runtime.dispose()
  runtime = null
  xrState.ready = false
}

function createRuntime(
  renderer: WebGLRenderer,
  scene: Scene,
  physics: Physics,
  stopTresLoop: () => void,
) {
  const xr = renderer.xr as WebXRManager
  const registry = createGrabbableRegistry(physics)
  const rigidBodies = createRigidBodySync(physics.world, scene)
  const floor = createFloor(physics)
  const planes = createPlanes(scene, physics)
  const gaze = createGaze(scene, registry)
  const reset = createReset(registry, planes, physics, floor)
  // HTML is not visible inside AR on Quest (no 'dom-overlay'), and a switch floating in
  // the room gets in the way of screen recordings. Settings are gestures instead:
  // quick pinches in empty space, 2 to reset, 3 to toggle the reticle, 5 to leave the
  // session. A single pinch is left to the app (useEmptyPinch). 4 does nothing, so a
  // miscounted triple or quintuple pinch has no surprising effect
  const requestReset = () => {
    for (const callback of resetCallbacks) callback()
    reset.request()
  }
  const interaction = createInteraction(registry, {
    // The pose read in the frame loop (`head` and `headValid` are declared below)
    headPosition: () => (headValid ? head.position : null),
    onEmptyPinch: (count) => {
      if (count === 1) {
        if (headValid) for (const callback of emptyPinchCallbacks) callback({ head })
      } else if (count === 2) requestReset()
      else if (count === 3) xrState.reticle = !xrState.reticle
      else if (count >= XR_CONFIG.exitPinchCount) {
        console.info(`[session] ${count} pinches: leaving the session`)
        xr.getSession()?.end().catch(() => {})
      }
    },
  })
  const inputModels = createInputModels()

  // ---- Preview camera (outside XR). In a session, Three.js swaps in the headset cameras
  const camera = new PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 100)
  camera.position.set(0, 1.3, 0.8)
  const controls = new OrbitControls(camera, renderer.domElement)
  controls.target.set(0, 0.4, -0.6)
  controls.update()
  const onResize = () => {
    if (xr.isPresenting) return
    camera.aspect = window.innerWidth / window.innerHeight
    camera.updateProjectionMatrix()
  }
  window.addEventListener('resize', onResize)

  // ---- Controller and hand models
  // Drawn as a depth-only mask in AR by default, so the real hands show through (see
  // inputModels.ts). The models load asynchronously; the style is applied as each arrives
  const controllerFactory = new XRControllerModelFactory(null, inputModels.onModelLoaded)
  const handFactory = new XRHandModelFactory(null, inputModels.onModelLoaded)
  for (let i = 0; i < 2; i++) {
    const grip = xr.getControllerGrip(i)
    grip.add(controllerFactory.createControllerModel(grip))
    scene.add(grip)
    const hand = xr.getHand(i)
    hand.add(handFactory.createHandModel(hand, 'mesh'))
    scene.add(hand)
  }
  const stopStyleWatch = watch(
    () => xrState.inputModels,
    (style) => inputModels.setStyle(style, xrState.mode === 'ar'),
  )

  // ---- Session lifecycle
  const guard = guardSessionLifetime(() => xr.getSession())
  const listeners = {
    selectstart: (e: Event) => {
      const refSpace = xr.getReferenceSpace()
      if (refSpace) interaction.onSelectStart(e as XRInputSourceEvent, refSpace)
    },
    selectend: (e: Event) => {
      const refSpace = xr.getReferenceSpace()
      if (refSpace) interaction.onSelectEnd(e as XRInputSourceEvent, refSpace)
    },
    // The system menu opened (or the headset was taken off): drop pinches not acted on yet
    visibilitychange: () => {
      const state = xr.getSession()?.visibilityState
      if (state !== 'visible') interaction.cancelEmptyPinches()
    },
    inputsourceschange: (e: Event) => {
      interaction.onSourcesRemoved((e as XRInputSourcesChangeEvent).removed)
      updateInputLabel()
    },
  }

  function updateInputLabel() {
    const sources = Array.from(xr.getSession()?.inputSources ?? [])
    const handsOn = sources.some((s) => !!s.hand)
    const controllersOn = sources.some((s) => !s.hand && s.targetRayMode === 'tracked-pointer')
    xrState.input =
      handsOn && controllersOn ? 'hands + controllers' : handsOn ? 'hands' : controllersOn ? 'controllers' : 'none'
  }

  function onSessionStart() {
    const session = xr.getSession()
    if (!session) return
    // There is no XRSession.mode. Tell AR from VR with environmentBlendMode:
    //   'opaque'      VR, the real world is hidden
    //   'alpha-blend' passthrough (Quest 3, Android XR): the compositor blends the camera feed
    //   'additive'    optical see-through displays
    const passthrough = (session.environmentBlendMode ?? 'opaque') !== 'opaque'
    xrState.mode = passthrough ? 'ar' : 'vr'
    // In passthrough, leave the background fully transparent so the room shows through
    renderer.setClearAlpha(passthrough ? 0 : 1)
    inputModels.setStyle(xrState.inputModels, passthrough)
    xrState.features = Array.from(session.enabledFeatures ?? [])
    floor.reset()
    // Bring the objects in front of the viewer every time the headset is put on. They wait
    // for the desks to be detected, then fall onto them. Physics kept running while out of
    // the session, with no desk colliders, so they would otherwise be lying on the floor
    headValid = false
    requestReset()
    // Listen on the session itself so transient pointers (gaze + pinch) are included
    session.addEventListener('selectstart', listeners.selectstart)
    session.addEventListener('selectend', listeners.selectend)
    session.addEventListener('inputsourceschange', listeners.inputsourceschange)
    session.addEventListener('visibilitychange', listeners.visibilitychange)
    updateInputLabel()
  }

  function onSessionEnd() {
    interaction.reset()
    inputModels.setStyle(xrState.inputModels, false)
    buttonsDown.clear()
    planes.clear()
    xrState.mode = 'none'
    xrState.input = 'none'
    xrState.features = []
    xrState.planes = 0
    renderer.setClearAlpha(1)
    guard.flushReload()
  }

  xr.addEventListener('sessionstart', onSessionStart)
  xr.addEventListener('sessionend', onSessionEnd)
  xr.enabled = true
  createXRButtons(renderer)

  // ---- Frame loop
  const head = new Object3D()
  let lastTime = -1
  /** The headset has reported a pose in this session. Until then `head` is stale */
  let headValid = true
  /** Controller buttons held down in the previous frame, to react on press only */
  const buttonsDown = new Map<XRInputSource, Set<number>>()
  const buttonActions: Array<[number, () => void]> = [
    // A / X resets the scene
    [XR_CONFIG.resetButtonIndex, () => requestReset()],
    // B / Y toggles the reticle
    [XR_CONFIG.reticleButtonIndex, () => (xrState.reticle = !xrState.reticle)],
  ]

  function checkControllerButtons(session: XRSession) {
    for (const source of session.inputSources) {
      const buttons = source.gamepad?.buttons
      if (!buttons) continue
      // Tracked hands report a gamepad too. On Quest, pinching with the left palm turned
      // to the face (the menu gesture) presses button 4, the A / X index, which would reset the
      // scene. The A / X and B / Y actions are for controllers only
      if (source.hand) continue
      let down = buttonsDown.get(source)
      if (!down) buttonsDown.set(source, (down = new Set()))
      for (const [index, action] of buttonActions) {
        const pressed = !!buttons[index]?.pressed
        if (pressed && !down.has(index)) action()
        if (pressed) down.add(index)
        else down.delete(index)
      }
    }
  }

  function loop(time: number, frame?: XRFrame) {
    const delta = lastTime < 0 ? 0 : (time - lastTime) / 1000
    lastTime = time
    const refSpace = frame ? xr.getReferenceSpace() : null

    if (frame && refSpace) {
      // Head pose straight from WebXR. xr.getCamera() is only updated during render(),
      // so reading it here would lag one frame behind
      const viewer = frame.getViewerPose(refSpace)
      if (viewer) {
        const p = viewer.transform.position
        const o = viewer.transform.orientation
        head.position.set(p.x, p.y, p.z)
        head.quaternion.set(o.x, o.y, o.z, o.w)
        headValid = true
      }
      const session = xr.getSession()
      if (session) checkControllerButtons(session)
      floor.update(head.position.y)
      planes.update(frame, refSpace)
      const detectedFloor = planes.floorY
      if (detectedFloor !== null) floor.applyDetectedFloor(detectedFloor, head.position.y)
      // Kinematic targets must be set before the physics step
      interaction.update(frame, refSpace)
      xrState.planes = planes.count
    } else {
      controls.update()
      head.position.copy(camera.position)
      head.quaternion.copy(camera.quaternion)
    }

    // Gaze first: reset places objects where it points
    gaze.update(head, xr.isPresenting && xrState.reticle, interaction.anyHeld)
    // Place objects after a reset, and let them fall once the desks are known
    const waitForPlanes = xr.isPresenting && xrState.features.includes('plane-detection')
    reset.update(head, gaze.ray, headValid, waitForPlanes)
    xrState.waitingForPlanes = reset.waiting

    physics.advance(delta)
    registry.syncFromPhysics()
    rigidBodies.sync(registry.bodyHandles())
    xrState.floorY = floor.floorY.value
    xrState.floorSource = floor.source.value

    for (const callback of frameCallbacks) callback({ delta, frame, head })
    renderer.render(scene, camera)
  }

  stopTresLoop()
  renderer.setAnimationLoop(loop)

  // During development, expose the internals for poking at them from DevTools
  // (also over chrome://inspect while the headset is connected)
  if (import.meta.env.DEV) {
    Object.assign(window, { __xrStarter: { registry, floor, planes, interaction, physics, reset, inputModels, gaze } })
  }

  return {
    registry,
    reset,
    requestReset,
    interaction,
    dispose() {
      stopStyleWatch()
      gaze.dispose()
      renderer.setAnimationLoop(null)
      xr.getSession()?.end().catch(() => {})
      xr.removeEventListener('sessionstart', onSessionStart)
      xr.removeEventListener('sessionend', onSessionEnd)
      window.removeEventListener('resize', onResize)
      guard.dispose()
      removeXRButtons()
      controls.dispose()
      planes.clear()
      registry.clear()
    },
  }
}
