/**
 * Quota Formatter for Antigravity Gateway
 * Parses official Antigravity quota data from v1internal:retrieveUserQuotaSummary
 * Extracts real-time Weekly Limit Remaining and Five Hour Limit Remaining
 * exactly as rendered in the Antigravity UI.
 */

/**
 * Format a duration in milliseconds into a friendly Portuguese string
 * Example: "3 dias e 19 horas", "4 horas e 39 minutos", "9 minutos"
 *
 * @param {number} ms - Milliseconds
 * @returns {string} Formatted duration string
 */
export function formatPortugueseDuration(ms) {
    if (ms <= 0) return 'menos de 1 minuto';

    const totalSeconds = Math.floor(ms / 1000);
    const totalMinutes = Math.floor(totalSeconds / 60);
    const totalHours = Math.floor(totalMinutes / 60);
    const days = Math.floor(totalHours / 24);
    const hours = totalHours % 24;
    const minutes = totalMinutes % 60;

    const parts = [];

    if (days > 0) {
        parts.push(`${days} ${days === 1 ? 'dia' : 'dias'}`);
    }
    if (hours > 0) {
        parts.push(`${hours} ${hours === 1 ? 'hora' : 'horas'}`);
    }
    if (days === 0 && minutes > 0) {
        parts.push(`${minutes} ${minutes === 1 ? 'minuto' : 'minutos'}`);
    }

    if (parts.length === 0) {
        return 'menos de 1 minuto';
    }

    if (parts.length === 1) {
        return parts[0];
    }

    return parts.slice(0, 2).join(' e ');
}

/**
 * Format a duration in English for reference matching Claude Desktop / Antigravity UI
 * Example: "3 days, 19 hours", "4 hours, 39 minutes", "9 minutes"
 *
 * @param {number} ms - Milliseconds
 * @returns {string} Formatted duration string
 */
export function formatEnglishDuration(ms) {
    if (ms <= 0) return 'less than a minute';

    const totalSeconds = Math.floor(ms / 1000);
    const totalMinutes = Math.floor(totalSeconds / 60);
    const totalHours = Math.floor(totalMinutes / 60);
    const days = Math.floor(totalHours / 24);
    const hours = totalHours % 24;
    const minutes = totalMinutes % 60;

    const parts = [];

    if (days > 0) {
        parts.push(`${days} ${days === 1 ? 'day' : 'days'}`);
    }
    if (hours > 0) {
        parts.push(`${hours} ${hours === 1 ? 'hour' : 'hours'}`);
    }
    if (days === 0 && minutes > 0) {
        parts.push(`${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`);
    }

    if (parts.length === 0) {
        return 'less than a minute';
    }

    return parts.slice(0, 2).join(', ');
}

/**
 * Translate Antigravity official English limit descriptions to clean Portuguese
 *
 * @param {string} desc - English description from API
 * @param {string} ptDuration - Calculated Portuguese duration
 * @param {string} type - '5h' or 'weekly'
 * @returns {string} Portuguese message
 */
function translateDescription(desc, ptDuration, type) {
    if (!desc) {
        return type === '5h'
            ? `Seu limite de 5 horas irá restaurar completamente em ${ptDuration}.`
            : `Seu limite semanal irá restaurar completamente em ${ptDuration}.`;
    }

    // Replace English duration patterns with Portuguese
    let translated = desc;
    if (desc.includes('You have used some of your 5-hour limit')) {
        return `Você utilizou parte do seu limite de 5 horas, ele irá restaurar completamente em ${ptDuration}.`;
    }
    if (desc.includes('You have used some of your weekly limit')) {
        return `Você utilizou parte do seu limite semanal, ele irá restaurar completamente em ${ptDuration}.`;
    }

    return translated;
}

/**
 * Parse official Antigravity quota data into standard structured limits
 *
 * @param {Object} rawQuotaData - Response from v1internal:retrieveUserQuotaSummary
 * @param {Object} [rawModelsData] - Response from v1internal:fetchAvailableModels (fallback)
 * @returns {Object} Structured limits and quota summary
 */
