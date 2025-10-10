const db = require('../config/database');
const TextProcessingService = require('./TextProcessingService');

class ToxicDetectionService {
  // Detect toxic content
  static async detectToxic(text) {
    try {
      const cleanedText = TextProcessingService.cleanText(text);
      
      // Load toxic keywords từ database
      const sql = 'SELECT keyword, category, severity FROM toxic_keywords WHERE is_active = TRUE';
      const keywords = await db.query(sql);

      let toxicScore = 0;
      let toxicCategories = new Set();
      let matchedKeywords = [];
      let maxSeverity = 0;

      const lowerText = cleanedText.toLowerCase();

      // Check each toxic keyword
      keywords.forEach(kw => {
        if (lowerText.includes(kw.keyword.toLowerCase())) {
          matchedKeywords.push(kw.keyword);
          toxicCategories.add(kw.category);
          toxicScore += parseFloat(kw.severity);
          maxSeverity = Math.max(maxSeverity, parseFloat(kw.severity));
        }
      });

      const isToxic = toxicScore > 0;
      const normalizedScore = Math.min(toxicScore / 10, 1); // Normalize to 0-1

      // Determine primary category (highest severity)
      let primaryCategory = null;
      if (toxicCategories.size > 0) {
        const categoryArray = Array.from(toxicCategories);
        primaryCategory = categoryArray[0]; // First matched category
      }

      // Determine moderation action based on severity
      let moderationAction = 'none';
      if (maxSeverity >= 4.0) {
        // Very toxic → Delete
        moderationAction = 'delete';
      } else if (maxSeverity >= 2.5) {
        // Moderately toxic → Hide
        moderationAction = 'hide';
      } else if (maxSeverity >= 1.5) {
        // Potentially toxic → Manual review
        moderationAction = 'manual_review';
      }

      return {
        isToxic: isToxic,
        toxicScore: parseFloat(normalizedScore.toFixed(2)),
        toxicCategory: primaryCategory,
        matchedKeywords: matchedKeywords,
        moderationAction: moderationAction,
        severity: maxSeverity
      };

    } catch (error) {
      console.error('Error detecting toxic:', error.message);
      return {
        isToxic: false,
        toxicScore: 0,
        toxicCategory: null,
        matchedKeywords: [],
        moderationAction: 'none',
        severity: 0
      };
    }
  }

  // Save toxic analysis
  static async saveToxicAnalysis(commentId, toxicResult) {
    try {
      const sql = `
        UPDATE comment_analysis
        SET is_toxic = ?,
            toxic_category = ?,
            toxic_score = ?,
            moderation_action = ?
        WHERE comment_id = ?
      `;

      await db.query(sql, [
        toxicResult.isToxic,
        toxicResult.toxicCategory,
        toxicResult.toxicScore,
        toxicResult.moderationAction,
        commentId
      ]);

      return { success: true };

    } catch (error) {
      console.error('Error saving toxic analysis:', error.message);
      return { success: false, error: error.message };
    }
  }

  // Get toxic comments for moderation
  static async getToxicCommentsForReview(minSeverity = 2.0) {
    try {
      const sql = `
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
        AND ca.toxic_score >= ?
        AND ca.moderation_action IN ('none', 'manual_review')
        ORDER BY ca.toxic_score DESC, fc.created_time DESC
        LIMIT 50
      `;

      const results = await db.query(sql, [minSeverity / 5]); // Normalize severity

      return {
        success: true,
        data: results,
        count: results.length
      };

    } catch (error) {
      console.error('Error getting toxic comments:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Get moderation statistics
  static async getModerationStats(days = 7) {
    try {
      const sql = `
        SELECT 
          COUNT(*) as total_toxic,
          COUNT(CASE WHEN moderation_action = 'delete' THEN 1 END) as deleted,
          COUNT(CASE WHEN moderation_action = 'hide' THEN 1 END) as hidden,
          COUNT(CASE WHEN moderation_action = 'manual_review' THEN 1 END) as pending_review,
          COUNT(CASE WHEN toxic_category = 'profanity' THEN 1 END) as profanity_count,
          COUNT(CASE WHEN toxic_category = 'hate_speech' THEN 1 END) as hate_speech_count,
          COUNT(CASE WHEN toxic_category = 'insult' THEN 1 END) as insult_count,
          COUNT(CASE WHEN toxic_category = 'violence' THEN 1 END) as violence_count,
          AVG(toxic_score) as avg_toxic_score
        FROM comment_analysis
        WHERE is_toxic = TRUE
        AND analyzed_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
      `;

      const result = await db.query(sql, [days]);

      return {
        success: true,
        data: result[0] || {},
        period: `${days} days`
      };

    } catch (error) {
      console.error('Error getting moderation stats:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = ToxicDetectionService;

