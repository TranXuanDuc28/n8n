const axios = require('axios');
const sharp = require('sharp');
const fs = require('fs').promises;
const path = require('path');
const { Op } = require('sequelize');

const { Visual, AbTest, AbTestVariant } = require('../models');

// const HUGGINGFACE_API_URL = 'https://api-inference.huggingface.co/models/runwayml/stable-diffusion-v1-5';
const HUGGINGFACE_API_URL = 'https://router.huggingface.co/together/v1/images/generations';
const HUGGINGFACE_API_KEY = process.env.HUGGINGFACE_API_KEY;
console.log('Hugging Face API Key:', HUGGINGFACE_API_KEY);
const cloudinary = require('cloudinary').v2;

// Cấu hình Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});
class VisualService {

  // Tạo banner bằng Gemini API chuẩn như curl
  // static async generateBanner(prompt, size = '1200x630', variants = 1) {
  //   const apiKey = process.env.GEMINI_API_KEY;
  //   const endpoint = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';
  //   const images = [];
  //   for (let i = 0; i < variants; i++) {
  //     const variantPrompt = variants > 1 ? `${prompt} - Variant ${i + 1}` : prompt;
  //     const payload = {
  //       contents: [
  //         {
  //           parts: [
  //             { text: variantPrompt }
  //           ]
  //         }
  //       ],
  //       generationConfig: {
  //         thinkingConfig: {
  //           thinkingBudget: 0
  //         }
  //       }
  //     };
  //     const response = await axios.post(endpoint, payload, {
  //       headers: {
  //         'x-goog-api-key': apiKey,
  //         'Content-Type': 'application/json'
  //       }
  //     });
  //     // Trích xuất kết quả text từ response
  //     let resultText = null;
  //     if (response.data && response.data.candidates && response.data.candidates[0]?.content?.parts) {
  //       resultText = response.data.candidates[0].content.parts.map(p => p.text).join('\n');
  //     }
  //     if (resultText) {
  //       images.push(resultText);
  //     } else {
  //       throw new Error('No result returned from Gemini API');
  //     }
  //   }
  //   return images;
  // }
 

static async generateBanner(prompt, size = '1200x630', variants = 1) {
  const images = [];
  const [width, height] = size.split('x').map(Number);

  for (let i = 0; i < variants; i++) {
    const variantPrompt = variants > 1 ? `${prompt} - Variant ${i + 1}` : prompt;
    console.log('Generating image with prompt:', variantPrompt);

    // Gọi Hugging Face API
    const payload = {
      prompt: variantPrompt,
      response_format: 'b64_json',
      model: 'black-forest-labs/FLUX.1-schnell'
    };

    const response = await axios.post(HUGGINGFACE_API_URL, payload, {
      headers: {
        Authorization: `Bearer ${HUGGINGFACE_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    const b64Data = response.data.data[0]?.b64_json;
    if (!b64Data) {
      throw new Error('No image returned from Hugging Face API');
    }

    // Chuyển base64 → buffer
    const imgBuffer = Buffer.from(b64Data, 'base64');

    // Resize & convert sang PNG
    const processedImg = await sharp(imgBuffer)
      .resize(width, height)
      .png()
      .toBuffer();

    // Lưu tạm local trước khi upload (tuỳ chọn)
    const tmpPath = path.join(__dirname, '../generated', `banner-${Date.now()}-${i}.png`);
    await fs.mkdir(path.dirname(tmpPath), { recursive: true });
    await fs.writeFile(tmpPath, processedImg);

    // Upload lên Cloudinary
    const cloudRes = await cloudinary.uploader.upload(tmpPath, {
      folder: 'banners',        // thư mục trên Cloudinary
      use_filename: true,       // dùng tên file gốc
      unique_filename: true,    // tạo tên duy nhất
      overwrite: true
    });

    console.log('Uploaded to Cloudinary:', cloudRes.secure_url);

    // Thêm link public vào mảng trả về
    images.push(cloudRes.secure_url);
  }

  return images;
}


  static async processImage(imageUrl, dimensions) {
    const [width, height] = (dimensions || '1920x1080').split('x').map(Number);

    // Download image
    const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });

    // Resize and convert to PNG
    const processedBuffer = await sharp(response.data)
      .resize(width, height, { fit: 'cover' })
      .png()
      .toBuffer();

    // Save to generated folder
    const fileName = `processed-${Date.now()}.png`;
    const filePath = path.join(__dirname, '../generated', fileName);
    await fs.writeFile(filePath, processedBuffer);

    return `/static/${fileName}`;
  }

  static async createVariants(originalImage, variantCount) {
    const count = Math.max(1, Number(variantCount) || 1);
    const variants = [];

    // Lấy buffer ảnh gốc
    let originalBuffer;
    if (originalImage.startsWith('http')) {
      const response = await axios.get(originalImage, { responseType: 'arraybuffer' });
      originalBuffer = response.data;
    } else {
      originalBuffer = await fs.readFile(path.resolve(originalImage));
    }

    for (let i = 1; i <= count; i++) {
      // Tạo biến thể: thay đổi hue, brightness, saturation
      const variantBuffer = await sharp(originalBuffer)
        .modulate({
          brightness: 1 + i * 0.2,    // tăng sáng rõ rệt
          saturation: 1 + i * 0.3,   // tăng độ bão hòa
          hue: i * 60                 // đổi sắc thái màu (0-360)
        })
        .png()
        .toBuffer();

      // Lưu biến thể vào thư mục generated
      const variantName = `variant-${i + 1}-${Date.now()}.png`;
      const variantPath = path.join(__dirname, '../generated', variantName);
      await fs.mkdir(path.dirname(variantPath), { recursive: true });
      await fs.writeFile(variantPath, variantBuffer);

      variants.push(`/static/${variantName}`);
    }

    return variants;
  }
  static async listToCheck() {
  console.log('Fetching A/B tests to check...');
  try {
    const now = new Date();
    const twentyFourHoursAgo = new Date(now - 2 * 60 * 1000); // ví dụ 3 phút
    console.log('Checking for tests started before:', twentyFourHoursAgo);

    let abTests = await AbTest.findAll({
      where: {
        checked: false,
        startedAt: { [Op.lte]: twentyFourHoursAgo }
      },
      attributes: ['id', 'notifyEmail']
    });

    // Trả về dữ liệu, nếu rỗng trả về message
    if (abTests.length === 0) {
      return [];
    }
    console.log("Found A/B tests:", abTests);

    return abTests ;
  } catch (err) {
    return { error: err.message };
  }
}

}

module.exports = VisualService;