#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const routesPath = path.join(rootDir, 'assets', 'public-playbook-routes.json');
const publicDir = path.join(rootDir, 'public');
const repoMapPath = path.join(publicDir, 'repo-map.json');

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeText(file, text) {
  fs.writeFileSync(file, text, 'utf8');
}

function replaceBetweenMarkers(text, key, rendered) {
  const begin = `<!-- BEGIN ${key} -->`;
  const end = `<!-- END ${key} -->`;
  const start = text.indexOf(begin);
  const finish = text.indexOf(end);
  if (start === -1 || finish === -1 || finish < start) {
    throw new Error(`missing markers for ${key}`);
  }
  const head = text.slice(0, start + begin.length);
  const tail = text.slice(finish);
  return `${head}\n${rendered}\n${tail}`;
}

function renderReadmeOrder(patterns) {
  return patterns
    .map((pattern, index) => `${index + 8}. \`${pattern.playbook}\`（${pattern.readme_order_desc}）`)
    .join('\n');
}

function renderReadmeRelated(patterns) {
  return patterns
    .map((pattern) => `- \`${pattern.playbook}\`：${pattern.related_doc_desc}`)
    .join('\n');
}

function renderAgents(patterns) {
  return patterns
    .map((pattern) => {
      const suffix = pattern.agents_action.includes(pattern.playbook)
        ? ''
        : `, then read \`${pattern.playbook}\``;
      return `- ${pattern.agents_trigger}:\n  ${pattern.agents_action}${suffix}`;
    })
    .join('\n');
}

function renderAiUsage(patterns) {
  return patterns.map((pattern) => pattern.ai_usage_text).join('\n\n');
}

function renderSkill(patterns) {
  return patterns.map((pattern) => `- ${pattern.skill_text}`).join('\n');
}

function updateMarkdownFiles(patterns) {
  const readmePath = path.join(publicDir, 'README.md');
  const agentsPath = path.join(publicDir, 'AGENTS.md');
  const aiUsagePath = path.join(publicDir, 'AI_USAGE.md');
  const skillPath = path.join(publicDir, 'SKILL.md');

  let readme = fs.readFileSync(readmePath, 'utf8');
  readme = replaceBetweenMarkers(readme, 'PLAYBOOK_READ_ORDER', renderReadmeOrder(patterns));
  readme = replaceBetweenMarkers(readme, 'PLAYBOOK_RELATED_DOCS', renderReadmeRelated(patterns));
  writeText(readmePath, readme);

  let agents = fs.readFileSync(agentsPath, 'utf8');
  agents = replaceBetweenMarkers(agents, 'PLAYBOOK_FAST_ENTRY', renderAgents(patterns));
  writeText(agentsPath, agents);

  let aiUsage = fs.readFileSync(aiUsagePath, 'utf8');
  aiUsage = replaceBetweenMarkers(aiUsage, 'PLAYBOOK_HTML_ROUTER', renderAiUsage(patterns));
  writeText(aiUsagePath, aiUsage);

  let skill = fs.readFileSync(skillPath, 'utf8');
  skill = replaceBetweenMarkers(skill, 'PLAYBOOK_CORE_WORKFLOW', renderSkill(patterns));
  writeText(skillPath, skill);
}

function updateRepoMap(patterns) {
  const repoMap = readJson(repoMapPath);
  const playbookPaths = patterns.map((pattern) => pattern.playbook);

  repoMap.primary_entrypoints = repoMap.primary_entrypoints.filter(
    (entry) => !entry.startsWith('playbooks/'),
  );
  const exampleReadmeIndex = repoMap.primary_entrypoints.indexOf('examples/README.md');
  const playbookBlock = [...playbookPaths];
  if (exampleReadmeIndex === -1) {
    repoMap.primary_entrypoints.push(...playbookBlock);
  } else {
    repoMap.primary_entrypoints.splice(exampleReadmeIndex, 0, ...playbookBlock);
  }

  repoMap.recommended_sequences = repoMap.recommended_sequences || {};
  for (const pattern of patterns) {
    repoMap.recommended_sequences[pattern.id] = pattern.repo_sequence;
  }

  writeText(repoMapPath, `${JSON.stringify(repoMap, null, 2)}\n`);
}

function main() {
  const routes = readJson(routesPath);
  const patterns = routes.patterns || [];
  updateMarkdownFiles(patterns);
  updateRepoMap(patterns);
  console.log(JSON.stringify({ status: 'ok', patterns: patterns.length }, null, 2));
}

main();
