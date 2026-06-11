let state = {
  favorites: [],
  risks: [],
  communications: [],
  reminders: [],
  annotations: {},
  viewingReviews: {},
  verifications: {},
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
  checklist: {},
  riskViewMode: 'group',
  compareMode: false,
  selectedFavorites: [],
  compareWeights: {
    risk: 50,
    commute: 30,
    budget: 20
  }
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
    state.annotations = resp.data.annotations || {};
    state.viewingReviews = resp.data.viewingReviews || {};
    state.verifications = resp.data.verifications || {};
    
    const saved = await chrome.storage.local.get(['checklist', 'compareWeights']);
    state.checklist = saved.checklist || {};
    if (saved.compareWeights) {
      state.compareWeights = { ...state.compareWeights, ...saved.compareWeights };
    }
  }
  renderAll();
}

function saveChecklist() {
  chrome.storage.local.set({ checklist: state.checklist });
}

function saveCompareWeights() {
  chrome.storage.local.set({ compareWeights: state.compareWeights });
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
  const actionsBar = document.getElementById('favActionsBar');
  const toggleBtn = document.getElementById('btnToggleCompare');
  
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

  if (state.favorites.length >= 2) {
    toggleBtn.style.display = '';
  } else {
    toggleBtn.style.display = 'none';
    state.compareMode = false;
    state.selectedFavorites = [];
  }

  if (state.compareMode) {
    actionsBar.style.display = 'flex';
    document.getElementById('selectedCount').textContent = state.selectedFavorites.length;
    document.getElementById('btnStartCompare').disabled = state.selectedFavorites.length < 2;
  } else {
    actionsBar.style.display = 'none';
  }

  if (filtered.length === 0) {
    grid.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';

  filtered.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  
  grid.innerHTML = filtered.map(f => {
    const riskCount = state.risks.filter(r => r.url === f.url && !r.resolved).length;
    const hasReminded = state.reminders.some(r => r.favoriteId === f.id && r.triggered);
    const isSelected = state.selectedFavorites.includes(f.id);
    
    return `
    <div class="fav-card ${state.compareMode ? 'compare-mode' : ''} ${isSelected ? 'selected' : ''}" data-id="${f.id}">
      ${state.compareMode ? `
        <label class="fav-checkbox">
          <input type="checkbox" ${isSelected ? 'checked' : ''} data-action="toggle-select" data-id="${f.id}">
        </label>
      ` : ''}
      <div class="fav-header">
        <div class="fav-title">${escapeHtml(f.title)}</div>
        <div class="fav-header-right">
          ${riskCount > 0 ? `<span class="fav-risk-badge" title="${riskCount}项未解决风险">⚠️ ${riskCount}</span>` : ''}
          ${hasReminded ? '<span class="fav-reminded-badge" title="有待办提醒">🔔</span>' : ''}
          <span class="fav-status status-${f.status || '收藏中'}">${f.status || '收藏中'}</span>
        </div>
      </div>
      <div class="fav-meta">
        ${f.city ? `<span>📍 ${escapeHtml(f.city)}</span>` : ''}
        ${f.budget ? `<span>💰 ${escapeHtml(f.budget)}</span>` : ''}
        ${f.commute ? `<span>🚇 ${escapeHtml(f.commute)}</span>` : ''}
      </div>
      <div class="fav-footer">
        <span class="fav-time">${formatDate(f.createdAt)}</span>
        <div class="fav-actions">
          <button class="icon-btn" data-action="view-fav-detail" title="查看详情" data-id="${f.id}">📋</button>
          <button class="icon-btn" data-action="open-url" title="打开链接" data-url="${escapeHtml(f.url || '')}">🔗</button>
          <button class="icon-btn" data-action="edit-fav" title="编辑">✏️</button>
          <button class="icon-btn danger" data-action="delete-fav" title="删除">🗑️</button>
        </div>
      </div>
    </div>
  `}).join('');
}

function getRisksByUrl(filtered) {
  const groups = {};
  filtered.forEach(r => {
    const url = r.url || 'unknown';
    if (!groups[url]) {
      groups[url] = {
        url,
        risks: [],
        highCount: 0,
        mediumCount: 0,
        lowCount: 0,
        unresolvedCount: 0
      };
    }
    groups[url].risks.push(r);
    if (!r.resolved) {
      groups[url].unresolvedCount++;
      if (r.level === 'high') groups[url].highCount++;
      else if (r.level === 'medium') groups[url].mediumCount++;
      else groups[url].lowCount++;
    }
  });
  return Object.values(groups).sort((a, b) => {
    if (b.unresolvedCount !== a.unresolvedCount) return b.unresolvedCount - a.unresolvedCount;
    if (b.highCount !== a.highCount) return b.highCount - a.highCount;
    return b.mediumCount - a.mediumCount;
  });
}

function getFavoriteByUrl(url) {
  return state.favorites.find(f => f.url === url || (f.normUrl && f.normUrl === url));
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

  if (state.riskViewMode === 'group') {
    const groups = getRisksByUrl(filtered);
    list.innerHTML = groups.map(g => {
      const fav = getFavoriteByUrl(g.url);
      const title = fav ? fav.title : truncateUrl(g.url);
      const urlLabel = g.url === 'unknown' ? '未关联房源' : truncateUrl(g.url);
      return `
        <div class="risk-group-card" data-url="${escapeHtml(g.url)}">
          <div class="risk-group-header">
            <div class="risk-group-title" title="${escapeHtml(title)}">
              <span class="risk-group-icon">🏠</span>
              <span>${escapeHtml(title)}</span>
            </div>
            <div class="risk-group-stats">
              ${g.highCount > 0 ? `<span class="risk-badge high">高 ${g.highCount}</span>` : ''}
              ${g.mediumCount > 0 ? `<span class="risk-badge medium">中 ${g.mediumCount}</span>` : ''}
              ${g.lowCount > 0 ? `<span class="risk-badge low">低 ${g.lowCount}</span>` : ''}
              <span class="risk-group-count">共 ${g.risks.length} 项</span>
            </div>
          </div>
          <div class="risk-group-url">${escapeHtml(urlLabel)}</div>
          <div class="risk-group-mini">
            ${g.risks.slice(0, 2).map(r => `
              <div class="risk-mini-item level-${r.level || 'medium'} ${r.resolved ? 'resolved' : ''}">
                <span class="risk-mini-dot"></span>
                <span class="risk-mini-title">${escapeHtml(r.title)}</span>
              </div>
            `).join('')}
            ${g.risks.length > 2 ? `<div class="risk-more">还有 ${g.risks.length - 2} 项...</div>` : ''}
          </div>
          <div class="risk-group-footer">
            <button class="btn btn-sm btn-ghost" data-action="view-property" data-url="${escapeHtml(g.url)}">
              查看详情
            </button>
          </div>
        </div>
      `;
    }).join('');
  } else {
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
          ${r.url ? `<a class="risk-url" href="#" data-url="${escapeHtml(r.url)}" data-action="view-property">${escapeHtml(truncateUrl(r.url))}</a>` : `<span style="font-size:11px;color:#999">${formatDate(r.createdAt)}</span>`}
          <div class="risk-actions">
            ${!r.resolved ? `<button class="btn btn-sm" data-action="resolve-risk" data-id="${r.id}">标记解决</button>` : ''}
            <button class="icon-btn danger" data-action="delete-risk" data-id="${r.id}">🗑️</button>
          </div>
        </div>
      </div>
    `).join('');
  }
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
    const hasReminder = state.reminders.some(r => r.communicationId === c.id && !r.triggered);
    const hasTriggered = state.reminders.some(r => r.communicationId === c.id && r.triggered);
    
    return `
      <div class="comm-card" data-id="${c.id}">
        <div class="comm-header">
          <span class="comm-fav">${fav ? escapeHtml(fav.title.substring(0, 25)) : '未关联房源'}</span>
          <div style="display:flex;align-items:center;gap:6px">
            ${hasReminder ? '<span class="comm-badge" title="有待提醒">🔔</span>' : ''}
            ${hasTriggered ? '<span class="comm-badge reminded" title="已提醒">✅</span>' : ''}
            ${c.contact ? `<span class="comm-contact">👤 ${escapeHtml(c.contact)}</span>` : ''}
          </div>
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

function calculateDecision({ fav, risks, comms, annotation, review }) {
  const reasons = [];
  let score = 50;

  const highRisks = risks.filter(r => r.level === 'high' && !r.resolved);
  const mediumRisks = risks.filter(r => r.level === 'medium' && !r.resolved);

  if (highRisks.length >= 2) {
    score -= 25;
    reasons.push({ type: 'risk', text: `存在 ${highRisks.length} 项高风险未解决`, weight: '强负' });
  } else if (highRisks.length === 1) {
    score -= 15;
    reasons.push({ type: 'risk', text: `存在高风险：${highRisks[0].title}`, weight: '负' });
  }

  if (mediumRisks.length >= 3) {
    score -= 15;
    reasons.push({ type: 'risk', text: `存在 ${mediumRisks.length} 项中风险`, weight: '负' });
  } else if (mediumRisks.length > 0) {
    score -= 5;
    reasons.push({ type: 'risk', text: `存在 ${mediumRisks.length} 项中风险`, weight: '弱负' });
  }

  if (risks.filter(r => r.resolved).length > 0 && highRisks.length === 0) {
    score += 3;
    reasons.push({ type: 'risk', text: `历史风险已处理 ${risks.filter(r => r.resolved).length} 项`, weight: '弱正' });
  }

  const commuteMins = fav ? extractCommuteMinutes(fav.commute) : null;
  if (commuteMins !== null) {
    if (commuteMins <= 30) {
      score += 10;
      reasons.push({ type: 'commute', text: `通勤仅 ${commuteMins} 分钟，很便利`, weight: '正' });
    } else if (commuteMins <= 45) {
      score += 4;
      reasons.push({ type: 'commute', text: `通勤 ${commuteMins} 分钟，在可接受范围`, weight: '弱正' });
    } else if (commuteMins > 60) {
      score -= 8;
      reasons.push({ type: 'commute', text: `通勤超过 ${commuteMins} 分钟，时间成本较高`, weight: '负' });
    }
  }

  const budgetVal = fav ? extractPriceValue(fav.budget) : null;
  if (budgetVal !== null) {
    if (budgetVal <= 2500) {
      score += 8;
      reasons.push({ type: 'budget', text: `预算偏低 (约${budgetVal}元)，经济友好`, weight: '正' });
    } else if (budgetVal <= 4000) {
      score += 4;
      reasons.push({ type: 'budget', text: `预算适中 (约${budgetVal}元)`, weight: '弱正' });
    } else if (budgetVal > 6000) {
      score -= 5;
      reasons.push({ type: 'budget', text: `预算偏高 (约${budgetVal}元)，经济压力大`, weight: '弱负' });
    }
  }

  if (annotation.price && fav && fav.budget) {
    const price = extractPriceValue(annotation.price);
    const budget = extractPriceValue(fav.budget);
    if (price && budget) {
      if (price > budget * 1.2) {
        score -= 8;
        reasons.push({ type: 'budget', text: `标价超出预算约 ${Math.round((price / budget - 1) * 100)}%`, weight: '负' });
      } else if (price <= budget) {
        score += 5;
        reasons.push({ type: 'budget', text: `标价在预算范围内`, weight: '弱正' });
      }
    }
  }

  const promisesAll = comms.map(c => c.promises).filter(Boolean);
  if (promisesAll.length > 0) {
    score += 3;
    reasons.push({ type: 'comm', text: `已有 ${promisesAll.length} 份沟通承诺记录在案`, weight: '弱正' });
  }

  const brokenKeywords = ['不退还', '不退', '口头', '随时', '无合同', '不签'];
  const brokenPromises = [];
  promisesAll.forEach(p => {
    brokenKeywords.forEach(kw => {
      if (p.includes(kw)) brokenPromises.push(kw);
    });
  });
  if (brokenPromises.length > 0) {
    score -= 10;
    reasons.push({ type: 'comm', text: `沟通中出现风险表述 (${brokenPromises.slice(0, 3).join('、')})`, weight: '负' });
  }

  const appointmentTimes = comms
    .filter(c => c.appointmentTime)
    .map(c => new Date(c.appointmentTime).getTime());
  if (appointmentTimes.length > 0) {
    appointmentTimes.sort();
    const next = appointmentTimes.find(t => t > Date.now());
    if (next) {
      score += 2;
      reasons.push({ type: 'appt', text: `已约看房：${formatDate(next)}`, weight: '弱正' });
    }
  }

  if (fav && fav.status === '已签约') {
    score = Math.min(95, score + 10);
    reasons.push({ type: 'status', text: `状态：已签约`, weight: '正' });
  } else if (fav && fav.status === '已放弃') {
    score = Math.max(5, score - 20);
    reasons.push({ type: 'status', text: `状态：已放弃`, weight: '强负' });
  }

  if (review && review.updatedAt) {
    if (review.realityScore) {
      if (review.realityScore >= 4) {
        score += 8;
        reasons.push({ type: 'review', text: `现场真实度高 (${review.realityScore}/5)`, weight: '正' });
      } else if (review.realityScore <= 2) {
        score -= 10;
        reasons.push({ type: 'review', text: `现场真实度低 (${review.realityScore}/5)，与描述可能有出入`, weight: '负' });
      }
    }
    if (review.transparencyScore) {
      if (review.transparencyScore >= 4) {
        score += 5;
        reasons.push({ type: 'review', text: `费用透明度高 (${review.transparencyScore}/5)`, weight: '弱正' });
      } else if (review.transparencyScore <= 2) {
        score -= 8;
        reasons.push({ type: 'review', text: `费用透明度低 (${review.transparencyScore}/5)，可能有隐藏费用`, weight: '负' });
      }
    }
    if (review.cooperationScore) {
      if (review.cooperationScore >= 4) {
        score += 5;
        reasons.push({ type: 'review', text: `房东配合度高 (${review.cooperationScore}/5)`, weight: '弱正' });
      } else if (review.cooperationScore <= 2) {
        score -= 6;
        reasons.push({ type: 'review', text: `房东配合度低 (${review.cooperationScore}/5)`, weight: '弱负' });
      }
    }
    if (review.idVerified || review.propertyVerified) {
      score += 5;
      const verified = [];
      if (review.idVerified) verified.push('身份证');
      if (review.propertyVerified) verified.push('房产证');
      if (review.authVerified) verified.push('授权书');
      reasons.push({ type: 'review', text: `已核验：${verified.join('、')}`, weight: '弱正' });
    }
    if (review.facilityIssues) {
      score -= 5;
      reasons.push({ type: 'review', text: `存在设施问题需关注`, weight: '弱负' });
    }
  }

  score = Math.max(0, Math.min(100, score));

  let recommendation, recColor, recIcon;
  if (score >= 70) {
    recommendation = '继续联系';
    recColor = 'success';
    recIcon = '✅';
  } else if (score >= 45) {
    recommendation = '谨慎观望';
    recColor = 'warning';
    recIcon = '⚠️';
  } else {
    recommendation = '建议放弃';
    recColor = 'danger';
    recIcon = '🚫';
  }

  return { score, recommendation, recColor, recIcon, reasons };
}

function showPropertyDetail(url) {
  const fav = getFavoriteByUrl(url);
  const risks = state.risks.filter(r => r.url === url);
  const comms = state.communications.filter(c => {
    if (fav && c.favoriteId === fav.id) return true;
    const cfav = state.favorites.find(f => f.id === c.favoriteId);
    return cfav && (cfav.url === url || cfav.normUrl === url);
  });
  const annotation = state.annotations[url] || {};
  const reminders = state.reminders.filter(r => {
    if (fav && r.favoriteId === fav.id) return true;
    if (r.url === url) return true;
    return false;
  });

  const title = fav ? fav.title : truncateUrl(url);
  const levelLabel = { high: '高风险', medium: '中风险', low: '低风险' };
  const decision = calculateDecision({ fav, risks, comms, annotation, review: state.viewingReviews[url] || {} });
  const decisionReasonsByType = {
    risk: decision.reasons.filter(r => r.type === 'risk'),
    budget: decision.reasons.filter(r => r.type === 'budget'),
    commute: decision.reasons.filter(r => r.type === 'commute'),
    comm: decision.reasons.filter(r => r.type === 'comm'),
    appt: decision.reasons.filter(r => r.type === 'appt'),
    status: decision.reasons.filter(r => r.type === 'status'),
    review: decision.reasons.filter(r => r.type === 'review')
  };
  const weightLabels = { '强正': '++', '正': '+', '弱正': '⊕', '弱负': '⊖', '负': '-', '强负': '--' };
  const weightColors = { '强正': '#27ae60', '正': '#2ecc71', '弱正': '#27ae60', '弱负': '#f39c12', '负': '#e67e22', '强负': '#e74c3c' };

  const html = `
    <div class="property-detail">
      <div class="prop-detail-header">
        <div class="prop-detail-title">🏠 ${escapeHtml(title)}</div>
        <div style="display:flex;align-items:center;gap:8px">
          <button class="btn btn-sm btn-ghost" data-action="export-summary" data-url="${escapeHtml(url)}">📄 导出摘要</button>
          ${fav ? `<div class="prop-detail-status">${escapeHtml(fav.status || '收藏中')}</div>` : ''}
        </div>
      </div>
      
      <div class="prop-tabs">
        <button class="prop-tab active" data-prop-tab="decision">
          🧭 决策
        </button>
        <button class="prop-tab" data-prop-tab="risks">
          风险 (${risks.filter(r => !r.resolved).length}/${risks.length})
        </button>
        <button class="prop-tab" data-prop-tab="annotation">
          标注
        </button>
        <button class="prop-tab" data-prop-tab="comms">
          沟通 (${comms.length})
        </button>
        <button class="prop-tab" data-prop-tab="reminders">
          提醒 (${reminders.length})
        </button>
        <button class="prop-tab" data-prop-tab="review">
          复盘
        </button>
        <button class="prop-tab" data-prop-tab="verify">
          核验
        </button>
      </div>

      <div class="prop-tab-content active" data-prop-tab-content="decision">
        <div class="decision-card color-${decision.recColor}">
          <div class="decision-header">
            <div class="decision-icon">${decision.recIcon}</div>
            <div class="decision-info">
              <div class="decision-rec">${decision.recommendation}</div>
              <div class="decision-sub">综合评分 ${decision.score}/100</div>
            </div>
          </div>
          <div class="decision-bar">
            <div class="decision-bar-fill" style="width:${decision.score}%;background:${decision.recColor === 'success' ? '#27ae60' : decision.recColor === 'warning' ? '#f39c12' : '#e74c3c'}"></div>
          </div>
        </div>
        <div class="decision-section">
          <div class="decision-section-title">📊 判断依据</div>
          ${decision.reasons.length === 0 ? `
            <div class="prop-empty" style="padding:20px 0">信息不足，建议完善风险记录和房源信息</div>
          ` : `
            ${Object.entries(decisionReasonsByType).filter(([k, v]) => v.length > 0).map(([type, items]) => `
              <div class="decision-reason-group">
                <div class="decision-reason-type">
                  ${type === 'risk' ? '⚠️ 风险' : type === 'budget' ? '💰 预算' : type === 'commute' ? '🚇 通勤' : type === 'comm' ? '💬 沟通' : type === 'appt' ? '📅 约看' : type === 'review' ? '🏠 复盘' : '📋 状态'}
                </div>
                ${items.map(r => `
                  <div class="decision-reason-item">
                    <span class="decision-weight" style="color:${weightColors[r.weight]}" title="${r.weight}">${weightLabels[r.weight]}</span>
                    <span class="decision-reason-text">${r.text}</span>
                  </div>
                `).join('')}
              </div>
            `).join('')}
          `}
        </div>
        <div class="decision-section">
          <div class="decision-section-title">💡 下一步建议</div>
          <div class="decision-suggestions">
            ${decision.score >= 70 ? `
              <div class="suggest-item">✔️ 建议继续跟进，尽快安排实地看房</div>
              <div class="suggest-item">✔️ 确认约看时间，准备看房问题清单</div>
              ${!comms.some(c => c.appointmentTime) ? `<div class="suggest-item">📌 尽快沟通确认约看时间</div>` : ''}
            ` : decision.score >= 45 ? `
              <div class="suggest-item">⚠️ 建议谨慎对待，先核实关键风险点</div>
              ${risks.filter(r => !r.resolved).length > 0 ? `<div class="suggest-item">📌 优先处理：${risks.filter(r => !r.resolved)[0].title}</div>` : ''}
              <div class="suggest-item">💡 多沟通多对比，不要急于决策</div>
            ` : `
              <div class="suggest-item">🚫 存在较多风险，建议慎重考虑</div>
              <div class="suggest-item">📌 高风险项需逐一核实或回避</div>
              ${risks.some(r => r.level === 'high' && !r.resolved) ? `<div class="suggest-item">⚠️ 已发现高风险：${risks.filter(r => r.level === 'high' && !r.resolved).map(r => r.title).join('、')}</div>` : ''}
              <div class="suggest-item">💡 可在收藏中标记为「已放弃」</div>
            `}
          </div>
        </div>
      </div>

      <div class="prop-tab-content" data-prop-tab-content="risks">
        ${risks.length === 0 ? `
          <div class="prop-empty">暂无风险记录</div>
        ` : risks.map(r => `
          <div class="prop-risk-item level-${r.level || 'medium'} ${r.resolved ? 'resolved' : ''}">
            <div class="prop-risk-header">
              <span class="prop-risk-title">${escapeHtml(r.title)}</span>
              <span class="prop-risk-level">${levelLabel[r.level] || '未知'}</span>
            </div>
            <div class="prop-risk-desc">${escapeHtml(r.description || '').replace(/\n/g, '<br>')}</div>
            ${r.sources && r.sources.length > 0 ? `
              <div class="prop-risk-sources">触发来源：${r.sources.map(s => escapeHtml(s)).join('、')}</div>
            ` : ''}
            <div class="prop-risk-meta">
              <span>${formatDate(r.createdAt)}</span>
              ${r.autoGenerated ? '<span class="auto-tag">自动检测</span>' : '<span class="manual-tag">手动记录</span>'}
            </div>
          </div>
        `).join('')}
      </div>

      <div class="prop-tab-content" data-prop-tab-content="annotation">
        ${!annotation || Object.keys(annotation).length === 0 || !annotation.updatedAt ? `
          <div class="prop-empty">暂无页面标注</div>
        ` : `
          <div class="annotation-list">
            <div class="annotation-item">
              <span class="annotation-label">💰 租金价格</span>
              <span class="annotation-value">${escapeHtml(annotation.price || '未填写')}</span>
            </div>
            <div class="annotation-item">
              <span class="annotation-label">💵 押金</span>
              <span class="annotation-value">${escapeHtml(annotation.deposit || '未填写')}</span>
            </div>
            <div class="annotation-item">
              <span class="annotation-label">📅 付款周期</span>
              <span class="annotation-value">${escapeHtml(annotation.paymentCycle || '未填写')}</span>
            </div>
            <div class="annotation-item">
              <span class="annotation-label">🏢 中介费</span>
              <span class="annotation-value">${escapeHtml(annotation.agencyFee || '未填写')}</span>
            </div>
            <div class="annotation-item">
              <span class="annotation-label">👤 房东身份</span>
              <span class="annotation-value">${escapeHtml(annotation.landlordIdentity || '未填写')}</span>
            </div>
            <div class="annotation-item">
              <span class="annotation-label">🔑 看房方式</span>
              <span class="annotation-value">${escapeHtml(annotation.viewingMethod || '未填写')}</span>
            </div>
            <div class="annotation-item">
              <span class="annotation-label">📝 合同条款</span>
              <span class="annotation-value">${escapeHtml(annotation.contractTerms || '未填写')}</span>
            </div>
          </div>
          <div class="annotation-update-time">更新于 ${formatDate(annotation.updatedAt)}</div>
        `}
      </div>

      <div class="prop-tab-content" data-prop-tab-content="comms">
        ${comms.length === 0 ? `
          <div class="prop-empty">暂无沟通记录</div>
        ` : comms.map(c => `
          <div class="prop-comm-item">
            ${c.contact ? `<div class="prop-comm-contact">👤 ${escapeHtml(c.contact)}</div>` : ''}
            ${c.keyPoints ? `<div class="prop-comm-text"><b>要点：</b>${escapeHtml(c.keyPoints)}</div>` : ''}
            ${c.promises ? `<div class="prop-comm-text"><b>承诺：</b>${escapeHtml(c.promises)}</div>` : ''}
            <div class="prop-comm-meta">
              <span>${formatDate(c.createdAt)}</span>
              ${c.appointmentTime ? `<span>📅 约看：${formatDate(new Date(c.appointmentTime).getTime())}</span>` : ''}
            </div>
          </div>
        `).join('')}
      </div>

      <div class="prop-tab-content" data-prop-tab-content="reminders">
        ${reminders.length === 0 ? `
          <div class="prop-empty">暂无提醒</div>
        ` : reminders.map(r => `
          <div class="prop-reminder-item ${r.triggered ? 'triggered' : ''}">
            <div class="prop-reminder-header">
              <span class="prop-reminder-title">${escapeHtml(r.title || r.type)}</span>
              ${r.triggered ? '<span class="reminded-tag">已提醒</span>' : '<span class="pending-tag">待提醒</span>'}
            </div>
            <div class="prop-reminder-time">⏰ ${formatDate(r.triggerTime || r.createdAt)}</div>
          </div>
        `).join('')}
      </div>

      <div class="prop-tab-content" data-prop-tab-content="review">
        ${(() => {
          const review = state.viewingReviews[url] || {};
          const hasReview = review.updatedAt;
          return `
            <div class="review-form">
              <div class="review-section">
                <div class="review-section-title">📸 现场照片说明</div>
                <textarea class="review-textarea" data-review-key="photoNotes" placeholder="记录现场拍照发现的问题，如墙面裂缝、水管锈蚀等">${escapeHtml(review.photoNotes || '')}</textarea>
              </div>
              <div class="review-section">
                <div class="review-section-title">🔧 设施问题</div>
                <textarea class="review-textarea" data-review-key="facilityIssues" placeholder="记录水电、空调、热水器、门窗等设施问题">${escapeHtml(review.facilityIssues || '')}</textarea>
              </div>
              <div class="review-section">
                <div class="review-section-title">💰 实际费用</div>
                <textarea class="review-textarea" data-review-key="actualCosts" placeholder="记录实际租金、押金、中介费、物业费等，与标注对比">${escapeHtml(review.actualCosts || '')}</textarea>
              </div>
              <div class="review-section">
                <div class="review-section-title">🪪 房东证件核验</div>
                <div class="review-verify-row">
                  <label class="review-check"><input type="checkbox" data-review-key="idVerified" ${review.idVerified ? 'checked' : ''}> 身份证已核实</label>
                  <label class="review-check"><input type="checkbox" data-review-key="propertyVerified" ${review.propertyVerified ? 'checked' : ''}> 房产证已核实</label>
                  <label class="review-check"><input type="checkbox" data-review-key="authVerified" ${review.authVerified ? 'checked' : ''}> 授权书已核实（二房东）</label>
                </div>
                <textarea class="review-textarea" data-review-key="verifyNotes" placeholder="证件核验补充说明">${escapeHtml(review.verifyNotes || '')}</textarea>
              </div>
              <div class="review-section">
                <div class="review-section-title">⭐ 看房评分</div>
                <div class="review-ratings">
                  <div class="rating-row">
                    <span class="rating-label">现场真实度</span>
                    <div class="rating-stars" data-rating-key="realityScore">
                      ${[1,2,3,4,5].map(n => `<span class="star ${(review.realityScore || 0) >= n ? 'active' : ''}" data-score="${n}">★</span>`).join('')}
                    </div>
                    <span class="rating-val">${review.realityScore || 0}/5</span>
                  </div>
                  <div class="rating-row">
                    <span class="rating-label">费用透明度</span>
                    <div class="rating-stars" data-rating-key="transparencyScore">
                      ${[1,2,3,4,5].map(n => `<span class="star ${(review.transparencyScore || 0) >= n ? 'active' : ''}" data-score="${n}">★</span>`).join('')}
                    </div>
                    <span class="rating-val">${review.transparencyScore || 0}/5</span>
                  </div>
                  <div class="rating-row">
                    <span class="rating-label">房东配合度</span>
                    <div class="rating-stars" data-rating-key="cooperationScore">
                      ${[1,2,3,4,5].map(n => `<span class="star ${(review.cooperationScore || 0) >= n ? 'active' : ''}" data-score="${n}">★</span>`).join('')}
                    </div>
                    <span class="rating-val">${review.cooperationScore || 0}/5</span>
                  </div>
                </div>
              </div>
              <div class="review-section">
                <div class="review-section-title">📝 看房总评</div>
                <textarea class="review-textarea" data-review-key="overallNotes" placeholder="综合看房感受、是否推荐、需注意的问题">${escapeHtml(review.overallNotes || '')}</textarea>
              </div>
              <div class="review-actions">
                <button class="btn btn-primary btn-sm" id="btnSaveReview" data-review-url="${escapeHtml(url)}">💾 保存复盘</button>
                ${hasReview ? `<span class="review-saved-time">上次保存：${formatDate(review.updatedAt)}</span>` : ''}
              </div>
            </div>
          `;
        })()}
      </div>

      <div class="prop-tab-content" data-prop-tab-content="verify">
        ${(() => {
          const verification = state.verifications[url] || {};
          const review = state.viewingReviews[url] || {};
          const unresolvedRisks = risks.filter(r => !r.resolved);
          const allPromises = comms.map(c => c.promises).filter(Boolean);
          const annFields = [
            { key: 'price', label: '租金价格' },
            { key: 'deposit', label: '押金' },
            { key: 'paymentCycle', label: '付款周期' },
            { key: 'agencyFee', label: '中介费' },
            { key: 'landlordIdentity', label: '房东身份' },
            { key: 'viewingMethod', label: '看房方式' },
            { key: 'contractTerms', label: '合同条款' }
          ];
          const annFilled = annFields.filter(f => annotation[f.key]);
          const paymentChecks = [
            { key: 'vp1', label: '核实收款方身份与房东一致' },
            { key: 'vp2', label: '收款账户为房东本人账户' },
            { key: 'vp3', label: '索要正规收据或发票' },
            { key: 'vp4', label: '银行转账备注用途' },
            { key: 'vp5', label: '避免现金交易和私人转账' },
            { key: 'vp6', label: '保留所有付款凭证' }
          ];
          const reviewChecks = [
            { key: 'vr1', label: '现场照片已拍摄记录', checked: !!(review.photoNotes) },
            { key: 'vr2', label: '设施问题已确认', checked: !!(review.facilityIssues) },
            { key: 'vr3', label: '实际费用已核实', checked: !!(review.actualCosts) },
            { key: 'vr4', label: '房东证件已核验', checked: !!(review.idVerified || review.propertyVerified) }
          ];
          
          const checked = verification.checkedItems || {};
          return `
            <div class="verify-list">
              <div class="verify-group">
                <div class="verify-group-title">📝 页面标注确认 (${annFilled.length}/${annFields.length} 已填写)</div>
                ${annFilled.map(f => `
                  <label class="verify-item ${checked[`ann_${f.key}`] ? 'checked' : ''}">
                    <input type="checkbox" data-verify-key="ann_${f.key}" ${checked[`ann_${f.key}`] ? 'checked' : ''}>
                    <span>${f.label}：${escapeHtml(annotation[f.key])}</span>
                  </label>
                `).join('')}
                ${annFilled.length === 0 ? '<div class="verify-empty">暂无页面标注</div>' : ''}
              </div>
              
              <div class="verify-group">
                <div class="verify-group-title">🤝 沟通承诺确认</div>
                ${allPromises.length > 0 ? allPromises.map((p, i) => p.split(/[\n;；]/).map(s => s.trim()).filter(Boolean).map(line => `
                  <label class="verify-item ${checked[`promise_${i}_${line.substring(0, 10)}`] ? 'checked' : ''}">
                    <input type="checkbox" data-verify-key="promise_${i}_${line.substring(0, 10)}" ${checked[`promise_${i}_${line.substring(0, 10)}`] ? 'checked' : ''}>
                    <span>${escapeHtml(line)}</span>
                  </label>
                `).join('')).join('') : '<div class="verify-empty">暂无沟通承诺</div>'}
              </div>
              
              <div class="verify-group">
                <div class="verify-group-title">⚠️ 风险项确认 (${unresolvedRisks.length} 项未解决)</div>
                ${unresolvedRisks.length > 0 ? unresolvedRisks.map(r => `
                  <label class="verify-item ${checked[`risk_${r.id}`] ? 'checked' : ''}">
                    <input type="checkbox" data-verify-key="risk_${r.id}" ${checked[`risk_${r.id}`] ? 'checked' : ''}>
                    <span class="verify-risk level-${r.level}">[${levelLabel[r.level] || '未知'}]</span>
                    <span>${escapeHtml(r.title)}</span>
                  </label>
                `).join('') : '<div class="verify-empty">✅ 无未解决风险</div>'}
              </div>
              
              <div class="verify-group">
                <div class="verify-group-title">🏠 看房复盘确认</div>
                ${reviewChecks.map(item => `
                  <label class="verify-item ${checked[item.key] || item.checked ? 'checked' : ''}">
                    <input type="checkbox" data-verify-key="${item.key}" ${checked[item.key] || item.checked ? 'checked' : ''}>
                    <span>${item.label}</span>
                  </label>
                `).join('')}
              </div>
              
              <div class="verify-group">
                <div class="verify-group-title">💳 付款前核验</div>
                ${paymentChecks.map(item => `
                  <label class="verify-item ${checked[item.key] ? 'checked' : ''}">
                    <input type="checkbox" data-verify-key="${item.key}" ${checked[item.key] ? 'checked' : ''}>
                    <span>${item.label}</span>
                  </label>
                `).join('')}
              </div>
            </div>
            
            <div class="verify-footer">
              <button class="btn btn-primary btn-sm" id="btnSaveVerify" data-verify-url="${escapeHtml(url)}">✅ 保存核验记录</button>
              ${verification.updatedAt ? `<span class="verify-saved-time">上次核验：${formatDate(verification.updatedAt)}</span>` : ''}
            </div>
          `;
        })()}
      </div>
    </div>
  `;

  const modal = document.getElementById('modal');
  const content = document.getElementById('modalContent');
  content.innerHTML = `
    <div class="modal-header">
      <div class="modal-title">房源详情</div>
      <button class="modal-close" data-close="modal">×</button>
    </div>
    <div class="modal-body modal-body-large">${html}</div>
  `;
  modal.classList.add('open', 'property-detail-modal');

  content.querySelectorAll('[data-prop-tab]').forEach(tab => {
    tab.addEventListener('click', () => {
      const tabName = tab.dataset.propTab;
      content.querySelectorAll('[data-prop-tab]').forEach(t => t.classList.remove('active'));
      content.querySelectorAll('[data-prop-tab-content]').forEach(tc => tc.classList.remove('active'));
      tab.classList.add('active');
      content.querySelector(`[data-prop-tab-content="${tabName}"]`).classList.add('active');
    });
  });

  content.querySelectorAll('.rating-stars .star').forEach(star => {
    star.addEventListener('click', () => {
      const container = star.closest('.rating-stars');
      const ratingKey = container.dataset.ratingKey;
      const score = parseInt(star.dataset.score);
      container.querySelectorAll('.star').forEach((s, i) => {
        s.classList.toggle('active', i < score);
      });
      const valEl = star.closest('.rating-row').querySelector('.rating-val');
      if (valEl) valEl.textContent = `${score}/5`;
      container.dataset.selectedScore = score;
    });
  });

  const saveReviewBtn = content.querySelector('#btnSaveReview');
  if (saveReviewBtn) {
    saveReviewBtn.addEventListener('click', async () => {
      const reviewUrl = saveReviewBtn.dataset.reviewUrl;
      const data = {};
      content.querySelectorAll('[data-review-key]').forEach(el => {
        if (el.type === 'checkbox') {
          data[el.dataset.reviewKey] = el.checked;
        } else {
          data[el.dataset.reviewKey] = el.value;
        }
      });
      content.querySelectorAll('.rating-stars').forEach(container => {
        const key = container.dataset.ratingKey;
        data[key] = parseInt(container.dataset.selectedScore || '0');
      });
      await chrome.runtime.sendMessage({ action: 'saveViewingReview', url: reviewUrl, data });
      state.viewingReviews[reviewUrl] = { ...data, updatedAt: Date.now() };
      saveReviewBtn.textContent = '✓ 已保存';
      setTimeout(() => { saveReviewBtn.textContent = '💾 保存复盘'; }, 1500);
    });
  }

  const saveVerifyBtn = content.querySelector('#btnSaveVerify');
  if (saveVerifyBtn) {
    saveVerifyBtn.addEventListener('click', async () => {
      const verifyUrl = saveVerifyBtn.dataset.verifyUrl;
      const checkedItems = {};
      content.querySelectorAll('[data-verify-key]').forEach(el => {
        checkedItems[el.dataset.verifyKey] = el.checked;
      });
      const data = { checkedItems };
      await chrome.runtime.sendMessage({ action: 'saveVerification', url: verifyUrl, data });
      state.verifications[verifyUrl] = { ...data, updatedAt: Date.now() };
      saveVerifyBtn.textContent = '✓ 已保存';
      setTimeout(() => { saveVerifyBtn.textContent = '✅ 保存核验记录'; }, 1500);
    });
  }
}

function showCompareView() {
  const selected = state.favorites.filter(f => state.selectedFavorites.includes(f.id));
  if (selected.length < 2) return;

  let sortBy = 'score';
  let scoreMode = 'pre'; // 'pre' or 'post'
  const localWeights = { ...state.compareWeights };

  function calcScore(fav) {
    const riskCount = getRiskCount(fav.url);
    const commute = extractCommuteMinutes(fav.commute);
    const budget = extractPriceValue(fav.budget);

    const maxRisk = 5;
    const riskScore = Math.max(0, 100 - (riskCount / maxRisk) * 100);

    let commuteScore = 50;
    if (commute !== null) {
      if (commute <= 15) commuteScore = 100;
      else if (commute <= 30) commuteScore = 85;
      else if (commute <= 45) commuteScore = 65;
      else if (commute <= 60) commuteScore = 45;
      else commuteScore = Math.max(0, 40 - (commute - 60));
    }

    let budgetScore = 50;
    if (budget !== null) {
      if (budget <= 1500) budgetScore = 95;
      else if (budget <= 2500) budgetScore = 85;
      else if (budget <= 4000) budgetScore = 70;
      else if (budget <= 6000) budgetScore = 50;
      else budgetScore = Math.max(0, 50 - (budget - 6000) / 200);
    }

    if (scoreMode === 'post') {
      const rv = state.viewingReviews[fav.url] || {};
      let reviewScore = 50;
      if (rv.updatedAt) {
        const reality = (rv.realityScore || 0) * 20;
        const transparency = (rv.transparencyScore || 0) * 20;
        const cooperation = (rv.cooperationScore || 0) * 20;
        reviewScore = (reality + transparency + cooperation) / 3;
        if (rv.idVerified) reviewScore = Math.min(100, reviewScore + 10);
        if (rv.propertyVerified) reviewScore = Math.min(100, reviewScore + 10);
      }
      const totalWeight = localWeights.risk + localWeights.commute + localWeights.budget + 40;
      return Math.round(riskScore * (localWeights.risk / totalWeight) + commuteScore * (localWeights.commute / totalWeight) + budgetScore * (localWeights.budget / totalWeight) + reviewScore * (40 / totalWeight));
    }

    const totalWeight = localWeights.risk + localWeights.commute + localWeights.budget;
    const wRisk = localWeights.risk / totalWeight;
    const wComm = localWeights.commute / totalWeight;
    const wBudget = localWeights.budget / totalWeight;

    return Math.round(riskScore * wRisk + commuteScore * wComm + budgetScore * wBudget);
  }

  function buildTable() {
    const sorted = [...selected];
    if (sortBy === 'risk') {
      sorted.sort((a, b) => getRiskCount(a.url) - getRiskCount(b.url));
    } else if (sortBy === 'commute') {
      sorted.sort((a, b) => (extractCommuteMinutes(a.commute) || 9999) - (extractCommuteMinutes(b.commute) || 9999));
    } else if (sortBy === 'budget') {
      sorted.sort((a, b) => (extractPriceValue(a.budget) || 99999) - (extractPriceValue(b.budget) || 99999));
    } else {
      sorted.sort((a, b) => calcScore(b) - calcScore(a));
    }

    return `
      <table class="compare-table">
        <thead>
          <tr>
            <th class="compare-label-col">对比项</th>
            ${sorted.map(f => `<th class="compare-item-col">${escapeHtml(f.title.substring(0, 12))}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
          <tr class="compare-row-score">
            <td class="compare-label">🏆 综合评分</td>
            ${sorted.map(f => {
              const s = calcScore(f);
              const color = s >= 70 ? '#27ae60' : s >= 45 ? '#f39c12' : '#e74c3c';
              return `<td><b style="color:${color};font-size:14px">${s}</b> <span style="font-size:10px;color:#999">/ 100</span></td>`;
            }).join('')}
          </tr>
          <tr>
            <td class="compare-label">💰 预算</td>
            ${sorted.map(f => `<td>${escapeHtml(f.budget || '-')}</td>`).join('')}
          </tr>
          <tr>
            <td class="compare-label">🚇 通勤</td>
            ${sorted.map(f => `<td>${escapeHtml(f.commute || '-')}</td>`).join('')}
          </tr>
          <tr>
            <td class="compare-label">🏙️ 城市</td>
            ${sorted.map(f => `<td>${escapeHtml(f.city || '-')}</td>`).join('')}
          </tr>
          <tr>
            <td class="compare-label">📋 状态</td>
            ${sorted.map(f => `<td>${escapeHtml(f.status || '-')}</td>`).join('')}
          </tr>
          <tr class="compare-row-risk">
            <td class="compare-label">⚠️ 风险数量</td>
            ${sorted.map(f => {
              const count = getRiskCount(f.url);
              return `<td class="${count > 0 ? 'risk-highlight' : ''}"><b>${count}</b> 项</td>`;
            }).join('')}
          </tr>
          <tr>
            <td class="compare-label">📅 约看时间</td>
            ${sorted.map(f => {
              const apt = getAppointmentTime(f.id);
              return `<td>${apt ? formatDate(apt) : '-'}</td>`;
            }).join('')}
          </tr>
          <tr class="compare-row-review">
            <td class="compare-label">⭐ 看房评分</td>
            ${sorted.map(f => {
              const rv = state.viewingReviews[f.url] || {};
              if (!rv.updatedAt) return '<td style="color:#bbb">未看房</td>';
              const avg = Math.round(((rv.realityScore || 0) + (rv.transparencyScore || 0) + (rv.cooperationScore || 0)) / 3 * 10) / 10;
              const color = avg >= 3.5 ? '#27ae60' : avg >= 2 ? '#f39c12' : '#e74c3c';
              return `<td><b style="color:${color}">${avg}</b><span style="font-size:10px;color:#999"> / 5</span></td>`;
            }).join('')}
          </tr>
          <tr>
            <td class="compare-label">📝 备注</td>
            ${sorted.map(f => `<td>${escapeHtml((f.notes || '').substring(0, 30)) || '-'}</td>`).join('')}
          </tr>
          <tr>
            <td class="compare-label">🖇️ 操作</td>
            ${sorted.map(f => `<td><button class="btn btn-sm btn-ghost" data-action="view-fav-detail" data-id="${f.id}" data-close-after="1">查看详情</button></td>`).join('')}
          </tr>
        </tbody>
      </table>
    `;
  }

  function buildWeightPanel() {
    const total = localWeights.risk + localWeights.commute + localWeights.budget;
    return `
      <div class="weight-panel">
        <div class="weight-title">⚖️ 自定义偏好权重 (总分 ${total})</div>
        <div class="weight-row">
          <span class="weight-label">低风险</span>
          <input type="range" min="0" max="100" value="${localWeights.risk}" data-weight="risk">
          <span class="weight-value" data-weight-val="risk">${localWeights.risk}</span>
        </div>
        <div class="weight-row">
          <span class="weight-label">短通勤</span>
          <input type="range" min="0" max="100" value="${localWeights.commute}" data-weight="commute">
          <span class="weight-value" data-weight-val="commute">${localWeights.commute}</span>
        </div>
        <div class="weight-row">
          <span class="weight-label">低预算</span>
          <input type="range" min="0" max="100" value="${localWeights.budget}" data-weight="budget">
          <span class="weight-value" data-weight-val="budget">${localWeights.budget}</span>
        </div>
        <div style="display:flex;justify-content:space-between;margin-top:8px">
          <button class="btn btn-sm btn-ghost" id="resetWeights">重置为默认</button>
          <button class="btn btn-sm" id="saveWeights">💾 保存偏好</button>
        </div>
      </div>
    `;
  }

  function getRiskCount(url) {
    return state.risks.filter(r => r.url === url && !r.resolved).length;
  }

  function getAppointmentTime(favId) {
    const comm = state.communications
      .filter(c => c.favoriteId === favId && c.appointmentTime)
      .sort((a, b) => new Date(a.appointmentTime) - new Date(b.appointmentTime))[0];
    return comm ? new Date(comm.appointmentTime).getTime() : null;
  }

  function rerender() {
    document.getElementById('compareTableContainer').innerHTML = buildTable();
    bindTableActions();
    updateSortButtons();
  }

  function rerenderAll() {
    document.getElementById('compareTableContainer').innerHTML = buildTable();
    updateSortButtons();
  }

  function updateSortButtons() {
    content.querySelectorAll('[data-sort]').forEach(b => {
      b.classList.remove('btn-primary');
      b.classList.add('btn-ghost');
    });
    const active = content.querySelector(`[data-sort="${sortBy}"]`);
    if (active) {
      active.classList.remove('btn-ghost');
      active.classList.add('btn-primary');
    }
  }

  function bindTableActions() {
    content.querySelectorAll('[data-action="view-fav-detail"][data-close-after="1"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        const fav = state.favorites.find(f => f.id === id);
        closeModal();
        if (fav && fav.url) setTimeout(() => showPropertyDetail(fav.url), 50);
      });
    });
  }

  const modal = document.getElementById('modal');
  const content = document.getElementById('modalContent');
  content.innerHTML = `
    <div class="modal-header">
      <div class="modal-title">房源对比 (${selected.length} 套)</div>
      <button class="modal-close" data-close="modal">×</button>
    </div>
    <div class="modal-body modal-body-large">
      <div class="compare-toolbar">
        <span>排序：</span>
        <div class="compare-sort-btns">
          <button class="btn btn-sm btn-primary" data-sort="score">🏆 综合推荐</button>
          <button class="btn btn-sm btn-ghost" data-sort="risk">风险最少</button>
          <button class="btn btn-sm btn-ghost" data-sort="commute">通勤最短</button>
          <button class="btn btn-sm btn-ghost" data-sort="budget">预算最低</button>
        </div>
        <div class="compare-mode-toggle">
          <button class="btn btn-sm btn-ghost ${scoreMode === 'pre' ? 'active-mode' : ''}" data-score-mode="pre">找房前</button>
          <button class="btn btn-sm btn-ghost ${scoreMode === 'post' ? 'active-mode' : ''}" data-score-mode="post">看房后</button>
        </div>
      </div>
      ${buildWeightPanel()}
      <div id="compareTableContainer">${buildTable()}</div>
    </div>
  `;
  modal.classList.add('open', 'compare-modal');

  bindTableActions();

  content.querySelectorAll('[data-sort]').forEach(btn => {
    btn.addEventListener('click', () => {
      sortBy = btn.dataset.sort;
      rerenderAll();
    });
  });

  content.querySelectorAll('[data-score-mode]').forEach(btn => {
    btn.addEventListener('click', () => {
      scoreMode = btn.dataset.scoreMode;
      content.querySelectorAll('[data-score-mode]').forEach(b => b.classList.remove('active-mode'));
      btn.classList.add('active-mode');
      if (sortBy === 'score') rerenderAll();
    });
  });

  content.querySelectorAll('[data-weight]').forEach(input => {
    input.addEventListener('input', () => {
      const key = input.dataset.weight;
      localWeights[key] = parseInt(input.value);
      const valEl = content.querySelector(`[data-weight-val="${key}"]`);
      if (valEl) valEl.textContent = localWeights[key];
      
      const totalEl = content.querySelector('.weight-title');
      const total = localWeights.risk + localWeights.commute + localWeights.budget;
      if (totalEl) totalEl.textContent = `⚖️ 自定义偏好权重 (总分 ${total})`;

      if (sortBy === 'score') rerender();
    });
  });

  const resetBtn = document.getElementById('resetWeights');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      localWeights.risk = 50;
      localWeights.commute = 30;
      localWeights.budget = 20;
      content.querySelectorAll('[data-weight]').forEach(input => {
        input.value = localWeights[input.dataset.weight];
        const valEl = content.querySelector(`[data-weight-val="${input.dataset.weight}"]`);
        if (valEl) valEl.textContent = localWeights[input.dataset.weight];
      });
      const totalEl = content.querySelector('.weight-title');
      if (totalEl) totalEl.textContent = '⚖️ 自定义偏好权重 (总分 100)';
      if (sortBy === 'score') rerender();
    });
  }

  const saveBtn = document.getElementById('saveWeights');
  if (saveBtn) {
    saveBtn.addEventListener('click', () => {
      state.compareWeights = { ...localWeights };
      saveCompareWeights();
      saveBtn.textContent = '✓ 已保存';
      setTimeout(() => { saveBtn.textContent = '💾 保存偏好'; }, 1500);
    });
  }
}

function exportViewingSummary(url) {
  const fav = getFavoriteByUrl(url);
  const risks = state.risks.filter(r => r.url === url);
  const comms = state.communications.filter(c => {
    if (fav && c.favoriteId === fav.id) return true;
    const cfav = state.favorites.find(f => f.id === c.favoriteId);
    return cfav && (cfav.url === url || cfav.normUrl === url);
  });
  const annotation = state.annotations[url] || {};
  const decision = calculateDecision({ fav, risks, comms, annotation, review: state.viewingReviews[url] || {} });

  const lines = [];
  lines.push('═══════════════════════════════════════');
  lines.push('          🏠 看房前检查摘要          ');
  lines.push('═══════════════════════════════════════');
  lines.push('');
  lines.push(`【房源名称】${fav ? fav.title : truncateUrl(url)}`);
  if (fav) {
    lines.push(`【房源链接】${fav.url || url}`);
    if (fav.city) lines.push(`【所在城市】${fav.city}`);
    if (fav.status) lines.push(`【当前状态】${fav.status}`);
  } else {
    lines.push(`【房源链接】${url}`);
  }
  if (fav && fav.budget) lines.push(`【预算范围】${fav.budget}`);
  if (fav && fav.commute) lines.push(`【通勤情况】${fav.commute}`);
  lines.push('');

  lines.push('───────────────────────────────────────');
  lines.push(`🧭 决策建议：${decision.recIcon} ${decision.recommendation} (${decision.score}/100)`);
  lines.push('───────────────────────────────────────');
  lines.push('');

  const levelLabel = { high: '高风险', medium: '中风险', low: '低风险' };
  const unresolvedRisks = risks.filter(r => !r.resolved);
  lines.push(`【⚠️ 风险清单】未解决 ${unresolvedRisks.length} / 总计 ${risks.length}`);
  if (unresolvedRisks.length > 0) {
    unresolvedRisks.forEach((r, i) => {
      lines.push(`  ${i + 1}. [${levelLabel[r.level] || '未知'}] ${r.title}`);
      if (r.sources && r.sources.length > 0) {
        lines.push(`     来源：${r.sources.join('、')}`);
      }
      if (r.details && r.details.length > 0) {
        r.details.forEach(d => lines.push(`     · ${d}`));
      }
    });
  } else {
    lines.push('  ✅ 暂无未解决风险');
  }
  lines.push('');

  const hasAnnotation = annotation.price || annotation.deposit || annotation.paymentCycle ||
    annotation.agencyFee || annotation.landlordIdentity || annotation.viewingMethod || annotation.contractTerms;
  lines.push('【📝 页面标注】');
  if (hasAnnotation) {
    const labels = {
      price: '租金价格', deposit: '押金',
      paymentCycle: '付款周期', agencyFee: '中介费',
      landlordIdentity: '房东身份', viewingMethod: '看房方式',
      contractTerms: '合同条款'
    };
    Object.keys(labels).forEach(k => {
      if (annotation[k]) lines.push(`  · ${labels[k]}：${annotation[k]}`);
    });
  } else {
    lines.push('  （暂无标注）');
  }
  lines.push('');

  lines.push(`【💬 沟通记录】共 ${comms.length} 条`);
  if (comms.length > 0) {
    comms.forEach((c, i) => {
      lines.push(`  ${i + 1}. ${c.contact ? '【' + c.contact + '】' : ''} ${formatDate(c.createdAt)}`);
      if (c.keyPoints) lines.push(`     📝 要点：${c.keyPoints.replace(/\n/g, ' / ')}`);
      if (c.promises) lines.push(`     🤝 承诺：${c.promises.replace(/\n/g, ' / ')}`);
      if (c.appointmentTime) lines.push(`     📅 约看：${formatDate(new Date(c.appointmentTime).getTime())}`);
    });
  } else {
    lines.push('  （暂无沟通记录）');
  }
  lines.push('');

  const allPromises = comms.map(c => c.promises).filter(Boolean);
  if (allPromises.length > 0) {
    lines.push('【🤝 承诺事项汇总】');
    allPromises.forEach(p => {
      p.split(/[\n;；]/).map(s => s.trim()).filter(Boolean).forEach(line => {
        lines.push(`  ☐ ${line}`);
      });
    });
    lines.push('');
  }

  lines.push('【❓ 待问问题】（看房时请逐项确认）');
  [
    '租金、押金、付款方式是否与描述一致？',
    '是否为房东本人？是否有房产证/授权？',
    '水电燃气、物业、网费由谁承担？',
    '押金退还条件？提前解约违约金多少？',
    '是否允许转租？房屋维修谁负责？',
    '家具家电清单及现状（拍照记录）',
    '周边噪音、邻里、交通情况？'
  ].forEach((q, i) => {
    lines.push(`  ☐ Q${i + 1}: ${q}`);
  });
  lines.push('');

  const review = state.viewingReviews[url] || {};
  if (review.updatedAt) {
    lines.push('───────────────────────────────────────');
    lines.push('          📋 看房复盘结果          ');
    lines.push('───────────────────────────────────────');
    lines.push('');
    if (review.photoNotes) {
      lines.push('【📸 现场照片说明】');
      review.photoNotes.split('\n').filter(Boolean).forEach(l => lines.push(`  · ${l}`));
    }
    if (review.facilityIssues) {
      lines.push('【🔧 设施问题】');
      review.facilityIssues.split('\n').filter(Boolean).forEach(l => lines.push(`  ⚠️ ${l}`));
    }
    if (review.actualCosts) {
      lines.push('【💰 实际费用】');
      review.actualCosts.split('\n').filter(Boolean).forEach(l => lines.push(`  · ${l}`));
    }
    lines.push('【🪪 证件核验】');
    lines.push(`  身份证：${review.idVerified ? '✅ 已核实' : '☐ 未核实'}`);
    lines.push(`  房产证：${review.propertyVerified ? '✅ 已核实' : '☐ 未核实'}`);
    lines.push(`  授权书：${review.authVerified ? '✅ 已核实' : '☐ 不适用/未核实'}`);
    if (review.verifyNotes) lines.push(`  备注：${review.verifyNotes}`);
    lines.push('【⭐ 看房评分】');
    lines.push(`  现场真实度：${review.realityScore || 0}/5`);
    lines.push(`  费用透明度：${review.transparencyScore || 0}/5`);
    lines.push(`  房东配合度：${review.cooperationScore || 0}/5`);
    if (review.overallNotes) {
      lines.push('【📝 看房总评】');
      lines.push(`  ${review.overallNotes}`);
    }
    lines.push('');
  }

  const verification = state.verifications[url] || {};
  if (verification.updatedAt || review.updatedAt) {
    lines.push('───────────────────────────────────────');
    lines.push('          📑 签约前核验清单          ');
    lines.push('───────────────────────────────────────');
    lines.push('');
    const checked = verification.checkedItems || {};
    lines.push('【📝 待确认标注】');
    const annLabels = { price: '租金', deposit: '押金', paymentCycle: '付款周期', agencyFee: '中介费', landlordIdentity: '房东身份', viewingMethod: '看房方式', contractTerms: '合同条款' };
    Object.keys(annLabels).forEach(k => {
      if (annotation[k]) {
        const ok = checked[`ann_${k}`] ? '✅' : '☐';
        lines.push(`  ${ok} ${annLabels[k]}：${annotation[k]}`);
      }
    });
    lines.push('');
    lines.push('【🤝 待确认承诺】');
    if (allPromises.length > 0) {
      allPromises.forEach(p => {
        p.split(/[\n;；]/).map(s => s.trim()).filter(Boolean).forEach(line => {
          const key = `promise_0_${line.substring(0, 10)}`;
          const ok = checked[key] ? '✅' : '☐';
          lines.push(`  ${ok} ${line}`);
        });
      });
    } else {
      lines.push('  （无承诺记录）');
    }
    lines.push('');
    lines.push('【⚠️ 待确认风险】');
    if (unresolvedRisks.length > 0) {
      unresolvedRisks.forEach(r => {
        const ok = checked[`risk_${r.id}`] ? '✅' : '☐';
        lines.push(`  ${ok} [${levelLabel[r.level] || '未知'}] ${r.title}`);
      });
    } else {
      lines.push('  ✅ 无未解决风险');
    }
    lines.push('');
    lines.push('【💳 付款前必检项】');
    const paymentItems = [
      { key: 'vp1', label: '核实收款方身份与房东一致' },
      { key: 'vp2', label: '收款账户为房东本人账户' },
      { key: 'vp3', label: '索要正规收据或发票' },
      { key: 'vp4', label: '银行转账备注用途' },
      { key: 'vp5', label: '避免现金交易和私人转账' },
      { key: 'vp6', label: '保留所有付款凭证' }
    ];
    paymentItems.forEach(item => {
      const ok = checked[item.key] ? '✅' : '☐';
      lines.push(`  ${ok} ${item.label}`);
    });
    lines.push('');
  }

  lines.push('【🔍 看房现场核对清单】');
  VIEWING_CHECKLIST.forEach((item, i) => {
    lines.push(`  ☐ ${String(i + 1).padStart(2, '0')}. ${item.label}`);
  });
  lines.push('');

  lines.push('═══════════════════════════════════════');
  lines.push(`生成时间：${new Date().toLocaleString()}`);
  lines.push('═══════════════════════════════════════');

  const text = lines.join('\n');
  
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.top = '-1000px';
  document.body.appendChild(textarea);
  textarea.select();
  try {
    document.execCommand('copy');
    alert('📋 看房摘要已复制到剪贴板！\n\n可粘贴到笔记/备忘录中，或直接打印。');
  } catch (e) {
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `看房摘要_${fav ? fav.title.substring(0, 15) : '房源'}_${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
  }
  document.body.removeChild(textarea);
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
      case 'export-summary': {
        if (url) exportViewingSummary(url);
        break;
      }
      case 'view-property':
      case 'view-fav-detail': {
        let targetUrl = url;
        if (action === 'view-fav-detail') {
          const fav = state.favorites.find(f => f.id === id);
          if (fav) targetUrl = fav.url;
        }
        if (targetUrl) showPropertyDetail(targetUrl);
        break;
      }
      case 'toggle-select': {
        e.stopPropagation();
        const idx = state.selectedFavorites.indexOf(id);
        if (idx >= 0) {
          state.selectedFavorites.splice(idx, 1);
        } else {
          state.selectedFavorites.push(id);
        }
        renderFavorites();
        break;
      }
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
          state.selectedFavorites = state.selectedFavorites.filter(sid => sid !== id);
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

  document.getElementById('btnToggleCompare').addEventListener('click', () => {
    state.compareMode = !state.compareMode;
    if (!state.compareMode) {
      state.selectedFavorites = [];
    }
    renderFavorites();
  });

  document.getElementById('btnStartCompare').addEventListener('click', () => {
    if (state.selectedFavorites.length >= 2) {
      showCompareView();
    }
  });

  document.getElementById('btnCancelCompare').addEventListener('click', () => {
    state.compareMode = false;
    state.selectedFavorites = [];
    renderFavorites();
  });

  document.getElementById('riskViewMode').addEventListener('change', (e) => {
    state.riskViewMode = e.target.value;
    renderRisks();
  });

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
