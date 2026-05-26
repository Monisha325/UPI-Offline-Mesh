export default function DeviceList({ devices, cacheSize }) {
  return (
    <div>
      {devices.map(d => (
        <div
          key={d.deviceId}
          className={`device${d.hasInternet ? ' bridge' : ' offline'}`}
        >
          <div>
            <strong>{d.deviceId}</strong>
            <span className={`badge ${d.hasInternet ? 'badge-online' : 'badge-offline'}`}>
              {d.hasInternet ? '🌐 4G' : '🚫 OFFLINE'}
            </span>
            <span className="small" style={{ marginLeft: 8 }}>holding {d.packetCount} packet(s)</span>
          </div>
          <div>
            {d.packetIds.map(id => (
              <span key={id} className="packet-id">{id}</span>
            ))}
          </div>
        </div>
      ))}
      {cacheSize !== undefined && (
        <p className="small">Idempotency cache size: {cacheSize}</p>
      )}
    </div>
  )
}
