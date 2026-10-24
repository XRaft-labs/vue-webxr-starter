/**
 * vue-webxr: the reusable part of vue-webxr-starter. Copy this folder into your project
 * (or add it as a local dependency) and import from it.
 *
 *   <XRCanvas>        TresCanvas + WebXR session, physics, detected planes and grabbing
 *   useGrabbable()    give an object physics and make it grabbable
 *   useXRFrame()      run code every frame, also inside XR
 *   useEmptyPinch()   run code after a single pinch in empty space
 *   useSceneReset()   run code when the scene is reset
 *   resetScene()      put objects back in front of the viewer (also: double pinch, A / X)
 *   xrState           reactive session status and settings for your UI
 *   XR_CONFIG         every tunable number in one place
 */
export { default as XRCanvas } from './XRCanvas.vue'
export { useEmptyPinch, useGrabbable, useSceneReset, useXRFrame } from './composables'
export {
  xrState,
  registerGrabbable,
  registerRigidBody,
  unregisterGrabbable,
  onFrame,
  onEmptyPinch,
  onSceneReset,
  resetScene,
} from './runtime'
export type { InputModelStyle } from './inputModels'
export type { FrameInfo, FrameCallback, EmptyPinchCallback } from './runtime'
export type { Grabbable, GrabbableOptions } from './grabbables'
export { XR_CONFIG } from './config'
