// Test script for the Lease Generation API
const fetch = require('node-fetch');

const API_URL = 'http://localhost:3000';

// Test data
const testLeaseData = {
  leaseData: {
    lease_id: 'TEST-001',
    lease_number: 'LS-TEST-001',
    
    // Tenant 1 (required)
    tenant1_name: 'John Smith',
    tenant1_email: '[email protected]',
    
    // Tenant 2 (optional - leave empty to test conditional hiding)
    tenant2_name: 'Jane Smith',
    tenant2_email: '[email protected]',
    
    // Tenant 3 & 4 empty - should be hidden in document
    tenant3_name: '',
    tenant3_email: '',
    tenant4_name: '',
    tenant4_email: '',
    
    // Agent (optional)
    agent_name: 'Bob Agent',
    agent_email: '[email protected]',
    
    // Landlord (required)
    landlord_name: 'Alice Landlord',
    landlord_email: '[email protected]',
    
    // Property
    property_address: '123 Main Street, Apt 4B',
    unit_number: '4B',
    property_name: 'Sunrise Apartments',
    
    // Financial
    monthly_rent: '2500',
    security_deposit: '2500',
    pet_deposit: '500',
    parking_fee: '100',
    
    // Terms
    lease_term_months: '12',
    start_date: '02/01/2025',
    end_date: '01/31/2026',
    utilities: 'Tenant'
  },
  templateName: 'nj-standard-lease',
  selectedAddenda: ['pet-addendum', 'parking-agreement']
};

async function testAPI() {
  console.log('🧪 Testing Lease Generation API...\n');
  
  // Test 1: Health check
  console.log('Test 1: Health Check');
  try {
    const healthResponse = await fetch(`${API_URL}/`);
    const healthData = await healthResponse.json();
    console.log('✅ Health check passed:', healthData.message);
  } catch (error) {
    console.log('❌ Health check failed:', error.message);
    console.log('Make sure the server is running: npm run dev');
    return;
  }
  
  console.log('\n---\n');
  
  // Test 2: List templates
  console.log('Test 2: List Available Templates');
  try {
    const templatesResponse = await fetch(`${API_URL}/api/templates`);
    const templatesData = await templatesResponse.json();
    console.log('✅ Templates found:', templatesData.templates.length);
    console.log('Templates:', templatesData.templates.map(t => t.name).join(', '));
  } catch (error) {
    console.log('❌ List templates failed:', error.message);
  }
  
  console.log('\n---\n');
  
  // Test 3: List addenda
  console.log('Test 3: List Available Addenda');
  try {
    const addendaResponse = await fetch(`${API_URL}/api/addenda`);
    const addendaData = await addendaResponse.json();
    console.log('✅ Addenda found:', addendaData.addenda.length);
    console.log('Addenda:', addendaData.addenda.map(a => a.name).join(', '));
  } catch (error) {
    console.log('❌ List addenda failed:', error.message);
  }
  
  console.log('\n---\n');
  
  // Test 4: Generate lease
  console.log('Test 4: Generate Lease Document');
  console.log('Sending test data:', {
    template: testLeaseData.templateName,
    tenant1: testLeaseData.leaseData.tenant1_name,
    tenant2: testLeaseData.leaseData.tenant2_name || '(empty - should hide)',
    addenda: testLeaseData.selectedAddenda
  });
  
  try {
    const generateResponse = await fetch(`${API_URL}/api/generate-lease`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(testLeaseData)
    });
    
    const generateData = await generateResponse.json();
    
    if (generateData.success) {
      console.log('✅ Lease generated successfully!');
      console.log('File name:', generateData.fileName);
      console.log('Preview URL:', generateData.previewUrl.substring(0, 100) + '...');
      console.log('Generated at:', generateData.generatedAt);
    } else {
      console.log('❌ Generation failed:', generateData.error);
    }
  } catch (error) {
    console.log('❌ Generate lease failed:', error.message);
  }
  
  console.log('\n---\n');
  console.log('✅ All tests complete!');
}

// Run tests
testAPI();
