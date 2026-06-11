const DEFAULT_STATE = {
  favorites: [],
  risks: [],
  communications: [],
  reminders: [],
  annotations: {}
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

chrome.runtime.onInstalled.addListener(async () => {
  const state = await getState();
  await setState(state);
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
          const risk = { id: generateId(), createdAt: Date.now(), resolved: false, ...message.data };
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
            addAutoReminder({
              type: 'appointment',
              title: '看房提醒',
              content: `您预约了 ${new Date(comm.appointmentTime).toLocaleString()} 看房`,
              remindAt: new Date(comm.appointmentTime).getTime() - 3600000
            });
          }
          sendResponse({ success: true, data: comm });
          break;
        }
        case 'updateCommunication': {
          const state = await getState();
          const idx = state.communications.findIndex(c => c.id === message.id);
          if (idx >= 0) {
            state.communications[idx] = { ...state.communications[idx], ...message.data, updatedAt: Date.now() };
            await setState({ communications: state.communications });
            sendResponse({ success: true, data: state.communications[idx] });
          } else {
            sendResponse({ success: false });
          }
          break;
        }
        case 'deleteCommunication': {
          const state = await getState();
          state.communications = state.communications.filter(c => c.id !== message.id);
          await setState({ communications: state.communications });
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
            await setState({ reminders: state.reminders });
            sendResponse({ success: true, data: state.reminders[idx] });
          } else {
            sendResponse({ success: false });
          }
          break;
        }
        case 'deleteReminder': {
          const state = await getState();
          state.reminders = state.reminders.filter(r => r.id !== message.id);
          await setState({ reminders: state.reminders });
          sendResponse({ success: true });
          break;
        }
        case 'saveAnnotation': {
          const state = await getState();
          const { url, data } = message;
          if (!state.annotations[url]) {
            state.annotations[url] = {};
          }
          state.annotations[url] = { ...state.annotations[url], ...data, updatedAt: Date.now() };
          await setState({ annotations: state.annotations });
          autoCheckRisks(url, state.annotations[url]);
          sendResponse({ success: true });
          break;
        }
        case 'getAnnotation': {
          const state = await getState();
          const data = state.annotations[message.url] || {};
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

function scheduleReminder(reminder) {
  if (!reminder.remindAt) return;
  const delay = reminder.remindAt - Date.now();
  if (delay > 0 && delay < 2147483647) {
    setTimeout(() => {
      triggerReminder(reminder.id);
    }, delay);
  }
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
      remindAt: Date.now() + 86400000
    });
  }
}

function autoCheckRisks(url, annotation) {
  const risksToAdd = [];
  
  if (annotation.price) {
    const price = parseFloat(annotation.price);
    if (price && price < 500) {
      risksToAdd.push({
        type: 'low_price',
        title: '价格异常偏低',
        description: `该房源价格 ${price} 元/月 明显低于市场水平，需警惕虚假房源`,
        level: 'high',
        url
      });
    }
  }

  if (annotation.deposit) {
    const deposit = annotation.deposit.toLowerCase();
    if (deposit.includes('年付') || deposit.includes('半年付') || /押[二三四五六七八九十]/.test(deposit)) {
      risksToAdd.push({
        type: 'unusual_deposit',
        title: '押金/付款方式异常',
        description: `付款方式「${deposit}」较为少见，建议谨慎处理`,
        level: 'medium',
        url
      });
    }
  }

  if (annotation.viewingMethod) {
    const method = annotation.viewingMethod.toLowerCase();
    if (method.includes('拒绝') || method.includes('不能看房') || method.includes('视频代替')) {
      risksToAdd.push({
        type: 'refuse_viewing',
        title: '拒绝实地看房',
        description: '对方拒绝实地看房，存在较大风险',
        level: 'high',
        url
      });
    }
  }

  if (annotation.landlordIdentity) {
    const identity = annotation.landlordIdentity.toLowerCase();
    if (identity.includes('二房东') && !identity.includes('授权')) {
      risksToAdd.push({
        type: 'sublessor',
        title: '二房东风险',
        description: '对方为二房东，请确认是否有房东书面授权',
        level: 'medium',
        url
      });
    }
  }

  if (risksToAdd.length > 0) {
    risksToAdd.forEach(risk => {
      chrome.runtime.sendMessage({ action: 'addRisk', data: risk });
    });
  }
}

chrome.notifications.onClicked.addListener(() => {
  chrome.action.openPopup();
});
