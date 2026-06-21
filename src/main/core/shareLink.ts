import { parseYaml, stringifyYaml } from '../utils/yaml'
import { addProfileItem } from '../config/profile'

type ProxyMap = Record<string, unknown>

const DEFAULT_TEMPLATE = `
mixed-port: 2080
allow-lan: true
tcp-concurrent: true
enable-process: true
find-process-mode: always
global-client-fingerprint: chrome
mode: rule
log-level: debug
ipv6: false
keep-alive-interval: 30
unified-delay: false
profile:
  store-selected: true
sniffer:
  enable: true
  sniff:
    HTTP:
      ports: [80, 8080-8880]
      override-destination: true
    TLS:
      ports: [443, 8443]
    QUIC:
      ports: [443, 8443]
tun:
  enable: true
  stack: mixed
  dns-hijack: ['any:53']
  auto-route: true
  auto-detect-interface: true
  strict-route: true
dns:
  enable: true
  listen: :1053
  prefer-h3: false
  ipv6: false
  enhanced-mode: fake-ip
  fake-ip-filter: ['+.lan', '+.local']
  nameserver: ['https://doh.dns.sb/dns-query']
proxies:
  - name: myproxy
    type: vless
    server: YOURDOMAIN
    port: 443
    uuid: YOURUUID
    network: tcp
    flow: xtls-rprx-vision
    udp: true
    tls: true
    reality-opts:
      public-key: YOURPUBLIC
      short-id: YOURSHORTID
    servername: YOURREALITYDEST
    client-fingerprint: chrome
proxy-groups:
  - name: PROXY
    type: select
    proxies:
      - myproxy
rule-providers:
  ru-bundle:
    type: http
    behavior: domain
    format: mrs
    url: https://github.com/legiz-ru/mihomo-rule-sets/raw/main/ru-bundle/rule.mrs
    path: ./ru-bundle/rule.mrs
    interval: 86400
  refilter_domains:
    type: http
    behavior: domain
    format: mrs
    url: https://github.com/legiz-ru/mihomo-rule-sets/raw/main/re-filter/domain-rule.mrs
    path: ./re-filter/domain-rule.mrs
    interval: 86400
  refilter_ipsum:
    type: http
    behavior: ipcidr
    format: mrs
    url: https://github.com/legiz-ru/mihomo-rule-sets/raw/main/re-filter/ip-rule.mrs
    path: ./re-filter/ip-rule.mrs
    interval: 86400
  oisd_big:
    type: http
    behavior: domain
    format: mrs
    url: https://github.com/legiz-ru/mihomo-rule-sets/raw/main/oisd/big.mrs
    path: ./oisd/big.mrs
    interval: 86400
rules:
  - OR,((DOMAIN,ipwhois.app),(DOMAIN,ipwho.is),(DOMAIN,api.ip.sb),(DOMAIN,ipapi.co),(DOMAIN,ipinfo.io)),PROXY
  - RULE-SET,oisd_big,REJECT
  - PROCESS-NAME,Discord.exe,PROXY
  - RULE-SET,ru-bundle,PROXY
  - RULE-SET,refilter_domains,PROXY
  - RULE-SET,refilter_ipsum,PROXY
  - MATCH,DIRECT
`

