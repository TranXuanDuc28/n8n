# 🔄 N8N Workflow Update - ChatAI Dynamic Content

## 📋 Tổng Quan

Đã cập nhật luồng N8N ChatAI để tích hợp với hệ thống **Dynamic Content** mới. Workflow hiện tại sẽ sử dụng dữ liệu thực tế từ posts và A/B tests thay vì responses cố định.

## 🔄 Workflow Mới

### 1. **Luồng Xử Lý**
```
Facebook Webhook → Webhook Verification → Extract Message → Refresh Dynamic Content → AI Reply → FB Reply → Response
```

### 2. **Các Node Chính**

#### 🎯 **Webhook Verification**
- **Mục đích**: Phân biệt webhook verification và message thực tế
- **Logic**: Kiểm tra `hub.challenge` parameter
- **Output**: 
  - `true`: Chuyển đến Extract Message
  - `false`: Chuyển đến Respond to Webhook

#### 📝 **Extract Message** (Enhanced)
- **Tính năng mới**: Extract thêm metadata
- **Data extracted**:
  ```json
  {
    "senderId": "123456789",
    "messageText": "Tôi muốn tìm hiểu về tour Đà Nẵng",
    "recipientId": "987654321",
    "messageId": "mid.123456789",
    "timestamp": 1642234567890
  }
  ```

#### 🔄 **Refresh Dynamic Content** (NEW)
- **Endpoint**: `POST /api/chatai/refresh-dynamic-content`
- **Mục đích**: Cập nhật dynamic content trước khi xử lý AI
- **Payload**:
  ```json
  {
    "trigger": "message_received",
    "timestamp": "2025-01-15T10:30:00.000Z"
  }
  ```

#### 🤖 **Backend: AI Reply (Dynamic)** (Updated)
- **Endpoint mới**: `POST /api/chatai/ai-reply`
- **Enhanced payload**:
  ```json
  {
    "senderId": "123456789",
    "messageText": "Tôi muốn tìm hiểu về tour Đà Nẵng",
    "recipientId": "987654321",
    "messageId": "mid.123456789",
    "timestamp": 1642234567890
  }
  ```

#### 📤 **FB Reply** (Enhanced)
- **Fallback handling**: Xử lý trường hợp AI không trả lời được
- **Response logic**:
  ```javascript
  $json.response || $json.aiResponse || 'Xin lỗi, tôi không thể trả lời lúc này. Vui lòng thử lại sau.'
  ```

## 🆚 So Sánh Workflow

### **Workflow Cũ**
```json
{
  "url": "http://192.168.1.121:3000/api/messenger/ai-reply",
  "jsonBody": "={\n  \"senderId\": \"{{ $json.body.entry[0].messaging[0].sender.id }}\",\n  \"messageText\": \"{{ $json.body.entry[0].messaging[0].message.text }}\",\n  \"recipientId\": \"{{ $json.body.entry[0].messaging[0].recipient.id }}\"\n}"
}
```

### **Workflow Mới**
```json
{
  "url": "http://192.168.1.121:3000/api/chatai/ai-reply",
  "jsonBody": "={\n  \"senderId\": \"{{ $json.senderId }}\",\n  \"messageText\": \"{{ $json.messageText }}\",\n  \"recipientId\": \"{{ $json.recipientId }}\",\n  \"messageId\": \"{{ $json.messageId }}\",\n  \"timestamp\": {{ $json.timestamp }}\n}"
}
```

## 🔧 Cải Tiến Chính

### 1. **Dynamic Content Integration**
- ✅ **Auto-refresh**: Tự động refresh content trước mỗi AI response
- ✅ **Real-time data**: Sử dụng dữ liệu mới nhất từ posts
- ✅ **A/B test insights**: Tích hợp insights từ completed tests

### 2. **Enhanced Error Handling**
- ✅ **Fallback responses**: Xử lý trường hợp AI không hoạt động
- ✅ **Timeout handling**: 30s timeout cho AI requests
- ✅ **Error logging**: Log errors để debug

### 3. **Better Data Extraction**
- ✅ **Message metadata**: Extract messageId, timestamp
- ✅ **Structured data**: Clean data structure
- ✅ **Validation**: Kiểm tra webhook verification

