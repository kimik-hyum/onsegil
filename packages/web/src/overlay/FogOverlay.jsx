import { useEffect, useRef } from 'react'

// DOM 상단(SVG) 오버레이 + OverlayView는 좌표 변환만 사용하는 방식
// - SVG는 지도 컨테이너 위에 절대 배치됨(pointerEvents: none)
// - OverlayView(Subclass)는 getProjection()을 얻기 위해서만 setMap(map)

export default function FogOverlay({ map, holes = [] }) {
  const svgRef = useRef(null)
  const holesGroupRef = useRef(null)
  const maskHolesGroupRef = useRef(null)
  const updaterRef = useRef(null)
  const circlesPoolRef = useRef([])
  const maskBlurRef = useRef(null)

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
        if (!width || !height || !maskGroup) return

        // 동적 블러 강도(고배율에서 과도한 페인트 방지)
        try {
          const zoom = map.getZoom?.() ?? 15
          const std = Math.max(4, Math.min(10, 12 - (zoom - 12)))
          if (maskBlurRef.current) maskBlurRef.current.setAttribute('stdDeviation', String(std))
        } catch {}

        const pool = circlesPoolRef.current
        let visible = 0

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

          // 풀 기반 재사용
          let el = pool[visible]
          if (!el) {
            el = document.createElementNS('http://www.w3.org/2000/svg', 'circle')
            el.setAttribute('fill', '#000')
            maskGroup.appendChild(el)
            pool[visible] = el
          }
          el.setAttribute('cx', String(pt.x))
          el.setAttribute('cy', String(pt.y))
          el.setAttribute('r', String(r))
          el.style.display = ''
          visible++
        }

        // 남는 원 숨김
        for (let i = visible; i < pool.length; i++) {
          const el = pool[i]
          if (el) el.style.display = 'none'
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
    const domMove = () => schedule()
    mapDiv.addEventListener('touchmove', domMove, { passive: true })
    mapDiv.addEventListener('mousemove', domMove, { passive: true })

    const resize = () => schedule()
    window.addEventListener('resize', resize)

    return () => {
      window.removeEventListener('resize', resize)
      mapDiv.removeEventListener('touchmove', domMove)
      mapDiv.removeEventListener('mousemove', domMove)
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
          <g ref={maskHolesGroupRef} filter="url(#maskBlur)" />
        </mask>
      </defs>

      {/* 검은 안개 (mask 적용) */}
      <rect width="100%" height="100%" fill="rgba(0,0,0,0.75)" mask="url(#fogMask)" />
      {/* blend 방식 폴백은 비활성화(겹침 시 밝아지는 현상 방지) */}
      <g ref={holesGroupRef} style={{ display: 'none' }} />
    </svg>
  )
}
