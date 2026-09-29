/**
 * Modern HTML Dashboard for Antigravity Gateway
 * Displays real-time 5-Hour Limit Remaining, Weekly Limit Remaining,
 * multi-account pool status, model quotas, and account switcher.
 */

export function renderDashboardHtml(data) {
    const {
        accounts = [],
        pinnedEmail = null,
        fiveHourLimit = {},
        weeklyLimit = {},
        models = [],
        serverPort = 8080
    } = data;

    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Antigravity Gateway - Painel de Controle</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
    <style>
        :root {
            --bg-primary: #0a0d14;
            --bg-secondary: #121824;
            --bg-card: rgba(22, 30, 46, 0.7);
            --bg-card-hover: rgba(28, 38, 58, 0.85);
            --border-color: rgba(255, 255, 255, 0.08);
            --border-active: rgba(99, 102, 241, 0.4);
            --accent-primary: #6366f1;
            --accent-gradient: linear-gradient(135deg, #6366f1 0%, #a855f7 50%, #ec4899 100%);
            --accent-cyan: #06b6d4;
            --accent-green: #10b981;
            --accent-amber: #f59e0b;
            --accent-red: #ef4444;
            --text-primary: #f8fafc;
            --text-secondary: #94a3b8;
            --text-muted: #64748b;
        }

        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }

        body {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
            background-color: var(--bg-primary);
            color: var(--text-primary);
            min-height: 100vh;
            line-height: 1.5;
            background-image:
                radial-gradient(at 0% 0%, rgba(99, 102, 241, 0.15) 0px, transparent 50%),
                radial-gradient(at 100% 0%, rgba(168, 85, 247, 0.12) 0px, transparent 50%),
                radial-gradient(at 50% 100%, rgba(6, 182, 212, 0.1) 0px, transparent 50%);
            background-attachment: fixed;
        }

        .container {
            max-width: 1240px;
            margin: 0 auto;
            padding: 32px 24px;
        }

        /* Header */
        header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 36px;
            padding-bottom: 24px;
            border-bottom: 1px solid var(--border-color);
        }

        .logo-area {
            display: flex;
            align-items: center;
            gap: 16px;
        }

        .logo-icon {
            width: 48px;
            height: 48px;
            border-radius: 14px;
            background: var(--accent-gradient);
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 24px;
            box-shadow: 0 8px 24px rgba(99, 102, 241, 0.35);
        }

        .logo-text h1 {
            font-size: 24px;
            font-weight: 700;
            letter-spacing: -0.5px;
            background: linear-gradient(180deg, #ffffff 0%, #cbd5e1 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }

        .logo-text p {
            font-size: 13px;
            color: var(--text-secondary);
        }

        .header-actions {
            display: flex;
            align-items: center;
            gap: 12px;
        }

        .status-badge {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            padding: 6px 14px;
            background: rgba(16, 185, 129, 0.12);
            border: 1px solid rgba(16, 185, 129, 0.3);
            border-radius: 20px;
            font-size: 13px;
            font-weight: 500;
            color: #34d399;
        }

        .status-dot {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background-color: #34d399;
            box-shadow: 0 0 10px #34d399;
            animation: pulse 2s infinite;
        }

        @keyframes pulse {
            0% { transform: scale(0.95); opacity: 0.8; }
            50% { transform: scale(1.2); opacity: 1; }
            100% { transform: scale(0.95); opacity: 0.8; }
        }

        .btn {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            padding: 8px 16px;
            background: var(--bg-card);
            border: 1px solid var(--border-color);
            color: var(--text-primary);
            border-radius: 10px;
            font-size: 13px;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.2s ease;
            text-decoration: none;
        }

        .btn:hover {
            background: var(--bg-card-hover);
            border-color: rgba(255, 255, 255, 0.2);
            transform: translateY(-1px);
        }

        .btn-primary {
            background: var(--accent-gradient);
            border: none;
            color: #fff;
            box-shadow: 0 4px 14px rgba(99, 102, 241, 0.3);
        }

        .btn-primary:hover {
            box-shadow: 0 6px 20px rgba(99, 102, 241, 0.5);
            background: var(--accent-gradient);
        }

        /* Quota Metrics Hero Cards */
        .metrics-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(360px, 1fr));
            gap: 24px;
            margin-bottom: 36px;
        }

        .metric-card {
            background: var(--bg-card);
            backdrop-filter: blur(16px);
            border: 1px solid var(--border-color);
            border-radius: 20px;
            padding: 28px;
            position: relative;
            overflow: hidden;
            box-shadow: 0 12px 32px rgba(0, 0, 0, 0.25);
            transition: transform 0.2s ease, border-color 0.2s ease;
        }

        .metric-card:hover {
            transform: translateY(-2px);
            border-color: var(--border-active);
        }

        .metric-card::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            height: 3px;
            background: var(--accent-gradient);
        }

        .card-header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            margin-bottom: 20px;
        }

        .card-header-info h3 {
            font-size: 15px;
            font-weight: 600;
            color: var(--text-secondary);
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }

        .card-header-info p {
            font-size: 12px;
            color: var(--text-muted);
            margin-top: 2px;
        }

        .percentage-display {
            display: flex;
            align-items: baseline;
            gap: 6px;
            margin-bottom: 16px;
        }

        .percentage-value {
            font-size: 48px;
            font-weight: 800;
            letter-spacing: -1px;
            font-family: 'JetBrains Mono', monospace;
        }

        .percentage-label {
            font-size: 16px;
            color: var(--text-secondary);
            font-weight: 500;
        }

        /* Progress Bar */
        .progress-bar-container {
            width: 100%;
            height: 12px;
            background: rgba(255, 255, 255, 0.06);
            border-radius: 99px;
            overflow: hidden;
            margin-bottom: 18px;
            position: relative;
        }

        .progress-bar-fill {
            height: 100%;
            border-radius: 99px;
            transition: width 0.6s cubic-bezier(0.16, 1, 0.3, 1);
        }

        .fill-high {
            background: linear-gradient(90deg, #10b981 0%, #06b6d4 100%);
            box-shadow: 0 0 12px rgba(16, 185, 129, 0.5);
        }

        .fill-medium {
            background: linear-gradient(90deg, #f59e0b 0%, #eab308 100%);
            box-shadow: 0 0 12px rgba(245, 158, 11, 0.5);
        }

        .fill-low {
            background: linear-gradient(90deg, #ef4444 0%, #f43f5e 100%);
            box-shadow: 0 0 12px rgba(239, 68, 68, 0.5);
        }

        .limit-message {
            background: rgba(255, 255, 255, 0.03);
            border: 1px solid rgba(255, 255, 255, 0.05);
            border-radius: 12px;
            padding: 14px 16px;
            font-size: 13px;
            color: var(--text-primary);
            line-height: 1.6;
        }

        .limit-message strong {
            color: #38bdf8;
        }

        .countdown-meta {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-top: 14px;
            font-size: 12px;
            color: var(--text-muted);
        }

        .meta-tag {
            font-family: 'JetBrains Mono', monospace;
            background: rgba(255, 255, 255, 0.05);
            padding: 2px 8px;
            border-radius: 6px;
        }

        /* Section Container */
        .section-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 20px;
        }

        .section-title {
            font-size: 20px;
            font-weight: 700;
            letter-spacing: -0.3px;
            display: flex;
            align-items: center;
            gap: 10px;
        }

        .section-badge {
            font-size: 11px;
            font-weight: 600;
            padding: 3px 10px;
            border-radius: 20px;
            background: rgba(99, 102, 241, 0.15);
            color: #818cf8;
            border: 1px solid rgba(99, 102, 241, 0.3);
        }

        /* Accounts Pool Grid */
        .accounts-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
            gap: 20px;
            margin-bottom: 36px;
        }

        .account-card {
            background: var(--bg-card);
            backdrop-filter: blur(12px);
            border: 1px solid var(--border-color);
            border-radius: 16px;
            padding: 22px;
            transition: all 0.2s ease;
        }

        .account-card.pinned {
            border-color: #818cf8;
            background: rgba(30, 41, 68, 0.75);
            box-shadow: 0 8px 24px rgba(99, 102, 241, 0.15);
        }

        .account-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 16px;
        }

        .account-email {
            font-weight: 600;
            font-size: 15px;
            color: var(--text-primary);
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            max-width: 230px;
        }

        .badge-active {
            font-size: 11px;
            padding: 3px 8px;
            border-radius: 6px;
            background: rgba(16, 185, 129, 0.15);
            color: #34d399;
            border: 1px solid rgba(16, 185, 129, 0.3);
            font-weight: 600;
        }

        .badge-pinned {
            font-size: 11px;
            padding: 3px 8px;
            border-radius: 6px;
            background: rgba(99, 102, 241, 0.2);
            color: #a5b4fc;
            border: 1px solid rgba(99, 102, 241, 0.4);
            font-weight: 600;
        }

        .account-details {
            font-size: 12px;
            color: var(--text-secondary);
            margin-bottom: 16px;
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 8px;
            background: rgba(0, 0, 0, 0.2);
            padding: 10px 12px;
            border-radius: 10px;
        }

        .account-actions {
            display: flex;
            gap: 10px;
        }

        .btn-sm {
            padding: 6px 12px;
            font-size: 12px;
            border-radius: 8px;
            flex: 1;
            text-align: center;
            justify-content: center;
        }

        /* Model Catalog Info */
        .catalog-container {
            background: var(--bg-card);
            border: 1px solid var(--border-color);
            border-radius: 16px;
            padding: 24px;
            margin-bottom: 36px;
        }

        .model-list {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
            gap: 16px;
            margin-top: 16px;
        }

        .model-item {
            background: rgba(0, 0, 0, 0.2);
            border: 1px solid rgba(255, 255, 255, 0.05);
            border-radius: 12px;
            padding: 16px;
        }

        .model-name {
            font-family: 'JetBrains Mono', monospace;
            font-size: 13px;
            font-weight: 600;
            color: #38bdf8;
            margin-bottom: 4px;
        }

        .model-desc {
            font-size: 12px;
            color: var(--text-secondary);
        }

        /* Toast notification */
        #toast {
            position: fixed;
            bottom: 24px;
            right: 24px;
            background: var(--bg-secondary);
            border: 1px solid var(--border-active);
            color: #fff;
            padding: 12px 20px;
            border-radius: 10px;
            font-size: 13px;
            font-weight: 500;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
            display: none;
            z-index: 1000;
            animation: fadeIn 0.3s ease;
        }

        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
        }
    </style>
