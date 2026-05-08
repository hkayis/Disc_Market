CREATE TABLE users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('market', 'consumer') NOT NULL,
  is_verified BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE markets (
  user_id INT PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  city VARCHAR(100) NOT NULL,
  district VARCHAR(100) NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE consumers (
  user_id INT PRIMARY KEY,
  full_name VARCHAR(150) NOT NULL,
  city VARCHAR(100) NOT NULL,
  district VARCHAR(100) NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Email verification kodları
CREATE TABLE email_verifications (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  code CHAR(6) NOT NULL,
  expires_at DATETIME NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE products (
  id INT AUTO_INCREMENT PRIMARY KEY,
  market_id INT NOT NULL,
  title VARCHAR(200) NOT NULL,
  stock INT NOT NULL DEFAULT 0,
  normal_price DECIMAL(10, 2) NOT NULL,
  discounted_price DECIMAL(10, 2) NOT NULL,
  expiration_date DATE NOT NULL,
  image_path VARCHAR(500),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (market_id) REFERENCES markets(user_id) ON DELETE CASCADE,
  INDEX idx_title (title),
  INDEX idx_expiration (expiration_date)
);

CREATE TABLE cart_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  consumer_id INT NOT NULL,
  product_id INT NOT NULL,
  quantity INT NOT NULL DEFAULT 1,
  added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (consumer_id) REFERENCES consumers(user_id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  UNIQUE KEY unique_consumer_product (consumer_id, product_id)
);

-- ============================================================
-- DEMO SEED DATA — Sustainable Discount Marketplace
-- Tüm kullanıcıların şifresi: 123456
-- ============================================================

DELETE FROM cart_items;
DELETE FROM products;
DELETE FROM email_verifications;
DELETE FROM markets;
DELETE FROM consumers;
DELETE FROM users;
ALTER TABLE users      AUTO_INCREMENT = 1;
ALTER TABLE products   AUTO_INCREMENT = 1;
ALTER TABLE cart_items AUTO_INCREMENT = 1;

INSERT INTO users (id, email, password_hash, role, is_verified) VALUES
(1, 'tok-market@gmail.com',      '$2b$10$3CAWquKnqiBbidHexG/eZuA5Ngz273GsdFa6JNjd.NE3rBIjmSJjq', 'market',   TRUE),
(2, 'migros-cankaya@gmail.com',  '$2b$10$3CAWquKnqiBbidHexG/eZuA5Ngz273GsdFa6JNjd.NE3rBIjmSJjq', 'market',   TRUE),
(3, 'carrefoursa-yeni@gmail.com','$2b$10$3CAWquKnqiBbidHexG/eZuA5Ngz273GsdFa6JNjd.NE3rBIjmSJjq', 'market',   TRUE),
(4, 'ahmet@gmail.com',           '$2b$10$3CAWquKnqiBbidHexG/eZuA5Ngz273GsdFa6JNjd.NE3rBIjmSJjq', 'consumer', TRUE),
(5, 'ayse@gmail.com',            '$2b$10$3CAWquKnqiBbidHexG/eZuA5Ngz273GsdFa6JNjd.NE3rBIjmSJjq', 'consumer', TRUE);


-- MARKETS
INSERT INTO markets (user_id, name, city, district) VALUES
(1, 'Tok Market',              'Ankara', 'Bilkent'),
(2, 'Migros Çankaya',          'Ankara', 'Çankaya'),
(3, 'CarrefourSA Yenimahalle', 'Ankara', 'Yenimahalle');

-- CONSUMERS
INSERT INTO consumers (user_id, full_name, city, district) VALUES
(4, 'Ahmet Yılmaz', 'Ankara', 'Bilkent'),
(5, 'Ayşe Kaya',    'Ankara', 'Çankaya');

-- PRODUCTS 
-- ───── TOK MARKET (Bilkent) — 10 ürün ─────
INSERT INTO products
  (market_id, title, stock, normal_price, discounted_price, expiration_date, image_path)
VALUES
(1, 'Coca-Cola 1.5L',                         30, 45.00,  29.90, DATE_ADD(CURDATE(), INTERVAL 7 DAY),   '1.jpg'),
(1, 'Natura Köy Kahverengi Yumurta 20li',     15, 110.00, 79.90, DATE_ADD(CURDATE(), INTERVAL 5 DAY),   '2.jpg'),
(1, 'Süper Maylo Tuvalet Kağıdı 40lı',        12, 320.00, 219.00,DATE_ADD(CURDATE(), INTERVAL 90 DAY),  '3.jpg'),
(1, 'Selpak Extra Kağıt Havlu 8li',           20, 180.00, 119.90,DATE_ADD(CURDATE(), INTERVAL 60 DAY),  '4.jpg'),
(1, 'Sırma Maden Suyu 6x200ml',               40, 60.00,  39.90, DATE_ADD(CURDATE(), INTERVAL 30 DAY),  '5.jpg'),
(1, 'Erikli Doğal Kaynak Suyu 6x1L',          25, 90.00,  59.90, DATE_ADD(CURDATE(), INTERVAL 45 DAY),  '6.jpg'),
(1, 'Natura Köy Gezen Tavuk Yumurtası 15li',  18, 95.00,  69.90, DATE_ADD(CURDATE(), INTERVAL 3 DAY),   '7.jpg'),
(1, 'Bolca Tavuk Bonfile 1kg',                10, 220.00, 159.90,DATE_ADD(CURDATE(), INTERVAL 2 DAY),   '8.jpg'),
(1, 'Sütaş Tava Yoğurdu 1000g',               22, 95.00,  64.90, DATE_ADD(CURDATE(), INTERVAL 4 DAY),   '9.jpg'),
(1, 'Coca-Cola Zero Sugar 1.5L',              28, 45.00,  29.90, DATE_ADD(CURDATE(), INTERVAL 8 DAY),  '10.jpg');

-- ───── MIGROS ÇANKAYA — 10 ürün ─────
INSERT INTO products
  (market_id, title, stock, normal_price, discounted_price, expiration_date, image_path)
VALUES
(2, 'Uno Büyük Tost Ekmeği 550g',             14, 55.00,  34.90, DATE_ADD(CURDATE(), INTERVAL 1 DAY),   '11.jpg'),
(2, 'Bolca Izgaralık Tavuk',                   8, 180.00, 124.90,DATE_ADD(CURDATE(), INTERVAL 2 DAY),  '12.jpg'),
(2, 'SuperFresh Parmak Patates 1kg',          24, 130.00, 89.90, DATE_ADD(CURDATE(), INTERVAL 120 DAY),'13.jpg'),
(2, 'Danone Laktozsuz Süt 1L',                30, 60.00,  39.90, DATE_ADD(CURDATE(), INTERVAL 6 DAY),  '14.jpg'),
(2, 'Bolca Tavuk Yürek',                       6, 95.00,  64.90, DATE_ADD(CURDATE(), INTERVAL  -2 DAY),'15.jpg'), -- EXPIRED (test)
(2, 'Eti Cango Bar',                          50, 25.00,  17.50, DATE_ADD(CURDATE(), INTERVAL 40 DAY), '16.jpg'),
(2, 'Eti Karam Gurme Bitter Çikolata',        45, 35.00,  24.90, DATE_ADD(CURDATE(), INTERVAL 50 DAY), '17.jpg'),
(2, 'Cif Infinite Clean Sprey 280ml',         16, 140.00, 99.90, DATE_ADD(CURDATE(), INTERVAL 200 DAY),'18.jpg'),
(2, 'Sleepy Sensitive Islak Bebek Havlusu',   20, 70.00,  47.90, DATE_ADD(CURDATE(), INTERVAL 180 DAY),'19.jpg'),
(2, 'Tahsildaroğlu Dil Peyniri 200g',         12, 130.00, 89.90, DATE_ADD(CURDATE(), INTERVAL 14 DAY), '20.jpg');

-- ───── CARREFOURSA YENIMAHALLE — 10 ürün ─────
INSERT INTO products
  (market_id, title, stock, normal_price, discounted_price, expiration_date, image_path)
VALUES
(3, 'Ariel Toz Çamaşır Deterjanı 7kg',         9, 850.00, 599.90,DATE_ADD(CURDATE(), INTERVAL 365 DAY),'21.jpg'),
(3, 'Danone Bitkisel Yağlı Krem Sos 200ml',   18, 70.00,  47.90, DATE_ADD(CURDATE(), INTERVAL 30 DAY), '22.jpg'),
(3, 'Sleepy Ocean Islak Mendil',              30, 45.00,  29.90, DATE_ADD(CURDATE(), INTERVAL 150 DAY),'23.jpg'),
(3, 'Söke Un 5kg',                            20, 180.00, 129.90,DATE_ADD(CURDATE(), INTERVAL 100 DAY),'24.jpg'),
(3, 'Activia Probiyotikli Bowl Yulaf',        16, 30.00,  19.90, DATE_ADD(CURDATE(), INTERVAL 0 DAY),  '25.jpg'), -- bugün son gün
(3, 'Eti Lifalif Yulaf Ezmesi 500g',          22, 75.00,  52.90, DATE_ADD(CURDATE(), INTERVAL 60 DAY), '26.jpg'),
(3, 'Altınkılıç Gurme Eski Kaşar Peyniri 250g',11,220.00, 169.90,DATE_ADD(CURDATE(), INTERVAL 25 DAY), '27.jpg'),
(3, 'Eker Süzme Yoğurt',                      14, 85.00,  59.90, DATE_ADD(CURDATE(), INTERVAL -5 DAY), '29.jpg'), -- EXPIRED (test)
(3, 'Tahsildaroğlu Klasik İnek Beyaz Peynir', 10, 240.00, 174.90,DATE_ADD(CURDATE(), INTERVAL 20 DAY), '30.jpg'),
(3, 'Ülker Bol Sütlü Çikolata 60g',           60, 22.00,  14.90, DATE_ADD(CURDATE(), INTERVAL 75 DAY), '31.jpg');