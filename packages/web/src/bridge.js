// Utilities to communicate with the React Native WebView

export function subscribeToNativeMessages(handler) {
  const onMessage = (event) => {
    try {
      const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data
      handler(data)
    } catch {}
  }
  document.addEventListener('message', onMessage)
  window.addEventListener('message', onMessage)
  return () => {
    document.removeEventListener('message', onMessage)
    window.removeEventListener('message', onMessage)
  }
}

export function postToNative(message) {
  try {
    window.ReactNativeWebView?.postMessage?.(JSON.stringify(message))
  } catch {}
}

export function signalWebReady() {
  postToNative({ type: 'web_ready' })
}

export function startExploration() {
  postToNative({ type: 'explore_start' })
}

export function stopExploration() {
  postToNative({ type: 'explore_stop' })
}
