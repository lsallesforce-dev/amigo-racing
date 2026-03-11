import nodemailer from "nodemailer";
import { ENV } from "./env.js";

const transporter = nodemailer.createTransport({
  host: "smtp.zoho.com",
  port: 465,
  secure: true,
  auth: {
    user: ENV.smtpUser,
    pass: ENV.smtpPassword,
  },
});

export async function sendEmail(to: string, subject: string, html: string) {
  if (!ENV.smtpPassword) {
    console.warn(`[Email] SMTP_PASSWORD não configurada. E-mail não enviado para: ${to}`);
    return false;
  }

  try {
    const info = await transporter.sendMail({
      from: `"Amigo Racing" <${ENV.smtpUser}>`,
      to,
      subject,
      html,
    });
    console.log(`[Email] Enviado para ${to} (ID: ${info.messageId})`);
    return true;
  } catch (error) {
    console.error(`[Email] Erro ao enviar para ${to}:`, error);
    return false;
  }
}
