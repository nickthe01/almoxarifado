'use client'

import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'

type Status = 'cheio' | 'metade' | 'baixo' | 'vazio'

interface Item {
  id: number
  name: string
  status: Status
  position: number
  category: string
  previous_status: string | null
  status_changed_at: string | null
}

const STATUSES: Status[] = ['cheio', 'metade', 'baixo', 'vazio']
const LABELS: Record<Status, string> = { cheio: 'Cheio', metade: 'Metade', baixo: 'Baixo', vazio: 'Vazio' }
const STATUS_RANK: Record<Status, number> = { cheio: 3, metade: 2, baixo: 1, vazio: 0 }
const DEFAULT_CATEGORIES = ['Papel', 'Modelagem', 'Decoração', 'Tintas', 'Adesivos', 'Outros']

function getTrend(item: Item): 'down' | 'up' | null {
  if (!item.previous_status || !item.status_changed_at) return null
  const days = (Date.now() - new Date(item.status_changed_at).getTime()) / 86400000
  if (days > 7) return null
  const prev = item.previous_status as Status
  if (!(prev in STATUS_RANK)) return null
  const diff = STATUS_RANK[item.status] - STATUS_RANK[prev]
  return diff < 0 ? 'down' : diff > 0 ? 'up' : null
}

export default function Home() {
  const [items, setItems]               = useState<Item[]>([])
  const [loading, setLoading]           = useState(true)
  const [search, setSearch]             = useState('')
  const [activeCategory, setActiveCat]  = useState('Todos')
  const [activeStatus, setActiveStatus] = useState<Status | 'todos'>('todos')
  const [showModal, setShowModal]       = useState(false)
  const [newName, setNewName]           = useState('')
  const [newCategory, setNewCategory]   = useState('Outros')
  const [deleteTarget, setDeleteTarget] = useState<Item | null>(null)
  const [editTarget, setEditTarget]     = useState<Item | null>(null)
  const [editName, setEditName]         = useState('')
  const [editCategory, setEditCategory] = useState('Outros')
  const [lastUpdate, setLastUpdate]     = useState<Date | null>(null)
  const [copied, setCopied]             = useState(false)
  const inputRef     = useRef<HTMLInputElement>(null)
  const editInputRef = useRef<HTMLInputElement>(null)

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

  useEffect(() => {
    if (editTarget) setTimeout(() => editInputRef.current?.focus(), 60)
  }, [editTarget])

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
      .from('almox_items')
      .insert({ name, status: 'cheio', position: maxPos, category: newCategory })
      .select().single()
    if (data) { setItems(prev => [...prev, data as Item]); setLastUpdate(new Date()) }
    setNewName('')
    setNewCategory('Outros')
    setShowModal(false)
  }

  function openEdit(item: Item) {
    setEditTarget(item)
    setEditName(item.name)
    setEditCategory(item.category)
  }

  async function saveEdit() {
    if (!editTarget) return
    const name = editName.trim()
    if (!name) return
    setItems(prev => prev.map(i => i.id === editTarget.id ? { ...i, name, category: editCategory } : i))
    await supabase.from('almox_items').update({ name, category: editCategory }).eq('id', editTarget.id)
    setEditTarget(null)
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    setItems(prev => prev.filter(i => i.id !== deleteTarget.id))
    await supabase.from('almox_items').delete().eq('id', deleteTarget.id)
    setDeleteTarget(null)
  }

  function copyReport() {
    const vazio  = items.filter(i => i.status === 'vazio')
    const baixo  = items.filter(i => i.status === 'baixo')
    const metade = items.filter(i => i.status === 'metade')
    const cheio  = items.filter(i => i.status === 'cheio')
    const today  = new Date().toLocaleDateString('pt-BR')
    let t = `RELATÓRIO DE ALMOXARIFADO — Colégio Eleve\nData: ${today}\n${'─'.repeat(40)}\n\n`
    if (vazio.length)  { t += `🔴 ACABOU — pedir com urgência:\n`;   vazio.forEach(i  => t += `  • ${i.name}\n`); t += '\n' }
    if (baixo.length)  { t += `🟠 QUASE ACABANDO — pedir em breve:\n`; baixo.forEach(i => t += `  • ${i.name}\n`); t += '\n' }
    if (metade.length) { t += `🟡 NA METADE — pedir no próximo semestre:\n`; metade.forEach(i => t += `  • ${i.name}\n`); t += '\n' }
    if (cheio.length)  { t += `🟢 ESTOQUE OK (${cheio.length} itens):\n`; cheio.forEach(i => t += `  • ${i.name}\n`) }
    navigator.clipboard.writeText(t)
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  // Derived
  const categorySet  = Array.from(new Set(items.map(i => i.category))).sort()
  const categories   = ['Todos', ...categorySet]
  const showCatTabs  = categorySet.length > 1

  const filtered = items.filter(i => {
    const matchSearch = i.name.toLowerCase().includes(search.toLowerCase())
    const matchCat    = activeCategory === 'Todos' || i.category === activeCategory
    const matchStatus = activeStatus === 'todos'   || i.status   === activeStatus
    return matchSearch && matchCat && matchStatus
  })

  const counts  = STATUSES.reduce((acc, s) => { acc[s] = items.filter(i => i.status === s).length; return acc }, {} as Record<Status, number>)
  const urgent  = items.filter(i => i.status === 'vazio' || i.status === 'baixo')
  const metade  = items.filter(i => i.status === 'metade')
  const cheio   = items.filter(i => i.status === 'cheio')

  const fmtDate = (d: Date) => d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })

  const hasFilter = search !== '' || activeStatus !== 'todos' || activeCategory !== 'Todos'

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

          {/* ── Main column ── */}
          <div className="main-col">

            {/* Toolbar */}
            <div className="toolbar">
              <div className="search-wrap">
                <svg className="search-icon" width="15" height="15" viewBox="0 0 16 16" fill="none">
                  <circle cx="6.5" cy="6.5" r="4.5" stroke="#aaa" strokeWidth="1.6"/>
                  <path d="M10.5 10.5l3 3" stroke="#aaa" strokeWidth="1.6" strokeLinecap="round"/>
                </svg>
                <input
                  className="search-input"
                  type="text"
                  placeholder="Buscar material..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
                {search && <button className="search-clear" onClick={() => setSearch('')}>×</button>}
              </div>
              <div className="status-pills">
                <button
                  className={`pill${activeStatus === 'todos' ? ' pill-active-todos' : ''}`}
                  onClick={() => setActiveStatus('todos')}
                >Todos</button>
                {STATUSES.map(s => (
                  <button
                    key={s}
                    className={`pill${activeStatus === s ? ` pill-active-${s}` : ''}`}
                    onClick={() => setActiveStatus(activeStatus === s ? 'todos' : s)}
                  >
                    <span className={`dot dot-${s}`} />
                    {LABELS[s]}
                  </button>
                ))}
              </div>
            </div>

            {/* Summary */}
            <div className="summary">
              {STATUSES.map(s => (
                <div key={s} className={`summary-card s-${s}`}>
                  <div className="count">{counts[s] ?? 0}</div>
                  <div className="label">{LABELS[s]}</div>
                </div>
              ))}
            </div>

            {/* Items card */}
            <div className="items-card">
              <div className="items-header">
                <span className="items-title">
                  Materiais
                  {hasFilter && <span className="filter-count">{filtered.length} encontrado{filtered.length !== 1 ? 's' : ''}</span>}
                </span>
                <div className="col-labels">
                  {STATUSES.map(s => <span key={s} className="col-label">{LABELS[s]}</span>)}
                </div>
              </div>

              {/* Category tabs */}
              {showCatTabs && (
                <div className="cat-tabs">
                  {categories.map(c => (
                    <button
                      key={c}
                      className={`cat-tab${activeCategory === c ? ' cat-tab-active' : ''}`}
                      onClick={() => setActiveCat(c)}
                    >{c}</button>
                  ))}
                </div>
              )}

              {/* Rows */}
              {loading ? (
                <div className="loading">Carregando...</div>
              ) : filtered.length === 0 ? (
                <div className="empty">
                  {hasFilter ? 'Nenhum item encontrado para esse filtro.' : 'Nenhum item cadastrado.'}
                </div>
              ) : (
                filtered.map(item => {
                  const trend = getTrend(item)
                  return (
                    <div key={item.id} className="item-row">
                      <span className="item-name">
                        <span className={`dot dot-${item.status}`} />
                        {item.name}
                        {trend === 'down' && (
                          <span className="trend trend-down" title="Caindo rápido — mudou nos últimos 7 dias">↓</span>
                        )}
                        {trend === 'up' && (
                          <span className="trend trend-up" title="Estoque melhorou nos últimos 7 dias">↑</span>
                        )}
                      </span>
                      <div className="status-buttons">
                        {STATUSES.map(s => (
                          <button
                            key={s}
                            className={`status-btn${item.status === s ? ` active-${s}` : ''}`}
                            onClick={() => updateStatus(item.id, s)}
                          >{LABELS[s]}</button>
                        ))}
                      </div>
                      <button className="edit-btn" onClick={() => openEdit(item)} title="Editar item">
                        <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                          <path d="M11.5 2.5a1.5 1.5 0 012.12 2.12l-8 8L3 14l1.38-2.62 8-8z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                        </svg>
                      </button>
                      <button className="delete-btn" onClick={() => setDeleteTarget(item)} title="Remover item">×</button>
                    </div>
                  )
                })
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

          {/* ── Report panel ── */}
          <aside className="report-panel">
            <div className="report-header">
              <h2>Relatório</h2>
              <button className={`copy-btn${copied ? ' copied' : ''}`} onClick={copyReport}>
                {copied ? (
                  <><svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M3 8l4 4 6-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>Copiado!</>
                ) : (
                  <><svg width="13" height="13" viewBox="0 0 16 16" fill="none"><rect x="5" y="5" width="9" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.5"/><path d="M11 5V3.5A1.5 1.5 0 009.5 2h-6A1.5 1.5 0 002 3.5v6A1.5 1.5 0 003.5 11H5" stroke="currentColor" strokeWidth="1.5"/></svg>Copiar</>
                )}
              </button>
            </div>

            <div className="report-section">
              <div className="report-section-label label-urgent">
                <span className="report-dot rdot-urgent" />Pedir com urgência
              </div>
              {urgent.length === 0 ? (
                <p className="report-empty">Nenhum item crítico</p>
              ) : urgent.map(item => (
                <div key={item.id} className="report-item">
                  <span className={`dot dot-${item.status}`} />
                  <span className="report-item-name">{item.name}</span>
                  <span className={`report-badge badge-${item.status}`}>{LABELS[item.status]}</span>
                </div>
              ))}
            </div>

            <div className="report-section">
              <div className="report-section-label label-metade">
                <span className="report-dot rdot-metade" />Próximo semestre
              </div>
              <p className="report-section-desc">Itens na metade do estoque</p>
              {metade.length === 0 ? (
                <p className="report-empty">Nenhum item na metade</p>
              ) : metade.map(item => (
                <div key={item.id} className="report-item">
                  <span className="dot dot-metade" />
                  <span className="report-item-name">{item.name}</span>
                </div>
              ))}
            </div>

            <div className="report-section report-section-last">
              <div className="report-section-label label-cheio">
                <span className="report-dot rdot-cheio" />Estoque OK
              </div>
              {cheio.length === 0 ? (
                <p className="report-empty">Nenhum item cheio</p>
              ) : (
                <>
                  <p className="report-ok-count">{cheio.length} {cheio.length === 1 ? 'item com' : 'itens com'} estoque cheio</p>
                  <div className="report-ok-list">
                    {cheio.map(item => <span key={item.id} className="report-chip">{item.name}</span>)}
                  </div>
                </>
              )}
            </div>
          </aside>

        </div>
      </div>

      {/* ── Modal: adicionar item ── */}
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
            <label className="modal-label">Categoria</label>
            <select
              className="modal-select"
              value={newCategory}
              onChange={e => setNewCategory(e.target.value)}
            >
              {DEFAULT_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => setShowModal(false)}>Cancelar</button>
              <button className="btn-confirm" onClick={addItem}>Adicionar</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: editar item ── */}
      {editTarget && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setEditTarget(null) }}>
          <div className="modal">
            <h3>Editar item</h3>
            <input
              ref={editInputRef}
              type="text"
              placeholder="Nome do material..."
              value={editName}
              onChange={e => setEditName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && saveEdit()}
              maxLength={80}
            />
            <label className="modal-label">Categoria</label>
            <select
              className="modal-select"
              value={editCategory}
              onChange={e => setEditCategory(e.target.value)}
            >
              {DEFAULT_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => setEditTarget(null)}>Cancelar</button>
              <button className="btn-confirm" onClick={saveEdit}>Salvar</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: confirmar exclusão ── */}
      {deleteTarget && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setDeleteTarget(null) }}>
          <div className="modal">
            <h3>Remover item</h3>
            <p className="modal-body">
              Tem certeza que deseja remover <strong>{deleteTarget.name}</strong> da lista? Essa ação não pode ser desfeita.
            </p>
            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => setDeleteTarget(null)}>Cancelar</button>
              <button className="btn-delete" onClick={confirmDelete}>Sim, remover</button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
