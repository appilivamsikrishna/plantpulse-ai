import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { SESv2Client } from '@aws-sdk/client-sesv2';

/** Shared AWS clients for the v2 layer (auth + chat history + logging).
 *  Credentials come from the dedicated, least-privilege PP_AWS_* env vars
 *  (IAM user `plantpulse-app`). Exasol is untouched and stays read-only. */
const region = process.env.PP_AWS_REGION ?? 'ap-south-1';
const credentials =
  process.env.PP_AWS_ACCESS_KEY_ID && process.env.PP_AWS_SECRET_ACCESS_KEY
    ? {
        accessKeyId: process.env.PP_AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.PP_AWS_SECRET_ACCESS_KEY,
      }
    : undefined;

export const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region, credentials }), {
  marshallOptions: { removeUndefinedValues: true },
});

export const ses = new SESv2Client({ region, credentials });

export const TBL = {
  otp: 'plantpulse_otp',
  conversations: 'plantpulse_conversations',
  messages: 'plantpulse_messages',
} as const;

/** Whether the v2 store is configured (lets the app degrade gracefully if not). */
export const STORE_READY = Boolean(credentials);
