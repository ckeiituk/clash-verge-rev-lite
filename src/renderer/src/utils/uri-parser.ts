// Proxy URI parser — ported from Tauri (main branch src/utils/uri-parser.ts)
// Supports: ss, ssr, vmess, vless, trojan, hysteria, hysteria2, tuic, wireguard, http, socks5

import { isIPv4, isIPv6 } from 'is-ip'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ProxyConfig = Record<string, any> & { name: string; type: string }

export default function parseUri(uri: string): ProxyConfig {
  const head = uri.split('://')[0]
  switch (head) {
    case 'ss':
      return URI_SS(uri)
    case 'ssr':
      return URI_SSR(uri)
    case 'vmess':
      return URI_VMESS(uri)
    case 'vless':
      return URI_VLESS(uri)
    case 'trojan':
      return URI_Trojan(uri)
    case 'hysteria2':
    case 'hy2':
      return URI_Hysteria2(uri)
    case 'hysteria':
    case 'hy':
      return URI_Hysteria(uri)
    case 'tuic':
      return URI_TUIC(uri)
    case 'wireguard':
    case 'wg':
      return URI_Wireguard(uri)
    case 'http':
      return URI_HTTP(uri)
    case 'socks5':
      return URI_SOCKS(uri)
    default:
      throw Error(`Unknown uri type: ${head}`)
  }
}

