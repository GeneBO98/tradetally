const { default: fetch } = require('node-fetch');

async function testPerplexity() {
  const cusip = '06682J308';
  const prompt = `What is the stock ticker symbol for CUSIP ${cusip}? Please provide only the ticker symbol.`;

  // You'll need to provide your Perplexity API key here
  const apiKey = 'YOUR_PERPLEXITY_API_KEY'; // Replace with actual key
  
  if (apiKey === 'YOUR_PERPLEXITY_API_KEY') {
    console.log('❌ Please set your Perplexity API key in the test file');
    return;
  }

  try {
    console.log('Testing Perplexity AI for CUSIP resolution...');
    console.log(`CUSIP: ${cusip}`);
    
    const response = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'sonar',
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 100
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.log(`❌ Error: ${response.status} - ${errorText}`);
      return;
    }

    const data = await response.json();
    const result = data.choices[0]?.message?.content?.trim();
    
    console.log(`\nPerplexity Response: "${result}"`);
    console.log(`Expected from GPT-5: "BNZI"`);
    console.log(`Match: ${result?.includes('BNZI') ? '✅ CONTAINS BNZI!' : '❌ Different result'}`);
    
    // Check for ticker patterns
    const tickerMatch = result?.match(/\b[A-Z]{2,5}\b/g);
    if (tickerMatch) {
      console.log(`Found ticker symbols: ${tickerMatch.join(', ')}`);
    }
    
  } catch (error) {
    console.log(`❌ Error: ${error.message}`);
  }
}

testPerplexity().catch(console.error);

// Instructions for the user:
console.log('To test Perplexity:');
console.log('1. Get your API key from https://www.perplexity.ai/settings/api');  
console.log('2. Replace YOUR_PERPLEXITY_API_KEY in this file with your actual key');
console.log('3. Run: node test-perplexity.js');
console.log('\\nPerplexity should be able to look up current CUSIP data from the web!');