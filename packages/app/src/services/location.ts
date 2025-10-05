import * as Location from 'expo-location'
import type { RNToWebMessage } from '../utils/webviewBridge'

export async function requestPermissions() {
  const { status: fgStatus } = await Location.requestForegroundPermissionsAsync()
  if (fgStatus !== 'granted') return false
  try {
    await Location.requestBackgroundPermissionsAsync()
  } catch {}
  return true
}

export async function watchLocation(
  onUpdate: (msg: RNToWebMessage) => void
) {
  const granted = await requestPermissions()
  if (!granted) return () => {}

  const sub = await Location.watchPositionAsync(
    {
      accuracy: Location.Accuracy.Balanced,
      timeInterval: 4000,
      distanceInterval: 5,
    },
    (loc) => {
      onUpdate({
        type: 'location',
        coords: {
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
          accuracy: loc.coords.accuracy,
        },
        timestamp: loc.timestamp,
      })
    }
  )

  return () => sub.remove()
}

