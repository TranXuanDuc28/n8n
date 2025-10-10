# 🤖 Facebook Comment Auto-Reply System v2.0

Hệ thống tự động trả lời comment Facebook sử dụng AI (Google Gemini) với kiến trúc Backend hiện đại.

## 📋 Mục lục

- [Tổng quan](#tổng-quan)
- [Kiến trúc hệ thống](#kiến-trúc-hệ-thống)
- [Công nghệ sử dụng](#công-nghệ-sử-dụng)
- [Cài đặt](#cài-đặt)
- [Cấu hình](#cấu-hình)
- [Chạy hệ thống](#chạy-hệ-thống)
- [API Documentation](#api-documentation)
- [So sánh với phiên bản cũ](#so-sánh-với-phiên-bản-cũ)

---

## 🎯 Tổng quan

Hệ thống tự động:
- ✅ Nhận webhook từ Facebook khi có comment mới
- ✅ Lấy posts và comments từ Facebook Page
- ✅ Check trùng lặp (tránh reply 2 lần)
- ✅ Sinh response bằng AI (Google Gemini)
- ✅ Trả lời comment tự động
- ✅ Lưu lịch sử chat (memory)
- ✅ Xử lý replies (nested comments level 2)
- ✅ Logging và analytics

---

## 🏗️ Kiến trúc hệ thống

### **Phiên bản cũ** (workflow trong n8n)
```
Webhook → Logic nodes → Code nodes → Supabase/Postgres → AI Agent → Facebook
```
❌ Vấn đề: Logic phức tạp trong workflow, khó maintain, không scale

### **Phiên bản mới** (Backend + n8n)
```
┌─────────────┐      ┌──────────────┐      ┌─────────────┐
│   n8n       │──────│   Backend    │──────│   MySQL     │
│ (Automation)│      │ (Node.js API)│      │  (Database) │
└─────────────┘      └──────────────┘      └─────────────┘
       │                     │
       │                     │
       ▼                     ▼
┌─────────────┐      ┌──────────────┐
│  Facebook   │      │ Gemini API   │
│  Graph API  │      │    (AI)      │
└─────────────┘      └──────────────┘
```

### Phân chia trách nhiệm

| Component | Chức năng |
|-----------|-----------|
| **n8n** | - Nhận webhook<br>- Gọi Facebook API<br>- Trigger workflow<br>- Reply comments |
| **Backend** | - Xử lý logic business<br>- Tích hợp Gemini AI<br>- Quản lý database<br>- API endpoints |
| **MySQL** | - Lưu posts/comments<br>- Track handled comments<br>- Chat history<br>- System logs |

---

## 💻 Công nghệ sử dụng

### Backend
- **Node.js** v18+
- **Express.js** - Web framework
- **MySQL2** - Database driver
- **Google Gemini API** - AI response generation
- **dotenv** - Environment variables

### Automation
- **n8n** - Workflow automation platform
- **Facebook Graph API** - Social media integration

### Database
- **MySQL 8.0+** - Relational database

---

## 🚀 Cài đặt

### 1. Cài đặt Node.js và MySQL

**Node.js** (v18+):
```bash
# Download từ https://nodejs.org/
node --version  # Kiểm tra version
```

**MySQL** (v8.0+):
```bash
# Download từ https://dev.mysql.com/downloads/mysql/
mysql --version  # Kiểm tra version
```

**n8n**:
```bash
npm install -g n8n
```

### 2. Clone project

```bash
cd D:/workflow
```

### 3. Cài đặt dependencies cho Backend

```bash
cd backend
npm install
```

---

## ⚙️ Cấu hình

### 1. Tạo file `.env` trong thư mục `backend`

```bash
cd backend
copy .env.example .env
```

Hoặc tạo file `.env` với nội dung:

```env
# Server Configuration
PORT=3000
NODE_ENV=development

# MySQL Database
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_NAME=fb_comment_db
DB_PORT=3306

# Google Gemini API
GEMINI_API_KEY=your_gemini_api_key_here

# Facebook API
FACEBOOK_PAGE_ID=843618638831103
FACEBOOK_ACCESS_TOKEN=your_facebook_access_token

# System Configuration
MAX_CHAT_HISTORY=20
DEFAULT_POSTS_LIMIT=10
```

### 2. Lấy API Keys

#### **Google Gemini API Key:**
1. Truy cập: https://makersuite.google.com/app/apikey
2. Tạo API key mới
3. Copy và paste vào `.env`

#### **Facebook Access Token:**
1. Truy cập: https://developers.facebook.com/tools/explorer/
2. Chọn page của bạn
3. Generate token với quyền: `pages_read_engagement`, `pages_manage_posts`
4. Copy token vào `.env`

### 3. Khởi tạo MySQL Database

```bash
# Từ thư mục backend
npm run init-db
```

Hoặc import thủ công:
```bash
mysql -u root -p < ../database/schema.sql
```

Kiểm tra database đã tạo:
```bash
mysql -u root -p
```

```sql
USE fb_comment_db;
SHOW TABLES;
```

Bạn sẽ thấy:
- `facebook_posts`
- `facebook_comments`
- `handled_comments`
- `chat_history`
- `system_logs`
- `ai_prompts`

---

## 🎮 Chạy hệ thống

### Bước 1: Start Backend

```bash
cd backend
npm start
```

Hoặc development mode với auto-reload:
```bash
npm run dev
```

Kết quả:
```
🚀 ========================================
✅ Server is running on port 3000
📡 API endpoint: http://localhost:3000/api
🏥 Health check: http://localhost:3000/api/health
🔗 ========================================
```

**Test backend:**
```bash
# Mở browser hoặc Postman
http://localhost:3000/api/health
```

Response:
```json
{
  "success": true,
  "message": "Backend is running",
  "timestamp": "2025-10-09T..."
}
```

### Bước 2: Start n8n

Mở terminal mới:

```bash
n8n start
```

Truy cập n8n UI: http://localhost:5678

### Bước 3: Import workflow vào n8n

1. Mở n8n UI: http://localhost:5678
2. Click **"+"** → **"Import from File"**
3. Chọn file: `n8n-workflows/FB-Comment-v2-Backend.json`
4. Click **"Import"**

### Bước 4: Cấu hình workflow

1. Mở workflow **"FB Comment v2 (Backend Architecture)"**
2. Update các node sau:

**Node "Get Posts from Page":**
- Credential: Chọn Facebook Graph API account của bạn

**Node "Reply to Comment" và "Reply to Reply":**
- Header `Authorization`: Thay `Bearer YOUR_TOKEN` bằng token của bạn

3. **Activate workflow** (toggle ON ở góc trên)

### Bước 5: Setup Facebook Webhook

1. Copy Webhook URL từ n8n:
   ```
   https://your-n8n-domain.com/webhook/fb-webhook
   ```

2. Truy cập Facebook Developer Console:
   - https://developers.facebook.com/apps/
   - Chọn app của bạn
   - Vào **Webhooks** → **Page** → **Edit Subscription**

3. Paste webhook URL và verify

4. Subscribe to fields:
   - `feed`
   - `comments`

---

## 📚 API Documentation

### Base URL
```
http://localhost:3000/api
```

### Endpoints

#### 1. Health Check
```http
GET /api/health
```

Response:
```json
{
  "success": true,
  "message": "Backend is running",
  "timestamp": "2025-10-09T10:30:00.000Z"
}
```

---

#### 2. Process Comments
```http
POST /api/comments/process
```

**Request Body:**
```json
{
  "comments": [
    {
      "comment_id": "123456789",
      "post_id": "987654321",
      "from_id": "111222333",
      "from_name": "John Doe",
      "message": "Đồng hồ này giá bao nhiêu?",
      "created_time": "2025-10-09T10:00:00Z",
      "comment_level": 1
    }
  ],
  "session_id": "session_12345"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "processed": [
      {
        "comment_id": "123456789",
        "from_name": "John Doe",
        "message": "Đồng hồ này giá bao nhiêu?",
        "ai_response": "Xin chào John! Cảm ơn bạn đã quan tâm...",
        "session_id": "session_12345"
      }
    ],
    "skipped": [],
    "errors": []
  },
  "summary": {
    "total": 1,
    "processed": 1,
    "skipped": 0,
    "errors": 0
  }
}
```

---

#### 3. Mark Comments as Handled
```http
POST /api/comments/mark-handled
```

**Request Body:**
```json
{
  "handled_comments": [
    {
      "comment_id": "123456789",
      "reply_id": "999888777",
      "ai_response": "Cảm ơn bạn đã quan tâm...",
      "session_id": "session_12345"
    }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "comment_id": "123456789",
      "status": "success"
    }
  ]
}
```

---

#### 4. Check Handled Status
```http
POST /api/comments/check-handled
```

**Request Body:**
```json
{
  "comment_ids": ["123456789", "987654321"]
}
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "comment_id": "123456789",
      "is_handled": true
    },
    {
      "comment_id": "987654321",
      "is_handled": false
    }
  ]
}
```

---

#### 5. Get Unhandled Comments
```http
GET /api/comments/unhandled?limit=50
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "comment_id": "987654321",
      "post_id": "111222333",
      "from_name": "Jane Smith",
      "message": "Shop có ship COD không?",
      "created_time": "2025-10-09T11:00:00Z"
    }
  ],
  "count": 1
}
```

---

#### 6. Save Posts
```http
POST /api/posts/save
```

**Request Body:**
```json
{
  "posts": [
    {
      "post_id": "111222333",
      "page_id": "843618638831103",
      "content": "Bộ sưu tập đồng hồ mới...",
      "created_time": "2025-10-09T09:00:00Z"
    }
  ]
}
```

---

#### 7. Generate AI Response
```http
POST /api/ai/generate-response
```

**Request Body:**
```json
{
  "message": "Đồng hồ này có bảo hành không?",
  "user_name": "John Doe",
  "user_id": "111222333",
  "post_id": "987654321",
  "session_id": "session_12345"
}
```

**Response:**
```json
{
  "success": true,
  "response": "Xin chào John! Tất cả đồng hồ của shop đều có bảo hành chính hãng 12 tháng...",
  "error": null
}
```

---

## 📊 So sánh với phiên bản cũ

| Feature | Phiên bản cũ | Phiên bản mới (v2) |
|---------|-------------|-------------------|
| **Architecture** | Monolithic trong n8n | Backend API + n8n |
| **Database** | Supabase + Postgres | MySQL tập trung |
| **Logic xử lý** | Code nodes phức tạp | Service layer rõ ràng |
| **AI Integration** | Node trong workflow | Backend API call |
| **Maintainability** | Khó maintain | Dễ maintain, modular |
| **Scalability** | Hạn chế | Dễ scale |
| **Testing** | Khó test | Dễ test (unit + API) |
| **Logging** | Console logs | Database logging |
| **Error handling** | Try/catch rải rác | Centralized error handler |
| **Performance** | Trung bình | Tốt hơn (caching, pooling) |

---

## 🔧 Troubleshooting

### Backend không start được

**Lỗi:** `Error: connect ECONNREFUSED 127.0.0.1:3306`

**Giải pháp:**
- Kiểm tra MySQL đã chạy: `mysql -u root -p`
- Kiểm tra port trong `.env`: `DB_PORT=3306`
- Restart MySQL service

---

### Gemini API lỗi

**Lỗi:** `API key not valid`

**Giải pháp:**
- Kiểm tra API key trong `.env`
- Verify key tại: https://makersuite.google.com/app/apikey
- Generate key mới nếu cần

---

### n8n không gọi được backend

**Lỗi:** `ECONNREFUSED localhost:3000`

**Giải pháp:**
- Kiểm tra backend đang chạy: `http://localhost:3000/api/health`
- Kiểm tra port trong workflow nodes
- Nếu n8n chạy trên server khác, đổi `localhost` thành IP server

---

### Facebook webhook không nhận được

**Giải pháp:**
- Workflow phải **Activated** (ON)
- Webhook URL phải HTTPS (production)
- Verify callback URL trong Facebook Developer Console

---

## 📈 Mở rộng trong tương lai

- [ ] **Multi-page support** - Quản lý nhiều Facebook pages
- [ ] **Admin dashboard** - Web UI để xem logs, stats
- [ ] **A/B testing** - Test nhiều prompt khác nhau
- [ ] **Sentiment analysis** - Phân tích cảm xúc khách hàng
- [ ] **Auto-escalation** - Chuyển human khi AI không xử lý được
- [ ] **Redis caching** - Cache handled IDs để tăng tốc
- [ ] **Docker deployment** - Containerize toàn bộ stack
- [ ] **Monitoring** - Prometheus + Grafana

---

## 📞 Hỗ trợ

Nếu gặp vấn đề, hãy:
1. Check logs trong `system_logs` table
2. Xem console output của backend
3. Test từng API endpoint bằng Postman

---

## 📄 License

MIT License - Free to use for personal and commercial projects.

---

**Made with ❤️ for Golden Hour Watch Shop**

