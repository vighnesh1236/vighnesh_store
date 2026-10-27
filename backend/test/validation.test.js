import test from 'node:test';
import assert from 'node:assert/strict';
import { addressSchema, loginSchema, productPatchSchema, productSchema, registrationSchema } from '../src/validation.js';

test('registration accepts a valid account and rejects malformed credentials', () => {
  assert.equal(registrationSchema.safeParse({
    name: 'Shop User', email: 'user@example.com', password: 'secure-password'
  }).success, true);
  assert.equal(registrationSchema.safeParse({
    name: 'A', email: 'not-an-email', password: 'short'
  }).success, false);
});

test('login requires an email and nonempty password', () => {
  assert.equal(loginSchema.safeParse({ email: 'user@example.com', password: 'password' }).success, true);
  assert.equal(loginSchema.safeParse({ email: 'invalid', password: '' }).success, false);
});

test('products validate prices, stock and compare-at price relationships', () => {
  assert.equal(productSchema.safeParse({ name: 'Sample item', price: 10.25, compare_at_price: 15, stock: 3 }).success, true);
  assert.equal(productSchema.safeParse({ name: 'Sample item', price: 10.251, stock: 3 }).success, false);
  assert.equal(productSchema.safeParse({ name: 'Sample item', price: 15, compare_at_price: 10, stock: 3 }).success, false);
  assert.equal(productSchema.safeParse({ name: 'Sample item', price: 10, stock: -1 }).success, false);
  assert.equal(productPatchSchema.safeParse({ stock: 8 }).success, true);
});

test('addresses validate required delivery and contact details', () => {
  const address = {
    full_name: 'Shop User', phone: '+91 98765 43210', line1: '12 Example Road',
    city: 'Mumbai', state: 'Maharashtra', postal_code: '400001'
  };
  assert.equal(addressSchema.safeParse(address).success, true);
  assert.equal(addressSchema.safeParse({ ...address, phone: 'call-me' }).success, false);
  assert.equal(addressSchema.safeParse({ ...address, line1: ' ' }).success, false);
});
