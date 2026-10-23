// Attrappe für Tests, die project 3/lib/email.ts laden (src/__tests__/mails/sofortMails.test.ts).
// In CI sind die Pakete von project 3 nicht installiert, sendEmail lädt nodemailer aber per
// import(); ohne Alias scheitert schon das Auflösen. Kein Test versendet Mails.
export default {
  createTransport: () => ({ sendMail: async () => ({ messageId: 'test' }) }),
};