const WITHOUT_RU_TEMPLATE = `
mixed-port: 7890
allow-lan: true
tcp-concurrent: true
enable-process: true
find-process-mode: always
mode: rule
log-level: debug
ipv6: false
keep-alive-interval: 30
unified-delay: false
profile:
  store-selected: true
sniffer:
  enable: true
  force-dns-mapping: true
  parse-pure-ip: true
  sniff:
    HTTP:
      ports:
        - 80
        - 8080-8880
      override-destination: true
    TLS:
      ports:
        - 443
        - 8443
tun:
  enable: true
  stack: gvisor
  auto-route: true
  auto-detect-interface: false
  dns-hijack:
    - any:53
  strict-route: true
  mtu: 1500
dns:
  enable: true
  prefer-h3: true
  use-hosts: true
  use-system-hosts: true
  listen: 127.0.0.1:6868
  ipv6: false
  enhanced-mode: redir-host
  default-nameserver:
    - tls://1.1.1.1
    - tls://1.0.0.1
  proxy-server-nameserver:
    - tls://1.1.1.1
    - tls://1.0.0.1
  direct-nameserver:
    - tls://77.88.8.8
  nameserver:
    - https://cloudflare-dns.com/dns-query
proxies:
  - name: myproxy
    type: vless
    server: YOURDOMAIN
    port: 443
    uuid: YOURUUID
    network: tcp
    flow: xtls-rprx-vision
    udp: true
    tls: true
    reality-opts:
      public-key: YOURPUBLIC
      short-id: YOURSHORTID
    servername: YOURREALITYDEST
    client-fingerprint: chrome
proxy-groups:
  - name: PROXY
    icon: https://cdn.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/Hijacking.png
    type: select
    proxies:
      - "\u26A1\uFE0F Fastest"
      - "\uD83D\uDCF6 First Available"
      - myproxy
  - name: "\u26A1\uFE0F Fastest"
    icon: https://cdn.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/Auto.png
    type: url-test
    tolerance: 150
    url: https://cp.cloudflare.com/generate_204
    interval: 300
    proxies:
      - myproxy
  - name: "\uD83D\uDCF6 First Available"
    icon: https://cdn.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/Download.png
    type: fallback
    url: https://cp.cloudflare.com/generate_204
    interval: 300
    proxies:
      - myproxy
rule-providers:
  torrent-trackers:
    type: http
    behavior: domain
    format: mrs
    url: https://github.com/legiz-ru/mihomo-rule-sets/raw/main/other/torrent-trackers.mrs
    path: ./rule-sets/torrent-trackers.mrs
    interval: 86400
  torrent-clients:
    type: http
    behavior: classical
    format: yaml
    url: https://github.com/legiz-ru/mihomo-rule-sets/raw/main/other/torrent-clients.yaml
    path: ./rule-sets/torrent-clients.yaml
    interval: 86400
  geosite-ru:
    type: http
    behavior: domain
    format: mrs
    url: https://github.com/MetaCubeX/meta-rules-dat/raw/meta/geo/geosite/category-ru.mrs
    path: ./geosite-ru.mrs
    interval: 86400
  xiaomi:
    type: http
    behavior: domain
    format: mrs
    url: https://github.com/MetaCubeX/meta-rules-dat/raw/meta/geo/geosite/xiaomi.mrs
    path: ./rule-sets/xiaomi.mrs
    interval: 86400
  blender:
    type: http
    behavior: domain
    format: mrs
    url: https://github.com/MetaCubeX/meta-rules-dat/raw/meta/geo/geosite/blender.mrs
    path: ./rule-sets/blender.mrs
    interval: 86400
  drweb:
    type: http
    behavior: domain
    format: mrs
    url: https://github.com/MetaCubeX/meta-rules-dat/raw/meta/geo/geosite/drweb.mrs
    path: ./rule-sets/drweb.mrs
    interval: 86400
  debian:
    type: http
    behavior: domain
    format: mrs
    url: https://github.com/MetaCubeX/meta-rules-dat/raw/meta/geo/geosite/debian.mrs
    path: ./rule-sets/debian.mrs
    interval: 86400
  canonical:
    type: http
    behavior: domain
    format: mrs
    url: https://github.com/MetaCubeX/meta-rules-dat/raw/meta/geo/geosite/canonical.mrs
    path: ./rule-sets/canonical.mrs
    interval: 86400
  python:
    type: http
    behavior: domain
    format: mrs
    url: https://github.com/MetaCubeX/meta-rules-dat/raw/meta/geo/geosite/python.mrs
    path: ./rule-sets/python.mrs
    interval: 86400
  geoip-ru:
    type: http
    behavior: ipcidr
    format: mrs
    url: https://github.com/MetaCubeX/meta-rules-dat/raw/meta/geo/geoip/ru.mrs
    path: ./geoip-ru.mrs
    interval: 86400
  geosite-private:
    type: http
    behavior: domain
    format: mrs
    url: https://github.com/MetaCubeX/meta-rules-dat/raw/meta/geo/geosite/private.mrs
    path: ./geosite-private.mrs
    interval: 86400
  geoip-private:
    type: http
    behavior: ipcidr
    format: mrs
    url: https://github.com/MetaCubeX/meta-rules-dat/raw/meta/geo/geoip/private.mrs
    path: ./geoip-private.mrs
    interval: 86400
rules:
  - DOMAIN-SUFFIX,habr.com,PROXY
  - DOMAIN-SUFFIX,kemono.su,PROXY
  - DOMAIN-SUFFIX,jut.su,PROXY
  - DOMAIN-SUFFIX,kara.su,PROXY
  - DOMAIN-SUFFIX,theins.ru,PROXY
  - DOMAIN-SUFFIX,tvrain.ru,PROXY
  - DOMAIN-SUFFIX,echo.msk.ru,PROXY
  - DOMAIN-SUFFIX,the-village.ru,PROXY
  - DOMAIN-SUFFIX,snob.ru,PROXY
  - DOMAIN-SUFFIX,novayagazeta.ru,PROXY
  - DOMAIN-SUFFIX,moscowtimes.ru,PROXY
  - DOMAIN-KEYWORD,animego,PROXY
  - DOMAIN-KEYWORD,yummyanime,PROXY
  - DOMAIN-KEYWORD,yummy-anime,PROXY
  - DOMAIN-KEYWORD,animeportal,PROXY
  - DOMAIN-KEYWORD,anime-portal,PROXY
  - DOMAIN-KEYWORD,animedub,PROXY
  - DOMAIN-KEYWORD,anidub,PROXY
  - DOMAIN-KEYWORD,animelib,PROXY
  - DOMAIN-KEYWORD,ikianime,PROXY
  - DOMAIN-KEYWORD,anilibria,PROXY
  - PROCESS-NAME,Discord.exe,PROXY
  - PROCESS-NAME,discord,PROXY
  - RULE-SET,geosite-private,DIRECT,no-resolve
  - RULE-SET,geoip-private,DIRECT
  - RULE-SET,torrent-clients,DIRECT
  - RULE-SET,torrent-trackers,DIRECT
  - DOMAIN-SUFFIX,.ru,DIRECT
  - DOMAIN-SUFFIX,.su,DIRECT
  - DOMAIN-SUFFIX,.ru.com,DIRECT
  - DOMAIN-SUFFIX,.ru.net,DIRECT
  - DOMAIN-SUFFIX,wikipedia.org,DIRECT
  - DOMAIN-SUFFIX,kudago.com,DIRECT
  - DOMAIN-SUFFIX,kinescope.io,DIRECT
  - DOMAIN-SUFFIX,redheadsound.studio,DIRECT
  - DOMAIN-SUFFIX,plplayer.online,DIRECT
  - DOMAIN-SUFFIX,lomont.site,DIRECT
  - DOMAIN-SUFFIX,remanga.org,DIRECT
  - DOMAIN-SUFFIX,shopstory.live,DIRECT
  - DOMAIN-KEYWORD,miradres,DIRECT
  - DOMAIN-KEYWORD,premier,DIRECT
  - DOMAIN-KEYWORD,shutterstock,DIRECT
  - DOMAIN-KEYWORD,2gis,DIRECT
  - DOMAIN-KEYWORD,diginetica,DIRECT
  - DOMAIN-KEYWORD,kinescopecdn,DIRECT
  - DOMAIN-KEYWORD,researchgate,DIRECT
  - DOMAIN-KEYWORD,springer,DIRECT
  - DOMAIN-KEYWORD,nextcloud,DIRECT
  - DOMAIN-KEYWORD,wiki,DIRECT
  - DOMAIN-KEYWORD,kaspersky,DIRECT
  - DOMAIN-KEYWORD,stepik,DIRECT
  - DOMAIN-KEYWORD,likee,DIRECT
  - DOMAIN-KEYWORD,snapchat,DIRECT
  - DOMAIN-KEYWORD,yappy,DIRECT
  - DOMAIN-KEYWORD,pikabu,DIRECT
  - DOMAIN-KEYWORD,okko,DIRECT
  - DOMAIN-KEYWORD,wink,DIRECT
  - DOMAIN-KEYWORD,kion,DIRECT
  - DOMAIN-KEYWORD,roblox,DIRECT
  - DOMAIN-KEYWORD,ozon,DIRECT
  - DOMAIN-KEYWORD,wildberries,DIRECT
  - DOMAIN-KEYWORD,aliexpress,DIRECT
  - RULE-SET,geosite-ru,DIRECT
  - RULE-SET,xiaomi,DIRECT
  - RULE-SET,blender,DIRECT
  - RULE-SET,drweb,DIRECT
  - RULE-SET,debian,DIRECT
  - RULE-SET,canonical,DIRECT
  - RULE-SET,python,DIRECT
  - RULE-SET,geoip-ru,DIRECT
  - MATCH,PROXY
`

