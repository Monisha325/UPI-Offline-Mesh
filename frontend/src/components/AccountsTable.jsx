export default function AccountsTable({ accounts }) {
  return (
    <table>
      <thead>
        <tr>
          <th>VPA</th>
          <th>Holder</th>
          <th>Balance</th>
        </tr>
      </thead>
      <tbody>
        {accounts.map(a => (
          <tr key={a.vpa}>
            <td>{a.vpa}</td>
            <td>{a.holderName}</td>
            <td className="balance">₹{parseFloat(a.balance).toFixed(2)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
