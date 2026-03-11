const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");
const { randomUUID } = require("node:crypto");

const PORT = Number(process.env.PORT || 3001);
const DATA_DIR = path.join(__dirname, "data");
const STORE_PATH = path.join(DATA_DIR, "store.json");
const APP_PATH = path.join(__dirname, "..", "index.html");

const ORDER_STATUS = ["pending", "paid", "preparing", "shipped", "delivered", "cancelled"];

async function ensureStore() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(STORE_PATH);
  } catch {
    const seed = {
      products: [
        { id: "p1", name: "Nordic Lounge Chair", category: "Seating", price: 449, stock: 8, active: true },
        { id: "p2", name: "Linea Dining Table", category: "Tables", price: 980, stock: 3, active: true },
        { id: "p3", name: "Cloud Modular Sofa", category: "Seating", price: 1780, stock: 0, active: true },
        { id: "p4", name: "Arc Floor Lamp", category: "Lighting", price: 320, stock: 12, active: true },
        { id: "p5", name: "Oak Sideboard", category: "Storage", price: 1240, stock: 2, active: true },
        { id: "p6", name: "Pebble Coffee Table", category: "Tables", price: 630, stock: 6, active: true }
      ],
      orders: []
    };
    await writeStore(seed);
  }
}

async function readStore() {
  const raw = await fs.readFile(STORE_PATH, "utf8");
  return JSON.parse(raw);
}

async function writeStore(data) {
  await fs.writeFile(STORE_PATH, JSON.stringify(data, null, 2), "utf8");
}

async function sendFile(res, filePath, contentType) {
  const body = await fs.readFile(filePath);
  res.writeHead(200, {
    "Content-Type": contentType,
    "Cache-Control": "no-store"
  });
  res.end(body);
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  });
  res.end(body);
}