### 4. **Performance Optimization**
- ✅ **Parallel processing**: Refresh content song song
- ✅ **Caching**: Dynamic content được cache
- ✅ **Efficient routing**: Smart webhook routing

## 📊 Data Flow

### 1. **Message Received**
```
Facebook → Webhook → Verification Check → Extract Data → Refresh Content → AI Processing → Response
```

### 2. **Webhook Verification**
```
GET /fb-message-webhook?hub.challenge=xxx&hub.verify_token=xxx
→ Respond with challenge string
```

### 3. **AI Processing**
```
POST /api/chatai/ai-reply
{
  "senderId": "123456789",
  "messageText": "Tôi muốn tìm hiểu về tour Đà Nẵng",
  "recipientId": "987654321",
  "messageId": "mid.123456789",
  "timestamp": 1642234567890
}
→ AI Response with Dynamic Content
```

## 🎯 Benefits

### 1. **Cho Business**
- ✅ **Accurate responses**: Dựa trên nội dung thực tế
- ✅ **Campaign promotion**: Tự động promote campaigns
- ✅ **A/B test insights**: Sử dụng data-driven insights
- ✅ **Real-time updates**: Content luôn được cập nhật

### 2. **Cho Users**
- ✅ **Relevant answers**: Trả lời phù hợp với nội dung hiện tại
- ✅ **Better experience**: Responses chất lượng cao
- ✅ **Up-to-date info**: Thông tin mới nhất

### 3. **Cho Developers**
- ✅ **Maintainable**: Dễ dàng maintain và debug
- ✅ **Scalable**: Có thể mở rộng dễ dàng
- ✅ **Monitoring**: Có đầy đủ logging và monitoring

## 🚀 Deployment

### 1. **Import Workflow**
```bash
# Import workflow mới
n8n import --file n8n-workflows/chatAI-dynamic-workflow.json
```

### 2. **Update Webhook URL**
```
Old: http://192.168.1.121:3000/api/messenger/ai-reply
New: http://192.168.1.121:3000/api/chatai/ai-reply
```

### 3. **Test Workflow**
```bash
# Test webhook verification
curl -X GET "https://your-n8n-instance.com/webhook/fb-message-webhook?hub.challenge=test&hub.verify_token=your_token"

# Test message processing
curl -X POST "https://your-n8n-instance.com/webhook/fb-message-webhook" \
  -H "Content-Type: application/json" \
  -d '{"object":"page","entry":[{"id":"123","time":1642234567,"messaging":[{"sender":{"id":"123456789"},"recipient":{"id":"987654321"},"timestamp":1642234567890,"message":{"mid":"mid.123456789","text":"Hello"}}]}]}'
```

## 🔍 Monitoring

### 1. **Execution Logs**
- Check N8N execution logs for errors
- Monitor AI response times
- Track dynamic content refresh success

### 2. **Performance Metrics**
- Response time: < 5 seconds
- Success rate: > 95%
- Dynamic content freshness: < 30 minutes

### 3. **Error Handling**
```javascript
// Common errors to monitor
- AI service timeout
- Dynamic content refresh failure
- Facebook API errors
- Invalid webhook data
```

## 📝 Configuration

### 1. **Environment Variables**
```bash
BACKEND_URL=http://192.168.1.121:3000
FACEBOOK_ACCESS_TOKEN=your_access_token
WEBHOOK_VERIFY_TOKEN=your_verify_token
```

### 2. **N8N Settings**
- **Execution Order**: v1
- **Webhook Timeout**: 30 seconds
- **Retry Policy**: 3 retries with exponential backoff

### 3. **Facebook App Settings**
- **Webhook URL**: `https://your-n8n-instance.com/webhook/fb-message-webhook`
- **Verify Token**: Same as N8N configuration
- **Subscriptions**: messages, messaging_postbacks

## 🎉 Kết Quả

Với workflow mới, ChatAI sẽ:

1. **Tự động cập nhật** content từ posts và A/B tests
2. **Trả lời chính xác** dựa trên nội dung thực tế
3. **Promote campaigns** hiện tại một cách tự nhiên
4. **Sử dụng insights** từ A/B tests để tăng hiệu quả
5. **Xử lý lỗi** tốt hơn với fallback responses

Workflow mới giúp ChatAI trở thành một trợ lý thông minh, luôn cập nhật và phù hợp với nội dung thực tế của business! 🎯✨
