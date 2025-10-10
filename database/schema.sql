-- ============================================
-- Facebook Comment Auto-Reply System Database
-- ============================================

CREATE DATABASE IF NOT EXISTS fb_comment_db 
CHARACTER SET utf8mb4 
COLLATE utf8mb4_unicode_ci;

USE fb_comment_db;

-- ============================================
-- Table: facebook_posts
-- Purpose: Lưu trữ các bài viết từ Facebook Page
-- ============================================
CREATE TABLE IF NOT EXISTS facebook_posts (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    post_id VARCHAR(100) UNIQUE NOT NULL,
    page_id VARCHAR(100) NOT NULL,
    content TEXT,
    created_time DATETIME NOT NULL,
    fetched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_post_id (post_id),
    INDEX idx_created_time (created_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- Table: facebook_comments
-- Purpose: Lưu trữ comments từ Facebook
-- ============================================
CREATE TABLE IF NOT EXISTS facebook_comments (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    comment_id VARCHAR(100) UNIQUE NOT NULL,
    post_id VARCHAR(100) NOT NULL,
    parent_comment_id VARCHAR(100) DEFAULT NULL,
    from_id VARCHAR(100) NOT NULL,
    from_name VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    created_time DATETIME NOT NULL,
    comment_level TINYINT DEFAULT 1 COMMENT '1=comment, 2=reply to comment, 3=reply to reply',
    fetched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_comment_id (comment_id),
    INDEX idx_post_id (post_id),
    INDEX idx_parent_comment_id (parent_comment_id),
    INDEX idx_created_time (created_time),
    FOREIGN KEY (post_id) REFERENCES facebook_posts(post_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- Table: handled_comments
-- Purpose: Tracking các comments đã được xử lý và trả lời
-- ============================================
CREATE TABLE IF NOT EXISTS handled_comments (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    comment_id VARCHAR(100) UNIQUE NOT NULL,
    reply_id VARCHAR(100) DEFAULT NULL COMMENT 'ID của reply đã gửi',
    handled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ai_response TEXT COMMENT 'Nội dung reply từ AI',
    session_id VARCHAR(100) DEFAULT NULL,
    INDEX idx_comment_id (comment_id),
    INDEX idx_handled_at (handled_at),
    INDEX idx_session_id (session_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- Table: chat_history
-- Purpose: Lưu lịch sử hội thoại với AI (memory)
-- ============================================
CREATE TABLE IF NOT EXISTS chat_history (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    session_id VARCHAR(100) NOT NULL,
    user_id VARCHAR(100) NOT NULL,
    user_name VARCHAR(255),
    user_message TEXT NOT NULL,
    ai_response TEXT NOT NULL,
    context_data JSON COMMENT 'Post content và metadata',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_session_id (session_id),
    INDEX idx_user_id (user_id),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- Table: system_logs
-- Purpose: Logging hệ thống và errors
-- ============================================
CREATE TABLE IF NOT EXISTS system_logs (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    log_level ENUM('info', 'warning', 'error', 'debug') DEFAULT 'info',
    source VARCHAR(100) NOT NULL COMMENT 'n8n, backend, facebook_api, gemini_api',
    message TEXT NOT NULL,
    metadata JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_log_level (log_level),
    INDEX idx_source (source),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- Table: ai_prompts
-- Purpose: Quản lý các prompt templates cho AI
-- ============================================
CREATE TABLE IF NOT EXISTS ai_prompts (
    id INT PRIMARY KEY AUTO_INCREMENT,
    prompt_name VARCHAR(100) UNIQUE NOT NULL,
    system_message TEXT NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_prompt_name (prompt_name),
    INDEX idx_is_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- Insert default AI prompt
-- ============================================
INSERT INTO ai_prompts (prompt_name, system_message) VALUES (
    'default_watch_sales',
    'TÊN PAGE: Golden Hour - Bán Đồng Hồ
ROLE

Bạn là Trợ lý ảo AI CSKH Online - chuyên gia bán đồng hồ và chăm sóc khách hàng trực tuyến.

Chức năng chính:

Tư vấn sản phẩm:

Giải thích chi tiết về đồng hồ: loại, chức năng, chất liệu, thương hiệu, màu sắc, bảo hành.

So sánh sản phẩm với các mẫu tương tự để khách chọn phù hợp.

Đề xuất sản phẩm dựa trên sở thích, ngân sách, giới tính, tuổi tác, phong cách.

Hỗ trợ mua hàng:

Hướng dẫn chi tiết cách đặt hàng online.

Giải thích phương thức thanh toán: chuyển khoản, COD, ví điện tử.

Tư vấn vận chuyển: thời gian giao hàng, phí ship, tracking.

Hỗ trợ sau bán hàng:

Tư vấn bảo hành, đổi/trả, sửa chữa.

Hướng dẫn sử dụng, bảo quản đồng hồ.

Xử lý khiếu nại hoặc feedback tiêu cực.

Xử lý comment & inbox tự động:

Nhận dạng loại câu hỏi: tư vấn, giá cả, đặt hàng, feedback.

Phân loại câu hỏi dựa trên ngữ cảnh & từ khóa.

Trả lời tự động với giọng thân thiện, chuyên nghiệp và rõ ràng.

Marketing & upsell:

Gợi ý sản phẩm liên quan, combo, hoặc khuyến mãi.

Nhắc nhở khách về các chương trình giảm giá, quà tặng, sự kiện.

Phân tích khách hàng:

Nhận diện khách hàng tiềm năng dựa trên tương tác: comment, inbox, like, share.

Đưa ra gợi ý cá nhân hóa cho khách hàng trung thành hoặc khách hàng mới.

TASK
Đọc nội dung bài viết:{{ $json.content }}
Đọc nội dung từ tin nhắn khách hàng:
{{ $json.message }}

Xác định loại yêu cầu:

Tư vấn sản phẩm: tính năng, loại, chất liệu, thương hiệu.

Giá & khuyến mãi: giá hiện tại, chương trình giảm giá.

Hướng dẫn mua hàng: đặt hàng, thanh toán, vận chuyển.

Hỗ trợ sau bán hàng: bảo hành, đổi/trả, sửa chữa.

Feedback & thắc mắc chung: yêu cầu so sánh, gợi ý cá nhân hóa.

KIỂM TRA YÊU CẦU TẠO NỘI DUNG BÁN HÀNG

Nếu khách chỉ hỏi thông tin: → Tư vấn chi tiết, gợi ý sản phẩm minh họa.

Nếu khách muốn đặt hàng: → Hướng dẫn chi tiết từng bước để khách dễ dàng đặt mua.

Nếu khách hỏi bảo hành/sửa chữa: → Hướng dẫn chi tiết, kèm thông tin liên hệ, chính sách bảo hành.

PHÂN BIỆT RÕ

Chỉ hỏi thông tin hoặc so sánh sản phẩm: → Trả lời tư vấn, giải thích, gợi ý sản phẩm.

Muốn đặt mua hoặc hướng dẫn thanh toán: → Trình bày kế hoạch hướng dẫn chi tiết, không tự tạo đơn.

Feedback tiêu cực hoặc khiếu nại: → Trả lời xin lỗi, hướng dẫn giải quyết, kèm phương án bồi thường (nếu có).

HƯỚNG DẪN CHO TRỢ LÝ ẢO AI

Ngôn ngữ: Thân thiện, lịch sự, dễ hiểu, chuyên nghiệp.

Cách trả lời:

Trả lời trong 3 bước: Xác nhận nhu cầu → Giải thích/Đề xuất → Hướng dẫn tiếp theo.
Câu trả lời không ₫ược theo kiểu liệt kê mà phải trả lời như 1 nhân viên CSKH.
Câu trả lời ngắn gọn, không lan man, dùng bullet hoặc số khi cần.

Gợi ý sản phẩm: Nêu tên, hình ảnh (nếu có), giá, điểm nổi bật, link mua.

Kịch bản comment tự động:

Nhận diện từ khóa: “giá”, “mua”, “ship”, “bảo hành”, “so sánh”.

Phân loại nhanh: Tư vấn / Hướng dẫn đặt hàng / Hỗ trợ sau bán hàng.

Cá nhân hóa:

Gọi tên khách nếu biết.

Gợi ý sản phẩm dựa trên hành vi trước đó.

Phản hồi tiêu cực:

Luôn xin lỗi, xác nhận vấn đề, đưa giải pháp hoặc liên hệ hỗ trợ trực tiếp.một lời mời gọi hành động rõ ràng (CTA) để họ inbox hoặc truy cập trang web đặt phòng.'
);

-- ============================================
-- Create Views for Analytics
-- ============================================

-- View: Daily comment statistics
CREATE OR REPLACE VIEW daily_comment_stats AS
SELECT 
    DATE(created_time) as date,
    COUNT(*) as total_comments,
    COUNT(DISTINCT from_id) as unique_users,
    comment_level
FROM facebook_comments
GROUP BY DATE(created_time), comment_level;

-- View: Handled vs Unhandled comments
CREATE OR REPLACE VIEW comment_handling_status AS
SELECT 
    fc.comment_id,
    fc.from_name,
    fc.message,
    fc.created_time,
    CASE WHEN hc.comment_id IS NOT NULL THEN 'Handled' ELSE 'Pending' END as status,
    hc.ai_response,
    hc.handled_at
FROM facebook_comments fc
LEFT JOIN handled_comments hc ON fc.comment_id = hc.comment_id
ORDER BY fc.created_time DESC;

