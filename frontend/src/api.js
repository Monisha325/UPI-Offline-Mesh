const BASE = import.meta.env.VITE_API_BASE ?? ''

async function req(path, options = {}) {
  const res = await fetch(BASE + path, options)
  if (!res.ok) throw new Error(`${options.method ?? 'GET'} ${path} → ${res.status}`)
  return res.json()
}

export const getMeshState   = ()       => req('/api/mesh/state')
export const postGossip     = ()       => req('/api/mesh/gossip', { method: 'POST' })
export const postFlush      = ()       => req('/api/mesh/flush',  { method: 'POST' })
export const postReset      = ()       => req('/api/mesh/reset',  { method: 'POST' })
export const getAccounts    = ()       => req('/api/accounts')
export const getTransactions = ()      => req('/api/transactions')
export const postSend       = (body)   => req('/api/demo/send', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})
