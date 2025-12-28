# NJ Standard Lease Template - Word Document Instructions

## How to Create Your Word Template

Create a Word document with the following structure. Use the special syntax for variables and conditional sections.

### Variables Syntax
Use curly braces for variables: {variable_name}

Example:
```
Tenant Name: {tenant1_name}
Monthly Rent: ${monthly_rent}
Property Address: {property_address}
```

### Conditional Sections Syntax
Use special tags to show/hide sections based on data:

**To show section only if variable has value:**
```
{#tenant2_name}
Additional Tenant: {tenant2_name}
Email: {tenant2_email}
Signature: [[Tenant2_Signature]]
{/tenant2_name}
```

**If tenant2_name is empty, the ENTIRE section disappears (no blank lines).**

---

## Complete Template Structure

```
LEASE AGREEMENT

Lease Number: {lease_number}
Date: {current_date}

PARTIES

Landlord: {landlord_name}
Email: {landlord_email}

Tenant(s):

1. {tenant1_name}
   Email: {tenant1_email}

{#tenant2_name}
2. {tenant2_name}
   Email: {tenant2_email}
{/tenant2_name}

{#tenant3_name}
3. {tenant3_name}
   Email: {tenant3_email}
{/tenant3_name}

{#tenant4_name}
4. {tenant4_name}
   Email: {tenant4_email}
{/tenant4_name}

{#agent_name}
Agent: {agent_name}
Email: {agent_email}
{/agent_name}

PROPERTY

Address: {property_address}
Unit: {unit_number}
Property Name: {property_name}

LEASE TERMS

Monthly Rent: ${monthly_rent}
Security Deposit: ${security_deposit}
Pet Deposit: ${pet_deposit}
Parking Fee: ${parking_fee}

Lease Term: {lease_term_months} months
Start Date: {start_date}
End Date: {end_date}

Utilities Responsibility: {utilities}

[Insert rest of your lease terms here]

SIGNATURES

TENANT SIGNATURE(S)

By signing below, Tenant(s) agree to all terms and conditions:

Tenant 1: {tenant1_name}
Signature: [[Tenant1_Signature]]        Date: [[Tenant1_Date]]

{#tenant2_name}
Tenant 2: {tenant2_name}
Signature: [[Tenant2_Signature]]        Date: [[Tenant2_Date]]
{/tenant2_name}

{#tenant3_name}
Tenant 3: {tenant3_name}
Signature: [[Tenant3_Signature]]        Date: [[Tenant3_Date]]
{/tenant3_name}

{#tenant4_name}
Tenant 4: {tenant4_name}
Signature: [[Tenant4_Signature]]        Date: [[Tenant4_Date]]
{/tenant4_name}

{#agent_name}
AGENT SIGNATURE

Agent: {agent_name}
Signature: [[Agent_Signature]]          Date: [[Agent_Date]]
{/agent_name}

LANDLORD SIGNATURE

Landlord: {landlord_name}
Signature: [[Landlord_Signature]]       Date: [[Landlord_Date]]
```

---

## Important Notes

1. **Anchor Tags for DocuSign:**
   - Use [[AnchorName]] for signature placement
   - These stay as text in the PDF
   - DocuSign will find them and place signature fields

2. **Conditional Sections:**
   - Opening tag: {#variable_name}
   - Closing tag: {/variable_name}
   - Everything between is hidden if variable is empty

3. **No Blank Lines:**
   - Conditional sections completely disappear
   - No extra spacing left behind

4. **File Naming:**
   - Save as: nj-standard-lease.docx
   - Place in: /templates/ folder
   - No spaces in filename

5. **Addenda:**
   - Create separate files for each addendum
   - Use same variable syntax
   - Place in: /templates/addenda/ folder
   - Example: pet-addendum.docx, parking-agreement.docx

---

## Testing Your Template

After creating your template:

1. Save as .docx format (not .doc)
2. Place in the templates folder
3. Run: npm run dev
4. Run: npm test
5. Check the generated PDF

The conditional sections should hide/show based on test data.
```

---

## Available Variables

All these variables are available in your template:

**Lease Info:**
- {lease_id}
- {lease_number}
- {current_date}

**Tenants:**
- {tenant1_name}, {tenant1_email}
- {tenant2_name}, {tenant2_email}
- {tenant3_name}, {tenant3_email}
- {tenant4_name}, {tenant4_email}

**Agent:**
- {agent_name}, {agent_email}

**Landlord:**
- {landlord_name}, {landlord_email}

**Property:**
- {property_address}
- {unit_number}
- {property_name}

**Financial:**
- {monthly_rent}
- {security_deposit}
- {pet_deposit}
- {parking_fee}

**Terms:**
- {lease_term_months}
- {start_date}
- {end_date}
- {utilities}
