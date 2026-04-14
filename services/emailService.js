import nodemailer from 'nodemailer'

const SUPPORT_EMAIL = 'yehudahs@mystic-vibes.com'

function createTransporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  })
}

export async function sendSupportEmail({ name, email, type, message }) {
  const transporter = createTransporter()

  const subject = `[Mystic Vibes Support] ${type} from ${name}`
  const html = `
    <h2>${type}</h2>
    <p><strong>From:</strong> ${name} &lt;${email}&gt;</p>
    <hr/>
    <p>${message.replace(/\n/g, '<br/>')}</p>
  `

  await transporter.sendMail({
    from: `"Mystic Vibes" <${process.env.SMTP_USER}>`,
    to: SUPPORT_EMAIL,
    replyTo: email,
    subject,
    html,
  })
}
