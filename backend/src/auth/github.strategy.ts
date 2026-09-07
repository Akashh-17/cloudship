import passport from "passport";
import { Strategy as GitHubStrategy, Profile } from "passport-github2";
import { GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { docClient } from "../aws/config";
import { env } from "../config/env";
import { logger } from "../logger/logger";
import { User } from "../types/user";

export const USERS_TABLE_NAME = env.USERS_TABLE_NAME;

async function upsertUser(profile: Profile): Promise<User> {
  const id = profile.id;

  const existing = await docClient
    .send(new GetCommand({ TableName: USERS_TABLE_NAME, Key: { id } }))
    .catch((err) => {
      logger.warn(`⚠️ [Auth] Could not read existing user ${id}: ${err.message}`);
      return null;
    });

  const user: User = {
    id,
    login: profile.username || profile.displayName || id,
    avatarUrl: profile.photos?.[0]?.value,
    email: profile.emails?.[0]?.value,
    createdAt: existing?.Item?.createdAt || new Date().toISOString(),
  };

  await docClient.send(new PutCommand({ TableName: USERS_TABLE_NAME, Item: user }));
  return user;
}

if (env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET) {
  passport.use(
    new GitHubStrategy(
      {
        clientID: env.GITHUB_CLIENT_ID,
        clientSecret: env.GITHUB_CLIENT_SECRET,
        callbackURL: env.GITHUB_CALLBACK_URL || `http://localhost:${env.PORT}/auth/github/callback`,
      },
      (_accessToken: string, _refreshToken: string, profile: Profile, done: (err: any, user?: User) => void) => {
        upsertUser(profile)
          .then((user) => done(null, user))
          .catch((err) => done(err));
      }
    )
  );
} else {
  logger.warn("⚠️ [Auth] GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET not set — GitHub OAuth disabled.");
}

passport.serializeUser((user: Express.User, done) => {
  done(null, (user as User).id);
});

passport.deserializeUser(async (id: string, done) => {
  try {
    const response = await docClient.send(new GetCommand({ TableName: USERS_TABLE_NAME, Key: { id } }));
    done(null, (response.Item as User) || null);
  } catch (err) {
    done(err);
  }
});

export { passport };
