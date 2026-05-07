import express from "express";
import session from "express-session";
import dotenv from "dotenv";
import pool from "./config/db.js";
import {body, validationResult} from "express-validator";
import "./config/mailer.js";   
import bcrypt from "bcrypt";
import { sendVerificationEmail } from "./config/mailer.js";
dotenv.config();
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
      "SELECT COUNT(*) as totalCount from products p join markets m on p.market_id = m.user_id where m.city = ? and p.expiration_date >= CURDATE()and p.stock > 0 and p.title LIKE ?",
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

// Sonra res.render'a ekle:
res.render("consumer-home", {
  products: products,
  searchQuery: searchKeyword,
  currentPage: page,
  totalPages: totalPages,
  totalProducts: totalProducts,
  consumerName: consumerName,
  consumerCity: consumerCity,
  consumerDistrict: consumerDistrict,
  cartCount: cartCount   // ← bunu ekle
});
  }catch(err){
     res.status(500).send("Sunucu hatası: " + err.message);
  }
});

app.post("/consumer/cart/add", async (req, res) => {
  // Auth kontrolü
  if (!req.session.userId || req.session.role !== "consumer") {
    return res.status(401).json({ 
      success: false, 
      message: "Giriş yapmalısınız" 
    });
  }

  const consumerId = req.session.userId;
  const productId = parseInt(req.body.productId);
  const quantity = parseInt(req.body.quantity) || 1;

  // Input validation
  if (!productId || productId < 1) {
    return res.status(400).json({ 
      success: false, 
      message: "Geçersiz ürün" 
    });
  }

  if (quantity < 1) {
    return res.status(400).json({ 
      success: false, 
      message: "Miktar en az 1 olmalı" 
    });
  }

  try {
    // 1. Ürünün var olduğunu, expired olmadığını ve stoğunu kontrol et
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
        message: "Ürün bulunamadı veya süresi dolmuş" 
      });
    }

    const product = productRows[0];

    // 2. Sepette bu üründen kaç tane var, kontrol et
    const [existingRows] = await pool.query(
      "SELECT quantity FROM cart_items WHERE consumer_id = ? AND product_id = ?",
      [consumerId, productId]
    );

    const currentQuantityInCart = existingRows.length > 0 ? existingRows[0].quantity : 0;
    const newTotalQuantity = currentQuantityInCart + quantity;

    // 3. Stok kontrolü — yeni toplam stoktan fazla olamaz
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

    // 4. Sepete ekle veya güncelle (UPSERT pattern)
    if (existingRows.length > 0) {
      // Zaten var, miktarı güncelle
      await pool.query(
        "UPDATE cart_items SET quantity = ? WHERE consumer_id = ? AND product_id = ?",
        [newTotalQuantity, consumerId, productId]
      );
    } else {
      // Yeni ekle
      await pool.query(
        "INSERT INTO cart_items (consumer_id, product_id, quantity) VALUES (?, ?, ?)",
        [consumerId, productId, quantity]
      );
    }

    // 5. Sepetteki toplam ürün sayısını döndür (badge için)
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

// ── Sepet sayfası ──────────────────────────────────────────────────────────
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
 
// ── Sepet: miktar güncelle (AJAX) ──────────────────────────────────────────
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
 
// ── Sepet: ürün sil (AJAX) ─────────────────────────────────────────────────
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
 
// ── Sepet: satın al (AJAX) ─────────────────────────────────────────────────
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

    // Stok kontrolü — sepete ekledikten sonra başkası almış olabilir
    for (const item of cartItems) {
      if (item.quantity > item.stock) {
        return res.status(400).json({
          success: false,
          message: `"${item.title}" için yeterli stok kalmamış (stokta: ${item.stock})`
        });
      }
    }

    // Her ürünün stoğunu sepetteki miktar kadar azalt
    for (const item of cartItems) {
      await pool.query(
        "UPDATE products SET stock = stock - ? WHERE id = ?",
        [item.quantity, item.product_id]
      );
    }

    // Sepeti temizle
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

// ── Consumer profil güncelleme (POST) ──────────────────────────────────────
app.post(
  "/consumer/profile",
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
    body("city").trim().notEmpty().withMessage("City is required"),
    body("district").trim().notEmpty().withMessage("District is required"),
  ],
  async (req, res) => {
    if (!req.session.userId || req.session.role !== "consumer") {
      return res.redirect("/login");
    }

    const { email, full_name, city, district } = req.body;
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
      return res.render("consumer-profile", {
        consumer: { email, full_name, city, district },
        errors: errors.array(),
        message: undefined
      });
    }

    try {
      // Email başkasında mı kontrol et
      const [existing] = await pool.query(
        "SELECT id FROM users WHERE email = ? AND id <> ?",
        [email, req.session.userId]
      );

      if (existing.length > 0) {
        return res.render("consumer-profile", {
          consumer: { email, full_name, city, district },
          errors: [{ msg: "This email is already used by another account" }],
          message: undefined
        });
      }

      await pool.query(
        "UPDATE users SET email = ? WHERE id = ?",
        [email, req.session.userId]
      );

      await pool.query(
        "UPDATE consumers SET full_name = ?, city = ?, district = ? WHERE user_id = ?",
        [full_name, city, district, req.session.userId]
      );

      req.session.email = email;

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
