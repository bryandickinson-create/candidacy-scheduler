# Candidacy Exam Scheduler

A static web app that collects availability from ~45 faculty and packs 52
three-person candidacy exams into a 90-minute slot each, live, in the browser.
No build step, no server of your own — plain HTML/CSS/JS plus a Firebase
Realtime Database for shared state.

Faculty get one personal link. They grey out the times that do not work. Every
open browser re-solves and redraws the moment anyone submits, so the board fills
in while people are still replying.

## Try it before setting anything up

Open `index.html?demo` — it swaps Firebase for an in-browser store seeded with
the real roster and plausible availability. Open the same URL in two tabs to
watch the live updates. Add `&fresh` to reseed, or `&empty` to start from the create-event screen.
Nothing leaves the browser.

## Setup

1. Create a Firebase project at <https://console.firebase.google.com> (free, no
   billing). **Build → Realtime Database → Create Database**, start in test mode.
2. **Rules** tab, publish:

   ```json
   {
     "rules": {
       ".read": false,
       ".write": false,
       "candidacy": { ".read": true, ".write": true }
     }
   }
   ```

3. Put the database URL in `config.js` and deploy. The app also accepts the URL
   typed into its setup screen, but that is stored per-browser — faculty links
   only work if the URL is in `config.js`.
4. Open the deployed page, choose **Create the event**, pick an organiser
   passphrase, and paste the roster (it is pre-filled from
   `Final exam assignemtns.xlsx`; one exam per line, `Last, First, M1, M2, M3`).
5. **Faculty** tab → paste email addresses → **Copy every link** → mail merge.

### About the security model

Anyone holding a link can read and write the `candidacy` branch, the same
trade-off as a shared Google Sheet link. That is appropriate for scheduling and
not for anything confidential. The organiser passphrase only gates the admin
tab in the UI; it is not a server-side permission.

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

Export **CSV** for the department, **.ics** for calendars, or **Print**.

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
| `roster-seed.js` | the 52 exams, generated from the spreadsheet |

`bump.sh` bumps the `?v=` cache-buster on every asset — run it after any
CSS/JS change so a cached file can never outlive a deploy.

## How the scheduling works

`solver.js` is a pure function of (settings, roster, availability, pins). It
builds 30-minute availability cells and hourly candidate starts, then runs a
branch-and-bound search with minimum-remaining-values ordering and incremental
constraint propagation — 52 exams over ~290 candidate starts solves in a few
milliseconds. It maximises the number scheduled rather than failing outright, so
a partially-answered roster still produces a partial board.

It prefers to leave exams where they already are, so one new reply nudges the
board instead of reshuffling it. Every browser solves locally for instant
feedback, but the first published board wins and the others adopt it, so
everyone is looking at the same schedule.
