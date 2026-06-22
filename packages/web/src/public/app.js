/**
 * Aether OS Web UI - 前端应用
 * 纯 HTML/CSS/JS 单页应用，不依赖外部框架
 */

(function () {
  'use strict';

  // ===== API 调用封装 =====
  const API = {
    async get(path) {
      const res = await fetch(path);
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || '请求失败');
      }
      return res.json();
    },
    async post(path, body) {
      const res = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body || {}),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || '请求失败');
      }
      return res.json();
    },
    async del(path) {
      const res = await fetch(path, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || '请求失败');
      }
      return res.json();
    },
  };

  // ===== 工具函数 =====
  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatTime(ts) {
    if (!ts) return '--';
    const d = new Date(ts);
    return d.toLocaleString('zh-CN');
  }

  function formatDuration(seconds) {
    if (seconds < 60) return seconds + 's';
    if (seconds < 3600) return Math.floor(seconds / 60) + 'm ' + (seconds % 60) + 's';
    if (seconds < 86400) return Math.floor(seconds / 3600) + 'h ' + Math.floor((seconds % 3600) / 60) + 'm';
    return Math.floor(seconds / 86400) + 'd ' + Math.floor((seconds % 86400) / 3600) + 'h';
  }

  function statusBadge(status) {
    return '<span class="status-badge status-' + escapeHtml(status) + '">' + escapeHtml(status) + '</span>';
  }

  function truncate(str, len) {
    if (!str) return '';
    return str.length > len ? str.substring(0, len) + '...' : str;
  }

  // ===== 页面路由 =====
  const pages = {
    dashboard: renderDashboard,
    agents: renderAgents,
    memories: renderMemories,
    budget: renderBudget,
    mcp: renderMcp,
    schedules: renderSchedules,
  };

  let currentPage = 'dashboard';
  let refreshTimer = null;

  function navigate(page) {
    currentPage = page;
    document.querySelectorAll('.nav-link').forEach((link) => {
      link.classList.toggle('active', link.dataset.page === page);
    });
    const renderer = pages[page] || pages.dashboard;
    renderer();
  }

  function refresh() {
    if (pages[currentPage]) {
      pages[currentPage]();
    }
  }

  function startAutoRefresh() {
    stopAutoRefresh();
    refreshTimer = setInterval(refresh, 5000);
  }

  function stopAutoRefresh() {
    if (refreshTimer) {
      clearInterval(refreshTimer);
      refreshTimer = null;
    }
  }

  // ===== Dashboard 页面 =====
  async function renderDashboard() {
    const main = document.getElementById('mainContent');
    main.innerHTML = '<div class="empty-state">加载中...</div>';

    try {
      const status = await API.get('/api/status');
      const budgetPct = (status.budget.percentage * 100).toFixed(1);
      const budgetClass = status.budget.percentage >= 0.9 ? 'danger' : status.budget.percentage >= 0.8 ? 'warning' : '';

      main.innerHTML = `
        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-label">Agent 数量</div>
            <div class="stat-value">${status.agentCount}</div>
            <div class="stat-sub">已注册 Agent</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">定时任务</div>
            <div class="stat-value">${status.taskCount}</div>
            <div class="stat-sub">调度器: ${status.schedulerRunning ? '运行中' : '已停止'}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">MCP 工具</div>
            <div class="stat-value">${status.mcpToolCount}</div>
            <div class="stat-sub">${status.mcpServerCount} 个服务器</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">预算使用</div>
            <div class="stat-value">${budgetPct}%</div>
            <div class="stat-sub">${status.budget.dailyUsed} / ${status.budget.dailyBudget} tokens</div>
          </div>
        </div>
        <div class="card">
          <div class="card-header">
            <span class="card-title">预算使用情况</span>
          </div>
          <div class="progress-bar">
            <div class="progress-bar-fill ${budgetClass}" style="width: ${Math.min(budgetPct, 100)}%"></div>
          </div>
          <div class="mt-8 text-muted">剩余: ${status.budget.remaining} tokens</div>
        </div>
        <div class="card">
          <div class="card-header">
            <span class="card-title">系统信息</span>
          </div>
          <table>
            <tr><td>运行时间</td><td>${formatDuration(status.uptime)}</td></tr>
            <tr><td>当前时间</td><td>${formatTime(status.timestamp)}</td></tr>
            <tr><td>调度器状态</td><td>${statusBadge(status.schedulerRunning ? 'running' : 'stopped')}</td></tr>
          </table>
        </div>
      `;
    } catch (err) {
      main.innerHTML = '<div class="empty-state">加载失败: ' + escapeHtml(err.message) + '</div>';
    }
  }

  // ===== Agents 页面 =====
  async function renderAgents() {
    const main = document.getElementById('mainContent');
    main.innerHTML = `
      <div class="card">
        <div class="card-header">
          <span class="card-title">创建 Agent</span>
        </div>
        <form id="createAgentForm">
          <div class="form-row">
            <div class="form-group">
              <label>名称 *</label>
              <input type="text" name="name" placeholder="Agent 名称" required>
            </div>
            <div class="form-group">
              <label>描述</label>
              <input type="text" name="description" placeholder="Agent 描述">
            </div>
            <div class="form-group">
              <label>默认模型</label>
              <input type="text" name="model" placeholder="如 mock-small">
            </div>
          </div>
          <button type="submit" class="btn btn-primary">创建</button>
        </form>
      </div>
      <div class="card">
        <div class="card-header">
          <span class="card-title">Agent 列表</span>
          <button class="btn btn-secondary btn-sm" onclick="window.__refresh()">刷新</button>
        </div>
        <div class="table-wrapper">
          <table>
            <thead>
              <tr><th>ID</th><th>名称</th><th>状态</th><th>创建时间</th><th>操作</th></tr>
            </thead>
            <tbody id="agentsTableBody">
              <tr><td colspan="5" class="text-center text-muted">加载中...</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    `;

    document.getElementById('createAgentForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const formData = new FormData(e.target);
      const body = {};
      for (const [key, value] of formData.entries()) {
        if (value) body[key] = value;
      }
      try {
        await API.post('/api/agents', body);
        e.target.reset();
        loadAgentsTable();
      } catch (err) {
        alert('创建失败: ' + err.message);
      }
    });

    loadAgentsTable();
  }

  async function loadAgentsTable() {
    const tbody = document.getElementById('agentsTableBody');
    if (!tbody) return;
    try {
      const agents = await API.get('/api/agents');
      if (!agents || agents.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">暂无 Agent</td></tr>';
        return;
      }
      tbody.innerHTML = agents.map((agent) => `
        <tr>
          <td title="${escapeHtml(agent.id)}">${escapeHtml(truncate(agent.id, 16))}</td>
          <td>${escapeHtml(agent.name)}</td>
          <td>${statusBadge(agent.status)}</td>
          <td>${formatTime(agent.createdAt)}</td>
          <td>
            <div class="action-group">
              <button class="btn btn-success btn-sm" onclick="window.__agentAction('${agent.id}', 'start')">启动</button>
              <button class="btn btn-warning btn-sm" onclick="window.__agentAction('${agent.id}', 'pause')">暂停</button>
              <button class="btn btn-secondary btn-sm" onclick="window.__agentAction('${agent.id}', 'resume')">恢复</button>
              <button class="btn btn-danger btn-sm" onclick="window.__agentAction('${agent.id}', 'stop')">停止</button>
            </div>
          </td>
        </tr>
      `).join('');
    } catch (err) {
      tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">加载失败: ' + escapeHtml(err.message) + '</td></tr>';
    }
  }

  // ===== Memories 页面 =====
  async function renderMemories() {
    const main = document.getElementById('mainContent');
    main.innerHTML = `
      <div class="card">
        <div class="card-header">
          <span class="card-title">搜索记忆</span>
        </div>
        <div class="form-inline">
          <div class="form-group" style="flex:1">
            <input type="text" id="memorySearchInput" placeholder="输入搜索关键词...">
          </div>
          <button class="btn btn-primary" onclick="window.__searchMemories()">搜索</button>
        </div>
        <div id="memorySearchResults" class="mt-16"></div>
      </div>
      <div class="card">
        <div class="card-header">
          <span class="card-title">添加记忆</span>
        </div>
        <form id="addMemoryForm">
          <div class="form-row">
            <div class="form-group">
              <label>Agent ID *</label>
              <input type="text" name="agentId" placeholder="Agent ID" required>
            </div>
            <div class="form-group">
              <label>类型</label>
              <select name="type">
                <option value="fact">fact</option>
                <option value="experience">experience</option>
                <option value="preference">preference</option>
                <option value="custom">custom</option>
              </select>
            </div>
            <div class="form-group">
              <label>重要性 (0-1)</label>
              <input type="number" name="importance" min="0" max="1" step="0.1" value="0.5">
            </div>
          </div>
          <div class="form-group">
            <label>内容 *</label>
            <textarea name="content" placeholder="记忆内容" required></textarea>
          </div>
          <button type="submit" class="btn btn-primary">添加</button>
        </form>
      </div>
      <div class="card">
        <div class="card-header">
          <span class="card-title">记忆列表</span>
          <button class="btn btn-secondary btn-sm" onclick="window.__refresh()">刷新</button>
        </div>
        <div class="table-wrapper">
          <table>
            <thead>
              <tr><th>ID</th><th>Agent</th><th>内容</th><th>类型</th><th>重要性</th><th>创建时间</th><th>操作</th></tr>
            </thead>
            <tbody id="memoriesTableBody">
              <tr><td colspan="7" class="text-center text-muted">加载中...</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    `;

    document.getElementById('addMemoryForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const formData = new FormData(e.target);
      const body = {};
      for (const [key, value] of formData.entries()) {
        if (value) {
          body[key] = key === 'importance' ? parseFloat(value) : value;
        }
      }
      try {
        await API.post('/api/memories', body);
        e.target.reset();
        loadMemoriesTable();
      } catch (err) {
        alert('添加失败: ' + err.message);
      }
    });

    document.getElementById('memorySearchInput').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') window.__searchMemories();
    });

    loadMemoriesTable();
  }

  async function loadMemoriesTable() {
    const tbody = document.getElementById('memoriesTableBody');
    if (!tbody) return;
    try {
      const data = await API.get('/api/memories?limit=20');
      const items = data.items || [];
      if (items.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted">暂无记忆</td></tr>';
        return;
      }
      tbody.innerHTML = items.map((m) => `
        <tr>
          <td title="${escapeHtml(m.id)}">${escapeHtml(truncate(m.id, 16))}</td>
          <td title="${escapeHtml(m.agentId)}">${escapeHtml(truncate(m.agentId, 12))}</td>
          <td title="${escapeHtml(m.content)}">${escapeHtml(truncate(m.content, 40))}</td>
          <td>${escapeHtml(m.type)}</td>
          <td>${m.importance !== undefined ? m.importance.toFixed(2) : '--'}</td>
          <td>${formatTime(m.createdAt)}</td>
          <td><button class="btn btn-danger btn-sm" onclick="window.__deleteMemory('${m.id}')">删除</button></td>
        </tr>
      `).join('');
    } catch (err) {
      tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted">加载失败: ' + escapeHtml(err.message) + '</td></tr>';
    }
  }

  // ===== Budget 页面 =====
  async function renderBudget() {
    const main = document.getElementById('mainContent');
    main.innerHTML = '<div class="empty-state">加载中...</div>';
    try {
      const budget = await API.get('/api/budget');
      const pct = (budget.percentage * 100).toFixed(1);
      const budgetClass = budget.percentage >= 0.9 ? 'danger' : budget.percentage >= 0.8 ? 'warning' : '';

      main.innerHTML = `
        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-label">每日预算</div>
            <div class="stat-value">${budget.dailyBudget}</div>
            <div class="stat-sub">tokens</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">已使用</div>
            <div class="stat-value">${budget.dailyUsed}</div>
            <div class="stat-sub">tokens</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">剩余</div>
            <div class="stat-value">${budget.remaining}</div>
            <div class="stat-sub">tokens</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">使用率</div>
            <div class="stat-value">${pct}%</div>
            <div class="stat-sub">输入: ${budget.inputTokens || 0} / 输出: ${budget.outputTokens || 0}</div>
          </div>
        </div>
        <div class="card">
          <div class="card-header">
            <span class="card-title">预算使用进度</span>
          </div>
          <div class="progress-bar">
            <div class="progress-bar-fill ${budgetClass}" style="width: ${Math.min(pct, 100)}%"></div>
          </div>
        </div>
        <div class="card">
          <div class="card-header">
            <span class="card-title">设置预算</span>
          </div>
          <form id="setBudgetForm">
            <div class="form-inline">
              <div class="form-group" style="flex:1">
                <label>每日预算 (tokens)</label>
                <input type="number" name="budget" min="0" placeholder="如 100000" required>
              </div>
              <button type="submit" class="btn btn-primary">设置</button>
            </div>
          </form>
        </div>
      `;

      document.getElementById('setBudgetForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const budget = parseInt(formData.get('budget'), 10);
        try {
          await API.post('/api/budget', { budget });
          e.target.reset();
          renderBudget();
        } catch (err) {
          alert('设置失败: ' + err.message);
        }
      });
    } catch (err) {
      main.innerHTML = '<div class="empty-state">加载失败: ' + escapeHtml(err.message) + '</div>';
    }
  }

  // ===== MCP 页面 =====
  async function renderMcp() {
    const main = document.getElementById('mainContent');
    main.innerHTML = `
      <div class="card">
        <div class="card-header">
          <span class="card-title">MCP 服务器</span>
          <button class="btn btn-secondary btn-sm" onclick="window.__refresh()">刷新</button>
        </div>
        <div class="table-wrapper">
          <table>
            <thead>
              <tr><th>名称</th><th>类型</th><th>状态</th><th>工具数</th></tr>
            </thead>
            <tbody id="mcpServersBody">
              <tr><td colspan="4" class="text-center text-muted">加载中...</td></tr>
            </tbody>
          </table>
        </div>
      </div>
      <div class="card">
        <div class="card-header">
          <span class="card-title">MCP 工具</span>
        </div>
        <div class="table-wrapper">
          <table>
            <thead>
              <tr><th>名称</th><th>描述</th><th>服务器</th><th>操作</th></tr>
            </thead>
            <tbody id="mcpToolsBody">
              <tr><td colspan="4" class="text-center text-muted">加载中...</td></tr>
            </tbody>
          </table>
        </div>
      </div>
      <div class="card">
        <div class="card-header">
          <span class="card-title">执行工具</span>
        </div>
        <form id="executeToolForm">
          <div class="form-row">
            <div class="form-group">
              <label>工具名称 *</label>
              <input type="text" name="name" placeholder="如 echo" required>
            </div>
            <div class="form-group">
              <label>服务器名称</label>
              <input type="text" name="serverName" placeholder="可选">
            </div>
          </div>
          <div class="form-group">
            <label>参数 (JSON)</label>
            <textarea name="args" placeholder='{"message": "hello"}'>{}</textarea>
          </div>
          <button type="submit" class="btn btn-primary">执行</button>
        </form>
        <div id="toolResult" class="mt-16"></div>
      </div>
    `;

    document.getElementById('executeToolForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const formData = new FormData(e.target);
      const name = formData.get('name');
      const serverName = formData.get('serverName');
      let args = {};
      try {
        args = JSON.parse(formData.get('args') || '{}');
      } catch {
        alert('参数不是有效的 JSON');
        return;
      }
      const resultDiv = document.getElementById('toolResult');
      resultDiv.innerHTML = '<div class="text-muted">执行中...</div>';
      try {
        const result = await API.post('/api/mcp/tools/' + encodeURIComponent(name) + '/execute', { args, serverName: serverName || undefined });
        resultDiv.innerHTML = '<pre style="background:var(--bg-secondary);padding:12px;border-radius:4px;overflow-x:auto;font-size:12px;">' + escapeHtml(JSON.stringify(result, null, 2)) + '</pre>';
      } catch (err) {
        resultDiv.innerHTML = '<div class="text-muted">执行失败: ' + escapeHtml(err.message) + '</div>';
      }
    });

    loadMcpData();
  }

  async function loadMcpData() {
    const serversBody = document.getElementById('mcpServersBody');
    const toolsBody = document.getElementById('mcpToolsBody');
    try {
      const [servers, tools] = await Promise.all([
        API.get('/api/mcp/servers'),
        API.get('/api/mcp/tools'),
      ]);
      if (serversBody) {
        if (!servers || servers.length === 0) {
          serversBody.innerHTML = '<tr><td colspan="4" class="text-center text-muted">暂无服务器</td></tr>';
        } else {
          serversBody.innerHTML = servers.map((s) => `
            <tr>
              <td>${escapeHtml(s.name)}</td>
              <td>${escapeHtml(s.type)}</td>
              <td>${statusBadge(s.connected ? 'connected' : 'disconnected')}</td>
              <td>${s.toolCount}</td>
            </tr>
          `).join('');
        }
      }
      if (toolsBody) {
        if (!tools || tools.length === 0) {
          toolsBody.innerHTML = '<tr><td colspan="4" class="text-center text-muted">暂无工具</td></tr>';
        } else {
          toolsBody.innerHTML = tools.map((t) => `
            <tr>
              <td>${escapeHtml(t.name)}</td>
              <td>${escapeHtml(t.description)}</td>
              <td>${escapeHtml(t.serverName)}</td>
              <td><button class="btn btn-secondary btn-sm" onclick="window.__useTool('${escapeHtml(t.name)}')">使用</button></td>
            </tr>
          `).join('');
        }
      }
    } catch (err) {
      if (serversBody) serversBody.innerHTML = '<tr><td colspan="4" class="text-center text-muted">加载失败</td></tr>';
      if (toolsBody) toolsBody.innerHTML = '<tr><td colspan="4" class="text-center text-muted">加载失败</td></tr>';
    }
  }

  // ===== Schedules 页面 =====
  async function renderSchedules() {
    const main = document.getElementById('mainContent');
    main.innerHTML = `
      <div class="card">
        <div class="card-header">
          <span class="card-title">添加定时任务</span>
        </div>
        <form id="addScheduleForm">
          <div class="form-row">
            <div class="form-group">
              <label>任务名称 *</label>
              <input type="text" name="name" placeholder="任务名称" required>
            </div>
            <div class="form-group">
              <label>Agent ID *</label>
              <input type="text" name="agentId" placeholder="Agent ID" required>
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Cron 表达式 *</label>
              <input type="text" name="cron" placeholder="如 * * * * *" required>
            </div>
            <div class="form-group">
              <label>任务类型</label>
              <select name="taskType">
                <option value="custom">custom</option>
                <option value="agent_message">agent_message</option>
                <option value="agent_start">agent_start</option>
                <option value="agent_stop">agent_stop</option>
                <option value="memory_consolidate">memory_consolidate</option>
                <option value="budget_reset">budget_reset</option>
              </select>
            </div>
          </div>
          <div class="form-group">
            <label>任务载荷 (JSON)</label>
            <textarea name="payload" placeholder='{"message": "hello"}'>{}</textarea>
          </div>
          <button type="submit" class="btn btn-primary">添加</button>
        </form>
      </div>
      <div class="card">
        <div class="card-header">
          <span class="card-title">定时任务列表</span>
          <button class="btn btn-secondary btn-sm" onclick="window.__refresh()">刷新</button>
        </div>
        <div class="table-wrapper">
          <table>
            <thead>
              <tr><th>ID</th><th>名称</th><th>类型</th><th>Cron</th><th>状态</th><th>下次执行</th><th>操作</th></tr>
            </thead>
            <tbody id="schedulesTableBody">
              <tr><td colspan="7" class="text-center text-muted">加载中...</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    `;

    document.getElementById('addScheduleForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const formData = new FormData(e.target);
      const body = { name: formData.get('name'), agentId: formData.get('agentId'), cron: formData.get('cron'), taskType: formData.get('taskType') };
      try {
        body.payload = JSON.parse(formData.get('payload') || '{}');
      } catch {
        alert('载荷不是有效的 JSON');
        return;
      }
      try {
        await API.post('/api/schedules', body);
        e.target.reset();
        loadSchedulesTable();
      } catch (err) {
        alert('添加失败: ' + err.message);
      }
    });

    loadSchedulesTable();
  }

  async function loadSchedulesTable() {
    const tbody = document.getElementById('schedulesTableBody');
    if (!tbody) return;
    try {
      const data = await API.get('/api/schedules');
      const items = data.items || [];
      if (items.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted">暂无定时任务</td></tr>';
        return;
      }
      tbody.innerHTML = items.map((t) => `
        <tr>
          <td title="${escapeHtml(t.id)}">${escapeHtml(truncate(t.id, 16))}</td>
          <td>${escapeHtml(t.name)}</td>
          <td>${escapeHtml(t.taskType)}</td>
          <td><code>${escapeHtml(t.cron)}</code></td>
          <td>${t.enabled ? statusBadge('running') : statusBadge('stopped')}</td>
          <td>${formatTime(t.nextRunAt)}</td>
          <td>
            <div class="action-group">
              <button class="btn btn-success btn-sm" onclick="window.__runSchedule('${t.id}')">执行</button>
              <button class="btn btn-danger btn-sm" onclick="window.__cancelSchedule('${t.id}')">取消</button>
            </div>
          </td>
        </tr>
      `).join('');
    } catch (err) {
      tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted">加载失败</td></tr>';
    }
  }

  // ===== 全局操作函数 =====
  window.__refresh = function () {
    refresh();
  };

  window.__agentAction = async function (agentId, action) {
    try {
      await API.post('/api/agents/' + encodeURIComponent(agentId) + '/' + action, {});
      loadAgentsTable();
    } catch (err) {
      alert('操作失败: ' + err.message);
    }
  };

  window.__deleteMemory = async function (memoryId) {
    if (!confirm('确认删除此记忆?')) return;
    try {
      await API.del('/api/memories/' + encodeURIComponent(memoryId));
      loadMemoriesTable();
    } catch (err) {
      alert('删除失败: ' + err.message);
    }
  };

  window.__searchMemories = async function () {
    const input = document.getElementById('memorySearchInput');
    const resultsDiv = document.getElementById('memorySearchResults');
    if (!input || !resultsDiv) return;
    const q = input.value.trim();
    if (!q) {
      resultsDiv.innerHTML = '';
      return;
    }
    resultsDiv.innerHTML = '<div class="text-muted">搜索中...</div>';
    try {
      const results = await API.get('/api/memories/search?q=' + encodeURIComponent(q) + '&limit=10');
      if (!results || results.length === 0) {
        resultsDiv.innerHTML = '<div class="text-muted">无匹配结果</div>';
        return;
      }
      resultsDiv.innerHTML = results.map((r) => `
        <div style="padding:8px 0;border-bottom:1px solid var(--border-color)">
          <div>${escapeHtml(r.content)} <span class="text-muted">(相似度: ${(r.similarity * 100).toFixed(1)}%)</span></div>
          <div class="text-muted" style="font-size:12px">类型: ${escapeHtml(r.type)} | Agent: ${escapeHtml(truncate(r.agentId, 12))} | ${formatTime(r.createdAt)}</div>
        </div>
      `).join('');
    } catch (err) {
      resultsDiv.innerHTML = '<div class="text-muted">搜索失败: ' + escapeHtml(err.message) + '</div>';
    }
  };

  window.__useTool = function (toolName) {
    const form = document.getElementById('executeToolForm');
    if (form) {
      form.querySelector('[name="name"]').value = toolName;
      form.scrollIntoView({ behavior: 'smooth' });
    }
  };

  window.__runSchedule = async function (taskId) {
    try {
      await API.post('/api/schedules/' + encodeURIComponent(taskId) + '/run', {});
      loadSchedulesTable();
    } catch (err) {
      alert('执行失败: ' + err.message);
    }
  };

  window.__cancelSchedule = async function (taskId) {
    if (!confirm('确认取消此任务?')) return;
    try {
      await API.del('/api/schedules/' + encodeURIComponent(taskId));
      loadSchedulesTable();
    } catch (err) {
      alert('取消失败: ' + err.message);
    }
  };

  // ===== SSE 事件流 =====
  function initSSE() {
    if (typeof EventSource === 'undefined') return;
    const eventSource = new EventSource('/api/events');
    const logBody = document.getElementById('eventLogBody');

    eventSource.addEventListener('message', function (e) {
      try {
        const data = JSON.parse(e.data);
        if (data.event === 'connected') return;
        addEventLog(data);
      } catch (err) {
        // 忽略解析错误
      }
    });

    eventSource.addEventListener('error', function () {
      // 连接断开时自动重连（EventSource 默认行为）
    });
  }

  function addEventLog(data) {
    const logBody = document.getElementById('eventLogBody');
    if (!logBody) return;
    const item = document.createElement('div');
    item.className = 'event-item';
    const time = new Date(data.timestamp || Date.now()).toLocaleTimeString('zh-CN');
    item.innerHTML = `
      <span class="event-name">${escapeHtml(data.event)}</span>
      <span class="event-time">${time}</span>
      <span class="event-detail">${escapeHtml(truncate(JSON.stringify(data.args || ''), 50))}</span>
    `;
    logBody.insertBefore(item, logBody.firstChild);
    // 最多保留 50 条
    while (logBody.children.length > 50) {
      logBody.removeChild(logBody.lastChild);
    }
  }

  // ===== 顶部状态更新 =====
  async function updateSystemStatus() {
    try {
      const status = await API.get('/api/status');
      const uptimeEl = document.getElementById('uptime');
      const statusEl = document.getElementById('systemStatus');
      if (uptimeEl) uptimeEl.textContent = '运行时间: ' + formatDuration(status.uptime);
      if (statusEl) {
        statusEl.textContent = '在线';
        statusEl.className = 'status-badge status-running';
      }
    } catch (err) {
      const statusEl = document.getElementById('systemStatus');
      if (statusEl) {
        statusEl.textContent = '离线';
        statusEl.className = 'status-badge status-error';
      }
    }
  }

  // ===== 初始化 =====
  function init() {
    // 导航事件绑定
    document.querySelectorAll('.nav-link').forEach((link) => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const page = link.dataset.page;
        if (page) {
          window.location.hash = page;
          navigate(page);
        }
      });
    });

    // 事件日志折叠
    const toggleBtn = document.getElementById('toggleEventLog');
    const eventLog = document.getElementById('eventLog');
    if (toggleBtn && eventLog) {
      toggleBtn.addEventListener('click', () => {
        eventLog.classList.toggle('collapsed');
      });
    }

    // 根据 hash 导航
    const hash = window.location.hash.replace('#', '');
    if (hash && pages[hash]) {
      navigate(hash);
    } else {
      navigate('dashboard');
    }

    // 启动自动刷新和状态更新
    startAutoRefresh();
    setInterval(updateSystemStatus, 5000);
    updateSystemStatus();

    // 启动 SSE
    initSSE();
  }

  // DOM 加载完成后初始化
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
