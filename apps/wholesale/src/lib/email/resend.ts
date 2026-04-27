import { Resend } from "resend";

const apiKey = process.env.RESEND_API_KEY;

export const resend = apiKey ? new Resend(apiKey) : null;

export const notificationFrom =
  process.env.NOTIFICATION_FROM || "orders@cambridgetcg.com";
