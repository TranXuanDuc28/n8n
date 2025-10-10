const { Post, PlatformPost, Engagement } = require('../models');
const { Op } = require('sequelize');

class PostsService {
  async getPostById(postId) {
    try {
      const post = await Post.findByPk(postId, {
        include: [
          {
            model: PlatformPost,
            as: 'platformPosts',
            required: true,
            include: [
              {
                model: Engagement,
                as: 'engagements',
                required: true
              }
            ]
          }
        ]
      });

      return post;
    } catch (error) {
      throw new Error(`Error fetching post: ${error.message}`);
    }
  }

  async getAllPosts(options = {}) {
    try {
      const { page = 1, limit = 10, status, topic } = options;
      const offset = (page - 1) * limit;

      const whereClause = {};
      if (status) whereClause.status = status;
      if (topic) whereClause.topic = { [Op.like]: `%${topic}%` };

      const { count, rows } = await Post.findAndCountAll({
        where: whereClause,
        include: [
          {
            model: PlatformPost,
            as: 'platformPosts'
          }
        ],
        limit: parseInt(limit, 10),
        offset: parseInt(offset, 10),
        order: [['created_at', 'DESC']]
      });

      return {
        posts: rows,
        pagination: {
          total: count,
          page: parseInt(page, 10),
          limit: parseInt(limit, 10),
          totalPages: Math.ceil(count / limit)
        }
      };
    } catch (error) {
      throw new Error(`Error fetching posts: ${error.message}`);
    }
  }

  async createPost(postData) {
    try {
      const post = await Post.create({
        ...postData,
        created_at: new Date(),
        updated_at: new Date()
      });

      return post;
    } catch (error) {
      throw new Error(`Error creating post: ${error.message}`);
    }
  }

  async updatePost(postId, updateData) {
    try {
      const [updatedRowsCount] = await Post.update(
        {
          ...updateData,
          updated_at: new Date()
        },
        {
          where: { id: postId }
        }
      );

      if (updatedRowsCount === 0) {
        return null;
      }

      return await this.getPostById(postId);
    } catch (error) {
      throw new Error(`Error updating post: ${error.message}`);
    }
  }

  async updatePostStatus(postId, post_id, status) {
    try {
      const statusData = {
        status,
        platform_post_id: post_id,
        published_at: status === 'published' ? new Date() : null,
        updated_at: new Date()
      };

      const [updatedRowsCount] = await Post.update(statusData, {
        where: { id: postId }
      });

      if (updatedRowsCount === 0) {
        throw new Error(`Post with id ${postId} not found`);
      }

      // Sau khi update thì trả về post đã được cập nhật
      // Also persist a PlatformPost record for tracking per-platform posts
      try {
        if (post_id) {
          await PlatformPost.create({
            post_id: postId,
            platform_post_id: post_id,
            status,
            published_at: status === 'published' ? new Date() : null,
            metadata: null,
            created_at: new Date(),
            updated_at: new Date()
          });
        }
      } catch (e) {
        // non-fatal: log and continue
        console.warn('Failed to create PlatformPost record:', e.message);
      }

      return await this.getPostById(postId);
    } catch (error) {
      throw new Error(`Error updating post status: ${error.message}`);
    }
  }

  async deletePost(postId) {
    try {
      const deletedRowsCount = await Post.destroy({
        where: { id: postId }
      });

      return deletedRowsCount > 0;
    } catch (error) {
      throw new Error(`Error deleting post: ${error.message}`);
    }
  }

  async getPostsToCheck() {
    try {
      const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
      const posts = await Post.findAll({
        where: {
          status: 'published',
          published_at: {
            [Op.lte]: fifteenMinutesAgo
          }
        },
        include: [
          {
            model: PlatformPost,
            as: 'platformPosts',
            where: {
              status: 'published'
            },
            required: true
          }
        ],
        order: [['published_at', 'ASC']]
      });

      return posts;
    } catch (error) {
      throw new Error(`Error fetching posts to check: ${error.message}`);
    }
  }

  async getPostsByStatus(status) {
    try {
      const posts = await Post.findAll({
        where: { status },
        include: [
          {
            model: PlatformPost,
            as: 'platformPosts'
          }
        ],
        order: [['created_at', 'DESC']]
      });

      return posts;
    } catch (error) {
      throw new Error(`Error fetching posts by status: ${error.message}`);
    }
  }

  async getPostsByTopic(topic) {
    try {
      const posts = await Post.findAll({
        where: {
          topic: { [Op.like]: `%${topic}%` }
        },
        include: [
          {
            model: PlatformPost,
            as: 'platformPosts'
          }
        ],
        order: [['created_at', 'DESC']]
      });

      return posts;
    } catch (error) {
      throw new Error(`Error fetching posts by topic: ${error.message}`);
    }
  }
}

module.exports = new PostsService();
