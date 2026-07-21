export const WORLD_CONFIG = Object.freeze({
  center: Object.freeze([2.2, 0, 1.8]),
  cameraFollowOffset: Object.freeze([2.8, 0, 2.55]),
  playerCollisionRadius: 0.24,
  playerBounds: Object.freeze({
    // Full authored interior, including the side rooms beyond the main hall.
    minX: -8.55,
    maxX: 15.75,
    minZ: -7.05,
    maxZ: 8.65,
  }),
  panBounds: Object.freeze({
    minX: -9.2,
    maxX: 18.6,
    minZ: -8,
    maxZ: 11.1,
  }),
  // Keep the complete authored Blender shell visible; cutaways must be opt-in.
  cutawayPrefixes: Object.freeze([]),
});
