# Candidacy Exam Scheduler

A static web app that collects availability from ~45 faculty and packs 52
three-person candidacy exams into a 90-minute slot each, live, in the browser.
No build step, no server of your own — plain HTML/CSS/JS plus a Firebase
Realtime Database for shared state.

**Everyone shares one link.** Opening it shows the live board — what is already
scheduled, and who has replied. You click your own name once, grey out the times
that do not work, and submit. Every open browser re-solves and redraws the moment
anyone submits, so the board fills in while people are still replying.

## Try it before setting anything up

Open `index.html?demo` — it swaps Firebase for an in-browser store seeded with
the real roster and plausible availability. Open the same URL in two tabs to
watch the live updates. Add `&fresh` to reseed, or `&empty` to start from the create-event screen.
Nothing leaves the browser.

## Setup

See **[SETUP.md](SETUP.md)** for the click-by-click Firebase walkthrough. The
short version:

1. Create a Firebase project and a **Realtime Database** (not Firestore).
2. Publish these rules — do not leave it in test mode, those expire after 30 days:

   ```json
   {
     "rules": {
       ".read": false,
       ".write": false,
       "candidacy": { ".read": true, ".write": true }
     }
   }
   ```

3. Put the database URL in `config.js` and deploy.
4. Open `#/admin`, **Create the event**, set an organiser passphrase.
5. **Faculty** tab → paste email addresses → **Email everyone**. One message,
   one link, addresses in BCC.

### About the security model

Anyone with the link can read and write the `candidacy` branch, and can open any
colleague's grid. Names are a choice on a page, not a login — that is the cost
of the no-password flow. Same trade-off as a shared Google Sheet link:
appropriate for scheduling, not for anything confidential. The organiser
passphrase only hides the admin tab in the UI.

## Running the event

The dashboard ranks faculty by **how many exams each one is personally holding
up**, so chasing from the top clears the most exams per email. An exam is:

- *waiting* — a member has not submitted at all;
- *no common window* — all three submitted, no 90 minutes where all three are
  free (the blame list names who to ask);
- *squeezed out* — a window exists but another exam sharing a member took it.

**Pin** an exam to freeze it; pinned exams become hard constraints the solver
schedules around. **Pin everything** once you are happy, then keep collecting.
Per-student constraints ("cannot do the first two weeks of October") go in
**Exams → Constraints**.

**Download data** on the dashboard exports the whole board as CSV — the
schedule, the roster with everyone's considerations, the faculty response
tracker, every free block each person gave, and every workable time for every
exam — plus an `.ics` of the booked exams. "Download everything" takes the lot
in one click.

## The one thing that decides whether this works

Three calendars have to intersect. Measured on this roster over Oct–Nov
weekdays, 9–5:

| Share of the window each person leaves open | Exams that schedule |
| --- | --- |
| ~70% | 52 / 52 |
| ~50% | 51 / 52 |
| ~35% | 9 / 52 |
| ~20% | 1 / 52 |

The cliff between 50% and 35% is why the grid starts **fully open** and asks
people to block what does not work, rather than asking them to pick free slots.
Anyone who marks only their few preferred times will single-handedly stall
their committees, and the faculty page warns them when they drop below ~45%.

## The shared board

Three tabs, all live:

- **My availability** — your grid, your committees, and their current status.
- **Schedule** — everything placed so far, by day; your own exams are flagged.
- **Faculty** — who has replied and how much they left open. This doubles as
  the name picker.

Your name is remembered in your browser, so you land straight on your own grid
next time. *switch* in the header changes it.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | shell; loads everything |
| `config.js` | your Firebase URL |
| `solver.js` | time grid + the scheduling search (pure, deterministic) |
| `firebase.js` | REST + SSE client, no SDK |
| `app.js` | state, live wiring, faculty view |
| `admin.js` | setup, organiser console, exports |
| `demo.js` | `?demo` in-browser fake backend |
| `roster-seed.js` | the 52 exams and 45 faculty, generated from the spreadsheet |
| `SETUP.md` | Firebase walkthrough |

`bump.sh` bumps the `?v=` cache-buster on every asset — run it after any
CSS/JS change so a cached file can never outlive a deploy.

## Deploying

One branch, `main`, served directly by GitHub Pages at
<https://bryandickinson-create.github.io/candidacy-scheduler/>. There is no
build step, so a deploy is:

```sh
./bump.sh && git add -A && git commit -m "…" && git push
```

Pages rebuilds within about a minute. Always run `bump.sh` — without it a
browser can keep serving yesterday's `app.js` against today's `style.css`.

The organiser console is the same URL with `#/admin` on the end.


## How the scheduling works

`solver.js` is a pure function of (settings, roster, availability, bookings). It
builds 30-minute availability cells and hourly candidate starts, then runs a
branch-and-bound search with minimum-remaining-values ordering and incremental
constraint propagation — 52 exams over ~290 candidate starts solves in a few
milliseconds. It maximises the number scheduled rather than failing outright, so
a partially-answered roster still produces a partial board.

Its primary output is not one assignment but, for each exam, **every** time that
works right now — given availability, the student's constraints, and the
bookings already made. That is what "ready to book" counts. A time only becomes
real when the organiser books it, and bookings live in the database, so every
browser derives the same board with no coordination between them.

The search is still there, behind "Suggest times for all": it proposes a
complete, clash-free set so the organiser can see a way to finish rather than
booking greedily into a corner. It is advisory and never written on its own.
`bookingImpact()` guards the other direction — before a booking is taken, it
reports which other exams that choice would leave with no workable time.
