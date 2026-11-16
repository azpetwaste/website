// A stand in for the parts of Stripe a website sign up touches. Shared by signup10.test.mjs and signup50.test.mjs.
// It follows the real order of a sign up: the card form (a setup mode Checkout Session) saves a card, then the server
// starts the plan itself with POST /v1/subscriptions. Ids are tied together so a test can follow one customer:
// cus_7 gets session cs_sub_7, card pm_7, setup intent seti_7 and plan sub_7.
export function fakeStripe(reply) {
  const st = { cusN: 0, sessions: {}, made: {}, keys: {}, metaOverride: {}, prepaid: new Set(), subItems: {}, status: {} };
  const meta = (f) => (f ? Object.fromEntries([...f.entries()].filter(([k]) => k.startsWith('metadata[')).map(([k, v]) => [k.slice(9, -1), v])) : {});
  const card = (n) => ({ id: 'pm_' + n, type: 'card', card: { funding: st.prepaid.has('sub_' + n) ? 'prepaid' : 'credit' } });
  const plan = (sub) => ({ id: sub, object: 'subscription', customer: 'cus_' + sub.slice(4), status: st.status[sub] || 'trialing', pause_collection: null, metadata: st.metaOf(sub), items: { data: st.subItems[sub] || [] } });
  // What the plan remembers: what the server saved on it when it started the plan (before that, what rode on the card form).
  st.metaOf = (sub) => Object.assign({}, meta(st.made[sub] || st.sessions[sub]), st.metaOverride[sub] || {});
  // The event Stripe sends when the customer finishes the card form.
  st.sessionEvt = (sub, uid) => ({ type: 'checkout.session.completed', created: Math.floor(Date.now() / 1000), data: { object: {
    id: 'cs_' + sub, object: 'checkout.session', mode: 'setup', status: 'complete', client_reference_id: uid, customer: 'cus_' + sub.slice(4), setup_intent: 'seti_' + sub.slice(4), metadata: meta(st.sessions[sub]) } } });
  // Answers one request, or returns null when the path is not one of these (the test answers the rest).
  st.handle = (m, p, query, f, key) => {
    if (p === 'customers' && m === 'POST') return reply({ id: 'cus_' + (++st.cusN) });
    if (p.startsWith('customers/')) return reply({ id: p.slice(10), invoice_settings: { default_payment_method: m === 'GET' ? card(p.slice(14)) : f.get('invoice_settings[default_payment_method]') } });
    if (p.startsWith('prices')) return reply({ data: ['week', 'twice', 'eow'].flatMap((k) => ['base', 'extra'].map((t) => ({ id: 'price_' + k + '_' + t, lookup_key: 'apw_' + k + '_' + t }))) });
    if (p === 'checkout/sessions' && m === 'POST') { const sub = 'sub_' + f.get('customer').slice(4); st.sessions[sub] = f; return reply({ id: 'cs_' + sub, client_secret: 'cs_' + sub }); }
    if (p.startsWith('checkout/sessions/') && m === 'GET') {
      const sub = p.slice(21), f0 = st.sessions[sub];
      if (!f0) return reply({ error: { message: 'No such checkout session' } }, 404);
      return reply(Object.assign(st.sessionEvt(sub, f0.get('client_reference_id')).data.object, { setup_intent: { id: 'seti_' + sub.slice(4), status: 'succeeded', payment_method: card(sub.slice(4)) } }));
    }
    if (p.startsWith('setup_intents/')) return reply({ id: p.slice(14), status: 'succeeded', payment_method: card(p.slice(19)) });
    if (p === 'subscriptions' && m === 'GET') { const sub = 'sub_' + (new URLSearchParams(query).get('customer') || '').slice(4); return reply({ data: st.made[sub] ? [plan(sub)] : [] }); }
    if (p === 'subscriptions' && m === 'POST') {
      const sub = 'sub_' + f.get('customer').slice(4);
      if (!(key && st.keys[key])) { st.made[sub] = f; if (key) st.keys[key] = sub; }
      return reply(plan(sub));
    }
    if (p.startsWith('subscriptions/') && m === 'GET') return reply(plan(p.slice(14)));
    return null;
  };
  return st;
}
