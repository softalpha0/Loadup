import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from './api'
import { errorText } from './errors'
import { useI18n } from './i18n'
import type { OrderDTO } from '../../shared/types'

export function useOrderCreate() {
  const nav = useNavigate()
  const { tMaybe } = useI18n()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function create(body: Record<string, unknown>) {
    setBusy(true); setError(null)
    try {
      const { order } = await api<{ order: OrderDTO }>('/orders', { body })
      nav(`/order/${order.id}`)
    } catch (e) {
      setError(errorText(e, tMaybe))
    } finally {
      setBusy(false)
    }
  }
  return { create, busy, error, setError }
}
