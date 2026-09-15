# -*- coding: utf-8 -*-
"""建国水产订货系统 - Flask 后端"""

import os
import sqlite3
import uuid
from datetime import datetime
from functools import wraps

from flask import Flask, jsonify, render_template, request, session, abort

app = Flask(__name__)
app.secret_key = os.environ.get("SECRET_KEY", "jianguo-aqua-" + uuid.uuid4().hex[:16])
DB_PATH = os.path.join(os.path.dirname(__file__), "data", "orders.db")

ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "jianguo2026")


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def init_db():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    db = get_db()
    db.executescript("""
    CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        price REAL NOT NULL DEFAULT 0,
        unit TEXT NOT NULL DEFAULT '斤',
        description TEXT DEFAULT '',
        active INTEGER NOT NULL DEFAULT 1,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_no TEXT NOT NULL UNIQUE,
        customer_name TEXT NOT NULL,
        phone TEXT NOT NULL,
        address TEXT DEFAULT '',
        notes TEXT DEFAULT '',
        total REAL NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS order_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id INTEGER NOT NULL,
        product_id INTEGER,
        product_name TEXT NOT NULL,
        price REAL NOT NULL,
        quantity REAL NOT NULL DEFAULT 1,
        subtotal REAL NOT NULL DEFAULT 0,
        FOREIGN KEY (order_id) REFERENCES orders(id)
    );
    """)

    # 默认产品
    count = db.execute("SELECT COUNT(*) FROM products").fetchone()[0]
    if count == 0:
        defaults = [
            ("鲈鱼", 22.0, "斤", "新鲜活鱼"),
            ("草鱼", 12.0, "斤", "新鲜活鱼"),
            ("基围虾", 38.0, "斤", "当天到货"),
            ("花蟹", 55.0, "斤", "鲜活螃蟹"),
            ("花甲", 15.0, "斤", "新鲜贝类"),
            ("生蚝", 8.0, "只", "当天到货"),
            ("鲍鱼", 25.0, "只", "鲜活鲍鱼"),
            ("带鱼", 20.0, "斤", "冰鲜带鱼"),
        ]
        for i, (name, price, unit, desc) in enumerate(defaults):
            db.execute(
                "INSERT INTO products (name, price, unit, description, sort_order) VALUES (?,?,?,?,?)",
                (name, price, unit, desc, i)
            )
    db.commit()
    db.close()


init_db()


def login_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if not session.get("admin"):
            return jsonify({"error": "unauthorized"}), 401
        return f(*args, **kwargs)
    return decorated


# ─── Pages ───────────────────────────────────────────────────────────────

@app.route("/")
def index():
    return render_template("index.html")


@app.route("/admin")
def admin():
    return render_template("admin.html")


# ─── Auth ────────────────────────────────────────────────────────────────

@app.route("/api/login", methods=["POST"])
def login():
    data = request.json or {}
    if data.get("password") == ADMIN_PASSWORD:
        session["admin"] = True
        return jsonify({"ok": True})
    return jsonify({"error": "密码错误"}), 401


@app.route("/api/logout", methods=["POST"])
def logout():
    session.pop("admin", None)
    return jsonify({"ok": True})


@app.route("/api/check-auth")
def check_auth():
    return jsonify({"authenticated": bool(session.get("admin"))})


# ─── Products API ────────────────────────────────────────────────────────

@app.route("/api/products")
def get_products():
    db = get_db()
    rows = db.execute(
        "SELECT * FROM products WHERE active=1 ORDER BY sort_order, id"
    ).fetchall()
    db.close()
    return jsonify([dict(r) for r in rows])


@app.route("/api/products", methods=["POST"])
@login_required
def add_product():
    data = request.json or {}
    name = data.get("name", "").strip()
    if not name:
        return jsonify({"error": "名称不能为空"}), 400
    db = get_db()
    cur = db.execute(
        "INSERT INTO products (name, price, unit, description, sort_order) VALUES (?,?,?,?,?)",
        (name, float(data.get("price", 0)), data.get("unit", "斤"),
         data.get("description", ""), int(data.get("sort_order", 99)))
    )
    db.commit()
    pid = cur.lastrowid
    row = db.execute("SELECT * FROM products WHERE id=?", (pid,)).fetchone()
    db.close()
    return jsonify(dict(row)), 201


@app.route("/api/products/<int:pid>", methods=["PUT"])
@login_required
def update_product(pid):
    data = request.json or {}
    db = get_db()
    db.execute(
        "UPDATE products SET name=?, price=?, unit=?, description=?, sort_order=?, active=? WHERE id=?",
        (data.get("name", ""), float(data.get("price", 0)), data.get("unit", "斤"),
         data.get("description", ""), int(data.get("sort_order", 99)),
         1 if data.get("active", True) else 0, pid)
    )
    db.commit()
    row = db.execute("SELECT * FROM products WHERE id=?", (pid,)).fetchone()
    db.close()
    if not row:
        return jsonify({"error": "not found"}), 404
    return jsonify(dict(row))


