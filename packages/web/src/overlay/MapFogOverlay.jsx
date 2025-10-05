import { useEffect, useMemo, useState } from 'react'
import { OverlayView } from '@react-google-maps/api'

// React OverlayView 표준 방식: 지도 중심을 앵커로 두고, 컨테이너 크기를 map div 크기에 맞춘 뒤
// getPixelPositionOffset으로 절반씩 음수 보정하여 항상 현재 뷰포트를 덮습니다.

export default function MapFogOverlay({ map, opacity = 0.7, pane = 'floatPane' }) {
  const [center, setCenter] = useState(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const key = useMemo(() => {
    if (!center) return 'fog-0'
    return `fog-${center.lat.toFixed(6)}-${center.lng.toFixed(6)}-${size.w}x${size.h}`
  }, [center, size.w, size.h])

  useEffect(() => {
    if (!map) return
    const div = map.getDiv()
    const update = () => {
      const c = map.getCenter()
      if (!c) return
      setCenter({ lat: c.lat(), lng: c.lng() })
      setSize({ w: div.clientWidth, h: div.clientHeight })
    }
    update()
    const listeners = [
      map.addListener('center_changed', update),
      map.addListener('bounds_changed', update),
      map.addListener('zoom_changed', update),
      map.addListener('idle', update),
      map.addListener('drag', update),
    ]
    const onResize = () => setSize({ w: div.clientWidth, h: div.clientHeight })
    window.addEventListener('resize', onResize)
    return () => {
      listeners.forEach((l) => google.maps.event.removeListener(l))
      window.removeEventListener('resize', onResize)
    }
  }, [map])

  if (!center || !size.w || !size.h) return null

  return (
    <OverlayView
      key={key}
      position={center}
      mapPaneName={pane}
      getPixelPositionOffset={() => ({ x: -Math.round(size.w / 2), y: -Math.round(size.h / 2) })}
    >
      <svg width={size.w} height={size.h} style={{ display: 'block', pointerEvents: 'none' }}>
        <rect x="0" y="0" width="100%" height="100%" fill={`rgba(0,0,0,${opacity})`} />
      </svg>
    </OverlayView>
  )
}
