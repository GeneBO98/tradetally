// Simple test script to debug Gemini API issues
require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');

async function testGemini() {
  console.log('🧪 Testing Gemini API configuration...');
  
  // Check if API key is available
  const apiKey = process.env.GEMINI_API_KEY;
  console.log('🔑 API Key present:', !!apiKey);
  console.log('🔑 API Key length:', apiKey ? apiKey.length : 0);
  console.log('🔑 API Key prefix:', apiKey ? apiKey.substring(0, 10) + '...' : 'N/A');
  
  if (!apiKey) {
    console.error('❌ GEMINI_API_KEY environment variable not set');
    process.exit(1);
  }
  
  try {
    console.log('🌐 Initializing Google Generative AI...');
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    
    console.log('📝 Testing simple prompt...');
    const prompt = 'Say "Hello from Gemini!" and explain that you are working correctly.';
    
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    
    console.log('✅ Gemini API test successful!');
    console.log('📨 Response:', text);
    
  } catch (error) {
    console.error('❌ Gemini API test failed:', error);
    console.error('Error details:', {
      message: error.message,
      stack: error.stack?.substring(0, 500) + '...',
      code: error.code,
      status: error.status
    });
  }
}

testGemini();