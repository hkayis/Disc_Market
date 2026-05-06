import express from "express";
import session from "express-session";
import "dotenv/config";
import pool from "./config/db.js";
import {body, validationResult} from "express-validator";
import "./config/mailer.js";   
import bcrypt from "bcrypt";
import { sendVerificationEmail } from "./config/mailer.js";

const app=express();

app.set("view engine","ejs");
app.use(express.urlencoded({extended: true}));
app.use(express.static("public"));
app.use(express.json());

app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 24 }
}));

function generateCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

app.get("/", (req, res) => {
  res.redirect("/login");
});

app.get("/login", (req, res) => {
  res.render("login");
});

app.get("/signup", (req, res) => {
  res.render("signup");
});

app.get("/signup/consumer", (req, res) => {
  res.render("signup-consumer");
});

app.get("/signup/market", (req, res) => {
  res.render("signup-market");
});

app.post(
  "/signup/consumer",
  [
    body("email")
      .trim()
      .notEmpty().withMessage("Email is required")
      .isEmail().withMessage("Invalid email format")
      .normalizeEmail(),
    body("full_name")
      .trim()
      .notEmpty().withMessage("Full name is required")
      .isLength({ min: 2, max: 150 }).withMessage("Name must be 2-150 characters"),
    body("password")
      .notEmpty().withMessage("Password is required")
      .isLength({ min: 6 }).withMessage("Password must be at least 6 characters"),
    body("city").trim().notEmpty().withMessage("City is required"),
    body("district").trim().notEmpty().withMessage("District is required"),
  ],
  async (req, res) => {
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
      return res.render("signup-consumer", {
        errors: errors.array(),
        old: req.body
      });
    }

    const { email, full_name, password, city, district } = req.body;

    try {
      const [existing] = await pool.query(
        "SELECT id FROM users WHERE email = ?",
        [email]
      );

      if (existing.length > 0) {
        return res.render("signup-consumer", {
          errors: [{ msg: "This email is already registered" }],
          old: req.body
        });
      }

      
      const password_hash = await bcrypt.hash(password, 10);

      const [userResult] = await pool.query(
        "INSERT INTO users (email, password_hash, role) VALUES (?, ?, 'consumer')",
        [email, password_hash]
      );
      const userId = userResult.insertId;

      await pool.query(
        "INSERT INTO consumers (user_id, full_name, city, district) VALUES (?, ?, ?, ?)",
        [userId, full_name, city, district]
      );

const code = generateCode();

const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

await pool.query(
  "INSERT INTO email_verifications (user_id, code, expires_at) VALUES (?, ?, ?)",
  [userId, code, expiresAt]
);

console.log(">>> Email gönderiliyor:", email, "kod:", code);
try {
  await sendVerificationEmail(email, code);
  console.log(">>> Email başarıyla gönderildi");
} catch (mailErr) {
  console.error(">>> Email gönderilemedi:");
  console.error(mailErr);
}

req.session.pendingVerificationUserId = userId;

res.redirect("/verify-email");
    } catch (err) {
      console.error(err);
      res.status(500).send("Something went wrong: " + err.message);
    }
  }
);

app.post(
  "/signup/market",
  [
    body("email")
      .trim()
      .notEmpty().withMessage("Email is required")
      .isEmail().withMessage("Invalid email format")
      .normalizeEmail(),
    body("name")
      .trim()
      .notEmpty().withMessage("Market name is required")
      .isLength({ min: 2, max: 150 }).withMessage("Name must be 2-150 characters"),
    body("password")
      .notEmpty().withMessage("Password is required")
      .isLength({ min: 6 }).withMessage("Password must be at least 6 characters"),
    body("city").trim().notEmpty().withMessage("City is required"),
    body("district").trim().notEmpty().withMessage("District is required"),
  ],
  async (req, res) => {
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
      return res.render("signup-market", {
        errors: errors.array(),
        old: req.body
      });
    }

    const { email, name, password, city, district } = req.body;

    try {
      const [existing] = await pool.query(
        "SELECT id FROM users WHERE email = ?",
        [email]
      );

      if (existing.length > 0) {
        return res.render("signup-market", {
          errors: [{ msg: "This email is already registered" }],
          old: req.body
        });
      }

      const password_hash = await bcrypt.hash(password, 10);

      const [userResult] = await pool.query(
        "INSERT INTO users (email, password_hash, role) VALUES (?, ?, 'market')",
        [email, password_hash]
      );
      const userId = userResult.insertId;

      await pool.query(
        "INSERT INTO markets (user_id, name, city, district) VALUES (?, ?, ?, ?)",
        [userId, name, city, district]
      );

const code = generateCode();

const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

await pool.query(
  "INSERT INTO email_verifications (user_id, code, expires_at) VALUES (?, ?, ?)",
  [userId, code, expiresAt]
);

try {
  await sendVerificationEmail(email, code);
} catch (mailErr) {
  console.error("Email gönderilemedi:", mailErr);
}

req.session.pendingVerificationUserId = userId;

res.redirect("/verify-email");

    } catch (err) {
      console.error(err);
      res.status(500).send("Something went wrong: " + err.message);
    }
  }
);

