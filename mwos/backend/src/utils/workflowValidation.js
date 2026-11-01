const fail = (message, statusCode = 400) => { throw Object.assign(new Error(message), { statusCode }); };
const uuid = (value, name = 'Record') => {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) fail(`${name} must be selected.`);
  return value;
};
const text = (value, name, max = 5000, required = false) => {
  if (value === undefined || value === null || value === '') { if (required) fail(`${name} is required.`); return null; }
  if (typeof value !== 'string' || value.trim().length > max) fail(`${name} is too long or invalid.`);
  const result = value.trim(); if (required && !result) fail(`${name} is required.`); return result || null;
};
const number = (value, name, min = 0, max = 1000000, integer = false, required = false) => {
  if (value === '' || value === null || value === undefined) { if (required) fail(`${name} is required.`); return null; }
  if (!['string', 'number'].includes(typeof value)) fail(`${name} must be a number.`);
  const n = Number(value); if (!Number.isFinite(n) || n < min || n > max || (integer && !Number.isInteger(n))) fail(`${name} must be ${integer ? 'a whole number ' : ''}between ${min} and ${max}.`);
  return n;
};
const date = (value, name = 'Date', required = true) => {
  if (!value && !required) return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) fail(`${name} must be a valid date.`);
  return value;
};
const choice = (value, name, options, fallback) => { const result = value || fallback; if (!options.includes(result)) fail(`Select a valid ${name}.`); return result; };
const money = (value, name = 'Amount', required = true) => { const n = number(value, name, 0, 99999999, false, required); if (n === null) return 0; if (Math.abs(n * 100 - Math.round(n * 100)) > 0.00001) fail(`${name} supports two decimal places.`); return Math.round(n * 100); };
module.exports = { fail, uuid, text, number, date, choice, money };
