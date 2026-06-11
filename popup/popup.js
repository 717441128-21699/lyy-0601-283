let state = {
  favorites: [],
  risks: [],
  communications: [],
  reminders: [],
  filters: {
    city: '',
    status: '',
    budget: '',
    commute: '',
    riskLevel: '',
    showResolved: false,
    commFavId: '',
    reminderType: ''
  },
  checklist: {}
};

const VIEWING_CHECKLIST = [
  { key: 'v1', label: '查看房屋产权证/房东身份证' },
  { key: 'v2', label: '检查水电燃气设施是否正常' },
  { key: 'v3', label: '检查门窗锁具安全性' },
  { key: 'v4', label: '确认空调、热水器等家电状态' },
  { key: 'v5', label: '检查墙面、地面是否有破损' },
  { key: 'v6', label: '确认网络信号覆盖' },
  { key: 'v7', label: '询问周边环境和噪音情况' },
  { key: 'v8', label: '拍照记录房屋现状' }
];

const CONTRACT_CHECKLIST = [
  { key: 'c1', label: '确认租期和起止日期' },
  { key: 'c2', label: '确认押金金额和退还条件' },
  { key: 'c3', label: '确认租金及付款方式' },
  { key: 'c4', label: '确认物业费、水电费承担方' },
  { key: 'c5', label: '确认维修责任划分' },
  { key: 'c6', label: '确认提前解约违约金条款' },
  { key: 'c7', label: '确认是否允许转租' },
  { key: 'c8', label: '确认合同到期续租条款' }
];

const PAYMENT_CHECKLIST = [
  { key: 'p1', label: '核实收款方身份是否与房东一致' },
  { key: 'p2', label: '确认收款账户为房东本人账户' },
  { key: 'p3', label: '索要正规收据或发票' },
  { key: 'p4', label: '银行转账并备注用途' },
  { key: 'p5', label: '避免现金交易和私人转账' },
  { key: 'p6', label: '保留所有付款凭证' }
];

const FAV_CHANGE_CHECKLIST = [
  { key: 'f1', label: '定期回访收藏房源是否下架' },
  { key: 'f2', label: '关注价格是否有变动' },
  { key: 'f3', label: '确认房源状态更新' },
  { key: 'f4', label: '对比同区域其他房源价格' }
];

async function loadState() {
  const resp = await chrome.runtime.sendMessage({ action: 'getState' });
  if (resp && resp.success) {
    state.favorites = resp.data.favorites || [];
    state.risks = resp.data.risks || [];
    state.communications = resp.data.communications || [];
    state.reminders = resp.data.reminders || [];
    
    const savedChecklist = await chrome.storage.local.get('checklist');
    state.checklist = savedChecklist.checklist || {};
  }
  renderAll();
}

function saveChecklist() {
  chrome.storage.local.set({ checklist: state.checklist });
}

function renderAll() {
  renderStats();
  renderBadges();
  renderFavorites();
  renderRisks();
  renderCommunications();
  renderReminders();
  renderChecklist();
  updateFilterOptions();
}

function renderStats() {
  const unresolvedRisks = state.risks.filter(r => !r.resolved).length;
  const pendingReminders = state.reminders.filter(r => !r.triggered).length;
  const html = `
    <span class="stat-chip">⭐ ${state.favorites.length}</span>
    ${unresolvedRisks > 0 ? `<span class="stat-chip danger">⚠️ ${unresolvedRisks}</span>` : ''}
    ${pendingReminders > 0 ? `<span class="stat-chip">🔔 ${pendingReminders}</span>` : ''}
  `;
  document.getElementById('appStats').innerHTML = html;
}

function renderBadges() {
  document.getElementById('badgeFavorites').textContent = state.favorites.length || '';
  const unresolvedRisks = state.risks.filter(r => !r.resolved).length;
  document.getElementById('badgeRisks').textContent = unresolvedRisks || '';
  document.getElementById('badgeComm').textContent = state.communications.length || '';
  const pendingReminders = state.reminders.filter(r => !r.triggered).length;
  document.getElementById('badgeReminders').textContent = pendingReminders || '';
}

