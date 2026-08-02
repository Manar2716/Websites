# FADE & CO — a barber booking platform

A public site, a six-step booking flow and a single-admin dashboard, on
Supabase. No build step, no framework, no dependencies to install.

```bash
python3 -m http.server 8000   # then visit localhost:8000/barber/
```

It runs immediately on demo data held in the browser. Point it at a Supabase
project and the same code becomes the real thing.

## What is here

| Page | |
|---|---|
| `index.html` | The shop — hero, services, barbers, gallery, testimonials, FAQ, contact |
| `book.html` | Booking: service → barber → date → time → details → confirm |
| `booking.html` | Confirmation, plus lookup and self-cancel by reference + phone |
| `admin/` | Dashboard, diary, customers, services, barbers, schedule, content, gallery, testimonials, settings |

Sign in to the admin with `admin@fadeandco.nl` / `fadeandco` while in demo
mode. The form is pre-filled.

## Connecting Supabase

1. Create a project, then open the SQL editor and run `supabase/schema.sql`
   followed by `supabase/seed.sql`. The first is idempotent; the second fills
   gaps without overwriting anything you have since edited.
2. **Authentication → Users → Add user.** This is your admin. Do it here, not
   from a sign-up form — see below.
3. Promote that user, once, from the SQL editor:

   ```sql
   insert into admin_users (user_id, email)
   select id, email from auth.users where email = 'you@example.com';
   ```

4. **Authentication → Providers → Email:** turn *Enable sign-ups* off. Nothing
   in the product needs it, and leaving it on invites confusion.
5. **Storage:** create a public bucket named `media` if you want to upload
   photos from the admin. Without it, images can still be added by URL.
6. Put the project URL and the **anon** key into `config.js`. Never the service
   role key — that key bypasses every policy in the next section.

The admin's Settings screen can also store a connection in `localStorage`,
which is handy for trying a project out without editing a file on the server.
`config.js` remains the permanent setting.

## How the security actually works

The gate on `/admin` is a convenience. The boundary is row level security, and
it holds whether or not the UI cooperates.

**One admin, and only one.** `admin_users` has a singleton constraint — a
second row is rejected by the database, not by application code. The table has
RLS forced and **no policies at all**, so no request through the API can read
or write it, whoever is signed in. Adding an admin is a deliberate act in the
SQL editor with the service role. A customer cannot promote themselves because
there is no code path, anywhere, that writes to that table.

**Anonymous visitors get three functions and nothing else.** `create_booking`,
`get_booking` and `cancel_booking` are `SECURITY DEFINER`; the two that read or
change a booking require the reference *and* the phone number on it, so a
reference on its own leaks nothing. `appointments` and `customers` have no
anonymous policy of any kind — a visitor cannot select a single row.

**Signing in is not the same as being the admin.** If someone obtains a
Supabase account some other way, `signIn` checks `is_admin()` and signs them
straight back out. Even without that check, every policy would refuse them.

**The client is never trusted about availability.** `create_booking`
re-derives the free slots inside the transaction and refuses anything that is
not on the list. Underneath that, the real guarantee:

```sql
constraint appointments_no_overlap exclude using gist (
  barber_id with =,
  tstzrange(starts_at, ends_at, '[)') with &&
) where (status <> 'cancelled')
```

Two customers tapping the same slot at the same instant is settled by
Postgres, not by a check-then-insert that can interleave. One gets the chair;
the other gets "that time has just been taken" and a fresh list.

## Availability

`get_available_slots(barber, service, date)` is the single source of truth for
what can be booked. It applies, in order: the service's length, the barber
being active and not on vacation, the booking horizon, per-barber hours
falling back to shop hours, the day's break, the lead time, existing
appointments, and holidays or blocked time. The booking flow, the homepage's
"next available" card and the admin all read from it, so there is one
definition of "free" rather than three that drift.

`get_available_days` answers the same question for a month in one round trip,
which is what lets the date picker grey out full days without fetching every
slot on every day.

## Demo mode

With no credentials configured, `backend-demo.js` implements the same contract
against `localStorage`, including a direct port of the availability rules and
the overlap rejection. It exists so the product can be evaluated with nothing
installed, and so the UI has one API to code against instead of two.

It is a demo, not a fallback for production: the session is a `localStorage`
flag, and nothing is shared between devices. A banner says so on every page.
Reset it from Settings.

## Time

