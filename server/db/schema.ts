import { pgTable, text, timestamp, integer, uniqueIndex, index, primaryKey, bigint } from 'drizzle-orm/pg-core'

export const users = pgTable('users', {
  id: text('id').primaryKey(),
  nimAddress: text('nim_address').notNull(),
  locale: text('locale'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex('users_nim_address_idx').on(t.nimAddress)])

export const sessions = pgTable('sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }),
  /** Sign-in nonce; cleared once used */
  nonce: text('nonce'),
  message: text('message'),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const savedNumbers = pgTable('saved_numbers', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  nickname: text('nickname').notNull(),
  phoneEnc: text('phone_enc').notNull(),
  phoneLast4: text('phone_last4').notNull(),
  callingCode: text('calling_code').notNull(),
  country: text('country').notNull(),
  operatorId: text('operator_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('saved_numbers_user_idx').on(t.userId)])

export const orders = pgTable('orders', {
  id: text('id').primaryKey(),
  userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
  kind: text('kind').notNull(),
  productId: text('product_id').notNull(),
  productName: text('product_name').notNull(),
  packageId: text('package_id'),
  packageLabel: text('package_label'),
  value: text('value'),
  currency: text('currency'),
  recipientPhoneEnc: text('recipient_phone_enc'),
  recipientLast4: text('recipient_last4'),
  recipientCallingCode: text('recipient_calling_code'),
  esimId: text('esim_id'),
  provider: text('provider').notNull(),
  providerInvoiceId: text('provider_invoice_id'),
  providerOrderId: text('provider_order_id'),
  bolt11: text('bolt11'),
  invoiceExpiresAt: timestamp('invoice_expires_at', { withTimezone: true }),
  priceSats: bigint('price_sats', { mode: 'number' }),
  priceUsdCents: integer('price_usd_cents'),
  nimiqTxHash: text('nimiq_tx_hash'),
  swapId: text('swap_id'),
  paymentAttemptedAt: timestamp('payment_attempted_at', { withTimezone: true }),
  status: text('status').notNull(),
  failureReason: text('failure_reason'),
  redemptionJsonEnc: text('redemption_json_enc'),
  requestId: text('request_id'),
  receiptToken: text('receipt_token').notNull(),
  lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('orders_user_idx').on(t.userId, t.createdAt),
  index('orders_status_idx').on(t.status),
  uniqueIndex('orders_invoice_idx').on(t.providerInvoiceId),
  uniqueIndex('orders_receipt_idx').on(t.receiptToken),
])

export const requests = pgTable('requests', {
  id: text('id').primaryKey(),
  code: text('code').notNull(),
  requesterUserId: text('requester_user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  kind: text('kind').notNull(),
  productId: text('product_id').notNull(),
  productName: text('product_name').notNull(),
  packageId: text('package_id'),
  packageLabel: text('package_label'),
  value: text('value'),
  currency: text('currency'),
  recipientPhoneEnc: text('recipient_phone_enc').notNull(),
  recipientLast4: text('recipient_last4').notNull(),
  recipientCallingCode: text('recipient_calling_code').notNull(),
  note: text('note'),
  status: text('status').notNull(),
  orderId: text('order_id'),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex('requests_code_idx').on(t.code), index('requests_requester_idx').on(t.requesterUserId)])

export const limits = pgTable('limits', {
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  day: text('day').notNull(),
  totalUsdCents: integer('total_usd_cents').notNull().default(0),
}, (t) => [primaryKey({ columns: [t.userId, t.day] })])
