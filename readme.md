# PWEB Express P33 2025 – Books API

### MEMBER
1. Muhammad Ardiansyah Tri Wibowo - 5027241091
2. Erlinda Annisa Zahra Kusuma - 5027241108
3. Muhammad Fachry Shalahuddin Rusamsi - 5027241031

## Description Singkat

API untuk manajemen buku dengan relasi Genre, transaksi pemesanan (orders + order_items), Prisma ORM, Express, dan autentikasi. Dokumen ini merangkum database, relasi, format respons, endpoint, query, dan cara menjalankan.

## Tech Stack
- Node.js + Express
- Prisma ORM
- Database: kompatibel (PostgreSQL/MySQL/SQLite) – gunakan DATABASE_URL
- Zod (validasi Genre)
- JSON Web Token (JWT) – placeholder verification (middleware auth dapat disesuaikan)

## Response Format (acuan global)
Semua endpoint mengembalikan format berikut:
```json
{
  "success": true,
  "message": "string",
  "data": {} 
}
```
Jika error:
```json
{
  "success": false,
  "message": "error message",
  "data": null
}
```

## Autentikasi
- Semua endpoint /books wajib autentikasi (Authorization: Bearer <token>), jika tidak, kembalikan 401.
- Endpoint transaksi juga diasumsikan menggunakan user dari middleware auth (req.user.id).

## Database Design

Tabel utama:
- genres
  - id (uuid, pk)
  - name (text, unique, not null)
  - created_at, updated_at, deleted_at (nullable untuk soft delete jika diterapkan)
- books
  - id (uuid, pk)
  - title (text, not null, unique)
  - writer (text, not null)
  - publisher (text, not null)
  - publication_year (int, not null)
  - description (text, nullable)
  - price (number/float, not null)
  - stock_quantity (int, not null)
  - genre_id (uuid, fk -> genres.id, not null)
  - created_at (datetime, not null, default now)
  - updated_at (datetime, not null, updatedAt)
  - deleted_at (datetime, nullable) – soft delete
- orders
  - id (uuid, pk)
  - user_id (uuid, fk -> users.id, not null)
  - created_at, updated_at (datetime, not null)
- order_items
  - id (uuid, pk)
  - quantity (int, not null)
  - order_id (uuid, fk -> orders.id, not null)
  - book_id (uuid, fk -> books.id, not null)
  - created_at, updated_at (datetime, not null)

Relasi Prisma (ringkas):
- Genre hasMany Book
- Book belongsTo Genre
- Order belongsTo User; Order hasMany OrderItem
- OrderItem belongsTo Order; OrderItem belongsTo Book

Catatan:
- Books menggunakan soft delete (deleted_at) agar tidak menghapus data transaksi historis.
- Order menghitung revenue berbasis harga buku saat ini (tidak menyimpan snapshot harga di order_items).

## Environment
Buat .env:
```
DATABASE_URL="postgresql://user:pass@localhost:5432/dbname?schema=public"
PORT=3000
JWT_SECRET=your-secret
```

## Prisma
- Migrasi & generate:
```
npx prisma migrate dev --name init
npx prisma generate
```
- Optional: `npx prisma studio` untuk melihat data.

## Endpoints

Semua endpoint Books memerlukan header:
```
Authorization: Bearer <token>
Content-Type: application/json
```

### Genres
- POST /genres
  - Body: { "name": "Fiction" }
  - 201 Created
- GET /genres
  - 200 OK
- GET /genres/:id
  - 200 OK / 404
- PATCH /genres/:id
  - Body: { "name": "New Name" }
  - 200 OK
- DELETE /genres/:id
  - Soft delete (jika service demikian)
  - 200 OK

Response contoh:
```json
{ "success": true, "message": "Genre created", "data": { "id": "..." } }
```

### Books
- POST /books
  - Validasi: judul unik (hanya pada buku yang belum di-soft-delete), genre harus ada.
  - Body:
    ```json
    {
      "title": "Clean Code",
      "writer": "Robert C. Martin",
      "publisher": "Prentice Hall",
      "publication_year": 2008,
      "description": "A Handbook of Agile Software Craftsmanship",
      "price": 250000,
      "stock_quantity": 10,
      "genre_id": "uuid-genre"
    }
    ```
  - 201 Created

- GET /books
  - Query:
    - page, limit (default 1, 10)
    - title, writer, publisher (search contains, case-insensitive)
    - genre_id
    - min_price, max_price
    - min_year, max_year
    - sort_by (default created_at), order (asc|desc, default desc)
  - Hanya menampilkan deleted_at = null
  - 200 OK
  - Response data:
    ```json
    {
      "books": [ { "id": "...", "title": "...", "genre": {...} } ],
      "pagination": { "page": 1, "limit": 10, "total": 23, "total_pages": 3 }
    }
    ```

- GET /books/:book_id
  - 200 OK / 404

