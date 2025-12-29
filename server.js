require('dotenv').config();
const express = require('express');
const cors = require('cors');
const Docxtemplater = require('docxtemplater');
const PizZip = require('pizzip');
const AWS = require('aws-sdk');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Configure AWS S3 (works with Cloudflare R2 too - S3 compatible)
const s3Config = {
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION || 'auto', signatureVersion: 'v4'
};

// Add endpoint if using Cloudflare R2 or other S3-compatible service
if (process.env.S3_ENDPOINT) {
  s3Config.endpoint = process.env.S3_ENDPOINT;
  s3Config.s3ForcePathStyle = true; // Required for R2
}

const s3 = new AWS.S3(s3Config);

// Health check endpoint
app.get('/', (req, res) => {
  res.json({ 
    status: 'ok', 
    message: 'Lease Generation API is running',
    timestamp: new Date().toISOString()
  });
});

// Main endpoint: Generate lease document
app.post('/api/generate-lease', async (req, res) => {
  try {
    const { leaseData, templateName, selectedAddenda = [] } = req.body;

    console.log('Generating lease:', {
      template: templateName,
      leaseId: leaseData.lease_id,
      addenda: selectedAddenda
    });

    // Validate required fields
    if (!leaseData || !templateName) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: leaseData and templateName'
      });
    }

    // 1. Load and fill the base template
    const baseTemplatePath = path.join(__dirname, 'templates', `${templateName}.docx`);
    
    if (!fs.existsSync(baseTemplatePath)) {
      return res.status(404).json({
        success: false,
        error: `Template not found: ${templateName}.docx`
      });
    }

    const basePdfBuffer = await fillTemplate(baseTemplatePath, leaseData);
    
    // 2. Generate addenda PDFs if any selected
    const addendaPdfBuffers = [];
    for (const addendumName of selectedAddenda) {
      const addendumPath = path.join(__dirname, 'templates', 'addenda', `${addendumName}.docx`);
      
      if (fs.existsSync(addendumPath)) {
        const addendumPdf = await fillTemplate(addendumPath, leaseData);
        addendaPdfBuffers.push(addendumPdf);
      } else {
        console.warn(`Addendum not found: ${addendumName}.docx`);
      }
    }

    // 3. Merge PDFs (base + addenda)
    let finalPdfBuffer = basePdfBuffer;
    
    if (addendaPdfBuffers.length > 0) {
      // For now, just use base PDF
      // TODO: Implement PDF merging with pdf-lib
      console.log(`Generated ${addendaPdfBuffers.length} addenda (merging not yet implemented)`);
    }

    // 4. Upload to S3
    const fileName = `lease-${leaseData.lease_id || Date.now()}.pdf`;
    const s3Key = `leases/${fileName}`;
    
    const uploadParams = {
      Bucket: process.env.S3_BUCKET_NAME,
      Key: s3Key,
      Body: finalPdfBuffer,
      ContentType: 'application/pdf',
      ACL: 'private'
    };

    const uploadResult = await s3.upload(uploadParams).promise();
    
    // Generate a presigned URL for preview (valid for 1 hour)
    const previewUrl = s3.getSignedUrl('getObject', {
      Bucket: process.env.S3_BUCKET_NAME,
      Key: s3Key,
      Expires: 3600 // 1 hour
    });

    // 5. Return success response
    res.json({
      success: true,
      pdfUrl: uploadResult.Location,
      previewUrl: previewUrl,
      fileName: fileName,
      generatedAt: new Date().toISOString(),
      metadata: {
        leaseId: leaseData.lease_id,
        template: templateName,
        addenda: selectedAddenda
      }
    });

  } catch (error) {
    console.error('Error generating lease:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Helper function: Fill Word template and convert to PDF
async function fillTemplate(templatePath, data) {
  try {
    // 1. Load the Word template
    const content = fs.readFileSync(templatePath);
    const zip = new PizZip(content);
    
    // 2. Create docxtemplater instance
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
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

    // 5. Get the filled Word document as buffer
    const filledDocx = doc.getZip().generate({
      type: 'nodebuffer',
      compression: 'DEFLATE'
    });

    // 6. Save temporarily to convert to PDF
    const tempDocxPath = path.join(__dirname, 'temp', `temp-${Date.now()}.docx`);
    const tempPdfPath = tempDocxPath.replace('.docx', '.pdf');
    
    // Ensure temp directory exists
    const tempDir = path.join(__dirname, 'temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    fs.writeFileSync(tempDocxPath, filledDocx);

    // 7. Convert to PDF using LibreOffice
    try {
      // LibreOffice headless conversion
      execSync(
  `libreoffice --headless --convert-to pdf --outdir "${tempDir}" "${tempDocxPath}"`,
  { timeout: 30000 }
      );
    } catch (conversionError) {
      console.error('LibreOffice conversion failed:', conversionError.message);
      throw new Error('PDF conversion failed. Make sure LibreOffice is installed.');
    }

    // 8. Read the generated PDF
    if (!fs.existsSync(tempPdfPath)) {
      throw new Error('PDF file was not generated');
    }
    
    const pdfBuffer = fs.readFileSync(tempPdfPath);

    // 9. Cleanup temp files
    fs.unlinkSync(tempDocxPath);
    fs.unlinkSync(tempPdfPath);

    return pdfBuffer;

  } catch (error) {
    console.error('Error filling template:', error);
    throw error;
  }
}

// Endpoint to list available templates
app.get('/api/templates', (req, res) => {
  try {
    const templatesDir = path.join(__dirname, 'templates');
    const files = fs.readdirSync(templatesDir)
      .filter(file => file.endsWith('.docx'))
      .map(file => ({
        name: file.replace('.docx', ''),
        fileName: file
      }));
    
    res.json({
      success: true,
      templates: files
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Endpoint to list available addenda
app.get('/api/addenda', (req, res) => {
  try {
    const addendaDir = path.join(__dirname, 'templates', 'addenda');
    
    if (!fs.existsSync(addendaDir)) {
      return res.json({ success: true, addenda: [] });
    }
    
    const files = fs.readdirSync(addendaDir)
      .filter(file => file.endsWith('.docx'))
      .map(file => ({
        name: file.replace('.docx', ''),
        fileName: file
      }));
    
    res.json({
      success: true,
      addenda: files
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Lease Generation API running on port ${PORT}`);
  console.log(`📍 Health check: http://localhost:${PORT}/`);
  console.log(`📄 Generate endpoint: http://localhost:${PORT}/api/generate-lease`);
});
