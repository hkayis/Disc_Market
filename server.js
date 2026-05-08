import express from "express";
import session from "express-session";
import dotenv from "dotenv";
import pool from "./config/db.js";
import {body, validationResult} from "express-validator";
import "./config/mailer.js";   
import bcrypt from "bcrypt";
import { sendVerificationEmail } from "./config/mailer.js";
import multer from "multer";
import path from "path";
import fs from "fs/promises";
dotenv.config();
const app=express();

app.set("view engine","ejs");
app.use(express.urlencoded({extended: true}));
app.use(express.static("public"));
app.use(express.json());

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "public/uploads/");
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const name = path.basename(file.originalname, ext);
    cb(null, `${Date.now()}-${name}${ext}`);
  }
});

const upload = multer({ storage });

const allowedImageExtensions = [".jpg", ".jpeg", ".png", ".gif"];

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

console.log(">>> Email is being sent:", email, "kod:", code);
try {
  await sendVerificationEmail(email, code);
  console.log(">>> Email sent successfullt");
} catch (mailErr) {
  console.error(">>> Email not sent:");
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

    res.send("Email verified! Login: <a href='/login'>Click Here</a>");
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
      console.error("Email not sent:", mailErr);
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

app.get("/market/dashboard", async (req, res) => {
  if (!req.session.userId || req.session.role !== "market") {
    return res.redirect("/login");
  }

  try {
    const [marketRows] = await pool.query(
      `SELECT 
        users.id AS user_id,
        users.email,
        markets.name,
        markets.city,
        markets.district
      FROM users
      JOIN markets ON users.id = markets.user_id
      WHERE users.id = ?`,
      [req.session.userId]
    );

    if (marketRows.length === 0) {
      return res.status(404).send("Market profile not found");
    }

    const market = marketRows[0];

    const [productStats] = await pool.query(
      `SELECT 
        COUNT(*) AS totalProducts,
        SUM(CASE WHEN expiration_date < CURDATE() THEN 1 ELSE 0 END) AS expiredProducts
      FROM products
      WHERE market_id = ?`,
      [req.session.userId]
    );

    res.render("market-dashboard", {
      market,
      totalProducts: productStats[0].totalProducts || 0,
      expiredProducts: productStats[0].expiredProducts || 0
    });

  } catch (err) {
    console.error(err);
    res.status(500).send("Error: " + err.message);
  }
});

app.get("/market/products/add", (req, res) => {
  if (!req.session.userId || req.session.role !== "market") {
    return res.redirect("/login");
  }

  res.render("add-product", {
    errors: [],
    old: {}
  });
});

app.post(
  "/market/products/add",
  upload.single("image"),
  [
    body("title")
      .trim()
      .notEmpty().withMessage("Product title is required")
      .isLength({ min: 2, max: 200 }).withMessage("Title must be 2-200 characters"),

    body("stock")
      .notEmpty().withMessage("Stock is required")
      .isInt({ min: 1 }).withMessage("Stock must be a positive integer"),

    body("normal_price")
      .notEmpty().withMessage("Normal price is required")
      .isFloat({ min: 0.01 }).withMessage("Normal price must be greater than 0"),

    body("discounted_price")
      .notEmpty().withMessage("Discounted price is required")
      .isFloat({ min: 0.01 }).withMessage("Discounted price must be greater than 0")
      .custom((value, { req }) => {
        if (Number(value) >= Number(req.body.normal_price)) {
          throw new Error("Discounted price must be lower than normal price");
        }

        return true;
      }),

    body("expiration_date")
      .notEmpty().withMessage("Expiration date is required")
      .isISO8601().withMessage("Invalid expiration date"),
  ],
  async (req, res) => {
    if (!req.session.userId || req.session.role !== "market") {
      return res.redirect("/login");
    }

    const errors = validationResult(req).array();

    if (!req.file) {
      errors.push({ msg: "Product image is required" });
    }

    if (req.file) {
      const ext = path.extname(req.file.originalname).toLowerCase();

      if (!allowedImageExtensions.includes(ext)) {
        errors.push({ msg: "Only JPG, JPEG, PNG, and GIF files are allowed" });
      }
    }

    if (errors.length > 0) {
  if (req.file) {
    try {
      await fs.unlink(req.file.path);
    } catch (err) {
      console.error("Uploaded file could not be deleted:", err);
    }
  }

  return res.render("add-product", {
    errors,
    old: req.body
  });
}

    const {
      title,
      stock,
      normal_price,
      discounted_price,
      expiration_date
    } = req.body;

    try {
      await pool.query(
        `INSERT INTO products
        (market_id, title, stock, normal_price, discounted_price, expiration_date, image_path)
        VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          req.session.userId,
          title,
          stock,
          normal_price,
          discounted_price,
          expiration_date,
          req.file.filename
        ]
      );

      res.redirect("/market/products");
    } catch (err) {
      console.error(err);
      res.status(500).send("Error: " + err.message);
    }
  }
);

app.get("/market/products", async (req, res) => {
  if (!req.session.userId || req.session.role !== "market") {
    return res.redirect("/login");
  }

  try {
    const [products] = await pool.query(
      `SELECT *
       FROM products
       WHERE market_id = ?
       ORDER BY created_at DESC`,
      [req.session.userId]
    );

    res.render("market-products", {
      products
    });

  } catch (err) {
    console.error(err);
    res.status(500).send("Error: " + err.message);
  }
});

app.get("/market/products/:id/edit", async (req, res) => {
  if (!req.session.userId || req.session.role !== "market") {
    return res.redirect("/login");
  }

  const productId = req.params.id;

  try {
    const [rows] = await pool.query(
      `SELECT *
       FROM products
       WHERE id = ? AND market_id = ?`,
      [productId, req.session.userId]
    );

    if (rows.length === 0) {
      return res.status(404).send("Product not found or you are not allowed to edit it");
    }

    res.render("edit-product", {
      product: rows[0],
      errors: []
    });

  } catch (err) {
    console.error(err);
    res.status(500).send("Error: " + err.message);
  }
});

app.post(
  "/market/products/:id/edit",
  upload.single("image"),
  [
    body("title")
      .trim()
      .notEmpty().withMessage("Product title is required")
      .isLength({ min: 2, max: 200 }).withMessage("Title must be 2-200 characters"),

    body("stock")
      .notEmpty().withMessage("Stock is required")
      .isInt({ min: 1 }).withMessage("Stock must be a positive integer"),

    body("normal_price")
      .notEmpty().withMessage("Normal price is required")
      .isFloat({ min: 0.01 }).withMessage("Normal price must be greater than 0"),

    body("discounted_price")
      .notEmpty().withMessage("Discounted price is required")
      .isFloat({ min: 0.01 }).withMessage("Discounted price must be greater than 0")
      .custom((value, { req }) => {
        if (Number(value) >= Number(req.body.normal_price)) {
          throw new Error("Discounted price must be lower than normal price");
        }

        return true;
      }),

    body("expiration_date")
      .notEmpty().withMessage("Expiration date is required")
      .isISO8601().withMessage("Invalid expiration date"),
  ],
  async (req, res) => {
    if (!req.session.userId || req.session.role !== "market") {
      return res.redirect("/login");
    }

    const productId = req.params.id;

    try {
      const [rows] = await pool.query(
        `SELECT *
         FROM products
         WHERE id = ? AND market_id = ?`,
        [productId, req.session.userId]
      );

      if (rows.length === 0) {
        if (req.file) {
          await fs.unlink(req.file.path);
        }

        return res.status(404).send("Product not found or you are not allowed to edit it");
      }

      const existingProduct = rows[0];

      const errors = validationResult(req).array();

      if (req.file) {
        const ext = path.extname(req.file.originalname).toLowerCase();

        if (!allowedImageExtensions.includes(ext)) {
          errors.push({ msg: "Only JPG, JPEG, PNG, and GIF files are allowed" });
        }
      }

      if (errors.length > 0) {
        if (req.file) {
          try {
            await fs.unlink(req.file.path);
          } catch (err) {
            console.error("Uploaded file could not be deleted:", err);
          }
        }

        return res.render("edit-product", {
          errors,
          product: {
            ...existingProduct,
            ...req.body
          }
        });
      }

      const {
        title,
        stock,
        normal_price,
        discounted_price,
        expiration_date
      } = req.body;

      let imagePath = existingProduct.image_path;

      if (req.file) {
        imagePath = req.file.filename;

        if (existingProduct.image_path) {
          try {
            await fs.unlink(`public/uploads/${existingProduct.image_path}`);
          } catch (err) {
            console.error("Old image could not be deleted:", err);
          }
        }
      }

      await pool.query(
        `UPDATE products
         SET title = ?,
             stock = ?,
             normal_price = ?,
             discounted_price = ?,
             expiration_date = ?,
             image_path = ?
         WHERE id = ? AND market_id = ?`,
        [
          title,
          stock,
          normal_price,
          discounted_price,
          expiration_date,
          imagePath,
          productId,
          req.session.userId
        ]
      );

      res.redirect("/market/products");

    } catch (err) {
      console.error(err);

      if (req.file) {
        try {
          await fs.unlink(req.file.path);
        } catch (fileErr) {
          console.error("Uploaded file could not be deleted after error:", fileErr);
        }
      }

      res.status(500).send("Error: " + err.message);
    }
  }
);

app.post("/market/products/:id/delete", async (req, res) => {
  if (!req.session.userId || req.session.role !== "market") {
    return res.redirect("/login");
  }

  const productId = req.params.id;

  try {
    const [rows] = await pool.query(
      `SELECT image_path 
       FROM products 
       WHERE id = ? AND market_id = ?`,
      [productId, req.session.userId]
    );

    if (rows.length === 0) {
      return res.status(404).send("Product not found or you are not allowed to delete it");
    }

    const imagePath = rows[0].image_path;

    await pool.query(
      `DELETE FROM products 
       WHERE id = ? AND market_id = ?`,
      [productId, req.session.userId]
    );

    if (imagePath) {
      try {
        await fs.unlink(`public/uploads/${imagePath}`);
      } catch (err) {
        console.error("Product image could not be deleted:", err);
      }
    }

    res.redirect("/market/products");

  } catch (err) {
    console.error(err);
    res.status(500).send("Error: " + err.message);
  }
});

app.get("/market/profile", async (req, res) => {
  if (!req.session.userId || req.session.role !== "market") {
    return res.redirect("/login");
  }

  try {
    const [rows] = await pool.query(
      `SELECT 
        users.email,
        markets.name,
        markets.city,
        markets.district
      FROM users
      JOIN markets ON users.id = markets.user_id
      WHERE users.id = ?`,
      [req.session.userId]
    );

    if (rows.length === 0) {
      return res.status(404).send("Market profile not found");
    }

    res.render("market-profile", {
      market: rows[0],
      errors: [],
      message: null
    });

  } catch (err) {
    console.error(err);
    res.status(500).send("Error: " + err.message);
  }
});

app.post(
  "/market/profile",
  [
    body("name")
      .trim()
      .notEmpty().withMessage("Market name is required")
      .isLength({ min: 2, max: 150 }).withMessage("Market name must be 2-150 characters"),

    body("city")
      .trim()
      .notEmpty().withMessage("City is required")
      .isLength({ min: 2, max: 100 }).withMessage("City must be 2-100 characters"),

    body("district")
      .trim()
      .notEmpty().withMessage("District is required")
      .isLength({ min: 2, max: 100 }).withMessage("District must be 2-100 characters"),
  ],
  async (req, res) => {
    if (!req.session.userId || req.session.role !== "market") {
      return res.redirect("/login");
    }

    const errors = validationResult(req);

    if (!errors.isEmpty()) {
      return res.render("market-profile", {
        market: {
          email: req.session.email,
          name: req.body.name,
          city: req.body.city,
          district: req.body.district
        },
        errors: errors.array(),
        message: null
      });
    }

    const { name, city, district } = req.body;

    try {
      await pool.query(
        `UPDATE markets
         SET name = ?, city = ?, district = ?
         WHERE user_id = ?`,
        [name, city, district, req.session.userId]
      );

      const [rows] = await pool.query(
        `SELECT 
          users.email,
          markets.name,
          markets.city,
          markets.district
        FROM users
        JOIN markets ON users.id = markets.user_id
        WHERE users.id = ?`,
        [req.session.userId]
      );

      res.render("market-profile", {
        market: rows[0],
        errors: [],
        message: "Market information updated successfully"
      });

    } catch (err) {
      console.error(err);
      res.status(500).send("Error: " + err.message);
    }
  }
);

app.get("/consumer/home", async(req, res) => {
  if (!req.session.userId || req.session.role !== "consumer") {
    return res.redirect("/login");
  }

  try{
    const [rows] = await pool.query(
      "SELECT full_name, city, district FROM consumers WHERE user_id = ?",
      [req.session.userId]
    );
    if(rows.length === 0){
      req.session.destroy(()=> res.redirect("/login"));
      return; 
    }

    const searchKeyword = (req.query.q ?? "").trim();
    const consumerCity = rows[0].city;
    const consumerDistrict = rows[0].district;
    const consumerName = rows[0].full_name
    
    const page = parseInt(req.query.page) || 1;
    const limit = 4;
    const offset = (page-1) * limit;

    const escaped = searchKeyword.replace(/[%_\\]/g, "\\$&");
    const sqlSearch = `%${escaped}%`;

    const [resultCnt] = await pool.query(
      "SELECT COUNT(*) as totalCount from products p join markets m on p.market_id = m.user_id where m.city = ? and p.expiration_date >= CURDATE() and p.stock > 0 and p.title LIKE ?",
    [consumerCity, sqlSearch]);
    
    const totalProducts = resultCnt[0].totalCount;
    const totalPages = Math.max(1, Math.ceil(totalProducts / limit));
     const [products] = await pool.query(
      `SELECT 
        p.id,
        p.title,
        p.stock,
        p.normal_price,
        p.discounted_price,
        p.expiration_date,
        p.image_path,
        m.name AS market_name,
        m.district AS market_district,
        DATEDIFF(p.expiration_date, CURDATE()) AS days_left
      FROM products p
      JOIN markets m ON p.market_id = m.user_id
      WHERE m.city = ?
        AND p.expiration_date >= CURDATE()
        AND p.stock > 0
        AND p.title LIKE ?
      ORDER BY
        CASE WHEN m.district = ? THEN 0 ELSE 1 END,
        p.expiration_date ASC
      LIMIT ? OFFSET ?
      `,
      [consumerCity, sqlSearch, consumerDistrict, limit, offset]
    );
    const [cartCountRows] = await pool.query(
  "SELECT COALESCE(SUM(quantity), 0) AS totalCount FROM cart_items WHERE consumer_id = ?",
  [req.session.userId]
);
const cartCount = cartCountRows[0].totalCount;


res.render("consumer-home", {
  products: products,
  searchQuery: searchKeyword,
  currentPage: page,
  totalPages: totalPages,
  totalProducts: totalProducts,
  consumerName: consumerName,
  consumerCity: consumerCity,
  consumerDistrict: consumerDistrict,
  cartCount: cartCount   
});
  }catch(err){
     res.status(500).send("Sunucu hatası: " + err.message);
  }
});

app.post("/consumer/cart/add", async (req, res) => {

  if (!req.session.userId || req.session.role !== "consumer") {
    return res.status(401).json({ 
      success: false, 
      message: "You need to login" 
    });
  }

  const consumerId = req.session.userId;
  const productId = parseInt(req.body.productId);
  const quantity = parseInt(req.body.quantity) || 1;

  if (!productId || productId < 1) {
    return res.status(400).json({ 
      success: false, 
      message: "Wrong Product" 
    });
  }

  if (quantity < 1) {
    return res.status(400).json({ 
      success: false, 
      message: "Amount should be at least 1." 
    });
  }

  try {
    const [productRows] = await pool.query(
      `SELECT id, title, stock, expiration_date 
       FROM products 
       WHERE id = ? 
         AND expiration_date >= CURDATE()
         AND stock > 0`,
      [productId]
    );

    if (productRows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: "Product not found or expired" 
      });
    }

    const product = productRows[0];

   
    const [existingRows] = await pool.query(
      "SELECT quantity FROM cart_items WHERE consumer_id = ? AND product_id = ?",
      [consumerId, productId]
    );

    const currentQuantityInCart = existingRows.length > 0 ? existingRows[0].quantity : 0;
    const newTotalQuantity = currentQuantityInCart + quantity;

    if (newTotalQuantity > product.stock) {
      const remaining = product.stock - currentQuantityInCart;
      
      if (remaining <= 0) {
        return res.status(400).json({
          success: false,
          message: `Sepetinizde zaten maksimum miktarda var (${product.stock} adet)`
        });
      }
      
      return res.status(400).json({
        success: false,
        message: `Stokta sadece ${product.stock} adet var. Sepetinize en fazla ${remaining} adet daha ekleyebilirsiniz.`
      });
    }

   
    if (existingRows.length > 0) {
     
      await pool.query(
        "UPDATE cart_items SET quantity = ? WHERE consumer_id = ? AND product_id = ?",
        [newTotalQuantity, consumerId, productId]
      );
    } else {
    
      await pool.query(
        "INSERT INTO cart_items (consumer_id, product_id, quantity) VALUES (?, ?, ?)",
        [consumerId, productId, quantity]
      );
    }

   
    const [cartCountRows] = await pool.query(
      "SELECT COALESCE(SUM(quantity), 0) AS totalCount FROM cart_items WHERE consumer_id = ?",
      [consumerId]
    );

    return res.json({
      success: true,
      message: `"${product.title}" sepete eklendi`,
      cartCount: cartCountRows[0].totalCount,
      productQuantityInCart: newTotalQuantity
    });

  } catch (err) {
    console.error("Add to cart error:", err);
    return res.status(500).json({ 
      success: false, 
      message: "Sunucu hatası: " + err.message 
    });
  }
});


app.get("/consumer/cart", async (req, res) => {
  if (!req.session.userId || req.session.role !== "consumer") {
    return res.redirect("/login");
  }
  const consumerId = req.session.userId;
  try {
    const [cartItems] = await pool.query(
      `SELECT ci.id AS cart_item_id,
              p.title,
              p.discounted_price,
              ci.quantity,
              ROUND(p.discounted_price * ci.quantity, 2) AS total_price
       FROM cart_items ci
       JOIN products p ON ci.product_id = p.id
       WHERE ci.consumer_id = ?`,
      [consumerId]
    );
    const grandTotal = cartItems
      .reduce((sum, i) => sum + parseFloat(i.total_price), 0)
      .toFixed(2);
    res.render("consumer-cart", { cartItems, grandTotal });
  } catch (err) {
    res.status(500).send("Sunucu hatası: " + err.message);
  }
});
 

app.post("/consumer/cart/update", async (req, res) => {
  if (!req.session.userId || req.session.role !== "consumer") {
    return res.status(401).json({ success: false, message: "Giriş yapmalısınız" });
  }
  const consumerId = req.session.userId;
  const { cartItemId, action } = req.body;
 
  try {
    const [rows] = await pool.query(
      `SELECT ci.id, ci.quantity, p.stock
       FROM cart_items ci
       JOIN products p ON ci.product_id = p.id
       WHERE ci.id = ? AND ci.consumer_id = ?`,
      [cartItemId, consumerId]
    );
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: "Ürün bulunamadı" });
    }
 
    const item = rows[0];
 
    if (action === "increase") {
      if (item.quantity >= item.stock) {
        return res.status(400).json({ success: false, message: "Stokta yeterli ürün yok" });
      }
      await pool.query("UPDATE cart_items SET quantity = quantity + 1 WHERE id = ?", [cartItemId]);
    } else if (action === "decrease") {
      if (item.quantity <= 1) {
        await pool.query("DELETE FROM cart_items WHERE id = ?", [cartItemId]);
      } else {
        await pool.query("UPDATE cart_items SET quantity = quantity - 1 WHERE id = ?", [cartItemId]);
      }
    }
 
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});
 
app.post("/consumer/cart/remove", async (req, res) => {
  if (!req.session.userId || req.session.role !== "consumer") {
    return res.status(401).json({ success: false, message: "Giriş yapmalısınız" });
  }
  const consumerId = req.session.userId;
  const { cartItemId } = req.body;
 
  try {
    await pool.query(
      "DELETE FROM cart_items WHERE id = ? AND consumer_id = ?",
      [cartItemId, consumerId]
    );
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});
 
app.post("/consumer/cart/purchase", async (req, res) => {
  if (!req.session.userId || req.session.role !== "consumer") {
    return res.status(401).json({ success: false, message: "Giriş yapmalısınız" });
  }
  const consumerId = req.session.userId;
 
   try {
    const [cartItems] = await pool.query(
      `SELECT ci.product_id, ci.quantity, p.stock, p.title
       FROM cart_items ci
       JOIN products p ON ci.product_id = p.id
       WHERE ci.consumer_id = ?`,
      [consumerId]
    );

    if (cartItems.length === 0) {
      return res.status(400).json({ success: false, message: "Sepetiniz boş" });
    }

    for (const item of cartItems) {
      if (item.quantity > item.stock) {
        return res.status(400).json({
          success: false,
          message: `"${item.title}" için yeterli stok kalmamış (stokta: ${item.stock})`
        });
      }
    }

    for (const item of cartItems) {
      await pool.query(
        "UPDATE products SET stock = stock - ? WHERE id = ?",
        [item.quantity, item.product_id]
      );
    }

    await pool.query("DELETE FROM cart_items WHERE consumer_id = ?", [consumerId]);

    return res.json({ success: true, message: "Satın alma başarıyla tamamlandı! 🎉" });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});


app.get("/consumer/profile", async (req, res) => {
  if (!req.session.userId || req.session.role !== "consumer") {
    return res.redirect("/login");
  }

  try {
    const [rows] = await pool.query(
      `SELECT u.email, c.full_name, c.city, c.district
       FROM consumers c
       JOIN users u ON c.user_id = u.id
       WHERE c.user_id = ?`,
      [req.session.userId]
    );

    if (rows.length === 0) {
      return res.redirect("/login");
    }

    res.render("consumer-profile", {
      consumer: rows[0],
      errors: undefined,
      message: undefined
    });
  } catch (err) {
    console.error(err);
    res.status(500).send("Sunucu hatası: " + err.message);
  }
});

app.post(
  "/consumer/profile",
  [
    body("full_name")
      .trim()
      .notEmpty().withMessage("Full name is required")
      .isLength({ min: 2, max: 150 }).withMessage("Name must be 2-150 characters"),

    body("city")
      .trim()
      .notEmpty().withMessage("City is required"),

    body("district")
      .trim()
      .notEmpty().withMessage("District is required"),
  ],
  async (req, res) => {
    if (!req.session.userId || req.session.role !== "consumer") {
      return res.redirect("/login");
    }

    const { full_name, city, district } = req.body;
    const errors = validationResult(req);

    try {
      const [userRows] = await pool.query(
        "SELECT email FROM users WHERE id = ?",
        [req.session.userId]
      );

      if (userRows.length === 0) {
        return res.redirect("/login");
      }

      const email = userRows[0].email;

      if (!errors.isEmpty()) {
        return res.render("consumer-profile", {
          consumer: { email, full_name, city, district },
          errors: errors.array(),
          message: undefined
        });
      }

      await pool.query(
        "UPDATE consumers SET full_name = ?, city = ?, district = ? WHERE user_id = ?",
        [full_name, city, district, req.session.userId]
      );

      res.render("consumer-profile", {
        consumer: { email, full_name, city, district },
        errors: undefined,
        message: "Profile updated successfully"
      });

    } catch (err) {
      console.error(err);
      res.status(500).send("Sunucu hatası: " + err.message);
    }
  }
);



app.post("/logout", (req, res) => {
  req.session.destroy(() => {
    res.redirect("/login");
  });

});

app.listen(3000,()=>{
    console.log("Server is running on port 3000");
});
