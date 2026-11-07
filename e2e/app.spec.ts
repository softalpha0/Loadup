import { test, expect, installWallet, signIn, setPayMode } from './fixtures'

test('browser fallback outside Nimiq Pay (F22)', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Open Loadup in Nimiq Pay' })).toBeVisible()
  // On localhost the directory deep link cannot work → Custom URL instructions instead
  await expect(page.getByText(/You are running Loadup locally/)).toBeVisible()
})

test('testnet shows the mainnet-required screen (A10)', async ({ context, page }) => {
  await installWallet(context, { network: 'testnet' })
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Switch Nimiq Pay to mainnet' })).toBeVisible()
})

test('onboarding, sign-in and Spanish localisation (F1, F21, F23)', async ({ context, page }) => {
  await installWallet(context, { language: 'es', onboarded: false })
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Usa NIM y USDT en la vida real' })).toBeVisible()
  await page.getByRole('button', { name: 'Siguiente' }).click()
  await page.getByRole('button', { name: 'Siguiente' }).click()
  await page.getByRole('button', { name: 'Empezar' }).click()
  await page.getByRole('button', { name: 'Iniciar sesión con Nimiq Pay' }).click()
  await expect(page.getByText('¿Qué necesitas hoy?')).toBeVisible()
})

test('airtime top-up paid end to end, saved number, reorder (F3–F5, F10, F12–F16)', async ({ context, page }) => {
  await installWallet(context)
  await signIn(page)
  await page.getByRole('link', { name: /Airtime & Data/ }).click()
  await page.getByRole('button', { name: 'Country' }).click()
  await page.getByPlaceholder('Search').fill('Nigeria')
  await page.getByRole('button', { name: /Nigeria/ }).click()
  await page.getByLabel('Phone number').fill('0803 123 4521')
  await page.getByRole('button', { name: 'Find operator' }).click()
  await expect(page.getByText('Operator: MTN Nigeria')).toBeVisible()
  await page.getByRole('button', { name: /₦2,000/ }).click()
  await page.getByPlaceholder('e.g. Mum, My MTN').fill('Mum')
  await page.getByRole('button', { name: 'Review' }).click()

  await expect(page.getByRole('heading', { name: 'Review & pay' })).toBeVisible()
  await expect(page.getByText('+234 ••• ••• 4521')).toBeVisible()
  await expect(page.getByText(/Price held for \d+:\d\d/)).toBeVisible()
  await expect(page.getByText("You'll choose NIM or USDT next.")).toBeVisible()
  await page.getByRole('button', { name: 'Pay with Nimiq Pay' }).click()
  await expect(page.getByText('₦2,000 credited to +234 ••• ••• 4521')).toBeVisible({ timeout: 20_000 })

  // Saved number shows on home (masked) and receipt works
  await page.getByRole('button', { name: 'Receipt' }).click()
  await expect(page.getByRole('heading', { name: 'Receipt' })).toBeVisible()
  await page.goto('/')
  await expect(page.getByRole('button', { name: /Mum/ })).toBeVisible()

  // Reorder from history creates a new invoice for the same number
  await page.getByRole('link', { name: 'Orders' }).click()
  await page.getByRole('button', { name: 'Buy again' }).first().click()
  await expect(page.getByRole('heading', { name: 'Review & pay' })).toBeVisible()
  await expect(page.getByText('+234 ••• ••• 4521')).toBeVisible()
})

test('TRANSACTION_OUTCOME_UNKNOWN never shows a second Pay button (A9)', async ({ context, page }) => {
  await installWallet(context)
  await signIn(page)
  await setPayMode(page, 'unknown')
  await page.goto('/gift')
  await page.getByRole('button', { name: /Steam/ }).click()
  await page.getByRole('button', { name: /\$10/ }).click()
  await page.getByRole('button', { name: 'Review' }).click()
  await page.getByRole('button', { name: 'Pay with Nimiq Pay' }).click()
  await expect(page.getByRole('button', { name: 'Pay with Nimiq Pay' })).toHaveCount(0)
  // The payment did go through in this simulation → order resolves to delivered with a code
  await expect(page.getByText('Your gift card')).toBeVisible({ timeout: 20_000 })
  await expect(page.getByText(/MOCK-/)).toBeVisible()
  await page.reload()
  await expect(page.getByRole('button', { name: 'Pay with Nimiq Pay' })).toHaveCount(0)
})

test('declined payment keeps the Pay button with a clear message (F18)', async ({ context, page }) => {
  await installWallet(context)
  await signIn(page)
  await setPayMode(page, 'denied')
  await page.goto('/gift/amazon-us')
  await page.getByRole('button', { name: /\$10/ }).click()
  await page.getByRole('button', { name: 'Review' }).click()
  await page.getByRole('button', { name: 'Pay with Nimiq Pay' }).click()
  await expect(page.getByText('You declined the request in Nimiq Pay.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Pay with Nimiq Pay' })).toBeEnabled()
})

