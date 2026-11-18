/* Feature switches. */

/** Email sign-in (Chalmers / Partner login, "Save" in the wizard, the avatar
 *  menu's Sign in). Off until outgoing email works — SMTP_* in .env, see
 *  backend/accounts.py — because without it nobody receives a sign-in link.
 *  The backend endpoints stay in place; this only hides the entry points. */
export const LOGIN_ENABLED = false;
