// @vitest-environment node
import { execSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'

// PWA installability checks against the real production build in dist/.

const root = fileURLToPath(new URL('..', import.meta.url))
const dist = join(root, 'dist')
const BASE = '/pwa-todo/'

interface ManifestIcon {
  src: string
  sizes: string
  type: string
  purpose?: string
}

function pngSize(file: string): { width: number; height: number } {
  const buf = readFileSync(file)
  // PNG signature, then the IHDR chunk holds width/height as big-endian uint32.
  expect(buf.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) }
}

beforeAll(() => {
  if (!existsSync(join(dist, 'manifest.webmanifest'))) {
    execSync('npm run build', { cwd: root, stdio: 'inherit' })
  }
})

describe('PWA installability of the built app', () => {
  it('ships a web app manifest that satisfies the installability criteria', () => {
    const manifest = JSON.parse(readFileSync(join(dist, 'manifest.webmanifest'), 'utf8'))

    expect(manifest.name).toBe('PWA Todo')
    expect(manifest.short_name).toBe('Todo')
    expect(manifest.id).toBe(BASE)
    expect(manifest.start_url).toBe(BASE)
    expect(manifest.scope).toBe(BASE)
    expect(manifest.display).toBe('standalone')
    expect(manifest.theme_color).toBe('#1d4ed8')
    expect(manifest.background_color).toBe('#f3f4f6')

    const icons = manifest.icons as ManifestIcon[]
    const sizes = icons.map((icon) => icon.sizes)
    expect(sizes).toContain('192x192')
    expect(sizes).toContain('512x512')
    expect(icons.some((icon) => icon.purpose === 'maskable' && icon.sizes === '512x512')).toBe(true)
    expect(icons.every((icon) => icon.type === 'image/png')).toBe(true)
  })

  it('links the manifest from the built index.html', () => {
    const html = readFileSync(join(dist, 'index.html'), 'utf8')
    expect(html).toContain(`<link rel="manifest" href="${BASE}manifest.webmanifest">`)
    expect(html).toContain('name="theme-color"')
  })

  it('ships every icon the manifest declares, with the declared pixel sizes', () => {
    const manifest = JSON.parse(readFileSync(join(dist, 'manifest.webmanifest'), 'utf8'))
    for (const icon of manifest.icons as ManifestIcon[]) {
      const file = join(dist, icon.src)
      expect(existsSync(file), `${icon.src} is missing from dist/`).toBe(true)
      const [w, h] = icon.sizes.split('x').map(Number)
      expect(pngSize(file)).toEqual({ width: w, height: h })
    }
  })

  it('ships a service worker with the full app shell injected into its precache list', () => {
    const sw = readFileSync(join(dist, 'sw.js'), 'utf8')
    expect(sw).toContain('index.html')
    expect(sw).toContain('manifest.webmanifest')
    expect(sw).toContain('icons/icon-192.png')
    expect(sw).toContain('icons/icon-512.png')
    expect(sw).toContain('icons/icon-512-maskable.png')
    // The injection point must be gone: the plugin replaced it with the real file list.
    expect(sw).not.toContain('__WB_MANIFEST')
    // The shell cache name is versioned per build (derived from the manifest), never a fixed one.
    expect(sw).toContain('pwa-todo-shell-')
    expect(sw).not.toMatch(/["'`]pwa-todo-shell-v1["'`]/)
  })

  it('registers the service worker from the main bundle', () => {
    const assets = readdirSync(join(dist, 'assets'))
    const main = assets.find((name) => /^index-.*\.js$/.test(name))
    expect(main, 'main JS bundle not found in dist/assets').toBeTruthy()
    const js = readFileSync(join(dist, 'assets', main!), 'utf8')
    expect(js).toContain(`${BASE}sw.js`)
  })

  it('requests persistent storage from the main bundle', () => {
    const assets = readdirSync(join(dist, 'assets'))
    const main = assets.find((name) => /^index-.*\.js$/.test(name))
    const js = readFileSync(join(dist, 'assets', main!), 'utf8')
    expect(js).toContain('persistent-storage')
  })
})
