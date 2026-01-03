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

if (process.env.S3_ENDPOINT) {
  s3Config.endpoint = process.env.S3_ENDPOINT;
  s3Config.s3ForcePathStyle = true;
}

const s3 = new AWS.S3(s3Config);

// Templates directory (flat structure - no subfolders)
const TEMPLATES_DIR = path.join(__dirname, 'templates');

// Health check endpoint
app.get('/', (req, res) => {
  res.json({ 
    status: 'ok', 
    message: 'Lease Generation API is running',
    timestamp: new Date().toISOString()
  });
});

// =============================================================================
// MAIN ENDPOINT: Generate lease document package
// =============================================================================
app.post('/api/generate-lease', async (req, res) => {
  try {
    const { documents = [], leaseData } = req.body;

    console.log('Generating lease package:', {
      leaseId: leaseData?.leaseId,
      documentCount: documents.length,
      documents: documents
    });

    // Validation
    if (!leaseData) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: leaseData'
      });
    }

    if (!documents || documents.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: documents (array of filenames)'
      });
    }

    const pdfBuffers = [];
    const processedDocs = [];
    const warnings = [];

    // Process each document in order
    for (const doc of documents) {
      const fileName = typeof doc === 'string' ? doc : doc.fileName;
      const filePath = path.join(TEMPLATES_DIR, fileName);

      if (!fs.existsSync(filePath)) {
        warnings.push(`File not found: ${fileName}`);
        console.warn(`⚠ File not found: ${fileName}`);
        continue;
      }

      const ext = path.extname(fileName).toLowerCase();

      try {
        if (ext === '.docx') {
          // Word template - fill and convert to PDF
          console.log(`📄 Processing Word template: ${fileName}`);
          const pdfBuffer = await fillWordTemplate(filePath, leaseData);
          pdfBuffers.push(pdfBuffer);
          processedDocs.push({ fileName, type: 'word', status: 'success' });

        } else if (ext === '.pdf') {
          // PDF - check if fillable or static
          console.log(`📋 Processing PDF: ${fileName}`);
          const pdfBuffer = await processPdf(filePath, leaseData);
          pdfBuffers.push(pdfBuffer);
          processedDocs.push({ fileName, type: 'pdf', status: 'success' });

        } else {
          warnings.push(`Unsupported file type: ${fileName}`);
          console.warn(`⚠ Unsupported file type: ${fileName}`);
        }
      } catch (docError) {
        warnings.push(`Error processing ${fileName}: ${docError.message}`);
        console.error(`✗ Error processing ${fileName}:`, docError.message);
      }
    }

    // Check if we have any documents to merge
    if (pdfBuffers.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No documents were successfully processed',
        warnings: warnings
      });
    }

    // Merge all PDFs into single package
    let finalPdfBuffer;
    if (pdfBuffers.length === 1) {
      finalPdfBuffer = pdfBuffers[0];
    } else {
      console.log(`📎 Merging ${pdfBuffers.length} PDFs...`);
      finalPdfBuffer = await mergePdfs(pdfBuffers);
    }

    // Upload to S3/R2
    const fileName = `lease-${leaseData.leaseId || Date.now()}.pdf`;
    const s3Key = `leases/${fileName}`;
    
    const uploadParams = {
      Bucket: process.env.S3_BUCKET_NAME,
      Key: s3Key,
      Body: finalPdfBuffer,
      ContentType: 'application/pdf'
    };

    console.log(`☁ Uploading to storage: ${s3Key}`);
    const uploadResult = await s3.upload(uploadParams).promise();
    
    // Generate signed preview URL (1 hour expiry)
    const previewUrl = s3.getSignedUrl('getObject', {
      Bucket: process.env.S3_BUCKET_NAME,
      Key: s3Key,
      Expires: 3600
    });

    console.log(`✓ Lease package generated successfully: ${fileName}`);

    res.json({
      success: true,
      pdfUrl: uploadResult.Location,
      previewUrl: previewUrl,
      fileName: fileName,
      generatedAt: new Date().toISOString(),
      metadata: {
        leaseId: leaseData.leaseId,
        documentsRequested: documents.length,
        documentsProcessed: processedDocs.length,
        documents: processedDocs
      },
      warnings: warnings.length > 0 ? warnings : undefined
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

// =============================================================================
// PDF Processing - Auto-detect fillable vs static
// =============================================================================
async function processPdf(pdfPath, data) {
  try {
    const pdfBytes = fs.readFileSync(pdfPath);
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const form = pdfDoc.getForm();
    const fields = form.getFields();

    if (fields.length > 0) {
      // Fillable PDF - fill the fields
      console.log(`  → Fillable PDF with ${fields.length} fields`);
      return await fillPdfForm(pdfDoc, form, fields, data);
    } else {
      // Static PDF - return as-is
      console.log(`  → Static PDF (no form fields)`);
      return pdfBytes;
    }
  } catch (error) {
    // If we can't parse it as fillable, return as static
    console.log(`  → Treating as static PDF`);
    return fs.readFileSync(pdfPath);
  }
}

// =============================================================================
// PDF Form Filling
// =============================================================================
async function fillPdfForm(pdfDoc, form, fields, data) {
  try {
    for (const field of fields) {
      const fieldName = field.getName();
      const fieldType = field.constructor.name;
      
      // Try to find matching data: exact match, then camelCase conversion
      let value = data[fieldName] ?? data[toCamelCase(fieldName)] ?? null;
      
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
            radioGroup.select(String(value));
          } else if (fieldType === 'PDFDropdown') {
            const dropdown = form.getDropdown(fieldName);
            dropdown.select(String(value));
          }
          console.log(`    ✓ ${fieldName} = "${value}"`);
        } catch (fieldError) {
          console.warn(`    ✗ Could not fill ${fieldName}: ${fieldError.message}`);
        }
      }
    }

    // Flatten form to prevent editing
    form.flatten();
    const filledPdfBytes = await pdfDoc.save();
    return Buffer.from(filledPdfBytes);

  } catch (error) {
    console.error('Error filling PDF form:', error);
    throw error;
  }
}

