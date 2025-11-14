import React, { useState, useEffect } from 'react'

export default function Admin() {
  const [health, setHealth] = useState(null)
  const [memories, setMemories] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(()=>{ fetch('/api/health').then(r=>r.json()).then(setHealth).catch(()=>setHealth({ok:false})) },[])

  async function loadMemories() {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/memories')
      const data = await res.json()
      setMemories(data || [])
    } catch (e) {
      setMemories([])
    } finally { setLoading(false) }
  }

  return (
    <div>
      <h2>Admin Dashboard</h2>
      <div>Status: {health ? (health.ok ? 'OK' : 'Down') : 'Loading...'}</div>
      <div style={{marginTop:10}}>
        <button onClick={loadMemories} disabled={loading}>{loading ? 'Loading...' : 'Load Memories'}</button>
      </div>
      <div style={{marginTop:10}}>
        <h3>Stored Memories</h3>
        <ul>
          {memories.map(m=> (<li key={m.id}><strong>{m.namespace}</strong>: {m.text} <em>({new Date(m.created_at).toLocaleString()})</em></li>))}
        </ul>
      </div>
    </div>
  )
}
