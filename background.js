const DEFAULT_STATE = {
  favorites: [],
  risks: [],
  communications: [],
  reminders: [],
  annotations: {}
};

const RISK_DEFS = {
  low_price: {
    title: '价格异常偏低',
    description: '该房源价格明显低于市场价，可能存在虚假信息或陷阱',
    level: 'high'
  },
  advance_transfer: {
    title: '要求提前转账',
    description: '对方要求提前转账、预付定金或押金，存在诈骗风险',
    level: 'high'
  },
  refuse_viewing: {
    title: '拒绝实地看房',
    description: '对方以各种理由拒绝实地看房，存在较大风险',
    level: 'high'
  },
  info_conflict: {
    title: '房源信息矛盾',
    description: '房源信息前后不一致，或与沟通内容有明显出入，需警惕',
    level: 'medium'
  },
  contract_missing: {
    title: '合同条款缺失',
    description: '合同缺少关键条款，可能导致后续纠纷无据可依',
    level: 'medium'
  },
  unusual_deposit: {
    title: '押金/付款方式异常',
    description: '付款方式较为少见或押金比例过高，建议谨慎处理',
    level: 'medium'
  },
  sublessor: {
    title: '二房东风险',
    description: '对方为二房东，请确认是否有房东书面授权',
    level: 'medium'
  },
  identity_unknown: {
    title: '房东身份不明',
    description: '无法确认房东是否为真实产权人，存在风险',
    level: 'medium'
  }
};

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

async function getState() {
  const result = await chrome.storage.local.get(Object.keys(DEFAULT_STATE));
  return { ...DEFAULT_STATE, ...result };
}

async function setState(partial) {
  await chrome.storage.local.set(partial);
}

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

chrome.runtime.onInstalled.addListener(async () => {
  const state = await getState();
  await setState(state);
  setupAllReminders();
});