// =============================================================================
// PDF Merging
// =============================================================================
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

// =============================================================================
// Word Template Filling
// =============================================================================
async function fillWordTemplate(templatePath, data) {
  try {
    const content = fs.readFileSync(templatePath);
    const zip = new PizZip(content);
    
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
      nullGetter: () => ''  // Empty string for missing fields
    });

    doc.render(data);

    const filledDocx = doc.getZip().generate({
      type: 'nodebuffer',
      compression: 'DEFLATE'
    });

    // Convert to PDF using LibreOffice
    const tempDir = path.join(__dirname, 'temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const tempDocxPath = path.join(tempDir, `temp-${Date.now()}.docx`);
    const tempPdfPath = tempDocxPath.replace('.docx', '.pdf');
    
    fs.writeFileSync(tempDocxPath, filledDocx);

    try {
      execSync(
        `libreoffice --headless --convert-to pdf --outdir "${tempDir}" "${tempDocxPath}"`,
        { timeout: 30000 }
      );
    } catch (conversionError) {
      console.error('LibreOffice conversion failed:', conversionError.message);
      throw new Error('PDF conversion failed. Make sure LibreOffice is installed.');
    }

    if (!fs.existsSync(tempPdfPath)) {
      throw new Error('PDF file was not generated');
    }
    
    const pdfBuffer = fs.readFileSync(tempPdfPath);

    // Cleanup temp files
    fs.unlinkSync(tempDocxPath);
    fs.unlinkSync(tempPdfPath);

    return pdfBuffer;

  } catch (error) {
    console.error('Error filling Word template:', error);
    throw error;
  }
}

// =============================================================================
// Utility Functions
// =============================================================================
function toCamelCase(str) {
  return str
    .replace(/(?:^\w|[A-Z]|\b\w)/g, (word, index) => 
      index === 0 ? word.toLowerCase() : word.toUpperCase()
    )
    .replace(/\s+/g, '')
    .replace(/[-_]+/g, '');
}