const SHARE_LINK_REGEX = /^(vmess|vless|ss|trojan):\/\//

export function isShareLink(url: string): boolean {
  return SHARE_LINK_REGEX.test(url)
}

function parseShareLink(link: string): { proxyName: string; proxy: ProxyMap } {
  const url = new URL(link)
  const scheme = url.protocol.replace(':', '')

  const proxyName = url.hash ? decodeURIComponent(url.hash.slice(1)) : 'Proxy from Link'

  const proxy: ProxyMap = {
    name: proxyName,
    type: scheme,
    server: url.hostname,
    port: parseInt(url.port) || 443,
    udp: true
  }

  switch (scheme) {
    case 'vless':
    case 'trojan': {
      proxy.uuid = decodeURIComponent(url.username)
      const realityOpts: Record<string, string> = {}
      for (const [key, value] of url.searchParams) {
        switch (key) {
          case 'security':
            if (value === 'reality' || value === 'tls') {
              proxy.tls = true
            }
            break
          case 'flow':
            proxy.flow = value
            break
          case 'sni':
            proxy.servername = value
            break
          case 'fp':
            proxy['client-fingerprint'] = value
            break
          case 'pbk':
            realityOpts['public-key'] = value
            break
          case 'sid':
            realityOpts['short-id'] = value
            break
          case 'type':
            if (value !== 'tcp') proxy.network = value
            break
          case 'path':
            proxy['ws-opts'] = { path: value }
            break
          case 'host':
            if (proxy['ws-opts']) {
              ;(proxy['ws-opts'] as Record<string, unknown>).headers = { Host: value }
            }
            break
          case 'alpn':
            proxy.alpn = value.split(',')
            break
        }
      }
      if (Object.keys(realityOpts).length > 0) {
        proxy['reality-opts'] = realityOpts
      }
      break
    }
    case 'ss': {
      // ss://base64(cipher:password)@host:port#name
      // or ss://cipher:password@host:port#name (SIP002)
      const userInfo = decodeURIComponent(url.username)
      let decoded: string
      try {
        decoded = Buffer.from(userInfo, 'base64').toString('utf-8')
      } catch {
        // SIP002 format: username is cipher, password is password
        decoded = `${userInfo}:${decodeURIComponent(url.password)}`
      }
      const colonIdx = decoded.indexOf(':')
      if (colonIdx !== -1) {
        proxy.cipher = decoded.slice(0, colonIdx)
        proxy.password = decoded.slice(colonIdx + 1)
      }
      // Override server/port from URL since ss:// puts base64 in host for legacy format
      if (url.hostname) proxy.server = url.hostname
      if (url.port) proxy.port = parseInt(url.port)
      break
    }
    case 'vmess': {
      // vmess://base64(json)
      const hostPart = link.slice('vmess://'.length).split('#')[0]
      try {
        const decoded = Buffer.from(hostPart, 'base64').toString('utf-8')
        const params = JSON.parse(decoded) as Record<string, unknown>
        if (params.add) proxy.server = String(params.add)
        if (params.port) proxy.port = Number(params.port)
        if (params.id) proxy.uuid = String(params.id)
        if (params.aid) proxy.alterId = Number(params.aid)
        if (params.net) proxy.network = String(params.net)
        if (params.ps) proxy.name = String(params.ps)
        if (params.tls === 'tls') proxy.tls = true
        if (params.sni) proxy.servername = String(params.sni)
        proxy.cipher = 'auto'
      } catch {
        throw new Error('Invalid vmess link: failed to decode base64 payload')
      }
      break
    }
    default:
      throw new Error(`Unsupported protocol: ${scheme}`)
  }

  return { proxyName: proxy.name as string, proxy }
}

export async function createProfileFromShareLink(
  link: string,
  templateName: string = 'default'
): Promise<void> {
  const templateYaml = templateName === 'without_ru' ? WITHOUT_RU_TEMPLATE : DEFAULT_TEMPLATE
  const { proxyName, proxy } = parseShareLink(link)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const config = parseYaml<any>(templateYaml)

  // Replace proxies array with the parsed proxy
  config.proxies = [proxy]

  // Replace "myproxy" references in proxy-groups
  if (Array.isArray(config['proxy-groups'])) {
    for (const group of config['proxy-groups']) {
      if (Array.isArray(group.proxies)) {
        group.proxies = group.proxies.map((p: string) => (p === 'myproxy' ? proxyName : p))
      }
    }
  }

  const yamlContent = stringifyYaml(config)

  await addProfileItem({
    type: 'local',
    name: proxyName,
    file: yamlContent
  })
}
