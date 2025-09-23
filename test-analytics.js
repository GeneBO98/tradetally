const axios = require('axios');

async function testAnalyticsFilter() {
  try {
    // First login
    const loginResponse = await axios.post('http://localhost:3000/api/auth/login', {
      email: 'gene@gene.com',
      password: 'password'
    });
    
    const token = loginResponse.data.token;
    console.log('Got token:', token ? 'Yes' : 'No');
    
    if (!token) {
      console.log('Login response:', loginResponse.data);
      return;
    }
    
    // Test without filter
    console.log('\n=== Testing WITHOUT broker filter ===');
    const noFilterResponse = await axios.get('http://localhost:3000/api/analytics/overview', {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log('Total P&L without filter:', noFilterResponse.data.overview.total_pnl);
    console.log('Total trades without filter:', noFilterResponse.data.overview.total_trades);
    
    // Test with broker filter
    console.log('\n=== Testing WITH broker filter (Lightspeed) ===');
    const withFilterResponse = await axios.get('http://localhost:3000/api/analytics/overview', {
      headers: { Authorization: `Bearer ${token}` },
      params: { brokers: 'Lightspeed' }
    });
    console.log('Total P&L with Lightspeed filter:', withFilterResponse.data.overview.total_pnl);
    console.log('Total trades with Lightspeed filter:', withFilterResponse.data.overview.total_trades);
    
    // Test with multiple brokers
    console.log('\n=== Testing WITH multiple broker filter ===');
    const multiFilterResponse = await axios.get('http://localhost:3000/api/analytics/overview', {
      headers: { Authorization: `Bearer ${token}` },
      params: { brokers: 'Lightspeed,E*TRADE' }
    });
    console.log('Total P&L with multiple brokers:', multiFilterResponse.data.overview.total_pnl);
    console.log('Total trades with multiple brokers:', multiFilterResponse.data.overview.total_trades);
    
  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
  }
}

testAnalyticsFilter();