// =============================================================================
// List Templates Endpoint
// =============================================================================
app.get('/api/templates', (req, res) => {
  try {
    if (!fs.existsSync(TEMPLATES_DIR)) {
      return res.json({ success: true, templates: [] });
    }

    const files = fs.readdirSync(TEMPLATES_DIR)
      .filter(f => f.endsWith('.docx') || f.endsWith('.pdf'))
      .map(f => {
        const ext = path.extname(f).toLowerCase();
        return {
          fileName: f,
          name: f.replace(/\.(docx|pdf)$/i, ''),
          type: ext === '.docx' ? 'word' : 'pdf'
        };
      });
    
    res.json({
      success: true,
      templates: files,
      count: files.length
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// =============================================================================
// Inspect PDF Form Fields Endpoint
// =============================================================================
app.get('/api/pdf-fields/:fileName', async (req, res) => {
  try {
    const { fileName } = req.params;
    
    // Add .pdf extension if not provided
    const pdfFileName = fileName.endsWith('.pdf') ? fileName : `${fileName}.pdf`;
    const pdfPath = path.join(TEMPLATES_DIR, pdfFileName);
    
    if (!fs.existsSync(pdfPath)) {
      return res.status(404).json({
        success: false,
        error: `PDF not found: ${pdfFileName}`
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
        type: fieldType.replace('PDF', '').replace('Field', '')
      };

      if (fieldType === 'PDFRadioGroup') {
        try { info.options = form.getRadioGroup(field.getName()).getOptions(); } 
        catch (e) { info.options = []; }
      } else if (fieldType === 'PDFDropdown') {
        try { info.options = form.getDropdown(field.getName()).getOptions(); } 
        catch (e) { info.options = []; }
      }

      return info;
    });

    res.json({
      success: true,
      fileName: pdfFileName,
      fieldCount: fields.length,
      fields: fieldInfo
    });

  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// =============================================================================
// Test PDF Fill Endpoint (returns PDF directly, no S3 upload)
// =============================================================================
app.post('/api/test-pdf-fill', async (req, res) => {
  try {
    const { fileName, leaseData } = req.body;

    if (!fileName || !leaseData) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: fileName and leaseData'
      });
    }

    const pdfPath = path.join(TEMPLATES_DIR, fileName);
    
    if (!fs.existsSync(pdfPath)) {
      return res.status(404).json({
        success: false,
        error: `PDF not found: ${fileName}`
      });
    }

    const filledPdf = await processPdf(pdfPath, leaseData);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="test-${fileName}"`);
    res.send(filledPdf);

  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// =============================================================================
// Test Word Fill Endpoint (returns PDF directly, no S3 upload)
// =============================================================================
app.post('/api/test-word-fill', async (req, res) => {
  try {
    const { fileName, leaseData } = req.body;

    if (!fileName || !leaseData) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: fileName and leaseData'
      });
    }

    const docxPath = path.join(TEMPLATES_DIR, fileName);
    
    if (!fs.existsSync(docxPath)) {
      return res.status(404).json({
        success: false,
        error: `Word template not found: ${fileName}`
      });
    }

    const filledPdf = await fillWordTemplate(docxPath, leaseData);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="test-${fileName.replace('.docx', '.pdf')}"`);
    res.send(filledPdf);

  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// =============================================================================
// Start Server
// =============================================================================
app.listen(PORT, () => {
  console.log(`🚀 Lease Generation API running on port ${PORT}`);
  console.log(`📍 Health check: http://localhost:${PORT}/`);
  console.log(`📄 Generate endpoint: POST http://localhost:${PORT}/api/generate-lease`);
  console.log(`📋 List templates: GET http://localhost:${PORT}/api/templates`);
  console.log(`🔍 PDF fields: GET http://localhost:${PORT}/api/pdf-fields/{fileName}`);
  console.log(`🧪 Test PDF fill: POST http://localhost:${PORT}/api/test-pdf-fill`);
  console.log(`🧪 Test Word fill: POST http://localhost:${PORT}/api/test-word-fill`);
});
