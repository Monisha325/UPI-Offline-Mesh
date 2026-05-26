export default function TransactionsTable({ transactions }) {
  return (
    <table>
      <thead>
        <tr>
          <th>ID</th>
          <th>From</th>
          <th>To</th>
          <th>Amount</th>
          <th>Status</th>
          <th>Bridge</th>
          <th>Hops</th>
          <th>Settled</th>
        </tr>
      </thead>
      <tbody>
        {transactions.map(t => (
          <tr key={t.id}>
            <td>{t.id}</td>
            <td>{t.senderVpa}</td>
            <td>{t.receiverVpa}</td>
            <td className="balance">₹{parseFloat(t.amount).toFixed(2)}</td>
            <td className={`status-${t.status}`}>{t.status}</td>
            <td>{t.bridgeNodeId}</td>
            <td>{t.hopCount}</td>
            <td className="small">{new Date(t.settledAt).toLocaleTimeString()}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
