import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

function latLngToContainerPixel(map, latLng) {
  try {
    const projection = map.getProjection()
    const bounds = map.getBounds()
    if (!projection || !bounds) return null
    const ne = projection.fromLatLngToPoint(bounds.getNorthEast())
    const sw = projection.fromLatLngToPoint(bounds.getSouthWest())
    const scale = Math.pow(2, map.getZoom())
    const worldPoint = projection.fromLatLngToPoint(new google.maps.LatLng(latLng.lat, latLng.lng))
    const x = (worldPoint.x - sw.x) * scale
    const y = (worldPoint.y - ne.y) * scale
    return { x, y }
  } catch {
    return null
  }
}

function metersToPixels(map, latLng, meters) {
  try {
    const offset = google.maps.geometry.spherical.computeOffset(
      new google.maps.LatLng(latLng.lat, latLng.lng),
      meters,
      90
    )
    const c = latLngToContainerPixel(map, latLng)
    const e = latLngToContainerPixel(map, { lat: offset.lat(), lng: offset.lng() })
    if (!c || !e) return 0
    const dx = e.x - c.x
    const dy = e.y - c.y
    return Math.sqrt(dx * dx + dy * dy)
  } catch {
    return 0
  }
}

export default function MultiHoleOverlay({ map, points, radiusMeters = 50, fade = 60, opacity = 0.7 }) {
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [circles, setCircles] = useState([])
  const raf = useRef(null)
  const maskId = useId().replace(/[^a-zA-Z0-9_-]/g, '')

  useEffect(() => {
    if (!map) return
    const div = map.getDiv()
    if (!div) return

    const schedule = () => {
      if (raf.current) cancelAnimationFrame(raf.current)
      raf.current = requestAnimationFrame(update)
    }

    const update = () => {
      setSize({ w: div.clientWidth, h: div.clientHeight })
      if (!points?.length) {
        setCircles([])
        return
      }
      const out = []
      for (const p of points) {
        const px = latLngToContainerPixel(map, p)
        if (!px) continue
        const r = Math.max(1, metersToPixels(map, p, radiusMeters))
        const inner = Math.max(1, r - fade)
        out.push({ x: px.x, y: px.y, r, inner })
      }
      setCircles(out)
    }

    schedule()
    const listeners = [
      map.addListener('idle', schedule),
      map.addListener('center_changed', schedule),
      map.addListener('zoom_changed', schedule),
      map.addListener('bounds_changed', schedule),
      map.addListener('projection_changed', schedule),
    ]
    window.addEventListener('resize', schedule)
    return () => {
      listeners.forEach((l) => google.maps.event.removeListener(l))
      window.removeEventListener('resize', schedule)
      if (raf.current) cancelAnimationFrame(raf.current)
    }
  }, [map, JSON.stringify(points), radiusMeters, fade])

  const container = map?.getDiv?.()
  if (!container) return null

  const { w, h } = size

  // Build one path: full rect minus multiple circular holes
  let d = `M0 0H${w}V${h}H0Z`
  for (const c of circles) {
    const r = Math.max(1, c.inner)
    d += ` M${c.x} ${c.y} m ${-r},0 a ${r},${r} 0 1,0 ${r * 2},0 a ${r},${r} 0 1,0 ${-r * 2},0 Z`
  }

  return createPortal(
    <svg width={w} height={h} style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 1000000 }}>
      <defs>
        <filter id={`blur-${maskId}`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur in="SourceGraphic" stdDeviation={Math.max(0.5, fade / 4)} />
        </filter>
      </defs>
      <path d={d} fill={`rgba(0,0,0,${opacity})`} fillRule="evenodd" filter={`url(#blur-${maskId})`} />
    </svg>,
    container
  )
}
