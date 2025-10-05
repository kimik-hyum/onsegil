import { createPortal } from 'react-dom'

// 가장 단순한 형태의 SVG 오버레이(디버그용):
// 페이지(뷰포트) 전체를 덮는 고정(fixed) SVG를 document.body에 렌더합니다.
// 지도 내부 레이어 z-index 영향 없이 항상 위에서 보이도록 합니다.

export default function FullScreenHoleOverlay({ opacity = 0.75 }) {
  if (typeof document === 'undefined') return null
  const container = document.body
  return createPortal(
    <svg
      style={{
        position: 'fixed',
        inset: 0,
        width: '100vw',
        height: '100vh',
        pointerEvents: 'none',
        zIndex: 1000000,
      }}
    >
      <rect x="0" y="0" width="100%" height="100%" fill={`rgba(0,0,0,${opacity})`} />
    </svg>,
    container
  )
}
