import Painting from './Painting.jsx'

/* ═══════════════════════════════════════════════════════════════════
   MEDIA — a photograph if there is one, the drawing if there is not.

   Every picture slot on this page goes through here. The drawings were
   never the point; they are what stands in the frame until Underground's
   own photographs arrive. When a `photo` filename is set on an item in
   `content.js`, the real picture takes the slot and the drawing for that
   one item is simply never painted — no flag to flip, no second layout.

   Both branches fill the frame the same way (`object-fit: cover` against
   an absolutely positioned box), so a photograph lands in exactly the
   crop the drawing was composed for and the surrounding CSS — the mask
   reveal, the parallax wrapper, the hover scale — needs no change.
   ═══════════════════════════════════════════════════════════════════ */

export default function Media({ art, photo, alt = '', className = '', eager = false, style }) {
  if (photo) {
    return (
      <img
        src={photo}
        alt={alt}
        loading={eager ? 'eager' : 'lazy'}
        decoding="async"
        // `fetchpriority` is spelled all-lowercase in the DOM; React
        // passes it through untouched on an intrinsic element.
        fetchpriority={eager ? 'high' : undefined}
        className={className}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          display: 'block',
          ...style,
        }}
      />
    )
  }

  return <Painting id={art} alt={alt} className={className} eager={eager} style={style} />
}
