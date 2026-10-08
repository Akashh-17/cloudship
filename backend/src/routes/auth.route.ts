import { Router } from "express";
import { passport } from "../auth/github.strategy";
import { env } from "../config/env";
import { success, failure } from "../utils/apiResponse";

const router = Router();

// CSRF protection for the OAuth redirect (a random per-request state value,
// stored in the session and verified on callback) is enabled via `state:
// true` on the GitHubStrategy constructor in github.strategy.ts — that's
// where passport-oauth2 actually reads it, not here.
router.get("/github", passport.authenticate("github", { scope: ["user:email"] }));

router.get(
  "/github/callback",
  passport.authenticate("github", { failureRedirect: `${env.FRONTEND_URL}/login?error=oauth_failed` }),
  (req, res) => {
    res.redirect(`${env.FRONTEND_URL}/app`);
  }
);

router.get("/me", (req, res) => {
  if (!req.isAuthenticated?.()) {
    return res.status(401).json(failure("Not authenticated"));
  }
  res.json(success(req.user));
});

router.post("/logout", (req, res, next) => {
  req.logout((err) => {
    if (err) return next(err);
    req.session.destroy(() => {
      res.clearCookie("connect.sid");
      res.json(success(null, "Logged out"));
    });
  });
});

export default router;
