/* Development-only contact sheet. See art.html. */
import { paint } from './art/painters.js'

const GROUPS = [
  ['Hero', ['hero'], 2, '16 / 9'],
  ['Hero — phone crop', ['hero'], 5, '9 / 16'],
  ['Scenes', ['about', 'escape', 'map'], 3, '16 / 10'],
  ['Gallery', ['gal-terrace', 'gal-leaves', 'gal-counter', 'gal-seat', 'gal-window', 'gal-detail'], 3, '16 / 10'],
  ['Gallery — tall crop', ['gal-terrace', 'gal-window', 'gal-detail'], 4, '4 / 5'],
  ['British mains', ['english', 'fishchips', 'cottagepie', 'jacket'], 4, '4 / 3'],
  ['Doner + burgers', ['doner', 'doneronchips', 'burgerHeat', 'burgerDoner'], 4, '4 / 3'],
  ['Pizza', ['pizza', 'pizzaTandoori', 'pizzaMargherita'], 3, '4 / 3'],
  ['Puddings', ['crumble', 'cakecustard', 'cookie'], 3, '4 / 3'],
  ['Drinks', ['icedlatte', 'flatwhite', 'lemonade', 'icedtea'], 4, '4 / 3'],
  ['Feature band', ['wide:fishchips', 'wide:crumble'], 1, '21 / 9'],
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