export function parseAccountQuotaSummary(rawQuotaData, rawModelsData = null) {
    const now = Date.now();

    // 1. Process from official retrieveUserQuotaSummary endpoint
    if (rawQuotaData && Array.isArray(rawQuotaData.groups) && rawQuotaData.groups.length > 0) {
        const geminiGroup = rawQuotaData.groups.find(g =>
            (g.displayName || '').toLowerCase().includes('gemini')
        ) || rawQuotaData.groups[0];

        const claudeGroup = rawQuotaData.groups.find(g =>
            (g.displayName || '').toLowerCase().includes('claude') || (g.displayName || '').toLowerCase().includes('3p')
        ) || null;

        // Extract Gemini buckets (Weekly and 5-Hour)
        const geminiBuckets = geminiGroup?.buckets || [];
        const geminiWeekly = geminiBuckets.find(b =>
            b.window === 'weekly' || (b.displayName || '').toLowerCase().includes('weekly')
        ) || null;
        const gemini5h = geminiBuckets.find(b =>
            b.window === '5h' || (b.displayName || '').toLowerCase().includes('five hour') || (b.displayName || '').toLowerCase().includes('5-hour')
        ) || null;

        // Process Weekly Limit
        const weeklyFraction = geminiWeekly?.remainingFraction ?? 1.0;
        const weeklyRemainingPercent = Math.max(0, Math.min(100, Math.round(weeklyFraction * 100)));
        const weeklyUsedPercent = 100 - weeklyRemainingPercent;

        const weeklyResetTime = geminiWeekly?.resetTime ? new Date(geminiWeekly.resetTime) : null;
        const weeklyMs = weeklyResetTime ? Math.max(0, weeklyResetTime.getTime() - now) : 0;
        const weeklyDurationPt = formatPortugueseDuration(weeklyMs);
        const weeklyDurationEn = formatEnglishDuration(weeklyMs);

        // Process 5-Hour Limit
        const fiveHourFraction = gemini5h?.remainingFraction ?? 1.0;
        const fiveHourRemainingPercent = Math.max(0, Math.min(100, Math.round(fiveHourFraction * 100)));
        const fiveHourUsedPercent = 100 - fiveHourRemainingPercent;

        const fiveHourResetTime = gemini5h?.resetTime ? new Date(gemini5h.resetTime) : null;
        const fiveHourMs = fiveHourResetTime ? Math.max(0, fiveHourResetTime.getTime() - now) : 0;
        const fiveHourDurationPt = formatPortugueseDuration(fiveHourMs);
        const fiveHourDurationEn = formatEnglishDuration(fiveHourMs);

        // Process Claude & GPT group if present
        let claudeLimits = null;
        if (claudeGroup && Array.isArray(claudeGroup.buckets)) {
            const cWeekly = claudeGroup.buckets.find(b => b.window === 'weekly' || (b.displayName || '').toLowerCase().includes('weekly'));
            const c5h = claudeGroup.buckets.find(b => b.window === '5h' || (b.displayName || '').toLowerCase().includes('five hour'));

            claudeLimits = {
                groupName: claudeGroup.displayName || 'Claude and GPT models',
                weekly: cWeekly ? {
                    remainingPercent: Math.round((cWeekly.remainingFraction ?? 1.0) * 100),
                    resetTime: cWeekly.resetTime,
                    durationPt: formatPortugueseDuration(cWeekly.resetTime ? Math.max(0, new Date(cWeekly.resetTime).getTime() - now) : 0)
                } : null,
                fiveHour: c5h ? {
                    remainingPercent: Math.round((c5h.remainingFraction ?? 1.0) * 100),
                    resetTime: c5h.resetTime,
                    durationPt: formatPortugueseDuration(c5h.resetTime ? Math.max(0, new Date(c5h.resetTime).getTime() - now) : 0)
                } : null
            };
        }

        return {
            source: 'official_retrieveUserQuotaSummary',
            primaryModel: 'gemini-3.8-flash-tiered',
            weeklyLimit: {
                title: 'Weekly Limit Remaining',
                titlePt: 'Limite Semanal Restante',
                remainingFraction: weeklyFraction,
                remainingPercent: weeklyRemainingPercent,
                usedPercent: weeklyUsedPercent,
                resetTime: weeklyResetTime ? weeklyResetTime.toISOString() : null,
                resetTimeFormatted: weeklyResetTime ? weeklyResetTime.toLocaleString('pt-BR') : '-',
                timeRemainingPt: weeklyDurationPt,
                timeRemainingEn: weeklyDurationEn,
                messagePt: translateDescription(geminiWeekly?.description, weeklyDurationPt, 'weekly'),
                messageEn: geminiWeekly?.description || `You have ${weeklyRemainingPercent}% of your weekly limit remaining.`
            },
            fiveHourLimit: {
                title: 'Five Hour Limit Remaining',
                titlePt: 'Limite de 5 Horas Restante',
                remainingFraction: fiveHourFraction,
                remainingPercent: fiveHourRemainingPercent,
                usedPercent: fiveHourUsedPercent,
                resetTime: fiveHourResetTime ? fiveHourResetTime.toISOString() : null,
                resetTimeFormatted: fiveHourResetTime ? fiveHourResetTime.toLocaleString('pt-BR') : '-',
                timeRemainingPt: fiveHourDurationPt,
                timeRemainingEn: fiveHourDurationEn,
                messagePt: translateDescription(gemini5h?.description, fiveHourDurationPt, '5h'),
                messageEn: gemini5h?.description || `You have ${fiveHourRemainingPercent}% of your 5-hour limit remaining.`
            },
            claudeLimits,
            description: rawQuotaData.description || ''
        };
    }

    // 2. Fallback: Parse from fetchAvailableModels if retrieveUserQuotaSummary unavailable
    const models = rawModelsData?.models || rawModelsData || {};
    const targetModelIds = [
        'gemini-3.8-flash-tiered',
        'gemini-3.7-flash-tiered',
        'gemini-3-flash',
        'gemini-2.5-flash',
        'claude-opus-4-6-thinking'
    ];

    let primaryQuota = null;
    let primaryModelId = null;

    for (const id of targetModelIds) {
        if (models[id]?.quotaInfo) {
            primaryQuota = models[id].quotaInfo;
            primaryModelId = id;
            break;
        }
    }

    const remainingFraction = primaryQuota?.remainingFraction ?? 1.0;
    const remainingPercent = Math.round(remainingFraction * 100);
    const usedPercent = Math.max(0, 100 - remainingPercent);

    let resetTime5h = primaryQuota?.resetTime ? new Date(primaryQuota.resetTime) : null;
    let msUntil5hReset = resetTime5h ? Math.max(0, resetTime5h.getTime() - now) : 0;
    const fiveHourDurationPt = formatPortugueseDuration(msUntil5hReset);
    const fiveHourDurationEn = formatEnglishDuration(msUntil5hReset);

    // Approximate weekly calculation if only modelsData available
    const daysUntilSundayMidnight = (7 - new Date(now).getUTCDay()) % 7 || 7;
    const weeklyResetMs = Math.max(msUntil5hReset, daysUntilSundayMidnight * 24 * 60 * 60 * 1000);
    const resetTimeWeekly = new Date(now + weeklyResetMs);
    const weeklyDurationPt = formatPortugueseDuration(weeklyResetMs);
    const weeklyDurationEn = formatEnglishDuration(weeklyResetMs);

    return {
        source: 'fallback_modelsData',
        primaryModel: primaryModelId || 'gemini-3.8-flash-tiered',
        weeklyLimit: {
            title: 'Weekly Limit Remaining',
            titlePt: 'Limite Semanal Restante',
            remainingFraction,
            remainingPercent,
            usedPercent,
            resetTime: resetTimeWeekly.toISOString(),
            resetTimeFormatted: resetTimeWeekly.toLocaleString('pt-BR'),
            timeRemainingPt: weeklyDurationPt,
            timeRemainingEn: weeklyDurationEn,
            messagePt: `Você utilizou parte do seu limite semanal, ele irá restaurar completamente em ${weeklyDurationPt}.`,
            messageEn: `You have used some of your weekly limit, it will fully refresh in ${weeklyDurationEn}.`
        },
        fiveHourLimit: {
            title: 'Five Hour Limit Remaining',
            titlePt: 'Limite de 5 Horas Restante',
            remainingFraction,
            remainingPercent,
            usedPercent,
            resetTime: resetTime5h ? resetTime5h.toISOString() : null,
            resetTimeFormatted: resetTime5h ? resetTime5h.toLocaleString('pt-BR') : '-',
            timeRemainingPt: fiveHourDurationPt,
            timeRemainingEn: fiveHourDurationEn,
            messagePt: usedPercent > 0
                ? `Você utilizou parte do seu limite de 5 horas, ele irá restaurar completamente em ${fiveHourDurationPt}.`
                : `Seu limite de 5 horas está totalmente disponível (100%).`,
            messageEn: usedPercent > 0
                ? `You have used some of your 5-hour limit, it will fully refresh in ${fiveHourDurationEn}.`
                : `Your 5-hour limit is fully available (100%).`
        }
    };
}
