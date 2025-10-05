import { StatusBar } from 'expo-status-bar'
import React, { useEffect, useRef, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { WebView } from 'react-native-webview'
import { getWebUrl } from './src/utils/url'
import { postToWeb } from './src/utils/webviewBridge'
import { watchLocation } from './src/services/location'
import { addPointIfFarEnough, getAll, getLastSentTs, getPendingSinceTs, setLastSentTs } from './src/services/track'
import { startBackgroundUpdates, stopBackgroundUpdates } from './src/services/bgLocation'
import AsyncStorage from '@react-native-async-storage/async-storage'

export default function App() {
  const uri = getWebUrl()
  const webRef = useRef<WebView>(null)
  const [webReady, setWebReady] = useState(false)
  const queueRef = useRef<any[]>([])
  const [exploreActive, setExploreActive] = useState(false)
  const exploreActiveRef = useRef(false)
  const EXPLORE_KEY = '@onsegil/exploreActive'
  const replayTimerRef = useRef<any>(null)
  const isReplayingRef = useRef(false)

  const send = (msg: any) => {
    if (webReady) {
      postToWeb(webRef, msg)
    } else {
      queueRef.current.push(msg)
    }
  }

  // Load persisted exploration flag on app start
  useEffect(() => {
    (async () => {
      try {
        const v = await AsyncStorage.getItem(EXPLORE_KEY)
        const active = v === '1'
        exploreActiveRef.current = active
        setExploreActive(active)
        if (active) {
          startBackgroundUpdates().catch(() => {})
        }
      } catch {}
    })()
  }, [])

  useEffect(() => {
    let stop: undefined | (() => void)
    if (!webReady) return
    (async () => {
      // Foreground continuous location (UI updates only)
      stop = await watchLocation(async (msg) => {
        send(msg)
        if (exploreActiveRef.current) {
          const delta = await addPointIfFarEnough({
            lat: msg.coords.latitude,
            lng: msg.coords.longitude,
            ts: msg.timestamp,
          })
          if (delta && delta.length) {
            send({ type: 'holes_add', points: delta })
            await setLastSentTs(delta[0].ts)
          }
        }
      })

      // Replay pending stored points sequentially
      const last = await getLastSentTs()
      const pending = await getPendingSinceTs(last)
      if (pending.length) {
        isReplayingRef.current = true
        let i = 0
        replayTimerRef.current = setInterval(async () => {
          if (i >= pending.length) {
            clearInterval(replayTimerRef.current)
            replayTimerRef.current = null
            isReplayingRef.current = false
            return
          }
          const p = pending[i++]
          send({ type: 'holes_add', points: [p] })
          await setLastSentTs(p.ts)
        }, 300)
      }
    })()
    return () => {
      if (stop) stop()
      if (replayTimerRef.current) clearInterval(replayTimerRef.current)
      isReplayingRef.current = false
    }
  }, [webReady])

  return (
    <View style={styles.container}>
      <StatusBar style="auto" />
      <WebView
        ref={webRef}
        source={{ uri }}
        style={styles.webview}
        originWhitelist={["*"]}
        allowsInlineMediaPlayback
        startInLoadingState
        javaScriptEnabled
        domStorageEnabled
        onLoadEnd={() => {
          // Fallback: if web doesn't send explicit ready, still flush soon after load
          setWebReady((prev) => {
            if (!prev) {
              // flush queued messages
              queueRef.current.forEach((m) => postToWeb(webRef, m))
              queueRef.current = []
            }
            // 웹에 탐험 상태 알림
            send({ type: 'explore_status', active: exploreActiveRef.current })
            return true
          })
        }}
        onMessage={(e) => {
          try {
            const data = JSON.parse(e.nativeEvent.data)
            if (data?.type === 'web_ready') {
              setWebReady((prev) => {
                // flush queued messages once
                if (!prev) {
                  queueRef.current.forEach((m) => postToWeb(webRef, m))
                  queueRef.current = []
                }
                // 웹 준비 시 탐험 상태 통지
                send({ type: 'explore_status', active: exploreActiveRef.current })
                return true
              })
            }
            if (data?.type === 'explore_start') {
              exploreActiveRef.current = true
              setExploreActive(true)
              AsyncStorage.setItem(EXPLORE_KEY, '1').catch(() => {})
              send({ type: 'explore_status', active: true })
              // Start background updates
              startBackgroundUpdates().catch(() => {})
            }
            if (data?.type === 'explore_stop') {
              exploreActiveRef.current = false
              setExploreActive(false)
              AsyncStorage.setItem(EXPLORE_KEY, '0').catch(() => {})
              send({ type: 'explore_status', active: false })
              stopBackgroundUpdates().catch(() => {})
            }
          } catch {}
        }}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  webview: {
    flex: 1,
  },
});
