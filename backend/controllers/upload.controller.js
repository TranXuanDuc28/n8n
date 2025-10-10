const cloudinary = require('cloudinary').v2;

class UploadController {
  constructor() {
    // Configure Cloudinary
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET
    });
  }

  // POST /api/upload-cloudinary
  async uploadToCloudinary(req, res) {
    try {
      const { base64String } = req.body;

      if (!base64String) {
        return res.status(400).json({
          success: false,
          message: 'base64String is required'
        });
      }

      // Remove data URL prefix if present
      const base64Data = base64String.replace(/^data:image\/[a-z]+;base64,/, '');

      const result = await cloudinary.uploader.upload(`data:image/jpeg;base64,${base64Data}`, {
        folder: 'midterm-social-media',
        resource_type: 'image',
        quality: 'auto',
        fetch_format: 'auto'
      });

      res.json({
        public_id: result.public_id,
        secure_url: result.secure_url,
        url: result.url,
        width: result.width,
        height: result.height,
        format: result.format,
        bytes: result.bytes,
        created_at: result.created_at
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }
}

module.exports = new UploadController();