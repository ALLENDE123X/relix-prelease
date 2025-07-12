// Test script for the /api/generate endpoint
const API_URL = 'http://localhost:3000/api/generate';

async function testAPI() {
  console.log('Testing /api/generate endpoint...');
  
  const payload = {
    repo: 'microsoft/vscode',  // Using a well-known public repository
    branch: 'main',
    mode: 'date',
    start: '2024-01-01',
    end: '2024-01-02'  // Shorter date range for testing
  };
  
  console.log('Payload:', JSON.stringify(payload, null, 2));
  
  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    
    console.log('Response status:', response.status);
    console.log('Response headers:', Object.fromEntries(response.headers.entries()));
    
    const data = await response.json();
    console.log('Response data:', data);
    
    if (response.ok) {
      console.log('✅ API test passed');
      console.log('Generated changelog preview:');
      console.log(data.markdown?.substring(0, 200) + '...');
    } else {
      console.log('❌ API test failed');
      if (data.error) {
        console.log('Error:', data.error);
      }
    }
  } catch (error) {
    console.log('❌ Test error:', error.message);
  }
}

testAPI(); 