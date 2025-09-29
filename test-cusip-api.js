const fetch = require('node-fetch');

async function testCusipAPI() {
  // First, login to get a valid token
  console.log('Logging in...');
  const loginResponse = await fetch('http://localhost:3000/api/auth/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      email: 'test@test.com',
      password: 'tester'
    })
  });
  
  if (!loginResponse.ok) {
    console.error('Login failed:', await loginResponse.text());
    return;
  }
  
  const loginData = await loginResponse.json();
  const token = loginData.token;
  console.log('Login successful!');
  
  // Check unmapped CUSIPs
  console.log('\nChecking unmapped CUSIPs...');
  const unmappedResponse = await fetch('http://localhost:3000/api/cusip-mappings/unmapped', {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
  
  if (!unmappedResponse.ok) {
    console.error('Unmapped CUSIPs check failed:', await unmappedResponse.text());
    return;
  }
  
  const unmappedData = await unmappedResponse.json();
  console.log(`Found ${unmappedData.data.length} unmapped CUSIPs`);
  
  if (unmappedData.data.length > 0) {
    console.log('First few CUSIPs:', unmappedData.data.slice(0, 3).map(c => c.cusip));
    
    // Try to resolve CUSIPs
    console.log('\nStarting CUSIP resolution...');
    const resolveResponse = await fetch('http://localhost:3000/api/trades/cusip/resolve-unresolved', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!resolveResponse.ok) {
      console.error('CUSIP resolution failed:', await resolveResponse.text());
      return;
    }
    
    const resolveData = await resolveResponse.json();
    console.log('Resolution started:', resolveData);
  } else {
    console.log('No unmapped CUSIPs found to resolve');
  }
}

testCusipAPI().catch(console.error);