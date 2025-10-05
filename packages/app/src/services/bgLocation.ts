import * as Location from 'expo-location'
import * as TaskManager from 'expo-task-manager'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { addPointIfFarEnough } from './track'

const TASK_NAME = 'onsegil-bg-location'
const EXPLORE_KEY = '@onsegil/exploreActive'

if (!(TaskManager as any).isTaskDefined || !TaskManager.isTaskDefined(TASK_NAME)) {
  TaskManager.defineTask(TASK_NAME, async ({ data, error }: any) => {
    if (error) return
    const { locations } = data || {}
    if (!locations || locations.length === 0) return
    try {
      const active = (await AsyncStorage.getItem(EXPLORE_KEY)) === '1'
      if (!active) return
      for (const loc of locations) {
        const { latitude, longitude } = loc.coords || {}
        const ts = loc.timestamp || Date.now()
        if (typeof latitude === 'number' && typeof longitude === 'number') {
          await addPointIfFarEnough({ lat: latitude, lng: longitude, ts }, 20)
        }
      }
    } catch {}
  })
}

export async function startBackgroundUpdates(): Promise<void> {
  const hasFg = await Location.requestForegroundPermissionsAsync()
  if (hasFg.status !== 'granted') return
  try {
    await Location.requestBackgroundPermissionsAsync()
  } catch {}
  const started = await Location.hasStartedLocationUpdatesAsync(TASK_NAME)
  if (!started) {
    await Location.startLocationUpdatesAsync(TASK_NAME, {
      accuracy: Location.Accuracy.Balanced,
      timeInterval: 4000,
      distanceInterval: 5,
      showsBackgroundLocationIndicator: true,
      pausesUpdatesAutomatically: false,
      foregroundService: {
        notificationTitle: 'Onsegil 탐험 중',
        notificationBody: '위치를 기록하고 있습니다',
      },
    })
  }
}

export async function stopBackgroundUpdates(): Promise<void> {
  const started = await Location.hasStartedLocationUpdatesAsync(TASK_NAME)
  if (started) await Location.stopLocationUpdatesAsync(TASK_NAME)
}

export { TASK_NAME }