function updateFilterOptions() {
  const cityFilter = document.getElementById('filterCity');
  const cities = [...new Set(state.favorites.map(f => f.city).filter(Boolean))];
  cityFilter.innerHTML = '<option value="">全部城市</option>' + 
    cities.map(c => `<option value="${c}">${c}</option>`).join('');
  cityFilter.value = state.filters.city;

  const commFavFilter = document.getElementById('filterCommFav');
  commFavFilter.innerHTML = '<option value="">全部房源</option>' +
    state.favorites.map(f => `<option value="${f.id}">${f.title.substring(0, 20)}</option>`).join('');
  commFavFilter.value = state.filters.commFavId;
}

function formatDate(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function extractPriceValue(text) {
  if (!text) return null;
  const nums = text.match(/\d+(?:\.\d+)?/g);
  if (!nums || nums.length === 0) return null;
  if (nums.length >= 2) {
    return (parseFloat(nums[0]) + parseFloat(nums[1])) / 2;
  }
  return parseFloat(nums[0]);
}

function extractCommuteMinutes(text) {
  if (!text) return null;
  const hoursMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:小时|h|时|钟头)/i);
  const minsMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:分钟|分|min|m)/i);
  
  let total = 0;
  let hasValue = false;
  
  if (hoursMatch) {
    total += parseFloat(hoursMatch[1]) * 60;
    hasValue = true;
  }
  if (minsMatch) {
    total += parseFloat(minsMatch[1]);
    hasValue = true;
  }
  
  if (!hasValue) {
    const pureNum = parseFloat(text);
    if (!isNaN(pureNum) && pureNum > 0 && pureNum < 200) {
      return pureNum;
    }
    return null;
  }
  
  return total > 0 ? total : null;
}

function isInRange(value, rangeStr) {
  if (!rangeStr || value == null) return true;
  const parts = rangeStr.split('-').map(Number);
  if (parts.length !== 2) return true;
  return value >= parts[0] && value < parts[1];
}

