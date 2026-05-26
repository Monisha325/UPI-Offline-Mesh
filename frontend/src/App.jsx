import { useState, useEffect, useCallback } from 'react'
import { getMeshState, getAccounts, getTransactions } from './api'
import SendPaymentForm from './components/SendPaymentForm'
import MeshControls from './components/MeshControls'
import DeviceList from './components/DeviceList'
import AccountsTable from './components/AccountsTable'
import TransactionsTable from './components/TransactionsTable'
import ActivityLog from './components/ActivityLog'

export default function App() {
  const [meshState, setMeshState]       = useState({ devices: [], idempotencyCacheSize: 0 })
  const [accounts, setAccounts]         = useState([])
  const [transactions, setTransactions] = useState([])
  const [logs, setLogs]                 = useState([])
  const [backendOk, setBackendOk]       = useState(null) // null=unknown, true=up, false=down

  function addLog(message) {
    const time = new Date().toLocaleTimeString()
    setLogs(prev => [{ time, message }, ...prev])
  }

  const refresh = useCallback(async () => {
    try {
      const [mesh, accs, txs] = await Promise.all([
        getMeshState(),
        getAccounts(),
        getTransactions(),
      ])
      setMeshState(mesh)
      setAccounts(accs)
      setTransactions(txs)
      setBackendOk(true)
    } catch (e) {
      setBackendOk(false)
    }
  }, [])

  useEffect(() => {
    refresh()
    const id = setInterval(refresh, 3000)
    return () => clearInterval(id)
  }, [refresh])

  return (
    <div className="container">
      <h1>
        📡 UPI Offline Mesh — Live Demo
        {backendOk === false && (
          <span style={{ fontSize: 14, fontWeight: 400, marginLeft: 16, color: 'var(--red)', verticalAlign: 'middle' }}>
            ⚠️ Backend unreachable — start Spring Boot on :8080
          </span>
        )}
        {backendOk === true && (
          <span style={{ fontSize: 13, fontWeight: 400, marginLeft: 16, color: 'var(--green)', verticalAlign: 'middle' }}>
            ● connected
          </span>
        )}
      </h1>
      <p className="small">
        Send money in a basement with zero internet. Encrypted packets gossip from phone to phone
        until one with 4G reaches the backend.
      </p>

      <SendPaymentForm addLog={addLog} onRefresh={refresh} />
      <MeshControls addLog={addLog} onRefresh={refresh} />

      <div className="grid grid-2" style={{ marginTop: 16 }}>
        <div className="card">
          <h2>📱 Mesh Devices</h2>
          <DeviceList devices={meshState.devices} cacheSize={meshState.idempotencyCacheSize} />
        </div>

        <div className="card">
          <h2>🏦 Account Balances</h2>
          <AccountsTable accounts={accounts} />
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h2>📜 Transaction Ledger</h2>
        <TransactionsTable transactions={transactions} />
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h2>🪵 Activity Log</h2>
        <ActivityLog logs={logs} />
      </div>
    </div>
  )
}
