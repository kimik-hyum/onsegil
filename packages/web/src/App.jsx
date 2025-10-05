import { useState } from 'react'
import './App.css'

function App() {
  const [count, setCount] = useState(0)

  return (
    <div className="App">
      <h1>Vite + React (@onsegil/web)</h1>
      <p>모노레포 워크스페이스가 정상 동작합니다.</p>
      <button onClick={() => setCount((c) => c + 1)}>
        count is {count}
      </button>
    </div>
  )
}

export default App

