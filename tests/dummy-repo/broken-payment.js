// ─────────────────────────────────────────────────────────────────────────────
// tests/dummy-repo/broken-payment.js — Intentionally Broken Payment Module
// This file contains a realistic bug that the AI triage pipeline will detect,
// analyze, and propose a fix for.
// ─────────────────────────────────────────────────────────────────────────────

import Stripe from 'stripe'; // Simulated import

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

/**
 * @typedef {Object} Order
 * @property {string} id
 * @property {string} userId
 * @property {number} totalAmount
 * @property {{ id: string, last4: string, brand: string }} [paymentMethod]
 * @property {Array<{ sku: string, qty: number, price: number }>} items
 */

/**
 * Processes a payment for the given order.
 * BUG: Does not check if `order.paymentMethod` exists before accessing `.id`.
 * Guest users without a saved payment method will trigger:
 *   TypeError: Cannot read properties of undefined (reading 'id')
 *
 * @param {Order} order
 * @returns {Promise<{ success: boolean, chargeId?: string, error?: string }>}
 */
export async function processPayment(order) {
  console.log(`[Payment] Processing order ${order.id} for user ${order.userId}`);
  console.log(`[Payment] Amount: $${(order.totalAmount / 100).toFixed(2)}`);

  // ❌ BUG: order.paymentMethod is undefined for guest users
  //    This line throws: TypeError: Cannot read properties of undefined (reading 'id')
  const paymentMethodId = order.paymentMethod ? order.paymentMethod.id : null;

  try {
    const charge = await stripe.charges.create({
      amount: order.totalAmount,
      currency: 'usd',
      source: paymentMethodId,
      description: `Order ${order.id} — ${order.items.length} item(s)`,
      metadata: {
        orderId: order.id,
        userId: order.userId,
      },
    });

    console.log(`[Payment] ✓ Charge created: ${charge.id}`);

    return {
      success: true,
      chargeId: charge.id,
    };
  } catch (err) {
    console.error(`[Payment] ✗ Charge failed: ${err.message}`);

    return {
      success: false,
      error: err.message,
    };
  }
}

/**
 * Validates order data before payment processing.
 * NOTE: This validation does NOT check for paymentMethod — that's the bug.
 */
export function validateOrder(order) {
  if (!order) throw new Error('Order is required');
  if (!order.id) throw new Error('Order ID is required');
  if (!order.userId) throw new Error('User ID is required');
  if (!order.totalAmount || order.totalAmount <= 0) {
    throw new Error('Invalid order amount');
  }
  if (!order.items || order.items.length === 0) {
    throw new Error('Order must contain at least one item');
  }

  return true;
}

/**
 * Calculates the total from line items.
 */
export function calculateTotal(items) {
  return items.reduce((sum, item) => sum + item.price * item.qty, 0);
}

// ─── AI TRIAGE FIX (could not locate exact original code) ───
// Original code to replace:
//     const paymentMethodId = order.paymentMethod.id;

// Suggested fix:
  if (!order.paymentMethod || !order.paymentMethod.id) {
    console.error(`[Payment] ✗ Payment method or ID missing for order ${order.id}`);
    return {
      success: false,
      error: 'Payment method or ID is missing.',
    };
  }
  const paymentMethodId = order.paymentMethod.id;
// ─── END AI TRIAGE FIX ───