function getIfNotBlank(value: string | undefined, dft?: string): string | undefined {
  return value && value.trim() !== '' ? value : dft
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getIfPresent(value: any, dft?: any): any {
  return value ? value : dft
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isPresent(value: any): boolean {
  return value !== null && value !== undefined
}

function trimStr(str: string | undefined): string | undefined {
  return str ? str.trim() : str
}

function decodeBase64OrOriginal(str: string): string {
  try {
    return atob(str)
  } catch {
    return str
  }
}

function getCipher(str: string | undefined): string {
  const known = [
    'none',
    'auto',
    'dummy',
    'aes-128-gcm',
    'aes-192-gcm',
    'aes-256-gcm',
    'lea-128-gcm',
    'lea-192-gcm',
    'lea-256-gcm',
    'aes-128-gcm-siv',
    'aes-256-gcm-siv',
    '2022-blake3-aes-128-gcm',
    '2022-blake3-aes-256-gcm',
    'aes-128-cfb',
    'aes-192-cfb',
    'aes-256-cfb',
    'aes-128-ctr',
    'aes-192-ctr',
    'aes-256-ctr',
    'chacha20',
    'chacha20-ietf',
    'chacha20-ietf-poly1305',
    '2022-blake3-chacha20-poly1305',
    'rabbit128-poly1305',
    'xchacha20-ietf-poly1305',
    'xchacha20',
    'aegis-128l',
    'aegis-256',
    'aez-384',
    'deoxys-ii-256-128',
    'rc4-md5'
  ]
  if (!str) return 'none'
  if (str === 'chacha20-poly1305') return 'chacha20-ietf-poly1305'
  if (known.includes(str)) return str
  return 'auto'
}

function URI_SS(line: string): ProxyConfig {
  let content = line.split('ss://')[1]
  const proxy: ProxyConfig = {
    name: decodeURIComponent(line.split('#')[1] || '').trim(),
    type: 'ss',
    server: '',
    port: 0
  }
  content = content.split('#')[0]
  let serverAndPortArray = content.match(/@([^/]*)(\/|$)/)
  let userInfoStr = decodeBase64OrOriginal(content.split('@')[0])
  let query = ''
  if (!serverAndPortArray) {
    if (content.includes('?')) {
      const parsed = content.match(/^(.*)(\?.*)$/)
      content = parsed?.[1] ?? ''
      query = parsed?.[2] ?? ''
    }
    content = decodeBase64OrOriginal(content)
    if (query) {
      if (/(&|\?)v2ray-plugin=/.test(query)) {
        const parsed = query.match(/(&|\?)v2ray-plugin=(.*?)(&|$)/)
        const v2rayPlugin = parsed![2]
        if (v2rayPlugin) {
          proxy.plugin = 'v2ray-plugin'
          proxy['plugin-opts'] = JSON.parse(decodeBase64OrOriginal(v2rayPlugin))
        }
      }
      content = `${content}${query}`
    }
    userInfoStr = content.split('@')[0]
    serverAndPortArray = content.match(/@([^/]*)(\/|$)/)
  }
  const serverAndPort = serverAndPortArray?.[1]
  const portIdx = serverAndPort?.lastIndexOf(':') ?? 0
  proxy.server = serverAndPort?.substring(0, portIdx) ?? ''
  proxy.port = parseInt(`${serverAndPort?.substring(portIdx + 1)}`.match(/\d+/)?.[0] ?? '')
  const userInfo = userInfoStr.match(/(^.*?):(.*$)/)
  proxy.cipher = getCipher(userInfo?.[1])
  proxy.password = userInfo?.[2]

  const idx = content.indexOf('?plugin=')
  if (idx !== -1) {
    const pluginInfo = (
      'plugin=' + decodeURIComponent(content.split('?plugin=')[1].split('&')[0])
    ).split(';')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const params: Record<string, any> = {}
    for (const item of pluginInfo) {
      const [key, val] = item.split('=')
      if (key) params[key] = val || true
    }
    switch (params.plugin) {
      case 'obfs-local':
      case 'simple-obfs':
        proxy.plugin = 'obfs'
        proxy['plugin-opts'] = {
          mode: params.obfs,
          host: getIfNotBlank(params['obfs-host'])
        }
        break
      case 'v2ray-plugin':
        proxy.plugin = 'v2ray-plugin'
        proxy['plugin-opts'] = {
          mode: 'websocket',
          host: getIfNotBlank(params['obfs-host']),
          path: getIfNotBlank(params.path),
          tls: getIfPresent(params.tls)
        }
        break
      default:
        throw new Error(`Unsupported plugin option: ${params.plugin}`)
    }
  }
  if (/(&|\?)uot=(1|true)/i.test(query)) proxy['udp-over-tcp'] = true
  if (/(&|\?)tfo=(1|true)/i.test(query)) proxy.tfo = true
  return proxy
}

function URI_SSR(line: string): ProxyConfig {
  line = decodeBase64OrOriginal(line.split('ssr://')[1])
  let splitIdx = line.indexOf(':origin')
  if (splitIdx === -1) splitIdx = line.indexOf(':auth_')
  const serverAndPort = line.substring(0, splitIdx)
  const server = serverAndPort.substring(0, serverAndPort.lastIndexOf(':'))
  const port = parseInt(serverAndPort.substring(serverAndPort.lastIndexOf(':') + 1))
  const params = line.substring(splitIdx + 1).split('/?')[0].split(':')
  const proxy: ProxyConfig = {
    name: 'SSR',
    type: 'ssr',
    server,
    port,
    protocol: params[0],
    cipher: getCipher(params[1]),
    obfs: params[2],
    password: decodeBase64OrOriginal(params[3])
  }
  const otherParams: Record<string, string> = {}
  const paramsArray = line.split('/?')[1]?.split('&') || []
  for (const item of paramsArray) {
    const [key, val] = item.split('=')
    if (val?.trim().length > 0) otherParams[key] = val.trim()
  }
  proxy.name = otherParams.remarks
    ? decodeBase64OrOriginal(otherParams.remarks).trim()
    : (proxy.server ?? '')
  proxy['protocol-param'] = getIfNotBlank(
    decodeBase64OrOriginal(otherParams.protoparam || '').replace(/\s/g, '')
  )
  proxy['obfs-param'] = getIfNotBlank(
    decodeBase64OrOriginal(otherParams.obfsparam || '').replace(/\s/g, '')
  )
  return proxy
}

function URI_VMESS(line: string): ProxyConfig {
  line = line.split('vmess://')[1]
  let content = decodeBase64OrOriginal(line)
  if (/=\s*vmess/.test(content)) {
    // Quantumult VMess URI format
    const partitions = content.split(',').map((p) => p.trim())
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const params: Record<string, any> = {}
    for (const part of partitions) {
      if (part.indexOf('=') !== -1) {
        const [key, val] = part.split('=')
        params[key.trim()] = val.trim()
      }
    }
    const proxy: ProxyConfig = {
      name: partitions[0].split('=')[0].trim(),
      type: 'vmess',
      server: partitions[1],
      port: parseInt(partitions[2], 10),
      cipher: getCipher(getIfNotBlank(partitions[3], 'auto')),
      uuid: partitions[4].match(/^"(.*)"$/)?.[1] || '',
      tls: params.obfs === 'wss',
      udp: getIfPresent(params['udp-relay']),
      tfo: getIfPresent(params['fast-open']),
      'skip-cert-verify': isPresent(params['tls-verification'])
        ? !params['tls-verification']
        : undefined
    }
    if (isPresent(params.obfs)) {
      if (params.obfs === 'ws' || params.obfs === 'wss') {
        proxy.network = 'ws'
        proxy['ws-opts'] = {
          path:
            (getIfNotBlank(params['obfs-path']) || '"/"').match(/^"(.*)"$/)?.[1] || '/',
          headers: {
            Host: params['obfs-header']?.match(/Host:\s*([a-zA-Z0-9-.]*)/)?.[1] || ''
          }
        }
      } else {
        throw new Error(`Unsupported obfs: ${params.obfs}`)
      }
    }
    return proxy
  } else {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let params: Record<string, any> = {}
    try {
      params = JSON.parse(content)
    } catch {
      // Shadowrocket URI format
      const match = /(^[^?]+?)\/?\?(.*)$/.exec(line)
      if (match) {
        const [, base64Line, qs] = match
        content = decodeBase64OrOriginal(base64Line)
        for (const addon of qs.split('&')) {
          const [key, valueRaw] = addon.split('=')
          const value = decodeURIComponent(valueRaw)
          if (value.indexOf(',') === -1) {
            params[key] = value
          } else {
            params[key] = value.split(',')
          }
        }
        const contentMatch = /(^[^:]+?):([^:]+?)@(.*):(\d+)$/.exec(content)
        if (contentMatch) {
          const [, cipher, uuid, server, port] = contentMatch
          params.scy = cipher
          params.id = uuid
          params.port = port
          params.add = server
        }
      }
    }
    const server = params.add
    const port = parseInt(getIfPresent(params.port), 10)
    const proxy: ProxyConfig = {
      name:
        trimStr(params.ps) ??
        trimStr(params.remarks) ??
        trimStr(params.remark) ??
        `VMess ${server}:${port}`,
      type: 'vmess',
      server,
      port,
      cipher: getCipher(getIfPresent(params.scy, 'auto')),
      uuid: params.id,
      tls: ['tls', true, 1, '1'].includes(params.tls),
      'skip-cert-verify': isPresent(params.verify_cert) ? !params.verify_cert : undefined
    }
    proxy.alterId = parseInt(getIfPresent(params.aid ?? params.alterId, 0), 10)
    if (proxy.tls && params.sni) proxy.servername = params.sni

    let httpupgrade = false
    if (params.net === 'ws' || params.obfs === 'websocket') {
      proxy.network = 'ws'
    } else if (['http'].includes(params.net) || ['http'].includes(params.obfs) || ['http'].includes(params.type)) {
      proxy.network = 'http'
    } else if (['grpc'].includes(params.net)) {
      proxy.network = 'grpc'
    } else if (params.net === 'httpupgrade') {
      proxy.network = 'ws'
      httpupgrade = true
    } else if (params.net === 'h2' || proxy.network === 'h2') {
      proxy.network = 'h2'
    }

    if (proxy.network) {
      let transportHost = params.host ?? params.obfsParam
      try {
        const parsed = JSON.parse(transportHost)
        const parsedHost = parsed?.Host
        if (parsedHost) transportHost = parsedHost
      } catch {
        // ignore
      }
      let transportPath = params.path
      if (proxy.network === 'http') {
        if (transportHost) {
          transportHost = Array.isArray(transportHost) ? transportHost[0] : transportHost
        }
        transportPath = Array.isArray(transportPath)
          ? transportPath[0]
          : transportPath || '/'
      }
      if (transportPath || transportHost) {
        if (['grpc'].includes(proxy.network)) {
          proxy['grpc-opts'] = { 'grpc-service-name': getIfNotBlank(transportPath) }
        } else {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const opts: Record<string, any> = {
            path: getIfNotBlank(transportPath),
            headers: { Host: getIfNotBlank(transportHost) }
          }
          if (httpupgrade) {
            opts['v2ray-http-upgrade'] = true
            opts['v2ray-http-upgrade-fast-open'] = true
          }
          switch (proxy.network) {
            case 'ws':
              proxy['ws-opts'] = opts
              break
            case 'http':
              proxy['http-opts'] = opts
              break
            case 'h2':
              proxy['h2-opts'] = opts
              break
          }
        }
      } else {
        delete proxy.network
      }
      if (proxy.tls && !proxy.servername && transportHost) {
        proxy.servername = transportHost
      }
    }
    return proxy
  }
}

function URI_VLESS(line: string): ProxyConfig {
  line = line.split('vless://')[1]
  let isShadowrocket = false
  let parsed = /^(.*?)@(.*?):(\d+)\/?(\?(.*?))?(?:#(.*?))?$/.exec(line)
  if (!parsed) {
    const m = /^(.*?)(\?.*?$)/.exec(line)
    if (m) {
      line = `${atob(m[1])}${m[2]}`
      parsed = /^(.*?)@(.*?):(\d+)\/?(\?(.*?))?(?:#(.*?))?$/.exec(line)
      isShadowrocket = true
    }
  }
  if (!parsed) throw new Error('Invalid VLESS URI')
  const [, uuidRaw, server, portStr, , addons = '', nameRaw] = parsed
  const port = parseInt(portStr, 10)
  const uuid = decodeURIComponent(isShadowrocket ? uuidRaw.replace(/^.*?:/g, '') : uuidRaw)
  const name = nameRaw ? decodeURIComponent(nameRaw) : ''

  const proxy: ProxyConfig = { type: 'vless', name: '', server, port, uuid }
  const params: Record<string, string> = {}
  for (const addon of addons.split('&')) {
    const [key, valueRaw] = addon.split('=')
    if (key && valueRaw !== undefined) params[key] = decodeURIComponent(valueRaw)
  }

  proxy.name = trimStr(name) ?? trimStr(params.remarks) ?? trimStr(params.remark) ?? `VLESS ${server}:${port}`
  proxy.tls = (params.security && params.security !== 'none') || undefined
  if (isShadowrocket && /TRUE|1/i.test(params.tls)) {
    proxy.tls = true
    params.security = params.security ?? 'reality'
  }
  proxy.servername = params.sni || params.peer
  proxy.flow = params.flow ? 'xtls-rprx-vision' : undefined
  proxy['client-fingerprint'] = params.fp || undefined
  proxy.alpn = params.alpn ? params.alpn.split(',') : undefined
  proxy['skip-cert-verify'] = params.allowInsecure ? /(TRUE)|1/i.test(params.allowInsecure) : undefined

  if (['reality'].includes(params.security)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const opts: Record<string, any> = {}
    if (params.pbk) opts['public-key'] = params.pbk
    if (params.sid) opts['short-id'] = params.sid
    if (Object.keys(opts).length > 0) proxy['reality-opts'] = opts
  }

  let httpupgrade = false
  if (params.headerType === 'http') {
    proxy.network = 'http'
  } else if (params.type === 'ws') {
    proxy.network = 'ws'
    httpupgrade = true
  } else {
    proxy.network = ['tcp', 'ws', 'http', 'grpc', 'h2'].includes(params.type)
      ? params.type
      : 'tcp'
  }
  if (!proxy.network && isShadowrocket && params.obfs) {
    switch (params.type) {
      case 'sw': proxy.network = 'ws'; break
      case 'http': proxy.network = 'http'; break
      case 'h2': proxy.network = 'h2'; break
      case 'grpc': proxy.network = 'grpc'; break
    }
  }
  if (proxy.network === 'websocket') proxy.network = 'ws'

  if (proxy.network && !['tcp', 'none'].includes(proxy.network)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const opts: Record<string, any> = {}
    const host = params.host ?? params.obfsParam
    if (host) {
      if (params.obfsParam) {
        try { opts.headers = JSON.parse(host) } catch { opts.headers = { Host: host } }
      } else {
        opts.headers = { Host: host }
      }
    }
    if (params.path) opts.path = params.path
    if (httpupgrade) {
      opts['v2ray-http-upgrade'] = true
      opts['v2ray-http-upgrade-fast-open'] = true
    }
    if (Object.keys(opts).length > 0) {
      if (proxy.network === 'grpc') {
        proxy['grpc-opts'] = { 'grpc-service-name': getIfNotBlank(params.path) }
      } else {
        proxy['ws-opts'] = opts
      }
    }
  }

  if (proxy.tls && !proxy.servername) {
    if (proxy.network === 'ws') {
      proxy.servername = proxy['ws-opts']?.headers?.Host
    } else if (proxy.network === 'http') {
      const httpHost = proxy['http-opts']?.headers?.Host
      proxy.servername = Array.isArray(httpHost) ? httpHost[0] : httpHost
    }
  }
  return proxy
}

function URI_Trojan(line: string): ProxyConfig {
  line = line.split('trojan://')[1]
  const m = /^(.*?)@(.*?)(:(\d+))?\/?(\?(.*?))?(?:#(.*?))?$/.exec(line) || []
  const [, passwordRaw, server, , port, , addons = '', nameRaw] = m
  const parsedPort = parseInt(`${port}`, 10)
  const portNum = isNaN(parsedPort) ? 443 : parsedPort
  const password = decodeURIComponent(passwordRaw)
  const name = trimStr(decodeURIComponent(nameRaw || '')) ?? `Trojan ${server}:${portNum}`

  const proxy: ProxyConfig = { type: 'trojan', name, server, port: portNum, password }
  let host = ''
  let path = ''

  for (const addon of addons.split('&')) {
    const [key, valueRaw] = addon.split('=')
    const value = decodeURIComponent(valueRaw || '')
    switch (key) {
      case 'type':
        proxy.network = ['ws', 'h2'].includes(value) ? value : 'tcp'
        break
      case 'host': host = value; break
      case 'path': path = value; break
      case 'alpn': proxy.alpn = value ? value.split(',') : undefined; break
      case 'sni': proxy.sni = value; break
      case 'skip-cert-verify': proxy['skip-cert-verify'] = /(TRUE)|1/i.test(value); break
      case 'fingerprint': case 'fp': proxy['client-fingerprint'] = value; break
      case 'encryption': {
        const encryption = value.split(';')
        if (encryption.length === 3) {
          proxy['ss-opts'] = { enabled: true, method: encryption[1], password: encryption[2] }
        }
        break
      }
      case 'client-fingerprint': proxy['client-fingerprint'] = value; break
    }
  }
  if (proxy.network === 'ws') {
    proxy['ws-opts'] = { headers: { Host: host }, path }
  } else if (proxy.network === 'grpc') {
    proxy['grpc-opts'] = { 'grpc-service-name': path }
  }
  return proxy
}

function URI_Hysteria2(line: string): ProxyConfig {
  line = line.split(/(hysteria2|hy2):\/\//)[2]
  const m = /^(.*?)@(.*?)(:(\d+))?\/?(\?(.*?))?(?:#(.*?))?$/.exec(line) || []
  const [, passwordRaw, server, , port, , addons = '', nameRaw] = m
  const parsedPort = parseInt(`${port}`, 10)
  const portNum = isNaN(parsedPort) ? 443 : parsedPort
  const password = decodeURIComponent(passwordRaw)
  const name = trimStr(decodeURIComponent(nameRaw || '')) ?? `Hysteria2 ${server}:${port}`

  const proxy: ProxyConfig = { type: 'hysteria2', name, server, port: portNum, password }
  const params: Record<string, string> = {}
  for (const addon of addons.split('&')) {
    const [key, valueRaw] = addon.split('=')
    params[key] = decodeURIComponent(valueRaw || '')
  }
  proxy.sni = params.sni || params.peer
  if (params.obfs && params.obfs !== 'none') proxy.obfs = params.obfs
  proxy.ports = params.mport
  proxy['obfs-password'] = params['obfs-password']
  proxy['skip-cert-verify'] = params.insecure ? /(TRUE)|1/i.test(params.insecure) : undefined
  proxy.tfo = params.fastopen ? /(TRUE)|1/i.test(params.fastopen) : undefined
  proxy.fingerprint = params.pinSHA256
  return proxy
}

function URI_Hysteria(line: string): ProxyConfig {
  line = line.split(/(hysteria|hy):\/\//)[2]
  const m = /^(.*?)(:(\d+))?\/?(\?(.*?))?(?:#(.*?))?$/.exec(line)!
  const [, server, , port, , addons = '', nameRaw] = m
  const parsedPort = parseInt(`${port}`, 10)
  const portNum = isNaN(parsedPort) ? 443 : parsedPort
  const name = trimStr(decodeURIComponent(nameRaw || '')) ?? `Hysteria ${server}:${port}`

  const proxy: ProxyConfig = { type: 'hysteria', name, server, port: portNum }
  for (const addon of addons.split('&')) {
    const [keyRaw, valueRaw] = addon.split('=')
    const key = keyRaw.replace(/_/, '-')
    const value = decodeURIComponent(valueRaw || '')
    switch (key) {
      case 'alpn': proxy.alpn = value ? value.split(',') : undefined; break
      case 'insecure': proxy['skip-cert-verify'] = /(TRUE)|1/i.test(value); break
      case 'auth': proxy['auth-str'] = value; break
      case 'mport': proxy.ports = value; break
      case 'obfsParam': proxy.obfs = value; break
      case 'upmbps': proxy.up = value; break
      case 'downmbps': proxy.down = value; break
      case 'obfs': proxy.obfs = value || ''; break
      case 'fast-open': proxy['fast-open'] = /(TRUE)|1/i.test(value); break
      case 'peer': proxy['fast-open'] = /(TRUE)|1/i.test(value); break
      case 'recv-window-conn': proxy['recv-window-conn'] = parseInt(value); break
      case 'recv-window': proxy['recv-window'] = parseInt(value); break
      case 'ca': proxy.ca = value; break
      case 'ca-str': proxy['ca-str'] = value; break
      case 'disable-mtu-discovery': proxy['disable-mtu-discovery'] = /(TRUE)|1/i.test(value); break
      case 'fingerprint': proxy.fingerprint = value; break
      case 'protocol': proxy.protocol = value; break
      case 'sni': proxy.sni = value; break
    }
  }
  if (!proxy.protocol) proxy.protocol = 'udp'
  return proxy
}

function URI_TUIC(line: string): ProxyConfig {
  line = line.split(/tuic:\/\//)[1]
  const m = /^(.*?):(.*?)@(.*?)(:(\d+))?\/?(\?(.*?))?(?:#(.*?))?$/.exec(line) || []
  const [, uuid, passwordRaw, server, , port, , addons = '', nameRaw] = m
  const parsedPort = parseInt(`${port}`, 10)
  const portNum = isNaN(parsedPort) ? 443 : parsedPort
  const password = decodeURIComponent(passwordRaw)
  const name = trimStr(decodeURIComponent(nameRaw || '')) ?? `TUIC ${server}:${port}`

  const proxy: ProxyConfig = { type: 'tuic', name, server, port: portNum, password, uuid }
  for (const addon of addons.split('&')) {
    const [keyRaw, valueRaw] = addon.split('=')
    const key = keyRaw.replace(/_/, '-')
    const value = decodeURIComponent(valueRaw || '')
    switch (key) {
      case 'token': proxy.token = value; break
      case 'ip': proxy.ip = value; break
      case 'heartbeat-interval': proxy['heartbeat-interval'] = parseInt(value); break
      case 'alpn': proxy.alpn = value ? value.split(',') : undefined; break
      case 'disable-sni': proxy['disable-sni'] = /(TRUE)|1/i.test(value); break
      case 'reduce-rtt': proxy['reduce-rtt'] = /(TRUE)|1/i.test(value); break
      case 'request-timeout': proxy['request-timeout'] = parseInt(value); break
      case 'udp-relay-mode': proxy['udp-relay-mode'] = value; break
      case 'congestion-controller': proxy['congestion-controller'] = value; break
      case 'max-udp-relay-packet-size': proxy['max-udp-relay-packet-size'] = parseInt(value); break
      case 'fast-open': proxy['fast-open'] = /(TRUE)|1/i.test(value); break
      case 'skip-cert-verify': case 'allow-insecure':
        proxy['skip-cert-verify'] = /(TRUE)|1/i.test(value); break
      case 'max-open-streams': proxy['max-open-streams'] = parseInt(value); break
      case 'sni': proxy.sni = value; break
    }
  }
  return proxy
}

function URI_Wireguard(line: string): ProxyConfig {
  line = line.split(/(wireguard|wg):\/\//)[2]
  const m = /^((.*?)@)?(.*?)(:(\d+))?\/?(\?(.*?))?(?:#(.*?))?$/.exec(line)!
  const [, , privateKeyRaw, server, , port, , addons = '', nameRaw] = m
  const parsedPort = parseInt(`${port}`, 10)
  const portNum = isNaN(parsedPort) ? 443 : parsedPort
  const privateKey = decodeURIComponent(privateKeyRaw || '')
  const name = trimStr(decodeURIComponent(nameRaw || '')) ?? `WireGuard ${server}:${port}`

  const proxy: ProxyConfig = {
    type: 'wireguard', name, server, port: portNum,
    'private-key': privateKey, udp: true
  }
  for (const addon of addons.split('&')) {
    const [keyRaw, valueRaw] = addon.split('=')
    const key = keyRaw.replace(/_/, '-')
    const value = decodeURIComponent(valueRaw || '')
    switch (key) {
      case 'address': case 'ip':
        value.split(',').forEach((i) => {
          const ip = i.trim().replace(/\/\d+$/, '').replace(/^\[/, '').replace(/\]$/, '')
          if (isIPv4(ip)) proxy.ip = ip
          else if (isIPv6(ip)) proxy.ipv6 = ip
        })
        break
      case 'publickey': proxy['public-key'] = value; break
      case 'allowed-ips': proxy['allowed-ips'] = value.split(','); break
      case 'pre-shared-key': proxy['pre-shared-key'] = value; break
      case 'reserved': {
        const parsed = value.split(',').map((i) => parseInt(i.trim(), 10)).filter(Number.isInteger)
        if (parsed.length === 3) proxy.reserved = parsed
        break
      }
      case 'udp': proxy.udp = /(TRUE)|1/i.test(value); break
      case 'mtu': proxy.mtu = parseInt(value.trim(), 10); break
      case 'dialer-proxy': proxy['dialer-proxy'] = value; break
      case 'remote-dns-resolve': proxy['remote-dns-resolve'] = /(TRUE)|1/i.test(value); break
      case 'dns': proxy.dns = value.split(','); break
    }
  }
  return proxy
}

function URI_HTTP(line: string): ProxyConfig {
  line = line.split(/(http|https):\/\//)[2]
  const m = /^((.*?)@)?(.*?)(:(\d+))?\/?(\?(.*?))?(?:#(.*?))?$/.exec(line)!
  const [, , authRaw, server, , port, , addons = '', nameRaw] = m
  const parsedPort = parseInt(`${port}`, 10)
  const portNum = isNaN(parsedPort) ? 443 : parsedPort
  const auth = authRaw ? decodeURIComponent(authRaw) : authRaw
  const name = trimStr(decodeURIComponent(nameRaw || '')) ?? `HTTP ${server}:${portNum}`

  const proxy: ProxyConfig = { type: 'http', name, server, port: portNum }
  if (auth) {
    const [username, password] = auth.split(':')
    proxy.username = username
    proxy.password = password
  }
  for (const addon of addons.split('&')) {
    const [keyRaw, valueRaw] = addon.split('=')
    const key = keyRaw.replace(/_/, '-')
    const value = decodeURIComponent(valueRaw || '')
    switch (key) {
      case 'tls': proxy.tls = /(TRUE)|1/i.test(value); break
      case 'fingerprint': proxy.fingerprint = value; break
      case 'skip-cert-verify': proxy['skip-cert-verify'] = /(TRUE)|1/i.test(value); break
      case 'ip-version':
        proxy['ip-version'] = ['dual', 'ipv4', 'ipv6', 'ipv4-prefer', 'ipv6-prefer'].includes(value) ? value : 'dual'
        break
    }
  }
  return proxy
}

function URI_SOCKS(line: string): ProxyConfig {
  line = line.split(/socks5:\/\//)[1]
  const m = /^((.*?)@)?(.*?)(:(\d+))?\/?(\?(.*?))?(?:#(.*?))?$/.exec(line)!
  const [, , authRaw, server, , port, , addons = '', nameRaw] = m
  const parsedPort = parseInt(`${port}`, 10)
  const portNum = isNaN(parsedPort) ? 443 : parsedPort
  const auth = authRaw ? decodeURIComponent(authRaw) : authRaw
  const name = trimStr(decodeURIComponent(nameRaw || '')) ?? `SOCKS5 ${server}:${portNum}`

  const proxy: ProxyConfig = { type: 'socks5', name, server, port: portNum }
  if (auth) {
    const [username, password] = auth.split(':')
    proxy.username = username
    proxy.password = password
  }
  for (const addon of addons.split('&')) {
    const [keyRaw, valueRaw] = addon.split('=')
    const key = keyRaw.replace(/_/, '-')
    const value = decodeURIComponent(valueRaw || '')
    switch (key) {
      case 'tls': proxy.tls = /(TRUE)|1/i.test(value); break
      case 'fingerprint': proxy.fingerprint = value; break
      case 'skip-cert-verify': proxy['skip-cert-verify'] = /(TRUE)|1/i.test(value); break
      case 'udp': proxy.udp = /(TRUE)|1/i.test(value); break
      case 'ip-version':
        proxy['ip-version'] = ['dual', 'ipv4', 'ipv6', 'ipv4-prefer', 'ipv6-prefer'].includes(value) ? value : 'dual'
        break
    }
  }
  return proxy
}