app.get("/verify-email", (req, res) => {
  if (!req.session.pendingVerificationUserId) {
    return res.redirect("/signup");
  }
  res.render("verify-email");
});

app.post("/verify-email", async (req, res) => {
  const userId = req.session.pendingVerificationUserId;

  if (!userId) {
    return res.redirect("/signup");
  }

  const { code } = req.body;

  if (!code || code.length !== 6) {
    return res.render("verify-email", {
      errors: [{ msg: "Please enter the 6-digit code" }]
    });
  }

  try {
    const [rows] = await pool.query(
      `SELECT * FROM email_verifications 
       WHERE user_id = ? AND code = ? AND expires_at > NOW()
       ORDER BY created_at DESC LIMIT 1`,
      [userId, code]
    );

    if (rows.length === 0) {
      return res.render("verify-email", {
        errors: [{ msg: "Invalid or expired code" }]
      });
    }

    await pool.query(
      "UPDATE users SET is_verified = TRUE WHERE id = ?",
      [userId]
    );

    await pool.query(
      "DELETE FROM email_verifications WHERE user_id = ?",
      [userId]
    );

    delete req.session.pendingVerificationUserId;

    res.send("Email verified! Login: <a href='/login'>buraya tıkla</a>");
  } catch (err) {
    console.error(err);
    res.status(500).send("Error: " + err.message);
  }

});

app.post("/verify-email/resend", async (req, res) => {
  const userId = req.session.pendingVerificationUserId;

  if (!userId) {
    return res.redirect("/signup");
  }

  try {
    const [users] = await pool.query(
      "SELECT email FROM users WHERE id = ?",
      [userId]
    );

    if (users.length === 0) {
      return res.redirect("/signup");
    }

    const email = users[0].email;

    await pool.query(
      "DELETE FROM email_verifications WHERE user_id = ?",
      [userId]
    );

    const code = generateCode();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await pool.query(
      "INSERT INTO email_verifications (user_id, code, expires_at) VALUES (?, ?, ?)",
      [userId, code, expiresAt]
    );

    try {
      await sendVerificationEmail(email, code);
    } catch (mailErr) {
      console.error("Email gönderilemedi:", mailErr);
      return res.render("verify-email", {
        errors: [{ msg: "Email could not be sent. Try again." }]
      });
    }

    res.render("verify-email", {
      message: "New verification code sent. Check your email."
    });
  } catch (err) {
    console.error(err);
    res.status(500).send("Error: " + err.message);
  }
});

app.post(
  "/login",
  [
    body("email")
      .trim()
      .notEmpty().withMessage("Email is required")
      .isEmail().withMessage("Invalid email format")
      .normalizeEmail(),
    body("password")
      .notEmpty().withMessage("Password is required"),
  ],
  async (req, res) => {
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
      return res.render("login", {
        errors: errors.array(),
        old: req.body
      });
    }

    const { email, password } = req.body;

    try {
      const [rows] = await pool.query(
        "SELECT * FROM users WHERE email = ?",
        [email]
      );

      if (rows.length === 0) {
        return res.render("login", {
          errors: [{ msg: "Invalid email or password" }],
          old: req.body
        });
      }

      const user = rows[0];

      const passwordOk = await bcrypt.compare(password, user.password_hash);

      if (!passwordOk) {
        return res.render("login", {
          errors: [{ msg: "Invalid email or password" }],
          old: req.body
        });
      }

      if (!user.is_verified) {
  req.session.pendingVerificationUserId = user.id;
  
  const [activeCodes] = await pool.query(
    "SELECT id FROM email_verifications WHERE user_id = ? AND expires_at > NOW()",
    [user.id]
  );
  
  if (activeCodes.length === 0) {
    const code = generateCode();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    
    await pool.query(
      "INSERT INTO email_verifications (user_id, code, expires_at) VALUES (?, ?, ?)",
      [user.id, code, expiresAt]
    );
    
    try {
      await sendVerificationEmail(user.email, code);
    } catch (mailErr) {
      console.error("Email gönderilemedi:", mailErr);
    }
  }
  
  return res.redirect("/verify-email");
}

      
      req.session.userId = user.id;
      req.session.role = user.role;
      req.session.email = user.email;

      if (user.role === "market") {
        res.redirect("/market/dashboard");
      } else {
        res.redirect("/consumer/home");
      }
    } catch (err) {
      console.error(err);
      res.status(500).send("Error: " + err.message);
    }
  }
);

app.get("/market/dashboard", (req, res) => {
  if (!req.session.userId || req.session.role !== "market") {
    return res.redirect("/login");
  }
  res.send(`Welcome to Market Dashboard! Email: ${req.session.email}`);
});

app.get("/consumer/home", (req, res) => {
  if (!req.session.userId || req.session.role !== "consumer") {
    return res.redirect("/login");
  }
  res.send(`Welcome to Consumer Home! Email: ${req.session.email}`);
});

app.post("/logout", (req, res) => {
  req.session.destroy(() => {
    res.redirect("/login");
  });
});

app.listen(3000,()=>{
    console.log("Server is running on port 3000");
});
