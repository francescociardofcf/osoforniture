# osoforniture

## Backend API

Run:

```bash
npm run start
```

App URL: `http://localhost:3001`

Open the storefront through that URL, not by double-clicking `index.html`, because the frontend now loads products, orders, and stats from the backend API.

### Endpoints

- `GET /api/health`
- `GET /api/products`
- `POST /api/products`
- `PUT /api/products/:id`
- `DELETE /api/products/:id`
- `GET /api/orders`
- `GET /api/orders/:id`
- `POST /api/orders`
- `PATCH /api/orders/:id/status`
- `GET /api/admin/stats`

### Order create payload example

```json
{
  "customerName": "Anna K",
  "customerEmail": "anna@example.com",
  "items": [
    { "productId": "p1", "qty": 1 },
    { "productId": "p2", "qty": 2 }
  ]
}
```
