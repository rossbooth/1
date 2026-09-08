// US registrations and ICAO 24-bit addresses are two views of the same number.
//
// Every US aircraft is assigned an ICAO address from A00001 (N1) to ADF7C7
// (N99999), laid out in a strict order over the legal N-number space. That
// means we can work out the tail number from the hex code a receiver heard even
// when the feed never sends a registration -- which is what lets us look the
// aircraft up in the FAA register and find out who owns it.

const CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // 24 letters: no I, no O
const US_ICAO_MIN = 0xa00001;
const US_ICAO_MAX = 0xadf7c7;

// COUNT[r] = how many valid tails fit in r remaining character slots:
//   stop, or 1 letter, or 2 letters, or a digit followed by COUNT[r-1] more.
const COUNT = [1, 35, 951, 10111, 101711];

// Within a slot the order is: stop, the 24 single letters, the 576 letter
// pairs, then the digit continuations. So a digit continuation is preceded by
// this many entries -- and letter pairs only fit when 2 slots are left.
const skipBeforeDigits = (slotsLeft) => (slotsLeft >= 2 ? 601 : 25);

/** Position of a 1-2 letter suffix within its slot ("" is 0). */
function suffixOffset(suffix) {
  if (suffix.length === 0) return 0;
  const first = CHARSET.indexOf(suffix[0]);
  if (first < 0) return null;
  if (suffix.length === 1) return first + 1;
  if (suffix.length > 2) return null;
  const second = CHARSET.indexOf(suffix[1]);
  if (second < 0) return null;
  return 25 + first * 24 + second;
}

/** Inverse of suffixOffset. */
function offsetToSuffix(offset) {
  if (offset === 0) return '';
  if (offset <= 24) return CHARSET[offset - 1];
  const rest = offset - 25;
  return CHARSET[Math.floor(rest / 24)] + CHARSET[rest % 24];
}

/** A tail number is 1-5 characters: a leading 1-9, digits, then up to 2 letters. */
const VALID_TAIL = /^[1-9](?:[0-9]{0,4}|[0-9]{0,3}[A-HJ-NP-Z]|[0-9]{0,2}[A-HJ-NP-Z]{2})$/;

export function isValidNNumber(nNumber) {
  return VALID_TAIL.test(String(nNumber ?? '').trim().toUpperCase().replace(/^N/, ''));
}

/** "N400CV" -> "a4a83f". Returns null for anything that is not a US tail. */
export function nNumberToHex(nNumber) {
  const s = String(nNumber ?? '').trim().toUpperCase().replace(/^N/, '');
  if (!VALID_TAIL.test(s)) return null;

  let offset = 1 + (Number(s[0]) - 1) * COUNT[4];
  for (let i = 1; i < s.length; i += 1) {
    const slotsLeft = 5 - i;
    const ch = s[i];
    if (ch >= '0' && ch <= '9') {
      offset += skipBeforeDigits(slotsLeft) + Number(ch) * COUNT[slotsLeft - 1];
    } else {
      const suffix = suffixOffset(s.slice(i));
      if (suffix === null) return null;
      offset += suffix;
      break;
    }
  }
  const icao = US_ICAO_MIN - 1 + offset;
  if (icao < US_ICAO_MIN || icao > US_ICAO_MAX) return null;
  return icao.toString(16).padStart(6, '0');
}

/** "a4a83f" -> "N400CV". Returns null for addresses outside the US block. */
export function hexToNNumber(hex) {
  const icao = parseInt(String(hex ?? '').trim().replace(/^0x/i, ''), 16);
  if (!Number.isFinite(icao) || icao < US_ICAO_MIN || icao > US_ICAO_MAX) return null;

  let remaining = icao - US_ICAO_MIN; // 0 == N1
  let out = `N${Math.floor(remaining / COUNT[4]) + 1}`;
  remaining %= COUNT[4];

  for (let i = 1; i <= 4; i += 1) {
    if (remaining === 0) return out;
    const slotsLeft = 5 - i;
    const skip = skipBeforeDigits(slotsLeft);
    if (remaining < skip) return out + offsetToSuffix(remaining);
    remaining -= skip;
    const block = COUNT[slotsLeft - 1];
    out += String(Math.floor(remaining / block));
    remaining %= block;
  }
  return out;
}

export { CHARSET, US_ICAO_MIN, US_ICAO_MAX };
