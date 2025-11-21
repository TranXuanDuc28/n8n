const { ChatAIUser, ChatAIConversation, ChatAIResponse, ChatAIAnalytics, Post, PlatformPost, Engagement, AbTest, AbTestVariant } = require('../models');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const Logger = require('../utils/logger');

class ChatAIService {
  constructor() {
    this.logger = Logger;
    this.gemini = process.env.GEMINI_API_KEY ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY) : null;
    this.model = this.gemini ? this.gemini.getGenerativeModel({ model: "gemini-2.5-flash" }) : null;
    this.embeddingModel = this.gemini ? this.gemini.getGenerativeModel({ model: "text-embedding-004" }) : null;
    
    // Cache cho vector embeddings
    this.vectorCache = {
      posts: [],
      responses: [],
      abTests: [],
      lastUpdate: null
    };
    
    // Cấu hình RAG
    this.ragConfig = {
      topK: 7, // Số lượng tài liệu liên quan nhất được trả về
      similarityThreshold: 0.5, // Ngưỡng độ tương đồng tối thiểu
      cacheExpiry: 3600000 // 1 giờ (ms)
    };
  }

  /**
   * Tính độ tương đồng cosine giữa 2 vectors
   */
  cosineSimilarity(vecA, vecB) {
    if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
    
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    
    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }
    
    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * Tạo embedding vector từ text sử dụng Gemini
   */
  async generateEmbedding(text) {
    if (!this.embeddingModel) {
      throw new Error('Embedding model not available');
    }

    try {
      const result = await this.embeddingModel.embedContent(text);
      return result.embedding.values;
    } catch (error) {
      this.logger.error('Error generating embedding', { error: error.message });
      throw error;
    }
  }

  /**
   * Xây dựng vector database từ các bài posts
   */
  async buildVectorDatabase() {
    try {
      const now = Date.now();
      
      // Kiểm tra cache còn hiệu lực không
      if (this.vectorCache.lastUpdate && 
          (now - this.vectorCache.lastUpdate) < this.ragConfig.cacheExpiry &&
          this.vectorCache.posts.length > 0) {
        this.logger.debug('Using cached vector database');
        return this.vectorCache;
      }

      this.logger.info('Building vector database...');

      // Lấy tất cả posts đã publish trong 30 ngày gần đây
      const recentPosts = await Post.findAll({
        where: {
          status: 'published',
          published_at: {
            [require('sequelize').Op.gte]: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000)
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
        limit: 100
      });

      // Lấy A/B Test insights
      const abTests = await AbTest.findAll({
        where: { status: 'completed' },
        include: [{
          model: AbTestVariant,
          as: 'variants'
        }],
        order: [['completedAt', 'DESC']],
        limit: 50
      });

      // Tạo embeddings cho từng post
      const postVectors = [];
      for (const post of recentPosts) {
        try {
          // Kết hợp title, content, và platform posts để tạo text đầy đủ
          let fullText = `${post.title || ''}\n${post.content || ''}`;
          
          if (post.platformPosts && Array.isArray(post.platformPosts)) {
            const platformTexts = post.platformPosts
              .map(pp => pp.content)
              .filter(Boolean)
              .join('\n');
            fullText += `\n${platformTexts}`;
          }

          // Trích xuất image URL
          let imageUrl = null;
          try {
            const media = post.media;
            if (media) {
              const m = typeof media === 'string' ? JSON.parse(media) : media;
              if (Array.isArray(m)) {
                const firstImg = m.find(item => typeof item === 'string' && /\.(png|jpe?g|webp|gif)$/i.test(item));
                if (firstImg) imageUrl = firstImg;
              } else if (typeof m === 'object') {
                if (m.url && typeof m.url === 'string') imageUrl = m.url;
                if (!imageUrl && Array.isArray(m.images)) {
                  const firstImg = m.images.find(u => typeof u === 'string');
                  if (firstImg) imageUrl = firstImg;
                }
              }
            }
          } catch (_) {}

          // Tạo embedding
          const embedding = await this.generateEmbedding(fullText);
          
          postVectors.push({
            id: post.id,
            title: post.title,
            content: post.content,
            fullText: fullText,
            embedding: embedding,
            engagementScore: this.calculateEngagementScore(post.engagements),
            publishedAt: post.published_at,
            campaign: post.campaign,
            imageUrl: imageUrl,
            metadata: {
              platformPostsCount: post.platformPosts ? post.platformPosts.length : 0,
              engagementsCount: post.engagements ? post.engagements.length : 0
            }
          });

          this.logger.debug('Created embedding for post', { 
            postId: post.id, 
            title: post.title,
            embeddingDim: embedding.length 
          });
        } catch (error) {
          this.logger.error('Error creating embedding for post', { 
            postId: post.id, 
            error: error.message 
          });
        }
      }

      // Lấy static responses từ database
      const staticResponses = await ChatAIResponse.findAll({
        where: { is_active: true },
        raw: true
      });

      const responseVectors = [];
      for (const response of staticResponses) {
        try {
          const embedding = await this.generateEmbedding(
            `${response.keyword} ${response.response_text}`
          );
          
          responseVectors.push({
            id: response.id,
            keyword: response.keyword,
            responseText: response.response_text,
            category: response.category,
            embedding: embedding
          });
        } catch (error) {
          this.logger.error('Error creating embedding for response', { 
            responseId: response.id, 
            error: error.message 
          });
        }
      }

      // Xử lý A/B Test insights và tạo embeddings
      const abTestVectors = [];
      for (const test of abTests) {
        try {
          const variants = Array.isArray(test.variants) ? test.variants : [];
          if (variants.length === 0) continue;

          // Tìm variant tốt nhất
          let bestVariant = null;
          let bestScore = -Infinity;
          for (const v of variants) {
            const m = v.metrics || {};
            const aggregate = (m.engagement || 0) + (m.likes || 0) + (m.comments || 0) + (m.shares || 0) + ((m.ctr || 0) * 100);
            if (aggregate > bestScore) {
              bestScore = aggregate;
              bestVariant = v;
            }
          }

          // Xây dựng text content cho A/B test
          const content = test.data.type +","+test.data.brand+","+test.data.style +","+test.data.message;
          const testSummary = `${content}. Kết quả cho thấy biến thể tốt nhất có engagement ${bestScore.toFixed(0)}, với ${variants.length} variants được test.`;
          
          let detailText = testSummary;
          if (bestVariant) {
            const metrics = bestVariant.metrics || {};
            detailText += ` Variant tốt nhất có: ${metrics.likes || 0} likes, ${metrics.comments || 0} comments, ${metrics.shares || 0} shares, CTR ${((metrics.ctr || 0) * 100).toFixed(2)}%.`;
          }

          // Tạo embedding cho A/B test insight
          const embedding = await this.generateEmbedding(detailText);
          //console.log("embedding",embedding);
          
          abTestVectors.push({
            id: test.id,
            testType: test.data.type ,
            summary: testSummary,
            detailText: detailText,
            bestVariant: bestVariant,
            bestScore: bestScore,
            variantsCount: variants.length,
            completedAt: test.completedAt,
            embedding: embedding,
            category: 'ab_test_insight'
          });

          this.logger.debug('Created embedding for A/B test', { 
            testId: test.id, 
            testType: test.data.type ,
            summary: testSummary,
            bestScore: bestScore,
            embeddingDim: embedding.length 
          });
        } catch (error) {
          this.logger.error('Error creating embedding for A/B test', { 
            testId: test.id, 
            error: error.message 
          });
        }
      }
      // console.log('Built abTestVectors:',abTestVectors)

      // Lưu vào cache
      this.vectorCache = {
        posts: postVectors,
        responses: responseVectors,
        abTests: abTestVectors,
        lastUpdate: now
      };

      this.logger.info('Vector database built successfully', {
        postsCount: postVectors.length,
        responsesCount: responseVectors.length,
        abTestsCount: abTestVectors.length,
        totalVectors: postVectors.length + responseVectors.length + abTestVectors.length
      });

      return this.vectorCache;
    } catch (error) {
      this.logger.error('Error building vector database', { error: error.message });
      throw error;
    }
  }

  /**
   * Tìm kiếm tài liệu liên quan nhất sử dụng RAG
   */
  async retrieveRelevantDocuments(query) {
    try {
      // Tạo embedding cho query
      const queryEmbedding = await this.generateEmbedding(query);
      
      // Lấy vector database
      const vectorDB = await this.buildVectorDatabase();
      
      // Tính độ tương đồng với tất cả posts
      const postScores = vectorDB.posts.map(post => ({
        ...post,
        similarity: this.cosineSimilarity(queryEmbedding, post.embedding),
        type: 'post'
      }));
      // Tính độ tương đồng với tất cả A/B test insights
      const abTestScores = vectorDB.abTests.map(abTest => ({
        ...abTest,
        similarity: this.cosineSimilarity(queryEmbedding, abTest.embedding),
        type: 'ab_test'
      }));

      // Tính độ tương đồng với tất cả responses
      const responseScores = vectorDB.responses.map(response => ({
        ...response,
        similarity: this.cosineSimilarity(queryEmbedding, response.embedding),
        type: 'response'
      }));

      
      //console.log('abTestScores:',abTestScores);

      // Kết hợp và sắp xếp theo độ tương đồng
      const threshold = this.ragConfig.similarityThreshold;
      const topK = this.ragConfig.topK;

      // Lọc theo threshold và sort riêng từng loại
      const postFiltered = postScores.filter(p => p.similarity >= threshold)
        .sort((a, b) => b.similarity - a.similarity);

      const abTestFiltered = abTestScores.filter(a => a.similarity >= threshold)
        .sort((a, b) => b.similarity - a.similarity);

      const responseFiltered = responseScores.filter(r => r.similarity >= threshold)
        .sort((a, b) => b.similarity - a.similarity);

      // Ưu tiên post và abTest
      let allScores = [...postFiltered, ...abTestFiltered];

      // Nếu chưa đủ topK, bổ sung từ responses
      if (allScores.length < topK) {
        const remaining = responseFiltered.slice(0, topK - allScores.length);
        allScores = [...allScores, ...remaining];
      }

      // Giữ đúng topK
      allScores = allScores.slice(0, topK);


      this.logger.debug('Retrieved relevant documents', {
        query: query.substring(0, 50),
        resultsCount: allScores.length,
        topSimilarity: allScores.length > 0 ? allScores[0].similarity : 0
      });

      return allScores;
    } catch (error) {
      this.logger.error('Error retrieving relevant documents', { error: error.message });
      return [];
    }
  }

  /**
   * Xây dựng context từ các tài liệu liên quan
   */
  buildRAGContext(relevantDocs) {
    if (!relevantDocs || relevantDocs.length === 0) {
      return '';
    }

    const contextParts = [];
    
    // Phân loại documents
    const posts = relevantDocs.filter(doc => doc.type === 'post');
    const responses = relevantDocs.filter(doc => doc.type === 'response');
    const abTests = relevantDocs.filter(doc => doc.type === 'ab_test');

    // Context từ posts
    if (posts.length > 0) {
      contextParts.push('📰 BÀI VIẾT LIÊN QUAN:');
      posts.forEach((post, idx) => {
        contextParts.push(
          `${idx + 1}. "${post.title}" (độ liên quan: ${(post.similarity * 100).toFixed(1)}%)`,
          `   Nội dung: ${post.content?.substring(0, 200) || post.fullText?.substring(0, 200)}...`,
          `   Engagement: ${post.engagementScore || 0} tương tác`
        );
      });
    }

    // Context từ responses
    if (responses.length > 0) {
      contextParts.push('\n💬 PHẢN HỒI MẪU LIÊN QUAN:');
      responses.forEach((resp, idx) => {
        contextParts.push(
          `${idx + 1}. Từ khóa: "${resp.keyword}" (độ liên quan: ${(resp.similarity * 100).toFixed(1)}%)`,
          `   Phản hồi: ${resp.responseText}`
        );
      });
    }

    // Context từ A/B test insights
    if (abTests.length > 0) {
      contextParts.push('\n🧪 KẾT QUẢ A/B TEST LIÊN QUAN:');
      abTests.forEach((test, idx) => {
        contextParts.push(
          `${idx + 1}. Test "${test.testType}" (độ liên quan: ${(test.similarity * 100).toFixed(1)}%)`,
          `   Kết quả: ${test.summary}`,
          `   Chi tiết: ${test.detailText}`
        );
        if (test.bestVariant) {
          const metrics = test.bestVariant.metrics || {};
          contextParts.push(
            `   Variant tốt nhất: ${metrics.likes || 0} likes, ${metrics.comments || 0} comments, ${metrics.shares || 0} shares`
          );
        }
      });
    }

    return contextParts.join('\n');
  }

  /**
   * Generate AI response với RAG
   */
  async generateAIResponse(message, conversationHistory = [], databaseResponses = []) {
    if (!this.model) {
      throw new Error('Gemini AI not available');
    }

    try {
      // Bước 1: Retrieve - Tìm tài liệu liên quan
      const relevantDocs = await this.retrieveRelevantDocuments(message);
      
      // Bước 2: Augment - Xây dựng context từ tài liệu
      const ragContext = this.buildRAGContext(relevantDocs);
      console.log('RAG Context:', ragContext);
      
      // Xây dựng lịch sử hội thoại
      const conversationContext = conversationHistory
        .slice(-5) // Chỉ lấy 5 tin nhắn gần nhất
        .map(conv => 
          `${conv.message_type === 'received' ? 'User' : 'Assistant'}: ${conv.message_text}`
        ).join('\n');

      // Bước 3: Generate - Tạo prompt với context đã augment
      const prompt = `Bạn là trợ lý AI thông minh của fanpage, chuyên phản hồi tin nhắn khách hàng về mọi lĩnh vực: 
      du lịch, ẩm thực, làm đẹp, công nghệ, giáo dục, kinh doanh, sức khỏe, phong cách sống, v.v.

      🎯 NHIỆM VỤ:
      Dựa vào thông tin liên quan được tìm thấy, trả lời chính xác và hữu ích cho khách hàng.

      📩 TIN NHẮN KHÁCH HÀNG:
      ${message}

      ${conversationContext ? `💭 LỊCH SỬ HỘI THOẠI:\n${conversationContext}\n` : ''}

      ${ragContext ? `${ragContext}\n` : ''}

      💡 HƯỚNG DẪN PHẢN HỒI:
      1. SỬ DỤNG THÔNG TIN TỪ CÁC TÀI LIỆU LIÊN QUAN ở trên để trả lời chính xác nhất
      2. Nếu có bài viết liên quan, hãy đề cập đến nội dung cụ thể từ bài viết đó
      3. Giọng văn thân thiện, tự nhiên, chuyên nghiệp
      4. Câu trả lời ngắn gọn (2-4 câu), dễ hiểu
      5. Sử dụng emoji phù hợp (🌟✨💬💌...)
      6. Kết thúc bằng CTA phù hợp:
        - "Inbox em để được tư vấn chi tiết hơn nhé 💌"
        - "Anh/chị quan tâm đến sản phẩm/dịch vụ nào cụ thể ạ?"
        - "Theo dõi page để cập nhật thêm tin mới nha 🌟"

      ⚠️ LƯU Ý:
      - Nếu KHÔNG có tài liệu liên quan (context rỗng), hãy phản hồi lịch sự và mời khách inbox
      - Luôn dựa vào THÔNG TIN THỰC TẾ từ documents, không bịa đặt
      - Ưu tiên thông tin từ bài viết có độ liên quan cao nhất

      ➡️ Hãy phản hồi cho khách hàng:`;

      // Gọi AI model
      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      const aiResponse = response.text().trim();

      if (!aiResponse || aiResponse.length < 10) {
        throw new Error('AI response too short or empty');
      }

      this.logger.info('Generated RAG-powered AI response', {
        messageLength: message.length,
        responseLength: aiResponse.length,
        relevantDocsCount: relevantDocs.length,
        topRelevance: relevantDocs.length > 0 ? relevantDocs[0].similarity : 0,
        hasHistory: conversationHistory.length > 0
      });

      return {
        response: aiResponse,
        relevantDocs: relevantDocs.map(doc => ({
          type: doc.type,
          title: doc.title || doc.keyword,
          content: doc.content || doc.responseText || doc.detailText,
          similarity: doc.similarity,
          id: doc.id
        })),
        usedRAG: relevantDocs.length > 0
      };
    } catch (error) {
      this.logger.error('Error generating RAG AI response', { error: error.message });
      throw error;
    }
  }

  /**
   * Force refresh vector database
   */
  async refreshVectorDatabase() {
    try {
      this.logger.info('Force refreshing vector database...');
      this.vectorCache.lastUpdate = null; // Invalidate cache
      await this.buildVectorDatabase();
      return {
        success: true,
        postsCount: this.vectorCache.posts.length,
        responsesCount: this.vectorCache.responses.length,
        abTestsCount: this.vectorCache.abTests.length,
        totalVectors: this.vectorCache.posts.length + this.vectorCache.responses.length + this.vectorCache.abTests.length,
        refreshedAt: new Date()
      };
    } catch (error) {
      this.logger.error('Error refreshing vector database', { error: error.message });
      throw error;
    }
  }

  /**
   * Get or create ChatAI user
   */
  async getOrCreateUser(facebookId, userProfile = {}) {
    try {
      let user = await ChatAIUser.findOne({ where: { facebook_id: facebookId } });
      
      if (!user) {
        user = await ChatAIUser.create({
          facebook_id: facebookId,
          first_name: userProfile.first_name || 'User',
          last_name: userProfile.last_name || '',
          profile_pic: userProfile.profile_pic || ''
        });
        this.logger.info('Created new ChatAI user', { userId: user.id, facebookId });
      } else {
        await user.update({
          first_name: userProfile.first_name || user.first_name,
          last_name: userProfile.last_name || user.last_name,
          profile_pic: userProfile.profile_pic || user.profile_pic
        });
        this.logger.info('Updated existing ChatAI user', { userId: user.id, facebookId });
      }
      
      return user;
    } catch (error) {
      this.logger.error('Error getting/creating ChatAI user', { error: error.message, facebookId });
      throw error;
    }
  }

  /**
   * Save conversation message
   */
  async saveMessage(userId, messageText, messageType, facebookMessageId = null, conversationId = null) {
    try {
      const conversation = await ChatAIConversation.create({
        user_id: userId,
        message_text: messageText,
        message_type: messageType,
        facebook_message_id: facebookMessageId,
        conversation_id: conversationId
      });
      
      this.logger.debug('Saved ChatAI conversation', { 
        conversationId: conversation.id, 
        userId, 
        messageType,
        messageLength: messageText.length 
      });
      
      return conversation;
    } catch (error) {
      this.logger.error('Error saving ChatAI conversation', { error: error.message, userId });
      throw error;
    }
  }

  /**
   * Get conversation history
   */
  async getConversationHistory(userId, limit = 10) {
    console.log("Getting conversation history for user:",userId);
    try {
      const conversations = await ChatAIConversation.findAll({
        where: { user_id: userId },
        order: [['timestamp', 'DESC']],
        limit: limit,
        raw: true
      });
      
      return conversations.reverse();
    } catch (error) {
      this.logger.error('Error getting ChatAI conversation history', { error: error.message, userId });
      return [];
    }
  }

  /**
   * Calculate engagement score
   */
  calculateEngagementScore(engagements) {
    if (!engagements || engagements.length === 0) return 0;
    
    const totalEngagement = engagements.reduce((sum, eng) => {
      return sum + (eng.likes || 0) + (eng.comments || 0) + (eng.shares || 0);
    }, 0);

    return totalEngagement;
  }

  /**
   * Log analytics event
   */
  async logAnalytics(userId, eventType, eventData = {}) {
    try {
      await ChatAIAnalytics.create({
        user_id: userId,
        event_type: eventType,
        event_data: eventData
      });
      
      this.logger.debug('Logged ChatAI analytics', { userId, eventType });
    } catch (error) {
      this.logger.error('Error logging ChatAI analytics', { error: error.message, userId });
    }
  }

  /**
   * Get analytics events and simple summary for a given time range
   */
  async getAnalytics(startDate = null, endDate = null) {
    try {
      const { Op } = require('sequelize');
      const where = {};
      if (startDate) {
        where.timestamp = { [Op.gte]: startDate };
      }
      if (endDate) {
        where.timestamp = Object.assign(where.timestamp || {}, { [Op.lte]: endDate });
      }

      const events = await ChatAIAnalytics.findAll({
        where,
        order: [['timestamp', 'DESC']],
        limit: 1000,
        include: [{ model: ChatAIUser, as: 'user', attributes: ['id', 'first_name', 'last_name', 'facebook_id'] }]
      });

      // Build a simple summary (counts per event_type)
      const counts = {};
      for (const ev of events) {
        const t = ev.event_type || 'unknown';
        counts[t] = (counts[t] || 0) + 1;
      }

      return {
        total: events.length,
        counts,
        events
      };
    } catch (error) {
      this.logger.error('Error getting ChatAI analytics', { error: error.message });
      return { total: 0, counts: {}, events: [] };
    }
  }

  /**
   * Get service statistics
   */
  async getStats() {
    try {
      const [userCount, conversationCount, responseCount, publishedPostsCount] = await Promise.all([
        ChatAIUser.count(),
        ChatAIConversation.count(),
        ChatAIResponse.count({ where: { is_active: true } }),
        Post.count({ where: { status: 'published' } })
      ]);

      return {
        users: userCount,
        conversations: conversationCount,
        active_responses: responseCount,
        published_posts: publishedPostsCount,
        vector_cache: {
          posts: this.vectorCache.posts.length,
          responses: this.vectorCache.responses.length,
          abTests: this.vectorCache.abTests.length,
          total: this.vectorCache.posts.length + this.vectorCache.responses.length + this.vectorCache.abTests.length,
          lastUpdate: this.vectorCache.lastUpdate ? new Date(this.vectorCache.lastUpdate) : null
        },
        gemini_available: !!this.model,
        embedding_available: !!this.embeddingModel,
        rag_enabled: !!this.embeddingModel
      };
    } catch (error) {
      this.logger.error('Error getting ChatAI stats', { error: error.message });
      return { 
        users: 0, 
        conversations: 0, 
        active_responses: 0, 
        published_posts: 0,
        vector_cache: { posts: 0, responses: 0, lastUpdate: null },
        gemini_available: false,
        embedding_available: false,
        rag_enabled: false
      };
    }
  }
}

module.exports = ChatAIService;