</head>
<body>
    <div class="container">
        <!-- Header -->
        <header>
            <div class="logo-area">
                <div class="logo-icon">⚡</div>
                <div class="logo-text">
                    <h1>Antigravity Multi-Account Gateway</h1>
                    <p>Painel de Controle e Monitoramento de Cotas em Tempo Real</p>
                </div>
            </div>
            <div class="header-actions">
                <span class="status-badge">
                    <span class="status-dot"></span>
                    Gateway Ativo :${serverPort}
                </span>
                <button class="btn" onclick="refreshData()">
                    🔄 Atualizar Cotas
                </button>
                <button class="btn btn-primary" onclick="setMode('auto')">
                    ⚡ Modo Multi-Contas
                </button>
            </div>
        </header>

        <!-- Metrics Grid (5-Hour Limit & Weekly Limit) -->
        <div class="metrics-grid">
            <!-- 5-Hour Limit Card -->
            <div class="metric-card">
                <div class="card-header">
                    <div class="card-header-info">
                        <h3>Limite de 5 Horas (Five Hour Limit)</h3>
                        <p>Janela móvel de consumo e raciocínio profundo</p>
                    </div>
                    <span class="badge-active" id="badge-5h">Ativo</span>
                </div>

                <div class="percentage-display">
                    <span class="percentage-value" id="val-5h">${fiveHourLimit.remainingPercent ?? 100}%</span>
                    <span class="percentage-label">restante</span>
                </div>

                <div class="progress-bar-container">
                    <div class="progress-bar-fill ${getFillClass(fiveHourLimit.remainingPercent)}" id="bar-5h" style="width: ${fiveHourLimit.remainingPercent ?? 100}%"></div>
                </div>

                <div class="limit-message" id="msg-5h">
                    ${fiveHourLimit.messagePt || 'Você utilizou parte do seu limite de 5 horas, ele irá restaurar em breve.'}
                </div>

                <div class="countdown-meta">
                    <span>Restauração total:</span>
                    <span class="meta-tag" id="meta-5h">${fiveHourLimit.timeRemainingPt || 'calculando...'}</span>
                </div>
            </div>

            <!-- Weekly Limit Card -->
            <div class="metric-card">
                <div class="card-header">
                    <div class="card-header-info">
                        <h3>Limite Semanal (Weekly Limit)</h3>
                        <p>Cota total do ciclo semanal de solicitações</p>
                    </div>
                    <span class="badge-active" id="badge-weekly">Ativo</span>
                </div>

                <div class="percentage-display">
                    <span class="percentage-value" id="val-weekly">${weeklyLimit.remainingPercent ?? 100}%</span>
                    <span class="percentage-label">restante</span>
                </div>

                <div class="progress-bar-container">
                    <div class="progress-bar-fill ${getFillClass(weeklyLimit.remainingPercent)}" id="bar-weekly" style="width: ${weeklyLimit.remainingPercent ?? 100}%"></div>
                </div>

                <div class="limit-message" id="msg-weekly">
                    ${weeklyLimit.messagePt || 'Você utilizou parte do seu limite semanal, ele irá restaurar em breve.'}
                </div>

                <div class="countdown-meta">
                    <span>Restauração total:</span>
                    <span class="meta-tag" id="meta-weekly">${weeklyLimit.timeRemainingPt || 'calculando...'}</span>
                </div>
            </div>
        </div>

        <!-- Accounts Pool Section -->
        <div class="section-header">
            <div class="section-title">
                👥 Gerenciamento de Contas Antigravity
                <span class="section-badge">${accounts.length} ${accounts.length === 1 ? 'conta cadastrada' : 'contas cadastradas'}</span>
            </div>
            <div>
                <span style="font-size: 13px; color: var(--text-secondary); margin-right: 8px;">
                    Modo atual: <strong>${pinnedEmail ? 'Conta Fixada (' + pinnedEmail.split('@')[0] + ')' : 'Multi-Contas Inteligente (Rotação Automática)'}</strong>
                </span>
            </div>
        </div>

        <div class="accounts-grid" id="accounts-container">
            ${accounts.map((acc, index) => renderAccountCard(acc, index, pinnedEmail)).join('')}
        </div>

        <!-- Exposed Claude Opus 4.6 1M Models -->
        <div class="catalog-container">
            <div class="section-title">
                🧠 Modelos Claude Opus 4.6 (1 Milhão de Tokens de Contexto)
                <span class="section-badge">Gemini 3.8 Flash Tiered</span>
            </div>
            <p style="font-size: 13px; color: var(--text-secondary); margin-top: 6px;">
                Todos os modelos abaixo possuem janela real de 1.000.000 tokens e são roteados com raciocínio estendido nativo.
            </p>
            <div class="model-list">
                <div class="model-item">
                    <div class="model-name">claude-opus-4-6-low[1m]</div>
                    <div class="model-desc">Raciocínio leve (2k tokens) • Ideal para comandos rápidos, edições simples e buscas pontuais.</div>
                </div>
                <div class="model-item">
                    <div class="model-name">claude-opus-4-6-medium[1m]</div>
                    <div class="model-desc">Raciocínio balanceado (8k tokens) • Recomendado para engenharia de software e análise de código.</div>
                </div>
                <div class="model-item">
                    <div class="model-name">claude-opus-4-6-high[1m]</div>
                    <div class="model-desc">Raciocínio profundo (32k tokens) • Máxima inteligência para tarefas arquiteturais complexas.</div>
                </div>
            </div>
        </div>
    </div>

    <div id="toast"></div>

    <script>
        function showToast(message) {
            const toast = document.getElementById('toast');
            toast.textContent = message;
            toast.style.display = 'block';
            setTimeout(() => {
                toast.style.display = 'none';
            }, 3000);
        }

        async function setMode(emailOrAuto) {
            try {
                const response = await fetch('/api/set-active-account', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ account: emailOrAuto })
                });
                const res = await response.json();
                if (res.status === 'ok') {
                    showToast(res.message);
                    setTimeout(() => refreshData(), 800);
                } else {
                    showToast('Erro: ' + (res.error || 'Falha ao alterar conta'));
                }
            } catch (err) {
                showToast('Erro na requisição: ' + err.message);
            }
        }

        async function refreshData() {
            try {
                const res = await fetch('/api/dashboard-data');
                const data = await res.json();

                // Update 5-Hour
                if (data.fiveHourLimit) {
                    document.getElementById('val-5h').textContent = (data.fiveHourLimit.remainingPercent ?? 100) + '%';
                    const bar5h = document.getElementById('bar-5h');
                    bar5h.style.width = (data.fiveHourLimit.remainingPercent ?? 100) + '%';
                    bar5h.className = 'progress-bar-fill ' + getFillClass(data.fiveHourLimit.remainingPercent);
                    document.getElementById('msg-5h').textContent = data.fiveHourLimit.messagePt;
                    document.getElementById('meta-5h').textContent = data.fiveHourLimit.timeRemainingPt;
                }

                // Update Weekly
                if (data.weeklyLimit) {
                    document.getElementById('val-weekly').textContent = (data.weeklyLimit.remainingPercent ?? 100) + '%';
                    const barW = document.getElementById('bar-weekly');
                    barW.style.width = (data.weeklyLimit.remainingPercent ?? 100) + '%';
                    barW.className = 'progress-bar-fill ' + getFillClass(data.weeklyLimit.remainingPercent);
                    document.getElementById('msg-weekly').textContent = data.weeklyLimit.messagePt;
                    document.getElementById('meta-weekly').textContent = data.weeklyLimit.timeRemainingPt;
                }

                showToast('Dados atualizados com sucesso!');
            } catch (err) {
                console.error('Erro ao atualizar:', err);
            }
        }

        function getFillClass(pct) {
            if (pct >= 50) return 'fill-high';
            if (pct >= 20) return 'fill-medium';
            return 'fill-low';
        }

        // Auto-refresh every 12 seconds
        setInterval(refreshData, 12000);
    </script>
