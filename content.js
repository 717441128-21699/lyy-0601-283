(function() {
  'use strict';

  let currentUrl = location.href;
  let panelVisible = false;
  let annotationData = {};

  const ANNOTATION_FIELDS = [
    { key: 'price', label: '租金价格', placeholder: '例如：3000 元/月', type: 'text' },
    { key: 'deposit', label: '押金/付款方式', placeholder: '例如：押一付三、押二付一', type: 'text' },
    { key: 'paymentCycle', label: '付款周期', placeholder: '例如：月付、季付、年付', type: 'text' },
    { key: 'agencyFee', label: '中介费用', placeholder: '例如：无中介费、半个月租金', type: 'text' },
    { key: 'landlordIdentity', label: '房东身份', placeholder: '例如：个人房东、中介、二房东', type: 'text' },
    { key: 'viewingMethod', label: '看房方式', placeholder: '例如：随时看房、预约看房、拒绝看房', type: 'text' },
    { key: 'contractTerms', label: '合同条款备注', placeholder: '记录重要合同条款，如：最短租期、违约金等', type: 'textarea' }
  ];

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
    if (document.getElementById('rental-check-panel')) return;

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
        <button class="rental-panel-close" id="rental-panel-close">×</button>
      </div>
      <div class="rental-panel-tabs">
        <button class="rental-tab active" data-tab="annotate">页面标注</button>
        <button class="rental-tab" data-tab="quickrisk">快速风险</button>
        <button class="rental-tab" data-tab="favorite">收藏房源</button>
      </div>
      <div class="rental-panel-content">
        <div class="rental-tab-panel active" data-panel="annotate">
          <div class="rental-hint">标记当前房源的关键信息，系统将自动检测风险</div>
          ${fieldsHtml}
          <div class="rental-actions">
            <button class="rental-btn rental-btn-primary" id="rental-save-annotation">保存标注</button>
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
    loadAnnotationData();
    loadRisksForPage();
  }

  function bindPanelEvents() {
    document.getElementById('rental-panel-close').addEventListener('click', togglePanel);

    document.querySelectorAll('.rental-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.rental-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.rental-tab-panel').forEach(p => p.classList.remove('active'));
        tab.classList.add('active');
        document.querySelector(`.rental-tab-panel[data-panel="${tab.dataset.tab}"]`).classList.add('active');
      });
    });

    document.getElementById('rental-save-annotation').addEventListener('click', saveAnnotation);
    document.getElementById('rental-clear-annotation').addEventListener('click', clearAnnotation);
    document.getElementById('rental-report-risks').addEventListener('click', reportQuickRisks);
    document.getElementById('rental-add-favorite').addEventListener('click', addFavorite);

    document.querySelector('#rental-panel-content [data-panel="annotate"]').addEventListener('input', () => {
      setSaveStatus('');
    });
  }

  async function loadAnnotationData() {
    try {
      const resp = await chrome.runtime.sendMessage({ action: 'getAnnotation', url: currentUrl });
      if (resp && resp.success && resp.data) {
        annotationData = resp.data;
        Object.keys(annotationData).forEach(key => {
          const el = document.querySelector(`.rental-tab-panel[data-panel="annotate"] [data-key="${key}"]`);
          if (el) el.value = annotationData[key];
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

  async function saveAnnotation() {
    const data = {};
    document.querySelectorAll('.rental-tab-panel[data-panel="annotate"] [data-key]').forEach(el => {
      if (el.value.trim()) {
        data[el.dataset.key] = el.value.trim();
      }
    });
    annotationData = data;

    try {
      await chrome.runtime.sendMessage({ action: 'saveAnnotation', url: currentUrl, data });
      setSaveStatus('✓ 已保存，正在检测风险...');
      setTimeout(() => setSaveStatus('✓ 保存成功'), 1500);
    } catch (e) {
      setSaveStatus('✗ 保存失败');
    }
  }

  function clearAnnotation() {
    document.querySelectorAll('.rental-tab-panel[data-panel="annotate"] [data-key]').forEach(el => {
      el.value = '';
    });
    annotationData = {};
    setSaveStatus('');
  }

  async function reportQuickRisks() {
    const riskMap = {
      low_price: { title: '价格异常偏低', description: '该房源价格明显低于市场价，可能存在虚假信息', level: 'high' },
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

    let added = 0;
    for (const cb of checked) {
      const riskDef = riskMap[cb.dataset.risk];
      if (riskDef) {
        try {
          await chrome.runtime.sendMessage({
            action: 'addRisk',
            data: { ...riskDef, url: currentUrl, type: cb.dataset.risk }
          });
          added++;
          cb.checked = false;
        } catch (e) {
          console.error('添加风险失败:', e);
        }
      }
    }
    setSaveStatus(`✓ 已记录 ${added} 条风险`);
    updateRiskBadge();
  }

  async function addFavorite() {
    const data = {
      title: document.getElementById('rental-fav-title').value.trim(),
      city: document.getElementById('rental-fav-city').value.trim(),
      budget: document.getElementById('rental-fav-budget').value.trim(),
      commute: document.getElementById('rental-fav-commute').value.trim(),
      status: document.getElementById('rental-fav-status').value,
      url: currentUrl
    };

    if (!data.title) {
      setSaveStatus('请输入房源标题');
      return;
    }

    try {
      await chrome.runtime.sendMessage({ action: 'addFavorite', data });
      setSaveStatus('✓ 收藏成功');
      document.getElementById('rental-fav-title').value = '';
      document.getElementById('rental-fav-city').value = '';
      document.getElementById('rental-fav-budget').value = '';
      document.getElementById('rental-fav-commute').value = '';
    } catch (e) {
      setSaveStatus('✗ 收藏失败');
    }
  }

  async function loadRisksForPage() {
    try {
      const resp = await chrome.runtime.sendMessage({ action: 'getState' });
      if (resp && resp.success) {
        const pageRisks = resp.data.risks.filter(r => r.url === currentUrl && !r.resolved);
        const badge = document.getElementById('rental-risk-badge');
        if (badge && pageRisks.length > 0) {
          badge.style.display = 'flex';
          badge.textContent = pageRisks.length > 9 ? '9+' : pageRisks.length;
        }
      }
    } catch (e) {}
  }

  async function updateRiskBadge() {
    loadRisksForPage();
  }

  function setSaveStatus(text) {
    const el = document.getElementById('rental-save-status');
    if (el) el.textContent = text;
  }

  function togglePanel() {
    createPanel();
    panelVisible = !panelVisible;
    const panel = document.getElementById('rental-check-panel');
    const fab = document.getElementById('rental-check-fab');
    if (panel) {
      panel.classList.toggle('rental-visible', panelVisible);
    }
    if (fab) {
      fab.classList.toggle('rental-active', panelVisible);
    }
  }

  function init() {
    createFloatingButton();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