function sendNoContent(res) {
  res.writeHead(204, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  });
  res.end();
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", chunk => {
      body += chunk;
      if (body.length > 1_000_000) {
        reject(new Error("Payload too large"));
      }
    });
    req.on("end", () => {
      if (!body) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}

function notFound(res) {
  sendJson(res, 404, { error: "Not found" });
}

function badRequest(res, message) {
  sendJson(res, 400, { error: message });
}

function validateProductInput(input) {
  if (!input || typeof input !== "object") return "Invalid payload";
  if (!input.name || typeof input.name !== "string") return "name is required";
  if (!input.category || typeof input.category !== "string") return "category is required";
  if (typeof input.price !== "number" || Number.isNaN(input.price) || input.price < 0) return "price must be a non-negative number";
  if (!Number.isInteger(input.stock) || input.stock < 0) return "stock must be a non-negative integer";
  return null;
}

function validateOrderInput(input) {
  if (!input || typeof input !== "object") return "Invalid payload";
  if (!input.customerName || typeof input.customerName !== "string") return "customerName is required";
  if (!Array.isArray(input.items) || input.items.length === 0) return "items must be a non-empty array";
  for (const item of input.items) {
    if (!item.productId || typeof item.productId !== "string") return "items.productId is required";
    if (!Number.isInteger(item.qty) || item.qty <= 0) return "items.qty must be a positive integer";
  }
  return null;
}

function toOrderSummary(order) {
  return {
    id: order.id,
    customerName: order.customerName,
    status: order.status,
    total: order.total,
    createdAt: order.createdAt,
    itemCount: order.items.reduce((sum, i) => sum + i.qty, 0)
  };
}

async function handleRequest(req, res) {
  if (req.method === "OPTIONS") {
    sendNoContent(res);
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host || `localhost:${PORT}`}`);
  const pathname = url.pathname;

  if ((pathname === "/" || pathname === "/index.html") && req.method === "GET") {
    await sendFile(res, APP_PATH, "text/html; charset=utf-8");
    return;
  }

  if (pathname === "/api/health" && req.method === "GET") {
    sendJson(res, 200, { ok: true, service: "oso-backend", timestamp: new Date().toISOString() });
    return;
  }

  const store = await readStore();

  if (pathname === "/api/products" && req.method === "GET") {
    sendJson(res, 200, store.products);
    return;
  }

  if (pathname === "/api/products" && req.method === "POST") {
    const payload = await parseBody(req);
    const err = validateProductInput(payload);
    if (err) return badRequest(res, err);

    const product = {
      id: randomUUID(),
      name: payload.name.trim(),
      category: payload.category.trim(),
      price: Number(payload.price),
      stock: payload.stock,
      active: payload.active !== false
    };

    store.products.push(product);
    await writeStore(store);
    sendJson(res, 201, product);
    return;
  }

  if (pathname.startsWith("/api/products/") && req.method === "PUT") {
    const id = pathname.split("/").pop();
    const payload = await parseBody(req);
    const err = validateProductInput(payload);
    if (err) return badRequest(res, err);

    const idx = store.products.findIndex(p => p.id === id);
    if (idx === -1) return notFound(res);

    store.products[idx] = {
      ...store.products[idx],
      name: payload.name.trim(),
      category: payload.category.trim(),
      price: Number(payload.price),
      stock: payload.stock,
      active: payload.active !== false
    };

    await writeStore(store);
    sendJson(res, 200, store.products[idx]);
    return;
  }

  if (pathname.startsWith("/api/products/") && req.method === "DELETE") {
    const id = pathname.split("/").pop();
    const before = store.products.length;
    store.products = store.products.filter(p => p.id !== id);
    if (store.products.length === before) return notFound(res);

    await writeStore(store);
    sendNoContent(res);
    return;
  }

  if (pathname === "/api/orders" && req.method === "GET") {
    sendJson(res, 200, store.orders.map(toOrderSummary));
    return;
  }

  if (pathname.startsWith("/api/orders/") && req.method === "GET") {
    const id = pathname.split("/").pop();
    const order = store.orders.find(o => o.id === id);
    if (!order) return notFound(res);
    sendJson(res, 200, order);
    return;
  }

  if (pathname === "/api/orders" && req.method === "POST") {
    const payload = await parseBody(req);
    const err = validateOrderInput(payload);
    if (err) return badRequest(res, err);

    const lineItems = [];
    let total = 0;

    for (const item of payload.items) {
      const product = store.products.find(p => p.id === item.productId && p.active !== false);
      if (!product) return badRequest(res, `Unknown product: ${item.productId}`);
      if (product.stock < item.qty) return badRequest(res, `Insufficient stock for ${product.name}`);

      product.stock -= item.qty;
      const lineTotal = product.price * item.qty;
      total += lineTotal;

      lineItems.push({
        productId: product.id,
        name: product.name,
        unitPrice: product.price,
        qty: item.qty,
        lineTotal
      });
    }

    const order = {
      id: randomUUID(),
      customerName: payload.customerName.trim(),
      customerEmail: typeof payload.customerEmail === "string" ? payload.customerEmail.trim() : "",
      notes: typeof payload.notes === "string" ? payload.notes.trim() : "",
      items: lineItems,
      total,
      status: "pending",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    store.orders.unshift(order);
    await writeStore(store);
    sendJson(res, 201, order);
    return;
  }

  if (pathname.startsWith("/api/orders/") && pathname.endsWith("/status") && req.method === "PATCH") {
    const segments = pathname.split("/");
    const id = segments[3];
    const payload = await parseBody(req);
    if (!payload.status || !ORDER_STATUS.includes(payload.status)) {
      return badRequest(res, `status must be one of: ${ORDER_STATUS.join(", ")}`);
    }

    const order = store.orders.find(o => o.id === id);
    if (!order) return notFound(res);

    order.status = payload.status;
    order.updatedAt = new Date().toISOString();
    await writeStore(store);
    sendJson(res, 200, order);
    return;
  }

  if (pathname === "/api/admin/stats" && req.method === "GET") {
    const totalOrders = store.orders.length;
    const totalRevenue = store.orders.reduce((sum, o) => sum + o.total, 0);
    const pendingOrders = store.orders.filter(o => ["pending", "paid", "preparing"].includes(o.status)).length;
    const lowStock = store.products.filter(p => p.stock <= 3).length;

    sendJson(res, 200, {
      totalOrders,
      totalRevenue,
      pendingOrders,
      lowStock,
      productCount: store.products.length
    });
    return;
  }

  notFound(res);
}

async function start() {
  await ensureStore();

  const server = http.createServer(async (req, res) => {
    try {
      await handleRequest(req, res);
    } catch (error) {
      if (error.message === "Invalid JSON") {
        badRequest(res, "Invalid JSON");
        return;
      }
      if (error.message === "Payload too large") {
        sendJson(res, 413, { error: "Payload too large" });
        return;
      }
      console.error(error);
      sendJson(res, 500, { error: "Internal server error" });
    }
  });

  server.listen(PORT, () => {
    console.log(`OSO backend running at http://localhost:${PORT}`);
  });
}

start();
