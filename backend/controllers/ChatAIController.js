const ChatAIService = require('../services/ChatAIService');
const Logger = require('../utils/logger');

class ChatAIController {
  constructor() {
    this.chatAIService = new ChatAIService();
    this.logger = Logger;
  }

  /**
   * AI Reply endpoint for Messenger integration (RAG-powered)
   */
  async aiReply(req, res) {
    const startTime = Date.now();
    
    try {
      // Extract data from request body (support multiple field names)
      const { senderId, message, messageText, text, conversationId } = req.body;
      const userMessage = message || messageText || text;

      this.logger.info('🤖 ChatAI Reply Request (RAG)', {
        senderId: senderId ? `***${senderId.slice(-4)}` : 'missing',
        messageLength: userMessage?.length || 0,
        conversationId,
        requestBody: JSON.stringify(req.body)
      });

      // Input validation
      if (!senderId) {
        return res.status(400).json({
          success: false,
          error: 'Missing required field: senderId',
          receivedFields: Object.keys(req.body)
        });
      }

      if (!userMessage || userMessage.trim().length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Missing required field: message (can be message, messageText, or text)',
          receivedFields: Object.keys(req.body),
          expectedFields: ['senderId', 'message/messageText/text']
        });
      }

      // 1. Get or create user
      let user;
      try {
        user = await this.chatAIService.getOrCreateUser(senderId);
        this.logger.debug('👤 User processed', { userId: user.id, senderId: `***${senderId.slice(-4)}` });
      } catch (error) {
        this.logger.error('❌ User processing failed', { error: error.message, senderId });
        return res.status(500).json({
          success: false,
          error: 'Failed to process user',
          details: error.message
        });
      }

      // 2. Save incoming message
      await this.chatAIService.saveMessage(user.id, userMessage, 'received', null, conversationId);
      this.logger.debug('📝 Incoming message saved');

      // 3. Get conversation history
      const conversationHistory = await this.chatAIService.getConversationHistory(user.id, 5);
      this.logger.debug(`📚 Retrieved ${conversationHistory.length} conversation history items`);

      // 4. Generate AI response with RAG (NO need to call getAllResponses manually)
      let aiResponseData;
      try {
        // RAG tự động retrieve relevant documents, không cần truyền databaseResponses
        aiResponseData = await this.chatAIService.generateAIResponse(
          userMessage, 
          conversationHistory
        );
        
        const respLen = aiResponseData.response?.length || 0;
        this.logger.info('✅ RAG-powered AI response generated', { 
          responseLength: respLen,
          relevantDocsCount: aiResponseData.relevantDocs?.length || 0,
          usedRAG: aiResponseData.usedRAG,
          topRelevance: aiResponseData.relevantDocs?.[0]?.similarity || 0
        });
      } catch (error) {
        this.logger.error('❌ RAG AI generation failed', { error: error.message });
        aiResponseData = { 
          response: 'Xin lỗi, tôi đang gặp sự cố kỹ thuật. Vui lòng thử lại sau hoặc liên hệ trực tiếp với chúng tôi qua số điện thoại. 😊',
          usedRAG: false,
          relevantDocs: []
        };
      }

      // 5. Save AI response
      const textToSave = aiResponseData.response || '';
      await this.chatAIService.saveMessage(user.id, textToSave, 'sent', null, conversationId);
      this.logger.debug('💾 AI response saved');

      // 6. Log analytics with RAG metadata
      const processingTime = Date.now() - startTime;
      await this.chatAIService.logAnalytics(user.id, 'message_processed', {
        message_text: userMessage,
        ai_response: aiResponseData.response,
        processing_time: processingTime,
        conversation_history_count: conversationHistory.length,
        rag_enabled: aiResponseData.usedRAG,
        relevant_docs_count: aiResponseData.relevantDocs?.length || 0,
        relevant_docs: aiResponseData.relevantDocs || [],
        timestamp: new Date()
      });

      this.logger.info('🎯 ChatAI Reply completed (RAG)', {
        processingTime: `${processingTime}ms`,
        responseLength: textToSave.length,
        userId: user.id,
        ragUsed: aiResponseData.usedRAG
      });

