# Rendering3D Integration

Rendering3D converts a top-down simulation into renderer-independent plans and poses. Keep backend objects inside the host adapter.

## Coordinate Convention

The default maps simulation `(x, y)` to 3D `(x, elevation, z)`:

```js
const mapping = require("./worldMapping");

const point3d = mapping.worldToThree(
  { x: actor.x, y: actor.y, height: actor.jumpHeight },
  {
    origin: { x: 0, y: 0, z: 0 },
    scale: 1,
    elevationScale: 1,
  },
);
```

Use `scaleX`, `scaleY`, `flipX`, and `flipY` for a different handedness. Use `worldDirectionToThree()`, `threeDirectionToWorld()`, `worldAngleToYaw()`, and `yawToWorldAngle()` for orientation.

## Pointer and HUD Mapping

For third-person aiming:

```js
const ndc = mapping.canvasToViewportNdc(pointerX, pointerY, viewport);
raycaster.setFromCamera(ndc, camera);

const target = mapping.unprojectCanvasToWorld(
  pointerX,
  pointerY,
  () => ({
    origin: raycaster.ray.origin,
    direction: raycaster.ray.direction,
  }),
  { viewport, groundHeight: 0 },
);
```

`intersectRayWithPlane()` supports elevated interaction planes and walls. `intersectRayWithGround()` is the horizontal-floor convenience form.

For HUD labels, let the backend perform matrix projection:

```js
const label = mapping.projectWorldPoint(
  { x: actor.x, y: actor.y, height: actorHeight },
  point => backendProjectToNdc(camera, point),
  { viewport },
);
```

## Camera Poses

```js
const rig = require("./cameraRig");

rig.updateSmoothedFocus(focusState, actor, {
  deltaSeconds: renderDelta,
  frequencyHz: firstPerson ? 24 : 12,
  snapDistance: 400,
});

const pose = firstPerson
  ? rig.computeFirstPersonPose({
    focus: focusState,
    eyeHeight: 34,
    yaw,
    pitch,
    shake,
  })
  : rig.computeThirdPersonPose({
    focus: focusState,
    room: { width: roomWidth, height: roomHeight },
    centerBias: 0.28,
    height: 580,
    back: 430,
    lookHeight: 12,
    shake,
  });
```

Call `updateSmoothedFocus()` with render delta. Use `exponentialSmoothingAlpha()` or `smoothPosition()` instead of a fixed per-frame lerp. Use `sampleCameraShake()` once per view so eye and target share coherent shake.

## First-Person Input

```js
const look = rig.applyLookDelta(yaw, pitch, dragX, dragY);
const movement = rig.mapLocalMovementToWorld(
  { x: strafeAxis, y: forwardAxis },
  look.yaw,
);
```

Client prediction and authority simulation must use the same movement mapping. `normalizeViewMode()` prevents unsupported first-person split-screen combinations without owning game UI.

## Split-Screen Views

```js
const canvasViews = mapping.createViewportLayout(width, height, playerCount);
const renderViews = mapping.createViewportLayout(width, height, playerCount, {
  coordinateSpace: "webgl",
});
```

Canvas coordinates start at the top-left. WebGL scissor coordinates start at the bottom-left. Keep both layouts explicit.

## Room Boundaries

```js
const roomGeometry = require("./roomGeometry");
const exits = roomGeometry.resolveRoomExits(room);
const plan = roomGeometry.createRoomBoundaryPlan({
  room,
  width: 800,
  height: 600,
  wallThickness: 40,
  doorSize: 120,
  corridorDepth: 96,
  exits,
});

plan.walls.forEach(createWallMesh);
plan.corridors.forEach(createCorridorMesh);
```

An open secret passage is an exit. A closed or merely discovered passage remains a wall. Include `roomBuildSignature()` in the static-geometry cache key so opening a secret passage rebuilds the room.

## Elevation

```js
const elevation = roomGeometry.resolveElevation(entity, {
  baseHeight: 1,
  hoverHeight: 8,
  kindOffsets: {
    portal: 44,
    rewardChoice: 26,
  },
});
```

This keeps portals, choices, pickups, jump arcs, and hovering objects consistently above the floor while the host owns category values.

## NeoNyke Reference

NeoNyke consumes these contracts in:

- `js/draw/three-renderer.js` for room plans, camera poses, pointer mapping, viewport layouts, and elevations
- `js/core/first-person-look.js` for shared yaw/pitch input
- `js/simulation/CampaignMovementRules.js` for authority-safe camera-relative movement

Three.js meshes, sprite billboards, room themes, pointer-lock DOM, and WebGL recovery remain host presentation.
