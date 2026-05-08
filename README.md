# Disc Market

Disc Market is a web-based marketplace application developed for the CTIS/CS 256 course project.

The system allows:
- Consumers to browse discounted products and purchase them
- Markets to manage products, stock, and expiration dates
- Email verification for user accounts
- Shopping cart functionality

## Technologies Used

- Node.js
- Express.js
- MySQL
- EJS
- HTML/CSS/JavaScript
- express-session
- bcrypt
- multer
- nodemailer

## Installation

### 1. Install dependencies

npm install


### 2. Create MySQL database

Create a database named:

disc_market


### 3. Import database schema

Import the following SQL file into MySQL:

schema.sql


### 4. Configure environment variables

Create a `.env` file in the root directory and add:

```env
SESSION_SECRET=your_secret
MAIL_USER=your_email
MAIL_PASS=your_password
DB_HOST=127.0.0.1
DB_USER=root
DB_PASSWORD=
DB_NAME=disc_market
```

### 5. Start the application


node server.js

The application runs on:

http://localhost:3000

## Features

### Consumer Features
- Sign up / Login
- Email verification
- Product search
- Shopping cart
- Purchase system
- Profile update

### Market Features
- Add products
- Edit products
- Delete products
- Upload product images
- Dashboard statistics
- Profile management

## Notes

- MySQL must be running on port 3306.
- Uploaded images are stored in:

public/uploads/

- `node_modules` is not included in the submission package.

## Project Structure

```txt
Disc_Market/
│
├── config/
├── public/
├── views/
├── sql/
├── package.json
├── server.js
└── README.md
```
