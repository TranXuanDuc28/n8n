# 🚀 Hướng dẫn Deploy Backend

Vì n8n chạy trên domain riêng, backend cần được deploy lên server public.

---

## ⚡ Option 1: Ngrok (Test nhanh - Free)

### 1. Cài đặt ngrok

**Windows:**
1. Download: https://ngrok.com/download
2. Giải nén `ngrok.exe` vào thư mục (ví dụ: `C:\ngrok\`)
3. Add vào PATH (optional)

### 2. Đăng ký & Setup

```bash
# Đăng ký free: https://dashboard.ngrok.com/signup
# Lấy authtoken: https://dashboard.ngrok.com/get-started/your-authtoken

# Setup token
ngrok config add-authtoken YOUR_AUTHTOKEN_HERE
```

### 3. Expose backend

```bash
# Đảm bảo backend đang chạy
cd D:\workflow\backend
npm start

# Terminal mới - Start ngrok
ngrok http 3000
```

Output:
```
Session Status                online
Account                       Your Name (Plan: Free)
Forwarding                    https://abc123.ngrok-free.app -> http://localhost:3000
```

### 4. Copy URL và update n8n

**URL ngrok:** `https://abc123.ngrok-free.app`

**Update 5 nodes trong n8n workflow:**

1. **Backend: Save Posts**
   - URL: `https://abc123.ngrok-free.app/api/posts/save`

2. **Backend: Process Comments**
   - URL: `https://abc123.ngrok-free.app/api/comments/process`

3. **Backend: Mark Handled**
   - URL: `https://abc123.ngrok-free.app/api/comments/mark-handled`

4. **Backend: Process Replies**
   - URL: `https://abc123.ngrok-free.app/api/comments/process`

5. **Backend: Mark Reply Handled**
   - URL: `https://abc123.ngrok-free.app/api/comments/mark-handled`

### 5. Test

```bash
# Test backend qua ngrok
curl https://abc123.ngrok-free.app/api/health

# Response:
# {"success":true,"message":"Backend is running"}
```

✅ **Ưu điểm:**
- Setup trong 5 phút
- Không cần server
- HTTPS miễn phí

❌ **Nhược điểm:**
- URL thay đổi khi restart (free plan)
- Giới hạn 40 requests/phút (free)
- Cần chạy ngrok liên tục

**💡 Tip:** Dùng ngrok paid ($8/month) để có static domain

---

## 🌐 Option 2: Deploy lên VPS/Cloud (Production)

### A. Deploy lên VPS (DigitalOcean, Linode, Vultr)

#### 1. Setup VPS

```bash
# Tạo VPS Ubuntu 22.04 (tối thiểu 1GB RAM)
# IP: 123.456.789.0

# SSH vào server
ssh root@123.456.789.0
```

#### 2. Cài đặt dependencies

```bash
# Update system
apt update && apt upgrade -y

# Cài Node.js v18
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
apt install -y nodejs

# Cài MySQL
apt install -y mysql-server
mysql_secure_installation

# Cài PM2
npm install -g pm2

# Cài Nginx (optional)
apt install -y nginx
```

#### 3. Upload backend code

**Từ máy Windows:**

```bash
# Compress backend
cd D:\workflow
tar -czf backend.tar.gz backend/

# Upload lên server
scp backend.tar.gz root@123.456.789.0:/var/www/

# SSH vào server
ssh root@123.456.789.0

# Extract
cd /var/www
tar -xzf backend.tar.gz
cd backend
```

#### 4. Setup database

```bash
# Login MySQL
mysql -u root -p

# Tạo user và database
CREATE DATABASE fb_comment_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'fbadmin'@'localhost' IDENTIFIED BY 'strong_password_here';
GRANT ALL PRIVILEGES ON fb_comment_db.* TO 'fbadmin'@'localhost';
FLUSH PRIVILEGES;
EXIT;

# Import schema
mysql -u root -p fb_comment_db < ../database/schema.sql
```

#### 5. Configure backend

```bash
cd /var/www/backend

# Tạo .env
nano .env
```

Nội dung `.env`:
```env
PORT=3000
NODE_ENV=production

DB_HOST=localhost
DB_USER=fbadmin
DB_PASSWORD=strong_password_here
DB_NAME=fb_comment_db
DB_PORT=3306

GEMINI_API_KEY=your_gemini_key
FACEBOOK_PAGE_ID=your_page_id
FACEBOOK_ACCESS_TOKEN=your_token

MAX_CHAT_HISTORY=20
DEFAULT_POSTS_LIMIT=10
```

#### 6. Start backend

```bash
# Install dependencies
npm install --production

# Start với PM2
pm2 start server.js --name fb-backend

# Auto-start on reboot
pm2 startup
pm2 save
```

#### 7. Setup Nginx reverse proxy

```bash
nano /etc/nginx/sites-available/backend
```

Nội dung:
```nginx
server {
    listen 80;
    server_name api.yourdomain.com;  # Hoặc dùng IP

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

Enable site:
```bash
ln -s /etc/nginx/sites-available/backend /etc/nginx/sites-enabled/
nginx -t
systemctl restart nginx
```

#### 8. Setup SSL (Let's Encrypt)

```bash
# Cài Certbot
apt install -y certbot python3-certbot-nginx

# Generate SSL certificate
certbot --nginx -d api.yourdomain.com

# Auto-renew
certbot renew --dry-run
```

#### 9. Update n8n workflow

**Backend URL:** `https://api.yourdomain.com`

Update 5 nodes:
- `https://api.yourdomain.com/api/posts/save`
- `https://api.yourdomain.com/api/comments/process`
- `https://api.yourdomain.com/api/comments/mark-handled`

---

### B. Deploy lên Heroku

#### 1. Cài Heroku CLI

Download: https://devcenter.heroku.com/articles/heroku-cli

```bash
heroku login
```

#### 2. Tạo app

```bash
cd D:\workflow\backend

# Init git (nếu chưa có)
git init
git add .
git commit -m "Initial commit"

# Tạo Heroku app
heroku create fb-comment-backend

# Add MySQL addon
heroku addons:create jawsdb:kitefin  # Free tier
```

#### 3. Config env vars

```bash
heroku config:set NODE_ENV=production
heroku config:set GEMINI_API_KEY=your_key
heroku config:set FACEBOOK_PAGE_ID=your_id
heroku config:set FACEBOOK_ACCESS_TOKEN=your_token
heroku config:set MAX_CHAT_HISTORY=20
heroku config:set DEFAULT_POSTS_LIMIT=10

# MySQL config từ JawsDB
heroku config:get JAWSDB_URL
# mysql://user:pass@host:3306/dbname

# Set database config
heroku config:set DB_HOST=host_from_jawsdb
heroku config:set DB_USER=user_from_jawsdb
heroku config:set DB_PASSWORD=pass_from_jawsdb
heroku config:set DB_NAME=dbname_from_jawsdb
heroku config:set DB_PORT=3306
```

#### 4. Deploy

```bash
git push heroku main
```

#### 5. Init database

```bash
# Run migration script
heroku run npm run init-db

# Check logs
heroku logs --tail
```

#### 6. Get backend URL

```bash
heroku info
# Web URL: https://fb-comment-backend-abc123.herokuapp.com
```

Update n8n workflow với URL này.

---

### C. Deploy lên Railway.app (Recommended - Easy)

#### 1. Đăng ký Railway

Truy cập: https://railway.app/
Login với GitHub

#### 2. Deploy backend

1. Click **"New Project"**
2. Select **"Deploy from GitHub repo"**
3. Authorize và select repo (hoặc upload code)
4. Railway auto-detect Node.js

#### 3. Add MySQL

1. Click **"+ New"** → **"Database"** → **"MySQL"**
2. Railway tự động tạo MySQL instance

#### 4. Configure env variables

Variables tab:
```
NODE_ENV=production
PORT=3000
GEMINI_API_KEY=your_key
FACEBOOK_PAGE_ID=your_id
FACEBOOK_ACCESS_TOKEN=your_token
MAX_CHAT_HISTORY=20
DEFAULT_POSTS_LIMIT=10
```

Database variables (auto-filled by Railway):
- `MYSQLHOST`
- `MYSQLUSER`
- `MYSQLPASSWORD`
- `MYSQLDATABASE`
- `MYSQLPORT`

Update `backend/config/database.js`:
```javascript
const dbConfig = {
  host: process.env.MYSQLHOST || process.env.DB_HOST,
  user: process.env.MYSQLUSER || process.env.DB_USER,
  password: process.env.MYSQLPASSWORD || process.env.DB_PASSWORD,
  database: process.env.MYSQLDATABASE || process.env.DB_NAME,
  port: process.env.MYSQLPORT || process.env.DB_PORT || 3306,
  // ...
};
```

#### 5. Deploy

Push code → Railway auto-deploy

#### 6. Generate domain

Settings → **"Generate Domain"**

URL: `https://fb-backend.up.railway.app`

#### 7. Init database

Railway console → Run command:
```bash
npm run init-db
```

---

## 📊 So sánh các options

| Option | Cost | Setup Time | Uptime | SSL | Best For |
|--------|------|------------|--------|-----|----------|
| **Ngrok** | Free/$8 | 5 min | Manual | ✅ | Testing |
| **VPS** | $5-10/mo | 30 min | 99.9% | ✅ | Production |
| **Heroku** | Free/$7 | 15 min | 99.9% | ✅ | Quick deploy |
| **Railway** | $5/mo | 10 min | 99.9% | ✅ | **Recommended** |

---

## ✅ Recommendation

**For Testing:** Ngrok (ngay lập tức)

**For Production:** Railway.app (dễ nhất, $5/month)

**For Full Control:** VPS + Nginx (tốt nhất, $5/month)

---

## 🔧 After Deploy

### Update n8n workflow

Thay tất cả `http://localhost:3000` thành backend URL mới.

### Test connection

```bash
# Test backend
curl https://your-backend-url.com/api/health

# Should return:
# {"success":true,"message":"Backend is running"}
```

### Monitor

**PM2 (VPS):**
```bash
pm2 status
pm2 logs fb-backend
```

**Heroku:**
```bash
heroku logs --tail
```

**Railway:**
Dashboard → Logs tab

---

## 🐛 Troubleshooting

### Backend không start

**Check logs:**
```bash
pm2 logs fb-backend --lines 100
```

**Common issues:**
- Database không connect → Check DB credentials
- Port conflict → Change PORT in .env
- Missing dependencies → Run `npm install`

### n8n vẫn không connect

**Test từ n8n server:**
```bash
curl https://your-backend-url.com/api/health
```

**Check:**
- Firewall rules (allow port 80/443)
- SSL certificate valid
- DNS propagated
- CORS enabled (đã có trong code)

---

**🎉 Done! Backend deployed và n8n có thể kết nối!**

