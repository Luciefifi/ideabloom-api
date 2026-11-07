import { escapeHtml, passwordResetEmail } from './password-reset.email';

describe('passwordResetEmail', () => {
  const input = {
    to: 'lucie@example.com',
    displayName: 'Lucie',
    resetUrl: 'http://localhost:3000/reset-password?token=abc123',
    expiresInMinutes: 30,
  };

  it('includes the reset link and expiry in both text and HTML versions', () => {
    const email = passwordResetEmail(input);

    expect(email.to).toBe('lucie@example.com');
    expect(email.subject).toBe('Reset your IdeaBloom password');
    expect(email.text).toContain(input.resetUrl);
    expect(email.html).toContain(`href="${input.resetUrl}"`);
    expect(email.text).toContain('30 minutes');
  });

  it("escapes the user's name so it can't inject HTML", () => {
    const email = passwordResetEmail({
      ...input,
      displayName: '<script>alert(1)</script>',
    });

    expect(email.html).not.toContain('<script>');
    expect(email.html).toContain('&lt;script&gt;');
  });

  it('escapes all HTML special characters', () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;',
    );
  });
});
