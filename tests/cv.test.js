'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { CV } = require('./helpers/env');

const SAMPLE = `Alex Doe
London, UK | +44 7700 900123 | alex.doe@example.com | linkedin.com/in/alexdoe

PROFESSIONAL SUMMARY
Computing student who builds Python projects.

TECHNICAL SKILLS
• Languages: Python, SQL, JavaScript
• Working knowledge: Docker, PyTorch,
  Linux
• Certification: CompTIA A+ (in progress)

EXPERIENCE
Freelance IT Support | Self-employed | Sep 2020 – Present
• Resolved Windows and macOS issues for 30+ clients.
• Built a Python script that cut backup time by 50%.

PROJECTS
• Trained a small model with scikit-learn.

EDUCATION
BSc Computing | Sep 2025 – Jun 2028`;

test('skillsFromCV: core skills are confident, working knowledge and projects are basic', () => {
  const { skills, evidence } = CV.skillsFromCV(SAMPLE);
  assert.equal(skills.Python, 'strong');
  assert.equal(skills.SQL, 'strong');
  assert.equal(skills.Docker, 'basic');
  assert.equal(skills.Linux, 'basic', 'a wrapped line keeps its working-knowledge label');
  assert.equal(skills['CompTIA A+'], 'basic');
  assert.equal(skills['Windows 10/11'], 'strong', 'used in work experience');
  assert.equal(skills['scikit-learn'], 'basic');
  assert.match(evidence.Python, /core skills/);
});

test('atsReport passes a clean CV and flags placeholders and missing sections', () => {
  const ok = CV.atsReport(SAMPLE, { kind: 'docx', pages: 1 });
  assert.ok(ok.checks.find(c => c.label === 'Contact details').state === 'ok');
  assert.ok(ok.checks.find(c => c.label === 'Standard sections').state === 'ok');
  const bad = CV.atsReport('Jane\nyour.email@email.com\nSKILLS\nPython [cite: 3]\n' + 'word '.repeat(120), { kind: 'pdf' });
  assert.ok(bad.checks.some(c => c.label === 'Leftovers in the text' && c.state === 'fail'));
  assert.ok(bad.checks.find(c => c.label === 'Standard sections').state !== 'ok');
  assert.ok(bad.score < ok.score);
  assert.equal(CV.atsReport('', { kind: 'pdf' }).checks[0].state, 'fail');
});

test('jobMatch separates keywords in the CV, ones you could add, and real gaps', () => {
  const m = CV.jobMatch(SAMPLE, { title: 'Python Developer Intern', description: 'Python, SQL, Docker, Kubernetes and React.' }, { Kubernetes: 'basic' });
  assert.ok(m.inCV.includes('Python') && m.inCV.includes('Docker'));
  assert.deepEqual(m.addable, ['Kubernetes']);
  assert.ok(m.missing.includes('React'));
  assert.ok(m.score > 0 && m.score < 100);
  assert.equal(CV.jobMatch('', { title: 'x' }, {}), null);
});
