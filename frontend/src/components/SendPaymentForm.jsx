import { useState } from 'react'
import { postSend } from '../api'

export default function SendPaymentForm({ addLog, onRefresh }) {
  const [senderVpa, setSenderVpa]   = useState('alice@demo')
  const [receiverVpa, setReceiverVpa] = useState('bob@demo')
  const [amount, setAmount]         = useState(500)
  const [pin, setPin]               = useState('1234')
  const [busy, setBusy]             = useState(false)

  const deviceMap = {
    'alice@demo':  'phone-alice',
    'bob@demo':    'phone-stranger1',
    'carol@demo':  'phone-stranger2',
  }

  async function handleSend() {
    setBusy(true)
    try {
      const startDevice = deviceMap[senderVpa] || 'phone-alice'
      const r = await postSend({ senderVpa, receiverVpa, amount: parseFloat(amount), pin, ttl: 5, startDevice })
      addLog(`📤 Packet ${r.packetId.substring(0, 8)} encrypted & injected at ${r.injectedAt} (TTL ${r.ttl})`)
      addLog(`   ciphertext (truncated): ${r.ciphertextPreview}`)
      onRefresh()
    } catch (e) {
      addLog(`❌ Send failed: ${e.message}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="controls">
      <h3 style={{ marginTop: 0 }}>🎬 Demo Flow</h3>

      <div className="step-row">
        <span className="step-num">1</span>
        <strong>Compose payment</strong>&nbsp;(simulates sender phone)
      </div>

      <div className="form-row">
        <select value={senderVpa} onChange={e => setSenderVpa(e.target.value)}>
          <option>alice@demo</option>
          <option>bob@demo</option>
          <option>carol@demo</option>
        </select>
        <span className="arrow">→</span>
        <select value={receiverVpa} onChange={e => setReceiverVpa(e.target.value)}>
          <option>bob@demo</option>
          <option>carol@demo</option>
          <option>alice@demo</option>
          <option>dave@demo</option>
        </select>
        <span>₹</span>
        <input
          type="number"
          value={amount}
          onChange={e => setAmount(e.target.value)}
          style={{ width: 100 }}
        />
        <span>PIN</span>
        <input
          type="text"
          value={pin}
          onChange={e => setPin(e.target.value)}
          maxLength={4}
          style={{ width: 80 }}
        />
        <button onClick={handleSend} disabled={busy}>
          {busy ? '...' : '📤 Inject into Mesh'}
        </button>
      </div>
    </div>
  )
}
