import { usePrefersReducedMotion, useReveals } from './lib/hooks.js'
import { Cursor, Grain } from './components/ui.jsx'
import ConceptBadge from './components/ConceptBadge.jsx'

import Nav from './sections/Nav.jsx'
import Hero from './sections/Hero.jsx'
import Marquee from './sections/Marquee.jsx'
import About from './sections/About.jsx'
import Hours from './sections/Hours.jsx'
import Menu from './sections/Menu.jsx'
import Featured from './sections/Featured.jsx'
import Gallery from './sections/Gallery.jsx'
import Location from './sections/Location.jsx'
import Statement from './sections/Statement.jsx'
import Footer from './sections/Footer.jsx'

/* ═══════════════════════════════════════════════════════════════════
   Nine sections, and each one is there for a reason:

     hero        the room, the name, and two things to do
     marquee     a beat between the picture and the reading
     about       who it is and where, with four facts under it
     hours       the day, read sideways because a day is a sequence
     menu        the list, with a picture per item
     featured    one dish, printed large
     gallery     the room again, at six sizes
     location    how to get there, and when it is open
     statement   the ask
     footer      everything again, small

   The reduced-motion preference is read once here and handed down,
   rather than each component asking for itself: one media query
   listener, one source of truth, and no chance of half the page
   animating while the other half holds still.
   ═══════════════════════════════════════════════════════════════════ */

export default function App() {
  const reduced = usePrefersReducedMotion()
  useReveals(reduced)

  return (
    <>
      <Grain />
      <Cursor reduced={reduced} />
      <ConceptBadge />
      <Nav reduced={reduced} />

      <main>
        <Hero reduced={reduced} />
        <Marquee />
        <About reduced={reduced} />
        <Hours reduced={reduced} />
        <Menu reduced={reduced} />
        <Featured reduced={reduced} />
        <Gallery reduced={reduced} />
        <Location reduced={reduced} />
        <Statement reduced={reduced} />
      </main>

      <Footer />
    </>
  )
}
