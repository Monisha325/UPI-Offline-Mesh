import { postGossip, postFlush, postReset } from '../api'

export default function MeshControls({ addLog, onRefresh }) {
  async function handleGossip() {
    try {
      const r = await postGossip()
      addLog(`🔄 Gossip: ${r.transfers} transfer(s) — ${JSON.stringify(r.deviceCounts)}`)
      onRefresh()
    } catch (e) {
      addLog(`❌ Gossip failed: ${e.message}`)
    }
  }

  async function handleFlush() {
    try {
      const r = await postFlush()
      addLog(`📡 ${r.uploadsAttempted} bridge upload(s):`)
      r.results.forEach(res => {
        addLog(`   ${res.bridgeNode} packet ${res.packetId} → ${res.outcome}${res.reason ? ` (${res.reason})` : ''}`)
      })
      onRefresh()
    } catch (e) {
      addLog(`❌ Flush failed: ${e.message}`)
    }
  }

  async function handleReset() {
    try {
      await postReset()
      addLog('🗑 mesh + idempotency cache cleared')
      onRefresh()
    } catch (e) {
      addLog(`❌ Reset failed: ${e.message}`)
    }
  }

  return (
    <div className="controls" style={{ marginTop: 16 }}>
      <div className="step-row">
        <span className="step-num">2</span>
        <strong>Gossip</strong>&nbsp;— packets hop device-to-device&nbsp;
        <button className="secondary" onClick={handleGossip}>🔄 Run Gossip Round</button>
      </div>

      <div className="step-row" style={{ marginTop: 12 }}>
        <span className="step-num">3</span>
        <strong>Bridge node walks outside, hits 4G</strong>&nbsp;
        <button className="secondary" onClick={handleFlush}>📡 Bridges Upload to Backend</button>
        <span className="small">(parallel — exercises idempotency)</span>
      </div>

      <div style={{ marginTop: 12 }}>
        <button className="danger" onClick={handleReset}>🗑 Reset Mesh + Cache</button>
      </div>
    </div>
  )
}
