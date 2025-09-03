#!/usr/bin/env node

const http = require('http');

function makeAPIRequest(path, token) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: path,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, data: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, data: data });
        }
      });
    });

    req.on('error', reject);
    req.end();
  });
}

async function testAPI() {
  console.log('🔗 Testing API endpoint directly\n');
  
  try {
    // You'll need to replace this with a valid token
    // For now, let's test without auth to see if the endpoint exists
    const response = await makeAPIRequest('/api/cusip-mappings', '');
    
    console.log(`Status: ${response.status}`);
    
    if (response.status === 401) {
      console.log('✅ Endpoint exists (returns 401 Unauthorized, which is expected without token)');
    } else if (response.status === 200) {
      console.log('✅ Endpoint works!');
      console.log(`Data: ${JSON.stringify(response.data, null, 2)}`);
    } else {
      console.log(`❌ Unexpected status: ${response.status}`);
      console.log(`Response: ${JSON.stringify(response.data, null, 2)}`);
    }
    
  } catch (error) {
    console.error('❌ Request failed:', error.message);
  }
}

testAPI();