@app.route("/api/products/<int:pid>", methods=["DELETE"])
@login_required
def delete_product(pid):
    db = get_db()
    db.execute("DELETE FROM products WHERE id=?", (pid,))
    db.commit()
    db.close()
    return jsonify({"ok": True})


@app.route("/api/admin/products")
@login_required
def admin_products():
    db = get_db()
    rows = db.execute("SELECT * FROM products ORDER BY sort_order, id").fetchall()
    db.close()
    return jsonify([dict(r) for r in rows])


# ─── Orders API ──────────────────────────────────────────────────────────

@app.route("/api/orders", methods=["POST"])
def create_order():
    data = request.json or {}
    name = data.get("customer_name", "").strip()
    phone = data.get("phone", "").strip()
    items = data.get("items", [])

    if not name or not phone:
        return jsonify({"error": "请填写姓名和电话"}), 400
    if not items:
        return jsonify({"error": "购物车为空"}), 400

    db = get_db()
    total = 0
    valid_items = []
    for item in items:
        pid = item.get("product_id")
        qty = float(item.get("quantity", 0))
        if qty <= 0:
            continue
        prod = db.execute("SELECT * FROM products WHERE id=?", (pid,)).fetchone()
        if not prod:
            continue
        subtotal = round(prod["price"] * qty, 2)
        total += subtotal
        valid_items.append((pid, prod["name"], prod["price"], qty, subtotal))

    if not valid_items:
        db.close()
        return jsonify({"error": "没有有效商品"}), 400

    order_no = datetime.now().strftime("JG%Y%m%d%H%M%S") + uuid.uuid4().hex[:4].upper()
    cur = db.execute(
        "INSERT INTO orders (order_no, customer_name, phone, address, notes, total) VALUES (?,?,?,?,?,?)",
        (order_no, name, phone, data.get("address", ""), data.get("notes", ""), round(total, 2))
    )
    order_id = cur.lastrowid
    for pid, pname, price, qty, subtotal in valid_items:
        db.execute(
            "INSERT INTO order_items (order_id, product_id, product_name, price, quantity, subtotal) VALUES (?,?,?,?,?,?)",
            (order_id, pid, pname, price, qty, subtotal)
        )
    db.commit()
    db.close()
    return jsonify({"ok": True, "order_no": order_no, "total": round(total, 2)}), 201


@app.route("/api/admin/orders")
@login_required
def admin_orders():
    status = request.args.get("status", "")
    date = request.args.get("date", "")
    db = get_db()
    query = "SELECT * FROM orders WHERE 1=1"
    params = []
    if status:
        query += " AND status=?"
        params.append(status)
    if date:
        query += " AND date(created_at)=?"
        params.append(date)
    query += " ORDER BY id DESC LIMIT 500"
    orders = db.execute(query, params).fetchall()
    result = []
    for o in orders:
        items = db.execute("SELECT * FROM order_items WHERE order_id=?", (o["id"],)).fetchall()
        od = dict(o)
        od["items"] = [dict(i) for i in items]
        result.append(od)
    db.close()
    return jsonify(result)


@app.route("/api/admin/orders/<int:oid>/status", methods=["PUT"])
@login_required
def update_order_status(oid):
    data = request.json or {}
    status = data.get("status", "")
    if status not in ("pending", "confirmed", "delivered", "cancelled"):
        return jsonify({"error": "invalid status"}), 400
    db = get_db()
    db.execute("UPDATE orders SET status=? WHERE id=?", (status, oid))
    db.commit()
    db.close()
    return jsonify({"ok": True})


@app.route("/api/admin/orders/<int:oid>", methods=["DELETE"])
@login_required
def delete_order(oid):
    db = get_db()
    db.execute("DELETE FROM order_items WHERE order_id=?", (oid,))
    db.execute("DELETE FROM orders WHERE id=?", (oid,))
    db.commit()
    db.close()
    return jsonify({"ok": True})


@app.route("/api/admin/stats")
@login_required
def admin_stats():
    db = get_db()
    today = datetime.now().strftime("%Y-%m-%d")
    today_orders = db.execute("SELECT COUNT(*) FROM orders WHERE date(created_at)=?", (today,)).fetchone()[0]
    total_orders = db.execute("SELECT COUNT(*) FROM orders").fetchone()[0]
    today_revenue = db.execute(
        "SELECT COALESCE(SUM(total),0) FROM orders WHERE date(created_at)=? AND status!='cancelled'", (today,)
    ).fetchone()[0]
    pending = db.execute("SELECT COUNT(*) FROM orders WHERE status='pending'").fetchone()[0]
    db.close()
    return jsonify({
        "today_orders": today_orders,
        "total_orders": total_orders,
        "today_revenue": today_revenue,
        "pending": pending
    })


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=False)
