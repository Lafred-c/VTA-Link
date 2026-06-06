# Operix — Team Setup Guide

Get the project running locally in 5 steps.

---

## What You Need Installed First

Download and install these if you don't have them:

- **Node.js 20+** → https://nodejs.org (click the "LTS" download button)
- **Git** → https://git-scm.com

Verify after installing — open a terminal and run:
```bash
node --version    # must show v20.x.x or higher
git --version
```

---

## Step 1 — Clone the Repository

```bash
git clone <paste-the-repo-url-here>
cd operix
```

---

## Step 2 — Place the `.env` Files

You should have received **two** `.env` files from the team lead. Place them exactly as shown:

```
operix/
├── backend/
└── frontend/
    └── .env        ← place .env here
```

---

## Step 3 — Install Dependencies

Open a **new terminal tab**, then:
```bash
cd frontend
npm install
```

---

## Step 4 — Run the Project

**Terminal 1 — start the frontend:**
```bash
cd frontend
npm run dev
```
✅ You should see: `Local: http://localhost:5173/`

Open **http://localhost:5173** in your browser. Done.

---

## Troubleshooting

**`npm install` throws errors**
→ Your Node.js is too old. Download Node 20 LTS from https://nodejs.org and reinstall.

**Backend crashes immediately**
→ The `.env` file is missing or in the wrong folder. Double-check Step 2.

**Frontend shows a blank screen or crashes**
→ The frontend `.env` is missing. Double-check Step 2. Also restart `npm run dev` after placing the file.

**Port 5000 or 5173 already in use**
→ Something else is using that port. Close other dev servers or restart your computer.
