const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

// Initialize Gemini API
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Model configuration
const modelConfig = {
  temperature: 0.7,
  topP: 0.9,
  topK: 40,
  maxOutputTokens: 1024,
};

// Safety settings
const safetySettings = [
  {
    category: "HARM_CATEGORY_HARASSMENT",
    threshold: "BLOCK_MEDIUM_AND_ABOVE",
  },
  {
    category: "HARM_CATEGORY_HATE_SPEECH",
    threshold: "BLOCK_MEDIUM_AND_ABOVE",
  },
  {
    category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
    threshold: "BLOCK_MEDIUM_AND_ABOVE",
  },
  {
    category: "HARM_CATEGORY_DANGEROUS_CONTENT",
    threshold: "BLOCK_MEDIUM_AND_ABOVE",
  },
];

// Get Gemini model
function getModel() {
  return genAI.getGenerativeModel({
    model: "gemini-2.5-flash",  // Updated model name (gemini-pro deprecated)
    generationConfig: modelConfig,
    safetySettings: safetySettings,
  });
}

// Generate AI response with chat history
async function generateResponse(userMessage, systemPrompt, chatHistory = []) {
  try {
    const model = getModel();
    
    // Build conversation history
    const history = chatHistory.map(msg => ({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.content }]
    }));

    // Start chat with history
    const chat = model.startChat({
      history: history,
      generationConfig: modelConfig,
      safetySettings: safetySettings,
    });

    // Combine system prompt with user message
    const vietnameseInstruction = "QUAN TRỌNG: Trả lời bằng tiếng Việt. Không bao giờ trả lời bằng tiếng Anh.\n\n";
    const fullPrompt = systemPrompt 
      ? `${vietnameseInstruction}${systemPrompt}\n\nTin nhắn từ khách hàng: ${userMessage}`
      : `${vietnameseInstruction}Tin nhắn từ khách hàng: ${userMessage}`;

    const result = await chat.sendMessage(fullPrompt);
    const response = await result.response;
    const text = response.text();

    return {
      success: true,
      response: text,
      error: null
    };
  } catch (error) {
    console.error('❌ Gemini API error:', error.message);
    return {
      success: false,
      response: null,
      error: error.message
    };
  }
}

// Generate response without history (simple mode)
async function generateSimpleResponse(userMessage, systemPrompt) {
  try {
    const model = getModel();
    
    const vietnameseInstruction = "QUAN TRỌNG: Trả lời bằng tiếng Việt. Không bao giờ trả lời bằng tiếng Anh.\n\n";
    const fullPrompt = systemPrompt 
      ? `${vietnameseInstruction}${systemPrompt}\n\nTin nhắn từ khách hàng: ${userMessage}`
      : `${vietnameseInstruction}Tin nhắn từ khách hàng: ${userMessage}`;

    const result = await model.generateContent(fullPrompt);
    const response = await result.response;
    const text = response.text();

    return {
      success: true,
      response: text,
      error: null
    };
  } catch (error) {
    console.error('❌ Gemini API error:', error.message);
    return {
      success: false,
      response: null,
      error: error.message
    };
  }
}

module.exports = {
  generateResponse,
  generateSimpleResponse,
  getModel
};

