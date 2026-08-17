import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

describe('design system tokens match incumbent CSS', () => {
  const design = readFileSync(join(root, 'DESIGN.md'), 'utf8')
  const styles = readFileSync(join(root, 'src/styles.css'), 'utf8')
  const product = readFileSync(join(root, 'PRODUCT.md'), 'utf8')
  const main = readFileSync(join(root, 'src/main.jsx'), 'utf8')
  const sidecar = JSON.parse(readFileSync(join(root, '.impeccable/design.json'), 'utf8'))

  it('PRODUCT.md carries schema and platform web', () => {
    assert.match(product, /impeccable:product-schema 1/)
    assert.match(product, /## Platform\n\nweb\n/)
    assert.match(product, /## Users/)
    assert.match(product, /## Product Purpose/)
    assert.match(product, /## Capabilities and Constraints/)
  })

  it('DESIGN.md frontmatter colors appear in styles.css', () => {
    const pairs = [
      ['#29233b', '--color-primary'],
      ['#f8f9ff', '--color-lighter'],
      ['#eeeff7', '--color-light'],
      ['#ff9401', '--color-dark-primary'],
      ['#2775ca', '--color-primary-light'],
    ]
    for (const [hex, token] of pairs) {
      assert.ok(design.includes(hex), `DESIGN has ${hex}`)
      assert.ok(styles.includes(token), `styles declares ${token}`)
      assert.ok(styles.toLowerCase().includes(hex.toLowerCase()), `styles has ${hex}`)
    }
  })

  it('design.json sidecar has schemaVersion 2', () => {
    assert.equal(sidecar.schemaVersion, 2)
    assert.ok(sidecar.extensions)
    assert.ok(Array.isArray(sidecar.components))
    assert.ok(sidecar.components.length >= 3)
  })

  it('critique snapshot exists for main UI', () => {
    const dir = join(root, '.impeccable/critique')
    const files = readdirSync(dir).filter((name) => name.endsWith('.md'))
    assert.ok(files.length >= 1, 'expected a critique markdown snapshot')
    const body = readFileSync(join(dir, files[0]), 'utf8')
    assert.match(body, /total_score|Design Health Score|Priority Issues/i)
  })

  it('polish affordances ship in main UI source', () => {
    assert.match(main, /function useEscapeToClose/)
    assert.match(main, /function formatQuoteCountdown/)
    assert.match(main, /incompleteNotice/)
    assert.match(main, /mode-callout/)
    assert.match(main, /aria-label="Transfer speed"/)
    assert.match(styles, /button:focus-visible/)
    assert.match(styles, /transition:\s*transform/)
    assert.match(styles, /\.resume-banner/)
  })
})
