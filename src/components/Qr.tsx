import { useEffect, useState } from 'react'
import QRCode from 'qrcode'

export function Qr({ value, size = 220, label }: { value: string; size?: number; label?: string }) {
  const [src, setSrc] = useState<string | null>(null)
  useEffect(() => {
    QRCode.toDataURL(value, { width: size * 2, margin: 1, errorCorrectionLevel: 'M' }).then(setSrc).catch(() => setSrc(null))
  }, [value, size])
  return (
    <div className="bg-white rounded-2xl p-3 inline-block">
      {src ? <img src={src} width={size} height={size} alt={label ?? 'QR code'} /> : <div style={{ width: size, height: size }} />}
    </div>
  )
}
