// Shared DTOs between the Loadup API and the Mini App.

export const ORDER_KINDS = ['airtime', 'data', 'esim', 'esim_topup', 'giftcard'] as const
export type OrderKind = (typeof ORDER_KINDS)[number]

export const ORDER_STATUSES = [
  'created',
  'awaiting_payment',
  'paid',
  'processing',
  'delivered',
  'failed',
  'expired',
] as const
export type OrderStatus = (typeof ORDER_STATUSES)[number]

/** Statuses after which nothing changes any more. */
export const FINAL_STATUSES: readonly OrderStatus[] = ['delivered', 'failed', 'expired']

export type ProductType = 'airtime' | 'data' | 'esim' | 'giftcard'

export interface ProductPackage {
  id: string
  /** Face value in the product currency (e.g. 2000 for ₦2,000) */
  value: number
  /** Human label, e.g. "₦2,000" or "1GB, 7 Days" */
  label: string
  /** Approximate price in USD, when the provider reports it */
  priceUsd?: number
  dataGb?: number
  days?: number
}

export interface Product {
  id: string
  name: string
  type: ProductType
  country: string
  currency: string
  imageUrl?: string
  description?: string
  packages: ProductPackage[]
  /** Custom-amount range for open-value products */
  range?: { min: number; max: number; step: number }
  recipientType: 'phone' | 'none'
}

export interface PhoneCheckResult {
  e164: string
  country: string
  operator?: { id: string; name: string; logoUrl?: string }
  products: Product[]
}

export interface Redemption {
  code?: string
  pin?: string
  link?: string
  instructions?: string
  message?: string
  esim?: {
    iccid?: string
    /** LPA activation string, e.g. "LPA:1$smdp.example$ABC" — rendered as QR */
    lpa?: string
    smdpAddress?: string
    activationCode?: string
    installUrl?: string
    iosInstallUrl?: string
    androidInstallUrl?: string
    esimId?: string
  }
}

export interface OrderDTO {
  id: string
  kind: OrderKind
  status: OrderStatus
  productId: string
  productName: string
  packageId?: string | null
  packageLabel?: string | null
  value?: number | null
  currency?: string | null
  recipientMasked?: string | null
  esimId?: string | null
  bolt11?: string | null
  invoiceExpiresAt?: string | null
  priceSats?: number | null
  priceUsd?: number | null
  paymentAttempted: boolean
  failureReason?: string | null
  receiptToken: string
  requestCode?: string | null
  createdAt: string
  updatedAt: string
  redemption?: Redemption | null
}

export interface SavedNumberDTO {
  id: string
  nickname: string
  masked: string
  last4: string
  country: string
  operatorId?: string | null
}

export interface RequestDTO {
  code: string
  kind: OrderKind
  productId: string
  productName: string
  packageId?: string | null
  packageLabel?: string | null
  value?: number | null
  currency?: string | null
  recipientMasked: string
  note?: string | null
  status: 'open' | 'paid' | 'expired'
  orderStatus?: OrderStatus | null
  expiresAt: string
  isRequester?: boolean
}

export interface AppConfig {
  provider: string
  providerConfigured: boolean
  limits: { perOrderUsd: number; perDayUsd: number }
  supportEmail?: string
  supportUrl?: string
  appUrl: string
}

export interface ApiErrorBody {
  error: string
  message: string
  details?: unknown
}
