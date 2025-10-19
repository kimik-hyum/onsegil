import { useEffect, useMemo, useRef, useState } from 'react'
import { GoogleMap, Marker, useJsApiLoader } from '@react-google-maps/api'
import { subscribeToNativeMessages, signalWebReady, startExploration, stopExploration } from './bridge'
import FogOverlay from './overlay/FogOverlay'
import MultiHoleOverlay from './overlay/MultiHoleOverlay'
import StatusOverlay from './components/StatusOverlay'

const containerStyle = { width: '100vw', height: '100vh' }
const defaultCenter = { lat: 37.5665, lng: 126.9780 } // Seoul

export default function App() {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY

  const { isLoaded, loadError } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: apiKey || '',
    libraries: ['geometry'],
  })

  const [pos, setPos] = useState(null)
  const mapRef = useRef(null)
  const [mapReady, setMapReady] = useState(false)
  const [holes, setHoles] = useState([])
  const [manualHoles, setManualHoles] = useState([]) // UI로 추가한 로컬 HOLE들
  const [exploring, setExploring] = useState(false)
  const center = useMemo(() => (pos ? { lat: pos.lat, lng: pos.lng } : defaultCenter), [pos])
  // 퍼포먼스 검증용 고정 HOLE: 경복궁 일대 25x20 그리드(총 500개)
  const staticHoles = useMemo(() => {
    const baseLat = 37.579617
    const baseLng = 126.977041
    const rows = 20
    const cols = 25
    const latStep = 0.00018
    const lngStep = 0.00022
    const jitter = 0.00003
    const out = []
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const idx = r * cols + c
        const latOffset = (r - (rows - 1) / 2) * latStep + Math.sin(idx) * jitter
        const lngOffset = (c - (cols - 1) / 2) * lngStep + Math.cos(idx) * jitter
        out.push({
          latitude: baseLat + latOffset,
          longitude: baseLng + lngOffset,
        })
      }
    }
    return out
  }, [])

  const addHoleAtCenter = () => {
    if (!mapRef.current) return
    const c = mapRef.current.getCenter()
    if (!c) return
    setManualHoles((prev) => [
      ...prev,
      { latitude: c.lat(), longitude: c.lng() },
    ])
  }

  const toggleExplore = () => {
    if (exploring) {
      stopExploration()
    } else {
      startExploration()
    }
    // 낙관적 UI 업데이트 (네이티브에서 explore_status로 확정 예정)
    setExploring((v) => !v)
  }

  useEffect(() => {
    // Notify native that the web app is mounted and ready to receive messages
    signalWebReady()
    return subscribeToNativeMessages((data) => {
      if (data?.type === 'location' && data?.coords) {
        const { latitude, longitude } = data.coords
        setPos({ lat: latitude, lng: longitude })
      }
      if (data?.type === 'explore_status' && typeof data.active === 'boolean') {
        setExploring(!!data.active)
      }
      if (data?.type === 'holes_add' && Array.isArray(data.points)) {
        setHoles((prev) => [...prev, ...data.points])
      }
      if (data?.type === 'holes_sync' && Array.isArray(data.points)) {
        setHoles(data.points)
      }
      if (data?.type === 'holes_clear') {
        setHoles([])
      }
    })
  }, [])

  if (loadError) return <div style={containerStyle}>지도를 불러오지 못했습니다.</div>
  if (!isLoaded) return <div style={containerStyle}>지도를 불러오는 중…</div>

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh' }}>
      <GoogleMap
        mapContainerStyle={containerStyle}
        center={center}
        zoom={12}
        onLoad={(map) => {
          console.log('mapLoad', map)
          mapRef.current = map
          setMapReady(true)
          // 별도 지오메트리 계산 불필요 (native OverlayView가 pane 전체를 덮음)
        }}
        onUnmount={() => {
          mapRef.current = null
          setMapReady(false)
        }}
        options={{
          fullscreenControl: false,
          mapTypeControl: false,
          streetViewControl: false,
        }}
      >
        {/* 현재 위치 마커는 위치 수신 시에만 */}
        {pos && (
          <Marker
            position={center}
            icon={{
              path: google.maps.SymbolPath.CIRCLE,
              scale: 6,
              fillColor: '#1e90ff',
              fillOpacity: 1,
              strokeColor: '#ffffff',
              strokeWeight: 2,
            }}
          />
        )}
      </GoogleMap>
      {/* DOM 상단 SVG 오버레이: 지도 컨테이너 위 절대 배치 */}
      {mapReady && (
        <FogOverlay
          map={mapRef.current}
          holes={[
            ...staticHoles,
            ...(pos ? [{ latitude: pos.lat, longitude: pos.lng }] : []),
            ...holes.map((p) => ({ latitude: p.lat, longitude: p.lng })),
            ...manualHoles,
          ]}
        />
      )}
      {/* 상태 오버레이: 화면 고정 표시 */}
      <StatusOverlay pos={pos} holesCount={staticHoles.length + holes.length + manualHoles.length} />
      {/* 상단 버튼: 현재 화면 중심에 HOLE 추가 */}
      <button
        onClick={addHoleAtCenter}
        style={{
          position: 'absolute',
          // iOS WKWebView 상단 안전영역 보정
          top: 'calc(env(safe-area-inset-top, 0px) + 12px)',
          right: 12,
          zIndex: 10001,
          padding: '8px 10px',
          borderRadius: 8,
          border: '1px solid rgba(255,255,255,0.5)',
          background: 'rgba(0,0,0,0.55)',
          color: '#fff',
          cursor: 'pointer',
        }}
      >
        홀 추가
      </button>
      {/* 상단 버튼: 탐험 시작/종료 토글 */}
      <button
        onClick={toggleExplore}
        style={{
          position: 'absolute',
          top: 'calc(env(safe-area-inset-top, 0px) + 12px)',
          left: 12,
          zIndex: 10001,
          padding: '8px 10px',
          borderRadius: 8,
          border: exploring ? '1px solid rgba(255,90,90,0.7)' : '1px solid rgba(255,255,255,0.5)',
          background: exploring ? 'rgba(220,0,0,0.6)' : 'rgba(0,0,0,0.55)',
          color: '#fff',
          cursor: 'pointer',
        }}
      >
        {exploring ? '탐험 종료' : '탐험 시작'}
      </button>
    </div>
  )
}
