const Comment = require('../models/Comment');
const ChatHistory = require('../models/ChatHistory');
const AIPrompt = require('../models/AIPrompt');
const { generateResponse } = require('../config/gemini');
const Logger = require('../utils/logger');
const SentimentAnalysisService = require('./SentimentAnalysisService');

class CommentService {
  // Process new comments from Facebook
  static async processComments(commentsData, sessionId) {
    try {
      const results = {
        processed: [],
        skipped: [],
        errors: []
      };

      for (const comment of commentsData) {
        try {
          // Check if already handled
          const isHandled = await Comment.isHandled(comment.comment_id);
          
          if (isHandled) {
            results.skipped.push({
              comment_id: comment.comment_id,
              reason: 'Already handled'
            });
            continue;
          }

          // Save comment to database
          await Comment.saveComment({
            comment_id: comment.comment_id,
            post_id: comment.post_id,
            parent_comment_id: comment.parent_comment_id || null,
            from_id: comment.from_id,
            from_name: comment.from_name,
            message: comment.message,
            created_time: comment.created_time,
            comment_level: comment.comment_level || 1
          });

          // 🔥 NEW: Process comment with sentiment analysis
          const processingResult = await SentimentAnalysisService.processComment(
            comment.comment_id,
            comment.message
          );

          // Skip if spam or duplicate
          if (!processingResult.shouldReply) {
            let reason = 'Unknown';
            if (processingResult.isToxic) {
              reason = `Toxic detected (${processingResult.analysis?.toxicCategory})`;
            } else if (processingResult.isSpam) {
              reason = 'Spam detected';
            } else if (processingResult.isDuplicate) {
              reason = 'Duplicate comment';
            }
            
            results.skipped.push({
              comment_id: comment.comment_id,
              reason: reason,
              moderation_action: processingResult.moderationAction || 'none',
              is_toxic: processingResult.isToxic || false,
              is_spam: processingResult.isSpam || false,
              is_duplicate: processingResult.isDuplicate || false,
              analysis: processingResult.analysis
            });
            continue;
          }

          // Generate AI response (only for clean comments)
          const aiResult = await this.generateAIResponse(
            comment.message,
            comment.from_name,
            comment.from_id,
            comment.post_id,
            sessionId
          );

          if (aiResult.success) {
            results.processed.push({
              comment_id: comment.comment_id,
              from_name: comment.from_name,
              message: comment.message,
              ai_response: aiResult.response,
              session_id: sessionId,
              sentiment: processingResult.analysis?.sentiment,
              sentiment_score: processingResult.analysis?.sentimentScore
            });
          } else {
            results.errors.push({
              comment_id: comment.comment_id,
              error: aiResult.error
            });
          }

        } catch (error) {
          results.errors.push({
            comment_id: comment.comment_id,
            error: error.message
          });
          Logger.error('Comment processing error', { comment, error: error.message });
        }
      }

      return {
        success: true,
        data: results,
        summary: {
          total: commentsData.length,
          processed: results.processed.length,
          skipped: results.skipped.length,
          errors: results.errors.length
        }
      };

    } catch (error) {
      Logger.error('ProcessComments error', { error: error.message });
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Generate AI response with context
  static async generateAIResponse(userMessage, userName, userId, postId, sessionId, workflowData = {}) {
    try {
      // Get post content for context
      const postContent = await Comment.getPostContent(postId);

      // Prepare template data
      const templateData = {
        content: postContent,
        message: userMessage,
        user_name: userName,
        user_id: userId,
        post_id: postId,
        session_id: sessionId,
        ...workflowData // Include any additional workflow data
      };

      // Get processed system prompt with template data
      const systemPrompt = await AIPrompt.getProcessedPrompt('default_watch_sales', templateData);
      
      // Debug logging
      console.log('🔍 Template Data:', JSON.stringify(templateData, null, 2));
      console.log('🔍 Processed System Prompt:', systemPrompt);

      // Get chat history
      const history = await ChatHistory.getHistory(sessionId, 20);

      // Build context message
      let contextMessage = userMessage;
      if (postContent) {
        contextMessage = `Nội dung bài viết: ${postContent}\n\nTin nhắn từ ${userName}: ${userMessage}`;
      }

      // Generate response
      const aiResult = await generateResponse(contextMessage, systemPrompt, history);

      if (!aiResult.success) {
        throw new Error(aiResult.error);
      }

      // Save to chat history
      await ChatHistory.saveChat({
        session_id: sessionId,
        user_id: userId,
        user_name: userName,
        user_message: userMessage,
        ai_response: aiResult.response,
        context_data: { post_id: postId, post_content: postContent }
      });

      return {
        success: true,
        response: aiResult.response,
        error: null
      };

    } catch (error) {
      Logger.error('AI Response generation error', { error: error.message });
      return {
        success: false,
        response: null,
        error: error.message
      };
    }
  }

  // Mark comments as handled after reply
  static async markCommentsHandled(handledData) {
    try {
      const results = [];

      for (const item of handledData) {
        try {
          await Comment.markAsHandled(
            item.comment_id,
            item.reply_id || null,
            item.ai_response,
            item.session_id
          );

          results.push({
            comment_id: item.comment_id,
            status: 'success'
          });
        } catch (error) {
          results.push({
            comment_id: item.comment_id,
            status: 'error',
            error: error.message
          });
        }
      }

      return {
        success: true,
        data: results
      };

    } catch (error) {
      Logger.error('MarkCommentsHandled error', { error: error.message });
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Check if a single comment is handled
  static async checkSingleCommentHandled(commentId, sessionId) {
    try {
      const isHandled = await Comment.isHandled(commentId);
      
      return {
        success: true,
        comment_id: commentId,
        is_handled: isHandled,
        session_id: sessionId
      };

    } catch (error) {
      Logger.error('CheckSingleCommentHandled error', { error: error.message });
      return {
        success: false,
        comment_id: commentId,
        is_handled: false,
        error: error.message
      };
    }
  }

  // Check if comments are handled
  static async checkHandledStatus(commentIds) {
    try {
      const results = [];

      for (const commentId of commentIds) {
        const isHandled = await Comment.isHandled(commentId);
        results.push({
          comment_id: commentId,
          is_handled: isHandled
        });
      }

      return {
        success: true,
        data: results
      };

    } catch (error) {
      Logger.error('CheckHandledStatus error', { error: error.message });
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Get unhandled comments
  static async getUnhandledComments(limit = 100) {
    try {
      const comments = await Comment.getUnhandledComments(limit);

      return {
        success: true,
        data: comments,
        count: comments.length
      };

    } catch (error) {
      Logger.error('GetUnhandledComments error', { error: error.message });
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Save Facebook posts
  static async savePosts(postsData) {
    try {
      const results = [];

      for (const post of postsData) {
        try {
          await Comment.savePost({
            post_id: post.post_id || post.id,
            page_id: post.page_id,
            content: post.content || post.message || '',
            created_time: post.created_time
          });

          results.push({
            post_id: post.post_id || post.id,
            status: 'success'
          });
        } catch (error) {
          results.push({
            post_id: post.post_id || post.id,
            status: 'error',
            error: error.message
          });
        }
      }

      return {
        success: true,
        data: results
      };

    } catch (error) {
      Logger.error('SavePosts error', { error: error.message });
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = CommentService;

