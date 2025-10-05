import { useEffect, useRef } from 'react'

// DOM 상단(SVG) 오버레이 + OverlayView는 좌표 변환만 사용하는 방식
// - SVG는 지도 컨테이너 위에 절대 배치됨(pointerEvents: none)
// - OverlayView(Subclass)는 getProjection()을 얻기 위해서만 setMap(map)

export default function FogOverlay({ map, holes = [] }) {
  const svgRef = useRef(null)
  const holesGroupRef = useRef(null)
  const holesPathRef = useRef(null)
  const maskHolesGroupRef = useRef(null)
  const updaterRef = useRef(null)
  const maskBlurRef = useRef(null)
  const interactingRef = useRef(false)

  // OverlayView를 이용해 projection을 얻고, rAF로 픽셀 위치 갱신
  useEffect(() => {
    if (!map || !window.google) {
      return
    }

    class HoleUpdater extends google.maps.OverlayView {
      holes = []
      _raf = null

      onAdd() {}
      onRemove() {}

      draw = () => {
        if (this._raf) cancelAnimationFrame(this._raf)
        this._raf = requestAnimationFrame(this.update)
      }

      setHoles = (next) => {
        this.holes = Array.isArray(next) ? next : []
        this.draw()
      }

      update = () => {
        const proj = this.getProjection()
        if (!proj || !svgRef.current) return
        const mapDiv = map.getDiv()
        const width = mapDiv?.offsetWidth || 0
        const height = mapDiv?.offsetHeight || 0
        const maskGroup = maskHolesGroupRef.current
        const pathEl = holesPathRef.current
        if (!width || !height || !maskGroup || !pathEl) return

        // 동적 블러 강도(고배율에서 과도한 페인트 방지)
        try {
          const zoom = map.getZoom?.() ?? 15
          // 상호작용 중이면 블러를 더 낮춰 페인트 비용 절감
          const base = Math.max(4, Math.min(10, 12 - (zoom - 12)))
          const std = interactingRef.current ? Math.max(3, base - 2) : base
          if (maskBlurRef.current) maskBlurRef.current.setAttribute('stdDeviation', String(std))
        } catch {}

        // 하나의 path로 모든 홀을 표현 (even-odd 규칙)
        let d = ''

        // meters per pixel 근사치(빠름)
        const center = map.getCenter?.()
        const latForMpp = center ? center.lat() : 0
        const zoom = map.getZoom?.() ?? 15
        const metersPerPixel = 156543.03392 * Math.cos((latForMpp * Math.PI) / 180) / Math.pow(2, zoom)

        for (const h of this.holes) {
          const ll = new google.maps.LatLng(h.latitude, h.longitude)
          const pt = proj.fromLatLngToContainerPixel(ll)
          if (!pt) continue

          // 50m → px(근사)
          const r = 50 / metersPerPixel
          if (r <= 0) continue

          // 화면 밖은 스킵
          if (pt.x + r < 0 || pt.x - r > width || pt.y + r < 0 || pt.y - r > height) continue

          // 원을 경로(아크)로 추가
          d += ` M${pt.x} ${pt.y} m ${-r},0 a ${r},${r} 0 1,0 ${r * 2},0 a ${r},${r} 0 1,0 ${-r * 2},0 Z`
        }
        if (d) {
          pathEl.setAttribute('d', d)
          pathEl.style.display = ''
        } else {
          pathEl.style.display = 'none'
        }
      }
    }

    const updater = new HoleUpdater()
    updater.setMap(map)
    updaterRef.current = updater

    // rAF로 이벤트 폭주를 1프레임 1회로 스로틀
    let rafId = null
    const schedule = () => {
      if (rafId) cancelAnimationFrame(rafId)
      rafId = requestAnimationFrame(() => updater.draw())
    }

    // 지도의 상태 변화에 촘촘히 반응하도록 다양한 이벤트를 구독
    const listeners = [
      google.maps.event.addListener(map, 'center_changed', schedule),
      google.maps.event.addListener(map, 'bounds_changed', schedule),
      google.maps.event.addListener(map, 'zoom_changed', schedule),
      google.maps.event.addListener(map, 'drag', schedule),
      google.maps.event.addListener(map, 'idle', schedule),
    ]

    // 터치/마우스 이동 중에도 즉시 반응하도록 DOM 레벨 이벤트도 보강
    const mapDiv = map.getDiv()
    const onStart = () => { interactingRef.current = true; schedule() }
    const onMove = () => schedule()
    const onEnd = () => { interactingRef.current = false; schedule() }
    mapDiv.addEventListener('touchstart', onStart, { passive: true })
    mapDiv.addEventListener('mousedown', onStart, { passive: true })
    mapDiv.addEventListener('touchmove', onMove, { passive: true })
    mapDiv.addEventListener('mousemove', onMove, { passive: true })
    mapDiv.addEventListener('touchend', onEnd, { passive: true })
    mapDiv.addEventListener('mouseup', onEnd, { passive: true })

    const resize = () => schedule()
    window.addEventListener('resize', resize)

    return () => {
      window.removeEventListener('resize', resize)
      mapDiv.removeEventListener('touchstart', onStart)
      mapDiv.removeEventListener('mousedown', onStart)
      mapDiv.removeEventListener('touchmove', onMove)
      mapDiv.removeEventListener('mousemove', onMove)
      mapDiv.removeEventListener('touchend', onEnd)
      mapDiv.removeEventListener('mouseup', onEnd)
      listeners.forEach(l => google.maps.event.removeListener(l))
      if (rafId) cancelAnimationFrame(rafId)
      updater.setMap(null)
      updaterRef.current = null
    }
  }, [map])

  // holes 변경 시 업데이트
  useEffect(() => {
    if (updaterRef.current) updaterRef.current.setHoles(holes)
  }, [holes])

  // SVG 오버레이 (지도 컨테이너의 상단에 절대 배치되어야 함)
  return (
    <svg
      ref={svgRef}
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 1000 }}
    >
      <defs>
        {/* 마스크: 검정(구멍) 원 + 가우시안 블러로 페더링 → 겹치면 자연스럽게 합집합 */}
        <filter id="maskBlur" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur ref={maskBlurRef} stdDeviation="10" />
        </filter>
        <mask id="fogMask">
          <rect width="100%" height="100%" fill="white" />
          <g ref={maskHolesGroupRef} filter="url(#maskBlur)">
            <path ref={holesPathRef} fill="#000" fillRule="nonzero" />
          </g>
        </mask>
      </defs>

      {/* 검은 안개 (mask 적용) */}
      <rect width="100%" height="100%" fill="rgba(0,0,0,0.75)" mask="url(#fogMask)" />
      {/* blend 방식 폴백은 비활성화(겹침 시 밝아지는 현상 방지) */}
      <g ref={holesGroupRef} style={{ display: 'none' }} />
    </svg>
  )
}
