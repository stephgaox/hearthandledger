# Hearth & Ledger
A sleek, privacy-first personal finance dashboard designed with a warm, glassmorphism "aged ledger" aesthetic.

![Hearth & Ledger Dashboard](https://raw.githubusercontent.com/xinggao/hearth-and-ledger/main/frontend/public/demo.gif)

## Overview
Hearth & Ledger is a full-stack personal finance application built to replace massive, chaotic Excel spreadsheets. It parses your bank and credit card statements locally on your machine and generates beautiful, tactile visual analytics of your spending, income, and overall cash flow.

It features:
- **Zero-Config CSV/Excel parsing:** Drag and drop exports from Chase, Amex, Discover, and more.
- **AI-Powered Scanned PDF Parsing (Optional):** Employs Anthropic's Claude to cleanly read messy, scanned paper bank statements if standard raw text extraction fails.
- **Aesthetic First:** A fully custom TailwindCSS design system rooted in warm parchment and olive tones, delivering an authentic "aged ledger" feel with dark mode support.
- **Total Privacy:** The entire application runs natively on your machine using a local SQLite database. Financial data never touches a public cloud.

## Tech Stack
- **Frontend:** React 18, Vite, TailwindCSS (Vanilla UI with strict semantic tokens), Recharts
- **Backend:** FastAPI (Python), SQLite, SQLAlchemy
- **Data Extractor:** Pandas, Pdfplumber, Anthropic Python SDK

## Quickstart

### Prerequisites
- Node.js (v18+)
- Python (v3.10+)

### 1. Clone & Setup
```bash
git clone https://github.com/YOUR_USERNAME/hearth-and-ledger.git
cd hearth-and-ledger

# Set up your environment file
cp .env.example .env
```

### 2. Add API Key (Optional)
If you wish to upload raw image screenshots or scanned paper PDFs, Hearth & Ledger uses an AI fallback parser. Open `.env` and add your key:
```env
ANTHROPIC_API_KEY=your_anthropic_api_key_here
```
*(If you only plan to upload standard CSVs, Excel files, or digital PDFs, you do not need an API key!)*

### 3. Run the App
Start both the React frontend and Python backend simultaneously:
```bash
./start.sh
```
The dashboard will securely launch at **http://localhost:5173**.

## Demo Data
Want to test the app without uploading your real bank statements?
1. Open the app in your browser.
2. Click **Upload Statement** in the top right.
3. Drag and drop all the dummy CSV files located in the `demo_monthly/` repository folder.
4. Enjoy real-time, dummy 20-month trend analysis!

## License
**Apache 2.0 with Commons Clause**

This software is "Source-Available". You are free to view, fork, modify, and use this application for your own personal financial tracking. 

However, under the Commons Clause, **you are strictly prohibited from selling this software or hosting it as a commercial service/SaaS.**
