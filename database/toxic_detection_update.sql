-- ============================================
-- Toxic Comment Detection Extension
-- ============================================

USE fb_comment_db;

-- ============================================
-- Add toxic fields to comment_analysis
-- ============================================
ALTER TABLE comment_analysis
ADD COLUMN is_toxic BOOLEAN DEFAULT FALSE AFTER is_duplicate,
ADD COLUMN toxic_category VARCHAR(50) DEFAULT NULL COMMENT 'hate_speech, profanity, violence, sexual',
ADD COLUMN toxic_score DECIMAL(3,2) DEFAULT 0.00 COMMENT 'Toxic score from 0 to 1',
ADD COLUMN moderation_action ENUM('none', 'hide', 'delete', 'manual_review') DEFAULT 'none',
ADD COLUMN moderated_at TIMESTAMP NULL DEFAULT NULL,
ADD INDEX idx_is_toxic (is_toxic),
ADD INDEX idx_moderation_action (moderation_action);

-- ============================================
-- Table: toxic_keywords
-- Purpose: Từ khóa toxic để detect (Vietnamese)
-- ============================================
CREATE TABLE IF NOT EXISTS toxic_keywords (
    id INT PRIMARY KEY AUTO_INCREMENT,
    keyword VARCHAR(100) NOT NULL,
    category ENUM('hate_speech', 'profanity', 'violence', 'sexual', 'insult') NOT NULL,
    severity DECIMAL(2,1) DEFAULT 1.0 COMMENT 'Độ nghiêm trọng 0.1 to 5.0',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_keyword (keyword),
    INDEX idx_category (category),
    INDEX idx_is_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- Insert Vietnamese toxic keywords
-- ============================================
INSERT INTO toxic_keywords (keyword, category, severity) VALUES
-- Profanity (Ngôn từ tục tĩu)
('đm', 'profanity', 3.0),
('dm', 'profanity', 3.0),
('đ*', 'profanity', 3.0),
('địt', 'profanity', 4.0),
('đ!t', 'profanity', 4.0),
('cc', 'profanity', 3.0),
('lồn', 'profanity', 4.0),
('l*n', 'profanity', 4.0),
('vcl', 'profanity', 2.5),
('vl', 'profanity', 2.0),
('cl', 'profanity', 2.5),

-- Insults (Xúc phạm)
('ngu', 'insult', 2.0),
('ngu như', 'insult', 2.5),
('đần', 'insult', 2.0),
('khùng', 'insult', 2.0),
('điên', 'insult', 2.0),
('đồ ngu', 'insult', 2.5),
('thằng ngu', 'insult', 3.0),
('con ngu', 'insult', 3.0),
('đồ khốn', 'insult', 2.5),

-- Hate speech (Phát ngôn thù địch)
('chết đi', 'hate_speech', 4.0),
('đi chết', 'hate_speech', 4.0),
('đồ rác', 'hate_speech', 2.5),
('đồ phản bội', 'hate_speech', 3.0),

-- Violence (Bạo lực)
('đánh chết', 'violence', 4.0),
('giết', 'violence', 4.0),
('cho ăn đòn', 'violence', 3.0)

ON DUPLICATE KEY UPDATE severity=VALUES(severity);

-- ============================================
-- Table: moderation_log
-- Purpose: Lưu lịch sử moderation actions
-- ============================================
CREATE TABLE IF NOT EXISTS moderation_log (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    comment_id VARCHAR(100) NOT NULL,
    action ENUM('hide', 'delete', 'restore', 'manual_review') NOT NULL,
    reason VARCHAR(255),
    performed_by VARCHAR(50) DEFAULT 'system',
    performed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    success BOOLEAN DEFAULT TRUE,
    error_message TEXT,
    INDEX idx_comment_id (comment_id),
    INDEX idx_action (action),
    INDEX idx_performed_at (performed_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- Add page_id to facebook_posts for filtering
-- ============================================
ALTER TABLE facebook_comments
ADD COLUMN is_from_page BOOLEAN DEFAULT FALSE AFTER from_name,
ADD INDEX idx_is_from_page (is_from_page);

-- ============================================
-- Views for Moderation Dashboard
-- ============================================

-- Toxic comments summary
CREATE OR REPLACE VIEW toxic_comments_summary AS
SELECT 
    ca.toxic_category,
    COUNT(*) as total_count,
    COUNT(CASE WHEN ca.moderation_action = 'delete' THEN 1 END) as deleted_count,
    COUNT(CASE WHEN ca.moderation_action = 'hide' THEN 1 END) as hidden_count,
    AVG(ca.toxic_score) as avg_toxic_score
FROM comment_analysis ca
WHERE ca.is_toxic = TRUE
GROUP BY ca.toxic_category;

-- Recent toxic comments
CREATE OR REPLACE VIEW recent_toxic_comments AS
SELECT 
    fc.comment_id,
    fc.from_name,
    fc.message,
    fc.created_time,
    ca.toxic_category,
    ca.toxic_score,
    ca.moderation_action,
    ca.moderated_at
FROM facebook_comments fc
JOIN comment_analysis ca ON fc.comment_id = ca.comment_id
WHERE ca.is_toxic = TRUE
ORDER BY fc.created_time DESC
LIMIT 100;

-- Moderation statistics
CREATE OR REPLACE VIEW moderation_statistics AS
SELECT 
    DATE(performed_at) as date,
    action,
    COUNT(*) as count,
    COUNT(CASE WHEN success = TRUE THEN 1 END) as success_count,
    COUNT(CASE WHEN success = FALSE THEN 1 END) as failed_count
FROM moderation_log
WHERE performed_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
GROUP BY DATE(performed_at), action
ORDER BY date DESC;

-- ============================================
-- Stored Procedures for Moderation
-- ============================================

DELIMITER //

-- Get toxic comments needing review
CREATE PROCEDURE IF NOT EXISTS GetToxicCommentsForReview(IN min_severity DECIMAL(2,1))
BEGIN
    SELECT 
        fc.comment_id,
        fc.from_id,
        fc.from_name,
        fc.message,
        ca.toxic_category,
        ca.toxic_score,
        ca.moderation_action,
        fc.created_time
    FROM facebook_comments fc
    JOIN comment_analysis ca ON fc.comment_id = ca.comment_id
    WHERE ca.is_toxic = TRUE
    AND ca.toxic_score >= min_severity
    AND ca.moderation_action IN ('none', 'manual_review')
    ORDER BY ca.toxic_score DESC, fc.created_time DESC;
END //

-- Mark comment as moderated
CREATE PROCEDURE IF NOT EXISTS MarkCommentModerated(
    IN comment_id_param VARCHAR(100),
    IN action_param VARCHAR(20)
)
BEGIN
    UPDATE comment_analysis
    SET moderation_action = action_param,
        moderated_at = NOW()
    WHERE comment_id = comment_id_param;
    
    SELECT ROW_COUNT() as affected_rows;
END //

DELIMITER ;

-- ============================================
-- Migration complete
-- ============================================
SELECT 'Toxic Detection Schema Updated Successfully!' as Status;

