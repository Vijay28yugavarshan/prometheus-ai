import React, { useState, useEffect, useRef } from 'react'

export default function Chat() {
  const [messages, setMessages] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('prometheus_messages') || 'null') || [{ role: 'assistant', content: '# Prometheus ready.' }]
    } catch { return [{ role: 'assistant', content: '# Prometheus ready.' }] }
  })
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const esRef = useRef(null)
  const endRef = useRef(null)

  useEffect(()=>{ localStorage.setItem('prometheus_messages', JSON.stringify(messages)) }, [messages])
  useEffect(()=> endRef.current?.scrollIntoView({behavior:'smooth'}), [messages])

  function appendChunk(text) {
    setMessages(prev => {
      const last = prev[prev.length-1]
      if (last && last.role==='assistant' && last.meta && last.meta.streaming) {
        const copy = [...prev]; copy[copy.length-1] = {...last, content: last.content + text}; return copy;
      } else {
        return [...prev, {role:'assistant', content:text, meta:{streaming:true}}]
      }
    })
  }

  function finalize() {
    setMessages(prev => prev.map(m=> m.role==='assistant' && m.meta && m.meta.streaming ? {...m, meta:{...m.meta,streaming:false}} : m))
  }

  function startSSE(prompt) {
    if (esRef.current) try{ esRef.current.close() }catch{}
    const es = new EventSource(`/api/stream-prompt?prompt=${encodeURIComponent(prompt)}&model=gpt-4o-mini`)
    esRef.current = es
    es.onmessage = (e) => {
      if (!e.data) return
      try {
        const p = JSON.parse(e.data)
        if (p.type==='chunk') appendChunk(p.text||'')
        else if (p.type==='search') setMessages(prev=>[...prev, {role:'assistant', content:'🔎 Search results:\n\n' + p.results.map((r,i)=>`${i+1}. ${r.title} — ${r.url}\n${r.snippet}`).join('\n\n')}])
        else if (p.type==='memory') setMessages(prev=>[...prev, {role:'assistant', content:'🧠 Memories:\n\n' + (p.memories||[]).join('\n')}])
        else if (p.type==='media') setMessages(prev=>[...prev, {role:'assistant', content:`[Media] ${p.media.description}`, media:p.media}])
        else if (p.type==='done') { finalize(); setIsLoading(false) }
        else if (p.type==='error') { appendChunk('\n⚠️ Error: '+(p.error||'unknown')); finalize(); setIsLoading(false) }
      } catch(err) { appendChunk('\n'+e.data) }
    }
    es.onerror = () => { try{ es.close() }catch{}; esRef.current=null; setIsLoading(false); appendChunk('\n⚠️ SSE connection closed') }
  }

  async function send() {
    const prompt = input.trim(); if (!prompt) return
    setMessages(prev=>[...prev,{role:'user', content:prompt}]); setInput(''); setIsLoading(true)
    appendChunk('\n')
    startSSE(prompt)
  }

  return (
    <div className="chat-container">
      <div className="messages">
        {messages.map((m,i)=>(<div key={i} className={`bubble ${m.role}`} style={{whiteSpace:'pre-wrap'}}>{m.content}{m.media && <img src={m.media.url} alt={m.media.description} style={{maxWidth:'100%',marginTop:8}}/>}</div>))}
        <div ref={endRef}></div>
      </div>
      <div style={{display:'flex',gap:8,marginTop:10}}>
        <input value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==='Enter' && send()} style={{flex:1,padding:10,borderRadius:8}} placeholder="Ask Prometheus..." />
        <button onClick={send} disabled={isLoading || !input.trim()} style={{padding:8}}>{isLoading? '...':'Ask'}</button>
      </div>
    </div>
  )
}
