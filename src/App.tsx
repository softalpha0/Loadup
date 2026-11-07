import { lazy, Suspense, useEffect, useState } from 'react'
import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom'
import { I18nProvider } from './lib/i18n'
import { AuthProvider, useAuth } from './lib/auth'
import { detectEnvironment, hostNetwork } from './lib/nimiq'
import { Spinner, ToastProvider } from './components/ui'
import Onboarding, { isOnboarded } from './screens/Onboarding'
import SignIn from './screens/SignIn'
import Home from './screens/Home'
const Topup = lazy(() => import('./screens/Topup'))
const Esim = lazy(() => import('./screens/Esim'))
const EsimTopup = lazy(() => import('./screens/Esim').then((m) => ({ default: m.EsimTopup })))
const MyEsims = lazy(() => import('./screens/Esim').then((m) => ({ default: m.MyEsims })))
const GiftCards = lazy(() => import('./screens/GiftCards'))
const GiftCardProduct = lazy(() => import('./screens/GiftCards').then((m) => ({ default: m.GiftCardProduct })))
const OrderScreen = lazy(() => import('./screens/Order'))
const Orders = lazy(() => import('./screens/Orders'))
const OrderReceipt = lazy(() => import('./screens/Receipt').then((m) => ({ default: m.OrderReceipt })))
const PublicReceipt = lazy(() => import('./screens/Receipt').then((m) => ({ default: m.PublicReceipt })))
const RequestView = lazy(() => import('./screens/RequestView'))
const Settings = lazy(() => import('./screens/Settings'))
const About = lazy(() => import('./screens/About'))
const Status = lazy(() => import('./screens/Status'))
import { BrowserFallback, TestnetGate } from './screens/Gates'

const PUBLIC = [/^\/receipt\//, /^\/status$/, /^\/about$/]

function Loading() {
  return <div className="h-full grid place-items-center bg-app text-brand-600"><Spinner size={32} /></div>
}

function Gate() {
  const { pathname } = useLocation()
  const { ready, me } = useAuth()
  const [env, setEnv] = useState<'loading' | 'host' | 'browser'>('loading')
  const [onboarded, setOnboarded] = useState(isOnboarded)
  useEffect(() => { detectEnvironment().then(setEnv) }, [])

  if (PUBLIC.some((r) => r.test(pathname))) {
    return (
      <Routes>
        <Route path="/receipt/:token" element={<PublicReceipt />} />
        <Route path="/status" element={<Status />} />
        <Route path="/about" element={<About />} />
      </Routes>
    )
  }
  if (env === 'loading') return <Loading />
  if (env === 'browser') return <BrowserFallback />
  if (hostNetwork() === 'testnet') return <TestnetGate />
  if (!onboarded) return <Onboarding onDone={() => setOnboarded(true)} />
  if (!ready) return <Loading />
  if (!me) return <SignIn />

  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/topup" element={<Topup />} />
      <Route path="/esim" element={<Esim />} />
      <Route path="/esims" element={<MyEsims />} />
      <Route path="/esims/:esimId/topup" element={<EsimTopup />} />
      <Route path="/gift" element={<GiftCards />} />
      <Route path="/gift/:id" element={<GiftCardProduct />} />
      <Route path="/order/:id" element={<OrderScreen />} />
      <Route path="/order/:id/receipt" element={<OrderReceipt />} />
      <Route path="/orders" element={<Orders />} />
      <Route path="/r/:code" element={<RequestView />} />
      <Route path="/settings" element={<Settings />} />
      <Route path="*" element={<Home />} />
    </Routes>
  )
}

export default function App() {
  return (
    <I18nProvider>
      <ToastProvider>
        <AuthProvider>
          <BrowserRouter>
            <Suspense fallback={<Loading />}>
              <Gate />
            </Suspense>
          </BrowserRouter>
        </AuthProvider>
      </ToastProvider>
    </I18nProvider>
  )
}
