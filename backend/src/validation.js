import { z } from 'zod';

export const idParam = z.coerce.number().int().positive();
export const registrationSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(254),
  password: z.string().min(8).max(128)
});
export const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1).max(128)
});
export const addressSchema = z.object({
  full_name: z.string().trim().min(2).max(100),
  phone: z.string().trim().regex(/^[+0-9 ()-]{7,20}$/),
  line1: z.string().trim().min(3).max(200),
  line2: z.string().trim().max(200).default(''),
  city: z.string().trim().min(2).max(100),
  state: z.string().trim().min(2).max(100),
  postal_code: z.string().trim().min(3).max(20),
  country: z.string().trim().min(2).max(100).default('India'),
  is_default: z.boolean().default(false)
});
const productFields = z.object({
  category_id: z.coerce.number().int().positive().nullable().optional(),
  name: z.string().trim().min(2).max(200),
  description: z.string().max(5000).default(''),
  price: z.coerce.number().nonnegative().multipleOf(0.01),
  compare_at_price: z.coerce.number().nonnegative().multipleOf(0.01).nullable().optional(),
  stock: z.coerce.number().int().nonnegative(),
  image_url: z.string().url().optional()
});
export const productSchema = productFields.refine((value) => value.compare_at_price == null || value.compare_at_price >= value.price, {
  message: 'Compare-at price must be greater than or equal to price',
  path: ['compare_at_price']
});
export const productPatchSchema = productFields.partial();

export function parse(schema, value) {
  const result = schema.safeParse(value);
  return result.success ? { data: result.data } : { error: result.error.issues[0].message };
}
