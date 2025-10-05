import { useEffect, useRef } from 'react'

// DOM 상단(SVG) 오버레이 + OverlayView는 좌표 변환만 사용하는 방식
// - SVG는 지도 컨테이너 위에 절대 배치됨(pointerEvents: none)
// - OverlayView(Subclass)는 getProjection()을 얻기 위해서만 setMap(map)

export default function FogOverlay({ map, holes = [] }) {
  const svgRef = useRef(null)
  const holesGroupRef = useRef(null)
  const maskHolesGroupRef = useRef(null)
  const updaterRef = useRef(null)

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
        const holesGroup = holesGroupRef.current // not used when mask를 기본으로 사용
        const maskGroup = maskHolesGroupRef.current
        if (!width || !height || !maskGroup) return

        // reset
        maskGroup.innerHTML = ''
        const frag = document.createDocumentFragment()

        const addCircle = (g, cx, cy, r, fill) => {
          const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle')
          c.setAttribute('cx', String(cx))
          c.setAttribute('cy', String(cy))
          c.setAttribute('r', String(r))
          c.setAttribute('fill', fill)
          g.appendChild(c)
        }

        for (const h of this.holes) {
          const ll = new google.maps.LatLng(h.latitude, h.longitude)
          const pt = proj.fromLatLngToContainerPixel(ll)
          if (!pt) continue

          // 50m → px (정확도 우선: geometry.computeOffset 사용)
          let r = 0
          try {
            const east = google.maps.geometry.spherical.computeOffset(ll, 50, 90)
            const p0 = proj.fromLatLngToContainerPixel(ll)
            const p1 = proj.fromLatLngToContainerPixel(east)
            r = p0 && p1 ? Math.hypot(p1.x - p0.x, p1.y - p0.y) : 0
          } catch {}
          if (r <= 0) continue

          // 화면 밖은 스킵
          if (pt.x + r < 0 || pt.x - r > width || pt.y + r < 0 || pt.y - r > height) continue

          // 마스크: 검정(투명) 원을 그리고, 그룹에 블러 필터를 적용해 부드러운 경계.
          addCircle(frag, pt.x, pt.y, r, '#000')
        }
        maskGroup.appendChild(frag)
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
          <feGaussianBlur stdDeviation="12" />
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
