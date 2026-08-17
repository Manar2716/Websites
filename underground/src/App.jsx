import { usePrefersReducedMotion, useReveals } from './lib/hooks.js'
import { Cursor, Grain } from './components/ui.jsx'
import Drift from './components/Drift.jsx'
import ConceptBadge from './components/ConceptBadge.jsx'

import Nav from './sections/Nav.jsx'
import Hero from './sections/Hero.jsx'
import Marquee from './sections/Marquee.jsx'
import Story from './sections/Story.jsx'
import Classics from './sections/Classics.jsx'
import Menu from './sections/Menu.jsx'
import Escape from './sections/Escape.jsx'
import Drinks from './sections/Drinks.jsx'
import Gallery from './sections/Gallery.jsx'
import Visit from './sections/Visit.jsx'
import Contact from './sections/Contact.jsx'
import Footer from './sections/Footer.jsx'

/* ═══════════════════════════════════════════════════════════════════
   Eleven sections, alternating cream reading bands against full-bleed
   green ones, and each there for a reason:

     hero        the garden, the name, and two things to do
     marquee     a beat between the picture and the reading
     story       who it is, where, and four facts under it
     classics    four dishes, printed large, alternating down the page
     menu        the list, by category, with a picture per item
     escape      the one section that is only a picture and two lines
     drinks      the counter, on a green card
     gallery     the place, at three sizes and three shapes
     visit       how to get there and when it is open
     contact     the ask
     footer      everything again, small, under a giant wordmark

   The reduced-motion preference is read once here and handed down: one
   media query listener, one source of truth, and no chance of half the
   page animating while the other half holds still.
   ═══════════════════════════════════════════════════════════════════ */

export default function App() {
  const reduced = usePrefersReducedMotion()
  useReveals(reduced)

  return (
    <>
      <Grain />
      <Drift reduced={reduced} />
      <Cursor reduced={reduced} />
      <ConceptBadge />
      <Nav reduced={reduced} />

      <main>
        <Hero reduced={reduced} />
        <Marquee />
        <Story reduced={reduced} />
        <Classics reduced={reduced} />
        <Menu reduced={reduced} />
        <Escape reduced={reduced} />
        <Drinks reduced={reduced} />
        <Gallery reduced={reduced} />
        <Visit reduced={reduced} />
        <Contact reduced={reduced} />
      </main>

      <Footer />
    </>
  )
}
