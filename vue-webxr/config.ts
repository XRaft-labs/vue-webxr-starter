/**
 * Tunable values for the starter kit. Every number here was tuned on a Meta Quest 3.
 * Change them in one place instead of hunting through the code.
 */
export const XR_CONFIG = {
  // ---- Session -------------------------------------------------------------
  /**
   * Features requested when entering AR. All are optional: a device that lacks one
   * still starts the session, and the related feature simply stays off.
   */
  arFeatures: ['local-floor', 'hand-tracking', 'plane-detection'] as string[],
  vrFeatures: ['local-floor', 'hand-tracking'] as string[],

  // ---- Physics -------------------------------------------------------------
  gravity: -9.81,
  /**
   * Physics runs at a fixed rate, independent of the display refresh rate.
   * Quest 3 renders at 72, 90 or 120 Hz depending on settings and load. Stepping the
   * world once per rendered frame would make objects fall faster on faster displays.
   */
  physicsHz: 90,
  /** Upper bound of physics steps per rendered frame, so a long hitch cannot freeze the app */
  maxSubSteps: 5,

  // ---- Floor ---------------------------------------------------------------
  /** Thickness of the floor collider (m). Thick colliders stop fast objects from tunnelling */
  floorThickness: 1,
  /** If the reference space origin turns out to be at eye level, put the floor this far below the eyes (m) */
  floorFallbackBelowEye: 1.3,
  /** A camera higher than this above y = 0 means the origin is already on the floor (m) */
  floorEyeMin: 0.8,
  /** Frames to wait for the first head pose before deciding where the floor is */
  floorWaitFrames: 90,
  /** A plane labelled "floor" closer to the eyes than this is ignored (m). It is a desk */
  floorMinBelowEye: 1.0,

  // ---- Surfaces -------------------------------------------------------------
  /**
   * Friction and bounciness of the floor and of detected desks. Bounciness is combined
   * with the object's by taking the smaller value, so 0 here means objects never bounce
   * off real surfaces, whatever their own restitution
   */
  surfaceFriction: 0.9,
  surfaceRestitution: 0,

  // ---- Plane detection -----------------------------------------------------
  /** Thickness of colliders created from detected planes (m) */
  planeThickness: 0.1,
  /** Draw a translucent overlay on detected planes so you can see what was recognised */
  showPlanes: true,
  planeColor: 0x00ff88,
  /**
   * Overlay opacity. It is blended over the camera feed, which makes it look fainter
   * than on a monitor: 0.12 was barely visible on Quest 3, 0.34 reads clearly
   */
  planeOpacity: 0.34,
  /**
   * Tracking moves every plane by a few millimetres each frame. Writing that jitter into
   * the collider re-resolves every object resting on it, every frame, and they slowly
   * creep across the desk. Only follow moves larger than these (m, degrees)
   */
  planeMoveThreshold: 0.01,
  planeTurnThresholdDeg: 1,
  /**
   * Plane outlines are cleaned before they become colliders (see planes.ts): points
   * closer than this are merged (m)
   */
  planeOutlineMerge: 0.02,
  /** ...and points closer than this to the line through their neighbours are dropped (m) */
  planeOutlineFlatness: 0.01,
  /**
   * Quest bumps XRPlane.lastChangedTime often, even when the shape is the same.
   * Rebuilding the collider each time drops whatever rests on it for a frame.
   * Only rebuild when the outline's bounds change by more than this (m)
   */
  planeRebuildThreshold: 0.02,

  // ---- Gaze, reticle and selection frame --------------------------------------
  /**
   * WebXR does not expose eye tracking, so the head direction is used as the gaze.
   * People look slightly below where their head points, so tilt the gaze down a little
   */
  gazePitchDownDeg: 8,
  /** Distance of the reticle in front of the eyes (m) */
  reticleDistance: 0.5,
  /**
   * An object counts as aimed at when the gaze ray passes through its collider box grown
   * by this much on every side (m). Small on purpose: a wide ring (25 cm was tried) turns
   * the reticle yellow while you are still looking next to the object
   */
  gazeAimMargin: 0.005,
  reticleColor: 0x00e5ff,
  /** Pale yellow frame around the aimed object; the reticle turns this colour too */
  highlightColor: 0xffe066,
  highlightOpacity: 0.95,
  /** Frame line width (m). WebGL draws plain lines 1 pixel wide whatever you ask for */
  highlightLineWidth: 0.002,
  /**
   * The frame sits this far outside the box (m). Lines exactly on the edges are half
   * buried in the faces and look thinner. Keep it tiny: a visibly larger frame makes the
   * object look like it floats above the desk
   */
  highlightGap: 0.0015,
  /** Controller button that toggles the reticle: 5 = B / Y on Quest controllers */
  reticleButtonIndex: 5,

  // ---- Grabbing ------------------------------------------------------------
  /**
   * A hand grabs the nearest object whose surface is within this distance of the pinch
   * point, between the thumb tip and the index tip (m). The pinch point is used rather
   * than the grip pose: on Quest the grip of a tracked hand is the middle of the palm,
   * 8 to 10 cm behind the fingertips
   */
  pinchGrabDistance: 0.04,
  /** Same for a controller, measured from its grip pose (inside the controller body) (m) */
  controllerGrabDistance: 0.08,
  /**
   * A second hand joins a held object (to scale it) only within this distance of its
   * surface (m). A relaxed hand with curled fingers can register as a pinch; without
   * this limit, that stray pinch anywhere in view would start scaling the object
   */
  twoHandJoinDistance: 0.08,
  /** Smallest and largest scale reachable with a two-hand pinch */
  minScale: 0.1,
  maxScale: 10,

  // ---- Throwing --------------------------------------------------------------
  /**
   * Hand speed at release (m/s) above which the object is thrown with that velocity.
   * Below it, the object is dropped straight down. Measured on Quest 3: gently placing
   * an object releases at 0.03 to 0.48 m/s, a throw is well above 1 m/s
   */
  throwMinSpeed: 0.8,
  /** Cap on throw speed (m/s), so a flick does not send objects out of the room */
  throwMaxSpeed: 6,
  /** The release velocity is measured over the hand path of this many ms before release */
  throwWindowMs: 100,
  /** Multiplier on the measured hand velocity. Raise it if throws feel weak */
  throwVelocityScale: 1,

  // ---- Spawning and reset ----------------------------------------------------
  /**
   * Reset puts objects where you look: the gaze ray is cast against the desks and the
   * floor, and objects are set down on the first surface it meets within this distance (m)
   */
  resetMaxDistance: 3,
  /** Looking at nothing (into the air, or beyond resetMaxDistance): this far along the gaze (m) */
  resetFallbackDistance: 0.6,
  /**
   * A surface closer than this along the gaze is not used for a reset (m): the objects
   * would appear at the eyes. Uses resetFallbackDistance instead
   */
  resetMinDistance: 0.2,
  /** Gap left between the object and the surface it is set down on, so it never starts inside it (m) */
  resetDropGap: 0.01,
  /**
   * When a session starts, wait for plane detection before letting objects fall, or they
   * drop through the desk before its collider exists. Give up after this long (ms)
   */
  planesWaitMs: 3000,
  /** After the first planes arrive, wait this long for the rest of the room (ms) */
  planesSettleMs: 500,
  /**
   * Pinches (or trigger pulls) in empty space: 1 goes to useEmptyPinch(), 2 reset the
   * scene, 3 toggle the reticle, exitPinchCount (5) leaves the session. Each pinch must follow the previous one within this
   * time (ms). The count is only acted on once this time has passed with no further
   * pinch, so a single pinch fires this long after the fingers meet, and a triple pinch
   * does not also reset
   */
  multiPinchMs: 400,
  /** Pinches in quick succession, in empty space, that leave the session and return to the page */
  exitPinchCount: 5,
  /**
   * A pinch in empty space with the palm facing the eyes more than this (cosine of the
   * angle between the palm and the direction to the eyes; 0.5 = within 60°) is ignored:
   * on Quest it is the gesture that opens the system menu
   */
  menuPalmFacing: 0.5,
  /** Controller button that resets the scene: 4 = A / X on Quest controllers (xr-standard) */
  resetButtonIndex: 4,
} as const
