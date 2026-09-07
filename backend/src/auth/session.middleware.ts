import session from "express-session";
import connectDynamoDB from "connect-dynamodb";
import { dynamoClient } from "../aws/config";
import { env } from "../config/env";

const DynamoDBStore = connectDynamoDB(session);

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export const sessionMiddleware = session({
  store: new DynamoDBStore({
    table: env.SESSION_TABLE_NAME,
    client: dynamoClient,
  }),
  secret: env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SEVEN_DAYS_MS,
  },
});
