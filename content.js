(function() {
  'use strict';

  let currentUrl = location.href;
  let panelVisible = false;
  let annotationData = {};
  let isSaving = false;
  let saveTimeout = null;
  let panelInitialized = false;

  const ANNOTATION_FIELDS = [
    { key: 'price', label: '租金价格', placeholder: '例如：3000 元/月', type: 'text' },
    { key: 'deposit', label: '押金/付款方式', placeholder: '例如：押一付三、押二付一', type: 'text' },
    { key: 'paymentCycle', label: '付款周期', placeholder: '例如：月付、季付、年付', type: 'text' },
    { key: 'agencyFee', label: '中介费用', placeholder: '例如：无中介费、半个月租金', type: 'text' },
    { key: 'landlordIdentity', label: '房东身份', placeholder: '例如：个人房东、中介、二房东', type: 'text' },
    { key: 'viewingMethod', label: '看房方式', placeholder: '例如：随时看房、预约看房、拒绝看房', type: 'text' },
    { key: 'contractTerms', label: '合同条款备注', placeholder: '记录重要合同条款，如：最短租期、违约金等', type: 'textarea' }
  ];

  function normalizeUrl(url) {
    try {
      const u = new URL(url);
      let pathname = u.pathname;
      if (pathname.endsWith('/')) pathname = pathname.slice(0, -1);
      return u.origin + pathname;
    } catch {
      return url;
    }
  }

  function getCurrentUrl() {
    return normalizeUrl(location.href);
  }

  function createFloatingButton() {
    if (document.getElementById('rental-check-fab')) return;

    const fab = document.createElement('div');
    fab.id = 'rental-check-fab';
    fab.className = 'rental-check-fab';
    fab.innerHTML = `
      <svg viewBox="0 0 24 24" width="24" height="24" fill="white">
        <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"/>
      </svg>
      <span class="rental-check-fab-badge" id="rental-risk-badge" style="display:none">0</span>
    `;
    fab.addEventListener('click', togglePanel);
    document.body.appendChild(fab);
  }

  function createPanel() {
    if (document.getElementById('rental-check-panel')) {
      return document.getElementById('rental-check-panel');
    }

    const panel = document.createElement('div');
    panel.id = 'rental-check-panel';
    panel.className = 'rental-check-panel';

    const fieldsHtml = ANNOTATION_FIELDS.map(f => {
      if (f.type === 'textarea') {
        return `
          <div class="rental-field">
            <label>${f.label}</label>
            <textarea data-key="${f.key}" placeholder="${f.placeholder}" rows="3"></textarea>
          </div>
        `;
      }
      return `
        <div class="rental-field">
          <label>${f.label}</label>
          <input type="${f.type}" data-key="${f.key}" placeholder="${f.placeholder}">
        </div>
      `;
    }).join('');

    panel.innerHTML = `
      <div class="rental-panel-header">
        <span class="rental-panel-title">🏠 租房风险检查</span>
        <button class="rental-panel-close" id="rental-panel-close" aria-label="关闭">×</button>
      </div>
      <div class="rental-panel-tabs">
        <button class="rental-tab active" data-tab="annotate">页面标注</button>
        <button class="rental-tab" data-tab="quickrisk">快速风险</button>
        <button class="rental-tab" data-tab="favorite">收藏房源</button>
      </div>
      <div class="rental-panel-content">
        <div class="rental-tab-panel active" data-panel="annotate">
          <div class="rental-hint">标记当前房源的关键信息，系统将自动检测风险</div>
          <div class="rental-save-indicator" id="rental-save-indicator">
            <span class="save-dot"></span>
            <span class="save-text">自动保存中</span>
          </div>
          ${fieldsHtml}
          <div class="rental-actions">
            <button class="rental-btn rental-btn-primary" id="rental-save-annotation">立即保存</button>
            <button class="rental-btn" id="rental-clear-annotation">清空</button>
          </div>
        </div>
        <div class="rental-tab-panel" data-panel="quickrisk">
          <div class="rental-hint">快速标记常见风险点</div>
          <div class="rental-risk-quick-list">
            <label class="rental-risk-item">
              <input type="checkbox" data-risk="low_price">
              <span>⚠️ 价格明显低于市场价</span>
            </label>
            <label class="rental-risk-item">
              <input type="checkbox" data-risk="advance_transfer">
              <span>💰 要求提前转账/预付定金</span>
            </label>
            <label class="rental-risk-item">
              <input type="checkbox" data-risk="refuse_viewing">
              <span>🚫 拒绝实地看房</span>
            </label>
            <label class="rental-risk-item">
              <input type="checkbox" data-risk="info_conflict">
              <span>❓ 房源信息前后矛盾</span>
            </label>
            <label class="rental-risk-item">
              <input type="checkbox" data-risk="contract_missing">
              <span>📋 合同缺少关键条款</span>
            </label>
            <label class="rental-risk-item">
              <input type="checkbox" data-risk="identity_unknown">
              <span>👤 房东身份无法确认</span>
            </label>
          </div>
          <div class="rental-actions">
            <button class="rental-btn rental-btn-primary" id="rental-report-risks">提交风险</button>
          </div>
        </div>
        <div class="rental-tab-panel" data-panel="favorite">
          <div class="rental-hint">快速收藏当前房源</div>
          <div class="rental-field">
            <label>房源标题</label>
            <input type="text" id="rental-fav-title" placeholder="请输入房源名称">
          </div>
          <div class="rental-field">
            <label>所在城市</label>
            <input type="text" id="rental-fav-city" placeholder="例如：北京">
          </div>
          <div class="rental-field">
            <label>预算范围</label>
            <input type="text" id="rental-fav-budget" placeholder="例如：2000-3500">
          </div>
          <div class="rental-field">
            <label>通勤时间</label>
            <input type="text" id="rental-fav-commute" placeholder="例如：地铁30分钟">
          </div>
          <div class="rental-field">
            <label>房源状态</label>
            <select id="rental-fav-status">
              <option value="收藏中">收藏中</option>
              <option value="待看房">待看房</option>
              <option value="已看房">已看房</option>
              <option value="考虑中">考虑中</option>
              <option value="已签约">已签约</option>
              <option value="已放弃">已放弃</option>
            </select>
          </div>
          <div class="rental-actions">
            <button class="rental-btn rental-btn-primary" id="rental-add-favorite">收藏房源</button>
          </div>
        </div>
      </div>
      <div class="rental-panel-footer">
        <span id="rental-save-status"></span>
      </div>
    `;

    document.body.appendChild(panel);
    bindPanelEvents();
    panelInitialized = true;
    
    loadAnnotationData().then(() => {
      loadRisksForPage();
    });
    
    return panel;
  }

  function bindPanelEvents() {
    const closeBtn = document.getElementById('rental-panel-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        hidePanel();
      });
    }

    document.querySelectorAll('.rental-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.rental-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.rental-tab-panel').forEach(p => p.classList.remove('active'));
        tab.classList.add('active');
        document.querySelector(`.rental-tab-panel[data-panel="${tab.dataset.tab}"]`).classList.add('active');
      });
    });

    const saveBtn = document.getElementById('rental-save-annotation');
    if (saveBtn) {
      saveBtn.addEventListener('click', () => saveAnnotation(true));
    }

    const clearBtn = document.getElementById('rental-clear-annotation');
    if (clearBtn) {
      clearBtn.addEventListener('click', clearAnnotation);
    }

    const reportBtn = document.getElementById('rental-report-risks');
    if (reportBtn) {
      reportBtn.addEventListener('click', reportQuickRisks);
    }

    const addFavBtn = document.getElementById('rental-add-favorite');
    if (addFavBtn) {
      addFavBtn.addEventListener('click', addFavorite);
    }

    const annotatePanel = document.querySelector('[data-panel="annotate"]');
    if (annotatePanel) {
      annotatePanel.addEventListener('input', (e) => {
        if (e.target.matches('[data-key]')) {
          setSaveStatus('');
          scheduleAutoSave();
        }
      });
    }
  }

  function scheduleAutoSave() {
    if (saveTimeout) clearTimeout(saveTimeout);
    setSaveIndicator('saving');
    saveTimeout = setTimeout(() => {
      saveAnnotation(false);
    }, 800);
  }

  function setSaveIndicator(state) {
    const indicator = document.getElementById('rental-save-indicator');
    if (!indicator) return;
    
    indicator.className = 'rental-save-indicator save-' + state;
    const text = indicator.querySelector('.save-text');
    if (text) {
      const texts = {
        saving: '正在保存...',
        saved: '已保存',
        error: '保存失败'
      };
      text.textContent = texts[state] || '';
    }
  }

  async function loadAnnotationData() {
    const url = getCurrentUrl();
    try {
      const resp = await chrome.runtime.sendMessage({ action: 'getAnnotation', url });
      if (resp && resp.success && resp.data) {
        annotationData = { ...resp.data };
        Object.keys(annotationData).forEach(key => {
          const el = document.querySelector(`.rental-tab-panel[data-panel="annotate"] [data-key="${key}"]`);
          if (el && annotationData[key]) {
            el.value = annotationData[key];
          }
        });
      }
    } catch (e) {
      console.log('加载标注数据失败:', e);
    }

    const title = document.querySelector('title');
    const favTitleInput = document.getElementById('rental-fav-title');
    if (favTitleInput && title && !favTitleInput.value) {
      favTitleInput.value = title.textContent.trim().substring(0, 100);
    }
  }

  async function saveAnnotation(manual = false) {
    if (isSaving) return;
    isSaving = true;

    const data = {};
    document.querySelectorAll('.rental-tab-panel[data-panel="annotate"] [data-key]').forEach(el => {
      if (el.value && el.value.trim()) {
        data[el.dataset.key] = el.value.trim();
      }
    });
    annotationData = { ...data };

    const url = getCurrentUrl();

    try {
      const resp = await chrome.runtime.sendMessage({ action: 'saveAnnotation', url, data });
      if (resp && resp.success) {
        setSaveIndicator('saved');
        if (manual) {
          setSaveStatus('✓ 保存成功');
          if (resp.newRisks && resp.newRisks.length > 0) {
            setTimeout(() => {
              setSaveStatus(`✓ 保存成功，检测到 ${resp.newRisks.length} 项风险`);
            }, 500);
          }
        }
        updateRiskBadge();
      } else {
        setSaveIndicator('error');
        if (manual) setSaveStatus('✗ 保存失败');
      }
    } catch (e) {
      setSaveIndicator('error');
      if (manual) setSaveStatus('✗ 保存失败');
      console.error('保存标注失败:', e);
    } finally {
      isSaving = false;
      setTimeout(() => setSaveIndicator('saved'), 1000);
    }
  }

  function clearAnnotation() {
    if (confirm('确定要清空所有标注内容吗？')) {
      document.querySelectorAll('.rental-tab-panel[data-panel="annotate"] [data-key]').forEach(el => {
        el.value = '';
      });
      annotationData = {};
      setSaveStatus('');
      saveAnnotation(false);
    }
  }

  async function reportQuickRisks() {
    const riskMap = {
      low_price: { title: '价格异常偏低', description: '该房源价格明显低于市场价，可能存在虚假信息或诈骗陷阱', level: 'high' },
      advance_transfer: { title: '要求提前转账', description: '对方要求提前转账或预付大额定金，存在诈骗风险', level: 'high' },
      refuse_viewing: { title: '拒绝实地看房', description: '对方以各种理由拒绝实地看房，存在较大风险', level: 'high' },
      info_conflict: { title: '房源信息矛盾', description: '房源描述前后不一致，或与实际沟通有明显出入', level: 'medium' },
      contract_missing: { title: '合同条款缺失', description: '合同缺少租期、押金退还、维修责任等关键条款', level: 'medium' },
      identity_unknown: { title: '房东身份不明', description: '无法确认房东是否为真实产权人，存在二房东或诈骗风险', level: 'medium' }
    };

    const checked = document.querySelectorAll('.rental-risk-item input[type="checkbox"]:checked');
    if (checked.length === 0) {
      setSaveStatus('请选择至少一个风险项');
      return;
    }

    const url = getCurrentUrl();
    let added = 0;
    for (const cb of checked) {
      const riskDef = riskMap[cb.dataset.risk];
      if (riskDef) {
        try {
          const resp = await chrome.runtime.sendMessage({
            action: 'addRisk',
            data: { ...riskDef, url, type: cb.dataset.risk }
          });
          if (resp && resp.success && !resp.duplicate) {
            added++;
          }
          cb.checked = false;
        } catch (e) {
          console.error('添加风险失败:', e);
        }
      }
    }
    
    if (added > 0) {
      setSaveStatus(`✓ 新增 ${added} 条风险记录`);
    } else {
      setSaveStatus('风险已存在，未重复添加');
    }
    updateRiskBadge();
  }

  async function addFavorite() {
    const data = {
      title: document.getElementById('rental-fav-title').value.trim(),
      city: document.getElementById('rental-fav-city').value.trim(),
      budget: document.getElementById('rental-fav-budget').value.trim(),
      commute: document.getElementById('rental-fav-commute').value.trim(),
      status: document.getElementById('rental-fav-status').value,
      url: getCurrentUrl()
    };

    if (!data.title) {
      setSaveStatus('请输入房源标题');
      return;
    }

    try {
      await chrome.runtime.sendMessage({ action: 'addFavorite', data });
      setSaveStatus('✓ 收藏成功');
      setTimeout(() => {
        document.getElementById('rental-fav-title').value = '';
        document.getElementById('rental-fav-city').value = '';
        document.getElementById('rental-fav-budget').value = '';
        document.getElementById('rental-fav-commute').value = '';
      }, 1000);
    } catch (e) {
      setSaveStatus('✗ 收藏失败');
      console.error('收藏失败:', e);
    }
  }

  async function loadRisksForPage() {
    const url = getCurrentUrl();
    try {
      const resp = await chrome.runtime.sendMessage({ action: 'getState' });
      if (resp && resp.success) {
        const pageRisks = resp.data.risks.filter(r => {
          if (!r.url) return false;
          try {
            return normalizeUrl(r.url) === url && !r.resolved;
          } catch {
            return r.url === url && !r.resolved;
          }
        });
        const badge = document.getElementById('rental-risk-badge');
        if (badge) {
          if (pageRisks.length > 0) {
            badge.style.display = 'flex';
            badge.textContent = pageRisks.length > 9 ? '9+' : pageRisks.length;
          } else {
            badge.style.display = 'none';
          }
        }
      }
    } catch (e) {
      console.log('加载风险数据失败:', e);
    }
  }

  function updateRiskBadge() {
    loadRisksForPage();
  }

  function setSaveStatus(text) {
    const el = document.getElementById('rental-save-status');
    if (el) el.textContent = text;
  }

  function showPanel() {
    createPanel();
    panelVisible = true;
    const panel = document.getElementById('rental-check-panel');
    const fab = document.getElementById('rental-check-fab');
    if (panel) panel.classList.add('rental-visible');
    if (fab) fab.classList.add('rental-active');
  }

  function hidePanel() {
    panelVisible = false;
    const panel = document.getElementById('rental-check-panel');
    const fab = document.getElementById('rental-check-fab');
    if (panel) panel.classList.remove('rental-visible');
    if (fab) fab.classList.remove('rental-active');
  }

  function togglePanel() {
    if (panelVisible) {
      hidePanel();
    } else {
      showPanel();
      if (panelInitialized) {
        loadAnnotationData();
        loadRisksForPage();
      }
    }
  }

  let lastUrl = getCurrentUrl();
  setInterval(() => {
    const current = getCurrentUrl();
    if (current !== lastUrl) {
      lastUrl = current;
      currentUrl = current;
      if (panelInitialized && panelVisible) {
        loadAnnotationData();
        loadRisksForPage();
      }
    }
  }, 2000);

  function init() {
    if (document.body) {
      createFloatingButton();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
