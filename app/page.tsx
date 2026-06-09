'use client'

import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'

type Status = 'cheio' | 'metade' | 'baixo' | 'vazio'

interface Item {
  id: number
  name: string
  status: Status
  position: number
}

const STATUSES: Status[] = ['cheio', 'metade', 'baixo', 'vazio']
const LABELS: Record<Status, string> = {
  cheio: 'Cheio', metade: 'Metade', baixo: 'Baixo', vazio: 'Vazio',
}

export default function Home() {
  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [newName, setNewName] = useState('')
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)
  const [copied, setCopied] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    loadItems()
    const channel = supabase
      .channel('almox-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'almox_items' }, () => loadItems())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])

  useEffect(() => {
    if (showModal) setTimeout(() => inputRef.current?.focus(), 60)
  }, [showModal])

  async function loadItems() {
    const { data } = await supabase.from('almox_items').select('*').order('position')
    if (data) { setItems(data as Item[]); setLastUpdate(new Date()) }
    setLoading(false)
  }

  async function updateStatus(id: number, status: Status) {
    setItems(prev => prev.map(i => i.id === id ? { ...i, status } : i))
    setLastUpdate(new Date())
    await supabase.from('almox_items').update({ status }).eq('id', id)
  }

  async function addItem() {
    const name = newName.trim()
    if (!name) return
    const maxPos = items.length > 0 ? Math.max(...items.map(i => i.position)) + 1 : 0
    const { data } = await supabase
      .from('almox_items').insert({ name, status: 'cheio', position: maxPos }).select().single()
    if (data) { setItems(prev => [...prev, data as Item]); setLastUpdate(new Date()) }
    setNewName('')
    setShowModal(false)
  }

  async function deleteItem(id: number) {
    const item = items.find(i => i.id === id)
    if (!item) return
    if (!confirm(`Remover "${item.name}" da lista?`)) return
    setItems(prev => prev.filter(i => i.id !== id))
    await supabase.from('almox_items').delete().eq('id', id)
  }

  function copyReport() {
    const vazio  = items.filter(i => i.status === 'vazio')
    const baixo  = items.filter(i => i.status === 'baixo')
    const metade = items.filter(i => i.status === 'metade')
    const cheio  = items.filter(i => i.status === 'cheio')
    const today  = new Date().toLocaleDateString('pt-BR')

    let t = `RELATÓRIO DE ALMOXARIFADO — Colégio Eleve\n`
    t += `Data: ${today}\n`
    t += `${'─'.repeat(40)}\n\n`

    if (vazio.length > 0) {
      t += `🔴 ACABOU — pedir com urgência:\n`
      vazio.forEach(i => t += `  • ${i.name}\n`)
      t += '\n'
    }
    if (baixo.length > 0) {
      t += `🟠 QUASE ACABANDO — pedir em breve:\n`
      baixo.forEach(i => t += `  • ${i.name}\n`)
      t += '\n'
    }
    if (metade.length > 0) {
      t += `🟡 NA METADE — pedir no próximo semestre:\n`
      metade.forEach(i => t += `  • ${i.name}\n`)
      t += '\n'
    }
    if (cheio.length > 0) {
      t += `🟢 ESTOQUE OK (${cheio.length} itens):\n`
      cheio.forEach(i => t += `  • ${i.name}\n`)
    }

    navigator.clipboard.writeText(t)
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  const counts = STATUSES.reduce((acc, s) => {
    acc[s] = items.filter(i => i.status === s).length
    return acc
  }, {} as Record<Status, number>)

  const urgent  = items.filter(i => i.status === 'vazio' || i.status === 'baixo')
  const metade  = items.filter(i => i.status === 'metade')
  const cheio   = items.filter(i => i.status === 'cheio')

  const fmtDate = (d: Date) =>
    d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })

  return (
    <main>
      <div className="container">

        {/* Header */}
        <header className="header-card">
          <div>
            <h1>Controle de Almoxarifado</h1>
            <p>Colégio Eleve — registro de estoque de materiais</p>
          </div>
          <div className="logo">
            <svg width="22" height="22" fill="none" viewBox="0 0 24 24">
              <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" stroke="white" strokeWidth="2" strokeLinejoin="round"/>
              <path d="M9 22V12h6v10" stroke="white" strokeWidth="2" strokeLinejoin="round"/>
            </svg>
          </div>
        </header>

        <div className="layout">

          {/* ── Coluna principal ── */}
          <div className="main-col">

            {/* Summary */}
            <div className="summary">
              {STATUSES.map(s => (
                <div key={s} className={`summary-card s-${s}`}>
                  <div className="count">{counts[s] ?? 0}</div>
                  <div className="label">{LABELS[s]}</div>
                </div>
              ))}
            </div>

            {/* Items list */}
            <div className="items-card">
              <div className="items-header">
                <span className="items-title">Materiais</span>
                <div className="col-labels">
                  {STATUSES.map(s => <span key={s} className="col-label">{LABELS[s]}</span>)}
                </div>
              </div>

              {loading ? (
                <div className="loading">Carregando...</div>
              ) : items.length === 0 ? (
                <div className="empty">Nenhum item cadastrado.</div>
              ) : (
                items.map(item => (
                  <div key={item.id} className="item-row">
                    <span className="item-name">
                      <span className={`dot dot-${item.status}`} />
                      {item.name}
                    </span>
                    <div className="status-buttons">
                      {STATUSES.map(s => (
                        <button
                          key={s}
                          className={`status-btn${item.status === s ? ` active-${s}` : ''}`}
                          onClick={() => updateStatus(item.id, s)}
                        >
                          {LABELS[s]}
                        </button>
                      ))}
                    </div>
                    <button className="delete-btn" onClick={() => deleteItem(item.id)} title="Remover item">×</button>
                  </div>
                ))
              )}
            </div>

            <button className="add-btn" onClick={() => setShowModal(true)}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"/>
              </svg>
              Adicionar novo item
            </button>

            {lastUpdate && <p className="footer-ts">Última atualização: {fmtDate(lastUpdate)}</p>}
          </div>

          {/* ── Coluna de relatório ── */}
          <aside className="report-panel">
            <div className="report-header">
              <h2>Relatório</h2>
              <button className={`copy-btn${copied ? ' copied' : ''}`} onClick={copyReport}>
                {copied ? (
                  <>
                    <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                      <path d="M3 8l4 4 6-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    Copiado!
                  </>
                ) : (
                  <>
                    <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                      <rect x="5" y="5" width="9" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
                      <path d="M11 5V3.5A1.5 1.5 0 009.5 2h-6A1.5 1.5 0 002 3.5v6A1.5 1.5 0 003.5 11H5" stroke="currentColor" strokeWidth="1.5"/>
                    </svg>
                    Copiar
                  </>
                )}
              </button>
            </div>

            {/* Urgente */}
            <div className="report-section">
              <div className="report-section-label label-urgent">
                <span className="report-dot rdot-urgent" />
                Pedir com urgência
              </div>
              {urgent.length === 0 ? (
                <p className="report-empty">Nenhum item crítico</p>
              ) : (
                urgent.map(item => (
                  <div key={item.id} className="report-item">
                    <span className={`dot dot-${item.status}`} style={{ flexShrink: 0 }} />
                    <span className="report-item-name">{item.name}</span>
                    <span className={`report-badge badge-${item.status}`}>{LABELS[item.status]}</span>
                  </div>
                ))
              )}
            </div>

            {/* Metade */}
            <div className="report-section">
              <div className="report-section-label label-metade">
                <span className="report-dot rdot-metade" />
                Próximo semestre
              </div>
              <p className="report-section-desc">Itens na metade do estoque</p>
              {metade.length === 0 ? (
                <p className="report-empty">Nenhum item na metade</p>
              ) : (
                metade.map(item => (
                  <div key={item.id} className="report-item">
                    <span className="dot dot-metade" style={{ flexShrink: 0 }} />
                    <span className="report-item-name">{item.name}</span>
                  </div>
                ))
              )}
            </div>

            {/* Cheio */}
            <div className="report-section report-section-last">
              <div className="report-section-label label-cheio">
                <span className="report-dot rdot-cheio" />
                Estoque OK
              </div>
              {cheio.length === 0 ? (
                <p className="report-empty">Nenhum item cheio</p>
              ) : (
                <>
                  <p className="report-ok-count">{cheio.length} {cheio.length === 1 ? 'item com' : 'itens com'} estoque cheio</p>
                  <div className="report-ok-list">
                    {cheio.map(item => (
                      <span key={item.id} className="report-chip">{item.name}</span>
                    ))}
                  </div>
                </>
              )}
            </div>
          </aside>

        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setShowModal(false) }}>
          <div className="modal">
            <h3>Adicionar novo item</h3>
            <input
              ref={inputRef}
              type="text"
              placeholder="Nome do material..."
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addItem()}
              maxLength={80}
            />
            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => setShowModal(false)}>Cancelar</button>
              <button className="btn-confirm" onClick={addItem}>Adicionar</button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
