// Camelot wheel: 12 positions × 2 rings. A ring = minor keys, B ring = major keys.
// Adjacent numbers are a fifth apart; same number A↔B are relative major/minor.

const PITCH_CLASSES: Record<string, number> = {
  'B#': 0, C: 0,
  'C#': 1, DB: 1,
  D: 2,
  'D#': 3, EB: 3,
  E: 4, FB: 4,
  'E#': 5, F: 5,
  'F#': 6, GB: 6,
  G: 7,
  'G#': 8, AB: 8,
  A: 9,
  'A#': 10, BB: 10,
  B: 11, CB: 11,
}

// Indexed by pitch class (C=0 … B=11).
const MAJOR_TO_CAMELOT = [8, 3, 10, 5, 12, 7, 2, 9, 4, 11, 6, 1]
const MINOR_TO_CAMELOT = [5, 12, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10]

/**
 * Convert musical notation ("Gm", "F♯ minor", "Ab", "C major") to a Camelot code ("6A").
 * Returns null when the string can't be parsed. Mode defaults to major.
 */
export function musicalKeyToCamelot(raw: string): string | null {
  const m = raw.trim().match(/^([A-Ga-g])\s*([#♯b♭])?\s*(.*)$/)
  if (!m) return null
  const note = m[1].toUpperCase()
  const accidental = m[2] === '♯' ? '#' : m[2] === '♭' ? 'B' : (m[2]?.toUpperCase() ?? '')
  const pc = PITCH_CLASSES[note + accidental]
  if (pc === undefined) return null
  const mode = m[3].toLowerCase().replace(/[^a-z]/g, '')
  const isMinor = mode === 'm' || mode.startsWith('min')
  const num = isMinor ? MINOR_TO_CAMELOT[pc] : MAJOR_TO_CAMELOT[pc]
  return `${num}${isMinor ? 'A' : 'B'}`
}

const PITCH_NAMES = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B']

/** Convert Spotify audio-features pitch class (0–11, -1 unknown) + mode (1 major, 0 minor) to Camelot. */
export function pitchClassToCamelot(pitchClass: number, mode: number): string | null {
  if (pitchClass < 0 || pitchClass > 11) return null
  const num = mode === 0 ? MINOR_TO_CAMELOT[pitchClass] : MAJOR_TO_CAMELOT[pitchClass]
  return `${num}${mode === 0 ? 'A' : 'B'}`
}

/** Musical name for a Spotify pitch class + mode, e.g. (8, 0) → "A♭m". */
export function pitchClassToName(pitchClass: number, mode: number): string | null {
  if (pitchClass < 0 || pitchClass > 11) return null
  return `${PITCH_NAMES[pitchClass]}${mode === 0 ? 'm' : ''}`
}

/** Convert Open Key notation ("6m", "12d") to Camelot ("5A", "7B"). */
export function openKeyToCamelot(openKey: string): string | null {
  const m = openKey.trim().toLowerCase().match(/^(\d{1,2})\s*([dm])$/)
  if (!m) return null
  const n = Number(m[1])
  if (n < 1 || n > 12) return null
  const camelotNum = ((n + 6) % 12) + 1
  return `${camelotNum}${m[2] === 'm' ? 'A' : 'B'}`
}

export type CompatTier = 1 | 2 | 3

/**
 * Harmonic-match quality tiers for mixing FROM the given key:
 * - Tier 1 (perfect): the exact same key
 * - Tier 2 (close):   ±1 on the wheel in the same ring, or the relative key
 *                     (same number, other ring)
 * - Tier 3 (workable): ±2 in the same ring, or ±1 in the other ring
 *                     (energy switch, e.g. 5A → 4B or 6B)
 */
export function compatibilityTiers(camelot: string): Map<string, CompatTier> {
  const tiers = new Map<string, CompatTier>()
  const m = camelot.match(/^(\d{1,2})([AB])$/)
  if (!m) return tiers
  const n = Number(m[1])
  if (n < 1 || n > 12) return tiers
  const ring = m[2]
  const otherRing = ring === 'A' ? 'B' : 'A'
  const wrap = (x: number) => ((x + 11) % 12) + 1
  tiers.set(`${n}${ring}`, 1)
  tiers.set(`${wrap(n - 1)}${ring}`, 2)
  tiers.set(`${wrap(n + 1)}${ring}`, 2)
  tiers.set(`${n}${otherRing}`, 2)
  for (const k of [
    `${wrap(n - 2)}${ring}`,
    `${wrap(n + 2)}${ring}`,
    `${wrap(n - 1)}${otherRing}`,
    `${wrap(n + 1)}${otherRing}`,
  ]) {
    if (!tiers.has(k)) tiers.set(k, 3)
  }
  return tiers
}

/** All Camelot keys that mix harmonically FROM the given key (any tier). */
export function compatibleKeys(camelot: string): string[] {
  return [...compatibilityTiers(camelot).keys()]
}

/** Sort value for Camelot codes: 1A, 1B, 2A, … 12B. Unknown keys sort last. */
export function camelotSortValue(camelot: string | null | undefined): number {
  if (!camelot) return Number.MAX_SAFE_INTEGER
  const m = camelot.match(/^(\d{1,2})([AB])$/)
  if (!m) return Number.MAX_SAFE_INTEGER
  return Number(m[1]) * 2 + (m[2] === 'B' ? 1 : 0)
}
