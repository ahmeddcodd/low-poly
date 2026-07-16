export const WORLD_CONFIG = Object.freeze({
  center: Object.freeze([2.2, 0, 1.8]),
  cameraFollowOffset: Object.freeze([2.8, 0, 2.55]),
  playerCollisionRadius: 0.24,
  playerBounds: Object.freeze({
    // Full authored interior, including the side rooms beyond the main hall.
    minX: -8.55,
    maxX: 15.75,
    minZ: -7.05,
    maxZ: 7.05,
  }),
  panBounds: Object.freeze({
    minX: -9.2,
    maxX: 18.6,
    minZ: -8,
    maxZ: 9.7,
  }),
  // Keep the complete authored Blender shell visible; cutaways must be opt-in.
  cutawayPrefixes: Object.freeze([]),
});

export const PLACEMENT_ZONES = Object.freeze([
  Object.freeze({
    id: 'dining-area',
    label: 'Dining area',
    hint: 'Ready for tables and guest seating',
    position: Object.freeze([-4.4, 0.14, -2.5]),
    color: 0x60e72f,
  }),
  Object.freeze({
    id: 'service-counter',
    label: 'Service counter',
    hint: 'Ready for a register and serving counter',
    position: Object.freeze([-1.65, 0.14, 1.8]),
    color: 0x39d84d,
  }),
  Object.freeze({
    id: 'prep-station',
    label: 'Prep station',
    hint: 'Ready for kitchen and production equipment',
    position: Object.freeze([5.3, 0.14, -3.4]),
    color: 0x19cc80,
  }),
]);
