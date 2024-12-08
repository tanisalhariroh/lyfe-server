const express = require("express");
const mysql = require("mysql2");
const bodyParser = require("body-parser");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const request = require("supertest");

const app = express();
const upload = multer();

// Kunci rahasia JWT
const secretKey = "your_jwt_secret_key";
app.use(cors());
app.use(bodyParser.json());

// Koneksi ke database
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

// Middleware untuk verifikasi token JWT
const verifyToken = (req, res, next) => {
  const token = req.headers["authorization"];
  if (!token) {
    return res.status(401).send("Access Denied / Unauthorized request");
  }

  try {
    const verified = jwt.verify(token, secretKey);
    req.user = verified;
    next();
  } catch (err) {
    res.status(401).send("Invalid Token");
  }
};

// **Endpoint Register User**
app.post("/register", async (req, res) => {
  const { name, email, password, role } = req.body;
  if (!name || !email || !password) {
    return res.status(400).send("Name, email, and password are required");
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const sql =
      "INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)";
    db.query(sql, [name, email, hashedPassword, role || "admin"], (err) => {
      if (err) {
        console.error("Error inserting user:", err);
        return res.status(500).send("Internal server error");
      }
      res.send("User registered");
    });
  } catch (err) {
    console.error("Error hashing password:", err);
    res.status(500).send("Internal server error");
  }
});

// **Endpoint Login User**
app.post("/login", (req, res) => {
  const { email, password } = req.body;

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
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
    });
  });
});

// **Endpoint Add Article**
app.post("/add-article", upload.single("image"), verifyToken, (req, res) => {
  const { title, content, status } = req.body;

  if (!title || !content) {
    return res.status(400).send("Title and content are required.");
  }

  const tanggalBuat = new Date();
  const image = req.file ? req.file.buffer : null;

  const sql =
    "INSERT INTO article_table (judul, konten, tanggal_buat, status, image) VALUES (?, ?, ?, IFNULL(?, 'draft'), ?)";

  db.query(
    sql,
    [title, content, tanggalBuat, status, image],
    (err) => {
      if (err) {
        console.error("Error inserting article:", err);
        return res.status(500).send("Internal server error");
      }
      res.status(200).send("Article added successfully");
    }
  );
});

// **Endpoint Get All Articles**
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

// **Endpoint Edit Article**
app.put("/edit-article/:id", upload.single('image'), (req, res) => {
  const articleId = req.params.id;
  const { title, content, status } = req.body; // Mengambil data dari request body

  // Validasi jika title dan content tidak ada
  if (!title || !content) {
    return res.status(400).send("Title and content are required.");
  }

  const image = req.file ? req.file.buffer : null; // Menangani file image jika ada

  // Query untuk memperbarui artikel di database
  const sql = "UPDATE article_table SET judul = ?, konten = ?, status = ?, image = ? WHERE id = ?";
  db.query(sql, [title, content, status, image, articleId], (err, result) => {
    if (err) {
      console.error("Error updating article:", err);
      return res.status(500).send("Internal server error");
    }

    // Mengecek apakah artikel ditemukan dan diperbarui
    if (result.affectedRows === 0) {
      return res.status(404).send("Article not found");
    }

    res.json({ message: "Article updated successfully" });
  });
});


// **Endpoint Delete Article**
app.delete("/delete-article/:id", verifyToken, (req, res) => {
  const articleId = req.params.id;

  // Query untuk menghapus artikel berdasarkan ID
  const sql = "DELETE FROM article_table WHERE id = ?";

  db.query(sql, [articleId], (err, result) => {
    if (err) {
      console.error("Error deleting article:", err);
      return res.status(500).send("Internal server error");
    }

    // Cek apakah artikel ditemukan dan dihapus
    if (result.affectedRows === 0) {
      return res.status(404).send("Article not found");
    }

    res.send({ message: "Article deleted successfully" });
  });
});


