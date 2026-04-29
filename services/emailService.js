import { Resend } from 'resend'

const getResend = () => {
  if (!process.env.RESEND_API_KEY) throw new Error('RESEND_API_KEY is not set')
  return new Resend(process.env.RESEND_API_KEY)
}
const FROM = 'Mystic Vibes <noreply@mystic-vibes.com>'
const SUPPORT_EMAIL = 'support@mystic-vibes.com'

export async function sendVerificationEmail({ name, email, token }) {
  const url = `${process.env.FRONTEND_URL}/verify-email?token=${token}`
  await getResend().emails.send({
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

export async function sendSupportEmail({ name, email, type, message }) {
  await getResend().emails.send({
    from: FROM,
    to: SUPPORT_EMAIL,
    replyTo: email,
    subject: `[Support] ${type} from ${name}`,
    html: `
      <h2>${type}</h2>
      <p><strong>From:</strong> ${name} &lt;${email}&gt;</p>
      <hr/>
      <p>${message.replace(/\n/g, '<br/>')}</p>
    `,
  })
}
