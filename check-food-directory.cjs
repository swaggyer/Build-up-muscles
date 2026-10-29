const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const context = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'dist/foods.js'), 'utf8'), context);
const catalog = context.window.FOOD_CATALOG;
const originalIds = ['egg', 'milk', 'apple', 'banana', 'rice', 'oats', 'bread', 'chicken', 'tofu', 'broccoli', 'sweet-potato', 'salmon', 'potato', 'yogurt', 'orange', 'oil'];
const addedIds = ['peach', 'watermelon', 'pear', 'dragon-fruit', 'strawberry', 'kiwi', 'grape', 'noodles', 'congee', 'pork', 'beef', 'pumpkin', 'lettuce', 'oil-lettuce', 'peanut-oil'];
assert.equal(catalog.length, 31);
assert.equal(new Set(catalog.map(food => food.id)).size, 31);
assert.deepEqual(Array.from(catalog.slice(0, 16), food => food.id), originalIds);
assert.deepEqual(Array.from(catalog.slice(16), food => food.id), addedIds);
for (const food of catalog) {
  assert.ok(Number.isFinite(food.kcal100) && food.kcal100 > 0 && food.kcal100 < 1000, food.id);
  assert.ok(Number.isFinite(food.grams) && food.grams > 0, food.id);
  assert.ok(food.measureNote && food.sourceFood && food.sourceDataset, food.id);
  assert.match(food.sourceUrl, /^https:\/\//);
  const svg = fs.readFileSync(path.join(__dirname, 'dist', food.iconPath), 'utf8');
  assert.match(svg, /<svg\b/);
  assert.match(svg, /viewBox="0 0 128 128"/);
  const rendered = context.window.renderFoodIcon(food.id);
  assert.ok(rendered.includes(food.iconPath) && rendered.includes('alt="'), food.id);
  // Icons remain pictures: the renderer must not expose the detail-only calorie value.
  assert.ok(!rendered.includes('千卡') && !rendered.includes('kcal'), food.id);
}
const serving = id => {
  const food = catalog.find(item => item.id === id);
  return Math.round(food.grams * food.kcal100 / 100);
};
assert.equal(serving('congee'), 80);
assert.equal(serving('dragon-fruit'), 98);
assert.equal(serving('peanut-oil'), 88);
assert.equal(serving('noodles'), 197);
assert.equal(serving('oil-lettuce'), 17);
assert.equal(context.window.renderFoodIcon('missing-food'), '');
assert.ok(Object.isFrozen(catalog) && catalog.every(Object.isFrozen));
console.log('Food directory: 31 unique foods, 15 additions, source metadata, icon paths, detail-only calories, and representative serving calculations passed.');