- GET /books/genre/:genre_id
  - Query: page, limit
  - 200 OK

- PATCH /books/:book_id
  - Dapat update informasi & stock_quantity
  - Validasi: title tetap unik, genre_id harus valid jika diubah
  - 200 OK

- DELETE /books/:book_id
  - Soft delete (set deleted_at)
  - Tidak menghapus data transaksi
  - 200 OK

Contoh respons (sukses):
```json
{
  "success": true,
  "message": "Books retrieved successfully",
  "data": {
    "books": [],
    "pagination": { "page": 1, "limit": 10, "total": 0, "total_pages": 0 }
  }
}
```

Contoh respons (error auth):
```json
{ "success": false, "message": "Authentication required. Please login first.", "data": null }
```

### Transactions (Orders)
Nama controller: transaction.controller.ts, menggunakan tabel orders dan order_items.

- POST /transactions
  - Body (user diambil dari token, body tidak perlu user_id):
    ```json
    {
      "items": [
        { "book_id": "uuid-book-1", "quantity": 1 },
        { "book_id": "uuid-book-2", "quantity": 2 }
      ]
    }
    ```
  - Validasi:
    - items array tidak kosong
    - book_id string valid
    - quantity number >= 1
    - buku harus ada dan belum di-soft-delete
    - stok cukup
  - Proses:
    - Prisma $transaction: cek stok untuk setiap item, decrement stock_quantity, buat orders + order_items
  - 201 Created

- GET /transactions
  - Query: page, limit
  - Include: user { id, username, email }, order_items -> book -> genre
  - 200 OK
  - Response data:
    ```json
    {
      "orders": [],
      "pagination": { "page": 1, "limit": 10, "total": 0, "total_pages": 0 }
    }
    ```

- GET /transactions/:transaction_id
  - Detail order dengan user, items, book, genre
  - 200 OK / 404

- GET /transactions/statistics
  - Agregasi berbasis order_items:
    - totalTransactions: jumlah orders
    - totalRevenue: sum(quantity * book.price) saat ini
    - averageTransactionAmount: pembulatan totalRevenue / totalTransactions
    - genreWithMostSales / genreWithLeastSales: berdasarkan totalSold
  - 200 OK

Contoh respons (sukses):
```json
{
  "success": true,
  "message": "Transaction created successfully",
  "data": {
    "id": "order-id",
    "user": { "id": "..." },
    "order_items": [
      { "id": "...", "quantity": 1, "book": { "id": "...", "genre": { "id": "..." } } }
    ]
  }
}
```

Contoh error umum:
- 404 BOOK_NOT_FOUND: `{ "success": false, "message": "Book with ID <id> not found", "data": null }`
- 400 INSUFFICIENT_STOCK: `{ "success": false, "message": "Insufficient stock for \"<title>\". Available: X, Requested: Y" }`

## Query Parameters Ringkasan (Books)
- page, limit: integer
- title, writer, publisher: string (contains, case-insensitive)
- genre_id: uuid
- min_price, max_price: number
- min_year, max_year: integer
- sort_by: field name (default created_at)
- order: asc | desc (default desc)

## Error Handling
- Validasi body: 400
- Tidak ditemukan: 404
- Duplikasi unik (title, genre name): 400/409 sesuai konteks
- Auth: 401 jika token tidak ada/tidak valid
- Server error: 500

## Menjalankan Proyek
1. Install dependencies:
   ```
   npm install
   ```
2. Siapkan .env (DATABASE_URL, JWT_SECRET, dll)
3. Prisma:
   ```
   npx prisma migrate dev --name init
   npx prisma generate
   ```
4. Run:
   ```
   npm run dev
   ```
5. Test endpoints dengan Authorization: Bearer <token>.

## Catatan Implementasi
- Soft delete di books: semua query exclude deleted_at != null.
- Transaksi stok aman dengan Prisma.$transaction.
- Sorting dinamis pada /books dengan `orderBy: { [sort_by]: order }`.
- Konsistensi respons via utils/response.ts: ok(message, data) dan fail(message).

## Pengembangan Lanjutan
- Implementasi verifikasi JWT sesungguhnya (verify signature, expiry).
- Menyimpan price_at_purchase pada order_items untuk historis harga.
- Indexing pada kolom pencarian (title, writer, publisher) untuk performa.
- Endpoint PUT /books untuk replace penuh (opsional).
- Soft delete untuk genres dan validasi referential di books.

## Credits

- Tim: lihat bagian "MEMBER" di atas untuk daftar kontributor.
- Teknologi & pustaka: Node.js, Express, Prisma, Zod, jsonwebtoken (JWT).
- Tools: Git, npm, VS Code, Prisma Studio, Postman.
- Referensi & inspirasi: Dokumentasi Resmi Wiki, AI dan open-source Comunity.

Terima kasih kepada semua kolaborator dan proyek open-source yang membantu pembangunan API ini.