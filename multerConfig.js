const multer = require('multer');

// Konfigurasi multer untuk menyimpan di memory
const storage = multer.memoryStorage(); 

// Inisialisasi multer dengan konfigurasi penyimpanan
const upload = multer({ storage: storage });

module.exports = upload;
