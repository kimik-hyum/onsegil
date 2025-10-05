import type { WebView } from 'react-native-webview'

export type RNToWebMessage =
  | {
      type: 'location'
      coords: { latitude: number; longitude: number; accuracy?: number }
      timestamp: number
    }
  | {
      type: 'explore_status'
      active: boolean
    }
  | {
      type: 'holes_add'
      points: { lat: number; lng: number; ts: number }[]
    }
  | {
      type: 'holes_sync'
      points: { lat: number; lng: number; ts: number }[]
    }
  | {
      type: 'holes_clear'
    }

export function postToWeb(
  webRef: React.RefObject<WebView>,
  msg: RNToWebMessage
) {
  try {
    webRef.current?.postMessage(JSON.stringify(msg))
  } catch {}
}
