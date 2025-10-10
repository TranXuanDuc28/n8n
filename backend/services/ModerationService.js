const axios = require('axios');
const db = require('../config/database');
const Logger = require('../utils/logger');

class ModerationService {
  // Hide comment on Facebook
  static async hideComment(commentId) {
    try {
      const accessToken = process.env.FACEBOOK_ACCESS_TOKEN;
      
      const url = `https://graph.facebook.com/v23.0/${commentId}`;
      const response = await axios.post(url, {
        is_hidden: true
      }, {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });

      // Log moderation action
      await this.logModeration(commentId, 'hide', 'Spam detected', true);

      Logger.info('Comment hidden', { comment_id: commentId });

      return {
        success: true,
        message: 'Comment hidden successfully'
      };

    } catch (error) {
      await this.logModeration(commentId, 'hide', 'Spam detected', false, error.message);
      
      Logger.error('Failed to hide comment', { 
        comment_id: commentId, 
        error: error.message 
      });

      return {
        success: false,
        error: error.message
      };
    }
  }

  // Delete comment on Facebook
  static async deleteComment(commentId) {
    try {
      const accessToken = process.env.FACEBOOK_ACCESS_TOKEN;
      
      const url = `https://graph.facebook.com/v23.0/${commentId}`;
      const response = await axios.delete(url, {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });

      // Log moderation action
      await this.logModeration(commentId, 'delete', 'Toxic content detected', true);

      Logger.info('Comment deleted', { comment_id: commentId });

      return {
        success: true,
        message: 'Comment deleted successfully'
      };

    } catch (error) {
      await this.logModeration(commentId, 'delete', 'Toxic content detected', false, error.message);
      
      Logger.error('Failed to delete comment', { 
        comment_id: commentId, 
        error: error.message 
      });

      return {
        success: false,
        error: error.message
      };
    }
  }

  // Restore (unhide) comment
  static async restoreComment(commentId) {
    try {
      const accessToken = process.env.FACEBOOK_ACCESS_TOKEN;
      
      const url = `https://graph.facebook.com/v23.0/${commentId}`;
      const response = await axios.post(url, {
        is_hidden: false
      }, {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });

      await this.logModeration(commentId, 'restore', 'Manual restore', true);

      Logger.info('Comment restored', { comment_id: commentId });

      return {
        success: true,
        message: 'Comment restored successfully'
      };

    } catch (error) {
      await this.logModeration(commentId, 'restore', 'Manual restore', false, error.message);
      
      Logger.error('Failed to restore comment', { 
        comment_id: commentId, 
        error: error.message 
      });

      return {
        success: false,
        error: error.message
      };
    }
  }

  // Log moderation action
  static async logModeration(commentId, action, reason, success, errorMessage = null) {
    try {
      const sql = `
        INSERT INTO moderation_log 
        (comment_id, action, reason, success, error_message)
        VALUES (?, ?, ?, ?, ?)
      `;

      await db.query(sql, [commentId, action, reason, success, errorMessage]);

      // Update comment_analysis
      if (success) {
        const updateSql = `
          UPDATE comment_analysis
          SET moderation_action = ?,
              moderated_at = NOW()
          WHERE comment_id = ?
        `;
        await db.query(updateSql, [action, commentId]);
      }

    } catch (error) {
      console.error('Error logging moderation:', error.message);
    }
  }

  // Auto-moderate based on analysis
  static async autoModerate(commentId, moderationAction) {
    try {
      if (moderationAction === 'delete') {
        return await this.deleteComment(commentId);
      } else if (moderationAction === 'hide') {
        return await this.hideComment(commentId);
      } else {
        return {
          success: true,
          message: 'No action needed',
          action: moderationAction
        };
      }
    } catch (error) {
      Logger.error('Auto-moderation error', { 
        comment_id: commentId, 
        error: error.message 
      });
      
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Batch moderation
  static async batchModerate(comments) {
    const results = {
      success: [],
      failed: []
    };

    for (const comment of comments) {
      const result = await this.autoModerate(
        comment.comment_id, 
        comment.moderation_action
      );

      if (result.success) {
        results.success.push(comment.comment_id);
      } else {
        results.failed.push({
          comment_id: comment.comment_id,
          error: result.error
        });
      }

      // Rate limiting - wait 100ms between requests
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    return {
      success: true,
      data: results,
      summary: {
        total: comments.length,
        success_count: results.success.length,
        failed_count: results.failed.length
      }
    };
  }

  // Get moderation queue
  static async getModerationQueue() {
    try {
      const sql = `
        SELECT 
          fc.comment_id,
          fc.from_name,
          fc.message,
          ca.toxic_category,
          ca.toxic_score,
          ca.moderation_action,
          ca.is_spam,
          fc.created_time
        FROM facebook_comments fc
        JOIN comment_analysis ca ON fc.comment_id = ca.comment_id
        WHERE (ca.is_toxic = TRUE OR ca.is_spam = TRUE)
        AND ca.moderation_action IN ('delete', 'hide')
        AND ca.moderated_at IS NULL
        ORDER BY ca.toxic_score DESC, fc.created_time DESC
        LIMIT 100
      `;

      const results = await db.query(sql);

      return {
        success: true,
        data: results,
        count: results.length
      };

    } catch (error) {
      Logger.error('Error getting moderation queue', { error: error.message });
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = ModerationService;

