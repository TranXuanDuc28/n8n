# Timezone Configuration Guide

## Vấn đề
Database hiện tại đang lưu thời gian theo UTC thay vì giờ Việt Nam (UTC+7), gây ra sự nhầm lẫn khi hiển thị thời gian.

## Giải pháp đã thực hiện

### 1. Cấu hình Sequelize Timezone
**File:** `backend/models/index.js`
```javascript
const sequelize = new Sequelize(process.env.DB_NAME, process.env.DB_USER, process.env.DB_PASSWORD, {
  // ... other config
  timezone: '+07:00', // Vietnam timezone (UTC+7)
  dialectOptions: {
    timezone: 'local',
    dateStrings: true,
    typeCast: true
  }
});
```

### 2. Cấu hình MySQL Connection Timezone
**File:** `backend/config/database.js`
```javascript
const dbConfig = {
  // ... other config
  timezone: '+07:00', // Vietnam timezone (UTC+7)
};

// Set timezone for each connection
await connection.query("SET time_zone = '+07:00'");
```

### 3. Timezone Utility Functions
**File:** `backend/utils/timezone.js`
- `TimezoneUtils.now()` - Lấy thời gian hiện tại theo giờ Việt Nam
- `TimezoneUtils.createVietnamDate(dateString)` - Tạo Date object theo giờ Việt Nam
- `TimezoneUtils.formatVietnamTime(date, format)` - Format thời gian theo giờ Việt Nam
- `TimezoneUtils.toDatabaseFormat(date)` - Convert sang format database

### 4. Cập nhật Controllers và Services
- **Posts Controller:** Sử dụng `TimezoneUtils.now()` cho created_at, updated_at
- **Visual Controller:** Sử dụng `TimezoneUtils.createVietnamDate()` cho scheduledAt
- **Posts Service:** Sử dụng `TimezoneUtils.subtract()` cho time calculations
- **Visual Service:** Sử dụng timezone utilities cho A/B test scheduling

## Cách sử dụng

### Trong Controllers:
```javascript
const TimezoneUtils = require('../utils/timezone');

// Lấy thời gian hiện tại theo giờ Việt Nam
const now = TimezoneUtils.now().toDate();

// Tạo thời gian từ string
const scheduledTime = TimezoneUtils.createVietnamDate('2024-01-15 10:30:00');

// Format thời gian để hiển thị
const formattedTime = TimezoneUtils.formatVietnamTime(new Date(), 'YYYY-MM-DD HH:mm:ss');
```

### Trong Database Queries:
```javascript
// Sequelize sẽ tự động handle timezone
const posts = await Post.findAll({
  where: {
    published_at: {
      [Op.gte]: TimezoneUtils.now().toDate()
    }
  }
});
```

## Kiểm tra Timezone

### 1. Chạy script kiểm tra:
```bash
cd backend
node scripts/check-timezone.js
```

### 2. Kiểm tra trong MySQL:
```sql
-- Xem timezone hiện tại
SELECT @@global.time_zone, @@session.time_zone, @@system_time_zone;

-- Xem thời gian hiện tại
SELECT NOW(), UTC_TIMESTAMP();

-- Set timezone cho session
SET time_zone = '+07:00';
SELECT NOW();
```

## Cấu hình MySQL Server (Tùy chọn)

### 1. Cấu hình trong my.cnf:
```ini
[mysqld]
default-time-zone = '+07:00'
```

### 2. Restart MySQL service:
```bash
sudo systemctl restart mysql
```

## Lưu ý quan trọng

1. **Database Connection:** Mỗi connection sẽ tự động set timezone về +07:00
2. **Sequelize Models:** Tự động convert timezone khi save/retrieve
3. **API Responses:** Thời gian trả về sẽ theo giờ Việt Nam
4. **Frontend:** Có thể cần cập nhật để hiển thị timezone đúng

## Testing

### Test timezone trong code:
```javascript
const TimezoneUtils = require('./utils/timezone');

// Test current time
console.log('Vietnam time:', TimezoneUtils.now().format('YYYY-MM-DD HH:mm:ss'));

// Test date creation
const testDate = TimezoneUtils.createVietnamDate('2024-01-15 10:30:00');
console.log('Created date:', testDate);

// Test database format
const dbFormat = TimezoneUtils.toDatabaseFormat(new Date());
console.log('DB format:', dbFormat);
```

## Troubleshooting

### Nếu thời gian vẫn không đúng:

1. **Kiểm tra MySQL timezone:**
   ```bash
   node backend/scripts/check-timezone.js
   ```

2. **Kiểm tra environment variables:**
   ```bash
   echo $TZ
   ```

3. **Kiểm tra system timezone:**
   ```bash
   timedatectl
   ```

4. **Restart application:**
   ```bash
   pm2 restart all
   # hoặc
   npm restart
   ```

## Migration cho dữ liệu cũ

Nếu có dữ liệu cũ được lưu theo UTC, có thể cần migration:

```sql
-- Ví dụ: Convert UTC timestamps to Vietnam time
UPDATE posts 
SET created_at = CONVERT_TZ(created_at, 'UTC', '+07:00'),
    updated_at = CONVERT_TZ(updated_at, 'UTC', '+07:00');
```

## Kết luận

Sau khi áp dụng các thay đổi này:
- ✅ Database sẽ lưu thời gian theo giờ Việt Nam
- ✅ API responses sẽ trả về thời gian đúng
- ✅ Frontend có thể hiển thị thời gian chính xác
- ✅ Không còn nhầm lẫn về timezone
