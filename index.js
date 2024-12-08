const express = require("express");
const mysql = require("mysql2");
const bodyParser = require("body-parser");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const app = express();
const port = 3001;
const secretKey = "your_jwt_secret_key"; // Ubah ini menjadi kunci rahasia yang aman
app.use(cors());
app.use(bodyParser.json());
const upload = require('./multerConfig');

// Create connection to the database
const db = mysql.createConnection({
  host: "localhost",
  user: "root",
  password: "",
  database: "db_hexafour",
});

db.connect((err) => {
  if (err) {
    console.error("Error connecting to the database:", err);
    return;
  }
  console.log("MySQL Connected...");
});

// Middleware untuk memverifikasi token JWT
const verifyToken = (req, res, next) => {
  const token = req.headers["authorization"];
  if (!token)
    return res.status(401).send("Access Denied / Unauthorized request");

  try {
    const verified = jwt.verify(token, secretKey);
    req.user = verified;
    next();
  } catch (err) {
    res.status(400).send("Invalid Token");
  }
};

// Register user
app.post("/register", async (req, res) => {
  const { name, email, password, role} = req.body;
  if (!name || !email || !password) {
    return res.status(400).send("Name, email, and password are required");
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);

    const sql = "INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)";
    db.query(sql, [name, email, hashedPassword, role || 'user'], (err, result) => {
      if (err) {
        console.error("Error inserting user:", err); // Tambahkan log di sini untuk melihat kesalahan
        return res.status(500).send("Internal server error");
      }
      res.send("User registered");
    });
  } catch (err) {
    console.error("Error hashing password:", err); // Tambahkan log di sini untuk melihat kesalahan
    res.status(500).send("Internal server error");
  }
});


// Login user
app.post("/login", (req, res) => {
  const { email, password } = req.body;

  // Cek apakah body yang dikirim sudah benar
  if (!email || !password) {
    return res.status(400).json({ message: "Email and password are required" });
  }

  const sql = "SELECT * FROM users WHERE email = ?";
  db.query(sql, [email], async (err, results) => {
    if (err) {
      return res.status(500).json({ message: "Internal server error" });
    }
    if (results.length === 0) {
      return res.status(400).json({ message: "Email or password salah" });
    }

    const user = results[0];
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(400).json({ message: "Email atau password salah" });
    }

    const token = jwt.sign({ id: user.id, email: user.email }, secretKey, {
      expiresIn: "1h",
    });
    res.status(200).json({
      message: "Login successful",
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role},
    });
  });
});


// Example of a protected route
app.get("/protected", verifyToken, (req, res) => {
  res.send("This is a protected route");
});

app.listen(port, () => {
  console.log(`Server started on port ${port}`);
});

// Add a new article
app.post("/add-article", upload.single('image'), (req, res) => {
  const { title, content, status } = req.body;

  if (!title || !content) {
      return res.status(400).send("Title and content are required.");
  }

  const tanggalBuat = new Date(); // Mendapatkan tanggal dan waktu saat ini
  const image = req.file ? req.file.buffer : null; // Mengambil buffer gambar dari multer

  const sql = "INSERT INTO article_table (judul, konten, tanggal_buat, status, image) VALUES (?, ?, ?, ?, ?)";
  
  db.query(sql, [title, content, tanggalBuat, status, image], (err, result) => {
      if (err) {
          console.error("Error inserting article:", err);
          return res.status(500).send("Internal server error");
      }
      res.send("Article added successfully");
  });
});

// Show all article
app.get("/articles", (req, res) => {
  const sql = "SELECT * FROM article_table"; // Mengambil semua artikel tanpa filter status

  db.query(sql, (err, result) => {
      if (err) {
          console.error("Error retrieving articles:", err);
          return res.status(500).send("Internal server error");
      }
      if (result.length === 0) {
          return res.status(404).send("No articles found");
      }

      const articles = result.map(article => ({
          id: article.id,
          title: article.judul,
          content: article.konten,
          status: article.status,
          tanggal_buat: article.tanggal_buat,
          image: article.image ? article.image.toString('base64') : null, // Mengubah BLOB menjadi base64 jika ada gambar
      }));

      res.json(articles);
  });
});


