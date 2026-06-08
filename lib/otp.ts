import { PutCommand, GetCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { SendEmailCommand } from '@aws-sdk/client-sesv2';
import { ddb, ses, TBL } from './aws';

const FROM = process.env.PP_SES_FROM ?? 'PlantPulse AI <noreply@mycv.now>';
const TTL_SECONDS = 600; // 10 minutes

export function genCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export async function storeOtp(email: string, code: string): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await ddb.send(
    new PutCommand({
      TableName: TBL.otp,
      Item: { email: email.toLowerCase(), code, createdAt: now, expiresAt: now + TTL_SECONDS },
    }),
  );
}

export async function checkOtp(email: string, code: string): Promise<boolean> {
  const r = await ddb.send(new GetCommand({ TableName: TBL.otp, Key: { email: email.toLowerCase() } }));
  const item = r.Item;
  if (!item) return false;
  const now = Math.floor(Date.now() / 1000);
  if (Number(item.expiresAt) < now) return false;
  if (String(item.code) !== String(code).trim()) return false;
  await ddb.send(new DeleteCommand({ TableName: TBL.otp, Key: { email: email.toLowerCase() } }));
  return true;
}

export async function sendOtpEmail(email: string, code: string): Promise<void> {
  const subject = `${code} is your PlantPulse AI sign-in code`;
  const text = `Your PlantPulse AI sign-in code is ${code}.

Enter this code at https://plant.appili.dev to sign in. It expires in 10 minutes.

If you didn't request this, you can ignore this email.

PlantPulse AI, powered by Exasol · Built by Appili Vamsi Krishna · https://plant.appili.dev`;

  const html = `<!doctype html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif;color:#16201a;background:#eef1ee;padding:2rem 1rem;margin:0;">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:14px;padding:2rem;box-shadow:0 2px 10px rgba(0,0,0,0.05);">
    <div style="font-weight:700;font-size:1.05rem;letter-spacing:.02em;color:#16201a;"><span style="color:#2f9e1e;display:inline-block;margin-right:7px;">&#9670;</span>PlantPulse AI</div>
    <div style="margin:1.5rem 0;text-align:center;padding:1.25rem;background:#f0f7f0;border-radius:10px;border:1px solid #d0e7d0;">
      <p style="margin:0 0 0.5rem;color:#556;font-size:0.9rem;">Your sign-in code</p>
      <p style="margin:0;font-size:2.2rem;font-weight:700;letter-spacing:0.3em;color:#2f9e1e;font-family:monospace;">${code}</p>
      <p style="margin:0.5rem 0 0;color:#889;font-size:0.8rem;">Expires in 10 minutes</p>
    </div>
    <p style="line-height:1.55;color:#445;font-size:0.92rem;margin:1.25rem 0 0;">Enter this code at <a href="https://plant.appili.dev" style="color:#2f9e1e;font-weight:600;text-decoration:none;">plant.appili.dev</a> to sign in.</p>
    <hr style="border:none;border-top:1px solid #eee;margin:1.5rem 0;">
    <p style="font-size:0.78rem;color:#9aa3ad;line-height:1.55;margin:0 0 12px;">If you didn't request this, you can safely ignore this email.</p>
    <p style="font-size:0.8rem;color:#6b7280;line-height:1.6;margin:0;"><strong style="color:#16201a;letter-spacing:.01em;">PlantPulse&nbsp;AI</strong> <span style="color:#9aa3ad;">&middot; powered by Exasol &middot; Built by Appili Vamsi&nbsp;Krishna &middot; </span><a href="https://plant.appili.dev" style="color:#2f9e1e;text-decoration:none;">plant.appili.dev</a></p>
  </div>
</body></html>`;

  await ses.send(
    new SendEmailCommand({
      FromEmailAddress: FROM,
      Destination: { ToAddresses: [email] },
      Content: {
        Simple: {
          Subject: { Data: subject, Charset: 'UTF-8' },
          Body: {
            Text: { Data: text, Charset: 'UTF-8' },
            Html: { Data: html, Charset: 'UTF-8' },
          },
        },
      },
    }),
  );
}
