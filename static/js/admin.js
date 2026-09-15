(function() {
  'use strict';

  var loginPage = document.getElementById('login-page');
  var dashboard = document.getElementById('dashboard');
  var currentTab = 'orders';
  var editModal = document.getElementById('edit-modal');
  var editingId = null;

  function checkAuth() {
    fetch('/api/check-auth').then(function(r){ return r.json(); }).then(function(d) {
      if (d.authenticated) showDashboard();
      else showLogin();
    });
  }

  function esc(s) {
    var d = document.createElement('div');
    d.textContent = s || '';
    return d.innerHTML;
  }

  function openEditModal(p) {
    editingId = p.id;
    document.getElementById('e-name').value = p.name;
    document.getElementById('e-price').value = p.price;
    document.getElementById('e-unit').value = p.unit;
    document.getElementById('e-desc').value = p.description || '';
    document.getElementById('e-sort').value = p.sort_order;
    document.getElementById('e-active').checked = !!p.active;
    editModal.classList.add('show');
  }

  document.getElementById('edit-close').addEventListener('click', function() {
    editModal.classList.remove('show');
  });
  editModal.addEventListener('click', function(e) {
    if (e.target === editModal) editModal.classList.remove('show');
  });

  document.getElementById('edit-save').addEventListener('click', function() {
    if (editingId === null) return;
    var name = document.getElementById('e-name').value.trim();
    var price = parseFloat(document.getElementById('e-price').value) || 0;
    var unit = document.getElementById('e-unit').value.trim() || '斤';
    var desc = document.getElementById('e-desc').value.trim();
    var sort = parseInt(document.getElementById('e-sort').value) || 0;
    var active = document.getElementById('e-active').checked;
    if (!name) { alert('商品名称不能为空'); return; }
    fetch('/api/products/' + editingId, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name, price: price, unit: unit, description: desc, sort_order: sort, active: active })
    }).then(function(r) { return r.json(); }).then(function() {
      editModal.classList.remove('show');
      editingId = null;
      loadAdminProducts();
    });
  });

  function showLogin() {
    loginPage.style.display = 'flex';
    dashboard.style.display = 'none';
  }

  function showDashboard() {
    loginPage.style.display = 'none';
    dashboard.style.display = 'block';
    loadStats();
    loadOrders();
    loadAdminProducts();
  }

  // Login
  function doLogin() {
    var pwd = document.getElementById('login-pwd').value;
    var err = document.getElementById('login-error');
    err.textContent = '';
    fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: pwd })
    }).then(function(r) {
      if (r.ok) { showDashboard(); }
      else { err.textContent = '密码错误，请重试'; }
    }).catch(function() { err.textContent = '网络错误'; });
  }
  document.getElementById('login-btn').addEventListener('click', doLogin);
  document.getElementById('login-pwd').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') doLogin();
  });

  document.getElementById('logout-btn').addEventListener('click', function() {
    fetch('/api/logout', { method: 'POST' }).then(function() { showLogin(); });
  });

  // Tabs
  document.querySelectorAll('.tab').forEach(function(tab) {
    tab.addEventListener('click', function() {
      document.querySelectorAll('.tab').forEach(function(t){ t.classList.remove('active'); });
      tab.classList.add('active');
      currentTab = tab.getAttribute('data-tab');
      document.getElementById('panel-orders').style.display = currentTab === 'orders' ? 'block' : 'none';
      document.getElementById('panel-products').style.display = currentTab === 'products' ? 'block' : 'none';
    });
  });

  // Stats
  function loadStats() {
    fetch('/api/admin/stats').then(function(r){ return r.json(); }).then(function(d) {
      document.getElementById('s-today-orders').textContent = d.today_orders;
      document.getElementById('s-pending').textContent = d.pending;
      document.getElementById('s-revenue').textContent = '¥' + (d.today_revenue % 1 === 0 ? d.today_revenue : d.today_revenue.toFixed(2));
      document.getElementById('s-total').textContent = d.total_orders;
    });
  }

  // Orders
  function statusLabel(s) {
    var m = { pending:'待处理', confirmed:'已确认', delivered:'已送达', cancelled:'已取消' };
    return m[s] || s;
  }

  function loadOrders() {
    var status = document.getElementById('filter-status').value;
    var date = document.getElementById('filter-date').value;
    var qs = '?';
    if (status) qs += 'status=' + status + '&';
    if (date) qs += 'date=' + date + '&';
    fetch('/api/admin/orders' + qs).then(function(r){ return r.json(); }).then(function(orders) {
      var list = document.getElementById('orders-list');
      list.innerHTML = '';
      if (!orders.length) {
        list.innerHTML = '<div class="empty-list">暂无订单</div>';
        return;
      }
      orders.forEach(function(o) {
        var itemsStr = o.items.map(function(i) {
          return i.product_name + ' × ' + i.quantity + ' = ¥' + i.subtotal.toFixed(2);
        }).join('；');
        var card = document.createElement('div');
        card.className = 'order-card status-' + o.status;
        var actions = '';
        if (o.status === 'pending') {
          actions += '<button class="btn-action btn-confirm" data-id="' + o.id + '" data-status="confirmed">确认</button>';
          actions += '<button class="btn-action btn-cancel" data-id="' + o.id + '" data-status="cancelled">取消</button>';
        } else if (o.status === 'confirmed') {
          actions += '<button class="btn-action btn-deliver" data-id="' + o.id + '" data-status="delivered">送达</button>';
        }
        actions += '<button class="btn-action btn-delete" data-id="' + o.id + '">删除</button>';
        card.innerHTML =
          '<div class="order-header">' +
            '<span class="order-no">' + o.order_no + ' · ' + o.created_at + '</span>' +
            '<span class="order-status s-' + o.status + '">' + statusLabel(o.status) + '</span>' +
          '</div>' +
          '<div class="order-customer"><span>' + esc(o.customer_name) + '</span><span>' + esc(o.phone) + '</span></div>' +
          (o.address ? '<div class="order-items" style="color:#888">📍 ' + esc(o.address) + '</div>' : '') +
          '<div class="order-items">' + itemsStr + '</div>' +
          (o.notes ? '<div class="order-items" style="color:#f77f00">📝 ' + esc(o.notes) + '</div>' : '') +
          '<div class="order-total-row">' +
            '<div class="order-total-val">¥' + o.total.toFixed(2) + '</div>' +
            '<div class="order-actions">' + actions + '</div>' +
          '</div>';
        list.appendChild(card);
      });

      list.querySelectorAll('.btn-confirm,.btn-deliver,.btn-cancel').forEach(function(btn) {
        btn.addEventListener('click', function() {
          var id = parseInt(btn.getAttribute('data-id'));
          var st = btn.getAttribute('data-status');
          fetch('/api/admin/orders/' + id + '/status', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: st })
          }).then(function() { loadOrders(); loadStats(); });
        });
      });
      list.querySelectorAll('.btn-delete').forEach(function(btn) {
        btn.addEventListener('click', function() {
          if (!confirm('确定删除此订单？')) return;
          var id = parseInt(btn.getAttribute('data-id'));
          fetch('/api/admin/orders/' + id, { method: 'DELETE' }).then(function() { loadOrders(); loadStats(); });
        });
      });
    });
  }

  document.getElementById('refresh-orders').addEventListener('click', function() {
    loadOrders();
    loadStats();
  });
  document.getElementById('filter-status').addEventListener('change', loadOrders);
  document.getElementById('filter-date').addEventListener('change', loadOrders);

  // Products
  function loadAdminProducts() {
    fetch('/api/admin/products').then(function(r){ return r.json(); }).then(function(products) {
      var list = document.getElementById('admin-products-list');
      list.innerHTML = '';
      if (!products.length) {
        list.innerHTML = '<div class="empty-list">暂无商品</div>';
        return;
      }
      products.forEach(function(p) {
        var row = document.createElement('div');
        row.className = 'prod-row';
        row.innerHTML =
          '<span class="prod-name">' + esc(p.name) + '</span>' +
          '<span class="prod-price">¥' + p.price.toFixed(2) + '</span>' +
          '<span class="prod-unit">/' + esc(p.unit) + '</span>' +
          '<span class="prod-unit">' + (p.active ? '✅' : '⛔') + '</span>' +
          '<button class="btn-edit" data-id="' + p.id + '">编辑</button>' +
          '<button class="btn-del" data-id="' + p.id + '">删除</button>';
        list.appendChild(row);
      });

      list.querySelectorAll('.btn-edit').forEach(function(btn) {
        btn.addEventListener('click', function() {
          var id = parseInt(btn.getAttribute('data-id'));
          var p = products.find(function(x){ return x.id === id; });
          openEditModal(p);
        });
      });
      list.querySelectorAll('.btn-del').forEach(function(btn) {
        btn.addEventListener('click', function() {
          if (!confirm('确定删除该商品？')) return;
          var id = parseInt(btn.getAttribute('data-id'));
          fetch('/api/products/' + id, { method: 'DELETE' }).then(function() { loadAdminProducts(); });
        });
      });
    });
  }

  document.getElementById('add-prod-btn').addEventListener('click', function() {
    var name = document.getElementById('p-name').value.trim();
    var price = parseFloat(document.getElementById('p-price').value) || 0;
    var unit = document.getElementById('p-unit').value.trim() || '斤';
    var desc = document.getElementById('p-desc').value.trim();
    if (!name) { alert('请输入商品名称'); return; }
    fetch('/api/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name, price: price, unit: unit, description: desc })
    }).then(function(r) { return r.json(); }).then(function() {
      document.getElementById('p-name').value = '';
      document.getElementById('p-price').value = '';
      document.getElementById('p-desc').value = '';
      loadAdminProducts();
    });
  });

  checkAuth();
})();