      // Return response for external systems (n8n, etc.)
      res.json({
        success: true,
        response: aiResponseData.response,
        metadata: {
          processingTime,
          userId: user.id,
          conversationHistoryCount: conversationHistory.length,
          rag: {
            enabled: aiResponseData.usedRAG,
            relevantDocsCount: aiResponseData.relevantDocs?.length || 0,
            relevantDocs: aiResponseData.relevantDocs || [],
            topRelevance: aiResponseData.relevantDocs?.[0]?.similarity || 0
          },
          service: 'chatai-rag'
        }
      });

    } catch (error) {
      const processingTime = Date.now() - startTime;
      this.logger.error('🔥 ChatAI Reply failed', { 
        error: error.message, 
        stack: error.stack,
        processingTime: `${processingTime}ms`
      });

      res.status(500).json({
        success: false,
        error: error.message,
        response: 'Xin lỗi, có lỗi xảy ra. Vui lòng thử lại sau.',
        metadata: {
          processingTime,
          service: 'chatai-rag',
          errorType: 'server_error'
        }
      });
    }
  }

  /**
   * Get ChatAI users
   */
  async getUsers(req, res) {
    try {
      const { limit = 50, offset = 0 } = req.query;
      
      const { ChatAIUser } = require('../models');
      const users = await ChatAIUser.findAll({
        limit: parseInt(limit),
        offset: parseInt(offset),
        order: [['created_at', 'DESC']],
        include: [{
          model: require('../models').ChatAIConversation,
          as: 'conversations',
          limit: 1,
          order: [['timestamp', 'DESC']]
        }]
      });

      res.json({
        success: true,
        users,
        pagination: {
          limit: parseInt(limit),
          offset: parseInt(offset),
          total: users.length
        }
      });
    } catch (error) {
      this.logger.error('Error getting ChatAI users', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Failed to get users'
      });
    }
  }

  /**
   * Get conversation history for a user
   */
  async getUserConversations(req, res) {
    try {
      const { userId } = req.params;
      const { limit = 20 } = req.query;
      console.log("userId",userId);

      
      const conversations = await this.chatAIService.getConversationHistory(userId, parseInt(limit));
      
      res.json({
        success: true,
        conversations,
        userId
      });
    } catch (error) {
      this.logger.error('Error getting user conversations', { error: error.message, userId: req.params.userId });
      res.status(500).json({
        success: false,
        error: 'Failed to get conversations'
      });
    }
  }

  /**
   * Get ChatAI responses (legacy - for backward compatibility)
   */
  async getResponses(req, res) {
    try {
      const { ChatAIResponse } = require('../models');
      const responses = await ChatAIResponse.findAll({
        where: { is_active: true },
        order: [['created_at', 'DESC']]
      });
      
      res.json({
        success: true,
        responses,
        note: 'This endpoint returns static responses only. RAG system automatically retrieves relevant content.'
      });
    } catch (error) {
      this.logger.error('Error getting ChatAI responses', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Failed to get responses'
      });
    }
  }

  /**
   * Add new response
   */
  async addResponse(req, res) {
    try {
      const { keyword, response_text, category } = req.body;
      
      if (!keyword || !response_text) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: keyword and response_text'
        });
      }

      const { ChatAIResponse } = require('../models');
      const response = await ChatAIResponse.create({
        keyword,
        response_text,
        category: category || 'general',
        is_active: true
      });
      
      // Invalidate vector cache to rebuild with new response
      this.chatAIService.vectorCache.lastUpdate = null;
      this.logger.info('Vector cache invalidated after adding new response');
      
      res.json({
        success: true,
        id: response.id,
        message: 'Response added successfully. Vector database will rebuild on next query.',
        note: 'RAG system will automatically include this response in future searches.'
      });
    } catch (error) {
      this.logger.error('Error adding ChatAI response', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Failed to add response'
      });
    }
  }

  /**
   * Get analytics
   */
  async getAnalytics(req, res) {
    try {
      const { start_date, end_date } = req.query;
      
      const startDate = start_date ? new Date(start_date) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const endDate = end_date ? new Date(end_date) : new Date();
      
      const analytics = await this.chatAIService.getAnalytics(startDate, endDate);
      
      res.json({
        success: true,
        analytics,
        period: {
          start: startDate,
          end: endDate
        }
      });
    } catch (error) {
      this.logger.error('Error getting ChatAI analytics', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Failed to get analytics'
      });
    }
  }

  /**
   * Get service statistics (including RAG stats)
   */
  async getStats(req, res) {
    try {
      const stats = await this.chatAIService.getStats();
      
      res.json({
        success: true,
        stats,
        service: 'chatai-rag',
        features: {
          rag_enabled: stats.rag_enabled,
          semantic_search: stats.embedding_available,
          vector_database: stats.vector_cache
        }
      });
    } catch (error) {
      this.logger.error('Error getting ChatAI stats', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Failed to get stats'
      });
    }
  }

  /**
   * Test AI service with RAG
   */
  async testAI(req, res) {
    try {
      const { message = 'Hello, test message' } = req.body;
      
      const testResponse = await this.chatAIService.generateAIResponse(message, []);
      
      res.json({
        success: true,
        testMessage: message,
        aiResponse: testResponse.response,
        ragMetadata: {
          usedRAG: testResponse.usedRAG,
          relevantDocsCount: testResponse.relevantDocs?.length || 0,
          relevantDocs: testResponse.relevantDocs || []
        },
        service: 'chatai-rag'
      });
    } catch (error) {
      this.logger.error('Error testing ChatAI', { error: error.message });
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Refresh vector database (RAG)
   */
  async refreshVectorDatabase(req, res) {
    try {
      this.logger.info('🔄 Manual vector database refresh requested');
      
      const result = await this.chatAIService.refreshVectorDatabase();
      
      res.json({
        success: true,
        message: 'Vector database refreshed successfully',
        data: result
      });
    } catch (error) {
      this.logger.error('Error refreshing vector database', { error: error.message });
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Get vector database info
   */
  async getVectorDatabaseInfo(req, res) {
    try {
      const cache = this.chatAIService.vectorCache;
      
      res.json({
        success: true,
        data: {
          posts: {
            count: cache.posts.length,
            sample: cache.posts.slice(0, 3).map(p => ({
              id: p.id,
              title: p.title,
              engagementScore: p.engagementScore,
              publishedAt: p.publishedAt
            }))
          },
          responses: {
            count: cache.responses.length,
            sample: cache.responses.slice(0, 3).map(r => ({
              id: r.id,
              keyword: r.keyword,
              category: r.category
            }))
          },
          abTests: {
            count: cache.abTests.length,
            sample: cache.abTests.slice(0, 3).map(t => ({
              id: t.id,
              testType: t.testType,
              bestScore: t.bestScore,
              completedAt: t.completedAt
            }))
          },
          cache: {
            lastUpdate: cache.lastUpdate ? new Date(cache.lastUpdate) : null,
            isValid: cache.lastUpdate && (Date.now() - cache.lastUpdate) < this.chatAIService.ragConfig.cacheExpiry,
            expiresIn: cache.lastUpdate ? Math.max(0, this.chatAIService.ragConfig.cacheExpiry - (Date.now() - cache.lastUpdate)) : 0
          }
        }
      });
    } catch (error) {
      this.logger.error('Error getting vector database info', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Failed to get vector database info'
      });
    }
  }

  /**
   * Search similar documents (for debugging/testing RAG)
   */
  async searchSimilarDocuments(req, res) {
    try {
      const { query, topK } = req.body;
      
      if (!query) {
        return res.status(400).json({
          success: false,
          error: 'Missing required field: query'
        });
      }

      // Override topK if provided
      const originalTopK = this.chatAIService.ragConfig.topK;
      if (topK) {
        this.chatAIService.ragConfig.topK = parseInt(topK);
      }

      const relevantDocs = await this.chatAIService.retrieveRelevantDocuments(query);
      
      // Restore original topK
      this.chatAIService.ragConfig.topK = originalTopK;

      res.json({
        success: true,
        query,
        results: relevantDocs.map(doc => ({
          type: doc.type,
          id: doc.id,
          title: doc.title || doc.keyword || doc.testType,
          similarity: doc.similarity,
          snippet: doc.type === 'post' 
            ? doc.content?.substring(0, 200) 
            : doc.type === 'response'
            ? doc.responseText?.substring(0, 200)
            : doc.summary
        })),
        count: relevantDocs.length
      });
    } catch (error) {
      this.logger.error('Error searching similar documents', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Failed to search documents'
      });
    }
  }

  /**
   * Legacy: Refresh dynamic content (redirects to refresh vector database)
   */
  async refreshDynamicContent(req, res) {
    this.logger.info('Legacy refreshDynamicContent called, redirecting to refreshVectorDatabase');
    return this.refreshVectorDatabase(req, res);
  }

  /**
   * Get posts for dynamic content analysis
   */
  async getPostsForAnalysis(req, res) {
    try {
      const { limit = 20, days = 30 } = req.query;
      
      const { Post, PlatformPost, Engagement } = require('../models');
      const posts = await Post.findAll({
        where: {
          status: 'published',
          published_at: {
            [require('sequelize').Op.gte]: new Date(Date.now() - days * 24 * 60 * 60 * 1000)
          }
        },
        include: [
          {
            model: PlatformPost,
            as: 'platformPosts',
            required: false
          },
          {
            model: Engagement,
            as: 'engagements',
            required: false
          }
        ],
        order: [['published_at', 'DESC']],
        limit: parseInt(limit)
      });
      
      res.json({
        success: true,
        data: {
          posts: posts,
          count: posts.length,
          limit: parseInt(limit),
          days: parseInt(days)
        },
        note: 'These posts are automatically indexed in the RAG vector database'
      });
    } catch (error) {
      this.logger.error('Error getting posts for analysis', { error: error.message });
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }
}

module.exports = ChatAIController;