// **Testing**
describe("Auth and Article API", () => {
  let token; // Token untuk otentikasi

  beforeAll(async () => {
    // Hapus data user dan artikel sebelumnya
    await new Promise((resolve) => {
      const sql = "DELETE FROM users WHERE email = ?";
      db.query(sql, ["test@example.com"], resolve);
    });

    // Register dan login untuk mendapatkan token
    await request(app).post("/register").send({
      name: "Test User",
      email: "test@example.com",
      password: "password123",
      role: "admin",
    });

    const loginResponse = await request(app).post("/login").send({
      email: "test@example.com",
      password: "password123",
    });
    token = loginResponse.body.token;
  });

  // afterAll((done) => {
  //   // Bersihkan artikel dan user test
  //   const deleteArticles = "DELETE FROM article_table WHERE judul = ?";
  //   const deleteUser = "DELETE FROM users WHERE email = ?";
  //   db.query(deleteArticles, ["Sample Title"], () => {
  //     db.query(deleteUser, ["test@example.com"], () => {
  //       db.end();
  //       done();
  //     });
  //   });
  // });

  afterAll((done) => {
    // Hanya bersihkan pengguna yang digunakan dalam pengujian
    const deleteUser = "DELETE FROM users WHERE email = ?";
    db.query(deleteUser, ["test@example.com"], () => {
      db.end();
      done();
    });
  });
  

  test("POST /register - should register a new user", async () => {
    const response = await request(app)
      .post("/register")
      .send({
        name: "Another User",
        email: "another@example.com",
        password: "password123",
        role: "admin",
      });

    expect(response.statusCode).toBe(200);
    expect(response.text).toBe("User registered");
  });

  test("POST /login - should login successfully with correct credentials", async () => {
    const response = await request(app)
      .post("/login")
      .send({
        email: "test@example.com",
        password: "password123",
      });

    expect(response.statusCode).toBe(200);
    expect(response.body).toHaveProperty("token");
    expect(response.body.user).toHaveProperty("email", "test@example.com");
  });

  test("POST /add-article - should successfully add an article", async () => {
    const imagePath = path.join(__dirname, "sample.jpg"); // Path ke file gambar nyata
    fs.writeFileSync(imagePath, "sample image content"); // Simpan file sementara untuk pengujian

    const response = await request(app)
      .post("/add-article")
      .set("Authorization", token)
      .field("title", "Sample Title")
      .field("content", "Sample Content")
      .field("status", "published")
      .attach("image", imagePath);

    fs.unlinkSync(imagePath); // Hapus file sementara setelah pengujian

    expect(response.statusCode).toBe(200);
    expect(response.text).toBe("Article added successfully");
  });

  test("GET /articles - should return all articles", async () => {
    const responseGetArticles = await request(app)
        .get("/articles")
        .set("Authorization", token);

    expect(responseGetArticles.statusCode).toBe(200);
    expect(Array.isArray(responseGetArticles.body)).toBe(true);

    console.log('responseGetArticles', responseGetArticles.body);

    if (responseGetArticles.body.length > 0) {
        const firstArticle = responseGetArticles.body[0];
        expect(firstArticle).toHaveProperty("id");
        expect(firstArticle).toHaveProperty("title");
        expect(firstArticle).toHaveProperty("content");
        expect(firstArticle).toHaveProperty("status");
        expect(firstArticle).toHaveProperty("tanggal_buat");
    } else {
        console.log("No articles found in the database.");
    }
  });

  test("GET /articles - should return 404 if no articles are found", async () => {
    const responseGetArticles = await request(app)
        .get("/articles")
        .set("Authorization", token);

    expect(responseGetArticles.statusCode).toBe(404);
    expect(responseGetArticles.text).toBe("No articles found");
  });

  test("PUT /edit-article/:id - should update an article", async () => {
    // Step 1: Fetch all articles from the database
    const getArticlesResponse = await request(app)
      .get("/articles")
      .set("Authorization", token);
  
    // Ensure we get at least one article to test with
    expect(getArticlesResponse.statusCode).toBe(200);
    expect(Array.isArray(getArticlesResponse.body)).toBe(true);
    expect(getArticlesResponse.body.length).toBeGreaterThan(0);
  
    // Select the first article for editing
    const articleToEdit = getArticlesResponse.body[0];
    const articleId = articleToEdit.id;
  
    // Step 2: Send the request to update the article
    const updatedTitle = "Updated Title";
    const updatedContent = "Updated Content";
    const updatedStatus = "published";  // or any other status like 'draft'
    
    const responseEdit = await request(app)
      .put(`/edit-article/${articleId}`)
      .set("Authorization", token)
      .field("title", updatedTitle)
      .field("content", updatedContent)
      .field("status", updatedStatus);
  
    expect(responseEdit.statusCode).toBe(200);
    expect(responseEdit.body.message).toBe("Article updated successfully");
  
    // Step 3: Verify the article has been updated by fetching it again
    const verifyEditResponse = await request(app)
      .get("/articles")
      .set("Authorization", token);
  
    // Ensure the article's title and content were updated
    const editedArticle = verifyEditResponse.body.find(
      (article) => article.id === articleId
    );
  
    expect(editedArticle).toBeDefined();
    expect(editedArticle.title).toBe(updatedTitle);
    expect(editedArticle.content).toBe(updatedContent);
    expect(editedArticle.status).toBe(updatedStatus);
  });  

  test("DELETE /delete-article/:id - should delete an article", async () => {
    // Step 1: Fetch all articles from the database
    const getArticlesResponse = await request(app)
      .get("/articles")
      .set("Authorization", token);
  
    // Ensure we get at least one article to test with
    expect(getArticlesResponse.statusCode).toBe(200);
    expect(Array.isArray(getArticlesResponse.body)).toBe(true);
    expect(getArticlesResponse.body.length).toBeGreaterThan(0);

    console.log('getArticlesResponse delete', getArticlesResponse.body);
  
    // Select the first article for deletion
    const articleToDelete = getArticlesResponse.body[1];
    const articleId = articleToDelete.id;
  
    // Step 2: Delete the selected article
    const responseDelete = await request(app)
      .delete(`/delete-article/${articleId}`)
      .set("Authorization", token);
  
    expect(responseDelete.statusCode).toBe(200);
    expect(responseDelete.body.message).toBe("Article deleted successfully");
  
    // Step 3: Verify the article is deleted by fetching articles again
    const verifyDeleteResponse = await request(app)
      .get("/articles")
      .set("Authorization", token);
  
    // Ensure the article is no longer present in the database
    const deletedArticle = verifyDeleteResponse.body.find(
      (article) => article.id === articleId
    );
  
    expect(deletedArticle).toBeUndefined(); // Article should not be found
  });
  
});

// Jalankan server jika file ini dijalankan secara langsung
if (require.main === module) {
  app.listen(3000, () => {
    console.log("Server is running on http://localhost:3000");
  });
}

module.exports = app;
