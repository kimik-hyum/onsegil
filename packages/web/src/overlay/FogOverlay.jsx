import { useEffect, useRef } from 'react'

// Canvas 오버레이: OverlayView는 좌표 변환 전용, Canvas는 맵 컨테이너 위에 배치
export default function FogOverlay({ map, holes = [] }) {
  const canvasRef = useRef(null)
  const updaterRef = useRef(null)
  const interactingRef = useRef(false)

  useEffect(() => {
    if (!map || !window.google) return

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
        const canvas = canvasRef.current
        if (!proj || !canvas) return

        const ctx = canvas.getContext('2d')
        const mapDiv = map.getDiv()
        if (!ctx || !mapDiv) return

        const width = mapDiv.clientWidth || 0
        const height = mapDiv.clientHeight || 0
        if (!width || !height) return

        const dpr = window.devicePixelRatio || 1
        const targetWidth = Math.max(1, Math.round(width * dpr))
        const targetHeight = Math.max(1, Math.round(height * dpr))
        if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
          canvas.width = targetWidth
          canvas.height = targetHeight
          canvas.style.width = `${width}px`
          canvas.style.height = `${height}px`
        }

        ctx.setTransform(1, 0, 0, 1, 0, 0)
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

        ctx.globalCompositeOperation = 'source-over'
        ctx.fillStyle = 'rgba(0,0,0,0.75)'
        ctx.fillRect(0, 0, width, height)

        const center = map.getCenter?.()
        const latForMpp = center ? center.lat() : 0
        const zoom = map.getZoom?.() ?? 15
        const metersPerPixel = 156543.03392 * Math.cos((latForMpp * Math.PI) / 180) / Math.pow(2, zoom)
        const baseRadiusPx = metersPerPixel > 0 ? 50 / metersPerPixel : 0

        if (!baseRadiusPx || !this.holes.length) {
          ctx.globalCompositeOperation = 'source-over'
          return
        }

        const baseCell = Math.max(24, Math.min(96, 64 - (zoom - 12) * 8))
        const cellSize = interactingRef.current ? baseCell * 1.5 : baseCell
        const grid = new Map()

        for (const h of this.holes) {
          const lat = h.latitude ?? h.lat
          const lng = h.longitude ?? h.lng
          if (typeof lat !== 'number' || typeof lng !== 'number') continue
          const ll = new google.maps.LatLng(lat, lng)
          const pt = proj.fromLatLngToContainerPixel(ll)
          if (!pt) continue
          const r = baseRadiusPx
          if (pt.x + r < 0 || pt.x - r > width || pt.y + r < 0 || pt.y - r > height) continue
          const gx = Math.floor(pt.x / cellSize)
          const gy = Math.floor(pt.y / cellSize)
          const key = `${gx}:${gy}`
          const cur = grid.get(key)
          if (cur) {
            cur.x += pt.x
            cur.y += pt.y
            cur.n += 1
          } else {
            grid.set(key, { x: pt.x, y: pt.y, n: 1 })
          }
        }

        const MAX_ARCS = interactingRef.current ? 250 : 400
        if (grid.size > MAX_ARCS) {
          const grid2 = new Map()
          const factor = 2
          for (const { x, y, n } of grid.values()) {
            const cx = x / n
            const cy = y / n
            const gx = Math.floor(cx / (cellSize * factor))
            const gy = Math.floor(cy / (cellSize * factor))
            const key = `${gx}:${gy}`
            const cur = grid2.get(key)
            if (cur) {
              cur.x += cx
              cur.y += cy
              cur.n += n
            } else {
              grid2.set(key, { x: cx, y: cy, n })
            }
          }
          grid.clear()
          for (const [k, v] of grid2) grid.set(k, v)
        }

        const entries = []
        for (const { x, y, n } of grid.values()) {
          const cx = x / n
          const cy = y / n
          const outer = Math.max(6, Math.min(baseRadiusPx * Math.sqrt(n), baseRadiusPx * 2.5))
          const soften = interactingRef.current ? 12 : 24
          const inner = Math.max(outer * 0.45, outer - soften)
          entries.push({ x: cx, y: cy, inner, outer })
        }

        if (!entries.length) {
          ctx.globalCompositeOperation = 'source-over'
          return
        }

        ctx.globalCompositeOperation = 'destination-out'
        for (const item of entries) {
          const gradient = ctx.createRadialGradient(item.x, item.y, item.inner, item.x, item.y, item.outer)
          gradient.addColorStop(0, 'rgba(0,0,0,1)')
          gradient.addColorStop(1, 'rgba(0,0,0,0)')
          ctx.fillStyle = gradient
          ctx.beginPath()
          ctx.arc(item.x, item.y, item.outer, 0, Math.PI * 2)
          ctx.fill()
        }
        ctx.globalCompositeOperation = 'source-over'
      }
    }

    const updater = new HoleUpdater()
    updater.setMap(map)
    updaterRef.current = updater

    let rafId = null
    const schedule = () => {
      if (rafId) cancelAnimationFrame(rafId)
      rafId = requestAnimationFrame(() => updater.draw())
    }

    const listeners = [
      google.maps.event.addListener(map, 'center_changed', schedule),
      google.maps.event.addListener(map, 'bounds_changed', schedule),
      google.maps.event.addListener(map, 'zoom_changed', schedule),
      google.maps.event.addListener(map, 'drag', schedule),
      google.maps.event.addListener(map, 'idle', schedule),
    ]

    const mapDiv = map.getDiv()
    const onStart = () => {
      interactingRef.current = true
      schedule()
    }
    const onMove = () => schedule()
    const onEnd = () => {
      interactingRef.current = false
      schedule()
    }

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
      listeners.forEach((l) => google.maps.event.removeListener(l))
      if (rafId) cancelAnimationFrame(rafId)
      updater.setMap(null)
      updaterRef.current = null
    }
  }, [map])

  useEffect(() => {
    if (updaterRef.current) updaterRef.current.setHoles(holes)
  }, [holes])

  return (
    <canvas
      ref={canvasRef}
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 1000 }}
    />
  )
}