function renderFavorites() {
  const grid = document.getElementById('favoritesGrid');
  const empty = document.getElementById('emptyFavorites');
  
  let filtered = state.favorites;
  
  if (state.filters.city) {
    filtered = filtered.filter(f => f.city === state.filters.city);
  }
  if (state.filters.status) {
    filtered = filtered.filter(f => f.status === state.filters.status);
  }
  if (state.filters.budget) {
    filtered = filtered.filter(f => {
      const budgetVal = extractPriceValue(f.budget);
      return isInRange(budgetVal, state.filters.budget);
    });
  }
  if (state.filters.commute) {
    filtered = filtered.filter(f => {
      const commuteVal = extractCommuteMinutes(f.commute);
      return isInRange(commuteVal, state.filters.commute);
    });
  }

  if (filtered.length === 0) {
    grid.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';

  filtered.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  
  grid.innerHTML = filtered.map(f => `
    <div class="fav-card" data-id="${f.id}">
      <div class="fav-header">
        <div class="fav-title">${escapeHtml(f.title)}</div>
        <span class="fav-status status-${f.status || '收藏中'}">${f.status || '收藏中'}</span>
      </div>
      <div class="fav-meta">
        ${f.city ? `<span>📍 ${escapeHtml(f.city)}</span>` : ''}
        ${f.budget ? `<span>💰 ${escapeHtml(f.budget)}</span>` : ''}
        ${f.commute ? `<span>🚇 ${escapeHtml(f.commute)}</span>` : ''}
      </div>
      <div class="fav-footer">
        <span class="fav-time">${formatDate(f.createdAt)}</span>
        <div class="fav-actions">
          <button class="icon-btn" data-action="open-url" title="打开链接" data-url="${escapeHtml(f.url || '')}">🔗</button>
          <button class="icon-btn" data-action="edit-fav" title="编辑">✏️</button>
          <button class="icon-btn danger" data-action="delete-fav" title="删除">🗑️</button>
        </div>
      </div>
    </div>
  `).join('');
}

function renderRisks() {
  const list = document.getElementById('riskList');
  const empty = document.getElementById('emptyRisks');
  
  let filtered = state.risks;
  if (state.filters.riskLevel) {
    filtered = filtered.filter(r => r.level === state.filters.riskLevel);
  }
  if (!state.filters.showResolved) {
    filtered = filtered.filter(r => !r.resolved);
  }

  if (filtered.length === 0) {
    list.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';

  filtered.sort((a, b) => {
    const levelOrder = { high: 0, medium: 1, low: 2 };
    if (a.resolved !== b.resolved) return a.resolved ? 1 : -1;
    if (a.level !== b.level) return (levelOrder[a.level] ?? 3) - (levelOrder[b.level] ?? 3);
    return (b.createdAt || 0) - (a.createdAt || 0);
  });

  const levelLabel = { high: '高风险', medium: '中风险', low: '低风险' };
  
  list.innerHTML = filtered.map(r => `
    <div class="risk-card level-${r.level || 'medium'} ${r.resolved ? 'resolved' : ''}">
      <div class="risk-header">
        <div class="risk-title">${escapeHtml(r.title)}</div>
        <span class="risk-level">${levelLabel[r.level] || '未知'}</span>
      </div>
      <div class="risk-desc">${escapeHtml(r.description || '')}</div>
      <div class="risk-footer">
        ${r.url ? `<a class="risk-url" href="#" data-url="${escapeHtml(r.url)}">${escapeHtml(truncateUrl(r.url))}</a>` : `<span style="font-size:11px;color:#999">${formatDate(r.createdAt)}</span>`}
        <div class="risk-actions">
          ${!r.resolved ? `<button class="btn btn-sm" data-action="resolve-risk" data-id="${r.id}">标记解决</button>` : ''}
          <button class="icon-btn danger" data-action="delete-risk" data-id="${r.id}">🗑️</button>
        </div>
      </div>
    </div>
  `).join('');
}

function renderCommunications() {
  const list = document.getElementById('commList');
  const empty = document.getElementById('emptyComm');
  
  let filtered = state.communications;
  if (state.filters.commFavId) {
    filtered = filtered.filter(c => c.favoriteId === state.filters.commFavId);
  }

  if (filtered.length === 0) {
    list.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';

  filtered.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

  list.innerHTML = filtered.map(c => {
    const fav = state.favorites.find(f => f.id === c.favoriteId);
    return `
      <div class="comm-card" data-id="${c.id}">
        <div class="comm-header">
          <span class="comm-fav">${fav ? escapeHtml(fav.title.substring(0, 25)) : '未关联房源'}</span>
          ${c.contact ? `<span class="comm-contact">👤 ${escapeHtml(c.contact)}</span>` : ''}
        </div>
        ${c.keyPoints ? `
          <div class="comm-points">
            <div class="comm-points-title">📝 沟通要点</div>
            <div class="comm-points-content">${escapeHtml(c.keyPoints)}</div>
          </div>
        ` : ''}
        ${c.promises ? `
          <div class="comm-promises">
            <div class="comm-promises-title">🤝 承诺事项</div>
            <div class="comm-promises-content">${escapeHtml(c.promises)}</div>
          </div>
        ` : ''}
        <div class="comm-meta">
          <span>${formatDate(c.createdAt)}</span>
          <div style="display:flex;align-items:center;gap:6px">
            ${c.appointmentTime ? `<span class="comm-appointment">📅 ${formatDate(new Date(c.appointmentTime).getTime())}</span>` : ''}
            <button class="icon-btn" data-action="edit-comm" title="编辑">✏️</button>
            <button class="icon-btn danger" data-action="delete-comm" title="删除">🗑️</button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function renderReminders() {
  const list = document.getElementById('reminderList');
  const empty = document.getElementById('emptyReminders');
  
  let filtered = state.reminders;
  if (state.filters.reminderType) {
    filtered = filtered.filter(r => r.type === state.filters.reminderType);
  }

  if (filtered.length === 0) {
    list.innerHTML = '';
    return;
  }

  filtered.sort((a, b) => {
    if (a.triggered !== b.triggered) return a.triggered ? 1 : -1;
    return (a.remindAt || 0) - (b.remindAt || 0);
  });

  const typeIcon = {
    viewing: { icon: '🏠', label: '看房' },
    contract: { icon: '📋', label: '签约' },
    payment: { icon: '💰', label: '付款' },
    appointment: { icon: '📅', label: '约看' },
    other: { icon: '📌', label: '其他' }
  };

  list.innerHTML = filtered.map(r => {
    const info = typeIcon[r.type] || typeIcon.other;
    return `
      <div class="reminder-card ${r.triggered ? 'triggered' : ''}">
        <div class="reminder-type-icon type-${r.type || 'other'}">${info.icon}</div>
        <div class="reminder-body">
          <div class="reminder-header">
            <div class="reminder-title">${escapeHtml(r.title)}</div>
            <div style="display:flex;gap:4px">
              <button class="icon-btn" data-action="edit-reminder" data-id="${r.id}">✏️</button>
              <button class="icon-btn danger" data-action="delete-reminder" data-id="${r.id}">🗑️</button>
            </div>
          </div>
          ${r.content ? `<div class="reminder-content">${escapeHtml(r.content)}</div>` : ''}
          <div class="reminder-meta">
            ${r.remindAt ? `<span>⏰ ${formatDate(r.remindAt)}</span>` : ''}
            ${r.triggered ? '<span class="reminder-triggered">✓ 已提醒</span>' : '<span>等待提醒</span>'}
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function renderChecklist() {
  const container = document.getElementById('checklistTemplate');
  
  const groups = [
    { title: '🏠 看房问题清单', items: VIEWING_CHECKLIST },
    { title: '📋 签约材料清单', items: CONTRACT_CHECKLIST },
    { title: '💰 付款前核验', items: PAYMENT_CHECKLIST },
    { title: '⭐ 收藏房源变动', items: FAV_CHANGE_CHECKLIST }
  ];

  container.innerHTML = `
    <div class="checklist-title">✅ 租房必备检查清单</div>
    ${groups.map(g => `
      <div class="checklist-group">
        <div class="checklist-group-title">${g.title}</div>
        <div class="checklist-items">
          ${g.items.map(item => {
            const checked = state.checklist[item.key] ? 'checked' : '';
            return `
              <label class="checklist-item ${checked}" data-check="${item.key}">
                <input type="checkbox" ${checked} data-check-key="${item.key}">
                <span>${item.label}</span>
              </label>
            `;
          }).join('')}
        </div>
      </div>
    `).join('')}
  `;
}

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function truncateUrl(url) {
  if (!url) return '';
  try {
    const u = new URL(url);
    return u.hostname + u.pathname.substring(0, 30);
  } catch {
    return url.substring(0, 50);
  }
}

function openModal(title, bodyHtml, onSubmit) {
  const modal = document.getElementById('modal');
  const content = document.getElementById('modalContent');
  
  content.innerHTML = `
    <div class="modal-header">
      <div class="modal-title">${title}</div>
      <button class="modal-close" data-close="modal">×</button>
    </div>
    <form id="modalForm">
      <div class="modal-body">${bodyHtml}</div>
      <div class="modal-footer">
        <button type="button" class="btn" data-close="modal">取消</button>
        <button type="submit" class="btn btn-primary">确认</button>
      </div>
    </form>
  `;
  
  modal.classList.add('open');
  
  const form = document.getElementById('modalForm');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const formData = {};
    form.querySelectorAll('[name]').forEach(el => {
      formData[el.name] = el.value;
    });
    if (onSubmit(formData) !== false) {
      closeModal();
    }
  });
}

function closeModal() {
  document.getElementById('modal').classList.remove('open');
}

function showFavoriteModal(existing) {
  const isEdit = !!existing;
  const data = existing || {};
  
  const html = `
    <div class="form-group">
      <label class="form-label">房源标题 *</label>
      <input class="form-input" name="title" value="${escapeHtml(data.title || '')}" placeholder="请输入房源名称" required>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">所在城市</label>
        <input class="form-input" name="city" value="${escapeHtml(data.city || '')}" placeholder="例如：北京">
      </div>
      <div class="form-group">
        <label class="form-label">房源状态</label>
        <select class="form-select" name="status">
          <option value="收藏中" ${data.status === '收藏中' ? 'selected' : ''}>收藏中</option>
          <option value="待看房" ${data.status === '待看房' ? 'selected' : ''}>待看房</option>
          <option value="已看房" ${data.status === '已看房' ? 'selected' : ''}>已看房</option>
          <option value="考虑中" ${data.status === '考虑中' ? 'selected' : ''}>考虑中</option>
          <option value="已签约" ${data.status === '已签约' ? 'selected' : ''}>已签约</option>
          <option value="已放弃" ${data.status === '已放弃' ? 'selected' : ''}>已放弃</option>
        </select>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">预算范围</label>
        <input class="form-input" name="budget" value="${escapeHtml(data.budget || '')}" placeholder="例如：2000-3500">
      </div>
      <div class="form-group">
        <label class="form-label">通勤时间</label>
        <input class="form-input" name="commute" value="${escapeHtml(data.commute || '')}" placeholder="例如：地铁30分钟">
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">房源链接</label>
      <input class="form-input" name="url" value="${escapeHtml(data.url || '')}" placeholder="https://...">
    </div>
  `;
  
  openModal(isEdit ? '编辑房源' : '新增房源', html, async (formData) => {
    if (isEdit) {
      await chrome.runtime.sendMessage({ action: 'updateFavorite', id: existing.id, data: formData });
    } else {
      await chrome.runtime.sendMessage({ action: 'addFavorite', data: formData });
    }
    await loadState();
  });
}

function showRiskModal() {
  const html = `
    <div class="form-group">
      <label class="form-label">风险标题 *</label>
      <input class="form-input" name="title" placeholder="例如：价格异常偏低" required>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">风险等级</label>
        <select class="form-select" name="level">
          <option value="high">高风险</option>
          <option value="medium" selected>中风险</option>
          <option value="low">低风险</option>
        </select>
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">风险描述</label>
      <textarea class="form-textarea" name="description" placeholder="详细描述风险情况"></textarea>
    </div>
    <div class="form-group">
      <label class="form-label">相关链接</label>
      <input class="form-input" name="url" placeholder="房源页面URL">
    </div>
  `;
  
  openModal('记录风险', html, async (formData) => {
    await chrome.runtime.sendMessage({ action: 'addRisk', data: formData });
    await loadState();
  });
}

function showCommunicationModal(existing) {
  const isEdit = !!existing;
  const data = existing || {};
  
  const favOptions = state.favorites.map(f => 
    `<option value="${f.id}" ${data.favoriteId === f.id ? 'selected' : ''}>${escapeHtml(f.title.substring(0, 25))}</option>`
  ).join('');
  
  const html = `
    <div class="form-group">
      <label class="form-label">关联房源</label>
      <select class="form-select" name="favoriteId">
        <option value="">不关联</option>
        ${favOptions}
      </select>
    </div>
    <div class="form-group">
      <label class="form-label">联系人</label>
      <input class="form-input" name="contact" value="${escapeHtml(data.contact || '')}" placeholder="房东/中介姓名及联系方式">
    </div>
    <div class="form-group">
      <label class="form-label">沟通要点</label>
      <textarea class="form-textarea" name="keyPoints" placeholder="记录本次沟通的重要内容">${escapeHtml(data.keyPoints || '')}</textarea>
    </div>
    <div class="form-group">
      <label class="form-label">承诺事项</label>
      <textarea class="form-textarea" name="promises" placeholder="对方做出的承诺，需要特别关注的">${escapeHtml(data.promises || '')}</textarea>
    </div>
    <div class="form-group">
      <label class="form-label">约看时间</label>
      <input class="form-input" type="datetime-local" name="appointmentTime" value="${data.appointmentTime ? new Date(data.appointmentTime).toISOString().substring(0, 16) : ''}">
    </div>
  `;
  
  openModal(isEdit ? '编辑沟通记录' : '新增沟通记录', html, async (formData) => {
    if (formData.appointmentTime) {
      formData.appointmentTime = new Date(formData.appointmentTime).toISOString();
    } else {
      delete formData.appointmentTime;
    }
    if (isEdit) {
      await chrome.runtime.sendMessage({ action: 'updateCommunication', id: existing.id, data: formData });
    } else {
      await chrome.runtime.sendMessage({ action: 'addCommunication', data: formData });
    }
    await loadState();
  });
}

function showReminderModal(existing) {
  const isEdit = !!existing;
  const data = existing || {};
  
  const html = `
    <div class="form-group">
      <label class="form-label">提醒类型</label>
      <select class="form-select" name="type">
        <option value="viewing" ${data.type === 'viewing' ? 'selected' : ''}>🏠 看房提醒</option>
        <option value="contract" ${data.type === 'contract' ? 'selected' : ''}>📋 签约提醒</option>
        <option value="payment" ${data.type === 'payment' ? 'selected' : ''}>💰 付款核验</option>
        <option value="appointment" ${data.type === 'appointment' ? 'selected' : ''}>📅 约看提醒</option>
        <option value="other" ${data.type === 'other' || !data.type ? 'selected' : ''}>📌 其他提醒</option>
      </select>
    </div>
    <div class="form-group">
      <label class="form-label">提醒标题 *</label>
      <input class="form-input" name="title" value="${escapeHtml(data.title || '')}" placeholder="请输入提醒标题" required>
    </div>
    <div class="form-group">
      <label class="form-label">提醒内容</label>
      <textarea class="form-textarea" name="content" placeholder="详细描述提醒内容">${escapeHtml(data.content || '')}</textarea>
    </div>
    <div class="form-group">
      <label class="form-label">提醒时间</label>
      <input class="form-input" type="datetime-local" name="remindAt" value="${data.remindAt ? new Date(data.remindAt).toISOString().substring(0, 16) : ''}">
    </div>
  `;
  
  openModal(isEdit ? '编辑提醒' : '新建提醒', html, async (formData) => {
    if (formData.remindAt) {
      formData.remindAt = new Date(formData.remindAt).getTime();
    } else {
      delete formData.remindAt;
    }
    if (isEdit) {
      await chrome.runtime.sendMessage({ action: 'updateReminder', id: existing.id, data: formData });
    } else {
      await chrome.runtime.sendMessage({ action: 'addReminder', data: formData });
    }
    await loadState();
  });
}

function bindEvents() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.querySelector(`.tab-panel[data-panel="${btn.dataset.tab}"]`).classList.add('active');
    });
  });

  document.addEventListener('click', async (e) => {
    if (e.target.dataset.close === 'modal') {
      closeModal();
      return;
    }

    const action = e.target.dataset.action || e.target.closest('[data-action]')?.dataset.action;
    const id = e.target.dataset.id || e.target.closest('[data-id]')?.dataset.id;
    const url = e.target.dataset.url || e.target.closest('[data-url]')?.dataset.url;

    if (!action) return;

    switch (action) {
      case 'open-url':
        if (url) chrome.tabs.create({ url });
        break;
      case 'edit-fav': {
        const fav = state.favorites.find(f => f.id === id);
        if (fav) showFavoriteModal(fav);
        break;
      }
      case 'delete-fav':
        if (confirm('确定要删除这个房源吗？')) {
          await chrome.runtime.sendMessage({ action: 'deleteFavorite', id });
          await loadState();
        }
        break;
      case 'resolve-risk':
        await chrome.runtime.sendMessage({ action: 'resolveRisk', id });
        await loadState();
        break;
      case 'delete-risk':
        if (confirm('确定要删除这条风险记录吗？')) {
          await chrome.runtime.sendMessage({ action: 'deleteRisk', id });
          await loadState();
        }
        break;
      case 'edit-comm': {
        const comm = state.communications.find(c => c.id === id);
        if (comm) showCommunicationModal(comm);
        break;
      }
      case 'delete-comm':
        if (confirm('确定要删除这条沟通记录吗？')) {
          await chrome.runtime.sendMessage({ action: 'deleteCommunication', id });
          await loadState();
        }
        break;
      case 'edit-reminder': {
        const rem = state.reminders.find(r => r.id === id);
        if (rem) showReminderModal(rem);
        break;
      }
      case 'delete-reminder':
        if (confirm('确定要删除这条提醒吗？')) {
          await chrome.runtime.sendMessage({ action: 'deleteReminder', id });
          await loadState();
        }
        break;
    }
  });

  document.addEventListener('click', (e) => {
    if (e.target.classList.contains('risk-url') || e.target.closest('.risk-url')) {
      e.preventDefault();
      const el = e.target.classList.contains('risk-url') ? e.target : e.target.closest('.risk-url');
      if (el.dataset.url) chrome.tabs.create({ url: el.dataset.url });
    }
  });

  document.getElementById('btnAddFavorite').addEventListener('click', () => showFavoriteModal());
  document.getElementById('btnAddRisk').addEventListener('click', () => showRiskModal());
  document.getElementById('btnAddComm').addEventListener('click', () => showCommunicationModal());
  document.getElementById('btnAddReminder').addEventListener('click', () => showReminderModal());

  document.getElementById('filterCity').addEventListener('change', (e) => {
    state.filters.city = e.target.value;
    renderFavorites();
  });
  document.getElementById('filterStatus').addEventListener('change', (e) => {
    state.filters.status = e.target.value;
    renderFavorites();
  });
  document.getElementById('filterBudget').addEventListener('change', (e) => {
    state.filters.budget = e.target.value;
    renderFavorites();
  });
  document.getElementById('filterCommute').addEventListener('change', (e) => {
    state.filters.commute = e.target.value;
    renderFavorites();
  });
  document.getElementById('filterRiskLevel').addEventListener('change', (e) => {
    state.filters.riskLevel = e.target.value;
    renderRisks();
  });
  document.getElementById('filterResolved').addEventListener('change', (e) => {
    state.filters.showResolved = e.target.checked;
    renderRisks();
  });
  document.getElementById('filterCommFav').addEventListener('change', (e) => {
    state.filters.commFavId = e.target.value;
    renderCommunications();
  });
  document.getElementById('filterReminderType').addEventListener('change', (e) => {
    state.filters.reminderType = e.target.value;
    renderReminders();
  });

  document.addEventListener('change', (e) => {
    if (e.target.dataset.checkKey) {
      const key = e.target.dataset.checkKey;
      state.checklist[key] = e.target.checked;
      saveChecklist();
      const label = e.target.closest('.checklist-item');
      if (label) {
        label.classList.toggle('checked', e.target.checked);
      }
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  bindEvents();
  loadState();
});
