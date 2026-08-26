/* Firebase Realtime Database that backs this app. */
window.APP_CONFIG = {
  databaseURL: "https://candidacy-scheduler-default-rtdb.firebaseio.com",

  /* Which event this deployment serves. Everything lives under
     candidacy/<eventId>, so two ids are two completely separate boards that
     share one database.

       "test"  — a throwaway board for clicking around. No organiser passphrase.
       "2026"  — the real one.

     Flip this to "2026" when you are ready to email people, and redeploy.
     A ?event=<id> on the URL overrides this for a single visit. */
  eventId: "test"
};
