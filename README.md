# 📄 Lease Generator API

A lightweight Node.js API that generates lease documents from Word templates with conditional logic and converts them to PDF.

## ✨ Features

- ✅ Fill Word templates with dynamic data
- ✅ Conditional sections (hide/show based on data)
- ✅ Convert Word → PDF automatically
- ✅ Upload to AWS S3 storage
- ✅ Generate preview URLs
- ✅ Support for multiple addenda
- ✅ DocuSign anchor tag preservation
- ✅ RESTful API for easy integration

## 🚀 Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Install LibreOffice

**Mac:**
```bash
brew install --cask libreoffice
```

**Windows:** Download from https://www.libreoffice.org

**Linux:**
```bash
sudo apt-get install libreoffice
```

### 3. Configure Environment

```bash
cp .env.example .env
# Edit .env with your AWS credentials
```

### 4. Add Your Templates

Place your Word templates in:
- Base templates: `/templates/*.docx`
- Addenda: `/templates/addenda/*.docx`

See `TEMPLATE_INSTRUCTIONS.md` for template syntax.

### 5. Start Server

```bash
# Development mode (auto-restart)
npm run dev

# Production mode
npm start
```

Server runs at: http://localhost:3000

### 6. Test API

```bash
npm test
```

## 📡 API Endpoints

### Generate Lease
```
POST /api/generate-lease

Body:
{
  "templateName": "nj-standard-lease",
  "selectedAddenda": ["pet-addendum"],
  "leaseData": {
    "tenant1_name": "John Smith",
    "tenant1_email": "[email protected]",
    "landlord_name": "Jane Landlord",
    "property_address": "123 Main St",
    "monthly_rent": "2000"
    // ... other fields
  }
}

Response:
{
  "success": true,
  "pdfUrl": "https://...",
  "previewUrl": "https://...",
  "fileName": "lease-001.pdf"
}
```

### List Templates
```
GET /api/templates

Response:
{
  "success": true,
  "templates": [
    {"name": "nj-standard-lease", "fileName": "nj-standard-lease.docx"}
  ]
}
```

### List Addenda
```
GET /api/addenda

Response:
{
  "success": true,
  "addenda": [
    {"name": "pet-addendum", "fileName": "pet-addendum.docx"}
  ]
}
```

### Health Check
```
GET /

Response:
{
  "status": "ok",
  "message": "Lease Generation API is running"
}
```

## 🎨 Template Syntax

### Variables
```
Tenant Name: {tenant1_name}
Monthly Rent: ${monthly_rent}
```

### Conditional Sections
```
{#tenant2_name}
Additional Tenant: {tenant2_name}
Signature: [[Tenant2_Signature]]
{/tenant2_name}
```

If `tenant2_name` is empty, the entire section disappears (no blank lines).

### DocuSign Anchors
```
Signature: [[Tenant1_Signature]]
Date: [[Tenant1_Date]]
```

These stay as text in the PDF for DocuSign to detect.

## 📁 Project Structure

```
lease-generator-api/
├── server.js              # Main API server
├── package.json           # Dependencies
├── .env.example          # Environment template
├── SETUP_GUIDE.md        # Complete setup instructions
├── TEMPLATE_INSTRUCTIONS.md  # Template creation guide
├── test-api.js           # Test script
├── templates/            # Word templates folder
│   ├── nj-standard-lease.docx
│   ├── pa-standard-lease.docx
│   └── addenda/         # Addenda subfolder
│       ├── pet-addendum.docx
│       └── parking-agreement.docx
└── temp/                # Temporary files (auto-created)
```

## 🔧 Environment Variables

```env
PORT=3000
NODE_ENV=development

AWS_ACCESS_KEY_ID=your_key
AWS_SECRET_ACCESS_KEY=your_secret
AWS_REGION=us-east-1
S3_BUCKET_NAME=your-bucket-name
```

## 🚢 Deployment

See `SETUP_GUIDE.md` for complete deployment instructions.

**Quick deploy to Railway:**

1. Push to GitHub
2. Connect Railway to your repo
3. Add environment variables
4. Deploy automatically

## 🔌 Integration with Zapier

**Workflow:**
```
Glide → Zapier → Your API → S3 Storage → Glide (preview) → DocuSign
```

**Zapier Action:**
```
Webhooks by Zapier - POST
URL: https://your-api.railway.app/api/generate-lease
Body: {{data from Glide}}
```

## 📊 Available Variables

All templates have access to:

**Tenants:** tenant1_name, tenant2_name, tenant3_name, tenant4_name  
**Landlord:** landlord_name, landlord_email  
**Agent:** agent_name, agent_email (optional)  
**Property:** property_address, unit_number, property_name  
**Financial:** monthly_rent, security_deposit, pet_deposit, parking_fee  
**Terms:** lease_term_months, start_date, end_date, utilities  
**System:** lease_id, lease_number, current_date  

## 🐛 Troubleshooting

**LibreOffice not found:**
```bash
which libreoffice
# Should show: /usr/local/bin/libreoffice or similar
```

**Template not found:**
```bash
ls templates/
# Verify your .docx files are there
```

**AWS upload fails:**
- Check AWS credentials in `.env`
- Verify S3 bucket exists
- Check IAM permissions

## 💰 Costs

**Development:** Free  
**Production:**
- Railway: $5-10/mo
- AWS S3: $1-5/mo
- **Total: ~$6-15/mo**

## 📚 Documentation

- `SETUP_GUIDE.md` - Complete setup and deployment
- `TEMPLATE_INSTRUCTIONS.md` - How to create templates
- `test-api.js` - Example API calls

## 🤝 Support

Check the logs:
```bash
# Local development
npm run dev

# Production (Railway)
railway logs
```

## 📄 License

MIT

---

**Built for property management lease automation** 🏢
