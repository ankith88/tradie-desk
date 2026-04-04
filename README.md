# 🔧 Tradie Desk

AI-powered admin automation for Australian trades businesses. Built for **Rapid Response Plumbing** (and easily adapted for any trade).

**What it automates:**
- ✉️ Professional quote emails (GPT-4o written, PDF attached)
- 🔁 Follow-up emails when quotes aren't accepted (48h auto-trigger)
- 📅 Job scheduling dashboard
- 🧾 Tax invoices with GST breakdown (PDF, auto-emailed on job completion)
- 💸 Payment reminders at 7 and 14 days overdue

---

## Quick Start

### 1. Install Dependencies

```bash
# Backend
npm install

# Frontend
cd client && npm install && cd ..
```

### 2. Configure Environment Variables

```bash
cp .env.example .env
```

Open `.env` and fill in your keys:

| Variable | Where to get it |
|---|---|
| `OPENAI_API_KEY` | [platform.openai.com](https://platform.openai.com) → API Keys |
| `RESEND_API_KEY` | [resend.com](https://resend.com) → API Keys (free tier: 3k emails/month) |
| `AIRTABLE_API_KEY` | [airtable.com](https://airtable.com) → Account → Developer Hub → Personal Access Tokens |
| `AIRTABLE_BASE_ID` | Open your Airtable base → Help → API → copy `appXXXXXX` from the URL |
| `BUSINESS_NAME` | Your business name |
| `BUSINESS_ABN` | Your ABN |
| `BUSINESS_EMAIL` | Your business email (must be verified in Resend) |

### 3. Set Up Airtable

Create a new Airtable base with **3 tables** (exact field names matter):

#### Table: `Quotes`
| Field | Type |
|---|---|
| quoteNumber | Single line text |
| customerName | Single line text |
| customerEmail | Email |
| customerPhone | Phone |
| jobType | Single line text |
| location | Single line text |
| estimatedHours | Number |
| materialsNeeded | Long text |
| totalExGST | Currency |
| gstAmount | Currency |
| totalIncGST | Currency |
| status | Single select: `Sent`, `Followed Up`, `Accepted`, `Rejected` |
| emailBody | Long text |
| createdAt | Date (with time) |
| validUntil | Date (with time) |
| followUpSentAt | Date (with time) |

#### Table: `Jobs`
| Field | Type |
|---|---|
| jobNumber | Single line text |
| customerName | Single line text |
| customerEmail | Email |
| customerPhone | Phone |
| jobType | Single line text |
| address | Single line text |
| scheduledDate | Date |
| scheduledTime | Single line text |
| status | Single select: `Scheduled`, `In Progress`, `Completed`, `Invoiced` |
| notes | Long text |
| quoteRef | Single line text |
| createdAt | Date (with time) |

#### Table: `Invoices`
| Field | Type |
|---|---|
| invoiceNumber | Single line text |
| quoteRef | Single line text |
| jobRef | Single line text |
| customerName | Single line text |
| customerEmail | Email |
| customerPhone | Phone |
| jobType | Single line text |
| location | Single line text |
| totalExGST | Currency |
| gstAmount | Currency |
| totalIncGST | Currency |
| issueDate | Date |
| dueDate | Date |
| status | Single select: `Unpaid`, `Paid`, `Overdue`, `Cancelled` |
| firstReminderSentAt | Date (with time) |
| secondReminderSentAt | Date (with time) |

### 4. Run the App

```bash
npm run dev
```

- **Backend** starts at: http://localhost:3001
- **Frontend** starts at: http://localhost:3000

---

## Running the Demo

Visit the **⚡ Demo** tab in the UI, or hit the API directly:

```bash
curl http://localhost:3001/api/demo
```

This will:
1. Generate a GPT-4o written quote email for "John Mitchell" (hot water system)
2. Attach a PDF quote and send it to your configured email
3. Send a personalised follow-up email (simulating 48h wait)
4. Create a scheduled job in the dashboard
5. Generate a PDF tax invoice with GST and send it
6. Return a complete step-by-step log of every action

**Demo runs in ~15-20 seconds** (GPT API calls + PDF generation + email sends).

> 💡 Set `DEMO_EMAIL` in your `.env` to route all demo emails to yourself instead of the customer.

---

## API Reference

### Quotes
```
POST   /api/quotes           Create & send a quote
GET    /api/quotes           List all quotes
GET    /api/quotes/:id       Get a quote
PATCH  /api/quotes/:id       Update status {status: 'Accepted'}
```

**Create quote body:**
```json
{
  "customerName": "Jane Smith",
  "customerEmail": "jane@example.com",
  "customerPhone": "0411 222 333",
  "jobType": "Leak Repair",
  "location": "15 Park St, Bondi NSW 2026",
  "estimatedHours": 2,
  "materialsNeeded": "Copper pipe fittings, thread tape",
  "materialsCost": 45
}
```

### Jobs
```
POST   /api/jobs             Schedule a job
GET    /api/jobs             List all jobs
GET    /api/jobs/:id         Get a job
PATCH  /api/jobs/:id         Update status/date/notes
```

### Invoices
```
POST   /api/invoices              Create & send invoice
GET    /api/invoices              List all invoices
GET    /api/invoices/:id          Get an invoice
PATCH  /api/invoices/:id/status   Mark Paid/Unpaid
```

### Demo
```
GET    /api/demo             Run full end-to-end demo
```

---

## How the Automation Works

### Quote Follow-Up (Cron)
Every 6 hours, the server checks for quotes that:
- Have status `Sent` (not yet accepted/rejected)
- Were created more than 48 hours ago
- Have no follow-up sent yet

For each match, GPT writes a personalised follow-up email and sends it automatically. No manual work needed.

### Payment Reminders (Cron)
Every 6 hours:
- **7 days overdue** → sends a gentle reminder (GPT-written)
- **14 days overdue** → sends a firmer reminder (GPT-written)

Both reminders track `firstReminderSentAt` / `secondReminderSentAt` in Airtable to avoid duplicates.

---

## Project Structure

```
tradie_desk/
├── src/
│   ├── index.js                    # Express server + cron init
│   ├── routes/
│   │   ├── quotes.routes.js
│   │   ├── jobs.routes.js
│   │   ├── invoices.routes.js
│   │   └── demo.routes.js
│   ├── controllers/
│   │   ├── quotes.controller.js    # Quote creation workflow
│   │   ├── jobs.controller.js      # Job scheduling
│   │   ├── invoices.controller.js  # Invoice generation
│   │   └── demo.controller.js      # End-to-end demo
│   └── services/
│       ├── openai.service.js       # GPT-4o email generation
│       ├── email.service.js        # Resend email sending
│       ├── pdf.service.js          # pdf-lib quote/invoice PDFs
│       ├── airtable.service.js     # Database operations
│       └── cron.service.js         # Background automation jobs
├── client/
│   └── src/
│       ├── App.js                  # Tab navigation
│       └── pages/
│           ├── QuoteForm.js        # Quote creation UI + list
│           ├── JobsDashboard.js    # Kanban-style job board
│           ├── InvoiceForm.js      # Invoice creation UI + list
│           └── DemoRunner.js       # One-click demo UI
├── .env.example                    # All required env vars
└── package.json
```

---

## GST Calculation

All invoices and quotes follow Australian GST rules:
- GST rate: **10%**
- Formula: `Total Inc GST = Subtotal × 1.10`
- Shown separately on all PDFs: `Subtotal (ex GST)` + `GST (10%)` = `Total (inc GST)`
- All amounts in **AUD**

---

## Adapting for Other Trades

To adapt for a different business:
1. Update `.env` with the new business details
2. Change the job types in the `<select>` dropdowns in the frontend
3. Update the hourly rate in `quotes.controller.js` (currently `$120/hr`)
4. The AI will automatically use the business name/context from `.env`

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Node.js + Express |
| Frontend | React + Tailwind CSS |
| AI | OpenAI GPT-4o |
| Database | Airtable |
| Email | Resend |
| PDF | pdf-lib |
| Scheduling | node-cron |

---

*Built for Australian trades businesses. All prices in AUD. GST registered.*
