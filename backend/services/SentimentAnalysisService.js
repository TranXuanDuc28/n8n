const db = require('../config/database');
const TextProcessingService = require('./TextProcessingService');
const ToxicDetectionService = require('./ToxicDetectionService');
const ModerationService = require('./ModerationService');

class SentimentAnalysisService {
  // Analyze sentiment using keyword-based approach
  static async analyzeSentiment(text) {
    try {
      const cleanedText = TextProcessingService.cleanText(text);
      
      // Load sentiment keywords từ database
      const sql = 'SELECT keyword, sentiment, weight FROM sentiment_keywords';
      const keywords = await db.query(sql);

      let positiveScore = 0;
      let negativeScore = 0;
      let matchedKeywords = [];

      const lowerText = cleanedText.toLowerCase();

      // Calculate sentiment scores
      keywords.forEach(kw => {
        if (lowerText.includes(kw.keyword.toLowerCase())) {
          matchedKeywords.push(kw.keyword);
          
          if (kw.sentiment === 'positive') {
            positiveScore += parseFloat(kw.weight);
          } else if (kw.sentiment === 'negative') {
            negativeScore += parseFloat(kw.weight);
          }
        }
      });

      // Calculate final sentiment
      const totalScore = positiveScore - negativeScore;
      let sentiment = 'neutral';
      let sentimentScore = 0;
      let confidence = 0.5;

      if (totalScore > 1) {
        sentiment = 'positive';
        sentimentScore = Math.min(totalScore / 10, 1);
        confidence = Math.min(0.5 + (totalScore / 20), 1);
      } else if (totalScore < -1) {
        sentiment = 'negative';
        sentimentScore = Math.max(totalScore / 10, -1);
        confidence = Math.min(0.5 + (Math.abs(totalScore) / 20), 1);
      } else if (Math.abs(totalScore) > 0) {
        sentiment = 'mixed';
        sentimentScore = totalScore / 10;
        confidence = 0.6;
      }

      // Extract keywords from text
      const textKeywords = TextProcessingService.extractKeywords(cleanedText);

      return {
        sentiment: sentiment,
        sentimentScore: parseFloat(sentimentScore.toFixed(2)),
        confidenceScore: parseFloat(confidence.toFixed(2)),
        keywords: textKeywords,
        matchedSentimentKeywords: matchedKeywords.slice(0, 5),
        positiveScore: positiveScore,
        negativeScore: negativeScore
      };

    } catch (error) {
      console.error('Error analyzing sentiment:', error.message);
      return {
        sentiment: 'neutral',
        sentimentScore: 0,
        confidenceScore: 0.5,
        keywords: [],
        matchedSentimentKeywords: [],
        positiveScore: 0,
        negativeScore: 0
      };
    }
  }