Every appointment is stored as an absolute instant. Every displayed time is
rendered in the shop's timezone, which is a setting. That split is why
"Thursday 09:00" means the same thing to a customer abroad as it does to the
barber, and why the hour after a daylight-saving change lands correctly —
`zonedToInstant` resolves the offset twice, using the one in effect at the
resulting instant.

## Design

Apple-adjacent: the system font stack at display sizes with tightened
tracking, one warm brass accent reserved for actions, glass surfaces built
from `backdrop-filter` with a hairline top edge, and a single easing curve
(`cubic-bezier(.22, 1, .36, 1)`) for everything that moves.

Two things were deliberate. Where `backdrop-filter` is unsupported the glass
falls back to a *more* opaque solid rather than a transparent panel with
unreadable text over it. And the ambient wash behind every page is fixed and
never animated — a blurred layer whose contents move re-rasterises every
frame, which is the most expensive thing you can do with this look.

Light and dark are both first-class: the theme follows the system until the
toggle is used, and the choice is then remembered. An inline script in each
`<head>` sets it before first paint, so there is no flash of the wrong one.

Reveal-on-scroll is gated behind a `js` class, so with scripting unavailable
the page is a static version of itself rather than a column of invisible
sections. `prefers-reduced-motion` is honoured throughout.

## Files

```
index.html  book.html  booking.html      the public pages
admin/index.html                         the dashboard shell
config.js                                Supabase URL and anon key

supabase/schema.sql                      tables, RLS, the booking functions
supabase/seed.sql                        starter content

assets/css/base.css                      tokens, glass, controls, feedback
assets/css/site.css                      public site and booking flow
assets/css/admin.css                     sidebar, tables, editors

assets/js/api.js                         picks a backend, shares settings + copy
assets/js/backend-supabase.js            production data layer
assets/js/backend-demo.js                localStorage data layer
assets/js/demo-data.js                   the sample shop
assets/js/time.js                        timezone maths and formatting
assets/js/ui.js                          toasts, dialogs, skeletons, sorting
assets/js/icons.js                       one inline icon set
assets/js/chrome.js                      header, footer, banner, hours
assets/js/site.js                        the public sections
assets/js/booking.js                     the six steps
assets/js/confirmation.js                confirmation, lookup, cancel, .ics
assets/js/admin/app.js                   auth gate, sidebar, hash router
assets/js/admin/common.js                panels, stats, the appointment editor
assets/js/admin/view-*.js                one module per screen
```

## Verified

**The SQL, against a real PostgreSQL 16.** `schema.sql` and `seed.sql` both
apply cleanly and are idempotent on a second run. Then, as the actual `anon`
and `authenticated` roles:

- booking through `create_booking` succeeds as `anon`, the row lands, and
  `anon` still cannot read a single row of `appointments` or `customers`;
- a second booking of the same slot is rejected by the availability re-check,
  and a raw `INSERT` that skips the function is rejected by the exclusion
  constraint — both paths covered, not just the polite one;
- cancelling frees the slot again; completing and then deleting an
  appointment moves `visit_count` 0 → 1 → 0 through the trigger;
- `get_booking` with the wrong phone number returns null;
- a second row in `admin_users` is refused by the singleton constraint;
- a signed-in account that is not the admin sees zero rows and cannot write;
- the admin can do everything *except* read or write `admin_users`;
- a closed Sunday yields no slots, and a fortnight reports 12 bookable days.

Two defects surfaced this way and were fixed: an enum insert that was typed as
`text`, and a `NEW`-on-`DELETE` reference in the stats trigger that would have
raised on every deleted appointment.

**The interface, in Chromium** at 390, 834, 1280 and 1440 px, in light and
dark. The booking flow was run end to end — slot booked, confirmed gone from
the list, second attempt rejected with the message a customer would see — and
the admin exercised the same way: walk-in, overlap refusal, service edit,
keyboard reordering, content save, block-out, approve, gallery hide, customer
history. Three interface bugs came out of it: a Save button rendered outside
its own `<form>` and therefore inert, gallery actions that only appeared on
hover and so were unreachable by touch, and the browser's default `<figure>`
margin quietly halving the width of every gallery tile.

Two things the map depends on: OpenStreetMap's embed is the only outbound
request the site makes, it needs no key, and if the coordinates are empty the
panel shows the address and a link instead.

## Deploying

The repository publishes to GitHub Pages from its root, so this lives at
`/barber/`. The workflow in `.github/workflows/pages.yml` triggers on a
specific branch — check that it matches the branch you merge into.