chrome.runtime.onStartup.addListener(() => {
  setupAllReminders();
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name.startsWith('reminder_')) {
    const reminderId = alarm.name.replace('reminder_', '');
    await triggerReminder(reminderId);
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    try {
      switch (message.action) {
        case 'getState': {
          const state = await getState();
          sendResponse({ success: true, data: state });
          break;
        }
        case 'addFavorite': {
          const state = await getState();
          const favorite = { id: generateId(), createdAt: Date.now(), ...message.data };
          state.favorites.push(favorite);
          await setState({ favorites: state.favorites });
          checkFavoriteReminders(favorite);
          sendResponse({ success: true, data: favorite });
          break;
        }
        case 'updateFavorite': {
          const state = await getState();
          const idx = state.favorites.findIndex(f => f.id === message.id);
          if (idx >= 0) {
            state.favorites[idx] = { ...state.favorites[idx], ...message.data, updatedAt: Date.now() };
            await setState({ favorites: state.favorites });
            sendResponse({ success: true, data: state.favorites[idx] });
          } else {
            sendResponse({ success: false, error: '未找到房源' });
          }
          break;
        }
        case 'deleteFavorite': {
          const state = await getState();
          state.favorites = state.favorites.filter(f => f.id !== message.id);
          await setState({ favorites: state.favorites });
          sendResponse({ success: true });
          break;
        }
        case 'addRisk': {
          const state = await getState();
          const existing = state.risks.find(r => 
            r.url === message.data.url && 
            r.type === message.data.type && 
            !r.resolved
          );
          if (existing) {
            sendResponse({ success: true, data: existing, duplicate: true });
            break;
          }
          const riskDef = message.data.type && RISK_DEFS[message.data.type] 
            ? RISK_DEFS[message.data.type] 
            : {};
          const risk = { 
            id: generateId(), 
            createdAt: Date.now(), 
            resolved: false, 
            ...riskDef,
            ...message.data 
          };
          state.risks.push(risk);
          await setState({ risks: state.risks });
          sendNotification('租房风险提醒', risk.description || '发现新的租房风险，请关注！');
          sendResponse({ success: true, data: risk });
          break;
        }
        case 'resolveRisk': {
          const state = await getState();
          const idx = state.risks.findIndex(r => r.id === message.id);
          if (idx >= 0) {
            state.risks[idx].resolved = true;
            state.risks[idx].resolvedAt = Date.now();
            await setState({ risks: state.risks });
            sendResponse({ success: true });
          } else {
            sendResponse({ success: false });
          }
          break;
        }
        case 'deleteRisk': {
          const state = await getState();
          state.risks = state.risks.filter(r => r.id !== message.id);
          await setState({ risks: state.risks });
          sendResponse({ success: true });
          break;
        }
        case 'addCommunication': {
          const state = await getState();
          const comm = { id: generateId(), createdAt: Date.now(), ...message.data };
          state.communications.push(comm);
          await setState({ communications: state.communications });
          if (comm.appointmentTime) {
            const apptTime = new Date(comm.appointmentTime).getTime();
            await addAutoAppointmentReminder({
              favoriteId: comm.favoriteId,
              communicationId: comm.id,
              appointmentTime: apptTime
            });
          }
          sendResponse({ success: true, data: comm });
          break;
        }
        case 'updateCommunication': {
          const state = await getState();
          const idx = state.communications.findIndex(c => c.id === message.id);
          if (idx >= 0) {
            const oldComm = state.communications[idx];
            const oldTime = oldComm.appointmentTime ? new Date(oldComm.appointmentTime).getTime() : null;
            state.communications[idx] = { ...state.communications[idx], ...message.data, updatedAt: Date.now() };
            await setState({ communications: state.communications });
            
            const newTime = message.data.appointmentTime !== undefined 
              ? (message.data.appointmentTime ? new Date(message.data.appointmentTime).getTime() : null)
              : oldTime;
            
            if (oldTime !== newTime) {
              const oldReminderIdx = state.reminders.findIndex(r => 
                r.type === 'appointment' && r.communicationId === message.id && !r.triggered
              );
              if (oldReminderIdx >= 0) {
                const oldId = state.reminders[oldReminderIdx].id;
                chrome.alarms.clear(`reminder_${oldId}`);
                state.reminders.splice(oldReminderIdx, 1);
              }
              
              if (newTime) {
                await addAutoAppointmentReminder({
                  favoriteId: state.communications[idx].favoriteId,
                  communicationId: message.id,
                  appointmentTime: newTime
                });
              }
              
              if (oldReminderIdx >= 0 || newTime) {
                await setState({ reminders: state.reminders });
              }
            }
            sendResponse({ success: true, data: state.communications[idx] });
          } else {
            sendResponse({ success: false });
          }
          break;
        }
        case 'deleteCommunication': {
          const state = await getState();
          const comm = state.communications.find(c => c.id === message.id);
          state.communications = state.communications.filter(c => c.id !== message.id);
          
          const relatedReminders = state.reminders.filter(r => r.communicationId === message.id && !r.triggered);
          relatedReminders.forEach(r => {
            chrome.alarms.clear(`reminder_${r.id}`);
          });
          state.reminders = state.reminders.filter(r => r.communicationId !== message.id || r.triggered);
          
          await setState({ 
            communications: state.communications,
            reminders: state.reminders
          });
          sendResponse({ success: true });
          break;
        }
        case 'addReminder': {
          const reminder = { id: generateId(), createdAt: Date.now(), triggered: false, ...message.data };
          const state = await getState();
          state.reminders.push(reminder);
          await setState({ reminders: state.reminders });
          scheduleReminder(reminder);
          sendResponse({ success: true, data: reminder });
          break;
        }
        case 'updateReminder': {
          const state = await getState();
          const idx = state.reminders.findIndex(r => r.id === message.id);
          if (idx >= 0) {
            state.reminders[idx] = { ...state.reminders[idx], ...message.data, updatedAt: Date.now() };
            if (message.data.remindAt) {
              state.reminders[idx].triggered = false;
              state.reminders[idx].triggeredAt = null;
            }
            await setState({ reminders: state.reminders });
            scheduleReminder(state.reminders[idx]);
            sendResponse({ success: true, data: state.reminders[idx] });
          } else {
            sendResponse({ success: false });
          }
          break;
        }
        case 'deleteReminder': {
          const state = await getState();
          const reminder = state.reminders.find(r => r.id === message.id);
          if (reminder) {
            chrome.alarms.clear(`reminder_${reminder.id}`);
          }
          state.reminders = state.reminders.filter(r => r.id !== message.id);
          await setState({ reminders: state.reminders });
          sendResponse({ success: true });
          break;
        }
        case 'saveAnnotation': {
          const state = await getState();
          const url = normalizeUrl(message.url);
          const fullData = { ...message.data, updatedAt: Date.now() };
          state.annotations[url] = fullData;
          await setState({ annotations: state.annotations });
          const result = await autoCheckRisks(url, fullData);
          sendResponse({ success: true, ...result });
          break;
        }
        case 'getAnnotation': {
          const state = await getState();
          const url = normalizeUrl(message.url);
          const data = state.annotations[url] || {};
          sendResponse({ success: true, data });
          break;
        }
        default:
          sendResponse({ success: false, error: '未知操作' });
      }
    } catch (e) {
      console.error('消息处理错误:', e);
      sendResponse({ success: false, error: e.message });
    }
  })();
  return true;
});

