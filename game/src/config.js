// NEON HARBOR — shared tuning constants: the city grid, the palette, names and spawn data.
// Everything else reads its numbers from here so the world stays consistent.

/** Street plan: five avenues each way, 58 m pitch (44 m blocks, 14 m roads). */
export const AVENUES = [-116, -58, 0, 58, 116];
export const BLOCK_CENTERS = [-87, -29, 29, 87];
export const BLOCK_SIZE = 44;
export const ROAD_WIDTH = 14;
export const LANE_OFFSET = 3.4;
export const CITY_EDGE = 145;
export const BEACH_Z = 128;
export const WATER_Z = 150;

/** Sunset palette. */
export const COLORS = {
  skyTop: 0x274069,
  skyHorizon: 0xff9a56,
  skyLow: 0xffd9a3,
  sun: 0xffc37a,
  fog: 0xf2a56b,
  asphalt: 0x33373d,
  sidewalk: 0x8d9299,
  sand: 0xe6c188,
  water: 0x14607e,
  grass: 0x5d8a4a,
};

/** Original car kinds: display name, size and driving character. */
export const CAR_KINDS = {
  vireo: { name: 'Vireo S', length: 4.4, width: 1.9, height: 0.55, cabinHeight: 0.5, topSpeed: 38, accel: 16, grip: 3.4, sport: true },
  meridian: { name: 'Meridian', length: 4.7, width: 1.85, height: 0.62, cabinHeight: 0.55, topSpeed: 30, accel: 11, grip: 3.0 },
  pico: { name: 'Pico', length: 3.8, width: 1.7, height: 0.66, cabinHeight: 0.58, topSpeed: 26, accel: 10, grip: 3.1 },
  brumby: { name: 'Brumby', length: 5.0, width: 2.0, height: 0.85, cabinHeight: 0.7, topSpeed: 27, accel: 10, grip: 2.7 },
  police: { name: 'Interceptor', length: 4.8, width: 1.9, height: 0.6, cabinHeight: 0.55, topSpeed: 36, accel: 15, grip: 3.3 },
};
export const TRAFFIC_KINDS = ['meridian', 'pico', 'brumby', 'vireo'];
export const CAR_COLORS = [0xd64541, 0x2e6fd8, 0xf2b035, 0x39b56b, 0xe8e6df, 0x30343c, 0x8e44ad, 0x16a3a3, 0xe67e22, 0xc0c6ce];

/** Story names. */
export const PLAYER_NAME = 'Marco Reyes';
export const FIXER_NAME = 'Sal Moreno';
export const CITY_NAME = 'Puerto Solano';

/** Where Marco starts: Harbor Avenue, facing the skyline. */
export const PLAYER_START = { x: -8, z: 112, heading: Math.PI };
/** The garage every delivery ends at, on the east side. */
export const GARAGE_POS = { x: 108, z: -84 };
/** The pier pickup point, south over the water. */
export const PIER_POS = { x: 0, z: 158 };
/** Respawn points after a bust or a wreck. */
export const HOSPITAL_POS = { x: -108, z: 24 };
export const POLICE_STATION_POS = { x: 108, z: 30 };

/** Save key and economy. */
export const SAVE_KEY = 'neon-harbor-save-v1';
export const BUST_FINE = 150;
export const WASTED_BILL = 200;
