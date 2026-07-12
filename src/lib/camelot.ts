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

/** Convert Open Key notation ("6m", "12d") to Camelot ("5A", "7B"). */
export function openKeyToCamelot(openKey: string): string | null {
  const m = openKey.trim().toLowerCase().match(/^(\d{1,2})\s*([dm])$/)
  if (!m) return null
  const n = Number(m[1])
  if (n < 1 || n > 12) return null
  const camelotNum = ((n + 6) % 12) + 1
  return `${camelotNum}${m[2] === 'm' ? 'A' : 'B'}`
}

/**
 * Harmonically compatible Camelot keys for standard mixing:
 * same key, ±1 on the wheel in the same ring, and the relative key (same number, other ring).
 * e.g. "8A" → ["8A", "7A", "9A", "8B"]
 */
export function compatibleKeys(camelot: string): string[] {
  const m = camelot.match(/^(\d{1,2})([AB])$/)
  if (!m) return []
  const n = Number(m[1])
  if (n < 1 || n > 12) return []
  const ring = m[2]
  const otherRing = ring === 'A' ? 'B' : 'A'
  const down = n === 1 ? 12 : n - 1
  const up = n === 12 ? 1 : n + 1
  return [`${n}${ring}`, `${down}${ring}`, `${up}${ring}`, `${n}${otherRing}`]
}
