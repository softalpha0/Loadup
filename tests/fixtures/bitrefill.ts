// Representative Bitrefill v2 payloads (shape per the public API reference).
export const productMtn = {
  meta: {},
  data: {
    id: 'mtn-nigeria',
    name: 'MTN Nigeria',
    country_code: 'NG',
    currency: 'NGN',
    image: 'https://cdn.bitrefill.com/mtn.png',
    in_stock: true,
    recipient_type: 'phone_number',
    categories: ['refill'],
    packages: [
      { package_id: 'mtn-nigeria<&>500', value: '500', price: 0.35, price_currency: 'USD' },
      { package_id: 'mtn-nigeria<&>2000', value: '2000', price: 1.33, price_currency: 'USD' },
    ],
    range: { min: 50, max: 50000, step: 1 },
  },
}

export const esimJapan = {
  data: [{
    id: 'esim-japan',
    name: 'Japan eSIM',
    country_code: 'JP',
    currency: 'USD',
    categories: ['esim'],
    packages: [{ package_id: 'jp-1gb-7d', value: '1GB, 7 Days', price: 4.5, price_currency: 'USD' }],
  }],
}

// BOLT11 spec example — 250,000 sats, timestamp 1496314658, expiry 60s
export const BOLT11 = 'lnbc2500u1pvjluezsp5zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zygqpp5qqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqypqdq5xysxxatsyp3k7enxv4jsxqzpu9qrsgquk0rl77nj30yxdy8j9vdx85fkpmdla2087ne0xh8nhedh8w27kyke0lp53ut353s06fv3qfegext0eh0ymjpf39tuven09sam30g4vgpfna3rh'

export const invoiceUnpaid = {
  data: {
    id: 'inv_123',
    status: 'unpaid',
    price: 1.33,
    currency: 'USD',
    payment: { method: 'lightning', address: BOLT11, currency: 'BTC', price: 0.0025 },
    orders: [{ id: 'ord_9', status: 'created', product: { id: 'mtn-nigeria' } }],
  },
}

export const invoiceComplete = {
  data: { ...invoiceUnpaid.data, status: 'complete', orders: [{ id: 'ord_9', status: 'delivered' }] },
}

export const orderGiftcard = {
  data: {
    id: 'ord_9',
    status: 'delivered',
    redemption_info: { code: 'ABCD-EFGH', pin: '9876', link: 'https://redeem.example/x', instructions: 'Use at checkout' },
  },
}

export const orderEsim = {
  data: {
    id: 'ord_10',
    status: 'delivered',
    redemption_info: { iccid: '8988000000000000001', smdp_address: 'rsp.example.com', activation_code: 'XYZ123', esim_id: 'esim_1' },
  },
}

export const phoneCheck = {
  data: { phone_number: '2348031234567', country_code: 'NG', operator: { slug: 'mtn-nigeria', name: 'MTN Nigeria', logo: 'https://cdn/x.png' } },
}
