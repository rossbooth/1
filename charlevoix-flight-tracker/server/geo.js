// Geographic helpers. All angles in degrees, distances in nautical miles
// unless a function name says otherwise.

const R_NM = 3440.065; // mean earth radius in nautical miles
const NM_PER_MI = 0.868976;
const FT_PER_NM = 6076.12;

const toRad = (d) => (d * Math.PI) / 180;
const toDeg = (r) => (r * 180) / Math.PI;

/** Great-circle distance between two lat/lon points, in nautical miles. */
export function distanceNm(lat1, lon1, lat2, lon2) {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R_NM * Math.asin(Math.min(1, Math.sqrt(a)));
}

export const nmToMiles = (nm) => nm / NM_PER_MI;
export const milesToNm = (mi) => mi * NM_PER_MI;

/** Initial bearing from point 1 to point 2, in degrees true (0-360). */
export function bearing(lat1, lon1, lat2, lon2) {
  const dLon = toRad(lon2 - lon1);
  const y = Math.sin(dLon) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLon);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

const COMPASS = [
  'N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
  'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW',
];

/** Turn a true bearing into a 16-point compass label, e.g. 300 -> "WNW". */
export function compassPoint(deg) {
  return COMPASS[Math.round((((deg % 360) + 360) % 360) / 22.5) % 16];
}

/**
 * How high above the horizon an aircraft appears to an observer on the ground.
 *
 * groundDistanceNm - horizontal distance from observer to the aircraft
 * aircraftAltFt    - aircraft altitude above mean sea level
 * observerAltFt    - observer's ground elevation above mean sea level
 *
 * Returns degrees above the horizon: 0 = on the horizon, 90 = straight up.
 */
export function elevationAngle(groundDistanceNm, aircraftAltFt, observerAltFt = 0) {
  const heightFt = aircraftAltFt - observerAltFt;
  if (heightFt <= 0) return 0;
  const horizontalFt = groundDistanceNm * FT_PER_NM;
  if (horizontalFt <= 0) return 90;
  return toDeg(Math.atan2(heightFt, horizontalFt));
}

/**
 * Plain-English viewing instructions for someone standing outside.
 * Returns null when the aircraft is too far away to realistically pick out.
 */
export function viewingHint(distanceNm, bearingDeg, elevationDeg) {
  if (distanceNm > 25) return null;
  const dir = compassPoint(bearingDeg);
  if (elevationDeg >= 70) return `Look almost straight up (${dir})`;
  if (elevationDeg >= 30) return `Look ${dir}, high overhead (${Math.round(elevationDeg)}° up)`;
  if (elevationDeg >= 10) return `Look ${dir}, ${Math.round(elevationDeg)}° above the horizon`;
  return `Look low on the ${dir} horizon`;
}
