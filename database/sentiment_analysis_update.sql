-- ============================================
-- Sentiment Analysis & Text Processing Extension
-- ============================================

USE fb_comment_db;

-- ============================================
-- Table: comment_analysis
-- Purpose: Lưu kết quả phân tích sentiment và metadata
-- ============================================
CREATE TABLE IF NOT EXISTS comment_analysis (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    comment_id VARCHAR(100) UNIQUE NOT NULL,
    
    -- Raw data
    original_message TEXT NOT NULL,
    
    -- Cleaned data
    cleaned_message TEXT,
    is_spam BOOLEAN DEFAULT FALSE,
    is_duplicate BOOLEAN DEFAULT FALSE,
    duplicate_of VARCHAR(100) DEFAULT NULL,
    
    -- Text metadata
    message_length INT,
    word_count INT,
    has_emoji BOOLEAN DEFAULT FALSE,
    has_link BOOLEAN DEFAULT FALSE,
    has_tag BOOLEAN DEFAULT FALSE,
    language VARCHAR(10) DEFAULT 'vi',
    
    -- Sentiment analysis
    sentiment ENUM('positive', 'negative', 'neutral', 'mixed') DEFAULT 'neutral',
    sentiment_score DECIMAL(3,2) COMMENT 'Score từ -1 (negative) đến 1 (positive)',
    confidence_score DECIMAL(3,2) COMMENT 'Độ tin cậy của sentiment',
    
    -- Keywords & topics
    keywords JSON COMMENT 'Từ khóa chính trong comment',
    topics JSON COMMENT 'Chủ đề được phát hiện',
    
    -- Analysis metadata
    analyzed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    analysis_version VARCHAR(20) DEFAULT 'v1.0',
    
    INDEX idx_comment_id (comment_id),
    INDEX idx_sentiment (sentiment),
    INDEX idx_is_spam (is_spam),
    INDEX idx_analyzed_at (analyzed_at),
    FOREIGN KEY (comment_id) REFERENCES facebook_comments(comment_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- Table: spam_patterns
-- Purpose: Lưu patterns để detect spam
-- ============================================
CREATE TABLE IF NOT EXISTS spam_patterns (
    id INT PRIMARY KEY AUTO_INCREMENT,
    pattern_type ENUM('keyword', 'regex', 'domain', 'phone') NOT NULL,
    pattern_value VARCHAR(255) NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_pattern_type (pattern_type),
    INDEX idx_is_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- Insert default spam patterns
-- ============================================
INSERT INTO spam_patterns (pattern_type, pattern_value, description) VALUES
-- Keywords spam
('keyword', 'inbox', 'Từ spam phổ biến'),
('keyword', 'zalo', 'Từ spam phổ biến'),
('keyword', 'liên hệ ngay', 'Từ spam phổ biến'),
('keyword', 'giảm giá sốc', 'Từ spam phổ biến'),
('keyword', 'miễn phí', 'Từ spam phổ biến'),
('keyword', 'khuyến mãi khủng', 'Từ spam phổ biến'),

-- Regex patterns
('regex', '\\d{10,11}', 'Số điện thoại 10-11 số'),
('regex', '(http|https)://[^\\s]+', 'URL links'),
('regex', '@[a-zA-Z0-9_]+', 'Mention tags'),

-- Domains
('domain', 'bit.ly', 'Shortened URL'),
('domain', 'tinyurl.com', 'Shortened URL'),
('domain', 'shopee.vn', 'Competitor link'),
('domain', 'lazada.vn', 'Competitor link'),

-- Phone patterns
('phone', '^(0|\\+84)', 'Số điện thoại Việt Nam')
ON DUPLICATE KEY UPDATE pattern_value=VALUES(pattern_value);

-- ============================================
-- Table: sentiment_keywords
-- Purpose: Từ khóa cho sentiment analysis
-- ============================================
CREATE TABLE IF NOT EXISTS sentiment_keywords (
    id INT PRIMARY KEY AUTO_INCREMENT,
    keyword VARCHAR(100) NOT NULL,
    sentiment ENUM('positive', 'negative', 'neutral') NOT NULL,
    weight DECIMAL(2,1) DEFAULT 1.0 COMMENT 'Trọng số từ 0.1 đến 5.0',
    category VARCHAR(50) COMMENT 'product, service, price, delivery, etc',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_keyword (keyword),
    INDEX idx_sentiment (sentiment),
    INDEX idx_category (category)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- Insert Vietnamese sentiment keywords
-- ============================================
INSERT INTO sentiment_keywords (keyword, sentiment, weight, category) VALUES
-- Positive keywords
('tuyệt vời', 'positive', 2.0, 'general'),
('tốt', 'positive', 1.5, 'general'),
('đẹp', 'positive', 1.5, 'product'),
('chất lượng', 'positive', 2.0, 'product'),
('hài lòng', 'positive', 2.0, 'general'),
('ok', 'positive', 1.0, 'general'),
('oke', 'positive', 1.0, 'general'),
('thích', 'positive', 1.5, 'general'),
('nhanh', 'positive', 1.5, 'delivery'),
('rẻ', 'positive', 1.0, 'price'),
('đáng tiền', 'positive', 2.0, 'price'),
('chính hãng', 'positive', 1.5, 'product'),
('uy tín', 'positive', 2.0, 'service'),

-- Negative keywords
('tệ', 'negative', 2.0, 'general'),
('kém', 'negative', 1.5, 'general'),
('không tốt', 'negative', 1.5, 'general'),
('chậm', 'negative', 1.5, 'delivery'),
('đắt', 'negative', 1.0, 'price'),
('lừa đảo', 'negative', 3.0, 'service'),
('giả', 'negative', 2.5, 'product'),
('không đáng tiền', 'negative', 2.0, 'price'),
('thất vọng', 'negative', 2.0, 'general'),
('hỏng', 'negative', 2.5, 'product'),

-- Neutral keywords
('bao nhiêu', 'neutral', 1.0, 'question'),
('giá', 'neutral', 1.0, 'question'),
('còn hàng', 'neutral', 1.0, 'question'),
('ship', 'neutral', 1.0, 'question'),
('bảo hành', 'neutral', 1.0, 'question')
ON DUPLICATE KEY UPDATE weight=VALUES(weight);

-- ============================================
-- Views for Analytics
-- ============================================

-- Sentiment overview
CREATE OR REPLACE VIEW sentiment_overview AS
SELECT 
    ca.sentiment,
    COUNT(*) as total_comments,
    AVG(ca.sentiment_score) as avg_score,
    AVG(ca.confidence_score) as avg_confidence,
    COUNT(CASE WHEN ca.is_spam = TRUE THEN 1 END) as spam_count
FROM comment_analysis ca
GROUP BY ca.sentiment;

-- Daily sentiment trend
CREATE OR REPLACE VIEW daily_sentiment_trend AS
SELECT 
    DATE(fc.created_time) as date,
    ca.sentiment,
    COUNT(*) as comment_count,
    AVG(ca.sentiment_score) as avg_sentiment_score
FROM facebook_comments fc
JOIN comment_analysis ca ON fc.comment_id = ca.comment_id
WHERE fc.created_time >= DATE_SUB(NOW(), INTERVAL 30 DAY)
GROUP BY DATE(fc.created_time), ca.sentiment
ORDER BY date DESC, ca.sentiment;

-- Top keywords by sentiment
CREATE OR REPLACE VIEW top_keywords_by_sentiment AS
SELECT 
    ca.sentiment,
    JSON_UNQUOTE(JSON_EXTRACT(ca.keywords, '$[0]')) as top_keyword,
    COUNT(*) as frequency
FROM comment_analysis ca
WHERE ca.keywords IS NOT NULL
GROUP BY ca.sentiment, top_keyword
ORDER BY frequency DESC
LIMIT 100;

-- Spam statistics
CREATE OR REPLACE VIEW spam_statistics AS
SELECT 
    DATE(analyzed_at) as date,
    COUNT(*) as total_analyzed,
    COUNT(CASE WHEN is_spam = TRUE THEN 1 END) as spam_count,
    COUNT(CASE WHEN is_duplicate = TRUE THEN 1 END) as duplicate_count,
    ROUND(COUNT(CASE WHEN is_spam = TRUE THEN 1 END) * 100.0 / COUNT(*), 2) as spam_percentage
FROM comment_analysis
WHERE analyzed_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
GROUP BY DATE(analyzed_at)
ORDER BY date DESC;

-- User sentiment profile
CREATE OR REPLACE VIEW user_sentiment_profile AS
SELECT 
    fc.from_id,
    fc.from_name,
    COUNT(*) as total_comments,
    COUNT(CASE WHEN ca.sentiment = 'positive' THEN 1 END) as positive_count,
    COUNT(CASE WHEN ca.sentiment = 'negative' THEN 1 END) as negative_count,
    COUNT(CASE WHEN ca.sentiment = 'neutral' THEN 1 END) as neutral_count,
    AVG(ca.sentiment_score) as avg_sentiment_score,
    COUNT(CASE WHEN ca.is_spam = TRUE THEN 1 END) as spam_count
FROM facebook_comments fc
JOIN comment_analysis ca ON fc.comment_id = ca.comment_id
GROUP BY fc.from_id, fc.from_name
HAVING COUNT(*) >= 2
ORDER BY total_comments DESC;

-- ============================================
-- Stored Procedures
-- ============================================

DELIMITER //

-- Get sentiment summary for a post
CREATE PROCEDURE IF NOT EXISTS GetPostSentiment(IN post_id_param VARCHAR(100))
BEGIN
    SELECT 
        fc.post_id,
        ca.sentiment,
        COUNT(*) as comment_count,
        AVG(ca.sentiment_score) as avg_score,
        GROUP_CONCAT(DISTINCT JSON_UNQUOTE(JSON_EXTRACT(ca.keywords, '$[0]')) SEPARATOR ', ') as top_keywords
    FROM facebook_comments fc
    JOIN comment_analysis ca ON fc.comment_id = ca.comment_id
    WHERE fc.post_id = post_id_param
    GROUP BY fc.post_id, ca.sentiment;
END //

-- Clean old spam comments (older than 90 days)
CREATE PROCEDURE IF NOT EXISTS CleanOldSpam()
BEGIN
    DELETE ca FROM comment_analysis ca
    WHERE ca.is_spam = TRUE 
    AND ca.analyzed_at < DATE_SUB(NOW(), INTERVAL 90 DAY);
    
    SELECT ROW_COUNT() as deleted_count;
END //

DELIMITER ;

-- ============================================
-- Indexes for performance
-- ============================================
ALTER TABLE facebook_comments ADD INDEX idx_message (message(100));
ALTER TABLE facebook_comments ADD INDEX idx_from_id_created (from_id, created_time);

-- ============================================
-- Migration complete message
-- ============================================
SELECT 'Sentiment Analysis Schema Updated Successfully!' as Status;

