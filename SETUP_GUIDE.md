# Lease Generator API - Complete Setup Guide

## 📋 Table of Contents
1. [Prerequisites](#prerequisites)
2. [Local Setup](#local-setup)
3. [Creating Your Templates](#creating-your-templates)
4. [Testing Locally](#testing-locally)
5. [AWS S3 Setup](#aws-s3-setup)
6. [Deployment to Railway](#deployment-to-railway)
7. [Connecting to Zapier](#connecting-to-zapier)
8. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### What You Need:
- [ ] Computer (Mac, Windows, or Linux)
- [ ] Node.js 18+ installed
- [ ] LibreOffice installed (for PDF conversion)
- [ ] AWS account (free tier works)
- [ ] Code editor (VS Code recommended)
- [ ] Terminal/Command Prompt

---

## Local Setup

### Step 1: Install Node.js

**Mac:**
```bash
# Install Homebrew (if not already installed)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Install Node.js
brew install node

# Verify
node --version  # Should show v18 or higher
npm --version
```

**Windows:**
1. Download from: https://nodejs.org
2. Install LTS version (20.x)
3. Check "Add to PATH"
4. Verify in Command Prompt:
```cmd
node --version
npm --version
```

**Linux:**
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```

---

### Step 2: Install LibreOffice

**Why needed:** Converts Word documents to PDF

**Mac:**
```bash
brew install --cask libreoffice
```

**Windows:**
1. Download: https://www.libreoffice.org/download/download/
2. Run installer
3. Add to PATH:
   - Find installation path (usually `C:\Program Files\LibreOffice\program`)
   - Add to System Environment Variables

**Linux:**
```bash
sudo apt-get install libreoffice
```

**Verify installation:**
```bash
libreoffice --version
```

---

### Step 3: Set Up Project

```bash
# Navigate to the project folder
cd lease-generator-api

# Install dependencies
npm install

# Create .env file from example
cp .env.example .env

# Create necessary directories
mkdir -p templates/addenda
mkdir -p temp
```

---

### Step 4: Configure Environment Variables

Edit `.env` file:

```env
PORT=3000
NODE_ENV=development

# AWS S3 (we'll set this up next)
AWS_ACCESS_KEY_ID=your_key_here
AWS_SECRET_ACCESS_KEY=your_secret_here
AWS_REGION=us-east-1
S3_BUCKET_NAME=your-bucket-name
```

---

## Creating Your Templates

### Step 1: Prepare Your Word Template

1. Open Microsoft Word (or Google Docs, then export as .docx)
2. Create your lease agreement
3. Use the special syntax:
   - Variables: `{tenant1_name}`
   - Conditionals: `{#tenant2_name}...{/tenant2_name}`
   - Anchors: `[[Tenant1_Signature]]`

**See `TEMPLATE_INSTRUCTIONS.md` for complete syntax guide.**

### Step 2: Save Template

```
Save as: nj-standard-lease.docx
Location: /templates/nj-standard-lease.docx
Format: Word Document (.docx)
```

### Step 3: Create Addenda (Optional)

```
Save as: pet-addendum.docx
Location: /templates/addenda/pet-addendum.docx

Save as: parking-agreement.docx
Location: /templates/addenda/parking-agreement.docx
```

**Each addendum uses the same variable syntax.**

---

## Testing Locally

### Step 1: Start the Server

```bash
# Development mode (auto-restart on changes)
npm run dev

# You should see:
# 🚀 Lease Generation API running on port 3000
# 📍 Health check: http://localhost:3000/
```

### Step 2: Test in Browser

Open browser: http://localhost:3000

You should see:
```json
{
  "status": "ok",
  "message": "Lease Generation API is running"
}
```

### Step 3: Run Test Script

In a new terminal:

```bash
npm test
```

This will:
- ✅ Check health endpoint
- ✅ List your templates
- ✅ Generate a test PDF
- ✅ Upload to S3 (if configured)

### Step 4: Test with Postman

Download Postman: https://www.postman.com/downloads/

**Test Request:**

```
POST http://localhost:3000/api/generate-lease
Content-Type: application/json

Body:
{
  "templateName": "nj-standard-lease",
  "selectedAddenda": ["pet-addendum"],
  "leaseData": {
    "lease_id": "TEST-001",
    "tenant1_name": "John Smith",
    "tenant1_email": "[email protected]",
    "tenant2_name": "",
    "landlord_name": "Jane Landlord",
    "landlord_email": "[email protected]",
    "property_address": "123 Main St",
    "monthly_rent": "2000",
    "security_deposit": "2000",
    "start_date": "02/01/2025",
    "end_date": "01/31/2026"
  }
}
```

**Expected Response:**
```json
{
  "success": true,
  "pdfUrl": "https://your-bucket.s3.amazonaws.com/...",
  "previewUrl": "https://...",
  "fileName": "lease-TEST-001.pdf"
}
```

---

## AWS S3 Setup

### Step 1: Create S3 Bucket

1. Go to AWS Console: https://console.aws.amazon.com/s3
2. Click "Create bucket"
3. Bucket name: `your-company-leases` (must be globally unique)
4. Region: `us-east-1` (or your preferred region)
5. Block Public Access: **Keep enabled** (we'll use signed URLs)
6. Click "Create bucket"

### Step 2: Create IAM User

1. Go to IAM: https://console.aws.amazon.com/iam
2. Click "Users" → "Create user"
3. User name: `lease-api-user`
4. Click "Next"
5. Attach policies:
   - Click "Attach policies directly"
   - Search and select: `AmazonS3FullAccess`
6. Click "Next" → "Create user"

### Step 3: Create Access Keys

1. Click on the new user
2. Go to "Security credentials" tab
3. Scroll to "Access keys"
4. Click "Create access key"
5. Select "Application running on AWS compute service"
6. Click "Next" → "Create access key"
7. **Copy both keys** (you won't see secret key again!)

### Step 4: Update .env File

```env
AWS_ACCESS_KEY_ID=AKIA...your_key_here
AWS_SECRET_ACCESS_KEY=wJalr...your_secret_here
AWS_REGION=us-east-1
S3_BUCKET_NAME=your-company-leases
```

### Step 5: Test S3 Upload

Restart server and run test:
```bash
npm run dev
npm test
```

Check your S3 bucket - you should see a PDF file!

---

## Deployment to Railway

### Why Railway?
- ✅ Easy deployment
- ✅ Free tier available ($5 credit/month)
- ✅ Automatic HTTPS
- ✅ Built-in logging
- ✅ One-click deploy

### Step 1: Create Railway Account

1. Go to: https://railway.app
2. Sign up with GitHub
3. Verify email

### Step 2: Install Railway CLI (Optional)

```bash
# Mac
brew install railway

# Windows (with npm)
npm install -g @railway/cli

# Login
railway login
```

### Step 3: Deploy from GitHub

**Option A: Deploy from GitHub (Recommended)**

1. Push your code to GitHub:
```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/yourusername/lease-api.git
git push -u origin main
```

2. In Railway dashboard:
   - Click "New Project"
   - Select "Deploy from GitHub repo"
   - Select your repository
   - Railway auto-detects Node.js

**Option B: Deploy with CLI**

```bash
# In your project folder
railway init
railway up
```

### Step 4: Add Environment Variables

In Railway dashboard:
1. Click on your project
2. Go to "Variables" tab
3. Add each variable from your `.env` file:
   - `AWS_ACCESS_KEY_ID`
   - `AWS_SECRET_ACCESS_KEY`
   - `AWS_REGION`
   - `S3_BUCKET_NAME`
   - `NODE_ENV=production`

### Step 5: Install LibreOffice on Railway

Create a file called `nixpacks.toml` in your project root:

```toml
[phases.setup]
nixPkgs = ["nodejs", "libreoffice"]
```

Commit and push:
```bash
git add nixpacks.toml
git commit -m "Add LibreOffice to deployment"
git push
```

### Step 6: Get Your API URL

In Railway dashboard:
1. Click "Settings"
2. Go to "Networking"
3. Click "Generate Domain"
4. Copy your URL: `https://your-app.railway.app`

### Step 7: Test Deployed API

```bash
curl https://your-app.railway.app/
```

Should return:
```json
{
  "status": "ok",
  "message": "Lease Generation API is running"
}
```

---

## Connecting to Zapier

### Step 1: Create Webhook Trigger in Zapier

1. Go to Zapier
2. Create new Zap
3. **Trigger:** Webhook - Catch Hook
4. Copy webhook URL
5. Test with Glide button

### Step 2: Call Your API

**Action:** Webhooks by Zapier - POST

**Setup:**
```
URL: https://your-app.railway.app/api/generate-lease

Method: POST

Headers:
Content-Type: application/json

Body (JSON):
{
  "templateName": "nj-standard-lease",
  "selectedAddenda": {{addenda_from_glide}},
  "leaseData": {
    "lease_id": {{lease_id_from_glide}},
    "tenant1_name": {{tenant1_name}},
    "tenant1_email": {{tenant1_email}},
    "tenant2_name": {{tenant2_name}},
    "landlord_name": {{landlord_name}},
    "landlord_email": {{landlord_email}},
    "property_address": {{property_address}},
    "monthly_rent": {{monthly_rent}},
    "security_deposit": {{security_deposit}},
    "start_date": {{start_date}},
    "end_date": {{end_date}}
  }
}
```

**Response:**
```json
{
  "success": true,
  "pdfUrl": "https://...",
  "previewUrl": "https://...",
  "fileName": "lease-LS-001.pdf"
}
```

### Step 3: Save to Glide

**Action:** Glide - Update Row

```
Preview URL: {{previewUrl from webhook}}
PDF URL: {{pdfUrl from webhook}}
Status: Ready to Review
```

### Step 4: Send to DocuSign

**Action:** Webhooks by Zapier - Custom Request

```
POST https://na3.docusign.net/restapi/v2.1/accounts/{accountId}/envelopes

Headers:
Authorization: Bearer {{docusign_token}}
Content-Type: application/json

Body:
{
  "emailSubject": "Lease Agreement - Signature Required",
  "status": "sent",
  "documents": [{
    "documentId": "1",
    "name": "Lease Agreement",
    "fileExtension": "pdf",
    "documentBase64": "{{base64_from_pdf_url}}"
  }],
  "recipients": {
    "signers": [...]  // Build dynamically
  }
}
```

---

## Troubleshooting

### Error: "LibreOffice not found"

**Mac:**
```bash
which libreoffice
# If nothing appears:
brew install --cask libreoffice
```

**Windows:**
- Add LibreOffice to PATH
- Restart terminal

**Railway:**
- Ensure `nixpacks.toml` is committed
- Redeploy

---

### Error: "Template not found"

**Check:**
```bash
ls templates/
# Should show: nj-standard-lease.docx
```

**Verify filename matches exactly:**
- No spaces
- Lowercase
- .docx extension

---

### Error: "AWS credentials not found"

**Check .env file:**
```bash
cat .env
# Should show AWS keys
```

**Verify keys are correct:**
- No extra spaces
- No quotes around values
- Keys start with AKIA...

---

### Error: "PDF not generated"

**Check LibreOffice works:**
```bash
libreoffice --headless --convert-to pdf --outdir /tmp test.docx
```

**Check temp directory exists:**
```bash
ls temp/
```

---

### Error: Port already in use

```bash
# Kill process on port 3000
# Mac/Linux:
lsof -ti:3000 | xargs kill -9

# Windows:
netstat -ano | findstr :3000
taskkill /PID <PID> /F
```

---

## Next Steps

1. ✅ Set up locally
2. ✅ Create your first template
3. ✅ Test generation
4. ✅ Deploy to Railway
5. ✅ Connect to Zapier
6. ✅ Build Glide UI
7. ✅ Go live!

---

## Support

If you get stuck:

1. Check logs:
```bash
# Local
npm run dev
# Railway
railway logs
```

2. Test each step independently
3. Use the test script: `npm test`
4. Check AWS S3 permissions

---

## Cost Estimates

**Monthly Costs:**

| Service | Cost |
|---------|------|
| Railway | $5-10/mo |
| AWS S3 | $1-5/mo |
| Total | $6-15/mo |

**Free tiers:**
- Railway: $5 credit/month
- AWS S3: 5GB free for 12 months

---

**You're ready to build! 🚀**
