import nodemailer from "nodemailer";
import "dotenv/config";

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

transporter.verify((err) => {
  if (err) console.error("✗ Mailer connection failed:", err.message);
  else console.log("✓ Mailer ready");
});

export async function sendVerificationEmail(toEmail, code) {
  await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to: toEmail,
    subject: "Email Verification Code",
    text: `Your verification code is: ${code}\n\nThis code will expire in 10 minutes.`,
    html: `
      <h2>Email Verification</h2>
      <p>Your verification code is:</p>
      <h1 style="letter-spacing: 5px; color: #2c5f2d;">${code}</h1>
      <p>This code will expire in 10 minutes.</p>
    `
  });
}


export default transporter;