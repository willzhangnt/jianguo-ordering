(function() {
  'use strict';

  var products = [];
  var cart = {}; // product_id -> quantity

  var grid = document.getElementById('product-grid');
  var emptyMsg = document.getElementById('empty-msg');
  var cartBar = document.getElementById('cart-bar');
  var cartCountEl = document.getElementById('cart-count');
  var cartTotalEl = document.getElementById('cart-total');
  var drawer = document.getElementById('cart-drawer');
  var drawerMask = document.getElementById('drawer-mask');
  var drawerItems = document.getElementById('drawer-items');
  var orderModal = document.getElementById('order-modal');
  var successModal = document.getElementById('success-modal');

  function fmt(n) { return n.toFixed(2); }

  function loadProducts() {
    fetch('/api/products').then(function(r){ return r.json(); }).then(function(data) {
      products = data;
      render();
    });
  }

  function render() {
    grid.innerHTML = '';
    if (!products.length) {
      emptyMsg.style.display = 'block';
      return;
    }
    products.forEach(function(p) {
      var card = document.createElement('div');
      card.className = 'product-card';
      var intPrice = Math.floor(p.price);
      var decPrice = (p.price % 1).toFixed(2).slice(1);
      card.innerHTML =
        '<div class="product-name">' + esc(p.name) + '</div>' +
        '<div class="product-desc">' + esc(p.description || '') + '</div>' +
        '<div class="product-bottom">' +
          '<div class="product-price">¥<span class="int">' + intPrice + '</span><span class="unit">' + decPrice + '/' + esc(p.unit) + '</span></div>' +
          '<button class="add-btn" data-id="' + p.id + '">+</button>' +
        '</div>';
      grid.appendChild(card);
    });

    grid.querySelectorAll('.add-btn').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        var id = parseInt(btn.getAttribute('data-id'));
        cart[id] = (cart[id] || 0) + 1;
        updateCartUI();
      });
    });
  }

  function esc(s) {
    var d = document.createElement('div');
    d.textContent = s || '';
    return d.innerHTML;
  }

  function cartList() {
    var list = [];
    for (var id in cart) {
      if (cart[id] > 0) {
        var p = products.find(function(x){ return x.id === parseInt(id); });
        if (p) list.push({ product: p, qty: cart[id] });
      }
    }
    return list;
  }

  function cartTotal() {
    return cartList().reduce(function(s, item) { return s + item.product.price * item.qty; }, 0);
  }

  function cartQty() {
    return cartList().reduce(function(s, item) { return s + item.qty; }, 0);
  }

  function updateCartUI() {
    var qty = cartQty();
    var total = cartTotal();
    cartCountEl.textContent = qty;
    cartTotalEl.textContent = '¥' + fmt(total);
    cartBar.style.display = qty > 0 ? 'flex' : 'none';
    renderDrawer();
  }

  function renderDrawer() {
    var list = cartList();
    drawerItems.innerHTML = '';
    list.forEach(function(item) {
      var row = document.createElement('div');
      row.className = 'drawer-item';
      row.innerHTML =
        '<div class="drawer-item-info">' +
          '<div class="drawer-item-name">' + esc(item.product.name) + '</div>' +
          '<div class="drawer-item-price">¥' + fmt(item.product.price) + '/' + esc(item.product.unit) + '</div>' +
        '</div>' +
        '<div class="drawer-item-ctrl">' +
          '<button class="qty-btn minus" data-id="' + item.product.id + '">−</button>' +
          '<span class="qty-num">' + item.qty + '</span>' +
          '<button class="qty-btn plus" data-id="' + item.product.id + '">+</button>' +
        '</div>';
      drawerItems.appendChild(row);
    });

    drawerItems.querySelectorAll('.minus').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var id = parseInt(btn.getAttribute('data-id'));
        if (cart[id] > 0) { cart[id]--; if (cart[id] === 0) delete cart[id]; }
        updateCartUI();
      });
    });
    drawerItems.querySelectorAll('.plus').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var id = parseInt(btn.getAttribute('data-id'));
        cart[id] = (cart[id] || 0) + 1;
        updateCartUI();
      });
    });
  }

  // Drawer
  document.getElementById('cart-toggle').addEventListener('click', function() {
    drawer.classList.add('show');
    drawerMask.classList.add('show');
  });
  drawerMask.addEventListener('click', function() {
    drawer.classList.remove('show');
    drawerMask.classList.remove('show');
  });
  document.getElementById('clear-cart').addEventListener('click', function() {
    cart = {};
    updateCartUI();
    drawer.classList.remove('show');
    drawerMask.classList.remove('show');
  });

  // Order modal
  document.getElementById('submit-btn').addEventListener('click', function() {
    var list = cartList();
    if (!list.length) return;
    drawer.classList.remove('show');
    drawerMask.classList.remove('show');

    var summary = list.map(function(item) {
      return esc(item.product.name) + ' × ' + item.qty + ' ' + esc(item.product.unit) + ' = ¥' + fmt(item.product.price * item.qty);
    }).join('<br>');
    document.getElementById('order-summary').innerHTML = summary;
    document.getElementById('order-total').textContent = '¥' + fmt(cartTotal());
    orderModal.classList.add('show');
  });

  document.getElementById('order-close').addEventListener('click', function() {
    orderModal.classList.remove('show');
  });

  document.getElementById('confirm-order').addEventListener('click', function() {
    var name = document.getElementById('f-name').value.trim();
    var phone = document.getElementById('f-phone').value.trim();
    var address = document.getElementById('f-address').value.trim();
    var notes = document.getElementById('f-notes').value.trim();

    if (!name) { alert('请填写姓名'); return; }
    if (!phone) { alert('请填写联系电话'); return; }

    var items = cartList().map(function(item) {
      return { product_id: item.product.id, quantity: item.qty };
    });

    var btn = document.getElementById('confirm-order');
    btn.disabled = true;
    btn.textContent = '提交中...';

    fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customer_name: name, phone: phone,
        address: address, notes: notes, items: items
      })
    }).then(function(r) { return r.json(); }).then(function(data) {
      btn.disabled = false;
      btn.textContent = '提交订单';
      if (data.ok) {
        orderModal.classList.remove('show');
        document.getElementById('success-order-no').textContent = '订单号：' + data.order_no;
        successModal.classList.add('show');
        cart = {};
        updateCartUI();
        // Save user info for next time
        try {
          localStorage.setItem('jg_name', name);
          localStorage.setItem('jg_phone', phone);
          localStorage.setItem('jg_address', address);
        } catch(e) {}
      } else {
        alert(data.error || '提交失败，请重试');
      }
    }).catch(function() {
      btn.disabled = false;
      btn.textContent = '提交订单';
      alert('网络错误，请重试');
    });
  });

  document.getElementById('success-done').addEventListener('click', function() {
    successModal.classList.remove('show');
  });

  // Restore user info
  try {
    var savedName = localStorage.getItem('jg_name');
    if (savedName) document.getElementById('f-name').value = savedName;
    var savedPhone = localStorage.getItem('jg_phone');
    if (savedPhone) document.getElementById('f-phone').value = savedPhone;
    var savedAddr = localStorage.getItem('jg_address');
    if (savedAddr) document.getElementById('f-address').value = savedAddr;
  } catch(e) {}

  loadProducts();
})();
