import type { MailMessage } from '../../src/modules/mail/mail.service';

/** Stands in for MailService in tests: records messages instead of sending them. */
export class FakeMailService {
  readonly sent: MailMessage[] = [];

  send(message: MailMessage): Promise<void> {
    this.sent.push(message);
    return Promise.resolve();
  }

  clear(): void {
    this.sent.length = 0;
  }

  /** Emails are sent in the background, so wait until one arrives. */
  async waitForEmailTo(to: string, timeoutMs = 3000): Promise<MailMessage> {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const message = this.sent.find((m) => m.to === to);
      if (message) return message;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw new Error(`No email to ${to} within ${timeoutMs}ms`);
  }
}

/** Pulls the reset token out of the link in a password reset email. */
export function extractResetToken(message: MailMessage): string {
  const match = /[?&]token=([\w-]+)/.exec(message.text);
  if (!match) throw new Error('No reset token in email');
  return match[1];
}
