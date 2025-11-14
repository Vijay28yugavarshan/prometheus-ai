import React, { useState } from 'react'
import Chat from './components/Chat'
import Admin from './components/Admin'

export default function App() {
  const [view, setView] = useState('chat')
  return (
    <div style={{padding:20}}>
      <nav style={{display:'flex', gap:10, marginBottom:20}}>
        <button onClick={()=>setView('chat')}>Chat</button>
        <button onClick={()=>setView('admin')}>Admin</button>
      </nav>
      {view === 'chat' ? <Chat /> : <Admin />}
    </div>
  )
}
