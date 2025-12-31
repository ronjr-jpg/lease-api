nullGetter: () => '' // Return empty string for null/undefined values
});

    // 3. Prepare data for template (handle empty values for conditional logic)
    const templateData = {
      // Lease basics
      lease_id: data.lease_id || '',
      lease_number: data.lease_number || '',
      
      // Tenants (empty string hides conditional sections)
      tenant1_name: data.tenant1_name || '',
      tenant1_email: data.tenant1_email || '',
      tenant2_name: data.tenant2_name || '',
      tenant2_email: data.tenant2_email || '',
      tenant3_name: data.tenant3_name || '',
      tenant3_email: data.tenant3_email || '',
      tenant4_name: data.tenant4_name || '',
      tenant4_email: data.tenant4_email || '',
      
      // Agent (optional)
      agent_name: data.agent_name || '',
      agent_email: data.agent_email || '',
      
      // Landlord
      landlord_name: data.landlord_name || '',
      landlord_email: data.landlord_email || '',
      
      // Property
      property_address: data.property_address || '',
      unit_number: data.unit_number || '',
      property_name: data.property_name || '',
      
      // Financial terms
      monthly_rent: data.monthly_rent || '',
      security_deposit: data.security_deposit || '',
      pet_deposit: data.pet_deposit || '0',
      parking_fee: data.parking_fee || '0',
      
      // Lease terms
      lease_term_months: data.lease_term_months || '12',
      start_date: data.start_date || '',
      end_date: data.end_date || '',
      utilities: data.utilities || 'Tenant',
      
      // Current date
      current_date: new Date().toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      })
    };

    // 4. Render the template with data
    doc.render(templateData);
    // 3. Render the template with data
    doc.render(data);

// 5. Get the filled Word document as buffer
const filledDocx = doc.getZip().generate({
