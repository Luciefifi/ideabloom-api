import type { MailMessage } from '../mail.service';

/** Makes user-provided text safe to put inside HTML (prevents HTML injection). */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export interface PasswordResetEmailInput {
  to: string;
  displayName: string;
  resetUrl: string;
  expiresInMinutes: number;
}

export function passwordResetEmail(
  input: PasswordResetEmailInput,
): MailMessage {
  const name = escapeHtml(input.displayName);
  const url = escapeHtml(input.resetUrl);

  const text = [
    `Hi ${input.displayName},`,
    '',
    'Someone (hopefully you) asked to reset your IdeaBloom password.',
    `Open this link to choose a new one. It works once and expires in ${input.expiresInMinutes} minutes:`,
    '',
    input.resetUrl,
    '',
    "If you didn't ask for this, you can ignore this email. Your password won't change.",
    '',
    'IdeaBloom',
  ].join('\n');

  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:24px;background:#f7f4fc;font-family:Inter,Segoe UI,Arial,sans-serif;color:#242033;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr><td align="center">
        <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:16px;padding:32px;">
          <tr><td>
            <p style="margin:0 0 24px;font-size:20px;font-weight:600;">Idea<span style="color:#6f55ae;">Bloom</span></p>
            <p style="margin:0 0 16px;">Hi ${name},</p>
            <p style="margin:0 0 24px;">Someone (hopefully you) asked to reset your IdeaBloom password. Click below to choose a new one.</p>
            <p style="margin:0 0 24px;">
              <a href="${url}" style="display:inline-block;background:#6f55ae;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:600;">Reset my password</a>
            </p>
            <p style="margin:0 0 8px;font-size:13px;color:#6b6880;">This link works once and expires in ${input.expiresInMinutes} minutes.</p>
            <p style="margin:0;font-size:13px;color:#6b6880;">If you didn't ask for this, you can ignore this email. Your password won't change.</p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;

  return {
    to: input.to,
    subject: 'Reset your IdeaBloom password',
    text,
    html,
  };
}