test('expired invoice is refreshed automatically (A8, F11)', async ({ context, page }) => {
  await installWallet(context)
  await signIn(page)
  await page.goto('/gift/amazon-us')
  await page.getByRole('button', { name: /\$10/ }).click()
  await page.getByRole('button', { name: 'Review' }).click()
  await expect(page.getByText(/Price held for/)).toBeVisible()
  const orderId = page.url().split('/order/')[1]
  await page.request.post(`/api/dev/mock/expire/${orderId}`)
  await page.reload()
  await expect(page.getByText(/Price held for 9:5\d|Price held for 10:00/)).toBeVisible({ timeout: 15_000 })
  await page.getByRole('button', { name: 'Pay with Nimiq Pay' }).click()
  await expect(page.getByText('Your gift card')).toBeVisible({ timeout: 20_000 })
})

test('travel eSIM returns a QR and install steps (F6)', async ({ context, page }) => {
  await installWallet(context)
  await signIn(page)
  await page.getByRole('link', { name: /Travel eSIM/ }).click()
  await page.getByPlaceholder('Where are you going?').fill('Japan')
  await page.getByRole('button', { name: /Japan/ }).first().click()
  await page.getByRole('button', { name: 'Buy' }).first().click()
  await page.getByRole('button', { name: 'Pay with Nimiq Pay' }).click()
  await expect(page.getByText('Your eSIM is ready')).toBeVisible({ timeout: 20_000 })
  await expect(page.getByAltText('eSIM QR')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Install on iPhone' })).toBeVisible()
  await page.getByRole('link', { name: 'My eSIMs' }).click()
  await expect(page.getByRole('link', { name: 'Add data' })).toBeVisible()
})

test('top-up request link paid by a second wallet (A11, F17)', async ({ browser }) => {
  const ctxA = await browser.newContext({ baseURL: 'http://localhost:8799' })
  await installWallet(ctxA)
  const a = await ctxA.newPage()
  await signIn(a)
  await a.goto('/topup')
  await a.getByRole('button', { name: 'Country' }).click()
  await a.getByPlaceholder('Search').fill('Kenya')
  await a.getByRole('button', { name: /Kenya/ }).click()
  await a.getByLabel('Phone number').fill('0712 345 678')
  await a.getByRole('button', { name: 'Find operator' }).click()
  await a.getByRole('button', { name: /250/ }).click()
  await a.getByRole('button', { name: 'Ask someone to pay' }).click()
  await a.getByPlaceholder('e.g. Data for the week 🙏').fill('Thanks!')
  await a.getByRole('button', { name: 'Create link' }).click()
  await expect(a.getByText('Your request link is ready')).toBeVisible()
  const url = (await a.locator('text=/\\/r\\/[A-Z0-9]{8}/').textContent())!.trim()

  const ctxB = await browser.newContext({ baseURL: 'http://localhost:8799' })
  await installWallet(ctxB)
  const b = await ctxB.newPage()
  await signIn(b)
  await b.goto(url)
  await expect(b.getByText('A friend asked you to pay for this top-up.')).toBeVisible()
  await expect(b.getByText('“Thanks!”')).toBeVisible()
  await b.getByRole('button', { name: 'Pay for this top-up' }).click()
  await b.getByRole('button', { name: 'Pay with Nimiq Pay' }).click()
  await expect(b.getByText(/credited to \+254 ••• ••• 5678/)).toBeVisible({ timeout: 20_000 })

  await a.goto(url)
  await expect(a.getByText('Delivered')).toBeVisible({ timeout: 15_000 })
  await ctxA.close(); await ctxB.close()
})

test('settings: language switch, delete my data (A12)', async ({ context, page }) => {
  await installWallet(context)
  await signIn(page)
  await page.getByRole('link', { name: 'Settings' }).click()
  await page.getByRole('button', { name: 'Français' }).click()
  await expect(page.getByRole('heading', { name: 'Réglages' })).toBeVisible()
  page.once('dialog', (d) => d.accept())
  await page.getByRole('button', { name: 'Supprimer mes données' }).click()
  await expect(page.getByRole('button', { name: 'Se connecter avec Nimiq Pay' })).toBeVisible()
})

test('status page shows health (F25)', async ({ page }) => {
  await page.goto('/status')
  await expect(page.getByRole('heading', { name: 'Service status' })).toBeVisible()
  await expect(page.getByText('mock')).toBeVisible()
})