async function addAutoReminder(reminderData) {
  const state = await getState();
  const reminder = { id: generateId(), createdAt: Date.now(), triggered: false, ...reminderData };
  state.reminders.push(reminder);
  await setState({ reminders: state.reminders });
  scheduleReminder(reminder);
}

async function addAutoAppointmentReminder({ favoriteId, communicationId, appointmentTime }) {
  const state = await getState();
  const remindTime = appointmentTime - 3600000;
  if (remindTime <= Date.now()) return;
  
  const reminder = {
    id: generateId(),
    type: 'appointment',
    title: '约看提醒',
    content: `您预约了 ${new Date(appointmentTime).toLocaleString()} 看房，请提前做好准备`,
    remindAt: remindTime,
    triggerTime: appointmentTime,
    favoriteId,
    communicationId,
    autoGenerated: true,
    createdAt: Date.now(),
    triggered: false
  };
  state.reminders.push(reminder);
  await setState({ reminders: state.reminders });
  scheduleReminder(reminder);
  return reminder;
}

function scheduleReminder(reminder) {
  if (!reminder.remindAt) return;
  if (reminder.triggered) return;
  
  const alarmName = `reminder_${reminder.id}`;
  const now = Date.now();
  
  if (reminder.remindAt > now) {
    const delayInMinutes = Math.max(1, Math.ceil((reminder.remindAt - now) / 60000));
    chrome.alarms.create(alarmName, {
      delayInMinutes: delayInMinutes
    });
  }
}

async function setupAllReminders() {
  const state = await getState();
  const now = Date.now();
  
  state.reminders.forEach(reminder => {
    if (reminder.remindAt && !reminder.triggered && reminder.remindAt > now) {
      scheduleReminder(reminder);
    } else if (reminder.remindAt && !reminder.triggered && reminder.remindAt <= now) {
      triggerReminder(reminder.id);
    }
  });
}

async function triggerReminder(id) {
  const state = await getState();
  const reminder = state.reminders.find(r => r.id === id);
  if (reminder && !reminder.triggered) {
    reminder.triggered = true;
    reminder.triggeredAt = Date.now();
    await setState({ reminders: state.reminders });
    sendNotification(reminder.title || '租房提醒', reminder.content || '您有一条租房相关提醒');
  }
}

function sendNotification(title, message) {
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA0OCA0OCI+PHBhdGggZmlsbD0iI0Y5NTg1NCIgZD0iTTI0IDRMMiA0NGg0NEwyNCA0eiIvPjxwYXRoIGZpbGw9IiNGRkYiIGQ9Ik0yMiAxNGg0djE0aC00em0wIDE4aDR2NGgtNHoiLz48L3N2Zz4=',
    title,
    message
  });
}

