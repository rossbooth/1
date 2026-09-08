// A stand-in for the live feed so the site can be demonstrated (and the layout
// checked) without a network connection. Enable with `npm run demo`.
//
// The made-up traffic is deliberately continuous -- aircraft fly out and come
// back rather than jumping position at the end of a loop -- so the takeoff and
// landing logic sees the same kind of track it would get from a real feed.

const CYCLE_SECONDS = 420;

const SCRIPT = [
  { hex: 'a4acfc', r: 'N400CV', t: 'C172', desc: 'Cessna 172 Skyhawk',
    role: 'localFlight', speed: 95, offset: 0, outNm: 12 },
  { hex: 'a061d9', r: 'N12345', t: 'C208', desc: 'Cessna 208B Grand Caravan',
    role: 'localFlight', speed: 135, offset: 0.5, outNm: 16 },
  { hex: 'a9e53c', r: 'N737BA', t: 'B737', desc: 'Boeing 737-700',
    role: 'overflight', speed: 450, offset: 0.25, cruiseFt: 34000 },
  { hex: 'a2b3c4', r: 'N88XR', t: 'PC12', desc: 'Pilatus PC-12',
    role: 'pattern', speed: 120, offset: 0.7 },
];

/** Straight-line interpolation between two values. */
const lerp = (a, b, t) => a + (b - a) * Math.max(0, Math.min(1, t));

/**
 * One aircraft's distance from the field and altitude at a point in its cycle.
 * Returns nautical miles from the field, feet above sea level, and whether it
 * is sitting on the ground.
 */
function positionAt(plane, phase, fieldElevationFt) {
  if (plane.role === 'localFlight') {
    // Sit, take off, fly out, turn round, come back, land, sit.
    if (phase < 0.06) return { distNm: 0, altFt: fieldElevationFt, onGround: true, climbFpm: 0 };
    if (phase < 0.45) {
      const t = (phase - 0.06) / 0.39;
      return { distNm: lerp(0, plane.outNm, t), altFt: lerp(fieldElevationFt, fieldElevationFt + 8000, t), onGround: false, climbFpm: 900 };
    }
    if (phase < 0.55) {
      return { distNm: plane.outNm, altFt: fieldElevationFt + 8000, onGround: false, climbFpm: 0 };
    }
    if (phase < 0.94) {
      const t = (phase - 0.55) / 0.39;
      return { distNm: lerp(plane.outNm, 0, t), altFt: lerp(fieldElevationFt + 8000, fieldElevationFt, t), onGround: false, climbFpm: -900 };
    }
    return { distNm: 0, altFt: fieldElevationFt, onGround: true, climbFpm: 0 };
  }

  if (plane.role === 'pattern') {
    // Circuits: never lands, stays low and close.
    const lap = Math.abs(Math.sin(phase * Math.PI * 3));
    return { distNm: 1.2 + lap * 2.5, altFt: fieldElevationFt + 1000 + lap * 400, onGround: false, climbFpm: 0 };
  }

  // High traffic passing by: in from one side, out the other, no discontinuity.
  return { distNm: Math.abs(18 - phase * 36), altFt: plane.cruiseFt, onGround: false, climbFpm: 0 };
}

/**
 * Returns a fetch-shaped function that produces plausible moving traffic
 * around the airport. Positions advance with the clock, so the map animates.
 * `now` is injectable so a whole session can be replayed deterministically.
 */
export function demoFeed({ airport, now = Date.now }) {
  const started = now();
  const lonScale = 60 * Math.cos((airport.lat * Math.PI) / 180);

  return async () => {
    const elapsed = (now() - started) / 1000;
    const ac = SCRIPT.map((plane, i) => {
      const phase = (((elapsed / CYCLE_SECONDS) + plane.offset) % 1 + 1) % 1;
      const { distNm, altFt, onGround, climbFpm } = positionAt(plane, phase, airport.elevationFt);
      // Each aircraft leaves on its own heading, so they do not overlap.
      const heading = ((i * 83 + 25) % 360) * (Math.PI / 180);

      return {
        hex: plane.hex,
        r: plane.r,
        t: plane.t,
        desc: plane.desc,
        flight: plane.r,
        lat: airport.lat + (distNm / 60) * Math.cos(heading),
        lon: airport.lon + (distNm / lonScale) * Math.sin(heading),
        alt_baro: onGround ? 'ground' : Math.round(altFt),
        gs: onGround ? 6 : plane.speed,
        track: Math.round(((heading * 180) / Math.PI + (climbFpm < 0 ? 180 : 0)) % 360),
        baro_rate: climbFpm,
        squawk: '1200',
        seen_pos: 1,
      };
    });
    return { ac, total: ac.length, now: now() / 1000 };
  };
}

export { CYCLE_SECONDS };
