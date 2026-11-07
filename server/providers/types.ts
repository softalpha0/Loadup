import type { PhoneCheckResult, Product, ProductType, Redemption, OrderKind } from '../../shared/types'
import type { ProviderInvoiceStatus, ProviderOrderStatus } from '../../shared/status'

export interface CreateInvoiceInput {
  kind: OrderKind
  productId: string
  packageId?: string
  value?: number
  /** E.164 recipient for airtime/data */
  phone?: string
  /** Existing eSIM to top up */
  esimId?: string
  webhookUrl?: string
}

export interface ProviderInvoice {
  id: string
  status: ProviderInvoiceStatus
  bolt11?: string
  expiresAt?: Date
  priceSats?: number
  priceUsd?: number
  orders: { id: string; status: ProviderOrderStatus }[]
}

export interface ProviderOrder {
  id: string
  status: ProviderOrderStatus
  redemption?: Redemption
}

export class ProviderError extends Error {
  constructor(
    public code: 'NOT_CONFIGURED' | 'NOT_FOUND' | 'UNSUPPORTED' | 'BAD_REQUEST' | 'UNAUTHORIZED' | 'UPSTREAM' | 'OUT_OF_STOCK',
    message: string,
    public httpStatus?: number,
  ) {
    super(message)
  }
}

/** Every provider call goes through this interface so a second provider can be added via config. */
export interface TopupProvider {
  readonly name: string
  configured(): boolean
  health(): Promise<{ ok: boolean; detail?: string }>
  checkPhone(e164: string, country: string): Promise<PhoneCheckResult>
  listProducts(q: { type?: ProductType; country?: string; query?: string }): Promise<Product[]>
  getProduct(id: string): Promise<Product>
  listEsims(q: { country?: string; query?: string }): Promise<Product[]>
  createInvoice(input: CreateInvoiceInput): Promise<ProviderInvoice>
  getInvoice(id: string): Promise<ProviderInvoice>
  getOrder(id: string): Promise<ProviderOrder>
}
