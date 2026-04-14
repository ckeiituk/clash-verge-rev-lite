import React, { Suspense } from 'react'
import { Navigate } from 'react-router-dom'
// Home stays eager — it's the landing page and needs instant render
import Home from '@renderer/pages/home'
// Logs stays eager — module-level IPC listener captures logs from startup
import Logs from '@renderer/pages/logs'

const Proxies = React.lazy(() => import('@renderer/pages/proxies'))
const Rules = React.lazy(() => import('@renderer/pages/rules'))
const Settings = React.lazy(() => import('@renderer/pages/settings'))
const Profiles = React.lazy(() => import('@renderer/pages/profiles'))
const Connections = React.lazy(() => import('@renderer/pages/connections'))
const Mihomo = React.lazy(() => import('@renderer/pages/mihomo'))
const Sysproxy = React.lazy(() => import('@renderer/pages/syspeoxy'))
const Tun = React.lazy(() => import('@renderer/pages/tun'))
const Resources = React.lazy(() => import('@renderer/pages/resources'))
const DNS = React.lazy(() => import('@renderer/pages/dns'))
const Sniffer = React.lazy(() => import('@renderer/pages/sniffer'))

const Fallback: React.FC = () => null

const wrap = (element: React.ReactElement): React.ReactElement => (
  <Suspense fallback={<Fallback />}>{element}</Suspense>
)

const routes = [
  {
    path: '/mihomo',
    element: wrap(<Mihomo />)
  },
  {
    path: '/sysproxy',
    element: wrap(<Sysproxy />)
  },
  {
    path: '/tun',
    element: wrap(<Tun />)
  },
  {
    path: '/proxies',
    element: wrap(<Proxies />)
  },
  {
    path: '/rules',
    element: wrap(<Rules />)
  },
  {
    path: '/resources',
    element: wrap(<Resources />)
  },
  {
    path: '/dns',
    element: wrap(<DNS />)
  },
  {
    path: '/sniffer',
    element: wrap(<Sniffer />)
  },
  {
    path: '/logs',
    element: <Logs />
  },
  {
    path: '/connections',
    element: wrap(<Connections />)
  },
  {
    path: '/profiles',
    element: wrap(<Profiles />)
  },
  {
    path: '/settings',
    element: wrap(<Settings />)
  },
  {
    path: '/',
    element: <Navigate to="/home" />
  },
  {
    path: '/home',
    element: <Home />
  }
]

export default routes
