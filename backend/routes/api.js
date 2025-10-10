const express = require('express');
const router = express.Router();
const CommentController = require('../controllers/CommentController');
const AnalyticsController = require('../controllers/AnalyticsController');
const ModerationController = require('../controllers/ModerationController');

const postsController = require('../controllers/posts.controller');
const tokensController = require('../controllers/tokens.controller');
const uploadController = require('../controllers/upload.controller');
const socialController = require('../controllers/social.controller');
const engagementController = require('../controllers/engagement.controller');
const mailController = require('../controllers/mail.controller');

// Health check
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Backend is running',
    timestamp: new Date().toISOString()
  });
});

// Comment routes
router.post('/comments/process', CommentController.processComments);
router.post('/comments/mark-handled', CommentController.markHandled);
router.post('/comments/check-handled', CommentController.checkHandled);
router.get('/comments/unhandled', CommentController.getUnhandled);

// Post routes
router.post('/posts/save', CommentController.savePosts);

// AI routes
router.post('/ai/generate-response', CommentController.generateResponse);
router.post('/ai/process-template', CommentController.processTemplate);

// Analytics routes
router.get('/analytics/summary', AnalyticsController.getSummary);
router.get('/analytics/sentiment-trend', AnalyticsController.getSentimentTrend);
router.get('/analytics/keywords', AnalyticsController.getTopKeywords);
router.get('/analytics/dashboard', AnalyticsController.getDashboard);

// Moderation routes
router.get('/moderation/queue', ModerationController.getQueue);
router.get('/moderation/stats', ModerationController.getStats);
router.get('/moderation/toxic-review', ModerationController.getToxicForReview);
router.post('/moderation/hide', ModerationController.hideComment);
router.post('/moderation/delete', ModerationController.deleteComment);
router.post('/moderation/restore', ModerationController.restoreComment);
router.post('/moderation/batch', ModerationController.batchModerate);


router.get('/posts/:postId', postsController.getPostById);
router.get('/get-all-posts', postsController.getAllPosts);
router.post('/posts/update-status', postsController.updatePostStatus);
router.get('/list-to-check', postsController.getPostsToCheck);

// Thêm endpoint schedule-post
router.post('/schedule-post', postsController.schedulePost);

router.get('/tokens/active', tokensController.getActiveTokens);
router.post('/tokens/create', tokensController.createToken);


router.post('/upload-cloudinary', uploadController.uploadToCloudinary);

router.post('/post-to-facebook', socialController.postToFacebook);
router.post('/post-to-instagram', socialController.postToInstagram);

router.post('/get-engagement', engagementController.getEngagement);

router.post('/send-mail', mailController.sendMail);
module.exports = router;

