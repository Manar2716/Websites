/* Development-only contact sheet. See art.html. */
import { paint } from './art/painters.js'

const GROUPS = [
  ['Hero + full frame', ['hero'], 3, '16 / 9'],
  ['Gallery', ['gal-bar', 'gal-pour', 'gal-corner', 'gal-machine', 'gal-arch', 'gal-table'], 3, '16 / 10'],
  ['Gallery — tall crop', ['gal-pour', 'gal-corner'], 4, '4 / 5'],
  ['Ritual', ['beans', 'roast', 'grind', 'extraction', 'pour'], 5, '4 / 5'],
  ['Featured + map', ['featured', 'map'], 2, '16 / 10'],
  ['Coffee', ['espresso', 'flatwhite', 'cortado', 'v60', 'icedlatte', 'matcha'], 3, '4 / 3'],
  ['Drinks', ['lemonade', 'icedtea', 'orange', 'sparkling'], 4, '4 / 3'],
  ['Breakfast', ['avotoast', 'shakshuka', 'pancakes', 'benedict'], 4, '4 / 3'],
  ['Mains', ['burger', 'sando', 'pasta', 'milanese'], 4, '4 / 3'],
  ['Desserts', ['cookie', 'basque', 'tiramisu', 'pudding'], 4, '4 / 3'],
  ['Feature crop', ['espresso', 'burger', 'cookie'], 2, '16 / 11'],
]

const out = document.getElementById('out')

for (const [title, ids, cols, ratio] of GROUPS) {
  const h = document.createElement('h2')
  h.textContent = title
  out.append(h)
  const grid = document.createElement('div')
  grid.className = 'grid'
  grid.style.gridTemplateColumns = `repeat(${cols}, minmax(0,1fr))`
  out.append(grid)

  for (const id of ids) {
    const fig = document.createElement('figure')
    const c = document.createElement('canvas')
    c.style.aspectRatio = ratio
    const cap = document.createElement('figcaption')
    cap.textContent = id
    fig.append(c, cap)
    grid.append(fig)
  }
  requestAnimationFrame(() => {
    for (const [i, id] of ids.entries()) {
      const c = grid.children[i].querySelector('canvas')
      const w = Math.round(c.offsetWidth)
      const hh = Math.round(c.offsetHeight)
      const dpr = Math.min(devicePixelRatio || 1, 2)
      c.width = w * dpr
      c.height = hh * dpr
      const ctx = c.getContext('2d')
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      paint(ctx, id, w, hh)
    }
  })
}