  // Save analysis to database
  static async saveAnalysis(commentId, originalMessage, analysis) {
    try {
      const cleanedMessage = TextProcessingService.cleanText(originalMessage);
      const metadata = TextProcessingService.getTextMetadata(originalMessage);
      const isSpam = await TextProcessingService.isSpam(originalMessage);
      const duplicateCheck = await TextProcessingService.isDuplicate(cleanedMessage, commentId);

      const sql = `
        INSERT INTO comment_analysis (
          comment_id,
          original_message,
          cleaned_message,
          is_spam,
          is_duplicate,
          duplicate_of,
          message_length,
          word_count,
          has_emoji,
          has_link,
          has_tag,
          language,
          sentiment,
          sentiment_score,
          confidence_score,
          keywords
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          cleaned_message = VALUES(cleaned_message),
          is_spam = VALUES(is_spam),
          is_duplicate = VALUES(is_duplicate),
          duplicate_of = VALUES(duplicate_of),
          sentiment = VALUES(sentiment),
          sentiment_score = VALUES(sentiment_score),
          confidence_score = VALUES(confidence_score),
          keywords = VALUES(keywords),
          analyzed_at = CURRENT_TIMESTAMP
      `;

      const keywordsJson = JSON.stringify(analysis.keywords);

      await db.query(sql, [
        commentId,
        originalMessage,
        cleanedMessage,
        isSpam,
        duplicateCheck.isDuplicate,
        duplicateCheck.duplicateOf,
        metadata.length,
        metadata.wordCount,
        metadata.hasEmoji,
        metadata.hasLink,
        metadata.hasTag,
        metadata.language,
        analysis.sentiment,
        analysis.sentimentScore,
        analysis.confidenceScore,
        keywordsJson
      ]);

      return {
        success: true,
        isSpam: isSpam,
        isDuplicate: duplicateCheck.isDuplicate
      };

    } catch (error) {
      console.error('Error saving analysis:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Process comment with full pipeline
  static async processComment(commentId, message, autoModerate = true) {
    try {
      // Step 1: Check toxic content
      const toxicResult = await ToxicDetectionService.detectToxic(message);
      
      if (toxicResult.isToxic) {
        await this.saveAnalysis(commentId, message, {
          sentiment: 'negative',
          sentimentScore: -toxicResult.toxicScore,
          confidenceScore: 0.9,
          keywords: toxicResult.matchedKeywords
        });

        // Save toxic analysis
        await ToxicDetectionService.saveToxicAnalysis(commentId, toxicResult);

        // Auto-moderate if enabled
        if (autoModerate && toxicResult.moderationAction !== 'none') {
          await ModerationService.autoModerate(commentId, toxicResult.moderationAction);
        }

        return {
          success: true,
          isToxic: true,
          isSpam: false,
          isDuplicate: false,
          shouldReply: false,
          moderationAction: toxicResult.moderationAction,
          analysis: {
            toxicCategory: toxicResult.toxicCategory,
            toxicScore: toxicResult.toxicScore
          }
        };
      }

      // Step 2: Check spam
      const isSpam = await TextProcessingService.isSpam(message);
      
      if (isSpam) {
        await this.saveAnalysis(commentId, message, {
          sentiment: 'neutral',
          sentimentScore: 0,
          confidenceScore: 0,
          keywords: []
        });

        // Auto-hide spam comments
        if (autoModerate) {
          await ModerationService.hideComment(commentId);
        }

        return {
          success: true,
          isToxic: false,
          isSpam: true,
          isDuplicate: false,
          shouldReply: false,
          moderationAction: 'hide',
          analysis: null
        };
      }

      // Step 3: Check duplicate
      const cleanedMessage = TextProcessingService.cleanText(message);
      const duplicateCheck = await TextProcessingService.isDuplicate(cleanedMessage, commentId);

      if (duplicateCheck.isDuplicate) {
        await this.saveAnalysis(commentId, message, {
          sentiment: 'neutral',
          sentimentScore: 0,
          confidenceScore: 0,
          keywords: []
        });

        return {
          success: true,
          isToxic: false,
          isSpam: false,
          isDuplicate: true,
          duplicateOf: duplicateCheck.duplicateOf,
          shouldReply: false,
          moderationAction: 'none',
          analysis: null
        };
      }

      // Step 4: Analyze sentiment
      const analysis = await this.analyzeSentiment(message);

      // Step 5: Save to database
      await this.saveAnalysis(commentId, message, analysis);

      return {
        success: true,
        isToxic: false,
        isSpam: false,
        isDuplicate: false,
        shouldReply: true,
        moderationAction: 'none',
        analysis: {
          cleanedMessage: cleanedMessage,
          sentiment: analysis.sentiment,
          sentimentScore: analysis.sentimentScore,
          confidence: analysis.confidenceScore,
          keywords: analysis.keywords
        }
      };

    } catch (error) {
      console.error('Error processing comment:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Get analytics summary
  static async getAnalyticsSummary(days = 7) {
    try {
      const sql = `
        SELECT 
          COUNT(*) as total_comments,
          COUNT(CASE WHEN is_spam = TRUE THEN 1 END) as spam_count,
          COUNT(CASE WHEN is_duplicate = TRUE THEN 1 END) as duplicate_count,
          COUNT(CASE WHEN sentiment = 'positive' THEN 1 END) as positive_count,
          COUNT(CASE WHEN sentiment = 'negative' THEN 1 END) as negative_count,
          COUNT(CASE WHEN sentiment = 'neutral' THEN 1 END) as neutral_count,
          COUNT(CASE WHEN sentiment = 'mixed' THEN 1 END) as mixed_count,
          AVG(sentiment_score) as avg_sentiment_score,
          AVG(confidence_score) as avg_confidence
        FROM comment_analysis
        WHERE analyzed_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
      `;

      const result = await db.query(sql, [days]);
      
      return {
        success: true,
        data: result[0] || {},
        period: `${days} days`
      };

    } catch (error) {
      console.error('Error getting analytics:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Get sentiment trend
  static async getSentimentTrend(days = 30) {
    try {
      const sql = `
        SELECT 
          DATE(analyzed_at) as date,
          sentiment,
          COUNT(*) as count,
          AVG(sentiment_score) as avg_score
        FROM comment_analysis
        WHERE analyzed_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
        GROUP BY DATE(analyzed_at), sentiment
        ORDER BY date DESC, sentiment
      `;

      const results = await db.query(sql, [days]);
      
      return {
        success: true,
        data: results,
        period: `${days} days`
      };

    } catch (error) {
      console.error('Error getting trend:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Get top keywords
  static async getTopKeywords(sentiment = null, limit = 20) {
    try {
      let sql = `
        SELECT 
          keywords,
          sentiment,
          COUNT(*) as frequency
        FROM comment_analysis
        WHERE keywords IS NOT NULL
          AND analyzed_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
      `;

      const params = [];

      if (sentiment) {
        sql += ` AND sentiment = ?`;
        params.push(sentiment);
      }

      sql += ` GROUP BY keywords, sentiment ORDER BY frequency DESC LIMIT ?`;
      params.push(limit);

      const results = await db.query(sql, params);

      // Flatten keywords
      const keywordMap = {};
      results.forEach(row => {
        try {
          const keywords = JSON.parse(row.keywords);
          keywords.forEach(keyword => {
            if (!keywordMap[keyword]) {
              keywordMap[keyword] = {
                keyword: keyword,
                frequency: 0,
                sentiments: {}
              };
            }
            keywordMap[keyword].frequency += row.frequency;
            keywordMap[keyword].sentiments[row.sentiment] = (keywordMap[keyword].sentiments[row.sentiment] || 0) + row.frequency;
          });
        } catch (e) {
          // Skip invalid JSON
        }
      });

      const topKeywords = Object.values(keywordMap)
        .sort((a, b) => b.frequency - a.frequency)
        .slice(0, limit);

      return {
        success: true,
        data: topKeywords
      };

    } catch (error) {
      console.error('Error getting keywords:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = SentimentAnalysisService;

