export const CHECKOUT_THEATER_STEPS = [
  { id: 'browse', label: 'Storefront', match: /page_viewed|collection_viewed|product_viewed|search_submitted/i },
  { id: 'cart', label: 'Cart', match: /cart_viewed|product_added_to_cart|product_removed_from_cart/i },
  { id: 'checkout', label: 'Checkout started', match: /checkout_started/i },
  { id: 'contact', label: 'Contact info', match: /checkout_contact_info_submitted/i },
  { id: 'address', label: 'Address', match: /checkout_address_info_submitted/i },
  { id: 'shipping', label: 'Shipping', match: /checkout_shipping_info_submitted/i },
  { id: 'payment', label: 'Payment', match: /payment_info_submitted/i },
  { id: 'complete', label: 'Purchase', match: /checkout_completed|purchase/i },
];

export function theaterStepForEvent(eventName = '') {
  const name = String(eventName || '').trim();
  if (!name) return null;
  return CHECKOUT_THEATER_STEPS.find((step) => step.match.test(name)) || null;
}

export function buildCheckoutTheaterScript(events = []) {
  const sorted = [...events]
    .filter((event) => event?.event_name && event?.timestamp)
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  const frames = [];
  let lastStepId = '';
  for (const event of sorted) {
    const step = theaterStepForEvent(event.event_name);
    if (!step) continue;
    const ts = new Date(event.timestamp).getTime();
    frames.push({
      step_id: step.id,
      step_label: step.label,
      event_name: event.event_name,
      timestamp: event.timestamp,
      elapsed_ms: frames.length ? Math.max(0, ts - new Date(frames[0].timestamp).getTime()) : 0,
      path: event.path || '',
      country_code: event.country_code || '',
      line_items: Array.isArray(event.line_items) ? event.line_items.slice(0, 6) : [],
      is_repeat: step.id === lastStepId,
    });
    lastStepId = step.id;
  }

  const reached = new Set(frames.map((frame) => frame.step_id));
  const lastFrame = frames.at(-1) || null;
  const outcome = lastFrame
    ? (lastFrame.step_id === 'complete'
      ? 'completed'
      : lastFrame.step_id === 'payment'
        ? 'payment_abandoned'
        : ['checkout', 'contact', 'address', 'shipping'].includes(lastFrame.step_id)
          ? 'checkout_abandoned'
          : lastFrame.step_id === 'cart'
            ? 'cart_only'
            : 'browsing')
    : 'browsing';

  return {
    frames,
    reached_steps: CHECKOUT_THEATER_STEPS.filter((step) => reached.has(step.id)).map((step) => step.id),
    last_step_id: lastFrame?.step_id || '',
    duration_ms: frames.length >= 2
      ? Math.max(0, new Date(frames.at(-1).timestamp).getTime() - new Date(frames[0].timestamp).getTime())
      : 0,
    outcome,
  };
}
