# Setting up the database

The app keeps its shared state in a **Firebase Realtime Database**. Free, no
billing, about five minutes. You do this once.

> **Two things that will bite you if you skip them:** pick *Realtime Database*,
> not *Firestore* — they are different products and this app speaks only the
> first. And do **not** leave the database in "test mode": those rules expire
> after 30 days, which would silently break the app in the middle of your
> scheduling window. Step 4 replaces them with rules that do not expire.

## 1. Create a Firebase project

1. Go to <https://console.firebase.google.com> and sign in with any Google
   account (your UChicago account is fine).
2. **Create a project** → name it something like `candidacy-scheduler` →
   **Continue**.
3. On the Google Analytics step, switch **Enable Google Analytics** *off*. You
   do not need it. → **Create project** → wait → **Continue**.

## 2. Create the Realtime Database

1. In the left sidebar: **Build → Realtime Database**.
   Make sure it says *Realtime Database*, not *Firestore Database*.
2. **Create Database**.
3. Location: **United States (us-central1)** is the right default.
4. Security rules: choose **Start in locked mode**. (If it only offers test
   mode, that is fine — step 4 replaces the rules either way.) → **Enable**.

## 3. Copy the database URL

At the top of the **Data** tab there is a URL that looks like one of:

```
https://candidacy-scheduler-default-rtdb.firebaseio.com
https://candidacy-scheduler-default-rtdb.us-central1.firebasedatabase.app
```

Copy it exactly, with no trailing slash. That is your database URL.

## 4. Set the rules

Open the **Rules** tab, replace everything in the editor with this, and press
**Publish**:

```json
{
  "rules": {
    ".read": false,
    ".write": false,
    "candidacy": {
      ".read": true,
      ".write": true
    }
  }
}
```

The console will warn that your data is publicly readable. That is expected and
is the point — see *What this means* below.

## 5. Point the app at it

Open `config.js` and paste the URL in:

```js
window.APP_CONFIG = {
  databaseURL: "https://candidacy-scheduler-default-rtdb.firebaseio.com",
  eventId: "2026"
};
```

Commit and deploy. **This step is required** — the app will also accept a URL
typed into its setup screen, but that is remembered only in your own browser,
so faculty opening the shared link would see the setup screen instead.

## 6. Create the event

Open the deployed page, go to `#/admin`, choose **Create the event**, set an
organiser passphrase, and press **Create**. The roster is pre-filled. You are
done — send everyone the link.

## What this means

Anyone who has the link can read and write the `candidacy` branch of the
database, and can open any faculty member's grid and change it. Names are a
choice on a page, not a login. This is the same trade-off as a shared Google
Sheet link, and it is what makes the one-link, no-password flow possible.

That is appropriate for exam scheduling among colleagues. It is not appropriate
for anything confidential, so do not put student notes, grades, or personal
details into the constraint fields. The organiser passphrase only hides the
admin tab in the UI; it is not enforced by the server.

The `".read": false, ".write": false` at the top matters — it keeps everything
*outside* `candidacy` sealed, so this database cannot be used for anything else
if the URL leaks.

## Limits you will not hit

Firebase's free (Spark) plan gives 1 GB stored and 10 GB/month transferred.
This app stores well under a megabyte. The one real ceiling is **100
simultaneous connections**; with ~45 faculty that is comfortable, and the app
closes its live connection after a tab has been hidden for five minutes and
reopens it on return, so idle tabs do not consume the budget.

## If something goes wrong

| Symptom | Cause |
| --- | --- |
| Setup screen appears for faculty | `config.js` still has an empty `databaseURL`, or was not deployed |
| "Could not reach the database" | URL typo, trailing slash, or rules not published |
| Worked, then stopped after ~a month | The database was left in test mode — redo step 4 |
| Changes do not appear on other machines | Check the dot by the title reads **live**; if it says reconnecting, the rules likely deny read |
| Everything looks empty | You created a *Firestore* database rather than a *Realtime* one |

To start over: **Data** tab → hover the root node → the ✕ deletes everything.
Or, in the app, **Settings → Delete the whole event**.
