export default function StatusOverlay({ pos, holesCount = 0 }) {
  const receiving = !!pos
  const lat = pos?.lat?.toFixed?.(5)
  const lng = pos?.lng?.toFixed?.(5)

  return (
    <div
      style={{
        position: 'fixed',
        left: 12,
        // iOS WKWebView 안전 영역을 고려해 상단 여백 보정
        top: 'calc(env(safe-area-inset-top, 0px) + 12px)',
        zIndex: 9999,
        background: 'rgba(0,0,0,0.6)',
        color: '#fff',
        padding: '8px 10px',
        borderRadius: 8,
        fontSize: 12,
        lineHeight: 1.4,
        pointerEvents: 'none',
        backdropFilter: 'blur(2px)',
      }}
    >
      <div><strong>위치</strong>: {receiving ? '수신 중' : '대기 중'}</div>
      {receiving && (
        <div>
          {lat}, {lng}
        </div>
      )}
      <div>저장된 구멍: {holesCount}</div>
    </div>
  )
}
