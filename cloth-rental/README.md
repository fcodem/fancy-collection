# RentStyle — Cloth Rental Management

A complete billing and management web app for your cloth rental business.

## Features

- **Dashboard** — Overview of inventory, revenue, active/overdue rentals
- **Inventory** — Catalog of sarees, lehengas, suits, etc. with daily rates and deposits
- **Customers** — Customer database with rental history
- **Rentals** — Book items, track dates, process returns with late/damage fees
- **Billing** — Auto-generated invoices, payment tracking (cash/card/UPI/bank)
- **Reports** — Monthly revenue, popular items, payment breakdown
- **Print Invoices** — Professional printable invoices

## Quick Start

### 1. Install dependencies

```powershell
cd "C:\Users\asus\OneDrive\Desktop\ssdn soft\cloth-rental"
pip install -r requirements.txt
```

### 2. Run the app

```powershell
python app.py
```

Or double-click `start.bat`.

### 3. Open in browser

Go to **http://localhost:5000**

Sample data (customers and inventory) is loaded automatically on first run.

## Usage Flow

1. **Add inventory** — Go to Inventory → Add Item (set daily rate & deposit)
2. **Add customers** — Go to Customers → Add Customer
3. **Create rental** — Rentals → New Rental → select customer, dates, items
4. **Invoice auto-created** — View under Billing
5. **Record payment** — Open invoice → Record Payment
6. **Process return** — Open rental → Mark as Returned (add late/damage fees if needed)

## Data Storage

All data is stored locally in `cloth_rental.db` (SQLite). Back up this file regularly.
