import AsyncStorage from '@react-native-async-storage/async-storage'

export type TrackPoint = { lat: number; lng: number; ts: number }

const STORAGE_KEY = '@onsegil/trackPoints:v1'
const LAST_SENT_TS_KEY = '@onsegil/lastSentTs:v1'

let cache: TrackPoint[] | null = null
let lastSaved: TrackPoint | null = null

export async function loadTrack(): Promise<TrackPoint[]> {
  if (cache) return cache
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY)
    if (raw) {
      cache = JSON.parse(raw)
      lastSaved = cache.length ? cache[cache.length - 1] : null
      return cache
    }
  } catch {}
  cache = []
  lastSaved = null
  return cache
}

async function persist() {
  if (!cache) return
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(cache))
  } catch {}
}

export function haversineMeters(a: TrackPoint, b: TrackPoint) {
  const R = 6371000
  const toRad = (x: number) => (x * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

export function shouldSave(prev: TrackPoint | null, next: TrackPoint, minMeters = 20) {
  if (!prev) return true
  return haversineMeters(prev, next) >= minMeters
}

export async function addPointIfFarEnough(p: TrackPoint, minMeters = 20): Promise<TrackPoint[] | null> {
  if (!cache) await loadTrack()
  if (!cache) cache = []
  if (!shouldSave(lastSaved, p, minMeters)) return null
  cache.push(p)
  lastSaved = p
  await persist()
  return [p]
}

export async function getAll(): Promise<TrackPoint[]> {
  return loadTrack()
}

export async function clearAll() {
  cache = []
  lastSaved = null
  try {
    await AsyncStorage.removeItem(STORAGE_KEY)
  } catch {}
}

export async function getLastSentTs(): Promise<number> {
  try {
    const v = await AsyncStorage.getItem(LAST_SENT_TS_KEY)
    return v ? Number(v) : 0
  } catch {
    return 0
  }
}

export async function setLastSentTs(ts: number): Promise<void> {
  try {
    const cur = await getLastSentTs()
    if (ts > cur) await AsyncStorage.setItem(LAST_SENT_TS_KEY, String(ts))
  } catch {}
}

export async function getPendingSinceTs(minTs: number): Promise<TrackPoint[]> {
  const all = await loadTrack()
  return all.filter((p) => p.ts > minTs)
}
