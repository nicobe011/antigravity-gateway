/**
 * Skill Manager for Antigravity Gateway
 * Controls activation of the advanced Claude Opus 5.5 skill
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let isOpus55SkillActive = false;
let cachedSkillContent = null;

export function setOpus55SkillActive(active) {
    isOpus55SkillActive = !!active;
}

export function isOpus55SkillEnabled() {
    return isOpus55SkillActive || process.env.ENABLE_OPUS_55_SKILL === 'true';
}

export function getOpus55SkillPrompt() {
    if (!isOpus55SkillEnabled()) return '';
    if (cachedSkillContent !== null) return cachedSkillContent;

    const skillPath = path.join(__dirname, 'skills', 'claude-opus-5-5-skill.txt');
    try {
        if (fs.existsSync(skillPath)) {
            cachedSkillContent = fs.readFileSync(skillPath, 'utf8');
            return cachedSkillContent;
        }
    } catch (err) {
        console.error('[SkillManager] Could not read skill file:', err.message);
    }
    return '';
}

export default {
    setOpus55SkillActive,
    isOpus55SkillEnabled,
    getOpus55SkillPrompt
};