function checkFavoriteReminders(favorite) {
  if (favorite.status === '待看房' && !favorite.viewed) {
    addAutoReminder({
      type: 'viewing',
      title: '看房准备提醒',
      content: `请准备查看房源：${favorite.title || favorite.url}，记得确认看房问题清单`,
      remindAt: Date.now() + 86400000,
      favoriteId: favorite.id
    });
  }
}

function extractPrice(text) {
  if (!text) return null;
  const match = text.match(/(\d+(?:\.\d+)?)\s*(?:元|块|rmb|¥|￥)?\s*(?:\/\s*(?:月|month|m))?/i);
  if (match) return parseFloat(match[1]);
  const pureNumber = parseFloat(text);
  if (!isNaN(pureNumber)) return pureNumber;
  return null;
}

function extractNumbers(text) {
  if (!text) return [];
  const matches = text.match(/\d+(?:\.\d+)?/g);
  return matches ? matches.map(Number) : [];
}

async function autoCheckRisks(url, annotation) {
  const state = await getState();
  const existingRisks = state.risks.filter(r => r.url === url && !r.resolved);
  const existingMap = {};
  existingRisks.forEach(r => { existingMap[r.type] = r; });

  const triggers = {};

  function addTrigger(type, field, detail) {
    if (!triggers[type]) {
      triggers[type] = { type, sources: [], details: [] };
    }
    triggers[type].sources.push(field);
    if (detail) triggers[type].details.push(detail);
  }

  if (annotation.price) {
    const price = extractPrice(annotation.price);
    if (price && price > 0 && price < 800) {
      addTrigger('low_price', '租金价格', `价格约 ${price} 元/月，明显偏低`);
    }
  }

  if (annotation.deposit) {
    const deposit = annotation.deposit;
    const dLower = deposit.toLowerCase();
    const advanceKeywords = [
      '提前转账', '提前付款', '预先支付', '先转', '先打款',
      '预付定金', '预付押金', '预付房租', '预付租金',
      '年付', '半年付', '一次性付清', '一次性支付'
    ];
    
    let hasAdvance = false;
    advanceKeywords.forEach(kw => {
      if (dLower.includes(kw.toLowerCase())) hasAdvance = true;
    });
    
    if (hasAdvance) {
      addTrigger('advance_transfer', '押金/付款方式', `付款方式「${deposit}」涉及提前付款`);
    }
    
    if (/押[二三四五六七八九十]/.test(deposit)) {
      addTrigger('unusual_deposit', '押金/付款方式', `押金比例偏高：${deposit.match(/押[二三四五六七八九十]/)[0]}`);
    }
  }

  if (annotation.paymentCycle) {
    const cycle = annotation.paymentCycle.toLowerCase();
    if (cycle.includes('年付') || cycle.includes('半年付') || cycle.includes('一次性')) {
      addTrigger('advance_transfer', '付款周期', `付款周期「${annotation.paymentCycle}」需一次性支付`);
    }
  }

  if (annotation.viewingMethod) {
    const method = annotation.viewingMethod.toLowerCase();
    const refuseKeywords = [
      '拒绝', '不同意', '不方便看房', '不能看房', '不给看房',
      '视频代替', '只看视频', '线上看房代替', '不用看房',
      '人在外地', '暂时不在本地', '没法带看', '无法看房'
    ];
    
    let isRefuse = false;
    refuseKeywords.forEach(kw => {
      if (method.includes(kw)) isRefuse = true;
    });
    
    if (isRefuse) {
      addTrigger('refuse_viewing', '看房方式', `看房方式「${annotation.viewingMethod}」，拒绝实地看房`);
    }
  }

  if (annotation.landlordIdentity) {
    const identity = annotation.landlordIdentity.toLowerCase();
    if (identity.includes('二房东') && !identity.includes('授权')) {
      addTrigger('sublessor', '房东身份', '对方为二房东，未提及有房东授权');
    }
    if (identity.includes('不确定') || identity.includes('不清楚') || identity.includes('不知道')
         || identity.includes('无法确认') || identity.includes('身份不明')) {
      addTrigger('identity_unknown', '房东身份', '房东身份无法确认');
    }
  }

  if (annotation.contractTerms) {
    const terms = annotation.contractTerms;
    const missingKeywords = [
      '没有租期', '没写租期', '租期不确定', '租期不明',
      '押金不退', '押金不退还', '不退押金',
      '没有违约金', '没写违约', '违约不明',
      '合同不正规', '没有合同', '不签合同', '口头协议',
      '缺少条款', '条款不全'
    ];
    
    let hasMissing = false;
    const missingItems = [];
    const tLower = terms.toLowerCase();
    missingKeywords.forEach(kw => {
      if (tLower.includes(kw.toLowerCase())) {
        hasMissing = true;
        missingItems.push(kw);
      }
    });
    
    if (hasMissing) {
      addTrigger('contract_missing', '合同条款', `发现以下问题：${missingItems.slice(0, 3).join('、')}${missingItems.length > 3 ? '等' : ''}`);
    }
  }

  const allFields = {
    price: annotation.price,
    deposit: annotation.deposit,
    paymentCycle: annotation.paymentCycle,
    agencyFee: annotation.agencyFee,
    landlordIdentity: annotation.landlordIdentity,
    viewingMethod: annotation.viewingMethod,
    contractTerms: annotation.contractTerms
  };
  const filledCount = Object.values(allFields).filter(v => v && v.trim()).length;
  if (filledCount >= 3) {
    const conflictSigns = [];
    
    if (annotation.price && annotation.deposit) {
      const price = extractPrice(annotation.price);
      if (price && price < 1000) {
        const dLower = annotation.deposit.toLowerCase();
        if (dLower.includes('高档') || dLower.includes('豪华') || dLower.includes('精装')) {
          conflictSigns.push('价格偏低但描述高档');
        }
      }
    }
    
    if (conflictSigns.length > 0) {
      addTrigger('info_conflict', '综合信息', `信息矛盾点：${conflictSigns.join('、')}`);
    }
  }

  const newRisks = [];
  const updatedRisks = [];

  for (const type in triggers) {
    const trigger = triggers[type];
    const riskDef = RISK_DEFS[type] || { title: type, level: 'medium' };
    const sourcesText = trigger.sources.length > 0 ? `触发来源：${trigger.sources.join('、')}` : '';
    const detailsText = trigger.details.length > 0 ? `\n具体情况：\n${trigger.details.map((d, i) => `${i + 1}. ${d}`).join('\n')}` : '';
    const fullDescription = riskDef.description + (sourcesText || detailsText ? `\n\n${sourcesText}${detailsText}` : '');

    if (existingMap[type]) {
      const existing = existingMap[type];
      const idx = state.risks.findIndex(r => r.id === existing.id);
      if (idx >= 0) {
        state.risks[idx] = { 
          ...state.risks[idx], 
          description: fullDescription,
          sources: trigger.sources,
          details: trigger.details,
          updatedAt: Date.now()
        };
        updatedRisks.push(state.risks[idx]);
      }
    } else {
      const risk = {
        id: generateId(),
        type,
        title: riskDef.title,
        description: fullDescription,
        level: riskDef.level,
        url,
        sources: trigger.sources,
        details: trigger.details,
        createdAt: Date.now(),
        resolved: false,
        autoGenerated: true
      };
      state.risks.push(risk);
      newRisks.push(risk);
    }
  }

  if (newRisks.length > 0 || updatedRisks.length > 0) {
    await setState({ risks: state.risks });
    newRisks.forEach(risk => {
      sendNotification('租房风险提醒', risk.title + '：' + (risk.details && risk.details[0] ? risk.details[0] : risk.description.substring(0, 50)));
    });
  }

  return { newRisks, updatedRisks, totalTriggers: Object.keys(triggers).length };
}

chrome.notifications.onClicked.addListener(() => {
  chrome.action.openPopup();
});