</body>
</html>`;
}

function getFillClass(pct) {
    if (pct === null || pct === undefined || pct >= 50) return 'fill-high';
    if (pct >= 20) return 'fill-medium';
    return 'fill-low';
}

function renderAccountCard(acc, index, pinnedEmail) {
    const isPinned = pinnedEmail && pinnedEmail.toLowerCase() === acc.email.toLowerCase();
    const lastUsedText = acc.lastUsed ? new Date(acc.lastUsed).toLocaleTimeString('pt-BR') : 'Nunca';

    return `
    <div class="account-card ${isPinned ? 'pinned' : ''}">
        <div class="account-header">
            <span class="account-email" title="${acc.email}">${index + 1}. ${acc.email}</span>
            ${isPinned
                ? '<span class="badge-pinned">⭐ Fixada</span>'
                : (acc.isInvalid
                    ? '<span class="badge-active" style="background:rgba(239,68,68,0.2);color:#f87171;border-color:rgba(239,68,68,0.4)">Inválida</span>'
                    : '<span class="badge-active">Ativa</span>')}
        </div>
        <div class="account-details">
            <div><strong>Último uso:</strong> ${lastUsedText}</div>
            <div><strong>Origem:</strong> ${acc.source || 'OAuth'}</div>
        </div>
        <div class="account-actions">
            ${isPinned ? `
                <button class="btn btn-sm btn-primary" onclick="setMode('auto')">
                    Liberar (Multi-Contas)
                </button>
            ` : `
                <button class="btn btn-sm" onclick="setMode('${acc.email}')">
                    Fixar Esta Conta
                </button>
            `}
        </div>
    </div>`;
}
