# P7 — Admin Dashboard

All admin pages protected by middleware (role === "admin").

## /admin — Dashboard

### src/app/admin/page.tsx
Cards showing:
- Pending orders (status: submitted) — count + total value
- This month revenue (sum of paid/ordered/shipped/delivered orders)
- Active clients count
- Last price sync timestamp

Quick links to each admin section.

## /admin/orders — Order Management

### src/app/admin/orders/page.tsx
- All orders from all clients, filterable by status
- Table: Order #, Client, Date, Items, Total, Status, [Actions]
- Click to expand: see order items inline
- Actions per status:
  - submitted → "Send Quote" (sets status to quoted, optionally adjust prices)
  - quoted → "Mark Confirmed" (client agreed)
  - confirmed → "Mark Paid"
  - paid → "Mark Ordered" (placed with CardRush)
  - ordered → "Mark Shipped"
  - shipped → "Mark Delivered"
  - Any → "Reject/Cancel"
- PATCH /api/orders/[id] handles status transitions

### PATCH /api/orders/[id]/route.ts
- Admin only
- Update status, optionally update line item prices (for quote adjustments)
- Update order updatedAt

## /admin/prices — Price Management

### src/app/admin/prices/page.tsx
- "Sync Now" button → calls POST /api/sync, shows progress/result
- Last sync info: timestamp, cards synced, any errors
- Price table with override ability: click a price to edit manually
- CSV upload fallback: upload a CSV with columns (sku, jpy_price) to bulk update
- Show cards with "Not Available" status from CardRush (flag them)

### POST /api/prices/upload (route.ts)
- Accept CSV upload, parse, upsert cards table

## /admin/clients — Client Management

### src/app/admin/clients/page.tsx
- Client list: name, company, email, current month spend, prior month spend, discount tier
- Click to view: order history for that client
- Edit: can manually set volume discount override
- "Add Client" form: name, email, company, password (generates invite)

### POST /api/clients (route.ts)
- Admin only, create new client with hashed password

Commit: `feat: admin dashboard — orders, prices, clients`
