export default function ActivityLog({ logs }) {
  return (
    <div id="log">
      {logs.map((entry, i) => (
        <div key={i}>[{entry.time}] {entry.message}</div>
      ))}
    </div>
  )
}