// Show article publised
app.get("/articles/published", (req, res) => {
  const sql = "SELECT * FROM article_table WHERE status = 'published'";

  db.query(sql, (err, result) => {
      if (err) {
          console.error("Error retrieving articles:", err);
          return res.status(500).send("Internal server error");
      }
      if (result.length === 0) {
          return res.status(404).send("No published articles found");
      }

      const articles = result.map(article => ({
          id: article.id,
          title: article.judul,
          content: article.konten,
          status: article.status,
          tanggal_buat: article.tanggal_buat,
          image: article.image ? article.image.toString('base64') : null, // Mengubah BLOB menjadi base64 jika ada gambar
      }));

      res.json(articles);
  });
});


// Memperbarui artikel berdasarkan ID
app.put("/edit-article/:id", upload.single('image'), (req, res) => {
  const articleId = req.params.id;
  const { title, content, status } = req.body; // Mengambil data dari request body
  // let image = null;
  if (!title || !content) {
    return res.status(400).send("Title and content are required.");
}
  const image = req.file ? req.file.buffer : null;
  // if (req.file) {
  //     image = req.file.buffer.toString('base64'); // Mengubah gambar menjadi base64 jika ada
  // }

  const sql = "UPDATE article_table SET judul = ?, konten = ?, status = ?, image = ? WHERE id = ?";
  db.query(sql, [title, content, status, image, articleId], (err, result) => {
      if (err) {
          console.error("Error updating article:", err);
          return res.status(500).send("Internal server error");
      }

      if (result.affectedRows === 0) {
          return res.status(404).send("Article not found");
      }

      res.json({ message: "Article updated successfully" });
  });
});

// Endpoint untuk menghapus artikel berdasarkan ID
app.delete("/delete-article/:id", (req, res) => {
  const articleId = req.params.id;
  const sql = "DELETE FROM article_table WHERE id = ?";

  db.query(sql, [articleId], (err, result) => {
      if (err) {
          console.error("Error deleting article:", err);
          return res.status(500).send("Internal server error");
      }
      if (result.affectedRows === 0) {
          return res.status(404).send("Article not found");
      }

      res.send({ message: "Article deleted successfully" });
  });
});


// Forgot Password Endpoint
// app.post('/forgot-password', async (req, res) => {
//   const { email } = req.body;

//   if (!email) {
//     return res.status(400).json({ message: 'Email is required' });
//   }

//   const sql = 'SELECT * FROM users WHERE email = ?';
//   db.query(sql, [email], async (err, results) => {
//     if (err) {
//       return res.status(500).json({ message: 'Internal server error' });
//     }
//     if (results.length === 0) {
//       return res.status(400).json({ message: 'Email not found' });
//     }

//     const user = results[0];
//     const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET_KEY, { expiresIn: '1h' });

//     // Send email
//     const url = `http://localhost:3000/reset-password/${token}`;
//     await transporter.sendMail({
//       to: email,
//       subject: 'Password Reset',
//       html: `<p>You requested a password reset. Click the link below to reset your password:</p><a href="${url}">Reset Password</a>`,
//     });

//     res.status(200).json({ message: 'Password reset link sent to your email' });
//   });
// });

// // Reset Password Endpoint
// app.post('/reset-password/:token', async (req, res) => {
//   const { token } = req.params;
//   const { password } = req.body;

//   if (!password) {
//     return res.status(400).json({ message: 'New password is required' });
//   }

//   try {
//     const decoded = jwt.verify(token, process.env.JWT_SECRET_KEY);
//     const hashedPassword = await bcrypt.hash(password, 10);

//     const sql = 'UPDATE users SET password = ? WHERE id = ?';
//     db.query(sql, [hashedPassword, decoded.id], (err) => {
//       if (err) {
//         return res.status(500).json({ message: 'Internal server error' });
//       }
//       res.status(200).json({ message: 'Password has been reset successfully' });
//     });
//   } catch (error) {
//     res.status(400).json({ message: 'Invalid or expired token' });
//   }
// });
app.post('/reset-password', async (req, res) => {
  const { email, newPassword } = req.body;

  // Validate the request body
  if (!email || !newPassword) {
      return res.status(400).json({ message: "Email and new password are required." });
  }

  try {
      // Hash the new password
      const hashedPassword = await bcrypt.hash(newPassword, 10);

      // Update the password in the database
      const sql = "UPDATE users SET password = ? WHERE email = ?";
      db.query(sql, [hashedPassword, email], (err, results) => {
          if (err) {
              return res.status(500).json({ message: "Internal server error." });
          }

          if (results.affectedRows === 0) {
              return res.status(404).json({ message: "User not found." });
          }

          res.status(200).json({ message: "Password reset successful." });
      });
  } catch (error) {
      console.error("Error resetting password:", error);
      res.status(500).json({ message: "Error resetting password." });
  }
});