import { Resend } from 'resend'
import { config } from '../config/env.js'

const resend = new Resend(config.RESEND_API_KEY)
const FROM = 'Mystic Vibes <noreply@mystic-vibes.com>'

export async function sendVerificationEmail({ name, email, token }) {
  const url = `${config.FRONTEND_URL}/verify-email?token=${token}`
  await resend.emails.send({
    from: FROM,
    to: email,
    subject: 'Verify your Mystic Vibes email',
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:auto">
        <h2>Welcome to Mystic Vibes, ${name}!</h2>
        <p>Click the button below to verify your email address. The link expires in 24 hours.</p>
        <a href="${url}" style="display:inline-block;padding:12px 24px;background:#7c3aed;color:#fff;border-radius:8px;text-decoration:none;font-weight:600">
          Verify Email
        </a>
        <p style="margin-top:16px;color:#888;font-size:13px">
          Or copy this link: <a href="${url}">${url}</a>
        </p>
      </div>
    `,
  })
}

const escapeHtml = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;')

const formatVersion = (v) => v
  ? `v${v.version || '?'} · ${v.commit || '?'}`
  : 'unknown'

export async function sendSupportEmail({ name, email, type, message, clientVersion, serverVersion }) {
  await resend.emails.send({
    from: FROM,
    to: config.SUPPORT_EMAIL,
    replyTo: email,
    subject: `[Support] ${type} from ${name}`,
    html: `
      <h2>${escapeHtml(type)}</h2>
      <p><strong>From:</strong> ${escapeHtml(name)} &lt;${escapeHtml(email)}&gt;</p>
      <hr/>
      <p>${escapeHtml(message).replace(/\n/g, '<br/>')}</p>
      <hr/>
      <p style="color:#888;font-size:12px">
        <strong>Frontend:</strong> ${escapeHtml(formatVersion(clientVersion))}<br/>
        <strong>Backend:</strong> ${escapeHtml(formatVersion(serverVersion))}
      </p>
    `,
  })
}
