/**
 * test-storefront-polish.js
 * Verification test suite for Nails by Divya storefront visual polish,
 * responsive ergonomics, accessibility (a11y), and design integrity.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

let passedTests = 0;
let totalTests = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    console.log(`  ✓ Passed: ${message}`);
    passedTests++;
  } else {
    console.error(`  ✗ FAILED: ${message}`);
  }
}

console.log('==================================================================');
console.log('   NAILS BY DIVYA — STOREFRONT POLISH & ERGONOMICS TEST SUITE   ');
console.log('==================================================================\n');

const ROOT_DIR = __dirname;
const htmlFiles = [
  'index.html',
  'account.html',
  'nail-art.html',
  'nail-extensions.html',
  'press-on-nails-india.html'
];

console.log('▶ TEST SECTION 1: Accessibility & Skip-Link Navigation');
htmlFiles.forEach(file => {
  const content = fs.readFileSync(path.join(ROOT_DIR, file), 'utf8');
  assert(
    content.includes('class="skip-link"') && content.includes('href="#main-content"'),
    `${file} contains an accessible skip-to-content link pointing to #main-content`
  );
  assert(
    content.includes('id="main-content"') || content.includes('<main id="main-content"'),
    `${file} has the corresponding id="main-content" target container`
  );
});

console.log('\n▶ TEST SECTION 2: Image Accessibility (alt attributes)');
htmlFiles.forEach(file => {
  const content = fs.readFileSync(path.join(ROOT_DIR, file), 'utf8');
  const imgTags = content.match(/<img[^>]+>/g) || [];
  let missingAlt = false;
  imgTags.forEach(tag => {
    if (!tag.includes('alt=')) {
      missingAlt = true;
    }
  });
  assert(!missingAlt, `${file}: all <img> tags have an explicit alt attribute (${imgTags.length} checked)`);
});

console.log('\n▶ TEST SECTION 3: Emoji De-cluttering & Editorial Elegance');
const restrictedEmojis = ['💅🏻', '🛍️', '✨', '📦', '💳', '🗓️', '📋', '📞', '🕒', '📍'];
htmlFiles.forEach(file => {
  const content = fs.readFileSync(path.join(ROOT_DIR, file), 'utf8');
  // Check navigation links specifically for raw emoji icons
  const navSection = content.match(/<nav[^>]*>([\s\S]*?)<\/nav>/i);
  if (navSection) {
    const navText = navSection[1];
    let navHasRestrictedEmoji = restrictedEmojis.some(emoji => navText.includes(emoji));
    assert(!navHasRestrictedEmoji, `${file}: navigation items are free of cartoon emojis`);
  }
  // Check footer for raw emoji buttons
  const footerSection = content.match(/<footer[^>]*>([\s\S]*?)<\/footer>/i);
  if (footerSection) {
    const footerText = footerSection[1];
    let footerHasDivvEmoji = footerText.includes('Ask Divv AI Stylist 💅🏻');
    assert(!footerHasDivvEmoji, `${file}: footer links do not contain emoji clutter`);
  }
});

console.log('\n▶ TEST SECTION 4: CSS Typography, Sticky Nav Offset, & Responsive Layouts');
const cssContent = fs.readFileSync(path.join(ROOT_DIR, 'style.css'), 'utf8');

assert(
  cssContent.includes('scroll-padding-top: calc(var(--nav-height, 84px) + 1.25rem);'),
  'style.css defines scroll-padding-top on html to prevent anchor headers hiding under sticky nav'
);

assert(
  cssContent.includes('.skip-link') && cssContent.includes('position: absolute'),
  'style.css contains proper focusable off-screen styles for .skip-link'
);

assert(
  cssContent.includes('text-wrap: balance;') && cssContent.includes('text-wrap: pretty;'),
  'style.css implements modern balanced and pretty text-wrap for editorial headings and copy'
);

assert(
  cssContent.includes('min(100%, 320px)') || cssContent.includes('minmax(min(100%, 320px), 1fr)'),
  'style.css handles narrow viewport minmax wrapping to prevent horizontal blowout'
);

assert(
  cssContent.includes('@media (max-width: 480px)') &&
  cssContent.includes('@media (max-width: 375px)') &&
  cssContent.includes('@media (max-width: 320px)'),
  'style.css includes targeted mobile breakpoints for 480px, 375px, and ultra-narrow 320px'
);

assert(
  cssContent.includes('min-height: 44px') || cssContent.includes('min-height: 48px'),
  'style.css enforces accessible minimum touch target heights for mobile CTAs'
);

console.log('\n▶ TEST SECTION 5: JavaScript Ergonomics & Reduced Motion');
const jsContent = fs.readFileSync(path.join(ROOT_DIR, 'script.js'), 'utf8');

assert(
  jsContent.includes('prefers-reduced-motion: reduce'),
  'script.js respects user reduced-motion preferences in hero carousel'
);

// Syntax validation
const jsFiles = ['script.js', 'account.js', 'account-api.js', 'auth.js', 'auth-modal.js', 'firebase-config.js'];
jsFiles.forEach(file => {
  try {
    const fullPath = path.join(ROOT_DIR, file);
    execSync(`node --check "${fullPath}"`, { stdio: 'pipe' });
    assert(true, `${file} passes node --check syntax verification`);
  } catch (err) {
    assert(false, `${file} has syntax errors: ${err.message}`);
  }
});

console.log('\n==================================================================');
console.log(`TOTAL TESTS: ${totalTests} | PASSED: ${passedTests} | FAILED: ${totalTests - passedTests}`);
console.log('==================================================================');

if (totalTests === passedTests) {
  console.log('🎉 ALL STOREFRONT POLISH & ERGONOMICS TESTS PASSED!\n');
  process.exit(0);
} else {
  console.error('❌ SOME TESTS FAILED!\n');
  process.exit(1);
}
