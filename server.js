require('dotenv').config();
const express = require('express');
const cors = require('cors');
const Docxtemplater = require('docxtemplater');
const PizZip = require('pizzip');
const AWS = require('aws-sdk');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { PDFDocument } = require('pdf-lib');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Configure AWS S3 (works with Cloudflare R2 too - S3 compatible)
const s3Config = {
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION || 'auto',
  signatureVersion: 'v4'
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
    const { 
      leaseData, 
      templateName, 
      selectedAddenda = [],
      pdfForms = [],
      staticPdfs = []
    } = req.body;

    console.log('Generating lease:', {
      template: templateName,
      leaseId: leaseData.lease_id,
      addenda: selectedAddenda,
      pdfForms: pdfForms.length,
      staticPdfs: staticPdfs.length
    });

    // Validate required fields
    if (!leaseData) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: leaseData'
      });
    }

    // Collect all PDFs to merge
    const pdfBuffers = [];

    // 1. Process base Word template (if provided)
    if (templateName) {
      const baseTemplatePath = path.join(__dirname, 'templates', `${templateName}.docx`);
      
      if (!fs.existsSync(baseTemplatePath)) {
        return res.status(404).json({
          success: false,
          error: `Template not found: ${templateName}.docx`
        });
      }

      const basePdfBuffer = await fillWordTemplate(baseTemplatePath, leaseData);
      pdfBuffers.push({ name: templateName, buffer: basePdfBuffer });
    }
    
    // 2. Process Word addenda
    for (const addendumName of selectedAddenda) {
      const addendumPath = path.join(__dirname, 'templates', 'addenda', `${addendumName}.docx`);
      
      if (fs.existsSync(addendumPath)) {
        const addendumPdf = await fillWordTemplate(addendumPath, leaseData);
        pdfBuffers.push({ name: addendumName, buffer: addendumPdf });
      } else {
        console.warn(`Addendum not found: ${addendumName}.docx`);
      }
    }

    // 3. Process PDF forms (fill and flatten)
    for (const pdfForm of pdfForms) {
      const templateFile = typeof pdfForm === 'string' ? pdfForm : pdfForm.template;
      const fieldMappings = typeof pdfForm === 'object' ? pdfForm.fieldMappings : {};
      
      const pdfPath = path.join(__dirname, 'templates', 'pdf-forms', templateFile);
      
      if (fs.existsSync(pdfPath)) {
        const filledPdf = await fillPdfForm(pdfPath, leaseData, fieldMappings);
        pdfBuffers.push({ name: templateFile, buffer: filledPdf });
      } else {
        console.warn(`PDF form not found: ${templateFile}`);
      }
    }

    // 4. Process static PDFs (just load them)
    for (const staticPdf of staticPdfs) {
      const pdfPath = path.join(__dirname, 'templates', 'static-pdfs', staticPdf);
      
      if (fs.existsSync(pdfPath)) {
        const pdfBuffer = fs.readFileSync(pdfPath);
        pdfBuffers.push({ name: staticPdf, buffer: pdfBuffer });
      } else {
        console.warn(`Static PDF not found: ${staticPdf}`);
      }
    }

    // 5. Merge all PDFs
    let finalPdfBuffer;
    if (pdfBuffers.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No documents to generate. Provide templateName, pdfForms, or staticPdfs.'
      });
    } else if (pdfBuffers.length === 1) {
      finalPdfBuffer = pdfBuffers[0].buffer;
    } else {
      finalPdfBuffer = await mergePdfs(pdfBuffers.map(p => p.buffer));
    }

    // 6. Upload to S3
    const fileName = `lease-${leaseData.lease_id || Date.now()}.pdf`;
    const s3Key = `leases/${fileName}`;
    
    const uploadParams = {
      Bucket: process.env.S3_BUCKET_NAME,
      Key: s3Key,
      Body: finalPdfBuffer,
      ContentType: 'application/pdf'
    };

    const uploadResult = await s3.upload(uploadParams).promise();
    
    // Generate a presigned URL for preview (valid for 1 hour)
    const previewUrl = s3.getSignedUrl('getObject', {
      Bucket: process.env.S3_BUCKET_NAME,
      Key: s3Key,
      Expires: 3600 // 1 hour
    });

    // 7. Return success response
    res.json({
      success: true,
      pdfUrl: uploadResult.Location,
      previewUrl: previewUrl,
      fileName: fileName,
      generatedAt: new Date().toISOString(),
      metadata: {
        leaseId: leaseData.lease_id,
        template: templateName,
        addenda: selectedAddenda,
        pdfForms: pdfForms.map(p => typeof p === 'string' ? p : p.template),
        staticPdfs: staticPdfs,
        totalDocuments: pdfBuffers.length
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

// ===========================================
// PDF FORM FILLING (NEW)
// ===========================================

async function fillPdfForm(pdfPath, data, fieldMappings = {}) {
  try {
    // Load the PDF
    const pdfBytes = fs.readFileSync(pdfPath);
    const pdfDoc = await PDFDocument.load(pdfBytes);
    
    // Get the form
    const form = pdfDoc.getForm();
    const fields = form.getFields();
    
    console.log(`Filling PDF form: ${path.basename(pdfPath)} (${fields.length} fields)`);

    // Fill each field
    for (const field of fields) {
      const fieldName = field.getName();
      const fieldType = field.constructor.name;
      
      // Determine the data key to use
      let dataKey = fieldMappings[fieldName] || fieldName;
      let value = null;
      
      // Check if it's a static value (prefixed with "STATIC:")
      if (dataKey.startsWith('STATIC:')) {
        value = dataKey.replace('STATIC:', '');
      } else {
        // Try camelCase version if exact match not found
        value = data[dataKey] || data[toCamelCase(dataKey)] || null;
      }
      
      if (value !== null && value !== undefined && value !== '') {
        try {
          if (fieldType === 'PDFTextField') {
            const textField = form.getTextField(fieldName);
            textField.setText(String(value));
          } else if (fieldType === 'PDFCheckBox') {
            const checkBox = form.getCheckBox(fieldName);
            if (value === true || value === 'true' || value === 'X' || value === 'Yes') {
              checkBox.check();
            } else {
              checkBox.uncheck();
            }
          } else if (fieldType === 'PDFRadioGroup') {
            const radioGroup = form.getRadioGroup(fieldName);
            radioGroup.select(value);
          } else if (fieldType === 'PDFDropdown') {
            const dropdown = form.getDropdown(fieldName);
            dropdown.select(value);
          }
          console.log(`  ✓ ${fieldName} = "${value}"`);
        } catch (fieldError) {
          console.warn(`  ✗ Could not fill ${fieldName}: ${fieldError.message}`);
        }
      }
    }

    // Flatten the form (makes fields non-editable, embeds values)
    form.flatten();

    // Save and return
    const filledPdfBytes = await pdfDoc.save();
    return Buffer.from(filledPdfBytes);

  } catch (error) {
    console.error('Error filling PDF form:', error);
    throw error;
  }
}

// ===========================================
// PDF MERGING (NEW)
// ===========================================

async function mergePdfs(pdfBuffers) {
  try {
    const mergedPdf = await PDFDocument.create();
    
    for (const pdfBuffer of pdfBuffers) {
      const pdf = await PDFDocument.load(pdfBuffer);
      const pages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
      pages.forEach(page => mergedPdf.addPage(page));
    }
    
    const mergedPdfBytes = await mergedPdf.save();
    return Buffer.from(mergedPdfBytes);

  } catch (error) {
    console.error('Error merging PDFs:', error);
    throw error;
  }
}

// ===========================================
// WORD TEMPLATE FILLING (existing, renamed)
// ===========================================

async function fillWordTemplate(templatePath, data) {
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

    // 3. Render the template with data
    doc.render(data);

    // 4. Get the filled Word document as buffer
    const filledDocx = doc.getZip().generate({
      type: 'nodebuffer',
      compression: 'DEFLATE'
    });

    // 5. Save temporarily to convert to PDF
    const tempDocxPath = path.join(__dirname, 'temp', `temp-${Date.now()}.docx`);
    const tempPdfPath = tempDocxPath.replace('.docx', '.pdf');
    
    // Ensure temp directory exists
    const tempDir = path.join(__dirname, 'temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    fs.writeFileSync(tempDocxPath, filledDocx);

    // 6. Convert to PDF using LibreOffice
    try {
      execSync(
        `libreoffice --headless --convert-to pdf --outdir "${tempDir}" "${tempDocxPath}"`,
        { timeout: 30000 }
      );
    } catch (conversionError) {
      console.error('LibreOffice conversion failed:', conversionError.message);
      throw new Error('PDF conversion failed. Make sure LibreOffice is installed.');
    }

    // 7. Read the generated PDF
    if (!fs.existsSync(tempPdfPath)) {
      throw new Error('PDF file was not generated');
    }
    
    const pdfBuffer = fs.readFileSync(tempPdfPath);

    // 8. Cleanup temp files
    fs.unlinkSync(tempDocxPath);
    fs.unlinkSync(tempPdfPath);

    return pdfBuffer;

  } catch (error) {
    console.error('Error filling Word template:', error);
    throw error;
  }
}

// ===========================================
// UTILITY FUNCTIONS
// ===========================================

function toCamelCase(str) {
  return str
    .replace(/(?:^\w|[A-Z]|\b\w)/g, (word, index) => 
      index === 0 ? word.toLowerCase() : word.toUpperCase()
    )
    .replace(/\s+/g, '')
    .replace(/[-_]+/g, '');
}

// ===========================================
// API ENDPOINTS
// ===========================================

// Endpoint to list available templates
app.get('/api/templates', (req, res) => {
  try {
    const templatesDir = path.join(__dirname, 'templates');
    const addendaDir = path.join(__dirname, 'templates', 'addenda');
    const pdfFormsDir = path.join(__dirname, 'templates', 'pdf-forms');
    const staticPdfsDir = path.join(__dirname, 'templates', 'static-pdfs');

    const wordTemplates = fs.existsSync(templatesDir) 
      ? fs.readdirSync(templatesDir).filter(f => f.endsWith('.docx')).map(f => ({ name: f.replace('.docx', ''), fileName: f, type: 'word' }))
      : [];

    const addenda = fs.existsSync(addendaDir)
      ? fs.readdirSync(addendaDir).filter(f => f.endsWith('.docx')).map(f => ({ name: f.replace('.docx', ''), fileName: f, type: 'word-addendum' }))
      : [];

    const pdfForms = fs.existsSync(pdfFormsDir)
      ? fs.readdirSync(pdfFormsDir).filter(f => f.endsWith('.pdf')).map(f => ({ name: f.replace('.pdf', ''), fileName: f, type: 'pdf-form' }))
      : [];

    const staticPdfs = fs.existsSync(staticPdfsDir)
      ? fs.readdirSync(staticPdfsDir).filter(f => f.endsWith('.pdf')).map(f => ({ name: f.replace('.pdf', ''), fileName: f, type: 'static-pdf' }))
      : [];
    
    res.json({
      success: true,
      templates: {
        wordTemplates,
        addenda,
        pdfForms,
        staticPdfs
      }
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

// NEW: Endpoint to inspect PDF form fields
app.get('/api/pdf-fields/:formName', async (req, res) => {
  try {
    const { formName } = req.params;
    const pdfPath = path.join(__dirname, 'templates', 'pdf-forms', `${formName}.pdf`);
    
    if (!fs.existsSync(pdfPath)) {
      return res.status(404).json({
        success: false,
        error: `PDF form not found: ${formName}.pdf`
      });
    }

    const pdfBytes = fs.readFileSync(pdfPath);
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const form = pdfDoc.getForm();
    const fields = form.getFields();

    const fieldInfo = fields.map(field => {
      const fieldType = field.constructor.name;
      const info = {
        name: field.getName(),
        type: fieldType
      };

      // Get additional info based on field type
      if (fieldType === 'PDFRadioGroup') {
        try {
          info.options = form.getRadioGroup(field.getName()).getOptions();
        } catch (e) {
          info.options = [];
        }
      } else if (fieldType === 'PDFDropdown') {
        try {
          info.options = form.getDropdown(field.getName()).getOptions();
        } catch (e) {
          info.options = [];
        }
      }

      return info;
    });

    res.json({
      success: true,
      formName: formName,
      fieldCount: fields.length,
      fields: fieldInfo
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// NEW: Test endpoint for PDF form filling only (no upload)
app.post('/api/test-pdf-fill', async (req, res) => {
  try {
    const { pdfForm, leaseData, fieldMappings = {} } = req.body;

    if (!pdfForm || !leaseData) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: pdfForm and leaseData'
      });
    }

    const pdfPath = path.join(__dirname, 'templates', 'pdf-forms', pdfForm);
    
    if (!fs.existsSync(pdfPath)) {
      return res.status(404).json({
        success: false,
        error: `PDF form not found: ${pdfForm}`
      });
    }

    const filledPdf = await fillPdfForm(pdfPath, leaseData, fieldMappings);

    // Return the PDF directly
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="test-${pdfForm}"`);
    res.send(filledPdf);

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
  console.log(`📋 Templates: http://localhost:${PORT}/api/templates`);
  console.log(`🔍 PDF Fields: http://localhost:${PORT}/api/pdf-fields/{formName}`);
});
