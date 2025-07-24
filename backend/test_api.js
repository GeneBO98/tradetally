const axios = require('axios');

// Simulate a login to get a token
async function testStrategyFilter() {
  try {
    console.log('Logging in...');
    const loginResponse = await axios.post('http://localhost:3000/api/auth/login', {
      email: 'admin@example.com', // Replace with actual test user
      password: 'password123' // Replace with actual password
    });
    
    const token = loginResponse.data.token;
    console.log('Got token:', token ? 'YES' : 'NO');
    
    console.log('Testing strategy filter...');
    const response = await axios.get('http://localhost:3000/api/gamification/rankings?strategy=scalper', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    console.log('Success! Response:', response.data);
  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
    console.error('Status:', error.response?.status);
  }
}

testStrategyFilter();