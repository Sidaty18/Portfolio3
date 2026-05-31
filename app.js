const express = require("express");
const nodemailer = require("nodemailer");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

// ── MIDDLEWARE ──
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

// ── RATE LIMITING simple ──
const ipRequests = new Map();
function rateLimit(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress;
  const now = Date.now();
  const windowMs = 15 * 60 * 1000; // 15 min
  const max = 5;
  if (!ipRequests.has(ip)) ipRequests.set(ip, []);
  const reqs = ipRequests.get(ip).filter((t) => now - t < windowMs);
  if (reqs.length >= max) {
    return res
      .status(429)
      .json({ error: "Trop de requêtes. Réessayez dans 15 minutes." });
  }
  reqs.push(now);
  ipRequests.set(ip, reqs);
  next();
}

// ── NODEMAILER CONFIG ──
// Définissez ces variables d'environnement avant de lancer le serveur :
//   EMAIL_USER → votre adresse Gmail
//   EMAIL_PASS → mot de passe d'application Gmail (pas votre vrai mdp)
//   EMAIL_TO   → adresse de réception (peut être identique à EMAIL_USER)
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER || "sidatydiedhiou2865@gmail.com",
    pass: process.env.EMAIL_PASS || "hpjkfvlgeoqykawe",
  },
});

// Vérification au démarrage
transporter.verify((err) => {
  if (err) {
    console.warn("⚠️  Nodemailer config invalide :", err.message);
    console.warn(
      "   → Définissez EMAIL_USER et EMAIL_PASS dans les variables d'environnement."
    );
  } else {
    console.log("✅ Nodemailer prêt — emails configurés.");
  }
});

// Escape HTML helper
function escHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

// ── API CONTACT ──
app.post("/api/contact", rateLimit, async (req, res) => {
  const { name, email, subject, message } = req.body;

  // Validation basique
  if (!name || !email || !message) {
    return res
      .status(400)
      .json({ error: "Champs requis : nom, email, message." });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: "Adresse email invalide." });
  }
  if (message.length > 2000) {
    return res
      .status(400)
      .json({ error: "Message trop long (max 2000 caractères)." });
  }

  const mailSubject = subject
    ? `[Portfolio] ${subject}`
    : `[Portfolio] Nouveau message de ${name}`;

  const htmlBody = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family:'Segoe UI',sans-serif;background:#020408;color:#e0f4ff;margin:0;padding:0">
  <div style="max-width:600px;margin:0 auto;padding:40px 20px">
    <div style="border:1px solid rgba(0,200,255,.3);border-radius:4px;overflow:hidden">
      <div style="background:linear-gradient(135deg,#0099cc,#7c3aed);padding:30px;text-align:center">
        <h1 style="margin:0;font-size:1.4rem;font-family:monospace;color:#fff;letter-spacing:.1em">
          NOUVEAU MESSAGE — PORTFOLIO
        </h1>
      </div>
      <div style="padding:30px;background:#050c14;border-top:1px solid rgba(0,200,255,.15)">
        <table style="width:100%;border-collapse:collapse">
          <tr>
            <td style="padding:10px 0;color:rgba(0,200,255,.7);font-size:.8rem;font-family:monospace;text-transform:uppercase;letter-spacing:.1em;width:80px">Nom</td>
            <td style="padding:10px 0;color:#e0f4ff;font-size:1rem">${escHtml(name)}</td>
          </tr>
          <tr>
            <td style="padding:10px 0;color:rgba(0,200,255,.7);font-size:.8rem;font-family:monospace;text-transform:uppercase;letter-spacing:.1em">Email</td>
            <td style="padding:10px 0;color:#e0f4ff;font-size:1rem"><a href="mailto:${escHtml(email)}" style="color:#00c8ff">${escHtml(email)}</a></td>
          </tr>
          ${
            subject
              ? `<tr>
            <td style="padding:10px 0;color:rgba(0,200,255,.7);font-size:.8rem;font-family:monospace;text-transform:uppercase;letter-spacing:.1em">Sujet</td>
            <td style="padding:10px 0;color:#e0f4ff;font-size:1rem">${escHtml(subject)}</td>
          </tr>`
              : ""
          }
        </table>
        <div style="margin-top:20px;padding:20px;background:rgba(0,200,255,.04);border:1px solid rgba(0,200,255,.12);border-radius:4px">
          <div style="color:rgba(0,200,255,.7);font-size:.75rem;font-family:monospace;text-transform:uppercase;letter-spacing:.1em;margin-bottom:12px">Message</div>
          <div style="color:#e0f4ff;line-height:1.7;white-space:pre-wrap">${escHtml(message)}</div>
        </div>
        <div style="margin-top:20px;text-align:right;font-size:.75rem;color:rgba(255,255,255,.3);font-family:monospace">
          Reçu le ${new Date().toLocaleString("fr-FR", { timeZone: "Africa/Dakar" })} (Dakar)
        </div>
      </div>
    </div>
  </div>
</body>
</html>`;

  const mailOptions = {
    from: `"Portfolio Contact" <${process.env.EMAIL_USER || "VOTRE_EMAIL@gmail.com"}>`,
    replyTo: email,
    to: process.env.EMAIL_TO || process.env.EMAIL_USER || "VOTRE_EMAIL@gmail.com",
    subject: mailSubject,
    html: htmlBody,
    text: `Nom: ${name}\nEmail: ${email}\nSujet: ${subject || "N/A"}\n\nMessage:\n${message}`,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`✉️  Email envoyé — ID: ${info.messageId} — De: ${name} <${email}>`);
    res.json({ success: true, message: "Email envoyé avec succès." });
  } catch (err) {
    console.error("❌ Erreur envoi email:", err.message);
    res.status(500).json({
      error: "Impossible d'envoyer l'email. Vérifiez la configuration.",
    });
  }
});

// ── PAGE PRINCIPALE ──
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "views", "index.html"));
});

// ── START ──
app.listen(PORT, () => {
  console.log(`\n🚀 Serveur démarré : http://localhost:${PORT}`);
  console.log(`   → Portfolio accessible sur cette URL`);
  console.log(`   → API contact : POST /api/contact\n`);
});
